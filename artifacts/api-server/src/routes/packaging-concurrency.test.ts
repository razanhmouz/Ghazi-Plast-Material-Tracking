import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { db, pool, packagingBatches, packagingAllocationHistory } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreatePackagingBatchResponse } from "@workspace/api-zod";
import router from "./packaging";

function conflict(body: unknown) {
  assert.ok(body && typeof body === "object" && "code" in body && "current" in body);
  assert.equal(body.code, "EDIT_CONFLICT");
  return CreatePackagingBatchResponse.parse(body.current);
}

// Real router and PostgreSQL: no mocked concurrency predicate or running workflow.
test("Packaging optimistic concurrency", async t => {
  const app = express().use(express.json()).use(router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/packaging/batches`;
  const ids: string[] = [];
  const input = {
    lotId: "", category: "ink", materialName: "Concurrency regression", supplierName: "Test supplier",
    supplierCountry: "", supplierContact: "", quantity: 5, unit: "kg", status: "pending",
    complianceStatus: "pending", documentRef: "", complianceNotes: "",
    finishedBatches: [], destinations: [], allocations: [],
  };
  const allocation = { finishedLotId: "FIN", customer: "Customer", quantity: 10, unit: "pieces" };
  async function request(path: string, method: string, data: unknown) {
    const response = await fetch(url + path, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }
  async function create() {
    const result = await request("", "POST", { ...input, lotId: `CAS-TEST-${randomUUID()}` });
    assert.equal(result.status, 201);
    const batch = CreatePackagingBatchResponse.parse(result.body);
    ids.push(batch.id);
    return batch;
  }
  async function stored(id: string) {
    const [row] = await db.select().from(packagingBatches).where(eq(packagingBatches.id, id));
    return row;
  }
  try {
    await t.test("simultaneous PUTs: exactly one winner, conflict contains winner, no lost allocation", async () => {
      const batch = await create();
      const results = await Promise.all(["A", "B"].map(customer =>
        request(`/${batch.id}`, "PUT", { ...batch, expectedUpdatedAt: batch.updatedAt, allocations: [{ ...allocation, customer }] })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const winner = CreatePackagingBatchResponse.parse(results.find(r => r.status === 200)!.body);
      const loser = results.find(r => r.status === 409)!.body;
      assert.deepEqual(conflict(loser), winner);
      assert.ok(Date.parse(winner.updatedAt) > Date.parse(batch.updatedAt));
      assert.deepEqual((await stored(batch.id)).data.allocations, winner.allocations);
      const history = await db.select().from(packagingAllocationHistory).where(eq(packagingAllocationHistory.batchId, batch.id));
      assert.equal(history.length, 1, "Rejected writes must not produce history");
      assert.deepEqual(history[0].after, winner.allocations);
    });
    await t.test("missing, blank and malformed preconditions reject without writing", async () => {
      const batch = await create();
      for (const expectedUpdatedAt of [undefined, "", "not-a-date"]) {
        const result = await request(`/${batch.id}`, "PUT", { ...batch, expectedUpdatedAt, allocations: [allocation] });
        assert.equal(result.status, 400);
        const row = await stored(batch.id);
        assert.deepEqual(row.data.allocations, []);
        assert.equal(row.updatedAt.toISOString(), batch.updatedAt);
      }
    });
    await t.test("stale empty allocations cannot clear newer entries; reviewed clear can", async () => {
      const batch = await create();
      const saved = await request(`/${batch.id}`, "PUT", { ...batch, expectedUpdatedAt: batch.updatedAt, allocations: [allocation] });
      assert.equal(saved.status, 200);
      const savedBatch = CreatePackagingBatchResponse.parse(saved.body);
      const stale = await request(`/${batch.id}`, "PUT", { ...batch, expectedUpdatedAt: batch.updatedAt, allocations: [] });
      assert.equal(stale.status, 409);
      assert.deepEqual(conflict(stale.body), savedBatch);
      assert.deepEqual((await stored(batch.id)).data.allocations, [allocation]);
      const { allocations: _allocations, ...omitted } = savedBatch;
      const retained = await request(`/${batch.id}`, "PUT", { ...omitted, expectedUpdatedAt: savedBatch.updatedAt });
      assert.equal(retained.status, 200);
      const retainedBatch = CreatePackagingBatchResponse.parse(retained.body);
      assert.deepEqual(retainedBatch.allocations, [allocation]);
      const cleared = await request(`/${batch.id}`, "PUT", { ...retainedBatch, expectedUpdatedAt: retainedBatch.updatedAt, allocations: [] });
      assert.equal(cleared.status, 200);
      assert.deepEqual((await stored(batch.id)).data.allocations, []);
    });
    await t.test("legacy microseconds accept serialized milliseconds and advance even ahead of the clock", async () => {
      const batch = await create();
      // A future value deterministically exercises greatest(previous + 1ms, now).
      await db.update(packagingBatches).set({ updatedAt: sql`'2099-01-01T00:00:00.123456Z'::timestamptz` })
        .where(eq(packagingBatches.id, batch.id));
      const token = (await stored(batch.id)).updatedAt.toISOString();
      assert.equal(token, "2099-01-01T00:00:00.123Z");
      const result = await request(`/${batch.id}`, "PUT", { ...batch, expectedUpdatedAt: token, allocations: [allocation] });
      assert.equal(result.status, 200);
      assert.equal(CreatePackagingBatchResponse.parse(result.body).updatedAt, "2099-01-01T00:00:00.124Z");
      const stale = await request(`/${batch.id}`, "PUT", { ...batch, expectedUpdatedAt: token, allocations: [] });
      assert.equal(stale.status, 409);
      conflict(stale.body);
      assert.deepEqual((await stored(batch.id)).data.allocations, [allocation]);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const id of ids) {
      await db.delete(packagingAllocationHistory).where(eq(packagingAllocationHistory.batchId, id));
      await db.delete(packagingBatches).where(eq(packagingBatches.id, id));
    }
    await pool.end();
  }
});
