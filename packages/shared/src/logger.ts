/**
 * Minimal zero-dependency structured JSON logger.
 * Writes one JSON object per line to stdout — ideal for container log
 * collection (CloudWatch / Fluent Bit). No worker threads, bundles cleanly.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_VALUE: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  service: string,
  bindings: Record<string, unknown> = {},
): Logger {
  const threshold =
    LEVEL_VALUE[(process.env.LOG_LEVEL as LogLevel) ?? "info"] ?? LEVEL_VALUE.info;

  function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_VALUE[level] < threshold) return;
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      service,
      msg,
      ...bindings,
      ...meta,
    });
    process.stdout.write(line + "\n");
  }

  return {
    debug: (msg, meta) => emit("debug", msg, meta),
    info: (msg, meta) => emit("info", msg, meta),
    warn: (msg, meta) => emit("warn", msg, meta),
    error: (msg, meta) => emit("error", msg, meta),
    child: (extra) => createLogger(service, { ...bindings, ...extra }),
  };
}
