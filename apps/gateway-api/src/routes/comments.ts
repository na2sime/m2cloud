import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { posts, comments } from "@m2cloud/db";
import { z } from "@m2cloud/shared";
import type { AppDeps } from "../types.js";
import { parseBody, isUuid } from "../validate.js";

const createCommentSchema = z.object({
  body: z.string().min(1).max(40000),
  parentId: z.string().uuid().optional(),
});

export function registerCommentRoutes(app: FastifyInstance, deps: AppDeps): void {
  // POST /api/posts/:id/comments (auth) -> create + publish
  app.post<{ Params: { id: string } }>(
    "/api/posts/:id/comments",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const body = parseBody(createCommentSchema, req.body, reply);
      if (!body) return;
      const user = req.user!;

      if (!isUuid(req.params.id)) {
        return reply.code(404).send({ error: "Post not found" });
      }

      const [post] = await deps.db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, req.params.id))
        .limit(1);
      if (!post) {
        return reply.code(404).send({ error: "Post not found" });
      }

      if (body.parentId) {
        const [parent] = await deps.db
          .select({ id: comments.id, postId: comments.postId })
          .from(comments)
          .where(eq(comments.id, body.parentId))
          .limit(1);
        if (!parent || parent.postId !== post.id) {
          return reply.code(400).send({ error: "Invalid parentId" });
        }
      }

      const [comment] = await deps.db
        .insert(comments)
        .values({
          postId: post.id,
          authorId: user.sub,
          parentCommentId: body.parentId ?? null,
          body: body.body,
        })
        .returning();

      await deps.publishEvent("comment.created", {
        commentId: comment.id,
        postId: post.id,
        authorId: user.sub,
        body: comment.body,
      });

      return reply.code(201).send(comment);
    },
  );
}
