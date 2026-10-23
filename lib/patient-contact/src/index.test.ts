import assert from "node:assert/strict";
import test from "node:test";
import { normalizePatientEmail, validatePatientPhone, detectCountryFromPhone, validatePatientPassword, checkPasswordRequirements } from "./index";

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

test("detects country from phone numbers accurately", () => {
  assert.equal(detectCountryFromPhone("+919876543210")?.code, "IN");
  assert.equal(detectCountryFromPhone("+918768768768")?.code, "IN");
  assert.equal(detectCountryFromPhone("9876543210")?.code, "IN");
  assert.equal(detectCountryFromPhone("+971501234567")?.code, "AE");
  assert.equal(detectCountryFromPhone("+12025550123")?.code, "US");
  assert.equal(detectCountryFromPhone("+447911123456")?.code, "GB");
  assert.equal(detectCountryFromPhone("+6581234567")?.code, "SG");
  assert.equal(detectCountryFromPhone("+966501234567")?.code, "SA");
  assert.equal(detectCountryFromPhone(""), undefined);
  assert.equal(detectCountryFromPhone(null), undefined);
});

test("normalizes and rejects malformed email addresses", () => {
  assert.equal(normalizePatientEmail("  Patient@Example.COM "), "patient@example.com");
  assert.equal(normalizePatientEmail("patient@example"), null);
  assert.equal(normalizePatientEmail("patient @example.com"), null);
  assert.equal(normalizePatientEmail("patient..name@example.com"), null);
  assert.equal(normalizePatientEmail("patient()@example.com"), null);
  assert.equal(normalizePatientEmail("patient<>@example.com"), null);
});

test("validates patient password complexity requirements", () => {
  // Valid passwords
  const valid1 = validatePatientPassword("Password123!");
  assert.equal(valid1.valid, true);
  assert.equal(valid1.status.allValid, true);

  const valid2 = validatePatientPassword("Susruta@2024");
  assert.equal(valid2.valid, true);
  assert.equal(valid2.status.allValid, true);

  const valid3 = validatePatientPassword("Pass#1");
  assert.equal(valid3.valid, true);
  assert.equal(valid3.status.allValid, true);

  const valid4 = validatePatientPassword("Admin$99");
  assert.equal(valid4.valid, true);

  // Missing first letter capital (starts with lowercase)
  const noFirstCap = validatePatientPassword("password123!");
  assert.equal(noFirstCap.valid, false);
  if (!noFirstCap.valid) {
    assert.equal(noFirstCap.error, "first_capital");
    assert.match(noFirstCap.message, /start with a capital letter/);
  }

  // Starts with number instead of capital letter
  const startsWithNumber = validatePatientPassword("1Password@");
  assert.equal(startsWithNumber.valid, false);
  if (!startsWithNumber.valid) {
    assert.equal(startsWithNumber.error, "first_capital");
  }

  // Starts with symbol instead of capital letter
  const startsWithSymbol = validatePatientPassword("@Password123");
  assert.equal(startsWithSymbol.valid, false);
  if (!startsWithSymbol.valid) {
    assert.equal(startsWithSymbol.error, "first_capital");
  }

  // Missing small letters
  const noSmall = validatePatientPassword("PASSWORD123!");
  assert.equal(noSmall.valid, false);
  if (!noSmall.valid) {
    assert.equal(noSmall.error, "lowercase");
    assert.match(noSmall.message, /small letters/);
  }

  // Missing numbers
  const noNumber = validatePatientPassword("Password@!");
  assert.equal(noNumber.valid, false);
  if (!noNumber.valid) {
    assert.equal(noNumber.error, "number");
    assert.match(noNumber.message, /numbers/);
  }

  // Missing symbols
  const noSymbol = validatePatientPassword("Password123");
  assert.equal(noSymbol.valid, false);
  if (!noSymbol.valid) {
    assert.equal(noSymbol.error, "symbol");
    assert.match(noSymbol.message, /symbol/);
  }

  // Spaces do not count as symbols
  const spaceNotSymbol = validatePatientPassword("Password 123");
  assert.equal(spaceNotSymbol.valid, false);
  if (!spaceNotSymbol.valid) {
    assert.equal(spaceNotSymbol.error, "symbol");
  }

  // Too short (< 6 characters) with other requirements satisfied
  const tooShort = validatePatientPassword("Pas@1");
  assert.equal(tooShort.valid, false);
  if (!tooShort.valid) {
    assert.equal(tooShort.error, "min_length");
    assert.match(tooShort.message, /6 characters/);
  }

  // Empty password
  const empty = validatePatientPassword("");
  assert.equal(empty.valid, false);
  if (!empty.valid) {
    assert.equal(empty.error, "required");
  }
});

test("checkPasswordRequirements computes individual breakdown accurately", () => {
  const reqs = checkPasswordRequirements("Pass@1");
  assert.equal(reqs.firstCapital, true);
  assert.equal(reqs.lowercase, true);
  assert.equal(reqs.number, true);
  assert.equal(reqs.symbol, true);
  assert.equal(reqs.minLength, true);
  assert.equal(reqs.allValid, true);

  const reqsPartial = checkPasswordRequirements("pa");
  assert.equal(reqsPartial.firstCapital, false);
  assert.equal(reqsPartial.lowercase, true);
  assert.equal(reqsPartial.number, false);
  assert.equal(reqsPartial.symbol, false);
  assert.equal(reqsPartial.minLength, false);
  assert.equal(reqsPartial.allValid, false);
});
