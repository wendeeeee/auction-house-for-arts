import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { UnauthenticatedError } from '../errors';
import { IDENTITY_LOOKUP, IdentityLookup } from './authenticated-user';
import { REQUIRE_USER_METADATA_KEY } from './identity.decorators';

export const DEMO_USER_HEADER = 'x-demo-user-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Demo identity: there is no real authentication (a documented scope decision). The web app's
 * user switcher sends `X-Demo-User-Id`; this guard turns it into `request.user`.
 *
 * - No header: anonymous (`request.user = null`), allowed unless the route has `@RequireUser()`.
 * - A malformed or unknown ID: 401, never silently anonymous. A client that sends an identity
 *   expects to act as that user, so quietly dropping it would be wrong.
 * - The UUID check runs before the lookup, so garbage never reaches the database.
 *
 * Replacing this guard (and only this guard) is how real authentication would be added.
 */
@Injectable()
export class DemoIdentityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDENTITY_LOOKUP) private readonly identityLookup: IdentityLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    request.user = await this.resolveUser(request.headers[DEMO_USER_HEADER]);

    const isUserRequired = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_USER_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isUserRequired && !request.user) {
      throw new UnauthenticatedError('This action needs a demo user. Send the X-Demo-User-Id header.');
    }
    return true;
  }

  private async resolveUser(header: string | string[] | undefined) {
    if (header === undefined || header === '') return null;
    if (typeof header !== 'string' || !UUID_PATTERN.test(header)) {
      throw new UnauthenticatedError('X-Demo-User-Id is not a known demo user.');
    }
    const user = await this.identityLookup.findById(header.toLowerCase());
    if (!user) throw new UnauthenticatedError('X-Demo-User-Id is not a known demo user.');
    return { id: user.id, displayName: user.displayName, handle: user.handle };
  }
}
