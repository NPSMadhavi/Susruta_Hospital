import { db, medicinesTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";

// Ensure table exists in PostgreSQL database
let tableEnsured = false;
export async function ensureTableExists() {
  if (tableEnsured) return;
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
        delete_column INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS indications TEXT;
      ALTER TABLE medicines ADD COLUMN IF NOT EXISTS delete_column INTEGER NOT NULL DEFAULT 0;
    `);
    tableEnsured = true;
  } catch (err) {
    console.error("⚠️ Failed to ensure medicines table exists:", err);
  }
}

// Helper to generate consistent unique Medicine ID (AY-MED-XXXX)
export async function generateMedicineId(): Promise<string> {
  await ensureTableExists();
  const records = await db
    .select({ medicineId: medicinesTable.medicineId, id: medicinesTable.id })
    .from(medicinesTable);

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

// In-process promise mutex per key to prevent concurrent duplicate inserts in the same Node process
const inFlightLocks = new Map<string, Promise<any>>();

export async function withMedicineLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (inFlightLocks.has(key)) {
    try {
      await inFlightLocks.get(key);
    } catch {}
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightLocks.delete(key);
    }
  })();

  inFlightLocks.set(key, promise);
  return await promise;
}

/**
 * Normalizes medicine name by trimming leading/trailing spaces and collapsing
 * multiple consecutive spaces into a single space.
 */
export function normalizeMedicineName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Checks whether a medicine exists in medicinesTable (case-insensitive and whitespace normalized).
 * Only active medicines (deleteColumn = 0) are considered.
 */
export async function findExistingMedicine(
  name: string
): Promise<{ id: number; medicineId: string; medicineName: string; dosage: string | null } | null> {
  const cleanName = normalizeMedicineName(name);
  if (!cleanName) return null;

  await ensureTableExists();

  // 1. Direct ILIKE search (case-insensitive exact match)
  const directMatches = await db
    .select({
      id: medicinesTable.id,
      medicineId: medicinesTable.medicineId,
      medicineName: medicinesTable.medicineName,
      dosage: medicinesTable.dosage,
    })
    .from(medicinesTable)
    .where(
      and(
        eq(medicinesTable.deleteColumn, 0),
        ilike(medicinesTable.medicineName, cleanName)
      )
    )
    .limit(1);

  if (directMatches.length > 0) {
    return directMatches[0];
  }

  // 2. Multi-space fallback search across active medicines
  // e.g. target is "Dolo 650", but DB had "Dolo   650"
  const allActive = await db
    .select({
      id: medicinesTable.id,
      medicineId: medicinesTable.medicineId,
      medicineName: medicinesTable.medicineName,
      dosage: medicinesTable.dosage,
    })
    .from(medicinesTable)
    .where(eq(medicinesTable.deleteColumn, 0));

  const targetLower = cleanName.toLowerCase();
  const match = allActive.find(
    (m) => m.medicineName && normalizeMedicineName(m.medicineName).toLowerCase() === targetLower
  );

  return match || null;
}

/**
 * Creates a new medicine in medicinesTable with duplicate prevention and race-condition safety.
 */
export async function createNewMedicine({
  medicineName,
  dosage,
}: {
  medicineName: string;
  dosage?: string | null;
}): Promise<{ id: number; medicineId: string; medicineName: string }> {
  const cleanName = normalizeMedicineName(medicineName);
  if (!cleanName) {
    throw new Error("Medicine name cannot be empty");
  }

  await ensureTableExists();

  const lockKey = cleanName.toLowerCase();
  return await withMedicineLock(lockKey, async () => {
    // Double-check inside mutex
    const existing = await findExistingMedicine(cleanName);
    if (existing) {
      return { id: existing.id, medicineId: existing.medicineId, medicineName: existing.medicineName };
    }

    // Try up to 3 times to handle race conditions or ID collisions
    for (let attempt = 0; attempt < 3; attempt++) {
      const nextMedId = await generateMedicineId();
      try {
        const [created] = await db
          .insert(medicinesTable)
          .values({
            medicineId: nextMedId,
            medicineName: cleanName,
            dosage: dosage?.trim() || "-",
            deleteColumn: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({
            id: medicinesTable.id,
            medicineId: medicinesTable.medicineId,
            medicineName: medicinesTable.medicineName,
          });

        if (created) {
          return created;
        }
      } catch (_err) {
        // Concurrency or unique constraint hit: check if another worker just inserted it
        const existingAfterErr = await findExistingMedicine(cleanName);
        if (existingAfterErr) {
          return {
            id: existingAfterErr.id,
            medicineId: existingAfterErr.medicineId,
            medicineName: existingAfterErr.medicineName,
          };
        }
      }
    }

    // Final fallback check
    const finalCheck = await findExistingMedicine(cleanName);
    if (finalCheck) {
      return {
        id: finalCheck.id,
        medicineId: finalCheck.medicineId,
        medicineName: finalCheck.medicineName,
      };
    }

    throw new Error(`Failed to create medicine "${cleanName}" due to concurrent conflict.`);
  });
}

/**
 * Core resolver that processes parsed digital prescription formulationRows.
 * Works with pluggable finder and creator functions for testability and separation of concerns.
 */
export async function resolveMedicinesPayload(
  parsed: any,
  finder: (name: string) => Promise<{ id: number; medicineId: string; medicineName: string; dosage?: string | null } | null>,
  creator: (name: string, dosage?: string | null) => Promise<{ id: number; medicineId: string; medicineName: string }>
): Promise<{ modified: boolean; payload: any }> {
  if (!parsed || !Array.isArray(parsed.formulationRows) || parsed.formulationRows.length === 0) {
    return { modified: false, payload: parsed };
  }

  let modified = false;
  // Request-level cache so identical medicines inside the same prescription share the same resolved ID
  const sessionCache = new Map<string, { id: number; medicineId: string }>();

  for (const row of parsed.formulationRows) {
    if (!row || !Array.isArray(row.medicines)) continue;

    for (const med of row.medicines) {
      if (!med || typeof med.name !== "string") continue;
      const cleanName = normalizeMedicineName(med.name);
      if (!cleanName) continue;

      const cacheKey = cleanName.toLowerCase();

      // 1. Session cache check
      if (sessionCache.has(cacheKey)) {
        const cached = sessionCache.get(cacheKey)!;
        if (med.medicineId !== cached.medicineId || med.medicineDbId !== cached.id) {
          med.medicineId = cached.medicineId;
          med.medicineDbId = cached.id;
          modified = true;
        }
        continue;
      }

      // 2. Look up existing active medicine by normalized name
      const existing = await finder(cleanName);

      if (existing) {
        sessionCache.set(cacheKey, { id: existing.id, medicineId: existing.medicineId });
        if (med.medicineId !== existing.medicineId || med.medicineDbId !== existing.id) {
          med.medicineId = existing.medicineId;
          med.medicineDbId = existing.id;
          modified = true;
        }
        // CRITICAL DATA SEPARATION RULE:
        // Master record is NEVER modified even if doctor edited med.dosage or row timing on prescription.
        continue;
      }

      // 3. Medicine does NOT exist in master table: automatically create it!
      const created = await creator(
        cleanName,
        typeof med.dosage === "string" && med.dosage.trim() ? med.dosage.trim() : null
      );

      sessionCache.set(cacheKey, { id: created.id, medicineId: created.medicineId });
      med.medicineId = created.medicineId;
      med.medicineDbId = created.id;
      modified = true;
    }
  }

  return { modified, payload: parsed };
}

/**
 * Scans a prescription's notes JSON string. For all medicines in formulationRows:
 * 1. Checks if each medicine exists in medicinesTable (case-insensitive + normalized whitespace).
 * 2. If it exists: attaches medicineId and medicineDbId.
 *    CRITICAL DATA SEPARATION RULE: The existing master record in medicinesTable is NEVER updated!
 * 3. If it does NOT exist: creates the medicine in medicinesTable and attaches its new medicineId.
 * 4. Preserves Combined Sets and single medicines alike.
 * 5. Returns the updated JSON notes string.
 */
export async function resolvePrescriptionMedicines(
  rawNotes: string | null | undefined
): Promise<string> {
  if (!rawNotes || typeof rawNotes !== "string") {
    return rawNotes ?? "";
  }

  const trimmed = rawNotes.trim();
  if (!trimmed.startsWith("{")) {
    return rawNotes;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return rawNotes;
  }

  const { modified, payload } = await resolveMedicinesPayload(
    parsed,
    findExistingMedicine,
    (name, dosage) => createNewMedicine({ medicineName: name, dosage })
  );

  if (modified) {
    return JSON.stringify(payload);
  }

  return rawNotes;
}
