// Standalone migration entrypoint, run as a Kubernetes Job inside the cluster
// (RDS is private, only reachable from within the VPC). Built by tsup to
// dist/migrate.js; the migration SQL ships in the image at ./migrations.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./migrations";

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder });
console.log(
  JSON.stringify({ level: "info", service: "migrate", msg: "migrations applied" }),
);
await sql.end();
process.exit(0);
