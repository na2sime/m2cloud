import { Redis } from "ioredis";
import { createDb } from "@m2cloud/db";
import { createLogger, loadConfig, z } from "@m2cloud/shared";
import { buildApp } from "./server.js";
import { makeRedisCache } from "./cache.js";
import { connectRabbit } from "./events.js";

const configSchema = z.object({
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
});

async function main(): Promise<void> {
  const config = loadConfig(configSchema);
  const logger = createLogger("gateway-api");

  const db = createDb(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL);
  const cache = makeRedisCache(redis);
  const rabbit = await connectRabbit(config.RABBITMQ_URL, logger);

  const app = await buildApp({
    db,
    jwtSecret: config.JWT_SECRET,
    publishEvent: rabbit.publishEvent,
    cache,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutting down", { signal });
    try {
      await app.close();
      await rabbit.close();
      redis.disconnect();
    } catch (err) {
      logger.error("error during shutdown", { err: String(err) });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.GATEWAY_PORT, host: "0.0.0.0" });
  logger.info("gateway-api listening", { port: config.GATEWAY_PORT });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
