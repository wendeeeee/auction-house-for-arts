import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from './authenticated-user';

export const REQUIRE_USER_METADATA_KEY = 'identity:require-user';

/** The route rejects anonymous requests with 401. Applies to a handler or a whole controller. */
export const RequireUser = (): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_USER_METADATA_KEY, true);

/**
 * The requesting user, or null when anonymous. On a `@RequireUser()` route it is never null.
 * Routes take the user only from here, never from a body or query.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | null =>
    context.switchToHttp().getRequest<FastifyRequest>().user ?? null,
);
