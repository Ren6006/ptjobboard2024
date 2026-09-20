# Testing

## What exists

`tests/password-reset.test.mjs` — contract tests for the deployed `sendPasswordReset` callable.
Node's built-in test runner, no dependencies, no `package.json` required.

**That is the only automated test in this repo.** Everything else has been verified by hand.

## Running it

```powershell
node --test tests/password-reset.test.mjs
```

Name the file. `node --test tests/` does not resolve on Node 22 here.

Six checks run by default and **email nobody**, because every address they use has no account:

| Check | Guards |
| --- | --- |
| Non-school domain rejected | Domain allowlist |
| Empty address rejected | Input validation |
| Lookalike domain rejected | `@nothwemail.com.evil.test` must not pass the regex |
| Unknown address returns `200 ok:true` | **The enumeration regression.** See below |
| Two unknown addresses are indistinguishable | Same |
| Repeat request still returns `200 ok:true` | The cooldown must not be observable |

A seventh check is skipped unless you opt in, because it sends a **real email to a real person**
and consumes that address's cooldown:

```powershell
$env:RESET_TEST_REAL_EMAIL="you@hwemail.com"; node --test tests/password-reset.test.mjs
```

All seven passed on 2026-09-20.

## Why these run against production

They hit the **deployed** function, not an emulator, and that is deliberate. The bug they guard
against only appears against real Identity Toolkit: an unknown address comes back as HTTP 200
with no `oobLink`, which the Admin SDK raises as `auth/internal-error`. The emulator does not
reproduce it, so an emulator test would have passed while the leak was live.

The trade-off is that these tests need network and touch production. They are safe to run
repeatedly: the default addresses have no accounts, so nothing is emailed, and the only side
effect is a few `PasswordResetThrottle` documents holding timestamps.

## The regression they protect

`sendPasswordReset` briefly returned **500 for unknown addresses and 200 for real ones**, which
let anyone use the public reset form to discover which tutors have accounts. Every non-validation
outcome must return an identical `200 {"ok":true}` — sent, throttled and unknown alike. If a
change makes any of those distinguishable, these tests fail. Do not "fix" them by loosening the
assertion. Background in [EMAIL.md](EMAIL.md#the-ooblink-gotcha).

## What has no coverage

- **Firestore security rules.** Nothing. This matters: a privilege-escalation bug was found in
  these rules during the 2026-09 review, where any signed-in user could grant themselves an admin
  role or approve their own classes. A rules suite using `@firebase/rules-unit-testing` against
  the emulator is the single highest-value test to add.
- **The five other email functions.** No automated coverage. Note the blast radius warning in
  [EMAIL.md](EMAIL.md#who-sends-mail) before testing `onTutoringRequestCreated` with real data.
- **Every page in `public/`.** No automated coverage.

## A caution about this file

Earlier versions of the status document credited a "41-test" Firestore rules suite, a "17-check"
Playwright run and a "13 of 13" emulator run. **None of those files were ever in this repo.**
They lived in session scratchpads and are gone, so nothing they claimed can be re-verified.

If you write a test worth citing, commit it. A test that is not in the repo does not exist, and
citing one in a document is worse than having no test at all, because it stops someone from
writing the real thing.
