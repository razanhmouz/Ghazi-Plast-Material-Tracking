import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Kept independently of deletable decision history to prevent replayed sends.
export const qualityNotifications = pgTable("quality_notifications", {
  requestId: text("request_id").primaryKey(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  messageId: text("message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
