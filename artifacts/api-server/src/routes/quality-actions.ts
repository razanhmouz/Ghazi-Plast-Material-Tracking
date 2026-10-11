import { Router, type IRouter } from "express";
import { db, productionRuns, qualityActions, qualityNotifications } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { ListQualityActionsResponse, RecordQualityActionBody, RecordQualityActionResponse, DeleteQualityActionParams } from "@workspace/api-zod";
import { decisionEmail, getEmailConfiguration } from "../lib/quality-email";

const router: IRouter = Router();
const serialize = (r: typeof qualityActions.$inferSelect, email?: typeof qualityNotifications.$inferSelect) => ({
  ...r, createdAt: r.createdAt.toISOString(),
  emailStatus: email?.status ?? "not_requested", emailRecipient: email ? `${email.recipient.split(",").length} email recipient(s)` : undefined,
  emailError: email?.error ?? undefined, emailSentAt: email?.sentAt?.toISOString(),
});

router.get("/quality-email-settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Log in to record and email decisions." }); return; }
  const config = getEmailConfiguration();
  if (config.error) { res.status(503).json({ error: config.error }); return; }
  res.json({ recipient: config.recipient, enabled: true });
});

router.get("/quality-actions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(qualityActions).orderBy(desc(qualityActions.createdAt));
  const emails = rows.length ? await db.select().from(qualityNotifications).where(inArray(qualityNotifications.requestId, rows.map(r => r.requestId))) : [];
  const byId = new Map(emails.map(email => [email.requestId, email]));
  res.json(ListQualityActionsResponse.parse(rows.map(row => serialize(row, byId.get(row.requestId)))));
});

router.post("/quality-actions", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Log in before recording and emailing a decision." }); return; }
  const config = getEmailConfiguration();
  if (config.error) { res.status(503).json({ error: config.error }); return; }
  const { recipient, sender } = config;
  const parsed = RecordQualityActionBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.rationale.trim()) {
    res.status(400).json({error: "Select batches, an action, and a non-empty rationale."}); return;
  }
  const input = {...parsed.data, batchIds: [...new Set(parsed.data.batchIds)].sort(), rationale: parsed.data.rationale.trim()};
  const result = await db.transaction(async tx => {
    // Lock selected batches through validation and insertion, so inspection edits
    // cannot race a release decision. This never changes a shipment record.
    const runs = await tx.select().from(productionRuns).where(inArray(productionRuns.id, input.batchIds)).orderBy(productionRuns.id).for("update");
    const [prior] = await tx.select().from(qualityActions).where(eq(qualityActions.requestId, input.requestId));
    const matches = (r: typeof qualityActions.$inferSelect) =>
      r.action === input.action && r.rationale === input.rationale && JSON.stringify(r.batchIds) === JSON.stringify(input.batchIds);
    if (prior) return matches(prior) ? {row: prior} : {error: "Request identifier already used for a different decision.", status: 409};
    if (runs.length !== input.batchIds.length) return {error: "One or more batches do not exist.", status: 400};
    if (input.action === "release" && runs.some(r => r.inspectionResult !== "passed")) {
      return {error: "All selected batches must pass inspection before Release Shipment can be recorded.", status: 400};
    }
    const [created] = await tx.insert(qualityActions).values({...input, quantity: runs.reduce((sum, r) => sum + r.quantity, 0)}).onConflictDoNothing().returning();
    if (created) {
      await tx.insert(qualityNotifications).values({
        requestId: created.requestId, recipient, sender, provider: "resend", ...decisionEmail(created, runs),
      }).onConflictDoNothing();
      return {row: created};
    }
    const [existing] = await tx.select().from(qualityActions).where(eq(qualityActions.requestId, input.requestId));
    return existing && matches(existing) ? {row: existing} : {error: "Request identifier already used for a different decision.", status: 409};
  });
  if ("error" in result) { res.status(result.status ?? 400).json({error: result.error}); return; }
  const [email] = await db.select().from(qualityNotifications).where(eq(qualityNotifications.requestId, result.row.requestId));
  res.json(RecordQualityActionResponse.parse(serialize(result.row, email)));
});

router.delete("/quality-actions/:requestId", async (req, res): Promise<void> => {
  const params = DeleteQualityActionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid decision identifier." }); return; }
  const [deleted] = await db.delete(qualityActions).where(eq(qualityActions.requestId, params.data.requestId)).returning({ id: qualityActions.requestId });
  if (!deleted) { res.status(404).json({ error: "This decision no longer exists." }); return; }
  res.status(204).end();
});

export default router;
