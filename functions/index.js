/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */


const blocksCatalog = {
    '1' : 'Block 1',
    'M11' : 'Junior Seminar',
    '2' : 'Block 2',
    'L' : 'Lunch',
    '3' : 'Block 3',
    'DS': 'DS',
    'CC': 'CC (3:15-4:00)',
    '4': 'Block 4',
    'M10': 'Soph. Seminar',
    '5': 'Block 5',
    '6': 'Block 6',
    '7': 'Block 7',
    'FC': 'Faculty Collaboration',
    'M12': 'Senior Seminar',
    'CT': 'Community Time',
    'OH': 'Office Hours',
  };


const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

import * as functions from "firebase-functions";
import { google } from "googleapis";

const OAuth2 = google.auth.OAuth2;

async function getGmailClient() {
  const oAuth2Client = new OAuth2(
    functions.config().gmail.client_id,
    functions.config().gmail.client_secret,
    "https://developers.google.com/oauthplayground" // redirect URI you used for tokens
  );

  oAuth2Client.setCredentials({
    refresh_token: functions.config().gmail.refresh_token,
  });

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

function makeEmail(to, subject, message) {
  const raw = [
    `From: "HW Peer Tutoring" <${"uspeertutoring@hw.com"}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    message,
  ].join("\n");

  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const confirmSessionEmail = functions.firestore
  .document("Sessions/{sessionId}")
  .onCreate(async (snap, context) => {
    const sessionId = context.params.sessionId;

    // wait 5 minutes before confirming
    await new Promise((resolve) => setTimeout(resolve, 5 * 60));

    const ref = snap.ref;
    const freshSnap = await ref.get();
    if (!freshSnap.exists) return;

    const data = freshSnap.data() || {};
    if (data.status !== "scheduled") {
      console.log("Session no longer scheduled, skipping email");
      return;
    }

    const gmail = await getGmailClient();

    // Recipients
    const recipients = [
      data.email, // student
      data.tutorEmail, // tutor
      "uspeertutoring@hw.com", // admin
    ].filter(Boolean);

    const subject = `Session Confirmation: ${data.subject || "Tutoring"}`;
    const msgBody = `Hello ${data.name || "student"},

Your tutoring session has been confirmed.

📅 Date: ${data.slot?.date || "TBD"}
🕒 Block: ${blocksCatalog[data.slot?.block]}
📖 Class/Subject: ${data.class || ""} (${data.subject || ""})
📍 Location: ${data.location || "TBD"}
👤 Tutor: ${data.tutorName || "TBD"}

Thank you,
HW Peer Tutoring`;

    // Send one email per recipient (so they see themselves as the To:)
    for (const to of recipients) {
      const rawMessage = makeEmail(to, subject, msgBody);
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: rawMessage },
      });
      console.log("Email sent to", to);
    }
  });


// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
