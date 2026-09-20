# Project status

The HW Peer Tutoring job board (`ptjobboard2024`, live at hwptjb.com) after the 2026-27
start-of-year work. Last updated 2026-09-20.

This is the only status document. It replaces the separate `PASSWORD_RESET_STATUS.md`, which
has been deleted; its contents are in section 3.

Personal details (tutor names, emails, phone numbers) are deliberately left out, because this
repo is public on GitHub.

---

## 1. Where things stand

| Area | State |
| --- | --- |
| Site (hosting) | Live and current |
| Cloud Functions | **10 deployed**, Gen 2, Node 22, `us-central1`, all healthy |
| Firestore rules | Deployed |
| School calendar | 157 days cached, 2026-08-25 to 2027-05-26 |
| Outgoing email (our own) | Working since 2026-09-17 |
| Password reset | **Working since 2026-09-20.** Runs on our own mailer, not Firebase's |
| Firebase's built-in Auth mailer | Still delivers nothing. We no longer depend on it |
| New tutor accounts | 38 created; they can now reset their own passwords |
| Returning tutor accounts | 28, of which 23 signed in using last year's passwords |

The deployed functions, from `firebase functions:list` on 2026-09-20:

| Function | Trigger | Sends email |
| --- | --- | --- |
| `sendPasswordReset` | callable | yes |
| `adminCreateUser` | callable | no |
| `adminDeleteUser` | callable | no |
| `confirmSessionEmail` | Firestore create | yes |
| `onClassRequestCreated` | Firestore create | yes |
| `onClassRequestApproved` | Firestore update | yes |
| `onTutoringRequestCreated` | Firestore create | yes |
| `onSessionCancelled` | Firestore update | yes |
| `onSessionCompleted` | Firestore update | no (writes `Hours`) |
| `autoCompletePassedSessions` | scheduled | no |

The six that send email are bound to `SMTP_USER` and `SMTP_PASSWORD` **version 4**; versions 1
to 3 are destroyed. Verified against the Cloud Run services API, not from metadata.

Live data below came from the Firebase console on 2026-09-20 and nothing in the repo can
confirm it. Re-check before relying on it.

| Collection | Count |
| --- | --- |
| users | 66 |
| ClassRequests | 15 (all approved) |
| Requests | 1 open |
| Sessions | 0 |
| Hours | 5 |
| cycleDays | 157 |
| PasswordResetThrottle | 5 (all created by the 2026-09-20 tests) |

Roles: 2 Head, 1 Admin, 2 Developer, 5 subject leads, 56 regular tutors. 18 of 66 tutors have
set their availability.

---

## 2. Email

All notification email goes out through Gmail SMTP from `uspeertutoring@gmail.com`, using
`functions/email.js`.

That pipeline was dead from at least 2026-08-28: Google had put a sign-in block on the account
and every send failed with `534-5.7.9`. It was fixed on 2026-09-17 with a browser sign-in and a
new app password. The old app password had been committed to this public repo, so secret
versions 1 to 3 were destroyed.

Delivery to school addresses is confirmed. A real reset email was received at an `@hwemail.com`
address on 2026-09-20. It arrives with Outlook's external-sender banner, which is expected for a
gmail.com sender and is not a fault.

**Caution.** `onTutoringRequestCreated` emails *every* tutor approved for the class and free in
that slot, not just the address on the request. A test with a common class and a lunch slot
mailed five tutors. Test with a class only you are approved for, or drive `functions/email.js`
from a local script.

---

## 3. Password reset

**Working.** A tutor goes to `hwptjb.com/reset-password`, enters their school address, and
receives a link that opens the same page with a new-password form.

### Why it does not use Firebase

Firebase Auth's own mailer accepts the send and delivers nothing for this project. The API
returns HTTP 200 and records a valid code, but no mail is ever delivered — confirmed by sending
to a personal `gmail.com` address and finding nothing in inbox, spam or trash. The link itself
was never the problem: a generated code verifies, and both Firebase's handler and our page
render the form correctly.

The obvious workaround, pointing Firebase's action URL at our page, is impossible. The console
fails with "An error occurred updating action URL" and leaves the field greyed at the default,
and the Identity Toolkit admin API rejects the same change with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`.
Both routes refuse. Do not spend more time there; it no longer matters.

### How it works now

`sendPasswordReset` (`functions/index.js`) is an unauthenticated callable, because a locked-out
user cannot be signed in. It:

1. rejects anything that is not `@hwemail.com` or `@hw.com`;
2. enforces a 60-second per-address cooldown in `PasswordResetThrottle`, written by the Admin
   SDK and unreadable by any client;
3. mints a link with `getAuth().generatePasswordResetLink()`;
4. keeps that link's query parameters (`mode`, `oobCode`, `apiKey`, `continueUrl`) and swaps the
   base onto `https://hwptjb.com/reset-password`;
5. sends it over the working Gmail pipeline.

