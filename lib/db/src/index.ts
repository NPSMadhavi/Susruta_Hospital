import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️ DATABASE_URL environment variable is not set. Using default: postgres://postgres:postgres@localhost:5432/susruta_hospital",
  );
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/susruta_hospital";

export const pool = new Pool({ connectionString });
pool.on("error", (err) => {
  console.error("⚠️ Database connection error:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
