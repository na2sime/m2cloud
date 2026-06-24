// Chat WebSocket client hook. Connects to the realtime service, joins a room,
// streams incoming {type:"message"} frames, and exposes a send function.

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "./config.js";
import type {
  ChatIncomingMessageFrame,
  ChatJoinFrame,
  ChatOutgoingMessageFrame,
} from "./types.js";

export type ChatStatus = "connecting" | "open" | "closed";

export interface ChatMessage {
  id: string;
  body: string;
  authorUsername: string;
  createdAt: string;
}

export interface UseChatResult {
  status: ChatStatus;
  messages: ChatMessage[];
  send(body: string): void;
}

function buildUrl(token: string): string {
  // Supports both an absolute ws:// base (local dev) and a path-only base
  // like "/ws" (in-cluster, same-origin via the ingress).
  let base = WS_URL.replace(/\/+$/, "");
  if (base.startsWith("/")) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${window.location.host}${base}`;
  }
  const suffix = base.endsWith("/ws") ? "" : "/ws";
  return `${base}${suffix}?token=${encodeURIComponent(token)}`;
}

let messageSeq = 0;
function normalize(frame: ChatIncomingMessageFrame): ChatMessage {
  messageSeq += 1;
  return {
    id: `${frame.at}-${messageSeq}`,
    body: frame.body,
    authorUsername: frame.author?.username ?? "unknown",
    createdAt: frame.at ?? new Date().toISOString(),
  };
}

export function useChat(
  slug: string | null,
  token: string | null,
): UseChatResult {
  const [status, setStatus] = useState<ChatStatus>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!slug || !token) {
      setStatus("closed");
      return;
    }

    setMessages([]);
    setStatus("connecting");

    let active = true;
    const ws = new WebSocket(buildUrl(token));
    socketRef.current = ws;

    ws.onopen = () => {
      if (!active) return;
      setStatus("open");
      const join: ChatJoinFrame = { type: "join", room: slug };
      ws.send(JSON.stringify(join));
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      if (!active) return;
      let frame: unknown;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (
        frame &&
        typeof frame === "object" &&
        (frame as { type?: unknown }).type === "message"
      ) {
        const msg = frame as ChatIncomingMessageFrame;
        if (typeof msg.body === "string") {
          setMessages((prev) => [...prev, normalize(msg)]);
        }
      }
    };

    ws.onclose = () => {
      if (!active) return;
      setStatus("closed");
    };

    ws.onerror = () => {
      if (!active) return;
      setStatus("closed");
    };

    return () => {
      active = false;
      socketRef.current = null;
      // Only close if not already closing/closed.
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [slug, token]);

  const send = useCallback(
    (body: string) => {
      const ws = socketRef.current;
      const trimmed = body.trim();
      if (!ws || ws.readyState !== WebSocket.OPEN || !slug || !trimmed) return;
      const frame: ChatOutgoingMessageFrame = {
        type: "message",
        room: slug,
        body: trimmed,
      };
      ws.send(JSON.stringify(frame));
    },
    [slug],
  );

  return { status, messages, send };
}
