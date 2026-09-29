import assert from "node:assert/strict";
import test from "node:test";
import { normalizePatientEmail, validatePatientPhone } from "./index";

test("accepts an Indian local number and normalizes it to E.164", () => {
  assert.deepEqual(validatePatientPhone("9876543210", "IN"), {
    valid: true,
    e164: "+919876543210",
    countryCode: "IN",
  });
  assert.deepEqual(validatePatientPhone("7032588765", "IN"), {
    valid: true,
    e164: "+917032588765",
    countryCode: "IN",
  });
});

test("accepts an already-normalized Indian E.164 number idempotently", () => {
  assert.deepEqual(validatePatientPhone("+917032588765", "IN"), {
    valid: true,
    e164: "+917032588765",
    countryCode: "IN",
  });
  assert.deepEqual(validatePatientPhone("+919876543210", "IN"), {
    valid: true,
    e164: "+919876543210",
    countryCode: "IN",
  });
});

test("rejects invalid Indian numbers (too short, too long, invalid start digit)", () => {
  assert.equal(validatePatientPhone("703258876", "IN").valid, false);
  assert.equal(validatePatientPhone("70325887651", "IN").valid, false);
  assert.equal(validatePatientPhone("1234567890", "IN").valid, false);
  assert.equal(validatePatientPhone("5032588765", "IN").valid, false);
  assert.equal(validatePatientPhone("+911234567890", "IN").valid, false);
  assert.equal(validatePatientPhone("+915032588765", "IN").valid, false);
  assert.equal(validatePatientPhone("+91703258876", "IN").valid, false);
  assert.equal(validatePatientPhone("+9170325887651", "IN").valid, false);
});

test("accepts an eight-digit Singapore number", () => {
  assert.deepEqual(validatePatientPhone("81234567", "SG"), {
    valid: true,
    e164: "+6581234567",
    countryCode: "SG",
  });
});

test("rejects an incomplete Singapore number", () => {
  const result = validatePatientPhone("8123456", "SG");
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.message, /8 digits/);
});

test("uses country-specific rules for a representative international number", () => {
  assert.equal(validatePatientPhone("2025550123", "US").valid, true);
});

test("normalizes and rejects malformed email addresses", () => {
  assert.equal(normalizePatientEmail("  Patient@Example.COM "), "patient@example.com");
  assert.equal(normalizePatientEmail("patient@example"), null);
  assert.equal(normalizePatientEmail("patient @example.com"), null);
  assert.equal(normalizePatientEmail("patient..name@example.com"), null);
  assert.equal(normalizePatientEmail("patient()@example.com"), null);
  assert.equal(normalizePatientEmail("patient<>@example.com"), null);
});