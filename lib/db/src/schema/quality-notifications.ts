import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Kept independently of deletable decision history to prevent replayed sends.
export const qualityNotifications = pgTable("quality_notifications", {
  requestId: text("request_id").primaryKey(),
  recipient: text("recipient").notNull(),
  // Legacy rows remain Gmail records and are never rerouted through Resend.
  provider: text("provider").notNull().default("gmail"),
  sender: text("sender").notNull().default(""),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  messageId: text("message_id"),
  retryAudit: jsonb("retry_audit").$type<{ at: string; actor: string; priorStatus: string; reconciliation: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
