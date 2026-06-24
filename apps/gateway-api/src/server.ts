import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { sql } from "drizzle-orm";
import { makeMetricsRegistry } from "@m2cloud/shared";
import type { AppDeps } from "./types.js";
import { registerAuth } from "./plugins/auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { registerVoteRoutes } from "./routes/votes.js";
import { registerNotificationRoutes } from "./routes/notifications.js";

/**
 * Build the Fastify app with injected dependencies. Returns an un-listened
 * instance so tests can use app.inject(). Caller is responsible for .listen()
 * and for closing the injected resources.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate("deps", deps);
  await app.register(cors, { origin: true });

  const { registry, httpHistogram } = makeMetricsRegistry("gateway-api");

  // Per-request latency timing for the Prometheus histogram.
  app.addHook("onRequest", async (req) => {
    (req as { _startTime?: number })._startTime = process.hrtime.bigint
      ? Number(process.hrtime.bigint()) / 1e9
      : Date.now() / 1000;
  });
  app.addHook("onResponse", async (req, reply) => {
    const start = (req as { _startTime?: number })._startTime;
    if (start === undefined) return;
    const now = process.hrtime.bigint
      ? Number(process.hrtime.bigint()) / 1e9
      : Date.now() / 1000;
    const route = req.routeOptions?.url ?? req.url;
    httpHistogram.observe(
      { method: req.method, route, status: String(reply.statusCode) },
      now - start,
    );
  });

  registerAuth(app, deps);

  // Health / readiness / metrics.
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_req, reply) => {
    try {
      await deps.db.execute(sql`select 1`);
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not-ready" });
    }
  });

  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });

  // Feature routes.
  registerAuthRoutes(app, deps);
  registerRoomRoutes(app, deps);
  registerPostRoutes(app, deps);
  registerCommentRoutes(app, deps);
  registerVoteRoutes(app, deps);
  registerNotificationRoutes(app, deps);

  return app;
}
