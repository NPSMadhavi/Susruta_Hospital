import { pool } from "@workspace/db";

/**
 * Ensures that the `donations` table exists and contains all required columns,
 * constraints, and performance indexes.
 *
 * This migration runs automatically on application startup to guarantee schema
 * synchronization across local development and production environments (e.g. Plesk).
 */
export async function ensureDonationsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Create table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS "donations" (
        "id" SERIAL PRIMARY KEY,
        "patient_id" INTEGER NOT NULL,
        "appointment_id" INTEGER,
        "patient_code" VARCHAR(10),
        "patient_name" VARCHAR(255),
        "patient_email" VARCHAR(255),
        "amount" VARCHAR(20) NOT NULL,
        "last_six_digits" VARCHAR(6) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "thank_you_sent" BOOLEAN NOT NULL DEFAULT false,
        "is_seen" BOOLEAN NOT NULL DEFAULT false,
        "seen_at" TIMESTAMP WITH TIME ZONE,
        "delete_column" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure every column exists (in case table was created from an older schema)
    const requiredColumns: string[] = [
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "patient_id" INTEGER;`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "appointment_id" INTEGER;`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "patient_code" VARCHAR(10);`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "patient_name" VARCHAR(255);`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "patient_email" VARCHAR(255);`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "amount" VARCHAR(20) NOT NULL DEFAULT '0';`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "last_six_digits" VARCHAR(6) NOT NULL DEFAULT '';`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'pending';`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "thank_you_sent" BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "is_seen" BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "seen_at" TIMESTAMP WITH TIME ZONE;`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "delete_column" INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE "donations" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();`,
    ];

    for (const ddl of requiredColumns) {
      await client.query(ddl);
    }

    // 3. Clean up any existing NULLs for non-nullable logical fields
    await client.query(`
      UPDATE "donations" SET "delete_column" = 0 WHERE "delete_column" IS NULL;
      UPDATE "donations" SET "is_seen" = false WHERE "is_seen" IS NULL;
      UPDATE "donations" SET "thank_you_sent" = false WHERE "thank_you_sent" IS NULL;
      UPDATE "donations" SET "status" = 'pending' WHERE "status" IS NULL;
    `);

    // 4. Ensure CHECK constraint on delete_column
    const checkRes = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'donations_delete_column_check';
    `);
    if (checkRes.rowCount === 0) {
      await client.query(`
        ALTER TABLE "donations"
        ADD CONSTRAINT "donations_delete_column_check" CHECK (delete_column IN (0, 1));
      `);
    }

    // 5. Ensure performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_donations_delete_column" ON "donations"("delete_column");
      CREATE INDEX IF NOT EXISTS "idx_donations_created_at" ON "donations"("created_at");
      CREATE INDEX IF NOT EXISTS "idx_donations_is_seen" ON "donations"("is_seen");
      CREATE INDEX IF NOT EXISTS "idx_donations_patient_id" ON "donations"("patient_id");
    `);

    console.log("✓ Donations table verified with full column schema and indexes.");
  } catch (err: any) {
    console.error("⚠️ Failed to ensure donations table:", err?.message || err);
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("ensure_donations_table.ts")) {
  ensureDonationsTable()
    .then(() => {
      console.log("ensure_donations_table completed.");
      return pool.end();
    })
    .catch((err) => {
      console.error("ensure_donations_table failed:", err);
      process.exit(1);
    });
}
