import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { notifications } from "@m2cloud/db";
import type { AppDeps } from "../types.js";

export function registerNotificationRoutes(app: FastifyInstance, deps: AppDeps): void {
  // GET /api/notifications (auth) -> newest first
  app.get(
    "/api/notifications",
    { preHandler: app.requireAuth },
    async (req) => {
      const user = req.user!;
      return deps.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.sub))
        .orderBy(desc(notifications.createdAt));
    },
  );
}
