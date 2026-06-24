/**
 * Typed contract for the RabbitMQ event bus, shared between the gateway
 * (producer) and the worker (consumer). Single source of truth for routing
 * keys and payload shapes.
 */
export const EVENTS_EXCHANGE = "events";

export const ROUTING_KEYS = ["post.created", "comment.created", "vote.cast"] as const;
export type RoutingKey = (typeof ROUTING_KEYS)[number];

export interface PostCreatedPayload {
  postId: string;
  roomId: string;
  authorId: string;
  title: string;
}

export interface CommentCreatedPayload {
  commentId: string;
  postId: string;
  authorId: string;
  body: string;
}

export interface VoteCastPayload {
  targetType: "post" | "comment";
  targetId: string;
  userId: string;
  value: 1 | -1;
}

export interface DomainEventPayloadMap {
  "post.created": PostCreatedPayload;
  "comment.created": CommentCreatedPayload;
  "vote.cast": VoteCastPayload;
}

export interface DomainEvent<K extends RoutingKey = RoutingKey> {
  type: K;
  payload: DomainEventPayloadMap[K];
  occurredAt: string;
}

/** Publisher function signature implemented by the gateway's RabbitMQ adapter. */
export type EventPublisher = <K extends RoutingKey>(
  type: K,
  payload: DomainEventPayloadMap[K],
) => Promise<void>;
