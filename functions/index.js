// index.js (Firebase Functions Gen2, ESM)

// ---- Imports (ESM at top) ----
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";   // Admin init for ref.get()
import { google } from "googleapis";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ---- Init Admin (once) ----
initializeApp();
const db = getFirestore();

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
  const clientId = GMAIL_CLIENT_ID.value() || process.env.GMAIL_CLIENT_ID || "";
  const clientSecret = GMAIL_CLIENT_SECRET.value() || process.env.GMAIL_CLIENT_SECRET || "";
  const refreshToken = GMAIL_REFRESH_TOKEN.value() || process.env.GMAIL_REFRESH_TOKEN || "";
  
  console.log("OAuth Config:", {
    clientIdLength: clientId.length,
    clientSecretLength: clientSecret.length,
    refreshTokenLength: refreshToken.length,
    clientIdPrefix: clientId.substring(0, 20)
  });
  
  const oAuth2Client = new OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground" // use your real redirect URI
  );

  oAuth2Client.setCredentials({
    refresh_token: refreshToken,
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

    const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;

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

// ---- Helpers for Class Requests ----
function buildApprovalEmail({ userName, subjectName, className }) {
  const name = userName || "student";
  return `Hello ${name},

Your class request has been approved.

✅ Class: ${className || ""}
📚 Subject: ${subjectName || ""}

You can now be matched for this class on the board.

Thank you,
HW Peer Tutoring`;
}

async function grantApprovedClass({ uid, className }) {
  if (!uid || !className) return;
  await db.collection("users").doc(uid).set(
    { classes: FieldValue.arrayUnion(className) },
    { merge: true }
  );
}

// Auto-approve if requester is a lead of the subject (or Head)
export const onClassRequestCreated = onDocumentCreated(
  {
    document: "ClassRequests/{requestId}",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const request = snap.data() || {};
    const { uid, subject: subjectName, class: className } = request;
    if (!uid || !subjectName || !className) return;

    try {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      const role = (userDoc.exists && userDoc.data()?.role) || null;
      const isHead = role === "Head";
      const isLeadOfSubject = role === `${subjectName} Lead`;

      if (isHead || isLeadOfSubject) {
        // Auto-approve
        const decidedAt = new Date().toISOString();
        await snap.ref.set(
          {
            status: "approved",
            decidedAt,
            decidedByUid: uid,
            decidedByName: userDoc.data()?.name || userDoc.data()?.displayName || null,
            decidedByRole: isHead ? "Head" : "SubjectLead",
          },
          { merge: true }
        );

        // Grant class and email
        await grantApprovedClass({ uid, className });

        try {
          const gmail = await getGmailClient();
          const toList = [request.userEmail, "uspeertutoring@hw.com"].filter(Boolean);
          const subject = `Class Request Approved: ${className}`;
          const text = buildApprovalEmail({ userName: request.userName, subjectName, className });
          const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;
          for (const to of toList) {
            const raw = makeEmail({ from, to, subject, text });
            await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
          }
        } catch (err) {
          console.error("Email send failed for auto-approval", err?.response?.data || err);
        }
      } else {
        // Not auto-approved - send notification to subject lead and admin
        try {
          const gmail = await getGmailClient();
          const subject = `New Class Request Pending: ${className} (${subjectName})`;
          const text = `Hello,

A new class tutoring request is pending approval:

👤 Tutor: ${request.userName || request.userEmail || "Unknown"}
📧 Email: ${request.userEmail || "N/A"}
📚 Subject: ${subjectName}
📖 Class: ${className}
🕒 Requested: ${request.requestedAt || new Date().toISOString()}

Please review and approve/reject this request in the Lead Console on the board page.

Thank you,
HW Peer Tutoring`;

          const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;
          
          // Send to admin - always notify them
          const toList = ["uspeertutoring@hw.com"];
          
          // Try to find the subject lead email and add them
          const usersSnap = await db.collection("users").where("role", "==", `${subjectName} Lead`).get();
          if (!usersSnap.empty) {
            usersSnap.forEach(doc => {
              const leadEmail = doc.data()?.email;
              if (leadEmail) toList.push(leadEmail);
            });
          }
          
          // Send notification emails
          for (const to of toList) {
            const raw = makeEmail({ from, to, subject, text });
            await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
            console.log("Class request notification sent to", to);
          }
        } catch (err) {
          console.error("Email send failed for class request notification", err?.response?.data || err);
        }
      }
    } catch (err) {
      console.error("onClassRequestCreated error", err);
    }
  }
);

// When status flips to approved, grant class and email user
export const onClassRequestApproved = onDocumentUpdated(
  {
    document: "ClassRequests/{requestId}",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN],
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before || !after) return;
    const prev = before.data() || {};
    const curr = after.data() || {};

    if (prev.status === "approved" || curr.status !== "approved") return;

    const uid = curr.uid;
    const className = curr.class;
    const subjectName = curr.subject;
    if (!uid || !className) return;

    try {
      await grantApprovedClass({ uid, className });

      try {
        const gmail = await getGmailClient();
        const toList = [curr.userEmail, "uspeertutoring@hw.com"].filter(Boolean);
        const subject = `Class Request Approved: ${className}`;
        const text = buildApprovalEmail({ userName: curr.userName, subjectName, className });
        const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;
        for (const to of toList) {
          const raw = makeEmail({ from, to, subject, text });
          await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        }
      } catch (err) {
        console.error("Email send failed on approval", err?.response?.data || err);
      }
    } catch (err) {
      console.error("Failed to grant approved class", err);
    }
  }
);

