import { Router, type IRouter } from "express";
import { db, materials, productionRuns } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { GetTraceQueryParams, GetTraceResponse, UpdateRunParams, UpdateRunBody, UpdateRunResponse, AddDestinationBody, AddDestinationParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/trace", async (req, res): Promise<void> => {
  const parsed = GetTraceQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({error: "Invalid search"}); return; }
  const search = (parsed.data.search ?? "").trim().toLowerCase();
  const allMaterials = await db.select().from(materials);
  const matched = allMaterials.filter(m => !search || [m.id, m.supplier, m.name].some(v => v.toLowerCase().includes(search)));
  const runs = matched.length ? await db.select().from(productionRuns).where(inArray(productionRuns.materialId, matched.map(m => m.id))).orderBy(productionRuns.id) : [];
  res.json(GetTraceResponse.parse({ materials: matched, runs: runs.map(run => ({...run, updatedAt: run.updatedAt.toISOString()})) }));
});

router.patch("/runs/:id", async (req, res): Promise<void> => {
  const params = UpdateRunParams.safeParse(req.params);
  const body = UpdateRunBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({error: "Invalid batch update"}); return; }
  if (body.data.checklist?.some(entry => !entry.label.trim())) {
    res.status(400).json({error: "Each checklist entry needs a non-empty label."}); return;
  }
  if (body.data.releaseDecision === "released" && body.data.inspectionResult !== "passed") {
    res.status(400).json({error: "A passed inspection is required before release."}); return;
  }
  const [run] = await db.update(productionRuns).set({...body.data, inkLot: body.data.inkLot.trim(), updatedAt: new Date()}).where(eq(productionRuns.id, params.data.id)).returning();
  if (!run) { res.status(404).json({error: "Batch not found"}); return; }
  res.json(UpdateRunResponse.parse({...run, updatedAt: run.updatedAt.toISOString()}));
});

router.post("/runs/:id/destinations", async (req, res): Promise<void> => {
  const params = AddDestinationParams.safeParse(req.params);
  const parsed = AddDestinationBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.name.trim() || parsed.data.confirmedPassed !== true) {
    res.status(400).json({ error: "Enter a destination, a positive whole quantity, and confirm the passed inspection." }); return;
  }
  const input = parsed.data;
  const result = await db.transaction(async tx => {
    const [run] = await tx.select().from(productionRuns).where(eq(productionRuns.id, params.data.id)).for("update");
    if (!run) return { status: 404, error: "Batch not found." };
    const previous = run.destinations.find(d => d.id === input.requestId);
    if (previous) {
      if (previous.name !== input.name.trim() || previous.quantity !== input.quantity || previous.type !== input.type)
        return { status: 409, error: "This request was already used for another destination." };
      return { run };
    }
    if (run.quantity + input.quantity > 2147483647)
      return { status: 400, error: "The resulting batch quantity is too large." };
    const [updated] = await tx.update(productionRuns).set({
      quantity: run.quantity + input.quantity,
      destinations: [...run.destinations, { id: input.requestId, name: input.name.trim(), quantity: input.quantity, type: input.type, inspectionResult: "passed" as const }],
      updatedAt: new Date(),
    }).where(eq(productionRuns.id, run.id)).returning();
    return { run: updated };
  });
  if (!result.run) { res.status(result.status ?? 400).json({ error: result.error }); return; }
  res.json(UpdateRunResponse.parse({ ...result.run, updatedAt: result.run.updatedAt.toISOString() }));
});

export default router;
