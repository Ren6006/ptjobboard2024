// Email sending via Gmail SMTP (nodemailer).
// Kept separate from index.js so it can be exercised directly by a test
// script with real credentials, without loading the Cloud Functions.

import nodemailer from "nodemailer";

export const FROM_ADDRESS = `"HW Peer Tutoring" <uspeertutoring@gmail.com>`;

// Creates a transporter for Gmail SMTP (STARTTLS on 587)
export function createEmailTransporter({ user, pass }) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
  });
}

// Sends one plain-text email. Throws on failure so callers can log per-recipient.
export async function sendEmailWith(credentials, { from = FROM_ADDRESS, to, subject, text }) {
  const transporter = createEmailTransporter(credentials);
  try {
    const info = await transporter.sendMail({ from, to, subject, text });
    console.log("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("Failed to send email:", error);
    throw error;
  } finally {
    transporter.close();
  }
}
