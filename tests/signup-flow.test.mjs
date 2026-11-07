// End-to-end test of the tutor sign-up pipeline, in a real (headless) Chrome,
// against the LOCAL Auth + Firestore emulators with the repo's firestore.rules.
// Nothing here touches production: no accounts, no documents, no email.
//
// What it walks through:
//   1. A new tutor signs up on signup.html. Their profile must be written
//      (name, email, role, created_at) and they land on account.html?new=1.
//      Guards the 2026-10 race where the redirect cancelled the profile write.
//   2. With no approved classes, the board shows the "request your classes"
//      message, not the open requests.
//   3. The account page lists the Music instruments; the tutor requests one,
//      which creates a pending ClassRequest (rules allow it).
//   4. A second sign-up is made "Music Lead"; the Lead Console lists the
//      pending request and Approve flips it to approved (rules allow it).
//   5. Once the class is granted (normally the onClassRequestApproved
//      function, simulated here) the tutor's board shows the matching request.
//   6. signin.html backfills a missing profile name from the display name.
//   7. request.html offers Music and the Chalmers default location.
//
// Run (needs Chrome installed and the Firebase CLI):
//   firebase emulators:exec --only auth,firestore --project ptjobboard2024 "node --test tests/signup-flow.test.mjs"
// Override the browser with CHROME_PATH if it is not in the default location.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "ptjobboard2024";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const CHROME =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].find((p) => existsSync(p));
const PASSWORD = randomBytes(9).toString("base64url");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- site copy wired to the emulators ----------
function buildSite() {
  const dir = mkdtempSync(join(tmpdir(), "ptjb-site-"));
  cpSync(join(ROOT, "public"), dir, { recursive: true });
  const compat = (f) => {
    const p = join(dir, f);
    const s = readFileSync(p, "utf8");
    const anchor = "const db = firebase.firestore();";
    assert.equal(s.split(anchor).length, 2, `${f}: init anchor`);
    writeFileSync(
      p,
      s.replace(
        anchor,
        anchor + '\nauth.useEmulator("http://127.0.0.1:9099"); db.useEmulator("127.0.0.1", 8080);'
      )
    );
  };
  ["signup.html", "signin.html", "account.html"].forEach(compat);
  // request.html only uses Firestore
  {
    const p = join(dir, "request.html");
    const s = readFileSync(p, "utf8");
    const anchor = "const db = firebase.firestore();";
    writeFileSync(p, s.replace(anchor, anchor + '\ndb.useEmulator("127.0.0.1", 8080);'));
  }
  {
    const p = join(dir, "board.html");
    let s = readFileSync(p, "utf8");
    const imp =
      'import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";';
    const init = "const db = getFirestore(app);";
    assert.ok(s.includes(imp) && s.includes(init), "board.html: init anchors");
    s = s.replace(
      imp,
      imp +
        '\nimport { connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";' +
        '\nimport { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";'
    );
    s = s.replace(
      init,
      init +
        '\nconnectAuthEmulator(auth, "http://127.0.0.1:9099"); connectFirestoreEmulator(db, "127.0.0.1", 8080);'
    );
    writeFileSync(p, s);
  }
  return dir;
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css" };
function serve(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = join(dir, path === "/" ? "index.html" : path);
      if (!file.startsWith(dir) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

// ---------- emulator admin helpers (owner token bypasses rules) ----------
const OWNER = { authorization: "Bearer owner", "content-type": "application/json" };
const toFs = (v) =>
  Array.isArray(v)
    ? { arrayValue: { values: v.map(toFs) } }
    : typeof v === "boolean"
      ? { booleanValue: v }
      : v && typeof v === "object"
        ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } }
        : { stringValue: String(v) };
const fromFs = (v) =>
  "arrayValue" in v
    ? (v.arrayValue.values || []).map(fromFs)
    : "mapValue" in v
      ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]))
      : Object.values(v)[0];
async function fsGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: OWNER });
  if (r.status === 404) return null;
  const j = await r.json();
  return Object.fromEntries(Object.entries(j.fields || {}).map(([k, v]) => [k, fromFs(v)]));
}
async function fsList(col) {
  const j = await (await fetch(`${FS}/${col}?pageSize=100`, { headers: OWNER })).json();
  return (j.documents || []).map((d) => ({
    id: d.name.split("/").pop(),
    ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])),
  }));
}
async function fsPatch(path, data) {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const r = await fetch(`${FS}/${path}?${mask}`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)])) }),
  });
  assert.ok(r.ok, `patch ${path}: ${r.status}`);
}
async function uidOf(email) {
  const users = await fsList("users");
  return users.find((u) => u.email === email)?.id;
}

