import http from "node:http";
import type { Logger } from "@m2cloud/shared";
import { makeMetricsRegistry } from "@m2cloud/shared";

export interface HealthServerOptions {
  port: number;
  log: Logger;
  /** Returns whether the worker is ready (e.g. amqp connected & consuming). */
  isReady: () => boolean;
}

export interface HealthServer {
  server: http.Server;
  close: () => Promise<void>;
}

/**
 * Tiny HTTP server exposing liveness (/health), readiness (/ready) and
 * Prometheus (/metrics) endpoints. No framework — keeps the worker lean.
 */
export function startHealthServer(opts: HealthServerOptions): HealthServer {
  const { port, log, isReady } = opts;
  const { registry } = makeMetricsRegistry("worker");

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/health" || url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url === "/ready" || url === "/readyz") {
      const ready = isReady();
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
      return;
    }

    if (url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "content-type": registry.contentType });
          res.end(body);
        })
        .catch((err: unknown) => {
          log.error("failed to render metrics", {
            err: err instanceof Error ? err.message : String(err),
          });
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("metrics_error");
        });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not_found");
  });

  server.listen(port, () => {
    log.info("health server listening", { port });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
