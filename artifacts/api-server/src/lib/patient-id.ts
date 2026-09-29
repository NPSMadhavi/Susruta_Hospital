import { db, siteSettingsTable, patientsTable, type Patient } from "@workspace/db";
import { eq, sql, or } from "drizzle-orm";

export function getNextPrefix(prefix: string): string | null {
  const chars = (prefix || "A").toUpperCase().trim().split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] < "Z") {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      for (let j = i + 1; j < chars.length; j++) {
        chars[j] = "A";
      }
      return chars.join("");
    }
  }
  if (chars.length < 3) {
    return "A".repeat(chars.length + 1);
  }
  return null;
}

export function getMaxNumberForPrefix(prefix: string): number {
  if (prefix.length === 1) return 999;
  if (prefix.length === 2) return 99;
  return 9;
}

export function formatPatientCode(prefix: string, num: number): string {
  const padLength = prefix.length === 1 ? 3 : prefix.length === 2 ? 2 : 1;
  return `${prefix}${num.toString().padStart(padLength, "0")}`;
}

export function computeNextPatientId(prefix: string, currentNum: number): string {
  const p = (prefix || "A").toUpperCase().trim() || "A";
  const maxNum = getMaxNumberForPrefix(p);
  let nextNum = currentNum + 1;
  let nextPrefix: string | null = p;

  if (nextNum > maxNum) {
    nextPrefix = getNextPrefix(p);
    nextNum = 1;
  }

  if (!nextPrefix) {
    return "No next Patient ID";
  }

  return formatPatientCode(nextPrefix, nextNum);
}

export interface NewPatientInput {
  name: string;
  age?: number | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  passwordHash?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
}

/**
 * Atomically allocates the next Patient ID and inserts the brand-new patient
 * inside the EXACT SAME database transaction with row-level locking (FOR UPDATE).
 * If insertion fails, the entire transaction rolls back and the counter is NOT consumed.
 */
export async function registerNewPatientWithNextId(
  patientData: NewPatientInput
): Promise<Patient> {
  return await db.transaction(async (tx) => {
    // 1. Lock the site_settings row with FOR UPDATE
    const rows = await tx.execute(
      sql`SELECT id, patient_id_prefix, patient_id_current_number FROM site_settings LIMIT 1 FOR UPDATE`
    );
    const settings = rows.rows[0] as any;
    if (!settings) {
      throw new Error("Site settings row not found. Please ensure initial settings exist.");
    }

    let prefix = (settings.patient_id_prefix || "A").toUpperCase().trim();
    let num = (parseInt(settings.patient_id_current_number, 10) || 0) + 1;
    let maxNum = getMaxNumberForPrefix(prefix);

    if (num > maxNum) {
      const nextP = getNextPrefix(prefix);
      if (!nextP) {
        throw new Error("Patient ID sequence limit reached (ZZZ9). No more Patient IDs can be generated.");
      }
      prefix = nextP;
      num = 1;
      maxNum = getMaxNumberForPrefix(prefix);
    }

    let patientCode = formatPatientCode(prefix, num);

    // Guard against collision with any pre-existing records (e.g. manually imported IDs)
    while (true) {
      const existingCode = await tx.execute(
        sql`SELECT id FROM patients WHERE patient_code = ${patientCode} LIMIT 1`
      );
      if (existingCode.rows.length === 0) {
        break;
      }
      num++;
      if (num > maxNum) {
        const nextP = getNextPrefix(prefix);
        if (!nextP) {
          throw new Error("Patient ID sequence limit reached (ZZZ9). No more Patient IDs can be generated.");
        }
        prefix = nextP;
        num = 1;
        maxNum = getMaxNumberForPrefix(prefix);
      }
      patientCode = formatPatientCode(prefix, num);
    }

    // 2. Insert NEW patient with the allocated Patient ID
    const [patient] = await tx
      .insert(patientsTable)
      .values({
        name: patientData.name.trim(),
        age: patientData.age ?? null,
        gender: patientData.gender ? patientData.gender.trim() : null,
        phone: patientData.phone ? patientData.phone.trim() : null,
        email: patientData.email ? patientData.email.trim().toLowerCase() : null,
        address: patientData.address ? patientData.address.trim() : null,
        passwordHash: patientData.passwordHash ?? null,
        avatarUrl: patientData.avatarUrl ?? null,
        emailVerified: patientData.emailVerified ?? false,
        patientCode,
      })
      .returning();

    // 3. Update the counter to record the newly assigned number
    await tx.execute(
      sql`UPDATE site_settings SET patient_id_prefix = ${prefix}, patient_id_current_number = ${num}, updated_at = NOW() WHERE id = ${settings.id}`
    );

    return patient;
  });
}

