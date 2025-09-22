/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const ical = require("node-ical");

try { admin.initializeApp(); } catch (e) {}

const CYCLE_ICS_URL = "https://www.hw.com/calendar/cycledaysUS.ics";

async function parseCycleDaysFromICS(url) {
  // Download and parse ICS; return mapping date(YYYY-MM-DD) -> { dayNumber, summary }
  const events = await ical.async.fromURL(url);
  const dateToDay = {};
  for (const key of Object.keys(events)) {
    const ev = events[key];
    if (!ev || ev.type !== 'VEVENT') continue;
    // All-day events use start/end as dates; we only need DTSTART
    const start = ev.start; // JS Date
    if (!start) continue;
    // For date-only DTSTART, node-ical yields a Date at midnight local time
    // Use local getters to avoid UTC shifting the date
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const summary = typeof ev.summary === 'string' ? ev.summary : '';
    // Extract Day N from summary like "US Day 1" or "US Day 3 - Late Start"
    let dayNumber = null;
    const m1 = summary.match(/US\s+Day\s+(\d)/i);
    if (m1 && m1[1]) {
      dayNumber = parseInt(m1[1], 10);
    }
    // Opening day or holidays have no day number; skip those
    if (!dayNumber) continue;
    dateToDay[dateKey] = { dayNumber, summary };
  }
  return dateToDay;
}

async function writeCycleDays(map) {
  const db = admin.firestore();
  const batch = db.batch();
  const col = db.collection('cycleDays');
  Object.keys(map).forEach((dateKey) => {
    const ref = col.doc(dateKey);
    batch.set(ref, { day: map[dateKey].dayNumber, summary: map[dateKey].summary, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
  await batch.commit();
}

async function refreshCycleDays() {
  const map = await parseCycleDaysFromICS(CYCLE_ICS_URL);
  await writeCycleDays(map);
  return { count: Object.keys(map).length };
}

exports.refreshCycleDaysHttp = onRequest({ invoker: 'public' }, async (req, res) => {
  try {
    const result = await refreshCycleDays();
    res.json({ ok: true, ...result });
  } catch (e) {
    logger.error('refreshCycleDaysHttp failed', e);
    res.status(500).json({ ok: false });
  }
});

exports.refreshCycleDaysDaily = onSchedule({ schedule: '0 3 * * *', timeZone: 'America/Los_Angeles' }, async (event) => {
  try {
    const result = await refreshCycleDays();
    logger.info('Cycle days refreshed', result);
  } catch (e) {
    logger.error('Scheduled refresh failed', e);
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
