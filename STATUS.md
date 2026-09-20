# Project status

The HW Peer Tutoring job board (`ptjobboard2024`, live at hwptjb.com) after the 2026-27
start-of-year work. Last updated 2026-09-20.

This file is the **snapshot**: what is true right now, what is still open, and how it got here.
Anything you will need to look up again lives in its own document:

| Document | Covers |
| --- | --- |
| [docs/EMAIL.md](docs/EMAIL.md) | The mail pipeline, password reset, secret rotation, troubleshooting |
| [docs/TESTING.md](docs/TESTING.md) | What tests exist, how to run them, what has no coverage |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy commands and the gotchas that bite every time |

Personal details (tutor names, emails, phone numbers) are deliberately left out, because this
repo is public on GitHub.

---

## 1. Where things stand

| Area | State |
| --- | --- |
| Site (hosting) | Live and current |
| Cloud Functions | **10 deployed**, Gen 2, Node 22, `us-central1`, all healthy |
| Firestore rules | Deployed. No automated tests — see [docs/TESTING.md](docs/TESTING.md) |
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
to 3 are destroyed. Verified against the Cloud Run services API, not from CLI metadata.

Live data below came from the Firebase console on 2026-09-20 and nothing in the repo can confirm
it. Re-check before relying on it.

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

## 2. Open items

1. **Confirm the leaked Gmail app password was revoked at Google, not just in Firebase.** The app
   password committed to this public repo before 2026-09-09 is still readable in git history, and
   anyone can retrieve it. Secret Manager versions 1 to 3 are confirmed destroyed, but that only
   removes it from Firebase. Creating the new app password on 2026-09-17 did not revoke the old
   one. Check Google Account → Security → 2-Step Verification → App passwords for
   `uspeertutoring@gmail.com` and delete any entry other than the current one. Purging it from git
   history would need a force-pushed rewrite of a public repo, so revocation is the fix that
   matters. Do not test the old password by trying to log in; that is what triggered the 2026-08
   sign-in block.
2. **Send the tutor announcement.** Drafted and on hold. It needs to cover both the reset
   pipeline being fixed and the fact that returning tutors' availability was cleared by the A-G
   block change. Mention that mail arrives with an "outside HW" banner, or tutors may take a
   password link for phishing.
3. **Four tutors received a stray test notification** on 2026-09-17 from a pipeline test. It is
   self-labelled as a test and the request was deleted. Decide whether to send a clarification.
4. **Consider turning on point-in-time recovery** for Firestore, giving 7 days of undo for a
   small storage cost. This is a billing change. The 14 class requests lost in the roster reset
   are the argument for it.
5. **Add tests for the Firestore rules.** The highest-value missing test in the repo; a
   privilege-escalation bug was found in these rules during the 2026-09 review. See
   [docs/TESTING.md](docs/TESTING.md).
6. **Add a "Send reset link" button to the admin Users tab.** Optional convenience now that the
   pipeline works. It slots into `renderUsers()` in `public/admin.html` and calls the deployed
   `sendPasswordReset` callable.
7. **Update the Firebase CLI** (15.13.0). It reports a false "outdated firebase-functions"
   warning. Updating will not fix the deploy timeout, which is separate and diagnosed — see
   [docs/DEPLOY.md](docs/DEPLOY.md).

---

## 3. What happened this cycle

### Password reset (2026-09-15 to 2026-09-20)

Firebase Auth's mailer delivers nothing for this project and its action URL cannot be changed by
console or API, which left all 38 accounts created by the roster sync unable to sign in at all —
a new account has no password, so the reset email was the only way in. The fix was to stop using
Firebase's mailer: `sendPasswordReset` mints the link with the Admin SDK, repoints it at our own
page, and sends it over the working Gmail pipeline.

A first cut of that function leaked account existence — unknown addresses returned 500 while real
ones returned 200 — because Identity Toolkit reports an unknown address as HTTP 200 with no
`oobLink` rather than as `user-not-found`. Found by testing the path, fixed the same day, and now
covered by a regression test. Mechanics and the full gotcha are in [docs/EMAIL.md](docs/EMAIL.md).

### Email outage (2026-08-28 to 2026-09-17)

