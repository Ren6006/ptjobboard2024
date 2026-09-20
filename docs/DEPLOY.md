# Deploying and operations

## The commands

```powershell
firebase deploy --only hosting
firebase deploy --only firestore:rules
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"; firebase deploy --only functions
```

Run them **separately**. Combining targets has silently skipped one: on 2026-09-20
`firebase deploy --only firestore:rules,hosting` deployed the rules and never mentioned hosting,
which had to be deployed again on its own. Check the output names the target you asked for.

Deploy a single function when that is all you changed:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"; firebase deploy --only functions:sendPasswordReset
```

---

## Gotchas that will bite you

### Function deploys fail on a cold cache

```
Error: User code failed to load. Cannot determine backend specification. Timeout after 10000.
```

**This is not a code error.** Importing the functions entry point takes 11.7s cold but 0.6s warm,
against the CLI's 10-second discovery budget, because the 89 MB dependency tree sits in a
OneDrive-synced folder.

| Run | Import time |
| --- | --- |
| Cold, first read after a reboot or OneDrive sync | 11.66 s |
| Warm, second | 0.60 s |
| Warm, third | 0.61 s |

Fix: set `FUNCTIONS_DISCOVERY_TIMEOUT=60`, or simply run the deploy twice — the second attempt
hits a warm cache. **Do not start rewriting the function code.** More than one session has been
lost to debugging this as though it were a syntax or import problem.

### The CLI's "outdated firebase-functions" warning is false

The manifest pins `^7.3.2` and the installed tree has exactly 7.3.2, with `firebase-admin`
14.4.0 and `nodemailer` 10.0.9. The warning is a stale CLI heuristic. Ignore it.

### Secret destruction warnings are based on stale metadata

`functions:secrets:destroy` warns that a version is "currently in use" even when every Cloud Run
service is already pinned to a newer one. Verify the real bindings against the Cloud Run services
API before believing it. See [EMAIL.md](EMAIL.md#rotating-the-gmail-app-password).

### The Firestore emulator can outlive its parent

On Windows it can survive the process that started it and keep holding its port, so the next run
fails with "port taken". Kill the stray process.

### The school website blocks scripted requests

Browsers work; plain server-side fetches get a 403 from the bot check. Scripts need a browser
user agent. This is why the school calendar is cached in the `cycleDays` collection rather than
fetched live.

---

## Things that must stay in sync

- **Class names are the join key** between student requests and tutor approvals, so they must be
  identical on both sides. That is the entire reason `public/catalog.js` is shared rather than
  duplicated per page.
- **Block codes must match the school feed exactly.** If they drift, the request form silently
  shows no class blocks at all — no error, just an empty list. This happened when the school
  moved from numbered blocks to letters A-G.
- **Hosting `cleanUrls`** is what makes `https://hwptjb.com/reset-password` resolve to
  `reset-password.html`. The password reset link is built against that URL, so turning it off
  breaks reset emails already in flight.

---

## Verifying a deploy

```powershell
# What is actually deployed
firebase functions:list --project ptjobboard2024

# Which secret versions exist, and which are destroyed
firebase functions:secrets:describe SMTP_PASSWORD --project ptjobboard2024

# Did a function actually do the thing
firebase functions:log --only sendPasswordReset --project ptjobboard2024

# What hosting is really serving, as opposed to what is on your disk
Invoke-WebRequest -Uri "https://hwptjb.com/reset-password" -UseBasicParsing
```

That last one matters more than it looks. `public/reset-password.html` was live on the site for
five days while still untracked in git, so the deployed site and the repo disagreed and nobody
could tell from either one alone. Check what is served, not what you have locally.

Contract tests for the reset pipeline: [TESTING.md](TESTING.md).
