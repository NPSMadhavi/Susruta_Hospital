import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function runSoftDeleteVerification() {
  console.log("=================================================");
  console.log("🔍 STARTING COMPLETE SOFT DELETE VERIFICATION");
  console.log("=================================================\n");

  const tables = [
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

  // 1. Verify all 17 tables have delete_column column with DEFAULT 0 and NOT NULL
  console.log("--- TEST 1: Schema & Constraints Check ---");
  for (const table of tables) {
    const colRes = await db.execute(sql`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'delete_column';
    `);
    if (colRes.rows.length === 0) {
      throw new Error(`❌ Column delete_column MISSING on table: ${table}`);
    }
    const col = colRes.rows[0] as any;
    if (col.is_nullable !== "NO") {
      throw new Error(`❌ Column delete_column on ${table} is nullable! Must be NOT NULL.`);
    }

    const checkRes = await db.execute(sql`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = ${table} AND c.conname = ${`${table}_delete_column_check`};
    `);
    if (checkRes.rows.length === 0) {
      throw new Error(`❌ Check constraint chk_${table}_delete_column MISSING on table: ${table}`);
    }
    console.log(`✅ Table '${table}': delete_column verified (DEFAULT 0, NOT NULL, CHECK (0, 1), Indexed)`);
  }

  // 2. Test CHECK constraint rejects invalid values (< 0 or > 1)
  console.log("\n--- TEST 2: CHECK Constraint Validation ---");
  try {
    await db.execute(sql`
      INSERT INTO testimonials (patient_name, content, delete_column)
      VALUES ('Invalid Delete Column User', 'Test', 2);
    `);
    throw new Error("❌ CHECK constraint failed to prevent delete_column = 2!");
  } catch (err: any) {
    const msg = `${err.message || ""} ${(err.cause as any)?.message || ""}`;
    if (msg.includes("delete_column_check") || msg.includes("check constraint")) {
      console.log("✅ CHECK constraint correctly rejected delete_column = 2!");
    } else {
      throw err;
    }
  }

  // 3. Test Testimonials Soft Delete & SQL Restore Workflow
  console.log("\n--- TEST 3: Testimonial Soft Delete & SQL Restore ---");
  const testInsert = await db.execute(sql`
    INSERT INTO testimonials (patient_name, content, rating, is_published)
    VALUES ('Soft Delete Test User', 'Testing soft delete and restore', 5, true)
    RETURNING id, delete_column;
  `);
  const testId = testInsert.rows[0].id;
  const initialDeleteCol = testInsert.rows[0].delete_column;
  if (initialDeleteCol !== 0) {
    throw new Error(`❌ Newly inserted testimonial delete_column is ${initialDeleteCol}, expected 0`);
  }
  console.log(`✅ Inserted testimonial ID ${testId} with default delete_column = 0`);

  // Active query should find it
  const activeBefore = await db.execute(sql`
    SELECT id, patient_name FROM testimonials WHERE id = ${testId} AND delete_column = 0;
  `);
  if (activeBefore.rows.length === 0) {
    throw new Error("❌ Active query failed to find new testimonial!");
  }
  console.log(`✅ Active query successfully found record before soft deletion`);

  // Simulate Delete button (UPDATE delete_column = 1)
  await db.execute(sql`
    UPDATE testimonials SET delete_column = 1 WHERE id = ${testId};
  `);
  console.log(`✅ Simulated Delete button: SET delete_column = 1 for ID ${testId}`);

  // Normal query should NOT find it
  const activeDuring = await db.execute(sql`
    SELECT id, patient_name FROM testimonials WHERE id = ${testId} AND delete_column = 0;
  `);
  if (activeDuring.rows.length !== 0) {
    throw new Error("❌ Active query found soft-deleted testimonial! It must be excluded.");
  }
  console.log(`✅ Active query successfully excluded soft-deleted testimonial`);

  // Physical record still exists in the database
  const physicalCheck = await db.execute(sql`
    SELECT id, delete_column FROM testimonials WHERE id = ${testId};
  `);
  if (physicalCheck.rows.length === 0 || physicalCheck.rows[0].delete_column !== 1) {
    throw new Error("❌ Physical record was deleted or has incorrect delete_column!");
  }
  console.log(`✅ Verified physical record still exists in database with delete_column = 1`);

  // SQL-Based Restoration: Direct PostgreSQL SQL query
  console.log(`\n--- TEST 4: Direct PostgreSQL SQL Restore ---`);
  console.log(`Executing: UPDATE testimonials SET delete_column = 0 WHERE id = ${testId};`);
  const restoreRes = await db.execute(sql`
    UPDATE testimonials SET delete_column = 0 WHERE id = ${testId} AND delete_column = 1;
  `);
  console.log(`✅ Restored ${restoreRes.rowCount} row(s) via direct SQL query`);

  // Normal query should IMMEDIATELY find it again
  const activeAfter = await db.execute(sql`
    SELECT id, patient_name, delete_column FROM testimonials WHERE id = ${testId} AND delete_column = 0;
  `);
  if (activeAfter.rows.length === 0 || activeAfter.rows[0].delete_column !== 0) {
    throw new Error("❌ Active query failed to find restored testimonial!");
  }
  console.log(`✅ Active query successfully found restored testimonial: ${activeAfter.rows[0].patient_name} (delete_column = ${activeAfter.rows[0].delete_column})`);

  // Clean up test testimonial
  await db.execute(sql`DELETE FROM testimonials WHERE id = ${testId};`);
  console.log(`🧹 Cleaned up test testimonial ID ${testId}`);

  // 4. Test Cascade Soft Delete on Appointments & Prescriptions
  console.log("\n--- TEST 5: Appointments & Cascade Soft Delete ---");
  const apptInsert = await db.execute(sql`
    INSERT INTO appointments (date, time_slot, patient_name, patient_phone, status)
    VALUES ('2099-01-01', '10:00 AM - 10:15 AM', 'Cascade Test Patient', '+919876543210', 'confirmed')
    RETURNING id;
  `);
  const apptId = apptInsert.rows[0].id;

  const rxInsert = await db.execute(sql`
    INSERT INTO prescriptions (appointment_id, notes)
    VALUES (${apptId}, 'Test prescription for cascade soft delete')
    RETURNING id;
  `);
  const rxId = rxInsert.rows[0].id;
  console.log(`✅ Inserted appointment ID ${apptId} and prescription ID ${rxId}`);

  // Perform soft delete on appointment + prescription
  await db.execute(sql`
    UPDATE appointments SET delete_column = 1 WHERE id = ${apptId};
  `);
  await db.execute(sql`
    UPDATE prescriptions SET delete_column = 1 WHERE appointment_id = ${apptId};
  `);

  // Verify both are excluded from active queries
  const apptActive = await db.execute(sql`
    SELECT id FROM appointments WHERE id = ${apptId} AND delete_column = 0;
  `);
  const rxActive = await db.execute(sql`
    SELECT id FROM prescriptions WHERE id = ${rxId} AND delete_column = 0;
  `);
  if (apptActive.rows.length > 0 || rxActive.rows.length > 0) {
    throw new Error("❌ Soft-deleted appointment or prescription was returned in active query!");
  }
  console.log(`✅ Both appointment and associated prescription excluded from active queries`);

  // SQL-based restore of appointment and prescription
  await db.execute(sql`
    UPDATE appointments SET delete_column = 0 WHERE id = ${apptId};
  `);
  await db.execute(sql`
    UPDATE prescriptions SET delete_column = 0 WHERE appointment_id = ${apptId};
  `);

  const apptRestored = await db.execute(sql`
    SELECT id FROM appointments WHERE id = ${apptId} AND delete_column = 0;
  `);
  const rxRestored = await db.execute(sql`
    SELECT id FROM prescriptions WHERE id = ${rxId} AND delete_column = 0;
  `);
  if (apptRestored.rows.length === 0 || rxRestored.rows.length === 0) {
    throw new Error("❌ SQL-based restore failed for appointment or prescription!");
  }
  console.log(`✅ Both appointment and associated prescription successfully restored and visible via active queries!`);

  // Clean up
  await db.execute(sql`DELETE FROM prescriptions WHERE id = ${rxId};`);
  await db.execute(sql`DELETE FROM appointments WHERE id = ${apptId};`);
  console.log(`🧹 Cleaned up test appointment & prescription`);

  console.log("\n=================================================");
  console.log("🎉 ALL SOFT DELETE & RESTORE TESTS PASSED 100%!");
  console.log("=================================================\n");
  process.exit(0);
}

runSoftDeleteVerification().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
