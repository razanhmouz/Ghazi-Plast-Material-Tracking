import { db, qualityNotifications } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { deliverDecisionEmail } from "./quality-email";
import { logger } from "./logger";

let started = false;
let busy = false;
export function startQualityEmailWorker() {
  if (started) return;
  started = true;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Never automatically replay a send after a crash or ambiguous response.
      await db.update(qualityNotifications).set({
        status: "unknown", error: "Sending was interrupted. Check Gmail Sent mail before sending again.", updatedAt: new Date(),
      }).where(and(eq(qualityNotifications.status, "sending"), lt(qualityNotifications.updatedAt, new Date(Date.now() - 5 * 60000))));
      const item = await db.transaction(async tx => {
        const [next] = await tx.select().from(qualityNotifications).where(eq(qualityNotifications.status, "queued"))
          .orderBy(qualityNotifications.createdAt).limit(1).for("update", { skipLocked: true });
        if (!next) return undefined;
        await tx.update(qualityNotifications).set({ status: "sending", updatedAt: new Date() })
          .where(eq(qualityNotifications.requestId, next.requestId));
        return next;
      });
      if (!item) return;
      const result = await deliverDecisionEmail(item);
      await db.update(qualityNotifications).set({
        status: result.status, error: result.error ?? null, messageId: result.messageId ?? null,
        sentAt: result.status === "sent" ? new Date() : null, updatedAt: new Date(),
      }).where(and(eq(qualityNotifications.requestId, item.requestId), eq(qualityNotifications.status, "sending")));
    } catch {
      logger.error("Quality email worker failed; queued records are retained");
    } finally { busy = false; }
  };
  void tick();
  setInterval(() => void tick(), 5000).unref();
}
