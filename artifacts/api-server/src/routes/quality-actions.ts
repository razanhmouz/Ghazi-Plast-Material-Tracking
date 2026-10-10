import { Router, type IRouter } from "express";
import { db, productionRuns, qualityActions } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { ListQualityActionsResponse, RecordQualityActionBody, RecordQualityActionResponse, DeleteQualityActionParams } from "@workspace/api-zod";

const router: IRouter = Router();
const serialize = (r: typeof qualityActions.$inferSelect) => ({...r, createdAt: r.createdAt.toISOString()});

router.get("/quality-actions", async (_req, res): Promise<void> => {
  const rows = await db.select().from(qualityActions).orderBy(desc(qualityActions.createdAt));
  res.json(ListQualityActionsResponse.parse(rows.map(serialize)));
});

router.post("/quality-actions", async (req, res): Promise<void> => {
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
    if (created) return {row: created};
    const [existing] = await tx.select().from(qualityActions).where(eq(qualityActions.requestId, input.requestId));
    return existing && matches(existing) ? {row: existing} : {error: "Request identifier already used for a different decision.", status: 409};
  });
  if ("error" in result) { res.status(result.status ?? 400).json({error: result.error}); return; }
  res.json(RecordQualityActionResponse.parse(serialize(result.row)));
});

router.delete("/quality-actions/:requestId", async (req, res): Promise<void> => {
  const params = DeleteQualityActionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid decision identifier." }); return; }
  const [deleted] = await db.delete(qualityActions).where(eq(qualityActions.requestId, params.data.requestId)).returning({ id: qualityActions.requestId });
  if (!deleted) { res.status(404).json({ error: "This decision no longer exists." }); return; }
  res.status(204).end();
});

export default router;
