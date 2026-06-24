import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { users } from "@m2cloud/db";
import { signToken, z } from "@m2cloud/shared";
import type { AppDeps } from "../types.js";
import { parseBody } from "../validate.js";

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(50),
  password: z.string().min(6).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(row: { id: string; username: string; email: string }) {
  return { id: row.id, username: row.username, email: row.email };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post("/api/auth/register", async (req, reply) => {
    const body = parseBody(registerSchema, req.body, reply);
    if (!body) return;

    const existing = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.email, body.email), eq(users.username, body.username)))
      .limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: "Email or username already in use" });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    let inserted;
    try {
      [inserted] = await deps.db
        .insert(users)
        .values({ email: body.email, username: body.username, passwordHash })
        .returning();
    } catch {
      // Race on the unique constraint between the check and the insert.
      return reply.code(409).send({ error: "Email or username already in use" });
    }

    const token = await signToken(
      { sub: inserted.id, username: inserted.username },
      deps.jwtSecret,
    );
    return reply.code(201).send({ token, user: publicUser(inserted) });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = parseBody(loginSchema, req.body, reply);
    if (!body) return;

    const [row] = await deps.db
      .select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (!row) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(body.password, row.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = await signToken(
      { sub: row.id, username: row.username },
      deps.jwtSecret,
    );
    return reply.code(200).send({ token, user: publicUser(row) });
  });
}
