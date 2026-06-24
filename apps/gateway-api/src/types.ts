import type { Database } from "@m2cloud/db";
import type { EventPublisher } from "@m2cloud/shared";
import type { Cache } from "./cache.js";

/** Authenticated user attached to the request by the requireAuth preHandler. */
export interface AuthUser {
  sub: string;
  username: string;
}

/** Dependencies injected into buildApp — real in prod, fakes in tests. */
export interface AppDeps {
  db: Database;
  jwtSecret: string;
  publishEvent: EventPublisher;
  cache: Cache;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    deps: AppDeps;
    requireAuth: import("fastify").preHandlerHookHandler;
  }
}
