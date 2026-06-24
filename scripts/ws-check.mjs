// Minimal WebSocket roundtrip check using Node's global WebSocket (Node 21+).
// Joins a room, sends a message, expects to receive the broadcast back
// (proves persistence + Redis pub/sub fan-out). Exits 0 on success.
const token = process.env.TOKEN;
const slug = process.env.SLUG;
const url = `ws://localhost:3001/ws?token=${encodeURIComponent(token)}`;

const ws = new WebSocket(url);
let done = false;
const finish = (code) => {
  if (done) return;
  done = true;
  try { ws.close(); } catch {}
  process.exit(code);
};
const timer = setTimeout(() => finish(1), 6000);

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "join", room: slug }));
});

ws.addEventListener("message", (ev) => {
  let frame;
  try { frame = JSON.parse(ev.data); } catch { return; }
  if (frame.type === "joined") {
    ws.send(JSON.stringify({ type: "message", room: slug, body: "hello from smoke" }));
  } else if (frame.type === "message" && frame.body === "hello from smoke") {
    clearTimeout(timer);
    finish(0);
  }
});

ws.addEventListener("error", () => finish(1));
