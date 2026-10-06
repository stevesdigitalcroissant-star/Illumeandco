import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { seedPlans } from "../src/server/services/billing";

export async function runMigrations(url: string) {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await runMigrations(url);
  // Pricing lives in the database so it can be changed without a deploy.
  await seedPlans();
  console.log("✓ migrations applied, plans ensured");
  process.exit(0);
}
