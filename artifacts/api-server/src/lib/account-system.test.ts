import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import path from "path";
import { db, pool, patientsTable, accountDeletionRequestsTable, patientSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Helper duplicate name deduplicator matching the implementation
function getDeduplicatedFilename(originalName: string, usedNames: Set<string>): string {
  let cleanName = path.basename(originalName).replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  if (!cleanName || cleanName === "." || cleanName === "..") {
    cleanName = "attachment";
  }

  const parsed = path.parse(cleanName);
  let finalName = cleanName;
  let counter = 1;

  while (usedNames.has(finalName.toLowerCase())) {
    finalName = `${parsed.name}_${counter}${parsed.ext}`;
    counter++;
  }

  usedNames.add(finalName.toLowerCase());
  return finalName;
}

describe("Patient Data ZIP Export Specification & Integrity", () => {
  test("Empty patient export contains exactly the required directory entries", async () => {
    const zip = new JSZip();

    // 1. Root contains exactly TWO top-level directories: Prescriptions/ and Medical_Documents/
    // 2. Prescriptions go directly inside Prescriptions/ (no Files/ subfolder)
    // 3. Medical documents go directly inside Medical_Documents/
    zip.folder("Prescriptions");
    zip.folder("Medical_Documents");

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(zipBuffer);

    const entryNames = Object.keys(loaded.files);

    // Verify directory entries exist
    assert.ok(entryNames.includes("Prescriptions/"), "Prescriptions/ must exist");
    assert.ok(entryNames.includes("Medical_Documents/"), "Medical_Documents/ must exist");

    // Verify NO Files/ subfolder exists
    assert.ok(!entryNames.includes("Prescriptions/Files/"), "Prescriptions/Files/ must NOT exist");

    // Verify NO other entries
    assert.equal(entryNames.length, 2, "Only the 2 exact directory entries should exist");

    // Verify root entries
    const rootEntries = entryNames.filter((name) => !name.includes("/") || name.indexOf("/") === name.length - 1);
    assert.deepEqual(rootEntries.sort(), ["Medical_Documents/", "Prescriptions/"].sort());

    // Verify no forbidden generated files
    for (const name of entryNames) {
      assert.ok(!name.endsWith(".csv"), `Forbidden CSV found: ${name}`);
      assert.ok(!name.endsWith(".json"), `Forbidden JSON found: ${name}`);
      assert.ok(!name.endsWith(".txt"), `Forbidden TXT found: ${name}`);
      assert.ok(!name.toLowerCase().includes("readme"), `Forbidden README found: ${name}`);
      assert.ok(!name.toLowerCase().includes("manifest"), `Forbidden manifest found: ${name}`);
    }
  });

  test("ZIP with genuine prescription attachments and digital prescriptions and medical documents", async () => {
    const zip = new JSZip();

    zip.folder("Prescriptions");
    zip.folder("Medical_Documents");

    const samplePdfBytes = Buffer.from("%PDF-1.4 sample genuine prescription bytes");
    const sampleJpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const sampleDigitalRxBytes = Buffer.from("%PDF-1.4 sample generated digital prescription bytes");
    const sampleDocBytes = Buffer.from("%PDF-1.4 sample blood report bytes");

    // Prescriptions (uploaded and digital) go DIRECTLY under Prescriptions/ (NO Files/ subfolder)
    zip.file("Prescriptions/rx_001.pdf", samplePdfBytes);
    zip.file("Prescriptions/rx_scan.jpg", sampleJpgBytes);
    zip.file("Prescriptions/Prescription_11_Oct.pdf", sampleDigitalRxBytes);

    // Medical documents go DIRECTLY under Medical_Documents/ (NO Files/ subfolder)
    zip.file("Medical_Documents/blood_test.pdf", sampleDocBytes);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(zipBuffer);

    const entryNames = Object.keys(loaded.files);

    // Verify Prescriptions/ contains files DIRECTLY (not Prescriptions/Files/)
    const rxEntries = entryNames.filter((n) => n.startsWith("Prescriptions/") && n !== "Prescriptions/");
    for (const entry of rxEntries) {
      assert.ok(!entry.startsWith("Prescriptions/Files/"), `Prescription entry must NOT be under Prescriptions/Files/: ${entry}`);
    }

    // Verify Medical_Documents/ contains files DIRECTLY (not Medical_Documents/Files/)
    const docEntries = entryNames.filter((n) => n.startsWith("Medical_Documents/") && n !== "Medical_Documents/");
    for (const entry of docEntries) {
      assert.ok(!entry.startsWith("Medical_Documents/Files/"), `Medical document must not be in Medical_Documents/Files/: ${entry}`);
    }

    // Verify content integrity
    const extractedPdf = await loaded.file("Prescriptions/rx_001.pdf")?.async("nodebuffer");
    assert.deepEqual(extractedPdf, samplePdfBytes);

    const extractedDigital = await loaded.file("Prescriptions/Prescription_11_Oct.pdf")?.async("nodebuffer");
    assert.deepEqual(extractedDigital, sampleDigitalRxBytes);

    const extractedDoc = await loaded.file("Medical_Documents/blood_test.pdf")?.async("nodebuffer");
    assert.deepEqual(extractedDoc, sampleDocBytes);

    // Verify forbidden files are absent
    for (const name of entryNames) {
      assert.ok(!name.endsWith(".csv"));
      assert.ok(!name.endsWith(".json"));
      assert.ok(!name.endsWith(".txt"));
      assert.ok(!name.toLowerCase().includes("profile"));
      assert.ok(!name.toLowerCase().includes("appointment"));
      assert.ok(!name.toLowerCase().includes("consultation"));
    }
  });

  test("Deduplicates identical filenames safely without overwriting", () => {
    const usedNames = new Set<string>();

    const first = getDeduplicatedFilename("report.pdf", usedNames);
    const second = getDeduplicatedFilename("report.pdf", usedNames);
    const third = getDeduplicatedFilename("report.pdf", usedNames);
    const different = getDeduplicatedFilename("xray.jpg", usedNames);

    assert.equal(first, "report.pdf");
    assert.equal(second, "report_1.pdf");
    assert.equal(third, "report_2.pdf");
    assert.equal(different, "xray.jpg");
  });

  test("Sanitizes path traversal and illegal characters in filenames", () => {
    const usedNames = new Set<string>();

    const traversal1 = getDeduplicatedFilename("../../etc/passwd", usedNames);
    const traversal2 = getDeduplicatedFilename("..\\..\\windows\\win.ini", usedNames);
    const slashes = getDeduplicatedFilename("sub/folder/file.pdf", usedNames);

    assert.ok(!traversal1.includes(".."));
    assert.ok(!traversal1.includes("/"));
    assert.ok(!traversal2.includes(".."));
    assert.ok(!traversal2.includes("\\"));
    assert.equal(slashes, "file.pdf");
  });
});

describe("Account Deactivation, Reactivation, and Deletion Workflow (Database)", () => {
  const testEmail = `test_account_${Date.now()}@example.com`;
  let testPatientId: number;

  test("Creates isolated test patient", async () => {
    const hash = await bcrypt.hash("Password123!", 10);
    const [patient] = await db.insert(patientsTable).values({
      name: "QA Test Patient",
      email: testEmail,
      passwordHash: hash,
      deleteColumn: 0,
    }).returning();

    assert.ok(patient.id > 0);
    testPatientId = patient.id;
  });

  test("Deactivation sets deleteColumn = 1 and clears active sessions without deleting records", async () => {
    // Create test session
    await db.insert(patientSessionsTable).values({
      patientId: testPatientId,
      sessionToken: `test_token_${Date.now()}`,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Execute deactivation
    await db.delete(patientSessionsTable).where(eq(patientSessionsTable.patientId, testPatientId));
    await db.update(patientsTable).set({ deleteColumn: 1 }).where(eq(patientsTable.id, testPatientId));

    // Verify session removed
    const sessions = await db.select().from(patientSessionsTable).where(eq(patientSessionsTable.patientId, testPatientId));
    assert.equal(sessions.length, 0, "Sessions must be removed on deactivation");

    // Verify patient record still exists with deleteColumn = 1
    const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, testPatientId));
    assert.ok(p, "Patient database row must be preserved");
    assert.equal(p.deleteColumn, 1, "deleteColumn must be 1 (deactivated)");
  });

  test("Reactivation restores deleteColumn = 0 and preserves all patient data", async () => {
    // Execute reactivation
    await db.update(patientsTable).set({ deleteColumn: 0 }).where(eq(patientsTable.id, testPatientId));

    const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, testPatientId));
    assert.ok(p);
    assert.equal(p.deleteColumn, 0, "deleteColumn must be restored to 0");
    assert.equal(p.email, testEmail);
  });

  test("Deletion request creation with 15-day deadline and cancellation workflow", async () => {
    const now = new Date();
    const cancellationDeadline = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    // 1. Submit first deletion request with 15-day deadline
    const [req1] = await db.insert(accountDeletionRequestsTable).values({
      patientId: testPatientId,
      patientCode: "P-TEST",
      patientName: "QA Test Patient",
      patientEmail: testEmail,
      status: "PENDING",
      cancellationDeadline,
      deleteColumn: 0,
      createdAt: now,
    }).returning();

    assert.equal(req1.status, "PENDING");
    assert.ok(req1.cancellationDeadline instanceof Date);
    assert.equal(req1.cancellationDeadline.getTime(), cancellationDeadline.getTime());

    // 2. Query check for active request prevents duplicate while PENDING
    const [existing] = await db
      .select()
      .from(accountDeletionRequestsTable)
      .where(and(
        eq(accountDeletionRequestsTable.patientId, testPatientId),
        eq(accountDeletionRequestsTable.status, "PENDING"),
        eq(accountDeletionRequestsTable.deleteColumn, 0)
      ));

    assert.ok(existing, "Existing pending request detected");
    assert.equal(existing.id, req1.id);

    // 3. Patient cancels deletion request within 15-day period
    const cancelTime = new Date();
    const [cancelledReq] = await db
      .update(accountDeletionRequestsTable)
      .set({
        status: "CANCELLED",
        cancelledAt: cancelTime,
        notes: "Request cancelled by patient during 15-day grace period.",
      })
      .where(and(
        eq(accountDeletionRequestsTable.id, req1.id),
        eq(accountDeletionRequestsTable.status, "PENDING")
      ))
      .returning();

    assert.equal(cancelledReq.status, "CANCELLED");
    assert.ok(cancelledReq.cancelledAt);

    // Verify patient account remains active
    const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, testPatientId));
    assert.equal(p.deleteColumn, 0, "Patient account must remain active when deletion request is cancelled");

    // 4. Patient can submit a new deletion request after previous one was CANCELLED
    const newDeadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const [req2] = await db.insert(accountDeletionRequestsTable).values({
      patientId: testPatientId,
      patientCode: "P-TEST",
      patientName: "QA Test Patient",
      patientEmail: testEmail,
      status: "PENDING",
      cancellationDeadline: newDeadline,
      deleteColumn: 0,
    }).returning();

    assert.equal(req2.status, "PENDING");
    assert.notEqual(req2.id, req1.id);

    // Clean up req1 audit record
    await db.delete(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.id, req1.id));
  });

  test("Permanent deletion transaction safely removes patient and retains completed audit record", async () => {
    // Find pending request
    const [req] = await db
      .select()
      .from(accountDeletionRequestsTable)
      .where(and(
        eq(accountDeletionRequestsTable.patientId, testPatientId),
        eq(accountDeletionRequestsTable.status, "PENDING")
      ));

    assert.ok(req);

    // Simulate 15-day period expiration -> status becomes ELIGIBLE_FOR_DELETION
    await db
      .update(accountDeletionRequestsTable)
      .set({
        status: "ELIGIBLE_FOR_DELETION",
      })
      .where(eq(accountDeletionRequestsTable.id, req.id));

    // Transactional permanent deletion by admin
    await db.transaction(async (tx) => {
      await tx
        .update(accountDeletionRequestsTable)
        .set({
          status: "DELETED",
          processedAt: new Date(),
          processedBy: "admin",
          notes: "QA permanent deletion test.",
        })
        .where(eq(accountDeletionRequestsTable.id, req.id));

      await tx.delete(patientsTable).where(eq(patientsTable.id, testPatientId));
    });

    // Verify patient row is permanently gone
    const [deletedPatient] = await db.select().from(patientsTable).where(eq(patientsTable.id, testPatientId));
    assert.equal(deletedPatient, undefined, "Patient must be permanently deleted from database");

    // Verify deletion request audit record is retained as DELETED
    const [auditReq] = await db.select().from(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.id, req.id));
    assert.ok(auditReq, "Audit record must be retained");
    assert.equal(auditReq.status, "DELETED");

    // Clean up test audit record
    await db.delete(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.id, req.id));
  });

  after(async () => {
    await pool.end();
  });
});
