import { createHash } from "node:crypto";
import type { qualityNotifications } from "@workspace/db";
import { getEmailConfiguration } from "./quality-email";

type Email = typeof qualityNotifications.$inferSelect;
// Resend retains keys for 24 hours. Creation is an earlier, conservative bound
// than the first attempted send; reserve an hour for clock/network uncertainty.
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export function retryVersion(email: Email) {
  return createHash("sha256").update(JSON.stringify(email)).digest("hex");
}
export function retryBlock(email: Email, config = getEmailConfiguration(), now = Date.now()): string | null {
  if (email.provider !== "resend") return "Historical Gmail notifications cannot be retried or migrated.";
  if (!["failed", "unknown"].includes(email.status) || email.messageId) return "Only failed or uncertain emails without an accepted message ID can be retried.";
  if (now < email.createdAt.getTime() || now >= email.createdAt.getTime() + RETRY_WINDOW_MS) return "The safe retry window has expired. No resend is allowed because Resend retains idempotency keys for only 24 hours.";
  if (config.error) return config.error;
  if (!email.sender || email.sender !== config.sender || email.recipient !== config.recipient) return "The configured sender or recipient differs from the original email. Restore the original configuration before retrying; saved contents cannot be changed.";
  return null;
}
