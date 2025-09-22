// index.js (Firebase Functions Gen2, ESM)

// ---- Imports (ESM at top) ----
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";   // Admin init for ref.get()
import { google } from "googleapis";

// ---- Init Admin (once) ----
initializeApp();

// ---- Secrets (recommended over raw env) ----
const GMAIL_CLIENT_ID = defineSecret("GMAIL_CLIENT_ID");
const GMAIL_CLIENT_SECRET = defineSecret("GMAIL_CLIENT_SECRET");
const GMAIL_REFRESH_TOKEN = defineSecret("GMAIL_REFRESH_TOKEN");

// ---- Catalog (for friendly block names) ----
const blocksCatalog = {
  "1": "Block 1",
  "M11": "Junior Seminar",
  "2": "Block 2",
  "L": "Lunch",
  "3": "Block 3",
  "DS": "DS",
  "CC": "CC (3:15-4:00)",
  "4": "Block 4",
  "M10": "Soph. Seminar",
  "5": "Block 5",
  "6": "Block 6",
  "7": "Block 7",
  "FC": "Faculty Collaboration",
  "M12": "Senior Seminar",
  "CT": "Community Time",
  "OH": "Office Hours",
};

// ---- Gmail Auth ----
async function getGmailClient() {
  const { OAuth2 } = google.auth;
  const oAuth2Client = new OAuth2(
    GMAIL_CLIENT_ID.value() || process.env.GMAIL_CLIENT_ID || "",
    GMAIL_CLIENT_SECRET.value() || process.env.GMAIL_CLIENT_SECRET || "",
    "https://developers.google.com/oauthplayground" // use your real redirect URI
  );

  oAuth2Client.setCredentials({
    refresh_token:
      GMAIL_REFRESH_TOKEN.value() || process.env.GMAIL_REFRESH_TOKEN || "",
  });

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

// ---- Helper: Build raw RFC 5322 email (CRLF + basic MIME headers) ----
function makeEmail({ from, to, subject, text }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ];
  const raw = lines.join("\r\n");
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---- Firestore Trigger (Gen2) ----
export const confirmSessionEmail = onDocumentCreated(
  {
    document: "Sessions/{sessionId}",
    region: "us-central1",
    timeoutSeconds: 540,
    // memoryMiB: 256, // optional tuning
    secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    // Optional: refetch to ensure "scheduled" is current
    const freshSnap = await snap.ref.get();
    if (!freshSnap.exists) return;

    const data = freshSnap.data() || {};
    if (data.status !== "scheduled") {
      console.log("Session no longer scheduled, skipping email");
      return;
    }

    const gmail = await getGmailClient();

    // Recipients: student, tutor, admin (one email each)
    const recipients = [data.email, data.tutorEmail, "uspeertutoring@hw.com"].filter(Boolean);

    const subject = `Session Confirmation: ${data.subject || "Tutoring"}`;
    const msgBody = `Hello ${data.name || "student"},

Your tutoring session has been confirmed.

📅 Date: ${data.slot?.date || "TBD"}
🕒 Block: ${blocksCatalog[data.slot?.block] || data.slot?.block || "TBD"}
📖 Class/Subject: ${data.class || ""} (${data.subject || ""})
📍 Location: ${data.location || "TBD"}
👤 Tutor: ${data.tutorName || "TBD"}

Thank you,
HW Peer Tutoring`;

    const from = `"HW Peer Tutoring" <uspeertutoring@hw.com>`; // MUST be the authed Gmail user or an approved alias

    for (const to of recipients) {
      try {
        const raw = makeEmail({ from, to, subject, text: msgBody });
        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw },
        });
        console.log("Email sent to", to);
      } catch (err) {
        console.error("Error sending email to", to, err?.response?.data || err);
      }
    }
  }
);
