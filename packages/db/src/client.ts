import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Create a Drizzle database instance bound to a postgres-js connection pool.
 * One instance per service process.
 */
export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return db;
}

export type Database = ReturnType<typeof createDb>;
