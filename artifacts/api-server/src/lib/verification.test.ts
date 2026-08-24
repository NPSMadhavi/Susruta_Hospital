import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeVerificationEmail,
  verificationEmailMatchesPatient,
} from "./verification";

test("an old link cannot verify an address changed by an administrator", () => {
  const oldEmail = "patient@old.example";
  const replacementEmail = " Patient@New.Example ";
  const emailChanged = !verificationEmailMatchesPatient(oldEmail, replacementEmail);
  const updatedPatient = {
    email: normalizeVerificationEmail(replacementEmail),
    emailVerified: emailChanged ? false : true,
  };

  assert.equal(emailChanged, true);
  assert.equal(updatedPatient.emailVerified, false);
  assert.equal(
    verificationEmailMatchesPatient(oldEmail, updatedPatient.email),
    false,
  );
  assert.equal(
    verificationEmailMatchesPatient(replacementEmail, updatedPatient.email),
    true,
  );
  assert.equal(normalizeVerificationEmail(replacementEmail), "patient@new.example");
});