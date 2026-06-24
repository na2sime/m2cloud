import amqplib from "amqplib";
import {
  EVENTS_EXCHANGE,
  type EventPublisher,
  type DomainEvent,
  type Logger,
} from "@m2cloud/shared";

export interface RabbitConnection {
  publishEvent: EventPublisher;
  close(): Promise<void>;
}

/**
 * Connect to RabbitMQ, assert the durable topic exchange and return a typed
 * publisher. The publisher wraps each payload in a DomainEvent envelope and
 * routes it using the event type as the routing key.
 */
export async function connectRabbit(
  url: string,
  logger?: Logger,
): Promise<RabbitConnection> {
  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });

  const publishEvent: EventPublisher = async (type, payload) => {
    const event: DomainEvent<typeof type> = {
      type,
      payload,
      occurredAt: new Date().toISOString(),
    };
    const buffer = Buffer.from(JSON.stringify(event));
    const ok = channel.publish(EVENTS_EXCHANGE, type, buffer, {
      contentType: "application/json",
      persistent: true,
    });
    if (!ok) {
      logger?.warn("rabbit publish buffer full, waiting for drain", { type });
      await new Promise<void>((resolve) => channel.once("drain", () => resolve()));
    }
  };

  return {
    publishEvent,
    async close() {
      await channel.close();
      await connection.close();
    },
  };
}
