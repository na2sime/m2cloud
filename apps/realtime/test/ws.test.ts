import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { createDb, users, rooms, messages } from "@m2cloud/db";
import type { Database } from "@m2cloud/db";
import { makeInMemoryPubSub, type RoomMessage } from "../src/pubsub.js";
import {
  ConnectionState,
  handleClientFrame,
  handleSendMessage,
  type AuthedUser,
  type ServerFrame,
  type SocketLike,
  type WsDeps,
} from "../src/ws.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://m2cloud:m2cloud@localhost:5432/m2cloud_test_realtime";

/** Fake socket that records every frame it is asked to send (parsed JSON). */
function makeFakeSocket(): SocketLike & { frames: ServerFrame[] } {
  const frames: ServerFrame[] = [];
  return {
    frames,
    send(data: string) {
      frames.push(JSON.parse(data) as ServerFrame);
    },
  };
}

let db: Database;

async function seedUser(): Promise<AuthedUser> {
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const [row] = await db
    .insert(users)
    .values({
      email: `u-${suffix}@example.com`,
      username: `user-${suffix}`,
      passwordHash: "x",
    })
    .returning();
  if (!row) throw new Error("failed to seed user");
  return { sub: row.id, username: row.username };
}

async function seedRoom(createdBy: string): Promise<string> {
  const slug = `room-${randomUUID()}`;
  await db
    .insert(rooms)
    .values({ slug, name: `Room ${slug}`, createdBy })
    .returning();
  return slug;
}

beforeAll(() => {
  db = createDb(DATABASE_URL);
});

afterAll(async () => {
  // postgres-js client is reachable through the drizzle session; closing the
  // pool keeps the test process from hanging on open sockets.
  const client = (db as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  if (client?.end) await client.end();
});

describe("ws message handling", () => {
  it("persists a message to the DB and broadcasts a frame to joined sockets", async () => {
    const pubsub = makeInMemoryPubSub();
    const user = await seedUser();
    const slug = await seedRoom(user.sub);
    const deps: WsDeps = { db, pubsub, jwtSecret: "test-secret" };

    const socket = makeFakeSocket();
    const state = new ConnectionState(socket, deps);

    // Join the room: should subscribe + emit a "joined" frame.
    await handleClientFrame(deps, state, user, socket, JSON.stringify({ type: "join", room: slug }));
    expect(socket.frames).toContainEqual({ type: "joined", room: slug });
    expect(state.joined.has(slug)).toBe(true);

    // Send a message: should persist + publish, and (since this socket joined)
    // the pub/sub forward should deliver a "message" frame back to this socket.
    const body = `hello ${randomUUID()}`;
    await handleClientFrame(
      deps,
      state,
      user,
      socket,
      JSON.stringify({ type: "message", room: slug, body }),
    );

    // Frame broadcast to the joined socket.
    const messageFrames = socket.frames.filter(
      (f): f is RoomMessage => f.type === "message",
    );
    expect(messageFrames).toHaveLength(1);
    expect(messageFrames[0]).toMatchObject({
      type: "message",
      room: slug,
      author: { id: user.sub, username: user.username },
      body,
    });
    expect(typeof messageFrames[0]?.at).toBe("string");

    // Message persisted to the DB.
    const [room] = await db.select().from(rooms).where(eq(rooms.slug, slug));
    const persisted = await db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, room!.id), eq(messages.authorId, user.sub)));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.body).toBe(body);

    await pubsub.close();
  });

  it("returns an error frame and persists nothing for an unknown room", async () => {
    const pubsub = makeInMemoryPubSub();
    const user = await seedUser();
    const deps: WsDeps = { db, pubsub, jwtSecret: "test-secret" };
    const socket = makeFakeSocket();

    const missingSlug = `missing-${randomUUID()}`;
    const result = await handleSendMessage(deps, user, socket, missingSlug, "ignored");

    expect(result).toBeNull();
    expect(socket.frames).toContainEqual({
      type: "error",
      message: `room not found: ${missingSlug}`,
    });

    await pubsub.close();
  });

  it("emits an error frame for malformed client input", async () => {
    const pubsub = makeInMemoryPubSub();
    const user = await seedUser();
    const deps: WsDeps = { db, pubsub, jwtSecret: "test-secret" };
    const socket = makeFakeSocket();
    const state = new ConnectionState(socket, deps);

    await handleClientFrame(deps, state, user, socket, "not json");
    expect(socket.frames).toContainEqual({ type: "error", message: "invalid message" });

    await pubsub.close();
  });

  it("delivers a message published by one socket to another socket joined to the same room", async () => {
    const pubsub = makeInMemoryPubSub();
    const author = await seedUser();
    const listener = await seedUser();
    const slug = await seedRoom(author.sub);
    const deps: WsDeps = { db, pubsub, jwtSecret: "test-secret" };

    const authorSocket = makeFakeSocket();
    const listenerSocket = makeFakeSocket();
    const authorState = new ConnectionState(authorSocket, deps);
    const listenerState = new ConnectionState(listenerSocket, deps);

    await authorState.join(slug);
    await listenerState.join(slug);

    const body = `cross-socket ${randomUUID()}`;
    await handleSendMessage(deps, author, authorSocket, slug, body);

    // The listener, joined to the same room, should receive the broadcast.
    const listenerMessages = listenerSocket.frames.filter(
      (f): f is RoomMessage => f.type === "message",
    );
    expect(listenerMessages).toHaveLength(1);
    expect(listenerMessages[0]).toMatchObject({ room: slug, body });

    await pubsub.close();
  });
});