// Auto-add hour when a tutoring session is completed
export const onSessionCompleted = onDocumentUpdated(
  {
    document: "Sessions/{sessionId}",
    region: "us-central1",
    timeoutSeconds: 540,
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before || !after) return;
    const prev = before.data() || {};
    const curr = after.data() || {};

    // Only trigger when status changes from scheduled to completed
    if (prev.status === "completed" || curr.status !== "completed") return;

    const tutorUid = curr.tutorUid;
    const tutorName = curr.tutorName;
    const slot = curr.slot || {};
    
    if (!tutorUid || !slot.date || !slot.cycleDay || !slot.block) {
      console.error("Missing required fields for hour tracking");
      return;
    }

    try {
      // Add an hour entry to the Hours collection
      await db.collection("Hours").add({
        tutorUid,
        tutorName: tutorName || null,
        tutorEmail: curr.tutorEmail || null,
        date: slot.date,
        cycleDay: slot.cycleDay,
        block: slot.block,
        subject: curr.subject || null,
        class: curr.class || null,
        studentName: curr.name || null,
        type: "completed_session", // vs "self_reported"
        sessionId: event.params.sessionId,
        createdAt: new Date().toISOString(),
      });
      console.log(`Added hour for tutor ${tutorName} (${tutorUid})`);
    } catch (err) {
      console.error("Failed to add hour entry", err);
    }
  }
);

// Scheduled function to auto-complete sessions after their date has passed
// Runs daily at 2 AM (US Central Time)
export const autoCompletePassedSessions = onSchedule(
  {
    schedule: "0 2 * * *", // Daily at 2 AM
    timeZone: "America/Chicago", // US Central Time
    region: "us-central1",
    timeoutSeconds: 540,
  },
  async () => {
    console.log("Running auto-complete for passed sessions...");
    
    try {
      // Get today's date at midnight (start of day)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Query all scheduled sessions
      const sessionsSnap = await db.collection("Sessions").where("status", "==", "scheduled").get();
      
      if (sessionsSnap.empty) {
        console.log("No scheduled sessions found");
        return;
      }
      
      let completedCount = 0;
      const batch = db.batch();
      
      sessionsSnap.forEach((doc) => {
        const session = doc.data() || {};
        const sessionDate = session.slot?.date;
        
        if (!sessionDate) {
          console.log(`Session ${doc.id} has no date, skipping`);
          return;
        }
        
        // Parse the date (MM/DD/YYYY format)
        const dateParts = sessionDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!dateParts) {
          console.log(`Session ${doc.id} has invalid date format: ${sessionDate}`);
          return;
        }
        
        const [, month, day, year] = dateParts.map(Number);
        const sessionDateObj = new Date(year, month - 1, day);
        sessionDateObj.setHours(0, 0, 0, 0);
        
        // If the session date is before today, mark it as completed
        if (sessionDateObj < today) {
          batch.update(doc.ref, { 
            status: "completed",
            autoCompletedAt: new Date().toISOString()
          });
          completedCount++;
          console.log(`Marking session ${doc.id} as completed (date: ${sessionDate})`);
        }
      });
      
      if (completedCount > 0) {
        await batch.commit();
        console.log(`Successfully auto-completed ${completedCount} session(s)`);
      } else {
        console.log("No sessions needed to be auto-completed");
      }
    } catch (err) {
      console.error("Error in autoCompletePassedSessions:", err);
    }
  }
);