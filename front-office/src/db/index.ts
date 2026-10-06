import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction — services accept either. */
export type Tx = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __afoPool?: Pool; __afoDb?: DB };

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  return url;
}

export function getPool(): Pool {
  if (!globalForDb.__afoPool) {
    globalForDb.__afoPool = new Pool({ connectionString: connectionString(), max: 10 });
  }
  return globalForDb.__afoPool;
}

export function getDb(): DB {
  if (!globalForDb.__afoDb) globalForDb.__afoDb = drizzle(getPool(), { schema });
  return globalForDb.__afoDb;
}

/** Lazily-initialised shared handle. */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    return Reflect.get(getDb() as object, prop);
  },
});

export { schema };