`public/reset-password.html` calls it through the compat functions SDK. The rest of the page —
verifying the code, setting the password, the error messages — still talks to Firebase Auth
directly, which works fine; only the sending half was ever broken.

### The gotcha that bit us, worth keeping

For an address with no account, Identity Toolkit does **not** return `user-not-found`. It
returns **HTTP 200 with a `GetOobConfirmationCodeResponse` that has no `oobLink`**, which the
Admin SDK raises as a generic `auth/internal-error`. The first version of this function caught
only `user-not-found`, so unknown addresses produced a 500 while real ones produced a 200 —
letting anyone use the form to discover which tutors have accounts. Fixed the same day by
detecting the missing-`oobLink` signature and returning the same silent success. All addresses
now return an identical `200 {"ok":true}`.

This is covered by a regression test; see section 7.

---

## 4. New school year reset

Production was reset from the master roster spreadsheet on 2026-09-10:

- Wiped Hours, Requests, Sessions and ClassRequests.
- Deleted 50 accounts not on the roster (graduated tutors, old leads, test accounts).
- Created 38 new tutor accounts and rewrote 26 existing profiles.
- Kept three non-roster accounts: the faculty admin, a developer, and the owner's personal login.
- Approved classes came from the spreadsheet, expanded down each subject ladder, so a tutor
  approved for an upper level also covers the levels below it.

**Known loss:** 14 class requests submitted between the pre-reset snapshot and the reset were
wiped and are not recoverable. Point-in-time recovery is off and there are no backups, so
Firestore keeps deleted documents for only one hour. The likely submitter's roster approvals
already cover what they most likely asked for.

---

## 5. Schedule and calendar

- The school switched class blocks from numbers to **letters A through G** and changed the
  per-day order. The site showed no class blocks at all until this was fixed in the shared
  catalog, the email templates, and the admin backfill tool.
- Every tutor's saved availability was cleared, because the old keys no longer mean anything.
  **Returning tutors have not been told this yet** — see open items.
- Imported the full 2026-27 calendar and deleted the 2025-26 dates.
- The admin calendar import points at the school's published feed,
  `https://www.hw.com/calendar/cycledaysUS.ics`.

---

## 6. Repo health pass

A full review of every page, the functions and the security rules. All deployed.

- **Class approval emails never sent.** The helper that builds the approval email had been
  commented out while still being called, so every approval threw an error that was silently
  swallowed.
- **Privilege escalation in the security rules.** Any signed-in user could create their own
  profile document with an admin role, or grant themselves approved classes. Only Admin, Head
  and Developer can set roles or classes now.
- **Stored cross-site scripting.** Text typed into the public student request form was injected
  as raw HTML into the tutor board and the admin console. All user text is escaped now.
- **Subject leads' approval panel hung forever**, because the rules deny the unfiltered read it
  was attempting. Leads now query only their own subject.
- **Sessions were matched by display name** instead of account id.
- **"Cancel & Reopen" deleted the session**, so the cancellation email never fired. It now marks
  the session cancelled and every list filters those out.
- **A wrong password locked the sign-in form** until the page was reloaded.
- **Student and tutor class lists had drifted apart**, so many approvals could never match a
  request. Both now read one shared list, `public/catalog.js`.
- **JavaScript was cached for a year as immutable**, so changes would never reach returning users.

Also added: admin user creation and deletion, which were previously placeholder buttons; and a
class quick view on the admin Users tab, where picking a class lists every approved tutor.

Cleanup: removed an 8 MB saved copy of the school schedule site, the unused root npm package, a
committed macOS junk file, the unused Realtime Database config, and an unused test dependency.

---

## 7. Tests

`tests/password-reset.test.mjs` is the only automated test in this repo. It uses Node's built-in
runner, has no dependencies, and runs against the **deployed** function, because the bug it
guards against does not reproduce on the emulator.

```powershell
node --test tests/password-reset.test.mjs
```

Six checks run by default and email nobody: domain rejection, empty input, a lookalike domain,
the unknown-address regression, indistinguishability between two unknown addresses, and the
cooldown. A seventh is
skipped unless you opt in, because it sends a real email:

```powershell
$env:RESET_TEST_REAL_EMAIL="you@hwemail.com"; node --test tests/password-reset.test.mjs
```

All seven passed on 2026-09-20.

**Everything else was verified by hand or by throwaway scripts that no longer exist.** Earlier
versions of this document credited a 41-test Firestore rules suite, a 17-check Playwright run
and a 13-check emulator run. None of them are in the repo; they lived in session scratchpads and
are gone. Treat those numbers as history, not as coverage. The rules in particular have no
automated tests, which is worth fixing given that a privilege-escalation bug was found in them.

---

## 8. Dependencies

| Package | From | To |
| --- | --- | --- |
| firebase-functions | 4.9.0 | 7.3.2 |
| firebase-admin | 12.7.0 | 14.4.0 |
| nodemailer | 6.10.1 | 10.0.9 |

