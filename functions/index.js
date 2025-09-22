// index.js (Firebase Functions Gen2)

// ---- Catalog of blocks (optional, just for pretty email text) ----
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
  
  // ---- Imports (all ESM) ----
  import { onDocumentCreated } from "firebase-functions/v2/firestore";
  import { google } from "googleapis";
  
  // ---- Gmail Auth ----
  const { OAuth2 } = google.auth;
  
  async function getGmailClient() {
    const oAuth2Client = new OAuth2(
      process.env.GMAIL_CLIENT_ID || "",
      process.env.GMAIL_CLIENT_SECRET || "",
      "https://developers.google.com/oauthplayground" // redirect URI from token step
    );
  
    oAuth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || "",
    });
  
    return google.gmail({ version: "v1", auth: oAuth2Client });
  }
  
  // ---- Helper: Build raw RFC822 email ----
  function makeEmail(to, subject, message) {
    const raw = [
      `From: "HW Peer Tutoring" <uspeertutoring@hw.com>`,
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
  
  // ---- Firestore Trigger (Gen2) ----
  export const confirmSessionEmail = onDocumentCreated(
    {
      document: "Sessions/{sessionId}",
      region: "us-central1",
      timeoutSeconds: 540,
      runtime: "nodejs22",
    },
    async (event) => {
      const snap = event.data;
      if (!snap) return;
  
      // wait 5 minutes (300,000 ms)
      await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
  
      // refetch to confirm still scheduled
      const freshSnap = await snap.ref.get();
      if (!freshSnap.exists) return;
  
      const data = freshSnap.data() || {};
      if (data.status !== "scheduled") {
        console.log("Session no longer scheduled, skipping email");
        return;
      }
  
      const gmail = await getGmailClient();
  
      // Recipients: student, tutor, admin
      const recipients = [
        data.email,
        data.tutorEmail,
        "uspeertutoring@hw.com",
      ].filter(Boolean);
  
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
  
      // Send one email per recipient
      for (const to of recipients) {
        try {
          const rawMessage = makeEmail(to, subject, msgBody);
          await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw: rawMessage },
          });
          console.log("Email sent to", to);
        } catch (err) {
          console.error("Error sending email to", to, err);
        }
      }
    }
  );
  