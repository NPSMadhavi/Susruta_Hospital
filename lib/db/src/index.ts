import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const apiServerEnv = path.resolve(import.meta.dirname, "../../../artifacts/api-server/.env");
const rootEnv = path.resolve(import.meta.dirname, "../../../.env");

if (fs.existsSync(apiServerEnv)) {
  dotenv.config({ path: apiServerEnv });
}
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️ DATABASE_URL environment variable is not set. Using default: postgres://postgres:postgres@localhost:5432/susruta_hospital",
  );
}

const rawConnectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:5432/susruta_hospital";

// Replace @localhost: with @127.0.0.1: to prevent Node.js dual-stack IPv6 lookup delays
const connectionString = rawConnectionString.replace("@localhost:", "@127.0.0.1:");

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 20,
});
pool.on("error", (err) => {
  console.error("⚠️ Database connection error:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
