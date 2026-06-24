import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { makeInMemoryPubSub, type RoomMessage } from "../src/pubsub.js";

describe("in-memory pubsub", () => {
  it("delivers a published message to a room subscriber with the parsed payload", async () => {
    const pubsub = makeInMemoryPubSub();
    const slug = `room-${randomUUID()}`;

    const received: RoomMessage[] = [];
    await pubsub.subscribeRoom(slug, (msg) => {
      received.push(msg);
    });

    const sent: RoomMessage = {
      type: "message",
      room: slug,
      author: { id: randomUUID(), username: "alice" },
      body: "hello world",
      at: new Date().toISOString(),
    };
    await pubsub.publishMessage(slug, sent);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(sent);
    // Ensure it is a JSON round-trip (a new object), not the same reference.
    expect(received[0]).not.toBe(sent);

    await pubsub.close();
  });

  it("does not deliver messages published to a different room", async () => {
    const pubsub = makeInMemoryPubSub();
    const slugA = `room-${randomUUID()}`;
    const slugB = `room-${randomUUID()}`;

    const received: RoomMessage[] = [];
    await pubsub.subscribeRoom(slugA, (msg) => {
      received.push(msg);
    });

    await pubsub.publishMessage(slugB, {
      type: "message",
      room: slugB,
      author: { id: randomUUID(), username: "bob" },
      body: "elsewhere",
      at: new Date().toISOString(),
    });

    expect(received).toHaveLength(0);
    await pubsub.close();
  });

  it("fans out to multiple subscribers of the same room", async () => {
    const pubsub = makeInMemoryPubSub();
    const slug = `room-${randomUUID()}`;

    let countA = 0;
    let countB = 0;
    await pubsub.subscribeRoom(slug, () => {
      countA += 1;
    });
    await pubsub.subscribeRoom(slug, () => {
      countB += 1;
    });

    await pubsub.publishMessage(slug, {
      type: "message",
      room: slug,
      author: { id: randomUUID(), username: "carol" },
      body: "broadcast",
      at: new Date().toISOString(),
    });

    expect(countA).toBe(1);
    expect(countB).toBe(1);
    await pubsub.close();
  });
});
