import type { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { rooms, posts, users, comments } from "@m2cloud/db";
import { z } from "@m2cloud/shared";
import type { AppDeps } from "../types.js";
import { parseBody } from "../validate.js";
import { roomPostsCacheKey } from "../cache.js";

const createRoomSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits and dashes"),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

const createPostSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().max(40000),
});

const ROOM_POSTS_TTL_SEC = 30;

interface RoomPostListItem {
  id: string;
  title: string;
  body: string;
  score: number;
  authorUsername: string;
  commentCount: number;
  createdAt: string;
}

export function registerRoomRoutes(app: FastifyInstance, deps: AppDeps): void {
  // GET /api/rooms -> Room[]
  app.get("/api/rooms", async () => {
    return deps.db.select().from(rooms).orderBy(desc(rooms.createdAt));
  });

  // POST /api/rooms (auth)
  app.post("/api/rooms", { preHandler: app.requireAuth }, async (req, reply) => {
    const body = parseBody(createRoomSchema, req.body, reply);
    if (!body) return;
    const user = req.user!;

    const existing = await deps.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.slug, body.slug))
      .limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: "Room slug already in use" });
    }

    try {
      const [room] = await deps.db
        .insert(rooms)
        .values({
          slug: body.slug,
          name: body.name,
          description: body.description ?? null,
          createdBy: user.sub,
        })
        .returning();
      return reply.code(201).send(room);
    } catch {
      return reply.code(409).send({ error: "Room slug already in use" });
    }
  });

  // GET /api/rooms/:slug -> Room
  app.get<{ Params: { slug: string } }>("/api/rooms/:slug", async (req, reply) => {
    const [room] = await deps.db
      .select()
      .from(rooms)
      .where(eq(rooms.slug, req.params.slug))
      .limit(1);
    if (!room) {
      return reply.code(404).send({ error: "Room not found" });
    }
    return room;
  });

  // GET /api/rooms/:slug/posts -> list (cached)
  app.get<{ Params: { slug: string } }>(
    "/api/rooms/:slug/posts",
    async (req, reply) => {
      const [room] = await deps.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.slug, req.params.slug))
        .limit(1);
      if (!room) {
        return reply.code(404).send({ error: "Room not found" });
      }

      const cacheKey = roomPostsCacheKey(room.id);
      const cached = await deps.cache.get(cacheKey);
      if (cached) {
        reply.header("content-type", "application/json; charset=utf-8");
        return reply.send(cached);
      }

      const commentCount = sql<number>`(
        select count(*) from ${comments} where ${comments.postId} = ${posts.id}
      )`;
      const rows = await deps.db
        .select({
          id: posts.id,
          title: posts.title,
          body: posts.body,
          score: posts.score,
          authorUsername: users.username,
          commentCount,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .innerJoin(users, eq(posts.authorId, users.id))
        .where(eq(posts.roomId, room.id))
        .orderBy(desc(posts.createdAt));

      const list: RoomPostListItem[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        score: r.score,
        authorUsername: r.authorUsername,
        commentCount: Number(r.commentCount),
        createdAt: r.createdAt.toISOString(),
      }));

      await deps.cache.set(cacheKey, JSON.stringify(list), ROOM_POSTS_TTL_SEC);
      return list;
    },
  );

  // POST /api/rooms/:slug/posts (auth) -> create + invalidate cache + publish
  app.post<{ Params: { slug: string } }>(
    "/api/rooms/:slug/posts",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const body = parseBody(createPostSchema, req.body, reply);
      if (!body) return;
      const user = req.user!;

      const [room] = await deps.db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.slug, req.params.slug))
        .limit(1);
      if (!room) {
        return reply.code(404).send({ error: "Room not found" });
      }

      const [post] = await deps.db
        .insert(posts)
        .values({
          roomId: room.id,
          authorId: user.sub,
          title: body.title,
          body: body.body,
        })
        .returning();

      await deps.cache.del(roomPostsCacheKey(room.id));
      await deps.publishEvent("post.created", {
        postId: post.id,
        roomId: room.id,
        authorId: user.sub,
        title: post.title,
      });

      return reply.code(201).send(post);
    },
  );
}
