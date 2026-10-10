export class MessagingUnavailableError extends Error {
  constructor() {
    super('RabbitMQ is not connected.');
    this.name = 'MessagingUnavailableError';
  }
}

export class MessageNotConfirmedError extends Error {
  constructor(messageId: string, cause: unknown) {
    super(`RabbitMQ did not confirm message ${messageId}: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = 'MessageNotConfirmedError';
  }
}
