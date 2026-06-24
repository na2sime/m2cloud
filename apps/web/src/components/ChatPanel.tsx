// Live chat panel for a room. Uses the useChat hook for the WebSocket
// connection and renders the running message list with a send form.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "../ws.js";

interface ChatPanelProps {
  roomSlug: string | null;
  token: string | null;
}

export function ChatPanel({ roomSlug, token }: ChatPanelProps) {
  const { status, messages, send } = useChat(roomSlug, token);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send(body);
    setDraft("");
  };

  const statusLabel =
    status === "open"
      ? "connected"
      : status === "connecting"
        ? "connecting…"
        : "disconnected";

  return (
    <aside className="chat">
      <div className="chat-header">
        <h3>Room chat</h3>
        <span className={`chat-status chat-status-${status}`}>
          {statusLabel}
        </span>
      </div>
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <p className="muted">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="chat-msg">
              <span className="chat-author">{m.authorUsername}</span>
              <span className="chat-body">{m.body}</span>
            </div>
          ))
        )}
      </div>
      <form className="chat-form" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={status !== "open"}
        />
        <button
          type="submit"
          className="btn"
          disabled={status !== "open" || draft.trim().length === 0}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
