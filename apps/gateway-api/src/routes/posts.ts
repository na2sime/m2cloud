import type { FastifyInstance } from "fastify";
import { eq, asc } from "drizzle-orm";
import { posts, comments, users } from "@m2cloud/db";
import type { AppDeps } from "../types.js";
import { isUuid } from "../validate.js";

export function registerPostRoutes(app: FastifyInstance, deps: AppDeps): void {
  // GET /api/posts/:id -> { post, comments }
  app.get<{ Params: { id: string } }>("/api/posts/:id", async (req, reply) => {
    if (!isUuid(req.params.id)) {
      return reply.code(404).send({ error: "Post not found" });
    }
    const [post] = await deps.db
      .select({
        id: posts.id,
        roomId: posts.roomId,
        authorId: posts.authorId,
        title: posts.title,
        body: posts.body,
        score: posts.score,
        createdAt: posts.createdAt,
        authorUsername: users.username,
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, req.params.id))
      .limit(1);

    if (!post) {
      return reply.code(404).send({ error: "Post not found" });
    }

    const commentRows = await deps.db
      .select({
        id: comments.id,
        body: comments.body,
        score: comments.score,
        authorUsername: users.username,
        parentCommentId: comments.parentCommentId,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.postId, post.id))
      .orderBy(asc(comments.createdAt));

    return {
      post: {
        id: post.id,
        roomId: post.roomId,
        authorId: post.authorId,
        title: post.title,
        body: post.body,
        score: post.score,
        createdAt: post.createdAt,
        authorUsername: post.authorUsername,
      },
      comments: commentRows,
    };
  });
}
