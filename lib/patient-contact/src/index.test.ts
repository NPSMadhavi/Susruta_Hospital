import assert from "node:assert/strict";
import test from "node:test";
import { normalizePatientEmail, validatePatientPhone } from "./index";

test("accepts an Indian local number and normalizes it to E.164", () => {
  assert.deepEqual(validatePatientPhone("9876543210", "IN"), {
    valid: true,
    e164: "+919876543210",
    countryCode: "IN",
  });
});

test("rejects an incomplete Indian number", () => {
  const result = validatePatientPhone("987654321", "IN");
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.message, /10 digits/);
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