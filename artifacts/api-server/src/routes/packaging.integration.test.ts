// Run against the development workflows:
// pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/routes/packaging.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, packagingBatches, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePackagingBatchResponse, ListPackagingBatchesResponse } from "@workspace/api-zod";

const lotId = `ALLOCATION-TEST-${randomUUID()}`;
const base = {
  lotId, category: "ink", materialName: "Allocation test", supplierName: "Test supplier",
  supplierCountry: "", supplierContact: "", quantity: 5, unit: "kg", status: "pending",
  complianceStatus: "pending", documentRef: "", complianceNotes: "",
  finishedBatches: ["LEGACY-A", "LEGACY-B"], destinations: ["Legacy customer"],
};
const allocation = { finishedLotId: "FIN-A", customer: "Customer A", quantity: 125, unit: "pieces" };
async function request(path: string, method = "GET", data?: unknown) {
  const response = await fetch(`http://localhost:80/api/packaging/batches${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body: unknown = await response.json();
  return { status: response.status, body };
}
try {
  const created = await request("", "POST", base);
  assert.equal(created.status, 201);
  const record = CreatePackagingBatchResponse.parse(created.body);
  assert.deepEqual(record.allocations, []);
  const path = `/${record.id}`;
  const allocations = [allocation, { ...allocation, customer: "Customer B", quantity: 75 }];
  const saved = await request(path, "PUT", { ...base, allocations });
  assert.equal(saved.status, 200);
  assert.deepEqual(CreatePackagingBatchResponse.parse(saved.body).allocations, allocations);
  assert.deepEqual(CreatePackagingBatchResponse.parse(saved.body).finishedBatches, base.finishedBatches);
  const omitted = await request(path, "PUT", base);
  assert.deepEqual(CreatePackagingBatchResponse.parse(omitted.body).allocations, allocations);
  const listed = await request("");
  assert.deepEqual(ListPackagingBatchesResponse.parse(listed.body).find(b => b.lotId === lotId)?.allocations, allocations);
  for (const invalid of [
    [{ ...allocation, quantity: 0 }], [{ ...allocation, quantity: -1 }],
    [{ ...allocation, quantity: 1.5 }], [{ ...allocation, quantity: 1e10 }],
    [{ ...allocation, quantity: "125" }], [{ ...allocation, unit: "unknown" }],
    [{ ...allocation, customer: " " }], [{ ...allocation, finishedLotId: " " }],
    [allocation, { ...allocation, customer: " Customer A " }],
    [allocation, { ...allocation, customer: "Customer B", unit: "kg" }],
  ]) {
    assert.equal((await request(path, "PUT", { ...base, allocations: invalid })).status, 400);
  }
  const decimal = await request(path, "PUT", { ...base, allocations: [{ ...allocation, quantity: 1.25, unit: "kg" }] });
  assert.equal(decimal.status, 200);
  const cleared = await request(path, "PUT", { ...base, allocations: [] });
  assert.deepEqual(CreatePackagingBatchResponse.parse(cleared.body).allocations, []);
  assert.deepEqual(CreatePackagingBatchResponse.parse(cleared.body).destinations, base.destinations);
  console.info("Allocation integration checks passed.");
} finally {
  await db.delete(packagingBatches).where(eq(packagingBatches.lotId, lotId));
  await pool.end();
}
