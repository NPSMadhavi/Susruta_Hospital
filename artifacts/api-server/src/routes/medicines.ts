import { Router } from "express";
import { db, medicinesTable } from "@workspace/db";
import { eq, desc, or, ilike, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

// Ensure table exists in PostgreSQL database on route load
async function ensureTableExists() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS medicines (
        id SERIAL PRIMARY KEY,
        medicine_id VARCHAR(50) NOT NULL UNIQUE,
        medicine_name VARCHAR(255) NOT NULL,
        dosage TEXT,
        frequency VARCHAR(100),
        formulation VARCHAR(100),
        properties TEXT,
        indications TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS indications TEXT;
    `);
  } catch (err) {
    console.error("⚠️ Failed to ensure medicines table exists:", err);
  }
}

ensureTableExists();

// Helper to generate consistent unique Medicine ID (AY-MED-XXXX)
async function generateMedicineId(): Promise<string> {
  await ensureTableExists();
  const records = await db.select({ medicineId: medicinesTable.medicineId, id: medicinesTable.id }).from(medicinesTable);
  
  let maxNum = 100; // Base so first medicine is AY-MED-0101
  for (const r of records) {
    if (r.medicineId) {
      const match = r.medicineId.match(/(?:AY-MED-|MED-)(\d+)/i);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }
  }
  
  const nextNum = maxNum + 1;
  return `AY-MED-${String(nextNum).padStart(4, "0")}`;
}

// ── GET /api/medicines/next-id — Pre-fetch next medicine ID ─
router.get("/next-id", async (_req, res) => {
  try {
    const nextId = await generateMedicineId();
    res.json({ nextId });
  } catch (err) {
    res.json({ nextId: "AY-MED-0101" });
  }
});

// ── GET /api/medicines — Retrieve all medicines ───────────────
router.get("/", async (req, res) => {
  try {
    await ensureTableExists();
    const query = typeof req.query.q === "string" ? req.query.q.trim() : (typeof req.query.search === "string" ? req.query.search.trim() : "");
    
    let medicines;
    if (query) {
      const q = `%${query}%`;
      medicines = await db
        .select()
        .from(medicinesTable)
        .where(
          or(
            ilike(medicinesTable.medicineName, q),
            ilike(medicinesTable.medicineId, q),
            ilike(medicinesTable.dosage, q),
            ilike(medicinesTable.formulation, q),
            ilike(medicinesTable.properties, q),
            ilike(medicinesTable.indications, q)
          )
        )
        .orderBy(desc(medicinesTable.id));
    } else {
      medicines = await db
        .select()
        .from(medicinesTable)
        .orderBy(desc(medicinesTable.id));
    }

    const formatted = medicines.map((m) => ({
      ...m,
      createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: m.updatedAt ? m.updatedAt.toISOString() : new Date().toISOString(),
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error("GET /api/medicines error:", error);
    res.status(500).json({ error: "server_error", message: "Failed to fetch medicines" });
  }
});

// ── POST /api/medicines/bulk — Bulk import medicines ─────────
router.post("/bulk", requireAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const { medicines: items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "validation_error", message: "Medicines list must be a non-empty array" });
      return;
    }

    const records = await db.select({ medicineId: medicinesTable.medicineId, id: medicinesTable.id }).from(medicinesTable);
    let maxNum = 100;
    for (const r of records) {
      if (r.medicineId) {
        const match = r.medicineId.match(/(?:AY-MED-|MED-)(\d+)/i);
        if (match && match[1]) {
          const parsed = parseInt(match[1], 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }

    const insertedRows = [];
    for (const item of items) {
      const name = (item.medicineName || item.name || "").trim();
      const dosage = (item.dosageAndFrequency || item.dosage || "").trim();
      const indications = (item.indications || "").trim();
      const frequency = (item.frequency || "").trim();
      const formulation = (item.formulation || "").trim();
      const properties = (item.properties || "").trim();

      if (!name) continue;

      maxNum++;
      const medicineId = `AY-MED-${String(maxNum).padStart(4, "0")}`;

      const [created] = await db
        .insert(medicinesTable)
        .values({
          medicineId,
          medicineName: name,
          dosage: dosage || "-",
          frequency: frequency || null,
          formulation: formulation || null,
          properties: properties || null,
          indications: indications || null,
        })
        .returning();

      if (created) {
        insertedRows.push(created);
      }
    }

    res.status(201).json({
      success: true,
      count: insertedRows.length,
      items: insertedRows.map((m) => ({
        ...m,
        createdAt: m.createdAt ? m.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: m.updatedAt ? m.updatedAt.toISOString() : new Date().toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("POST /api/medicines/bulk error:", error);
    res.status(500).json({ error: "server_error", message: "Failed to import medicines" });
  }
});

// ── POST /api/medicines — Create new medicine ────────────────
router.post("/", requireAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const { medicineName, dosageAndFrequency, dosage, frequency, formulation, properties, indications } = req.body;

    if (!medicineName || !medicineName.trim()) {
      res.status(400).json({ error: "validation_error", message: "Medicine Name is required" });
      return;
    }

    const finalDosage = (dosageAndFrequency || dosage || "").trim();
    if (!finalDosage) {
      res.status(400).json({ error: "validation_error", message: "Dosage & Frequency is required" });
      return;
    }

    const medicineId = await generateMedicineId();

    const [created] = await db
      .insert(medicinesTable)
      .values({
        medicineId,
        medicineName: medicineName.trim(),
        dosage: finalDosage,
        frequency: frequency?.trim() || null,
        formulation: formulation?.trim() || null,
        properties: properties?.trim() || null,
        indications: indications?.trim() || null,
      })
      .returning();

    res.status(201).json({
      ...created,
      createdAt: created.createdAt ? created.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: created.updatedAt ? created.updatedAt.toISOString() : new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("POST /api/medicines error:", error);
    res.status(500).json({ error: "server_error", message: "Failed to create medicine" });
  }
});

// ── PUT /api/medicines/:id — Update existing medicine ────────
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "invalid_id", message: "Invalid medicine ID" });
      return;
    }

    const { medicineName, dosageAndFrequency, dosage, frequency, formulation, properties, indications } = req.body;

    if (!medicineName || !medicineName.trim()) {
      res.status(400).json({ error: "validation_error", message: "Medicine Name is required" });
      return;
    }

    const finalDosage = (dosageAndFrequency !== undefined ? dosageAndFrequency : dosage || "").trim();
    if (!finalDosage) {
      res.status(400).json({ error: "validation_error", message: "Dosage & Frequency is required" });
      return;
    }

    const [updated] = await db
      .update(medicinesTable)
      .set({
        medicineName: medicineName.trim(),
        dosage: finalDosage,
        frequency: frequency?.trim() || null,
        formulation: formulation?.trim() || null,
        properties: properties?.trim() || null,
        indications: indications !== undefined ? (indications?.trim() || null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(medicinesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Medicine not found" });
      return;
    }

    res.json({
      ...updated,
      createdAt: updated.createdAt ? updated.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("PUT /api/medicines/:id error:", error);
    res.status(500).json({ error: "server_error", message: "Failed to update medicine" });
  }
});

// Also support PATCH /api/medicines/:id
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "invalid_id", message: "Invalid medicine ID" });
      return;
    }

    const { medicineName, dosageAndFrequency, dosage, frequency, formulation, properties, indications } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (medicineName !== undefined) updates.medicineName = medicineName.trim();
    if (dosageAndFrequency !== undefined) updates.dosage = dosageAndFrequency.trim();
    else if (dosage !== undefined) updates.dosage = dosage.trim();
    if (frequency !== undefined) updates.frequency = frequency?.trim() || null;
    if (formulation !== undefined) updates.formulation = formulation?.trim() || null;
    if (properties !== undefined) updates.properties = properties?.trim() || null;
    if (indications !== undefined) updates.indications = indications?.trim() || null;

    const [updated] = await db
      .update(medicinesTable)
      .set(updates)
      .where(eq(medicinesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Medicine not found" });
      return;
    }

    res.json({
      ...updated,
      createdAt: updated.createdAt ? updated.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("PATCH /api/medicines/:id error:", error);
    res.status(500).json({ error: "server_error", message: "Failed to update medicine" });
  }
});

// ── DELETE /api/medicines/:id — Delete medicine ──────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await ensureTableExists();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "invalid_id", message: "Invalid medicine ID" });
      return;
    }

    const [deleted] = await db
      .delete(medicinesTable)
      .where(eq(medicinesTable.id, id))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "not_found", message: "Medicine not found" });
      return;
    }

    res.status(200).json({ success: true, id });
  } catch (error: any) {
    console.error("DELETE /api/medicines/:id error:", error);
    res.status(500).json({ error: "server_error", message: "Failed to delete medicine" });
  }
});

export default router;