Google put a sign-in block on the sending account and every send failed with `534-5.7.9`. Fixed
with a browser sign-in and a new app password. The old app password had been committed to this
public repo, so secret versions 1 to 3 were destroyed — see open item 1 for the part that is not
finished.

### New school year reset (2026-09-10)

Production was reset from the master roster spreadsheet: wiped Hours, Requests, Sessions and
ClassRequests; deleted 50 accounts not on the roster; created 38 new tutor accounts and rewrote
26 existing profiles; kept three non-roster accounts (the faculty admin, a developer, and the
owner's personal login). Approved classes came from the spreadsheet, expanded down each subject
ladder, so a tutor approved for an upper level also covers the levels below it.

**Known loss:** 14 class requests submitted between the pre-reset snapshot and the reset were
wiped and are not recoverable. Point-in-time recovery is off and there are no backups, so
Firestore keeps deleted documents for only one hour. The likely submitter's roster approvals
already cover what they most likely asked for.

### Schedule change

The school switched class blocks from numbers to **letters A through G** and changed the per-day
order. The site showed no class blocks at all until this was fixed in the shared catalog, the
email templates, and the admin backfill tool. Every tutor's saved availability was cleared,
because the old keys no longer mean anything — **returning tutors have not been told this yet**
(open item 2). The 2026-27 calendar was imported and the 2025-26 dates deleted, and the admin
import now points at `https://www.hw.com/calendar/cycledaysUS.ics`.

### Repo health pass

A full review of every page, the functions and the security rules. All deployed.

- **Class approval emails never sent.** The helper that builds the approval email had been
  commented out while still being called, so every approval threw an error that was silently
  swallowed.
- **Privilege escalation in the security rules.** Any signed-in user could create their own
  profile document with an admin role, or grant themselves approved classes. Only Admin, Head and
  Developer can set roles or classes now.
- **Stored cross-site scripting.** Text typed into the public student request form was injected as
  raw HTML into the tutor board and the admin console. All user text is escaped now.
- **Subject leads' approval panel hung forever**, because the rules deny the unfiltered read it
  was attempting. Leads now query only their own subject.
- **Sessions were matched by display name** instead of account id.
- **"Cancel & Reopen" deleted the session**, so the cancellation email never fired. It now marks
  the session cancelled and every list filters those out.
- **A wrong password locked the sign-in form** until the page was reloaded.
- **Student and tutor class lists had drifted apart**, so many approvals could never match a
  request. Both now read one shared list, `public/catalog.js`.
- **JavaScript was cached for a year as immutable**, so changes would never reach returning users.

Also added: admin user creation and deletion, previously placeholder buttons; and a class quick
view on the admin Users tab, where picking a class lists every approved tutor.

Cleanup: removed an 8 MB saved copy of the school schedule site, the unused root npm package, a
committed macOS junk file, the unused Realtime Database config, and an unused test dependency.

### Dependency upgrade

| Package | From | To |
| --- | --- | --- |
| firebase-functions | 4.9.0 | 7.3.2 |
| firebase-admin | 12.7.0 | 14.4.0 |
| nodemailer | 6.10.1 | 10.0.9 |

Production advisories went from 22 to 2. The two that remain are an old uuid package inside the
Cloud Storage client, which this project never calls, and npm cannot fix it without breaking that
dependency.

---

## 4. Timeline

| Date | What happened |
| --- | --- |
| around 2026-08-28 | Gmail SMTP starts failing with `534-5.7.9`; function emails stop |
| 2026-09-10 | Roster sync creates 38 new tutor accounts |
| 2026-09-15 | Reset page built and deployed. Console and API both refuse the custom action URL |
| 2026-09-17 | Root cause found: Firebase's built-in mailer delivers nothing, to any domain |
| 2026-09-17 | Gmail unblocked; new app password at secret version 4; a real trigger email confirmed delivered |
| 2026-09-20 | Deploy failure traced to the 10s discovery timeout on cold module load, not a code error |
| 2026-09-20 | `sendPasswordReset` built and deployed; reset page switched to it; enumeration leak found and fixed; real reset email confirmed received at an `@hwemail.com` address; tests added to the repo |
| 2026-09-20 | Docs split: `PASSWORD_RESET_STATUS.md` and `SMTP_SETUP_README.md` merged into `docs/` and deleted |
