import type { Redis } from "ioredis";

/**
 * Minimal cache abstraction the routes depend on. Implemented for real by
 * Redis in production and by an in-memory fake in tests.
 */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Real Redis-backed cache. */
export function makeRedisCache(redis: Redis): Cache {
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, val, ttlSec) {
      await redis.set(key, val, "EX", ttlSec);
    },
    async del(key) {
      await redis.del(key);
    },
  };
}

/** In-memory cache used by tests; honours TTL with wall-clock expiry. */
export function makeFakeCache(): Cache {
  const store = new Map<string, { val: string; expiresAt: number }>();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.val;
    },
    async set(key, val, ttlSec) {
      store.set(key, { val, expiresAt: Date.now() + ttlSec * 1000 });
    },
    async del(key) {
      store.delete(key);
    },
  };
}

/** Cache key for a room's post list (shared convention with the worker). */
export function roomPostsCacheKey(roomId: string): string {
  return `cache:room:${roomId}:posts`;
}