// ---------- minimal Chrome DevTools Protocol driver ----------
let chrome, ws, srv, siteDir, base, profileDir;
let nextId = 1;
const pending = new Map();
const dialogs = [];
const pageErrors = new Map(); // sessionId -> [messages]
function cdp(method, params = {}, sessionId) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}
async function newPage() {
  const { browserContextId } = await cdp("Target.createBrowserContext");
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  await cdp("Page.enable", {}, sessionId);
  await cdp("Runtime.enable", {}, sessionId);
  return sessionId;
}
async function evaluate(s, expression) {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(s, expression, what, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await evaluate(s, expression);
      if (last) return last;
    } catch (e) {
      last = e.message; // page mid-navigation
    }
    await sleep(200);
  }
  const errs = (pageErrors.get(s) || []).slice(-5).join(" | ");
  throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(last)})${errs ? "; page errors: " + errs : ""}`);
}
async function go(s, path) {
  await cdp("Page.navigate", { url: base + path }, s);
  await waitFor(s, `document.readyState === "complete" && location.pathname === ${JSON.stringify(path.split("?")[0])}`, `load ${path}`);
}
const setVal = (sel, val) =>
  `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(val)}; e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
async function signUp(s, name, email) {
  await go(s, "/signup.html");
  await evaluate(s, setVal("#name", name));
  await evaluate(s, setVal("#email", email));
  await evaluate(s, setVal("#password", PASSWORD));
  await evaluate(s, `document.getElementById("signupForm").requestSubmit(), true`);
  await waitFor(s, `location.pathname === "/account.html"`, `${email} lands on account.html`);
}

before(async () => {
  assert.ok(CHROME, "Chrome not found; set CHROME_PATH");
  const probe = await fetch(`${FS}/users`, { headers: OWNER }).catch(() => null);
  assert.ok(probe?.ok, "Firestore emulator not reachable on 127.0.0.1:8080 (run under emulators:exec)");

  siteDir = buildSite();
  srv = await serve(siteDir);
  base = `http://127.0.0.1:${srv.address().port}`;

  profileDir = mkdtempSync(join(tmpdir(), "ptjb-chrome-"));
  chrome = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    chrome.on("exit", (c) => reject(new Error("chrome exited " + c)));
  });
  ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown" || (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")) {
      const msg = m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text ||
        (m.params.args || []).map((a) => a.value ?? a.description).join(" ");
      if (!pageErrors.has(m.sessionId)) pageErrors.set(m.sessionId, []);
      pageErrors.get(m.sessionId).push(msg);
    } else if (m.method === "Page.javascriptDialogOpening") {
      dialogs.push(m.params.message);
      cdp("Page.handleJavaScriptDialog", { accept: true }, m.sessionId);
    }
  });

  // One open Music request a Tuba tutor free on Day 1 Block A could take
  await fetch(`${FS}/Requests?documentId=req-tuba`, {
    method: "POST",
    headers: OWNER,
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries({
          name: "Seed Student",
          email: "seed.student@hwemail.com",
          grade: "10",
          subject: "Music",
          class: "Tuba",
          location: "Music Rooms (1st floor Chalmers)",
          availability: [{ date: "12/01/2099", block: "A", cycleDay: "1" }],
        }).map(([k, v]) => [k, toFs(v)])
      ),
    }),
  });
});

