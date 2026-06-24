import { createDb } from "@m2cloud/db";
import { createLogger, loadConfig, z } from "@m2cloud/shared";
import { makeRedisPubSub } from "./pubsub.js";
import { createServer } from "./server.js";

const config = loadConfig(
  z.object({
    REALTIME_PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
  }),
);

const logger = createLogger("realtime");
const db = createDb(config.DATABASE_URL);
const pubsub = makeRedisPubSub(config.REDIS_URL);

const server = createServer({ db, pubsub, jwtSecret: config.JWT_SECRET, logger });

server.listen(config.REALTIME_PORT, () => {
  logger.info("realtime listening", { port: config.REALTIME_PORT });
});

function shutdown(signal: string): void {
  logger.info("shutting down", { signal });
  server.close(() => {
    void pubsub.close().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
