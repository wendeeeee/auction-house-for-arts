import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';
import type { Channel, GetMessage } from 'amqplib';
import {
  ConsumeDecision,
  ConsumerQueue,
  IncomingMessage,
  MessagingTopology,
  QueueConsumer,
  RabbitMqConnection,
  RabbitMqMessagePublisher,
  deadLetterQueueName,
  declareConsumerQueue,
} from '../../src/common/messaging';
import { loadConfiguration } from '../../src/config';
import { waitFor } from '../support/wait-for';

/** Needs the RabbitMQ container. Random names keep it off a running worker's queues. */
describe('RabbitMQ messaging (real broker)', () => {
  const suffix = randomUUID().slice(0, 8);
  const topology: MessagingTopology = {
    eventsExchange: `art-auction-test.events.${suffix}`,
    deadLetterExchange: `art-auction-test.dead-letter.${suffix}`,
  };
  const rabbitMqUrl = loadConfiguration(process.env).messaging.rabbitMqUrl;
  const createdQueues: string[] = [];

  let connection: RabbitMqConnection;
  let publisher: RabbitMqMessagePublisher;
  let inspectionConnection: Awaited<ReturnType<typeof connect>>;
  let inspection: Channel;

  beforeAll(async () => {
    connection = new RabbitMqConnection(rabbitMqUrl, topology);
    await connection.start();
    publisher = new RabbitMqMessagePublisher(connection);
    inspectionConnection = await connect(rabbitMqUrl);
    inspection = await inspectionConnection.createChannel();
  });

  afterAll(async () => {
    for (const queue of createdQueues) {
      await inspection.deleteQueue(queue);
      await inspection.deleteQueue(deadLetterQueueName(queue));
    }
    await inspection.deleteExchange(topology.eventsExchange);
    await inspection.deleteExchange(topology.deadLetterExchange);
    await inspectionConnection.close();
    await connection.close();
  });

  async function createQueue(routingKey: string, deliveryLimit = 3): Promise<ConsumerQueue> {
    const queue: ConsumerQueue = {
      name: `art-auction-test.queue.${suffix}.${createdQueues.length}`,
      bindingKeys: [routingKey],
      deliveryLimit,
    };
    createdQueues.push(queue.name);
    await declareConsumerQueue(inspection, topology, queue);
    return queue;
  }

  const message = (routingKey: string, body: unknown = { hello: 'world' }) => ({
    routingKey,
    messageId: randomUUID(),
    type: 'TestHappened',
    body,
    occurredAt: new Date('2026-01-15T12:00:00.000Z'),
  });

  async function getOne(queueName: string): Promise<GetMessage> {
    let received: GetMessage | false = false;
    await waitFor(async () => {
      received = await inspection.get(queueName, { noAck: true });
      return received !== false;
    });
    return received as unknown as GetMessage;
  }

  it('resolves a publish once the broker confirms it, as a persistent JSON message on the bound queue', async () => {
    const queue = await createQueue('test.confirmed');
    const outgoing = message('test.confirmed', { auctionId: 'a-1' });

    await publisher.publish(outgoing);

    const received = await getOne(queue.name);
    expect(JSON.parse(received.content.toString('utf8'))).toEqual({ auctionId: 'a-1' });
    expect(received.properties).toMatchObject({
      messageId: outgoing.messageId,
      type: 'TestHappened',
      contentType: 'application/json',
      // persistent
      deliveryMode: 2,
    });
  });

  it('acks a handled message, so it is not delivered again', async () => {
    const queue = await createQueue('test.acked');
    const handled: IncomingMessage[] = [];
    const consumer = new QueueConsumer(connection, { queue, prefetch: 5 }, async (incoming) => {
      handled.push(incoming);
      return 'ack';
    });
    await consumer.start();
    const outgoing = message('test.acked');

    await publisher.publish(outgoing);
    await waitFor(() => handled.length === 1);
    await consumer.stop();

    expect(handled[0]).toMatchObject({ messageId: outgoing.messageId, type: 'TestHappened', deliveryCount: 1 });
    const { messageCount } = await inspection.checkQueue(queue.name);
    expect(messageCount).toBe(0);
  });

  it('sends a message the handler dead-letters straight to the dead-letter queue, without redelivery', async () => {
    const queue = await createQueue('test.poison');
    let deliveries = 0;
    const consumer = new QueueConsumer(connection, { queue, prefetch: 5 }, async (): Promise<ConsumeDecision> => {
      deliveries += 1;
      return 'dead_letter';
    });
    await consumer.start();
    const outgoing = message('test.poison');

    await publisher.publish(outgoing);
    const deadLettered = await getOne(deadLetterQueueName(queue.name));
    await consumer.stop();

    expect(deadLettered.properties.messageId).toBe(outgoing.messageId);
    expect(deliveries).toBe(1);
  });

  it('dead-letters a body that is not JSON without calling the handler', async () => {
    const queue = await createQueue('test.not-json');
    let deliveries = 0;
    const consumer = new QueueConsumer(connection, { queue, prefetch: 5 }, async () => {
      deliveries += 1;
      return 'ack';
    });
    await consumer.start();

    inspection.publish(topology.eventsExchange, 'test.not-json', Buffer.from('{not json'), { messageId: 'raw-1' });
    const deadLettered = await getOne(deadLetterQueueName(queue.name));
    await consumer.stop();

    expect(deadLettered.properties.messageId).toBe('raw-1');
    expect(deliveries).toBe(0);
  });

  it('retries a failing message until the delivery limit, then dead-letters it', async () => {
    const deliveryLimit = 2;
    const queue = await createQueue('test.always-fails', deliveryLimit);
    const deliveryCounts: number[] = [];
    const consumer = new QueueConsumer(
      connection,
      { queue, prefetch: 5, retryDelayMilliseconds: () => 0 },
      async (incoming) => {
        deliveryCounts.push(incoming.deliveryCount);
        throw new Error('the database is down');
      },
    );
    await consumer.start();
    const outgoing = message('test.always-fails');

    await publisher.publish(outgoing);
    const deadLettered = await getOne(deadLetterQueueName(queue.name));
    await consumer.stop();

    expect(deadLettered.properties.messageId).toBe(outgoing.messageId);
    expect(deliveryCounts.length).toBeGreaterThanOrEqual(deliveryLimit);
    expect(deliveryCounts[0]).toBe(1);
    expect(deliveryCounts[1]).toBe(2);
  });

  it('lets an in-flight message finish and be acked when the consumer stops', async () => {
    const queue = await createQueue('test.graceful');
    let release: () => void = () => undefined;
    let isHandlerStarted = false;
    const consumer = new QueueConsumer(connection, { queue, prefetch: 1 }, async () => {
      isHandlerStarted = true;
      await new Promise<void>((resolve) => (release = resolve));
      return 'ack';
    });
    await consumer.start();
    await publisher.publish(message('test.graceful'));
    await waitFor(() => isHandlerStarted);

    const stopped = consumer.stop();
    release();
    await stopped;

    const { messageCount } = await inspection.checkQueue(queue.name);
    expect(messageCount).toBe(0);
  });
});
