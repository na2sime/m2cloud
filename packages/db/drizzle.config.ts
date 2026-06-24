import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://m2cloud:m2cloud@localhost:5432/m2cloud",
  },
  verbose: true,
  strict: true,
});
