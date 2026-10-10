import type { Channel } from 'amqplib';

/** Injected so tests can use their own exchanges on the shared broker. */
export interface MessagingTopology {
  readonly eventsExchange: string;
  readonly deadLetterExchange: string;
}

export const MESSAGING_TOPOLOGY = Symbol('MESSAGING_TOPOLOGY');

export const DEFAULT_MESSAGING_TOPOLOGY: MessagingTopology = {
  eventsExchange: 'art-auction.events',
  deadLetterExchange: 'art-auction.dead-letter',
};

export interface ConsumerQueue {
  readonly name: string;
  readonly bindingKeys: readonly string[];
  /** Quorum queues dead-letter a message after this many deliveries. */
  readonly deliveryLimit: number;
}

export const deadLetterQueueName = (queueName: string): string => `${queueName}.dead-letter`;

export async function declareExchanges(channel: Channel, topology: MessagingTopology): Promise<void> {
  await channel.assertExchange(topology.eventsExchange, 'topic', { durable: true });
  await channel.assertExchange(topology.deadLetterExchange, 'direct', { durable: true });
}

/** A quorum queue (it counts deliveries) with its own `<queue>.dead-letter` queue. */
export async function declareConsumerQueue(
  channel: Channel,
  topology: MessagingTopology,
  queue: ConsumerQueue,
): Promise<void> {
  const deadLetterQueue = deadLetterQueueName(queue.name);
  await channel.assertQueue(deadLetterQueue, { durable: true });
  await channel.bindQueue(deadLetterQueue, topology.deadLetterExchange, deadLetterQueue);

  await channel.assertQueue(queue.name, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': queue.deliveryLimit,
      'x-dead-letter-exchange': topology.deadLetterExchange,
      'x-dead-letter-routing-key': deadLetterQueue,
    },
  });
  for (const bindingKey of queue.bindingKeys) {
    await channel.bindQueue(queue.name, topology.eventsExchange, bindingKey);
  }
}
