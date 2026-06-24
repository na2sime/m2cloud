import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { posts, comments, votes } from "@m2cloud/db";
import { z } from "@m2cloud/shared";
import type { AppDeps } from "../types.js";
import type { AuthUser } from "../types.js";
import { parseBody, isUuid } from "../validate.js";
import { roomPostsCacheKey } from "../cache.js";

const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

type TargetType = "post" | "comment";

/**
 * Upsert a vote for the given target, recompute the target's score as the sum
 * of all vote values, persist it and return the new score.
 */
async function applyVote(
  deps: AppDeps,
  user: AuthUser,
  targetType: TargetType,
  targetId: string,
  value: 1 | -1,
): Promise<number> {
  await deps.db
    .insert(votes)
    .values({ userId: user.sub, targetType, targetId, value })
    .onConflictDoUpdate({
      target: [votes.userId, votes.targetType, votes.targetId],
      set: { value },
    });

  const [{ score }] = await deps.db
    .select({
      score: sql<number>`coalesce(sum(${votes.value}), 0)`.mapWith(Number),
    })
    .from(votes)
    .where(and(eq(votes.targetType, targetType), eq(votes.targetId, targetId)));

  if (targetType === "post") {
    await deps.db.update(posts).set({ score }).where(eq(posts.id, targetId));
  } else {
    await deps.db.update(comments).set({ score }).where(eq(comments.id, targetId));
  }

  return score;
}

export function registerVoteRoutes(app: FastifyInstance, deps: AppDeps): void {
  // POST /api/posts/:id/vote (auth)
  app.post<{ Params: { id: string } }>(
    "/api/posts/:id/vote",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const body = parseBody(voteSchema, req.body, reply);
      if (!body) return;
      const user = req.user!;

      if (!isUuid(req.params.id)) {
        return reply.code(404).send({ error: "Post not found" });
      }

      const [post] = await deps.db
        .select({ id: posts.id, roomId: posts.roomId })
        .from(posts)
        .where(eq(posts.id, req.params.id))
        .limit(1);
      if (!post) {
        return reply.code(404).send({ error: "Post not found" });
      }

      const score = await applyVote(deps, user, "post", post.id, body.value);
      await deps.cache.del(roomPostsCacheKey(post.roomId));
      await deps.publishEvent("vote.cast", {
        targetType: "post",
        targetId: post.id,
        userId: user.sub,
        value: body.value,
      });

      return reply.code(200).send({ score });
    },
  );

  // POST /api/comments/:id/vote (auth)
  app.post<{ Params: { id: string } }>(
    "/api/comments/:id/vote",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const body = parseBody(voteSchema, req.body, reply);
      if (!body) return;
      const user = req.user!;

      if (!isUuid(req.params.id)) {
        return reply.code(404).send({ error: "Comment not found" });
      }

      const [comment] = await deps.db
        .select({ id: comments.id })
        .from(comments)
        .where(eq(comments.id, req.params.id))
        .limit(1);
      if (!comment) {
        return reply.code(404).send({ error: "Comment not found" });
      }

      const score = await applyVote(deps, user, "comment", comment.id, body.value);
      await deps.publishEvent("vote.cast", {
        targetType: "comment",
        targetId: comment.id,
        userId: user.sub,
        value: body.value,
      });

      return reply.code(200).send({ score });
    },
  );
}
