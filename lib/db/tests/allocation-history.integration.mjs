import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Run against the development API and its development database only.
test("allocation history retains exact snapshots and ignores unchanged allocations", async () => {
  const base = process.env.TEST_API_URL || `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const ids = [];
  const versions = new Map();
  const request = async (path, method = "GET", data) => {
    if (method === "PUT") data = { ...data, expectedUpdatedAt: versions.get(path) };
    const response = await fetch(`${base}${path}`, {
      method, headers: { "Content-Type": "application/json" },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = await response.json();
    if (response.ok && body.id && body.updatedAt) versions.set(`/packaging/batches/${body.id}`, body.updatedAt);
    return { status: response.status, data: body };
  };
  const a = { finishedLotId: "TEST-FG", customer: "Test customer A", quantity: 100, unit: "pieces" };
  const b = { ...a, customer: "Test customer B", quantity: 50 };
  const input = {
    lotId: `history-test-${randomUUID()}`, category: "ink", materialName: "History test",
    supplierName: "Test only", supplierCountry: "", supplierContact: "",
    quantity: 1, unit: "kg", status: "pending", complianceStatus: "pending",
    documentRef: "", complianceNotes: "", finishedBatches: [], destinations: [],
    allocations: [a, b],
  };
  try {
    const created = await request("/packaging/batches", "POST", input);
    assert.equal(created.status, 201);
    const id = created.data.id;
    ids.push(id);
    const path = `/packaging/batches/${id}`;
    const history = async () => {
      const result = await request(`${path}/allocation-history`);
      assert.equal(result.status, 200);
      return result.data;
    };
    let changes = await history();
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].before, []);
    assert.deepEqual(changes[0].after, [a, b]);
    assert.equal(changes[0].attribution, "shared_demo");
    assert.ok(Number.isFinite(Date.parse(changes[0].createdAt)));
    assert.equal((await request(path, "PUT", { ...input, allocations: [b, a] })).status, 200);
    const { allocations, ...omitted } = input;
    const preserved = await request(path, "PUT", { ...omitted, complianceNotes: "Non-allocation change" });
    assert.deepEqual(preserved.data.allocations, [b, a]);
    assert.equal((await history()).length, 1);
    const corrected = { ...a, quantity: 75 };
    assert.equal((await request(path, "PUT", { ...input, allocations: [corrected] })).status, 200);
    changes = await history();
    assert.deepEqual(changes[0].before, [b, a]);
    assert.deepEqual(changes[0].after, [corrected]);
    assert.equal((await request(path, "PUT", { ...input, allocations: [{ ...a, quantity: -1 }] })).status, 400);
    assert.equal((await history()).length, 2);
    assert.equal((await request(path, "PUT", { ...input, allocations: [] })).status, 200);
    changes = await history();
    assert.equal(changes.length, 3);
    assert.deepEqual(changes[0].before, [corrected]);
    assert.deepEqual(changes[0].after, []);
    // Only the winner of concurrent stale drafts may change allocations or history.
    const responses = await Promise.all([a, b].map(allocation =>
      request(path, "PUT", { ...input, allocations: [allocation] })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(responses.find(response => response.status === 409).data.code, "EDIT_CONFLICT");
    assert.equal((await history()).length, 4);
    const winner = responses.find(response => response.status === 200).data.allocations;
    const next = winner[0].customer === a.customer ? b : a;
    assert.equal((await request(path, "PUT", { ...input, allocations: [next] })).status, 200);
    const result = await pool.query('SELECT "before", "after" FROM packaging_allocation_history WHERE batch_id = $1', [id]);
    const concurrent = result.rows.filter(row => row.after.length === 1 && [100, 50].includes(row.after[0].quantity));
    assert.equal(concurrent.length, 2);
    const first = concurrent.find(row => row.before.length === 0);
    const second = concurrent.find(row => row.before.length === 1);
    assert.deepEqual(second.before, first.after);
    // A duplicate lot failure must not append history or change the record.
    const other = await request("/packaging/batches", "POST", { ...input, lotId: `${input.lotId}-other`, allocations: [] });
    assert.equal(other.status, 201);
    ids.push(other.data.id);
    assert.deepEqual((await request(`/packaging/batches/${other.data.id}/allocation-history`)).data, []);
    assert.equal((await request(path, "PUT", { ...input, lotId: other.data.lotId, allocations: [] })).status, 409);
    assert.equal((await history()).length, 5);
    assert.equal((await request(`/packaging/batches/${randomUUID()}/allocation-history`)).status, 404);
  } finally {
    // Only remove records created by this test.
    await pool.query("DELETE FROM packaging_allocation_history WHERE batch_id = ANY($1::text[])", [ids]);
    await pool.query("DELETE FROM packaging_batches WHERE id = ANY($1::text[])", [ids]);
    await pool.end();
  }
});
