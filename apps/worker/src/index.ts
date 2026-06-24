import amqplib from "amqplib";
import { Redis } from "ioredis";
import { createLogger, loadConfig, z, EVENTS_EXCHANGE } from "@m2cloud/shared";
import type { DomainEvent } from "@m2cloud/shared";
import { createDb } from "@m2cloud/db";
import { handleEvent } from "./consumers/notifications.js";
import { startHealthServer } from "./health.js";

const QUEUE_NAME = "notifications";
const BIND_KEYS = ["comment.created", "post.created"] as const;

const configSchema = z.object({
  WORKER_PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
});

async function main(): Promise<void> {
  const config = loadConfig(configSchema);
  const log = createLogger("worker");

  const db = createDb(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

  let ready = false;
  const health = startHealthServer({
    port: config.WORKER_PORT,
    log,
    isReady: () => ready,
  });

  const connection = await amqplib.connect(config.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  for (const key of BIND_KEYS) {
    await channel.bindQueue(QUEUE_NAME, EVENTS_EXCHANGE, key);
  }
  await channel.prefetch(16);

  await channel.consume(QUEUE_NAME, (msg) => {
    if (!msg) return;
    void (async () => {
      try {
        const event = JSON.parse(msg.content.toString("utf8")) as DomainEvent;
        await handleEvent(event, { db, redis, log });
        channel.ack(msg);
      } catch (err) {
        log.error("failed to process event", {
          routingKey: msg.fields.routingKey,
          err: err instanceof Error ? err.message : String(err),
        });
        // Do not requeue: avoid a poison-message loop. Drop (or DLX if configured).
        channel.nack(msg, false, false);
      }
    })();
  });

  ready = true;
  log.info("worker consuming", { queue: QUEUE_NAME, bindKeys: BIND_KEYS });

  const shutdown = async (signal: string): Promise<void> => {
    log.info("shutting down", { signal });
    ready = false;
    try {
      await channel.close();
      await connection.close();
    } catch (err) {
      log.warn("error closing amqp", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      redis.disconnect();
    } catch {
      // ignore
    }
    try {
      await health.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("worker failed to start", err);
  process.exit(1);
});
