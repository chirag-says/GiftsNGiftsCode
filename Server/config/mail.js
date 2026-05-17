/**
 * Email Configuration — Single Source of Truth
 * 
 * CONSOLIDATED: Previously split between mail.js and nodemailer.js (Issue #20)
 * SINGLETON: Transporter created once, reused for all emails (Issue #19)
 * 
 * Env vars:
 *   SMTP_EMAIL  — Gmail address for SMTP auth
 *   SMTP_PASS   — Gmail app password
 *   SENDER_EMAIL — "From" address shown to recipients (falls back to SMTP_EMAIL)
 */
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Issue #19 fix: singleton transporter — one SMTP connection pool, not one per email
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    // Support both env var names for backward compatibility
    user: process.env.SMTP_EMAIL || process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  pool: true,       // Use connection pooling
  maxConnections: 3, // Max simultaneous SMTP connections
  maxMessages: 50    // Max messages per connection before reconnect
});

// Verify SMTP connection on startup (non-blocking)
transporter.verify()
  .then(() => console.log("✅ SMTP connection verified"))
  .catch((err) => console.error("❌ SMTP connection failed:", err.message));

/**
 * Send an email using the shared transporter.
 * 
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @returns {Promise<void>}
 */
export const sendEmail = async (to, subject, html) => {
  const from = process.env.SENDER_EMAIL || process.env.SMTP_EMAIL || process.env.SMTP_USER;

  if (!to) {
    console.warn("[sendEmail] Skipped — no recipient email provided");
    return;
  }

  await transporter.sendMail({ from, to, subject, html });
};

// Export transporter for backward compatibility (auth_controller migration)
export default transporter;
