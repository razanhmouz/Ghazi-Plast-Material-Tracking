import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { db, pool, packagingBatches, packagingAllocationHistory } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import router from "./packaging";
import { ListPackagingAllocationHistoryResponse } from "@workspace/api-zod";

// Integration test: uses isolated records in the development database, cleaned in finally.
test("history cursor pages preserve ties, microseconds and boundaries after new writes", async () => {
  const batchId = randomUUID();
  const server = express().use(router).listen(0);
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address() as { port: number };
  const get = (query = "", id = batchId) => fetch(`http://127.0.0.1:${address.port}/packaging/batches/${id}/allocation-history${query}`);
  const pageAt = async (query = "") => {
    const response = await get(query);
    assert.equal(response.status, 200);
    return ListPackagingAllocationHistoryResponse.parse(await response.json());
  };
  const ids = Array.from({ length: 45 }, (_, i) => `${batchId}-${String(i).padStart(3, "0")}`);
  try {
    await db.insert(packagingBatches).values({
      id: batchId, lotId: batchId, demo: true,
      data: { category: "raw_material", materialName: "Pagination test", supplierName: "Test",
        supplierCountry: "", supplierContact: "", quantity: 1, unit: "kg", status: "pending",
        complianceStatus: "pending", documentRef: "", complianceNotes: "", finishedBatches: [], destinations: [] },
    });
    assert.deepEqual(await (await get()).json(), { items: [], nextCursor: null });
    await db.insert(packagingAllocationHistory).values(ids.map((id, i) => ({
      id, batchId, lotId: batchId, before: [], after: [],
      // All values serialize to the same millisecond; groups also share exact timestamps.
      createdAt: sql`'2026-01-01 00:00:00.000001+00'::timestamptz + ${Math.floor(i / 3)} * interval '1 microsecond'`,
    })));
    const first = await pageAt();
    assert.equal(first.items.length, 20);
    assert.equal(first.nextCursor, ids[25]);
    const newId = `${batchId}-new`;
    await db.insert(packagingAllocationHistory).values({ id: newId, batchId, lotId: batchId, before: [], after: [] });
    const collected = [...first.items];
    let cursor: string | null = first.nextCursor;
    while (cursor) {
      const page = await pageAt(`?cursor=${cursor}`);
      collected.push(...page.items);
      cursor = page.nextCursor;
    }
    assert.deepEqual(collected.map(row => row.id), [...ids].reverse());
    // A fresh walk uses newly returned cursors, not cached older page boundaries.
    const refreshed: string[] = [];
    cursor = null;
    do {
      const page = await pageAt(cursor ? `?cursor=${cursor}` : "");
      refreshed.push(...page.items.map((row: { id: string }) => row.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(refreshed, [newId, ...ids.reverse()]);
    assert.equal((await pageAt("?limit=1")).items.length, 1);
    const all = await pageAt("?limit=100");
    assert.equal(all.items.length, 46);
    assert.equal(all.nextCursor, null);
    for (const query of ["?limit=0", "?limit=101", "?limit=1.5", "?limit=no", "?limit=1&limit=2", "?cursor=", "?cursor=missing", "?cursor=a&cursor=b"]) {
      assert.equal((await get(query)).status, 400, query);
    }
    assert.equal((await get("", randomUUID())).status, 404);
  } finally {
    await db.delete(packagingAllocationHistory).where(eq(packagingAllocationHistory.batchId, batchId));
    await db.delete(packagingBatches).where(eq(packagingBatches.id, batchId));
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
