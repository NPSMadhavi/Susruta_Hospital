import { pool } from "@workspace/db";

const TABLES = [
  "testimonials",
  "medicines",
  "subscribers",
  "appointments",
  "online_appointments",
  "patients",
  "patient_documents",
  "prescriptions",
  "donations",
  "online_slot_sessions",
  "online_slots",
  "blocked_dates",
  "custom_day_timings",
  "open_months",
  "direct_calls",
  "medicine_orders",
  "medicine_order_items",
];

export async function runMigration() {
  console.log("Starting soft delete migration...");
  const client = await pool.connect();
  try {
    for (const table of TABLES) {
      // 1. Add column if not exists
      await client.query(`
        ALTER TABLE "${table}" 
        ADD COLUMN IF NOT EXISTS delete_column INTEGER NOT NULL DEFAULT 0;
      `);

      // 2. Ensure existing nulls (if any) are 0
      await client.query(`
        UPDATE "${table}" SET delete_column = 0 WHERE delete_column IS NULL;
      `);

      // 3. Add CHECK constraint if not exists
      const constraintName = `${table}_delete_column_check`;
      const checkExists = await client.query(`
        SELECT 1 FROM pg_constraint WHERE conname = $1;
      `, [constraintName]);

      if (checkExists.rowCount === 0) {
        await client.query(`
          ALTER TABLE "${table}" 
          ADD CONSTRAINT "${constraintName}" CHECK (delete_column IN (0, 1));
        `);
      }

      // 4. Create index on delete_column
      const indexName = `idx_${table}_delete_column`;
      await client.query(`
        CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}"(delete_column);
      `);

      console.log(`✓ Table [${table}] updated with delete_column (DEFAULT 0, CHECK IN (0, 1)) and index.`);
    }

    console.log("Soft delete migration completed successfully!");
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("add_soft_delete.ts")) {
  runMigration()
    .then(() => {
      console.log("Migration finished.");
      return pool.end();
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
