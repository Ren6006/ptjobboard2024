// index.js (Firebase Functions Gen2, ESM)

// ---- Imports (ESM at top) ----
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";   // Admin init for ref.get()
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ---- Init Admin (once) ----
initializeApp();
const db = getFirestore();

// ---- Secrets (SMTP credentials stored securely) ----
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASSWORD = defineSecret("SMTP_PASSWORD");

// ---- Catalog (for friendly block names; keep in sync with public/catalog.js) ----
const blocksCatalog = {
  A: "Block A",
  B: "Block B",
  C: "Block C",
  D: "Block D",
  E: "Block E",
  F: "Block F",
  G: "Block G",
  L: "Lunch",
  DS: "Directed Study",
  CC: "Co-Curricular (3:15-4:00)",
  M10: "Soph. Seminar",
  M11: "Junior Seminar",
  M12: "Senior Seminar",
  FC: "Faculty Collaboration",
  CT: "Community Time",
  OH: "Office Hours",
};

// ---- SMTP Email Configuration ----
// Creates a nodemailer transporter for sending emails via Gmail SMTP
function createEmailTransporter() {
  const smtpUser = (SMTP_USER.value() || process.env.SMTP_USER || "uspeertutoring@gmail.com").trim();
  const smtpPassword = (SMTP_PASSWORD.value() || process.env.SMTP_PASSWORD || "").trim();
  
  console.log("SMTP Config:", {
    user: smtpUser,
    passwordLength: smtpPassword.length
  });
  
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });
}

// ---- Helper: Send Email via SMTP ----
// Sends an email using the SMTP transporter
async function sendEmail({ from, to, subject, text }) {
  const transporter = createEmailTransporter();
  
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  }
}