/**
 * Searches for an existing registered patient by 10-digit phone number or email.
 */
export async function findExistingPatientByPhoneOrEmail(
  phone?: string | null,
  email?: string | null
): Promise<Patient | null> {
  const conditions = [];

  if (phone) {
    const cleanDigits = phone.replace(/\D/g, "").slice(-10);
    if (cleanDigits.length === 10) {
      conditions.push(
        sql`regexp_replace(${patientsTable.phone}, '\\D', '', 'g') LIKE '%' || ${cleanDigits}`
      );
    }
  }

  if (email && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    conditions.push(sql`lower(${patientsTable.email}) = ${cleanEmail}`);
  }

  if (conditions.length === 0) return null;

  const [existing] = await db
    .select()
    .from(patientsTable)
    .where(or(...conditions))
    .limit(1);

  return existing ?? null;
}

/**
 * Finds an existing patient or registers a new patient.
 * If the patient already exists: returns existing patient without touching the counter.
 * If brand-new: allocates the next Patient ID and updates the counter in the same transaction.
 */
export async function findOrRegisterPatient({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string;
  email?: string | null;
}): Promise<{ patient: Patient; isNew: boolean }> {
  const existing = await findExistingPatientByPhoneOrEmail(phone, email);
  if (existing) {
    if (phone && phone.startsWith("+91") && (!existing.phone || !existing.phone.startsWith("+"))) {
      await db.update(patientsTable).set({ phone }).where(eq(patientsTable.id, existing.id));
      existing.phone = phone;
    }
    if (email && email.trim() && !existing.email) {
      const cleanEmail = email.trim().toLowerCase();
      await db.update(patientsTable).set({ email: cleanEmail }).where(eq(patientsTable.id, existing.id));
      existing.email = cleanEmail;
    }
    if (!existing.patientCode) {
      // Legacy record missing patient code: assign one atomically
      const allocated = await registerNewPatientWithNextId({
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        emailVerified: existing.emailVerified,
      });
      return { patient: allocated, isNew: false };
    }
    return { patient: existing, isNew: false };
  }

  // Brand-new patient: allocate next Patient ID and increment counter
  const newPatient = await registerNewPatientWithNextId({
    name,
    phone,
    email: email ?? null,
    emailVerified: false,
  });

  return { patient: newPatient, isNew: true };
}

/**
 * Validates a requested manual counter setting in Admin Settings.
 * Ensures that the Next Patient ID calculated from the requested setting
 * does NOT collide with any existing patient record.
 */
export async function validateManualCounterSetting(
  prefix: string,
  currentNum: number
): Promise<{ valid: boolean; error?: string; nextCode: string }> {
  const p = (prefix || "A").toUpperCase().trim();
  const maxNum = getMaxNumberForPrefix(p);

  if (currentNum < 0 || isNaN(currentNum)) {
    return {
      valid: false,
      error: "Current Number must be a valid non-negative integer.",
      nextCode: "",
    };
  }

  if (currentNum > maxNum) {
    return {
      valid: false,
      error: `Current Number cannot exceed ${maxNum} for prefix ${p}.`,
      nextCode: "",
    };
  }

  const nextCode = computeNextPatientId(p, currentNum);

  if (nextCode === "No next Patient ID") {
    return { valid: true, nextCode };
  }

  const [collision] = await db
    .select({ id: patientsTable.id, name: patientsTable.name, patientCode: patientsTable.patientCode })
    .from(patientsTable)
    .where(eq(patientsTable.patientCode, nextCode))
    .limit(1);

  if (collision) {
    return {
      valid: false,
      error: `Next Patient ID "${nextCode}" is already assigned to patient "${collision.name}". Please choose a different counter number to prevent duplicate IDs.`,
      nextCode,
    };
  }

  return { valid: true, nextCode };
}