import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  bundle: true,
  // Bundle ONLY the workspace packages (compiles their TS in). Every npm
  // dependency — including transitive ones pulled in via @m2cloud/shared and
  // @m2cloud/db (prom-client, jose, drizzle-orm, postgres, …) — stays EXTERNAL,
  // because several are CJS using dynamic require() that breaks when bundled
  // into ESM. They resolve from node_modules at runtime (and via `pnpm deploy`
  // in the Docker image).
  noExternal: [/^@m2cloud\//],
  external: [
    "fastify",
    "@fastify/cors",
    "ioredis",
    "amqplib",
    "bcryptjs",
    "drizzle-orm",
    "drizzle-orm/*",
    "postgres",
    "zod",
    "ws",
    "prom-client",
    "jose",
  ],
  clean: true,
  sourcemap: true,
  minify: false,
});
