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
| `functions/index.js` | Cloud Functions (Gen 2, Node 22): emails, auto-approval, hours tracking, nightly session auto-complete, admin user create/delete | Yes |
| `functions/email.js` | Gmail SMTP sending (nodemailer), shared by all email functions and usable directly for a test send | Yes |
| `firestore.rules` | Firestore security rules | Yes |
| `firebase.json`, `.firebaserc`, `firestore.indexes.json` | Firebase project config | Yes |
| `SMTP_SETUP_README.md`, `functions/setup-smtp-secrets.ps1` | How to set the Gmail SMTP secrets for the email functions | Docs/tooling |

## Pages

| Page | Who | Notes |
| --- | --- | --- |
| `index.html` | Everyone | Landing: student / tutor / admin buttons |
| `request.html` | Students (anonymous) | Submit a request with availability slots; reads the school XML schedule (cached in `cycleDays`) |
| `signin.html`, `signup.html` | Tutors | Email/password auth, `@hwemail.com` / `@hw.com` only |
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
firebase deploy --only functions
```

Set the SMTP secrets once with `functions/setup-smtp-secrets.ps1` (it prompts for the app password; never commit it).
