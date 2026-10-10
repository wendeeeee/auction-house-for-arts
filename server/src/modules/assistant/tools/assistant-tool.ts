import type { z } from 'zod';
import type { AuthenticatedUser } from '../../../common/identity';

/** Who is asking, from `@CurrentUser()` via the orchestrator. Tools never take a user from their arguments. */
export interface ToolContext {
  readonly user: AuthenticatedUser;
  readonly now: Date;
}

export interface ToolResult<Output> {
  readonly output: Output;
  /** Auction slugs this result proved exist; only these may become recommendation cards or bid suggestions. */
  readonly auctionSlugs: readonly string[];
}

/**
 * A read-only tool. There is deliberately no tool that bids, pays, or writes anything. The
 * registry validates arguments with `argumentsSchema` and every result with `outputSchema`, a
 * strict schema: a field nobody listed (a reserve, someone's maximum) makes the call fail closed.
 */
export interface AssistantTool<Arguments = unknown, Output = unknown> {
  readonly name: string;
  readonly description: string;
  readonly argumentsSchema: z.ZodType<Arguments>;
  readonly outputSchema: z.ZodType<Output>;
  run(args: Arguments, context: ToolContext): Promise<ToolResult<Output>>;
}
