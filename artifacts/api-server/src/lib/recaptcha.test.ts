import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  verifyRecaptchaToken,
  isTokenReplayed,
  clearSeenTokensForTest,
  verifyRecaptcha,
} from "./recaptcha";

// Mock global fetch for testing
const originalFetch = global.fetch;

beforeEach(() => {
  clearSeenTokensForTest();
  process.env.RECAPTCHA_SECRET_KEY = "test-secret-key";
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "localhost,testkey.google.com";
  process.env.RECAPTCHA_MIN_SCORE = "0.5";
  delete process.env.RECAPTCHA_BYPASS;
  global.fetch = originalFetch;
});

test("verifyRecaptchaToken rejects missing, null, or empty token", async () => {
  const resultEmpty = await verifyRecaptchaToken("");
  assert.equal(resultEmpty.success, false);
  assert.match(resultEmpty.reason || "", /missing or empty/i);

  const resultUndefined = await verifyRecaptchaToken(undefined);
  assert.equal(resultUndefined.success, false);

  const resultWhitespace = await verifyRecaptchaToken("   ");
  assert.equal(resultWhitespace.success, false);
});

test("isTokenReplayed detects and prevents replay/duplicate tokens", () => {
  const token = "unique-test-token-12345";
  assert.equal(isTokenReplayed(token), false); // first use: allowed
  assert.equal(isTokenReplayed(token), true);  // second use: rejected
});

test("verifyRecaptchaToken rejects replayed token", async () => {
  const token = "replayed-token-xyz";
  isTokenReplayed(token); // Mark as seen

  const result = await verifyRecaptchaToken(token, "patient_login");
  assert.equal(result.success, false);
  assert.match(result.reason || "", /already been used/i);
});

test("verifyRecaptchaToken rejects when Google returns success: false", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await verifyRecaptchaToken("token-fail", "patient_login");
  assert.equal(result.success, false);
  assert.match(result.reason || "", /invalid-input-response/i);
  assert.deepEqual(result.errorCodes, ["invalid-input-response"]);
});

test("verifyRecaptchaToken rejects when action mismatches", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        score: 0.9,
        action: "wrong_action",
        hostname: "localhost",
        challenge_ts: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await verifyRecaptchaToken("token-action-mismatch", "expected_action");
  assert.equal(result.success, false);
  assert.match(result.reason || "", /action mismatch/i);
});

test("verifyRecaptchaToken rejects when hostname is not allowed", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        score: 0.9,
        action: "patient_login",
        hostname: "malicious-site.com",
        challenge_ts: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await verifyRecaptchaToken(
    "token-wrong-host",
    "patient_login",
    undefined,
    { allowedHostnames: ["localhost", "susrutahospital.com"] }
  );
  assert.equal(result.success, false);
  assert.match(result.reason || "", /not in approved hostnames/i);
});

test("verifyRecaptchaToken rejects when score is below minimum threshold", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        score: 0.2, // Below 0.5
        action: "patient_login",
        hostname: "localhost",
        challenge_ts: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await verifyRecaptchaToken(
    "token-low-score",
    "patient_login",
    undefined,
    { minScore: 0.5 }
  );
  assert.equal(result.success, false);
  assert.match(result.reason || "", /below required threshold/i);
});

test("verifyRecaptchaToken rejects expired token older than 3 minutes", async () => {
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();

  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        score: 0.9,
        action: "patient_login",
        hostname: "localhost",
        challenge_ts: fourMinutesAgo,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await verifyRecaptchaToken("token-expired", "patient_login");
  assert.equal(result.success, false);
  assert.match(result.reason || "", /token has expired/i);
});

test("verifyRecaptchaToken accepts valid token with good score and matching parameters", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        score: 0.9,
        action: "patient_login",
        hostname: "localhost",
        challenge_ts: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const result = await verifyRecaptchaToken("token-valid-100", "patient_login");
  assert.equal(result.success, true);
  assert.equal(result.score, 0.9);
  assert.equal(result.action, "patient_login");
  assert.equal(result.hostname, "localhost");
});

test("verifyRecaptcha Express middleware blocks invalid request and sends 400", async () => {
  const middleware = verifyRecaptcha("patient_login");

  let statusCalledWith = 0;
  let jsonCalledWith: any = null;
  let nextCalled = false;

  const req: any = {
    headers: {},
    body: {},
  };
  const res: any = {
    status(code: number) {
      statusCalledWith = code;
      return this;
    },
    json(payload: any) {
      jsonCalledWith = payload;
    },
  };
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);

  assert.equal(statusCalledWith, 400);
  assert.equal(jsonCalledWith?.error, "recaptcha_failed");
  assert.equal(nextCalled, false);
});

test("verifyRecaptcha Express middleware accepts token via x-recaptcha-token header and calls next", async () => {
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        score: 0.8,
        action: "patient_login",
        hostname: "localhost",
        challenge_ts: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  const middleware = verifyRecaptcha("patient_login");

  let nextCalled = false;
  const req: any = {
    headers: { "x-recaptcha-token": "valid-header-token-abc" },
    body: {},
  };
  const res: any = {
    status() { return this; },
    json() {},
  };
  const next = () => {
    nextCalled = true;
  };

  await middleware(req, res, next);

  assert.equal(nextCalled, true);
  assert.equal(req.recaptcha?.success, true);
  assert.equal(req.recaptcha?.score, 0.8);
});