after(async () => {
  try { ws?.close(); } catch {}
  chrome?.kill();
  srv?.close();
  await sleep(500);
  for (const d of [siteDir, profileDir]) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

const TUTOR = { name: "Emu Tutor", email: "emu.tutor@hwemail.com" };
const LEAD = { name: "Emu Lead", email: "emu.lead@hwemail.com" };
let tutorPage, leadPage;

test("sign-up writes the full profile and lands on the welcome page", async () => {
  tutorPage = await newPage();
  await signUp(tutorPage, TUTOR.name, TUTOR.email);
  assert.equal(await evaluate(tutorPage, `location.search`), "?new=1");
  assert.equal(
    await evaluate(tutorPage, `getComputedStyle(document.getElementById("welcome")).display`),
    "block"
  );
  const uid = await uidOf(TUTOR.email);
  assert.ok(uid, "users doc exists");
  const profile = await fsGet(`users/${uid}`);
  assert.equal(profile.name, TUTOR.name);
  assert.equal(profile.role, "student");
  assert.ok(profile.created_at, "created_at written");
});

test("a tutor with no approved classes sees no requests on the board", async () => {
  await go(tutorPage, "/board.html");
  const msg = await waitFor(tutorPage, `document.getElementById("empty")?.textContent`, "board empty message");
  assert.match(msg, /don't have any approved classes/);
  assert.equal(await evaluate(tutorPage, `document.body.innerText.includes("Seed Student")`), false);
});

test("account page lists Music instruments and requesting one creates a pending ClassRequest", async () => {
  await go(tutorPage, "/account.html");
  await waitFor(tutorPage, `document.querySelectorAll('.chip[data-subject="Music"]').length > 0`, "music chips");
  const music = await evaluate(
    tutorPage,
    `[...document.querySelectorAll('.chip[data-subject="Music"]')].map(c => c.dataset.className)`
  );
  assert.equal(music.length, 19);
  assert.ok(music.includes("Tuba") && music.includes("Musicianship") && !music.includes("Other"));
  await evaluate(tutorPage, `document.querySelector('.chip[data-class-name="Tuba"]').click(), true`);
  await evaluate(tutorPage, `document.getElementById("requestClassesBtn").click(), true`);
  await waitFor(tutorPage, `/Requested/.test(document.getElementById("requestStatus").textContent)`, "request status");
  const reqs = (await fsList("ClassRequests")).filter((r) => r.class === "Tuba");
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].subject, "Music");
  assert.equal(reqs[0].status, "pending");
});

test("a Music Lead sees the pending request in the Lead Console and can approve it", async () => {
  leadPage = await newPage();
  await signUp(leadPage, LEAD.name, LEAD.email);
  await fsPatch(`users/${await uidOf(LEAD.email)}`, { role: "Music Lead" });
  await go(leadPage, "/board.html");
  await waitFor(
    leadPage,
    `[...document.querySelectorAll("#lead-approvals button")].some(b => b.textContent.trim() === "Approve")`,
    "lead console approve button"
  );
  assert.ok(await evaluate(leadPage, `document.getElementById("lead-approvals").innerText.includes("Tuba")`));
  await evaluate(
    leadPage,
    `[...document.querySelectorAll("#lead-approvals button")].find(b => b.textContent.trim() === "Approve").click(), true`
  );
  await sleep(1500);
  const req = (await fsList("ClassRequests")).find((r) => r.class === "Tuba");
  assert.equal(req.status, "approved");
  assert.equal(req.decidedByRole, "Music Lead");
  assert.deepEqual(dialogs, [], "no error alerts");
});

test("once granted, the tutor's board shows the matching Music request", async () => {
  // onClassRequestApproved grants the class in production; simulate it here
  await fsPatch(`users/${await uidOf(TUTOR.email)}`, { classes: ["Tuba"], availability: { "1_A": true } });
  await go(tutorPage, "/board.html");
  await waitFor(tutorPage, `document.body.innerText.includes("Seed Student")`, "request banner");
  assert.ok(await evaluate(tutorPage, `document.body.innerText.includes("Chalmers")`));
});

test("signin backfills a missing profile name from the display name", async () => {
  const email = "emu.noname@hwemail.com";
  const r = await fetch(`${AUTH}/accounts:signUp?key=emulator`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, displayName: "Emu Noname", returnSecureToken: true }),
  });
  const { localId } = await r.json();
  await fsPatch(`users/${localId}`, { email, role: "student" }); // the broken shape
  const s = await newPage();
  await go(s, "/signin.html");
  await evaluate(s, setVal("#email", email));
  await evaluate(s, setVal("#password", PASSWORD));
  await evaluate(s, `document.getElementById("loginForm").requestSubmit(), true`);
  await waitFor(s, `location.pathname === "/board.html"`, "signin redirect");
  assert.equal((await fsGet(`users/${localId}`)).name, "Emu Noname");
});

test("request form offers Music with the Chalmers default location", async () => {
  const s = await newPage();
  await go(s, "/request.html");
  const subjects = await evaluate(s, `[...document.querySelectorAll("#subject option")].map(o => o.value).filter(Boolean)`);
  assert.deepEqual(subjects, ["Math", "Science", "English", "History", "World Language", "Computer Science", "Music", "Other"]);
  await evaluate(s, setVal("#subject", "Music"));
  assert.match(await evaluate(s, `document.getElementById("location").placeholder`), /Music Rooms \(1st floor Chalmers\)/);
  assert.equal(await evaluate(s, `document.querySelectorAll("#class option:not([disabled])").length`), 19);
  assert.equal(await evaluate(s, `window.__CATALOG__.defaultLocation("Math")`), "Learning Center");
});
