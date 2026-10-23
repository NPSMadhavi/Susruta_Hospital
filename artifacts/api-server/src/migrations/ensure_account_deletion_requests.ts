import { pool } from "@workspace/db";

/**
 * Ensures that the `account_deletion_requests` table exists and contains all required columns,
 * constraints, and performance indexes.
 */
export async function ensureAccountDeletionRequestsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Create table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
        "id" SERIAL PRIMARY KEY,
        "patient_id" INTEGER REFERENCES "patients"("id") ON DELETE SET NULL,
        "patient_code" VARCHAR(20),
        "patient_name" VARCHAR(255) NOT NULL DEFAULT '',
        "patient_email" VARCHAR(255) NOT NULL DEFAULT '',
        "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        "reason" TEXT,
        "cancellation_deadline" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "processed_by" VARCHAR(100),
        "notes" TEXT,
        "delete_column" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure columns exist
    const requiredColumns: string[] = [
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "patient_id" INTEGER REFERENCES "patients"("id") ON DELETE SET NULL;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "patient_code" VARCHAR(20);`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "patient_name" VARCHAR(255) NOT NULL DEFAULT '';`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "patient_email" VARCHAR(255) NOT NULL DEFAULT '';`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING';`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "reason" TEXT;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "cancellation_deadline" TIMESTAMP WITH TIME ZONE;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP WITH TIME ZONE;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP WITH TIME ZONE;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "processed_by" VARCHAR(100);`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "delete_column" INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE "account_deletion_requests" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();`,
    ];

    for (const ddl of requiredColumns) {
      await client.query(ddl);
    }

    // 3. Ensure defaults / no nulls / backfill cancellation deadline
    await client.query(`
      UPDATE "account_deletion_requests" SET "delete_column" = 0 WHERE "delete_column" IS NULL;
      UPDATE "account_deletion_requests" SET "status" = 'PENDING' WHERE "status" IS NULL;
      UPDATE "account_deletion_requests" 
      SET "cancellation_deadline" = "created_at" + INTERVAL '15 days' 
      WHERE "cancellation_deadline" IS NULL;
      UPDATE "account_deletion_requests"
      SET "status" = 'ELIGIBLE_FOR_DELETION'
      WHERE "status" = 'PENDING' AND "cancellation_deadline" <= NOW();
    `);

    // 4. Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_patient_id" ON "account_deletion_requests"("patient_id");
      CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_status" ON "account_deletion_requests"("status");
      CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_delete_column" ON "account_deletion_requests"("delete_column");
      CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_cancellation_deadline" ON "account_deletion_requests"("cancellation_deadline");
    `);

    console.log("✓ Table [account_deletion_requests] verified and ready.");
  } catch (err) {
    console.error("⚠️ Failed to ensure account_deletion_requests table:", err);
  } finally {
    client.release();
  }
}
