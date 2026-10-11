import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, qualityActions, qualityNotifications } from "@workspace/db";
import { ConfirmQualityEmailRetryBody, PreviewQualityEmailRetryParams, PreviewQualityEmailRetryResponse } from "@workspace/api-zod";
import { deliverDecisionEmail, getEmailConfiguration } from "../lib/quality-email";
import { RETRY_WINDOW_MS, retryBlock, retryVersion } from "../lib/quality-email-retry";

export function createQualityEmailRetryRouter(configuration = getEmailConfiguration, send: typeof fetch = fetch) {
const qualityEmailRetryRouter = Router();
qualityEmailRetryRouter.use("/quality-actions/:requestId/email-retry", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Log in to review or retry email." }); return; }
  next();
});

qualityEmailRetryRouter.get("/quality-actions/:requestId/email-retry", async (req, res): Promise<void> => {
  const params = PreviewQualityEmailRetryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid decision." }); return; }
  const [row] = await db.select().from(qualityNotifications).innerJoin(qualityActions, eq(qualityActions.requestId, qualityNotifications.requestId))
    .where(eq(qualityNotifications.requestId, params.data.requestId));
  if (!row) { res.status(404).json({ error: "Decision or email no longer exists." }); return; }
  const email = row.quality_notifications;
  const config = configuration();
  res.json(PreviewQualityEmailRetryResponse.parse({
    version: retryVersion(email), recipient: email.recipient, sender: email.sender,
    currentRecipient: config.recipient ?? "Not configured",
    subject: email.subject, body: email.body,
    requiresReconciliation: email.status === "unknown" || !!email.error?.includes("idempotency conflict"),
    blockedReason: retryBlock(email, config),
    expiresAt: new Date(email.createdAt.getTime() + RETRY_WINDOW_MS).toISOString(),
  }));
});

qualityEmailRetryRouter.post("/quality-actions/:requestId/email-retry", async (req, res): Promise<void> => {
  const params = PreviewQualityEmailRetryParams.safeParse(req.params);
  const body = ConfirmQualityEmailRetryBody.safeParse(req.body);
  if (!params.success || !body.success || body.data.confirmed !== true) { res.status(400).json({ error: "Explicit confirmation and a current preview are required." }); return; }
  const config = configuration();
  const result = await db.transaction(async tx => {
    // Lock the decision too: deletion cannot race the retry claim.
    const [decision] = await tx.select().from(qualityActions).where(eq(qualityActions.requestId, params.data.requestId)).for("update");
    const [email] = await tx.select().from(qualityNotifications).where(eq(qualityNotifications.requestId, params.data.requestId)).for("update");
    if (!decision || !email) return { error: "Decision or email no longer exists.", code: 404 };
    if (retryVersion(email) !== body.data.version) return { error: "Email status changed. Close and review a fresh preview before retrying.", code: 409 };
    const blocked = retryBlock(email, config);
    if (blocked) return { error: blocked, code: 409 };
    const reconciliation = body.data.reconciliation?.trim() ?? "";
    if ((email.status === "unknown" || email.error?.includes("idempotency conflict")) &&
        (!body.data.logsCheckedNoAcceptance || reconciliation.length < 10)) {
      return { error: "Check Resend logs for this decision first. Confirm no email was accepted and record the log review details (at least 10 characters). If accepted or still uncertain, do not retry.", code: 400 };
    }
    const now = new Date(Math.max(Date.now(), email.updatedAt.getTime() + 1));
    const [claimed] = await tx.update(qualityNotifications).set({
      status: "sending", error: null, updatedAt: now,
      retryAudit: [...email.retryAudit, { at: now.toISOString(), actor: req.user!.id, priorStatus: email.status, reconciliation }],
    }).where(eq(qualityNotifications.requestId, email.requestId)).returning();
    return { email: claimed };
  });
  if ("error" in result) { res.status(result.code!).json({ error: result.error }); return; }
  const email = result.email!;
  // Recheck the deadline immediately before the network call, not just at preview.
  const delivery = Date.now() >= email.createdAt.getTime() + RETRY_WINDOW_MS
    ? { status: "failed" as const, error: "Safe retry window expired before sending.", messageId: undefined }
    : await deliverDecisionEmail(email, send, 30000, config);
  await db.update(qualityNotifications).set({
    status: delivery.status, error: delivery.error ?? null, messageId: delivery.messageId ?? null,
    sentAt: delivery.status === "sent" ? new Date() : null, updatedAt: new Date(),
  }).where(and(eq(qualityNotifications.requestId, email.requestId), eq(qualityNotifications.status, "sending"), eq(qualityNotifications.updatedAt, email.updatedAt)));
  res.json({ status: delivery.status });
});
return qualityEmailRetryRouter;
}
export const qualityEmailRetryRouter = createQualityEmailRetryRouter();
