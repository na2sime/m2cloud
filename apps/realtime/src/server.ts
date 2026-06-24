import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { Database } from "@m2cloud/db";
import { makeMetricsRegistry, type Logger } from "@m2cloud/shared";
import type { PubSub } from "./pubsub.js";
import { attachWebSocket } from "./ws.js";

export interface ServerDeps {
  db: Database;
  pubsub: PubSub;
  jwtSecret: string;
  logger: Logger;
}

/**
 * Build (but do not listen on) the http server that hosts the WebSocket
 * upgrade on /ws plus the GET /health, /ready and /metrics endpoints.
 */
export function createServer(deps: ServerDeps): http.Server {
  const { registry, httpHistogram } = makeMetricsRegistry("realtime");

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const start = process.hrtime.bigint();
    const method = req.method ?? "GET";
    const route = (req.url ?? "/").split("?")[0] ?? "/";

    const finish = (status: number): void => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpHistogram.observe({ method, route, status: String(status) }, seconds);
    };

    if (method === "GET" && route === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      finish(200);
      return;
    }

    if (method === "GET" && route === "/ready") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ready" }));
      finish(200);
      return;
    }

    if (method === "GET" && route === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "content-type": registry.contentType });
          res.end(body);
          finish(200);
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
          finish(500);
        });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    finish(404);
  });

  attachWebSocket(server, {
    db: deps.db,
    pubsub: deps.pubsub,
    jwtSecret: deps.jwtSecret,
    logger: deps.logger,
  });

  return server;
}
