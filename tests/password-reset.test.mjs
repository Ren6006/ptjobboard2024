// Contract tests for the deployed `sendPasswordReset` callable.
//
// These run against the REAL deployed function, because the bug this guards
// against only appears against real Identity Toolkit: an unknown address comes
// back as HTTP 200 with no oobLink, which the Admin SDK raises as a generic
// auth/internal-error. An emulator does not reproduce that.
//
// Run (name the file; `node --test tests/` does not resolve on Node 22 here):
//   node --test tests/password-reset.test.mjs
//
// By default nothing is emailed to a real person: every address used is one
// that does not exist. To also exercise a genuine delivery, pass an address
// you own, which WILL receive a real reset email and consume the cooldown:
//   RESET_TEST_REAL_EMAIL=you@hwemail.com node --test tests/password-reset.test.mjs
// or in PowerShell:
//   $env:RESET_TEST_REAL_EMAIL="you@hwemail.com"; node --test tests/password-reset.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

const ENDPOINT =
  process.env.RESET_TEST_ENDPOINT ||
  "https://us-central1-ptjobboard2024.cloudfunctions.net/sendPasswordReset";

// Addresses on the allowed domains that are not expected to have accounts.
const UNKNOWN_A = "no-such-tutor-aaa0@hwemail.com";
const UNKNOWN_B = "no-such-tutor-bbb0@hw.com";

async function callReset(email) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { email } }),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

test("rejects a non-school domain", async () => {
  const { status, body } = await callReset("someone@example.com");
  assert.equal(status, 400);
  assert.equal(body?.error?.status, "INVALID_ARGUMENT");
});

test("rejects an empty address", async () => {
  const { status, body } = await callReset("");
  assert.equal(status, 400);
  assert.equal(body?.error?.status, "INVALID_ARGUMENT");
});

test("rejects an address that only looks like a school one", async () => {
  const { status } = await callReset("attacker@nothwemail.com.evil.test");
  assert.equal(status, 400);
});

test("an unknown school address reports success and sends nothing", async () => {
  // Regression guard. This returned 500 before 2026-09-20, which let anyone
  // tell a real account from a fake one.
  const { status, body } = await callReset(UNKNOWN_A);
  assert.equal(status, 200);
  assert.deepEqual(body?.result, { ok: true });
});

test("unknown addresses are indistinguishable from each other", async () => {
  const a = await callReset(UNKNOWN_A);
  const b = await callReset(UNKNOWN_B);
  assert.equal(a.status, b.status);
  assert.deepEqual(a.body?.result, b.body?.result);
});

test("a repeat request is throttled but still reports success", async () => {
  // The cooldown must not be observable: a throttled call looks like a sent one.
  const first = await callReset(UNKNOWN_B);
  const second = await callReset(UNKNOWN_B);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(second.body?.result, { ok: true });
});

test(
  "a real address is accepted and indistinguishable from an unknown one",
  { skip: process.env.RESET_TEST_REAL_EMAIL ? false : "set RESET_TEST_REAL_EMAIL to run" },
  async () => {
    const real = await callReset(process.env.RESET_TEST_REAL_EMAIL);
    const fake = await callReset(UNKNOWN_A);
    assert.equal(real.status, 200);
    assert.deepEqual(real.body?.result, { ok: true });
    // The whole point: the response cannot be used to tell the two apart.
    assert.equal(real.status, fake.status);
    assert.deepEqual(real.body?.result, fake.body?.result);
  }
);
