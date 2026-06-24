import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { rooms, messages } from "@m2cloud/db";
import type { Database } from "@m2cloud/db";
import { verifyToken, type Logger } from "@m2cloud/shared";
import type { PubSub, RoomMessage } from "./pubsub.js";

/** Authenticated identity attached to every connection after the JWT handshake. */
export interface AuthedUser {
  sub: string;
  username: string;
}

/** Minimal surface of a socket the handlers depend on — lets tests use a fake. */
export interface SocketLike {
  send(data: string): void;
}

/** Frames the server sends to clients. */
export type ServerFrame =
  | { type: "joined"; room: string }
  | RoomMessage
  | { type: "error"; message: string };

interface JoinMessage {
  type: "join";
  room: string;
}

interface SendMessage {
  type: "message";
  room: string;
  body: string;
}

export interface WsDeps {
  db: Database;
  pubsub: PubSub;
  jwtSecret: string;
  logger?: Logger;
}

function sendFrame(socket: SocketLike, frame: ServerFrame): void {
  socket.send(JSON.stringify(frame));
}

/**
 * Tracks, per connection, which room slugs it has joined and ensures the
 * process is subscribed (once) to each joined room's pub/sub channel so that
 * messages from any replica reach this socket.
 */
export class ConnectionState {
  /** Rooms this connection has joined. */
  readonly joined = new Set<string>();

  constructor(
    private readonly socket: SocketLike,
    private readonly deps: WsDeps,
  ) {}

  /**
   * Join a room by slug: validate it exists, register membership, and ensure a
   * pub/sub subscription forwards future messages to this socket.
   */
  async join(slug: string): Promise<void> {
    const room = await resolveRoom(this.deps.db, slug);
    if (!room) {
      sendFrame(this.socket, { type: "error", message: `room not found: ${slug}` });
      return;
    }
    if (!this.joined.has(slug)) {
      this.joined.add(slug);
      await this.deps.pubsub.subscribeRoom(slug, (msg) => {
        // Only forward to this socket if it is still joined to that room.
        if (this.joined.has(msg.room)) sendFrame(this.socket, msg);
      });
    }
    sendFrame(this.socket, { type: "joined", room: slug });
  }
}

async function resolveRoom(db: Database, slug: string) {
  const found = await db.select().from(rooms).where(eq(rooms.slug, slug)).limit(1);
  return found[0];
}

/**
 * Core "message" handler. Persists the chat message and publishes it to the
 * room's channel. Extracted so it can be unit-tested directly with a fake
 * socket + fake pubsub + real test DB.
 *
 * Returns the published RoomMessage (or null when the room is missing).
 */
export async function handleSendMessage(
  deps: WsDeps,
  user: AuthedUser,
  socket: SocketLike,
  slug: string,
  body: string,
): Promise<RoomMessage | null> {
  const room = await resolveRoom(deps.db, slug);
  if (!room) {
    sendFrame(socket, { type: "error", message: `room not found: ${slug}` });
    return null;
  }

  const inserted = await deps.db
    .insert(messages)
    .values({ roomId: room.id, authorId: user.sub, body })
    .returning();
  const row = inserted[0];

  const msg: RoomMessage = {
    type: "message",
    room: slug,
    author: { id: user.sub, username: user.username },
    body,
    at: (row?.createdAt ?? new Date()).toISOString(),
  };

  await deps.pubsub.publishMessage(slug, msg);
  return msg;
}

function parseClientMessage(raw: string): JoinMessage | SendMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (obj.type === "join" && typeof obj.room === "string") {
    return { type: "join", room: obj.room };
  }
  if (
    obj.type === "message" &&
    typeof obj.room === "string" &&
    typeof obj.body === "string"
  ) {
    return { type: "message", room: obj.room, body: obj.body };
  }
  return null;
}

/**
 * Dispatch a single raw client frame for an authenticated connection. Exposed
 * for direct unit testing of the protocol without a live socket.
 */
export async function handleClientFrame(
  deps: WsDeps,
  state: ConnectionState,
  user: AuthedUser,
  socket: SocketLike,
  raw: string,
): Promise<void> {
  const parsed = parseClientMessage(raw);
  if (!parsed) {
    sendFrame(socket, { type: "error", message: "invalid message" });
    return;
  }
  if (parsed.type === "join") {
    await state.join(parsed.room);
    return;
  }
  // type === "message"
  await handleSendMessage(deps, user, socket, parsed.room, parsed.body);
}

function tokenFromRequest(req: IncomingMessage): string | null {
  const host = req.headers.host ?? "localhost";
  let url: URL;
  try {
    url = new URL(req.url ?? "/", `http://${host}`);
  } catch {
    return null;
  }
  return url.searchParams.get("token");
}

/**
 * Attach the WebSocket server to an existing http server. Handles the upgrade
 * on /ws, authenticates via ?token=<JWT>, and wires per-connection state.
 */
export function attachWebSocket(server: Server, deps: WsDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const log = deps.logger;

  server.on("upgrade", (req, socket: Duplex, head) => {
    const host = req.headers.host ?? "localhost";
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const token = tokenFromRequest(req);
    if (!token) {
      socket.write("HTTP/1.1 4401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    verifyToken(token, deps.jwtSecret).then(
      (user) => {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req, user);
        });
      },
      () => {
        socket.write("HTTP/1.1 4401 Unauthorized\r\n\r\n");
        socket.destroy();
      },
    );
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, user: AuthedUser) => {
    const socketLike: SocketLike = { send: (data) => ws.send(data) };
    const state = new ConnectionState(socketLike, deps);
    log?.debug("ws connected", { user: user.sub });

    ws.on("message", (raw) => {
      void handleClientFrame(deps, state, user, socketLike, raw.toString()).catch(
        (err: unknown) => {
          log?.error("ws frame error", { err: String(err) });
          sendFrame(socketLike, { type: "error", message: "internal error" });
        },
      );
    });

    ws.on("close", () => {
      state.joined.clear();
      log?.debug("ws disconnected", { user: user.sub });
    });

    ws.on("error", (err) => {
      log?.warn("ws socket error", { err: String(err) });
    });
  });

  return wss;
}
