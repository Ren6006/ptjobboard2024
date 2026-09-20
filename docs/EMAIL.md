# Email pipeline

Everything this site sends goes out over Gmail SMTP from `uspeertutoring@gmail.com`. Firebase
Auth's own mailer is not used and does not work for this project — see
[Password reset](#password-reset) below.

Replaces the old `SMTP_SETUP_README.md`, which documented a migration from OAuth that is long
finished.

---

## How it is wired

| Piece | Where |
| --- | --- |
| Transport | `functions/email.js` — nodemailer, `smtp.gmail.com:587`, STARTTLS |
| From address | `"HW Peer Tutoring" <uspeertutoring@gmail.com>` (`FROM_ADDRESS`) |
| Per-call wrapper | `sendEmail()` in `functions/index.js`, resolves secrets per invocation |
| Credentials | Secret Manager: `SMTP_USER`, `SMTP_PASSWORD` |

Secret values can only be read inside a running function, which is why `smtpCredentials()`
resolves them per call rather than at module load.

`functions/email.js` is deliberately separate from `index.js` so a local script can drive it
with real credentials without loading the Cloud Functions runtime.

## Who sends mail

Six of the ten deployed functions send email, and only these six declare
`secrets: [SMTP_USER, SMTP_PASSWORD]`:

| Function | Sends |
| --- | --- |
| `confirmSessionEmail` | Session confirmation |
| `onClassRequestCreated` | Class request notification |
| `onClassRequestApproved` | Approval confirmation |
| `onTutoringRequestCreated` | New student request, to every matching tutor |
| `onSessionCancelled` | Cancellation, to the student and the admin address |
| `sendPasswordReset` | Password reset link |

The other four (`adminCreateUser`, `adminDeleteUser`, `onSessionCompleted`,
`autoCompletePassedSessions`) send nothing and correctly have no SMTP binding. If you add a
sender, remember the `secrets:` array or it will fail at runtime with no credentials.

> **Blast radius.** `onTutoringRequestCreated` emails *every* tutor approved for the class and
> free in that slot, not just the address on the request. A test with a common class and a lunch
> slot mailed five real tutors. Test with a class only you are approved for, or drive
> `functions/email.js` from a local script instead of creating a real request.

---

## Password reset

Firebase Auth's built-in mailer accepts the send and **delivers nothing** for this project. The
API returns HTTP 200 and records a valid code, but no message is ever delivered — confirmed by
sending to a personal `gmail.com` address and finding nothing in inbox, spam or trash. The link
was never the problem: a generated code verifies, and both Firebase's handler and our page
render the form correctly.

Repointing Firebase's action URL at our page is impossible. The console fails with "An error
occurred updating action URL" and leaves the field greyed at the default; the Identity Toolkit
admin API rejects the same change with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`. **Both routes are
dead ends — do not spend time there.** The design below makes the setting irrelevant.

### How it works

`sendPasswordReset` is an **unauthenticated** callable, because a locked-out user cannot be
signed in to call it. It:

1. rejects anything that is not `@hwemail.com` or `@hw.com`;
2. enforces a 60-second per-address cooldown in `PasswordResetThrottle`, written by the Admin
   SDK and denied to every client by `firestore.rules`;
3. mints a link with `getAuth().generatePasswordResetLink()`;
4. keeps that link's query parameters (`mode`, `oobCode`, `apiKey`, `continueUrl`) and swaps the
   base onto `https://hwptjb.com/reset-password`;
5. sends it over the SMTP path above.

`public/reset-password.html` calls it through the compat functions SDK. The rest of that page —
verifying the code, setting the password, the error messages — still talks to Firebase Auth
directly and works fine. Only the sending half was ever broken.

The rewritten link depends on hosting's `cleanUrls`, which is what makes
`https://hwptjb.com/reset-password` resolve to `reset-password.html`.

### The oobLink gotcha

**Read this before touching the error handling.**

For an address with **no account**, Identity Toolkit does not return `user-not-found`. It
returns **HTTP 200 carrying a `GetOobConfirmationCodeResponse` with no `oobLink`**, which the
Admin SDK raises as a generic `auth/internal-error`.

The first version of this function caught only `user-not-found`, so unknown addresses produced a
500 while real ones produced a 200 — letting anyone use the public form to discover which tutors
have accounts. The fix detects the missing-`oobLink` signature and returns the same silent
success:

```js
const body = err?.httpResponse?.data;
const missingLink =
  err?.code === "auth/internal-error" &&
  body?.kind === "identitytoolkit#GetOobConfirmationCodeResponse" &&
  !body?.oobLink;
```

Every outcome that is not a validation error returns an identical `200 {"ok":true}` — sent,
throttled, and unknown address alike. **Keep it that way.** Any change that makes one of those
distinguishable from the others reopens the enumeration hole. That is what
`tests/password-reset.test.mjs` exists to catch; see [TESTING.md](TESTING.md).

---

## Rotating the Gmail app password

Run the script. It prompts, uses `-AsSecureString`, writes to temp files it deletes afterwards,
and never puts the password in your shell history:

```powershell
cd functions
.\setup-smtp-secrets.ps1
```

**The script sets the secrets only. It does not redeploy** — follow it with a functions deploy,
or the running services stay pinned to the old secret version:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"; firebase deploy --only functions
```

Never pipe the password on a command line (`echo "<password>" | firebase functions:secrets:set`).
It lands in shell history and in the terminal scrollback. An earlier version of this document
recommended exactly that; do not.

After rotating, destroy the superseded versions — and remember that destroying a Secret Manager
version does **not** revoke the app password at Google. Delete the old entry under Google Account
→ Security → 2-Step Verification → App passwords as well, or it keeps working for anyone who has
it.

---

## Troubleshooting

**`534-5.7.9 Please log in with your web browser`, every send failing.**
Google has put a sign-in block on the account. This took the whole pipeline down from about
2026-08-28 to 2026-09-17. Fix: sign in to the account in a real browser, clear the prompt, create
a new app password, run the setup script, redeploy. Do not retry SMTP logins in a loop while
blocked — that deepens the block.

**Checking what is actually deployed and bound.**

```powershell
firebase functions:list --project ptjobboard2024
firebase functions:secrets:describe SMTP_PASSWORD --project ptjobboard2024
firebase functions:log --only sendPasswordReset --project ptjobboard2024
```

`functions:secrets:destroy` warns that a version is "currently in use" from **stale metadata**,
even when every Cloud Run service is already on the new version. Verify against the Cloud Run
services API rather than believing the warning.

**Mail reaching school addresses.** Confirmed working. It arrives with Outlook's
"originated outside HW" banner, which is expected for a gmail.com sender and is not a fault —
but it does mean recipients may hesitate to click a password link, so say so when you announce it.

**Verifying a send actually happened.** A successful send logs `Email sent successfully:` with a
message id. For `sendPasswordReset`, an HTTP 200 proves nothing on its own, because throttled and
unknown-address calls return the same body by design. Check the log line.
