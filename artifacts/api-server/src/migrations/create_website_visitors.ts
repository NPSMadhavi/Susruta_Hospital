import { pool } from "@workspace/db";

export async function ensureWebsiteVisitorsTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "website_visitors" (
        "id" SERIAL PRIMARY KEY,
        "visitor_id" VARCHAR(128) NOT NULL UNIQUE,
        "first_seen" TIMESTAMP NOT NULL DEFAULT NOW(),
        "last_seen" TIMESTAMP NOT NULL DEFAULT NOW(),
        "last_page" VARCHAR(500),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_website_visitors_last_seen" ON "website_visitors"("last_seen");
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_website_visitors_visitor_id" ON "website_visitors"("visitor_id");
    `);
  } catch (err: any) {
    console.error("⚠️ Failed to ensure website_visitors table:", err.message);
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
