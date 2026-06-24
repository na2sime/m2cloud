import { Registry, collectDefaultMetrics, Histogram } from "prom-client";

/**
 * Per-service Prometheus registry with default process metrics + an HTTP
 * latency histogram. Exposed at GET /metrics by each service.
 */
export function makeMetricsRegistry(service: string) {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });

  const httpHistogram = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { registry, httpHistogram };
}

export type MetricsRegistry = ReturnType<typeof makeMetricsRegistry>;