// ---- Firestore Trigger (Gen2) ----
// Sends confirmation email when a new tutoring session is created
export const confirmSessionEmail = onDocumentCreated(
  {
    document: "Sessions/{sessionId}",
    region: "us-central1",
    timeoutSeconds: 540,
    // memoryMiB: 256, // optional tuning
    secrets: [SMTP_USER, SMTP_PASSWORD],
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
        await sendEmail({ from, to, subject, text: msgBody });
        console.log("Email sent to", to);
      } catch (err) {
        console.error("Error sending email to", to, err);
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
// Sends email notification when class request is created
export const onClassRequestCreated = onDocumentCreated(
  {
    document: "ClassRequests/{requestId}",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [SMTP_USER, SMTP_PASSWORD],
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
          const toList = [request.userEmail, "uspeertutoring@hw.com"].filter(Boolean);
          const subject = `Class Request Approved: ${className}`;
          const text = buildApprovalEmail({ userName: request.userName, subjectName, className });
          const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;
          for (const to of toList) {
            await sendEmail({ from, to, subject, text });
          }
        } catch (err) {
          console.error("Email send failed for auto-approval", err);
        }
      } else {
        // Not auto-approved - send notification to subject lead and admin
        try {
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
            await sendEmail({ from, to, subject, text });
            console.log("Class request notification sent to", to);
          }
        } catch (err) {
          console.error("Email send failed for class request notification", err);
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
    secrets: [SMTP_USER, SMTP_PASSWORD],
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
        const toList = [curr.userEmail, "uspeertutoring@hw.com"].filter(Boolean);
        const subject = `Class Request Approved: ${className}`;
        const text = buildApprovalEmail({ userName: curr.userName, subjectName, className });
        const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;
        for (const to of toList) {
          await sendEmail({ from, to, subject, text });
        }
      } catch (err) {
        console.error("Email send failed on approval", err);
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
    
    if (!tutorUid || !slot.date || !slot.block) {
      console.error("Missing required fields for hour tracking", { tutorUid, slot });
      return;
    }

    try {
      // Add an hour entry to the Hours collection
      await db.collection("Hours").add({
        tutorUid,
        tutorName: tutorName || null,
        tutorEmail: curr.tutorEmail || null,
        date: slot.date,
        cycleDay: slot.cycleDay || null,
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

// Sends email to matching tutors when a tutoring request is created
// Finds tutors who can teach the subject and have availability during requested times
export const onTutoringRequestCreated = onDocumentCreated(
  {
    document: "Requests/{requestId}",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [SMTP_USER, SMTP_PASSWORD],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const request = snap.data() || {};
    const { name, email, subject, class: className, topic, location, grade, availability } = request;

    if (!subject || !availability || !Array.isArray(availability) || availability.length === 0) {
      console.log("Request missing subject or availability, skipping email");
      return;
    }

    try {
      // Find all users who can teach this subject (have the class approved)
      // Query all users who have this class in their approved classes array
      const tutorsSnap = await db.collection("users")
        .where("classes", "array-contains", className)
        .get();
      
      if (tutorsSnap.empty) {
        console.log(`No users found with ${className} in their approved classes`);
        return;
      }

      // For each tutor, check if they:
      // 1. Have the class/subject approved
      // 2. Have availability on at least one of the requested time slots
      const matchingTutors = new Map(); // tutorEmail -> {tutorName, tutorUid, tutorEmail, availableSlots}

      for (const tutorDoc of tutorsSnap.docs) {
        const tutorData = tutorDoc.data() || {};
        const tutorEmail = tutorData.email;
        const tutorName = tutorData.name || tutorData.displayName || "Tutor";
        const tutorUid = tutorDoc.id;

        if (!tutorEmail || tutorData.deleted) continue;

        // Check availability (stored as 'availability' map field on user doc: "Day_Block" -> boolean)
        const tutorAvailability = tutorData.availability || {};
        
        // Find which requested slots this tutor can cover
        const availableSlots = [];
        for (const slot of availability) {
          // slot = { date: "MM/DD/YYYY", block: "BlockCode", cycleDay: "1".."6" }
          if (!slot.cycleDay || !slot.block) continue;
          
          // Key format in user availability map: "Day_Block" (e.g. "1_A", "3_FC")
          const key = `${slot.cycleDay}_${slot.block}`;
          
          if (tutorAvailability[key] === true) {
            availableSlots.push(slot);
          }
        }

        // If tutor can cover at least one slot, add them to matching tutors
        if (availableSlots.length > 0) {
          matchingTutors.set(tutorEmail, {
            tutorName,
            tutorUid,
            tutorEmail,
            availableSlots
          });
        }
      }

      // Send emails to all matching tutors (one email per tutor with all their available slots)
      if (matchingTutors.size > 0) {
        console.log(`Found ${matchingTutors.size} matching tutor(s)`);
        const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;

        for (const [, tutorInfo] of matchingTutors) {
          try {
            const slotList = tutorInfo.availableSlots
              .map(s => `  • ${s.date} - ${blocksCatalog[s.block] || s.block}`)
              .join("\n");

            const emailSubject = `📌 New Tutoring Request: ${className} (${subject})`;
            const text = `Hello ${tutorInfo.tutorName},

A student is looking for tutoring help and you might be a great fit!

📚 Class: ${className}
🎯 Subject: ${subject}
💬 Topic: ${topic || "Not specified"}
👤 Student: ${name}
📧 Email: ${email}
📍 Location: ${location || "Learning Center"}
🎓 Grade: ${grade || "Not specified"}

✅ You are available during these requested times:
${slotList}

To accept this request, log in to the board and look for this request to schedule a session.

Thank you,
HW Peer Tutoring`;

            await sendEmail({
              from,
              to: tutorInfo.tutorEmail,
              subject: emailSubject,
              text
            });
            console.log(`Email sent to tutor ${tutorInfo.tutorName} (${tutorInfo.tutorEmail})`);
          } catch (err) {
            console.error(`Failed to send email to tutor ${tutorInfo.tutorEmail}`, err);
          }
        }
      } else {
        console.log("No tutors found who can teach this class and are available at the requested times");
      }
    } catch (err) {
      console.error("onTutoringRequestCreated error", err);
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

// Notify student when a session is cancelled
export const onSessionCancelled = onDocumentUpdated(
  {
    document: "Sessions/{sessionId}",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [SMTP_USER, SMTP_PASSWORD],
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before || !after) return;

    const prev = before.data() || {};
    const curr = after.data() || {};

    // Only proceed if status changed TO "cancelled"
    if (prev.status === "cancelled" || curr.status !== "cancelled") return;

    const studentEmail = curr.email;
    const studentName = curr.name || "Student";
    const tutorName = curr.tutorName || "Tutor";
    
    // Use safe access for slot details
    const sessionDate = curr.slot?.date || "TBD";
    const sessionBlock = blocksCatalog[curr.slot?.block] || curr.slot?.block || "TBD";
    const className = curr.class || curr.subject || "Tutoring";

    if (!studentEmail) {
      console.log("No student email found for cancelled session");
      return;
    }

    const subject = `❌ Session Cancelled: ${className} on ${sessionDate}`;
    const text = `Hello ${studentName},

Your tutoring session has been cancelled.

📅 Date: ${sessionDate}
🕒 Block: ${sessionBlock}
📖 Class: ${className}
👤 Tutor: ${tutorName}

If you still need help, please submit a new request on the board.

Thank you,
HW Peer Tutoring`;

    const from = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;
    
    // Send to student and admin
    const recipients = [studentEmail, "uspeertutoring@hw.com"];

    for (const to of recipients) {
      try {
        await sendEmail({ from, to, subject, text });
        console.log(`Cancellation email sent to ${to}`);
      } catch (err) {
        console.error(`Failed to send cancellation email to ${to}`, err);
      }
    }
  }
);

// ---- Admin user management (callable from admin.html) ----
const ADMIN_ROLES = new Set(["Admin", "Head", "Developer"]);
const ALLOWED_EMAIL_RE = /@(hwemail|hw)\.com$/i;

async function requireAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.collection("users").doc(uid).get();
  const role = snap.exists ? snap.data()?.role : null;
  if (!ADMIN_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return { uid, role };
}

// Create a Firebase Auth account plus its users/{uid} profile
export const adminCreateUser = onCall(
  { region: "us-central1" },
  async (request) => {
    const caller = await requireAdmin(request);
    const name = String(request.data?.name || "").trim();
    const email = String(request.data?.email || "").trim().toLowerCase();
    const password = String(request.data?.password || "");
    const role = String(request.data?.role || "student");

    if (!name) throw new HttpsError("invalid-argument", "Name is required.");
    if (!ALLOWED_EMAIL_RE.test(email)) {
      throw new HttpsError("invalid-argument", "Email must end with @hwemail.com or @hw.com.");
    }
    if (password.length < 6) {
      throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
    }

    let userRecord;
    try {
      userRecord = await getAuth().createUser({ email, password, displayName: name });
    } catch (err) {
      if (err?.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "An account with that email already exists.");
      }
      console.error("createUser failed", err);
      throw new HttpsError("internal", err?.message || "Failed to create user.");
    }

    await db.collection("users").doc(userRecord.uid).set(
      {
        name,
        email,
        role,
        created_at: FieldValue.serverTimestamp(),
        createdBy: caller.uid,
      },
      { merge: true }
    );

    return { uid: userRecord.uid };
  }
);

// Permanently delete a Firebase Auth account and its users/{uid} profile
export const adminDeleteUser = onCall(
  { region: "us-central1" },
  async (request) => {
    const caller = await requireAdmin(request);
    const uid = String(request.data?.uid || "").trim();
    if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
    if (uid === caller.uid) {
      throw new HttpsError("failed-precondition", "You cannot delete your own account.");
    }

    try {
      await getAuth().deleteUser(uid);
    } catch (err) {
      // If the auth account is already gone, still clean up the profile
      if (err?.code !== "auth/user-not-found") {
        console.error("deleteUser failed", err);
        throw new HttpsError("internal", err?.message || "Failed to delete auth account.");
      }
    }
    await db.collection("users").doc(uid).delete();
    return { ok: true };
  }
);
