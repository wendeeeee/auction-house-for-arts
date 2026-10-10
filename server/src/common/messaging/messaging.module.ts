import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { MESSAGE_PUBLISHER, RabbitMqMessagePublisher } from './message-publisher';
import { DEFAULT_MESSAGING_TOPOLOGY, MESSAGING_TOPOLOGY, MessagingTopology } from './messaging-topology';
import { RabbitMqConnection } from './rabbitmq.connection';

/** One connection per process; importing the module never connects. */
@Module({
  providers: [
    { provide: MESSAGING_TOPOLOGY, useValue: DEFAULT_MESSAGING_TOPOLOGY },
    {
      provide: RabbitMqConnection,
      inject: [APP_CONFIG, MESSAGING_TOPOLOGY],
      useFactory: (config: AppConfig, topology: MessagingTopology) =>
        new RabbitMqConnection(config.messaging.rabbitMqUrl, topology),
    },
    { provide: MESSAGE_PUBLISHER, useClass: RabbitMqMessagePublisher },
  ],
  exports: [RabbitMqConnection, MESSAGE_PUBLISHER],
})
export class MessagingModule implements OnApplicationShutdown {
  constructor(@Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection) {}

  /** After consumers have drained in beforeApplicationShutdown. */
  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
