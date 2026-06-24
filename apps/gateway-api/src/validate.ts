import type { FastifyReply } from "fastify";
import type { z } from "@m2cloud/shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the string is a syntactically valid UUID. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Parse `body` with a zod schema. On failure sends a 400 with the flattened
 * issues and returns undefined so the caller can early-return.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  reply: FastifyReply,
): z.infer<T> | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({
      error: "Invalid request body",
      issues: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return undefined;
  }
  return result.data;
}
