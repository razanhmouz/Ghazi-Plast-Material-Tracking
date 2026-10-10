// Run against development workflows:
// pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/routes/packaging-correction-reason.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, packagingBatches, packagingAllocationHistory, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePackagingBatchResponse, ListPackagingAllocationHistoryResponse } from "@workspace/api-zod";

const base = {
  lotId: `REASON-TEST-${randomUUID()}`, category: "ink", materialName: "Reason test",
  supplierName: "Test supplier", supplierCountry: "", supplierContact: "",
  quantity: 5, unit: "kg", status: "pending", complianceStatus: "pending",
  documentRef: "", complianceNotes: "", finishedBatches: [], destinations: [],
  allocations: [{ finishedLotId: "FIN-TEST", customer: "Test customer", quantity: 10, unit: "pieces" }],
};
let id: string | undefined;
async function request(path: string, method = "GET", data?: unknown) {
  const response = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}/api/packaging/batches${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}
try {
  const created = await request("", "POST", base);
  assert.equal(created.status, 201);
  let record = CreatePackagingBatchResponse.parse(created.body);
  id = record.id;
  const history = async () => {
    const result = await request(`/${id}/allocation-history`);
    assert.equal(result.status, 200);
    return ListPackagingAllocationHistoryResponse.parse(result.body).items;
  };
  const original = (await history())[0];
  assert.equal(original.correctionReason, null);
  const oldVersion = record.updatedAt;
  const allocations = [{ ...base.allocations[0], quantity: 8 }];
  const saved = await request(`/${id}`, "PUT", { ...base, allocations, expectedUpdatedAt: oldVersion, correctionReason: "  Corrected customer count\nfrom source record.  " });
  assert.equal(saved.status, 200);
  record = CreatePackagingBatchResponse.parse(saved.body);
  let entries = await history();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].correctionReason, "Corrected customer count\nfrom source record.");
  assert.deepEqual(entries[0].before, base.allocations);
  assert.deepEqual(entries[0].after, allocations);
  assert.equal(entries[0].attribution, "shared_demo");
  assert.deepEqual(entries[1], original);
  const stale = await request(`/${id}`, "PUT", { ...base, expectedUpdatedAt: oldVersion, correctionReason: "Must not persist" });
  assert.equal(stale.status, 409);
  assert.equal((await history()).length, 2);
  const invalid = await request(`/${id}`, "PUT", { ...base, expectedUpdatedAt: record.updatedAt, correctionReason: "x".repeat(1001) });
  assert.equal(invalid.status, 400);
  const unchanged = await request(`/${id}`, "PUT", { ...base, allocations, expectedUpdatedAt: record.updatedAt, correctionReason: "No allocation change" });
  assert.equal(unchanged.status, 200);
  record = CreatePackagingBatchResponse.parse(unchanged.body);
  assert.equal((await history()).length, 2);
  const cleared = await request(`/${id}`, "PUT", { ...base, allocations: [], expectedUpdatedAt: record.updatedAt, correctionReason: " \n " });
  assert.equal(cleared.status, 200);
  record = CreatePackagingBatchResponse.parse(cleared.body);
  entries = await history();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].correctionReason, null);
  assert.deepEqual(entries[0].after, []);
  const omitted = await request(`/${id}`, "PUT", { ...base, expectedUpdatedAt: record.updatedAt });
  assert.equal(omitted.status, 200);
  assert.equal((await history())[0].correctionReason, null);
  const [stored] = await db.select().from(packagingBatches).where(eq(packagingBatches.id, id));
  assert.equal("correctionReason" in stored.data, false);
  console.info("Correction reason integration checks passed.");
} finally {
  if (id) {
    await db.delete(packagingAllocationHistory).where(eq(packagingAllocationHistory.batchId, id));
    await db.delete(packagingBatches).where(eq(packagingBatches.id, id));
  }
  await pool.end();
}
