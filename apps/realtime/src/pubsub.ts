import { EventEmitter } from "node:events";
import { Redis } from "ioredis";

/**
 * Payload broadcast to every realtime replica for a given room. Replicas
 * forward this verbatim to their locally-connected sockets joined to the room.
 */
export interface RoomMessage {
  type: "message";
  room: string;
  author: { id: string; username: string };
  body: string;
  at: string;
}

export type RoomMessageHandler = (msg: RoomMessage) => void;

/**
 * Fan-out abstraction over a publish/subscribe transport. Injectable so tests
 * can supply an in-memory fake instead of opening real redis sockets.
 */
export interface PubSub {
  /** Subscribe to a room's channel. The callback fires for every published message. */
  subscribeRoom(slug: string, cb: RoomMessageHandler): Promise<void>;
  /** Publish a message to a room's channel (fans out to all replicas). */
  publishMessage(slug: string, msg: RoomMessage): Promise<void>;
  /** Tear down underlying connections. */
  close(): Promise<void>;
}

function channelFor(slug: string): string {
  return `room:${slug}`;
}

/**
 * Real ioredis-backed pub/sub. Uses two connections because a connection in
 * subscriber mode cannot issue regular commands like PUBLISH.
 */
export function makeRedisPubSub(url: string): PubSub {
  const publisher = new Redis(url);
  const subscriber = new Redis(url);

  // Per-channel set of local handlers; one redis SUBSCRIBE per channel.
  const handlers = new Map<string, Set<RoomMessageHandler>>();

  subscriber.on("message", (channel: string, message: string) => {
    const set = handlers.get(channel);
    if (!set || set.size === 0) return;
    let parsed: RoomMessage;
    try {
      parsed = JSON.parse(message) as RoomMessage;
    } catch {
      return;
    }
    for (const cb of set) cb(parsed);
  });

  return {
    async subscribeRoom(slug, cb) {
      const channel = channelFor(slug);
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
        await subscriber.subscribe(channel);
      }
      set.add(cb);
    },
    async publishMessage(slug, msg) {
      await publisher.publish(channelFor(slug), JSON.stringify(msg));
    },
    async close() {
      publisher.disconnect();
      subscriber.disconnect();
    },
  };
}

/**
 * In-memory pub/sub backed by an EventEmitter. Hermetic substitute for tests —
 * publish/subscribe semantics match the redis implementation (JSON round-trip
 * included) without any network I/O.
 */
export function makeInMemoryPubSub(): PubSub {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const wrappers = new Map<RoomMessageHandler, (raw: string) => void>();

  return {
    async subscribeRoom(slug, cb) {
      const wrapper = (raw: string): void => {
        cb(JSON.parse(raw) as RoomMessage);
      };
      wrappers.set(cb, wrapper);
      emitter.on(channelFor(slug), wrapper);
    },
    async publishMessage(slug, msg) {
      emitter.emit(channelFor(slug), JSON.stringify(msg));
    },
    async close() {
      emitter.removeAllListeners();
      wrappers.clear();
    },
  };
}
