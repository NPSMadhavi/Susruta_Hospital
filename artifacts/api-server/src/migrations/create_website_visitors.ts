import { pool } from "@workspace/db";

/**
 * Migration to ensure `website_visitors` and `visitor_days` tables exist
 * with correct presence architecture, timestamptz data types, and performance indexes.
 *
 * Runs automatically on server startup. Fully idempotent and non-destructive.
 */
export async function ensureWebsiteVisitorsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. Ensure website_visitors table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "website_visitors" (
        "id" SERIAL PRIMARY KEY,
        "visitor_id" VARCHAR(128) NOT NULL UNIQUE,
        "first_seen" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "last_seen" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "last_heartbeat" TIMESTAMP WITH TIME ZONE,
        "last_page" VARCHAR(500),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Ensure last_heartbeat column exists if table previously existed without it
    await client.query(`
      ALTER TABLE "website_visitors" ADD COLUMN IF NOT EXISTS "last_heartbeat" TIMESTAMP WITH TIME ZONE;
    `);

    // 3. Migrate timestamp columns to timestamptz safely if created earlier without timezone
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'website_visitors' 
            AND column_name = 'first_seen' 
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "website_visitors" 
            ALTER COLUMN "first_seen" TYPE TIMESTAMP WITH TIME ZONE USING "first_seen" AT TIME ZONE 'UTC',
            ALTER COLUMN "last_seen" TYPE TIMESTAMP WITH TIME ZONE USING "last_seen" AT TIME ZONE 'UTC',
            ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC',
            ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE USING "updated_at" AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `);

    // 4. Ensure presence and activity indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_website_visitors_last_seen" ON "website_visitors"("last_seen");
      CREATE INDEX IF NOT EXISTS "idx_website_visitors_last_heartbeat" ON "website_visitors"("last_heartbeat");
    `);

    // 5. Clean up redundant index if present (visitor_id already has a unique constraint index)
    await client.query(`
      DROP INDEX IF EXISTS "idx_website_visitors_visitor_id";
    `);

    // 6. Ensure dedicated visitor_days table exists for daily unique visitor tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS "visitor_days" (
        "visitor_id" VARCHAR(128) NOT NULL,
        "day_ist" DATE NOT NULL,
        "first_seen" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("visitor_id", "day_ist")
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_visitor_days_day_ist" ON "visitor_days"("day_ist");
    `);

    // 7. Safe non-destructive backfill of visitor_days from historical website_visitors
    await client.query(`
      INSERT INTO "visitor_days" ("visitor_id", "day_ist", "first_seen")
      SELECT 
        "visitor_id", 
        ("last_seen" AT TIME ZONE 'Asia/Kolkata')::date AS "day_ist",
        "last_seen" AS "first_seen"
      FROM "website_visitors"
      ON CONFLICT ("visitor_id", "day_ist") DO NOTHING;
    `);

    console.log("✅ website_visitors and visitor_days schema verified successfully.");
  } catch (err: any) {
    console.error("⚠️ Failed to ensure website_visitors / visitor_days table:", err.message);
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("create_website_visitors.ts")) {
  ensureWebsiteVisitorsTable()
    .then(() => {
      console.log("website_visitors migration finished.");
      return pool.end();
    })
    .catch((err) => {
      console.error("website_visitors migration failed:", err);
      process.exit(1);
    });
}
