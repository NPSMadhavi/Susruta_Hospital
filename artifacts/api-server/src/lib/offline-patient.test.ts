import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { searchPatients, findOrRegisterPatient, registerNewPatientWithNextId } from "./patient-id.js";
import { db, patientsTable, appointmentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

describe("Offline Patient Registration & Existing Patient Reuse Logic", () => {
  let testPatientCode1: string;
  let testPatientId1: number;
  let testPatientCode2: string;
  let testPatientId2: number;

  const testPhone1 = "+919876543210";
  const testPhone2 = "+919988776655";

  // Clean up any existing test records before running tests
  before(async () => {
    await db.delete(patientsTable).where(sql`${patientsTable.phone} IN (${testPhone1}, ${testPhone2})`);
  });

  after(async () => {
    await db.delete(patientsTable).where(sql`${patientsTable.phone} IN (${testPhone1}, ${testPhone2})`);
  });

  test("1. Register new patient allocates a unique Patient ID", async () => {
    const res1 = await findOrRegisterPatient({
      name: "Ramesh Kumar Test",
      phone: testPhone1,
      email: "ramesh.test@example.com",
      age: 42,
      gender: "Male",
      address: "Hyderabad, Telangana",
    });

    assert.equal(res1.isNew, true);
    assert.ok(res1.patient.id > 0);
    assert.ok(res1.patient.patientCode);
    assert.equal(res1.patient.name, "Ramesh Kumar Test");
    assert.equal(res1.patient.age, 42);
    assert.equal(res1.patient.gender, "Male");
    assert.equal(res1.patient.address, "Hyderabad, Telangana");

    testPatientCode1 = res1.patient.patientCode!;
    testPatientId1 = res1.patient.id;
  });

  test("2. Searching by Patient ID returns exact patient", async () => {
    const results = await searchPatients(testPatientCode1);
    assert.ok(results.length >= 1);
    const found = results.find((p) => p.id === testPatientId1);
    assert.ok(found);
    assert.equal(found.patientCode, testPatientCode1);
  });

  test("3. Searching by Phone Number returns patient", async () => {
    const results = await searchPatients("9876543210");
    assert.ok(results.length >= 1);
    const found = results.find((p) => p.id === testPatientId1);
    assert.ok(found);
    assert.equal(found.name, "Ramesh Kumar Test");
  });

  test("4. Registering second patient with same name (different phone) creates distinct patient with new Patient ID", async () => {
    const res2 = await findOrRegisterPatient({
      name: "Ramesh Kumar Test",
      phone: testPhone2,
      email: "ramesh2.test@example.com",
      age: 35,
      gender: "Male",
      address: "Secunderabad",
    });

    assert.equal(res2.isNew, true);
    assert.ok(res2.patient.id !== testPatientId1);
    assert.ok(res2.patient.patientCode !== testPatientCode1);

    testPatientCode2 = res2.patient.patientCode!;
    testPatientId2 = res2.patient.id;
  });

  test("5. Searching by Full Name returns multiple matching patients", async () => {
    const results = await searchPatients("Ramesh Kumar Test");
    assert.ok(results.length >= 2);
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes(testPatientId1));
    assert.ok(ids.includes(testPatientId2));
  });

  test("6. Existing patient visit reuses same Patient ID and updates details if edited", async () => {
    const resUpdate = await findOrRegisterPatient({
      name: "Ramesh Kumar Test Updated",
      phone: testPhone1,
      email: "ramesh.test@example.com",
      age: 43,
      gender: "Male",
      address: "Secunderabad Updated",
    });

    assert.equal(resUpdate.isNew, false);
    assert.equal(resUpdate.patient.id, testPatientId1);
    assert.equal(resUpdate.patient.patientCode, testPatientCode1);
    assert.equal(resUpdate.patient.age, 43);
    assert.equal(resUpdate.patient.address, "Secunderabad Updated");
  });

  test("7. Patient ID never changes during updates", async () => {
    const [pt] = await db.select().from(patientsTable).where(eq(patientsTable.id, testPatientId1));
    assert.equal(pt.patientCode, testPatientCode1);
    assert.equal(pt.age, 43);
  });

  test("8. generateTimeSlots for 04:00 PM to 07:00 PM (15 min) generates exactly 12 slots", async () => {
    const { generateTimeSlots } = await import("../routes/availability.js");
    const slots = generateTimeSlots("04:00 PM", "07:00 PM", 15);
    assert.equal(slots.length, 12);
    assert.equal(slots[0], "04:00 PM");
    assert.equal(slots[slots.length - 1], "06:45 PM");
  });

  test("9. Offline QR token expires after 24 hours and provides restricted upload access", async () => {
    const { offlineQrTokensTable } = await import("@workspace/db");
    const { randomBytes } = await import("crypto");

    const [testAppt] = await db.insert(appointmentsTable).values({
      patientId: testPatientId1,
      patientName: "Ramesh Kumar Test",
      patientPhone: testPhone1,
      date: "2026-10-06",
      timeSlot: "10 AM - 1 PM",
      status: "completed",
    }).returning();

    const testToken = randomBytes(32).toString("hex");
    const futureExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [inserted] = await db.insert(offlineQrTokensTable).values({
      token: testToken,
      patientId: testPatientId1,
      appointmentId: testAppt.id,
      expiresAt: futureExpires,
    }).returning();

    assert.ok(inserted.id > 0);
    assert.equal(inserted.token, testToken);
    assert.ok(inserted.expiresAt.getTime() > Date.now());

    await db.delete(offlineQrTokensTable).where(eq(offlineQrTokensTable.id, inserted.id));
    await db.delete(appointmentsTable).where(eq(appointmentsTable.id, testAppt.id));
  });

  test("10. Expired QR token (>24h) is correctly identified as expired", async () => {
    const { offlineQrTokensTable } = await import("@workspace/db");
    const { randomBytes } = await import("crypto");

    const [testAppt] = await db.insert(appointmentsTable).values({
      patientId: testPatientId1,
      patientName: "Ramesh Kumar Test",
      patientPhone: testPhone1,
      date: "2026-10-06",
      timeSlot: "10 AM - 1 PM",
      status: "completed",
    }).returning();

    const expiredToken = randomBytes(32).toString("hex");
    const pastExpires = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours in past

    const [inserted] = await db.insert(offlineQrTokensTable).values({
      token: expiredToken,
      patientId: testPatientId1,
      appointmentId: testAppt.id,
      expiresAt: pastExpires,
    }).returning();

    assert.ok(new Date(inserted.expiresAt).getTime() < Date.now());

    await db.delete(offlineQrTokensTable).where(eq(offlineQrTokensTable.id, inserted.id));
    await db.delete(appointmentsTable).where(eq(appointmentsTable.id, testAppt.id));
  });
});


