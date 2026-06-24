import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createDb, users, rooms, posts, notifications } from "@m2cloud/db";
import type { Database } from "@m2cloud/db";
import { createLogger } from "@m2cloud/shared";
import type { DomainEvent } from "@m2cloud/shared";
import {
  handleEvent,
  roomPostsCacheKey,
  type RedisLike,
} from "../src/consumers/notifications.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://m2cloud:m2cloud@localhost:5432/m2cloud_test_worker";

const log = createLogger("worker-test");

/** In-memory Redis fake exposing a spy-able `del`. Never opens a socket. */
function makeFakeRedis(): RedisLike & { del: ReturnType<typeof vi.fn> } {
  return {
    del: vi.fn(async (..._keys: string[]) => 1),
  };
}

interface Seed {
  authorId: string;
  commenterId: string;
  roomId: string;
  postId: string;
}

let db: Database;

async function seedPostByAuthor(): Promise<Seed> {
  const authorId = randomUUID();
  const commenterId = randomUUID();
  const roomId = randomUUID();
  const postId = randomUUID();

  await db.insert(users).values([
    {
      id: authorId,
      email: `${randomUUID()}@example.test`,
      username: `author_${randomUUID().slice(0, 8)}`,
      passwordHash: "x",
    },
    {
      id: commenterId,
      email: `${randomUUID()}@example.test`,
      username: `commenter_${randomUUID().slice(0, 8)}`,
      passwordHash: "x",
    },
  ]);

  await db.insert(rooms).values({
    id: roomId,
    slug: `room-${randomUUID()}`,
    name: "Test Room",
    createdBy: authorId,
  });

  await db.insert(posts).values({
    id: postId,
    roomId,
    authorId,
    title: "Test Post",
    body: "hello",
  });

  return { authorId, commenterId, roomId, postId };
}

beforeAll(() => {
  db = createDb(DATABASE_URL);
});

afterAll(async () => {
  // postgres-js client end (close pool). Cast through unknown — internal handle.
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
});

describe("handleEvent: comment.created", () => {
  it("creates exactly one notification for the post author and invalidates the room cache", async () => {
    const seed = await seedPostByAuthor();
    const redis = makeFakeRedis();
    const commentId = randomUUID();

    const event: DomainEvent<"comment.created"> = {
      type: "comment.created",
      payload: {
        commentId,
        postId: seed.postId,
        authorId: seed.commenterId,
        body: "nice post",
      },
      occurredAt: new Date().toISOString(),
    };

    await handleEvent(event, { db, redis, log });

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, seed.authorId),
          eq(notifications.type, "comment_on_post"),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({
      postId: seed.postId,
      commentId,
      byUserId: seed.commenterId,
    });
    expect(rows[0]?.read).toBe(false);

    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith(roomPostsCacheKey(seed.roomId));
  });

  it("does NOT create a notification when the commenter is the post author (but still invalidates cache)", async () => {
    const seed = await seedPostByAuthor();
    const redis = makeFakeRedis();
    const commentId = randomUUID();

    const event: DomainEvent<"comment.created"> = {
      type: "comment.created",
      payload: {
        commentId,
        postId: seed.postId,
        authorId: seed.authorId, // author comments on own post
        body: "self reply",
      },
      occurredAt: new Date().toISOString(),
    };

    await handleEvent(event, { db, redis, log });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, seed.authorId));

    expect(rows).toHaveLength(0);
    expect(redis.del).toHaveBeenCalledWith(roomPostsCacheKey(seed.roomId));
  });
});

describe("handleEvent: post.created", () => {
  it("invalidates the room cache and creates no notification", async () => {
    const seed = await seedPostByAuthor();
    const redis = makeFakeRedis();

    const event: DomainEvent<"post.created"> = {
      type: "post.created",
      payload: {
        postId: seed.postId,
        roomId: seed.roomId,
        authorId: seed.authorId,
        title: "Test Post",
      },
      occurredAt: new Date().toISOString(),
    };

    await handleEvent(event, { db, redis, log });

    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith(roomPostsCacheKey(seed.roomId));

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, seed.authorId));
    expect(rows).toHaveLength(0);
  });
});

describe("handleEvent: vote.cast", () => {
  it("is a no-op (no notification, no cache invalidation)", async () => {
    const redis = makeFakeRedis();

    const event: DomainEvent<"vote.cast"> = {
      type: "vote.cast",
      payload: {
        targetType: "post",
        targetId: randomUUID(),
        userId: randomUUID(),
        value: 1,
      },
      occurredAt: new Date().toISOString(),
    };

    await handleEvent(event, { db, redis, log });

    expect(redis.del).not.toHaveBeenCalled();
  });
});
