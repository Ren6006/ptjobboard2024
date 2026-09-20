# HW Peer Tutoring Job Board

Live site: https://hwptjb.com (Firebase project `ptjobboard2024`)

Students submit tutoring requests (no account needed); tutors sign in, get
approved for classes, set their availability, and claim requests as sessions.

## Repo map

| Path | What it is | Used in production? |
| --- | --- | --- |
| `public/` | The whole website (static HTML, Firebase Hosting) | Yes |
| `public/catalog.js` | Single source of truth for subjects, classes, blocks, roles. Student form and tutor approvals must use the same class names to match. | Yes |
| `public/firebase-config.js` | Public Firebase web config (not a secret) | Yes |
| `public/common-auth.js` | Redirects every host to the canonical `hwptjb.com` | Yes |
| `functions/index.js` | Cloud Functions (Gen 2, Node 22): emails, auto-approval, hours tracking, nightly session auto-complete, admin user create/delete, password reset links | Yes |
| `functions/email.js` | Gmail SMTP sending (nodemailer), shared by all email functions and usable directly for a test send | Yes |
| `firestore.rules` | Firestore security rules | Yes |
| `firebase.json`, `.firebaserc`, `firestore.indexes.json` | Firebase project config | Yes |
| `functions/setup-smtp-secrets.ps1` | Prompts for the Gmail app password and writes the SMTP secrets | Tooling |
| `tests/` | Automated tests. Currently one suite, for the password reset pipeline | Tooling |
| `STATUS.md` | Where the project stands, open items, and how it got here | Docs |
| `docs/EMAIL.md` | Mail pipeline, password reset, secret rotation, troubleshooting | Docs |
| `docs/TESTING.md` | What is tested, how to run it, what has no coverage | Docs |
| `docs/DEPLOY.md` | Deploy commands and the recurring gotchas | Docs |

## Pages

| Page | Who | Notes |
| --- | --- | --- |
| `index.html` | Everyone | Landing: student / tutor / admin buttons |
| `request.html` | Students (anonymous) | Submit a request with availability slots; reads the school XML schedule (cached in `cycleDays`) |
| `signin.html`, `signup.html` | Tutors | Email/password auth, `@hwemail.com` / `@hw.com` only |
| `reset-password.html` | Tutors | Forgot-password flow: request the reset email, then (via the emailed link, `?mode=resetPassword&oobCode=…`) choose a new password. The email is sent by the `sendPasswordReset` function over Gmail SMTP, not by Firebase Auth, whose own mailer delivers nothing for this project and whose action URL cannot be changed. The function mints the link with the Admin SDK and repoints it at this page. |
| `board.html` | Tutors | Upcoming/completed sessions, matching open requests, self-reported hours; Lead Console for `<Subject> Lead` and `Head` |
| `account.html` | Tutors | Name, grade, availability grid, request class approvals |
| `admin.html` | `Admin`, `Head`, `Developer` | Approvals, requests, sessions, hours, users & roles, calendar import, analytics |

## Firestore collections

- `users/{uid}`: `name, email, role, grade, classes[], availability{ "day_block": bool }`
- `ClassRequests`: tutor requests to be approved for a class (`pending | approved | rejected`)
- `Requests`: open student requests (deleted when a tutor finalizes)
- `Sessions`: `scheduled | completed | cancelled`; completed sessions create an `Hours` doc
- `Hours`: one doc per hour (`completed_session` or `self_reported`)
- `cycleDays/{YYYY-MM-DD}`: cached school schedule (imported from the Admin > Calendar tab)
- `PasswordResetThrottle/{email}`: one doc per address, the cooldown behind `sendPasswordReset`; written only by the Admin SDK and unreadable by any client

## Roles

`student` (default, i.e. a tutor account), `<Subject> Lead`, `Head`, `Admin`, `Developer`.
Only `Admin`/`Head`/`Developer` can change roles or classes (enforced in `firestore.rules`).

## Local development

```powershell
npm --prefix functions install
firebase emulators:start          # hosting :5000, firestore :8080, functions :5001
```

Email functions need `SMTP_USER` / `SMTP_PASSWORD` in the environment when running locally.

## Deploy

```powershell
firebase deploy --only hosting
firebase deploy --only firestore:rules
# The longer discovery timeout is required on a cold cache; see docs/DEPLOY.md.
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"; firebase deploy --only functions
```

Run the three separately; combining targets has silently skipped one. Full deploy notes and the
recurring gotchas are in [docs/DEPLOY.md](docs/DEPLOY.md).

Set the SMTP secrets with `functions/setup-smtp-secrets.ps1` (it prompts for the app password;
never commit it, and never pipe it on a command line). See [docs/EMAIL.md](docs/EMAIL.md).

## Tests

```powershell
node --test tests/password-reset.test.mjs
```

See [docs/TESTING.md](docs/TESTING.md) for what is and is not covered.
