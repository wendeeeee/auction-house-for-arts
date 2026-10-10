/** Who is making the request. The only user shape handlers see. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
}

/**
 * How the guard finds a user by ID. Declared here, implemented by the users module, so
 * `common/` has no dependency on a feature module and real authentication can replace the
 * demo guard without touching users.
 */
export interface IdentityLookup {
  findById(id: string): Promise<AuthenticatedUser | null>;
}

export const IDENTITY_LOOKUP = Symbol('IDENTITY_LOOKUP');

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by DemoIdentityGuard: null for an anonymous request. */
    user?: AuthenticatedUser | null;
  }
}
