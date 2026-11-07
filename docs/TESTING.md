# Testing

## What exists

| File | Covers | Runs against |
| --- | --- | --- |
| `tests/password-reset.test.mjs` | The deployed `sendPasswordReset` callable | **Production** |
| `tests/signup-flow.test.mjs` | Tutor sign-up → class request → lead approval → board, in a real headless Chrome | **Local emulators only** |

Both use Node's built-in test runner, no dependencies, no `package.json` required. Everything
else has been verified by hand.

## Running them

```powershell
node --test tests/password-reset.test.mjs
firebase emulators:exec --only auth,firestore --project ptjobboard2024 "node --test tests/signup-flow.test.mjs"
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

## The sign-up flow test

`signup-flow.test.mjs` copies `public/` to a temp folder, points that copy at the Auth and
Firestore emulators (which load the repo's `firestore.rules`), serves it, and drives headless
Chrome over the DevTools protocol. It needs Chrome installed (`CHROME_PATH` to override) and
touches nothing in production. Seven checks:

| Check | Guards |
| --- | --- |
| Sign-up writes name, email, role, `created_at`; lands on `account.html?new=1` | **The redirect race** (below) |
| No approved classes → board shows "request your classes", no requests | Approval is the gate |
| Account page lists the 19 Music instruments; requesting one makes a pending `ClassRequest` | Catalog + create rule |
| A `Music Lead` sees it in the Lead Console and approves it | Lead read/update rules |
| Once the class is granted, the tutor's board shows the matching request | Matching by class + block |
| `signin.html` backfills a missing name from the Auth display name | Repair for damaged profiles |
| `request.html` offers Music, Chalmers default location, 19 instruments | Catalog-driven form |

The grant on approval is done by the `onClassRequestApproved` function in production; the test
simulates it, because functions (and email) are not emulated. All seven passed on 2026-11-06.

**The redirect race.** Until 2026-11-06 `signup.html` redirected from `onAuthStateChanged`, which
fires the moment the account is created, so the page navigated away before the profile write
finished and the browser cancelled it. Both tutors who signed up themselves that fall ended up
with a profile that held no name and no `created_at` (written later by `signin.html`). A fast
local emulator may not reproduce the race, so the first check proves the write and the
redirect target, not the timing.

## Why the reset tests run against production

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

- **Firestore security rules, beyond the paths the sign-up flow walks.** No negative tests (for
  example, a lead reading another subject's requests, or a user granting themselves classes). This matters: a privilege-escalation bug was found in
  these rules during the 2026-09 review, where any signed-in user could grant themselves an admin
  role or approve their own classes. A rules suite using `@firebase/rules-unit-testing` against
  the emulator is the single highest-value test to add.
- **The five other email functions.** No automated coverage. Note the blast radius warning in
  [EMAIL.md](EMAIL.md#who-sends-mail) before testing `onTutoringRequestCreated` with real data.
- **The pages in `public/`** outside the sign-up flow above (admin console, sessions, hours).

## A caution about this file

Earlier versions of the status document credited a "41-test" Firestore rules suite, a "17-check"
Playwright run and a "13 of 13" emulator run. **None of those files were ever in this repo.**
They lived in session scratchpads and are gone, so nothing they claimed can be re-verified.

If you write a test worth citing, commit it. A test that is not in the repo does not exist, and
citing one in a document is worse than having no test at all, because it stops someone from
writing the real thing.