Production advisories went from 22 to 2. The two that remain are an old uuid package inside the
Cloud Storage client, which this project never calls, and npm cannot fix it without breaking
that dependency.

---

## 9. Open items

1. **Confirm the leaked Gmail app password was revoked at Google, not just in Firebase.** The
   app password committed to this public repo before 2026-09-09 is still readable in git
   history, and anyone can retrieve it. Secret Manager versions 1 to 3 are confirmed destroyed,
   but that only removes it from Firebase. Creating the new app password on 2026-09-17 did not
   revoke the old one. Check Google Account > Security > 2-Step Verification > App passwords for
   `uspeertutoring@gmail.com` and delete any entry other than the current one. Purging it from
   git history would need a force-pushed rewrite of a public repo, so revocation is the fix that
   matters. Do not test the old password by trying to log in; that is what triggered the
   2026-08 sign-in block.
2. **Send the tutor announcement.** Drafted and on hold. Returning tutors must be told their
   availability was cleared by the A-G block change. This is now the largest outstanding item.
3. **Tell the 38 new tutors they can reset their passwords.** The pipeline works; they do not
   know it. If any cannot manage it, the fallback is an admin-set temporary password, or a
   "Send reset link" button on the admin Users tab calling `sendPasswordReset` — the row buttons
   live in `renderUsers()` in `public/admin.html`, and the callable is already deployed.
4. **Four tutors received a stray test notification** on 2026-09-17 from a pipeline test. It is
   self-labelled as a test and the request was deleted. Decide whether to send a clarification.
5. **Consider turning on point-in-time recovery** for Firestore, giving 7 days of undo for a
   small storage cost. This is a billing change. The 14 lost class requests are the argument for it.
6. **Add tests for the Firestore rules.** See section 7.
7. **Update the Firebase CLI** (15.13.0). It reports a false "outdated firebase-functions"
   warning; the manifest pins `^7.3.2` and the tree has exactly 7.3.2. Updating will not fix the
   deploy timeout, which is a separate, diagnosed problem — see section 10.

---

## 10. Operational notes

- **Function deploys fail on a cold cache, and it is not a code bug.** `firebase deploy --only
  functions` gives "Cannot determine backend specification. Timeout after 10000". Importing the
  entry point takes 11.7s cold but 0.6s warm, against the CLI's 10s budget, because the 89 MB
  dependency tree sits in a OneDrive-synced folder. Set `FUNCTIONS_DISCOVERY_TIMEOUT=60`, or run
  the deploy twice. Do not start rewriting the function code.
- **The school website blocks scripted requests.** Browsers work; plain server-side fetches get a
  403 from the bot check. Scripts need a browser user agent, which is why the calendar is cached
  in Firestore rather than fetched live.
- **Destroying a secret version warns that functions still use it,** based on stale metadata.
  Check the actual bindings on the deployed Cloud Run services before believing it.
- **The Firestore emulator can survive its parent process** on Windows and hold its port, which
  makes the next run fail with "port taken".
- **Class names are the join key** between student requests and tutor approvals. They must stay
  identical on both sides, which is why there is a single shared catalog file.
- **Block codes must match the school feed exactly.** If they drift, the request form silently
  shows no class blocks.
- **Hosting relies on `cleanUrls`**, which is why `https://hwptjb.com/reset-password` resolves to
  `reset-password.html`. The reset link the function builds depends on this.

---

## 11. Deploying

```powershell
firebase deploy --only hosting
firebase deploy --only firestore:rules
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"; firebase deploy --only functions
```

Deploying `firestore:rules` and `hosting` in one command has silently skipped hosting; run them
separately and check the output names both.

Email credentials are set with `functions/setup-smtp-secrets.ps1`, which prompts for the app
password and never stores it in the repo. It sets the secrets only — it does not redeploy, so
follow it with a functions deploy.

Useful checks:

```powershell
firebase functions:list --project ptjobboard2024
firebase functions:secrets:describe SMTP_PASSWORD --project ptjobboard2024
firebase functions:log --only sendPasswordReset --project ptjobboard2024
```

---

## 12. Timeline

| Date | What happened |
| --- | --- |
| around 2026-08-28 | Gmail SMTP starts failing with `534-5.7.9`; function emails stop |
| 2026-09-10 | Roster sync creates 38 new tutor accounts |
| 2026-09-15 | Reset page built and deployed. Console and API both refuse the custom action URL |
| 2026-09-17 | Root cause found: Firebase's built-in mailer delivers nothing, to any domain |
| 2026-09-17 | Gmail unblocked; new app password at secret version 4; a real trigger email confirmed delivered |
| 2026-09-20 | Deploy failure traced to the 10s discovery timeout on cold module load, not a code error |
| 2026-09-20 | `sendPasswordReset` built and deployed; reset page switched to it; enumeration leak found and fixed; real reset email confirmed received at an `@hwemail.com` address; tests added to the repo; status docs consolidated |
