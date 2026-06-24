import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "@m2cloud/shared";
import type { AppDeps } from "../types.js";

/**
 * Registers a `requireAuth` preHandler that verifies the Bearer token and sets
 * req.user. Replies 401 when the header is missing or the token is invalid.
 */
export function registerAuth(app: FastifyInstance, deps: AppDeps): void {
  app.decorate(
    "requireAuth",
    async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Missing or malformed Authorization header" });
      }
      const token = header.slice("Bearer ".length).trim();
      try {
        const payload = await verifyToken(token, deps.jwtSecret);
        req.user = { sub: payload.sub, username: payload.username };
      } catch {
        return reply.code(401).send({ error: "Invalid or expired token" });
      }
    },
  );
}
