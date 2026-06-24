import { eq } from "drizzle-orm";
import { posts, notifications } from "@m2cloud/db";
import type { Database } from "@m2cloud/db";
import type {
  DomainEvent,
  CommentCreatedPayload,
  PostCreatedPayload,
  Logger,
} from "@m2cloud/shared";

/**
 * Minimal Redis surface the handler depends on. Keeping it narrow lets unit
 * tests inject a tiny fake (with a `del` spy) instead of a real ioredis client.
 */
export interface RedisLike {
  del(...keys: string[]): Promise<number>;
}

export interface HandleEventDeps {
  db: Database;
  redis: RedisLike;
  log: Logger;
}

/** Cache key the gateway populates and the worker invalidates on writes. */
export function roomPostsCacheKey(roomId: string): string {
  return `cache:room:${roomId}:posts`;
}

/**
 * Pure, injectable event handler. Given a domain event and its dependencies it
 * performs the side effects (notification inserts + cache invalidation). It is
 * deliberately free of any transport (amqp) concerns so it can be unit tested
 * with fakes.
 */
export async function handleEvent(event: DomainEvent, deps: HandleEventDeps): Promise<void> {
  switch (event.type) {
    case "comment.created":
      await handleCommentCreated(event.payload as CommentCreatedPayload, deps);
      return;
    case "post.created":
      await handlePostCreated(event.payload as PostCreatedPayload, deps);
      return;
    case "vote.cast":
      // No-op for now; intentionally ignored.
      return;
    default:
      deps.log.warn("unhandled event type", { type: (event as DomainEvent).type });
      return;
  }
}

async function handleCommentCreated(
  payload: CommentCreatedPayload,
  { db, redis, log }: HandleEventDeps,
): Promise<void> {
  const [post] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, payload.postId))
    .limit(1);

  if (!post) {
    log.warn("comment.created for unknown post", { postId: payload.postId });
    return;
  }

  // Don't notify a user about their own comment on their own post.
  if (post.authorId !== payload.authorId) {
    await db.insert(notifications).values({
      userId: post.authorId,
      type: "comment_on_post",
      payload: {
        postId: payload.postId,
        commentId: payload.commentId,
        byUserId: payload.authorId,
      },
    });
    log.info("created comment_on_post notification", {
      userId: post.authorId,
      postId: payload.postId,
      commentId: payload.commentId,
    });
  }

  await invalidateRoomPosts(post.roomId, redis, log);
}

async function handlePostCreated(
  payload: PostCreatedPayload,
  { redis, log }: HandleEventDeps,
): Promise<void> {
  // Best-effort cache invalidation only; no notification.
  await invalidateRoomPosts(payload.roomId, redis, log);
}

async function invalidateRoomPosts(
  roomId: string,
  redis: RedisLike,
  log: Logger,
): Promise<void> {
  const key = roomPostsCacheKey(roomId);
  try {
    await redis.del(key);
  } catch (err) {
    // Cache invalidation is best-effort: a stale list is acceptable and we do
    // not want to fail (and nack) the event because Redis is unavailable.
    log.warn("failed to invalidate room posts cache", {
      key,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
