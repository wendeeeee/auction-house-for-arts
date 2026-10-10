import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { AuthenticatedUser } from '../../common/identity';
import { APP_CONFIG, AppConfig } from '../../config';
import { ASSISTANT_LLM, AssistantLlm, AssistantUnavailableError } from '../language-models';
import { AssistantOrchestratorService, CompletedTurn } from './assistant-orchestrator.service';
import { ASSISTANT_SESSION_STORE, AssistantSessionStore } from './assistant-session.store';
import { AssistantPageContext, AssistantSession } from './assistant.types';
import { AssistantRateLimitedError, AssistantSessionNotFoundError } from './assistant.errors';

const RATE_WINDOW_SECONDS = 60 * 60;

/** Sessions, ownership, and the rate limit around the agent loop. */
@Injectable()
export class AssistantConversationService {
  private readonly logger = new Logger(AssistantConversationService.name);

  constructor(
    @Inject(ASSISTANT_LLM) private readonly llm: AssistantLlm,
    @Inject(ASSISTANT_SESSION_STORE) private readonly sessionStore: AssistantSessionStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly clock: Clock,
  ) {}

  get isAvailable(): boolean {
    return this.llm.isAvailable;
  }

  get modelName(): string | null {
    return this.llm.isAvailable ? this.llm.model : null;
  }

  async sendMessage(
    user: AuthenticatedUser,
    request: { readonly sessionId?: string; readonly message: string; readonly context?: AssistantPageContext },
  ): Promise<{ sessionId: string; turn: CompletedTurn }> {
    if (!this.llm.isAvailable) throw new AssistantUnavailableError('not_configured');

    const messagesPerHour = this.config.assistant.turnsPerHour;
    const count = await this.sessionStore.countMessage(user.id, RATE_WINDOW_SECONDS);
    if (count > messagesPerHour) throw new AssistantRateLimitedError(messagesPerHour);

    const now = this.clock.now();
    // Another user's session ID silently starts a new conversation: it is never read or extended.
    const existing = request.sessionId ? await this.findOwnedSession(request.sessionId, user) : null;
    const session: AssistantSession = existing ?? {
      id: randomUUID(),
      userId: user.id,
      context: null,
      messages: [],
      transcript: [],
      knownAuctionSlugs: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // Nothing is saved if the turn throws (a model outage), so a failed turn leaves no half-written history.
    const turn = await this.orchestrator.runTurn({ user, session, message: request.message, context: request.context ?? null, now });
    await this.sessionStore.save(turn.session);
    this.logger.log(`Concierge turn ${session.id}: ${JSON.stringify(turn.statistics)}`);
    return { sessionId: session.id, turn };
  }

  async getSession(sessionId: string, user: AuthenticatedUser): Promise<AssistantSession> {
    const session = await this.findOwnedSession(sessionId, user);
    if (!session) throw new AssistantSessionNotFoundError(sessionId);
    return session;
  }

  /** Idempotent, and a no-op for someone else's session. */
  async deleteSession(sessionId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.findOwnedSession(sessionId, user)) await this.sessionStore.delete(sessionId);
  }

  private async findOwnedSession(sessionId: string, user: AuthenticatedUser): Promise<AssistantSession | null> {
    const session = await this.sessionStore.find(sessionId);
    return session && session.userId === user.id ? session : null;
  }
}
