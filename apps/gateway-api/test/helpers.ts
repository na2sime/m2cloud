import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@m2cloud/db";
import type { EventPublisher, RoutingKey, DomainEventPayloadMap } from "@m2cloud/shared";
import { buildApp } from "../src/server.js";
import { makeFakeCache, type Cache } from "../src/cache.js";

export const TEST_JWT_SECRET = "test-secret-0123456789-abcdefghij";

/** Records every publish call so tests can assert on emitted events. */
export interface RecordingPublisher {
  publishEvent: EventPublisher;
  calls: Array<{ type: RoutingKey; payload: DomainEventPayloadMap[RoutingKey] }>;
}

export function makeRecordingPublisher(): RecordingPublisher {
  const calls: RecordingPublisher["calls"] = [];
  const publishEvent: EventPublisher = async (type, payload) => {
    calls.push({ type, payload });
  };
  return { publishEvent, calls };
}

let sharedDb: Database | undefined;

/** Single shared Database for the whole test run (from DATABASE_URL). */
export function getTestDb(): Database {
  if (!sharedDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL must be set to run gateway-api tests");
    }
    sharedDb = createDb(url);
  }
  return sharedDb;
}

export interface TestHarness {
  app: Awaited<ReturnType<typeof buildApp>>;
  db: Database;
  cache: Cache;
  publisher: RecordingPublisher;
}

export async function buildTestApp(
  overrides: { cache?: Cache; publisher?: RecordingPublisher } = {},
): Promise<TestHarness> {
  const db = getTestDb();
  const cache = overrides.cache ?? makeFakeCache();
  const publisher = overrides.publisher ?? makeRecordingPublisher();
  const app = await buildApp({
    db,
    jwtSecret: TEST_JWT_SECRET,
    publishEvent: publisher.publishEvent,
    cache,
  });
  return { app, db, cache, publisher };
}

/** Unique-by-construction registration payload. */
export function uniqueUser() {
  const id = randomUUID().slice(0, 12);
  return {
    email: `user-${id}@example.test`,
    username: `user-${id}`,
    password: "password123",
  };
}

export function uniqueSlug(): string {
  return `room-${randomUUID().slice(0, 12)}`;
}

/** Register a user via the API and return its token + the public user object. */
export async function registerUser(
  app: TestHarness["app"],
): Promise<{ token: string; user: { id: string; username: string; email: string } }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: uniqueUser(),
  });
  if (res.statusCode !== 201) {
    throw new Error(`registerUser failed: ${res.statusCode} ${res.body}`);
  }
  return res.json();
}

export function authHeader(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
