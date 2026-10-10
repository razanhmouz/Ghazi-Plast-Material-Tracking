// Development-only: pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/routes/packaging-scanner-health.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, usersTable, sessionsTable, packagingDocuments, packagingBatches } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createSession } from "../lib/auth";

const ids = [randomUUID(), randomUUID()];
const sessions: string[] = [];
const docId = randomUUID();
async function health(batchId: string, user?: number) {
  const response = await fetch(`http://localhost:80/api/packaging/batches/${batchId}/documents/scanner-health`, {
    headers: user === undefined ? {} : { Authorization: `Bearer ${sessions[user]}` },
  });
  // This helper covers both health and unauthenticated error envelopes.
  const body: any = await response.json();
  return { status: response.status, body };
}
try {
  for (const id of ids) {
    await db.insert(usersTable).values({ id });
    sessions.push(await createSession({ user: { id, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "integration-test-only" }));
  }
  const [batch] = await db.select().from(packagingBatches).limit(1);
  assert.ok(batch);
  assert.equal((await health(batch.id)).status, 401);
  const before = await health(batch.id, 1);
  assert.equal(before.status, 200);
  await db.insert(packagingDocuments).values({
    id: docId, ownerId: ids[0], batchId: batch.id, kind: "inspection_report",
    name: "private-test.pdf", contentType: "application/pdf", size: 12,
    objectPath: `/objects/packaging/${docId}`,
    createdAt: new Date(Date.now() - 60 * 60_000),
    scanRetryAt: new Date(), // Worker encounters missing storage and fails closed.
  });
  let scanned = false;
  for (let n = 0; n < 50; n++) {
    const [row] = await db.select().from(packagingDocuments).where(eq(packagingDocuments.id, docId));
    if (row.scanStatus === "scan_error") { scanned = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(scanned, "Worker must have attempted the private evidence scan");
  const owner = await health(batch.id, 0);
  assert.equal(owner.body.queued, 1);
  assert.equal(owner.body.errors, 1);
  assert.equal(owner.body.aging, true);
  const unrelated = await health(batch.id, 1);
  assert.equal(unrelated.status, 200);
  assert.equal(unrelated.body.queued, 0);
  assert.equal(unrelated.body.errors, 0);
  assert.equal(unrelated.body.oldestQueuedAt, null);
  assert.equal(unrelated.body.aging, false);
  // Compare within the same probe interval; probe metadata may legitimately
  // advance during the wait, but no evidence-derived field may be added.
  if (before.body.lastCheckAt === unrelated.body.lastCheckAt) {
    assert.equal(unrelated.body.status, before.body.status);
    assert.equal(unrelated.body.consecutiveFailures, before.body.consecutiveFailures);
  }
  assert.deepEqual(Object.keys(unrelated.body).sort(), [
    "status", "definitions", "definitionsCheckedAt", "lastCheckAt", "lastSuccessAt",
    "consecutiveFailures", "queued", "errors", "oldestQueuedAt", "aging",
  ].sort());
  const download = await fetch(`http://localhost:80/api/packaging/batches/${batch.id}/documents/${docId}/download`, {
    headers: { Authorization: `Bearer ${sessions[0]}` },
  });
  assert.equal(download.status, 423);
  console.info("Scanner health cross-account isolation and fail-closed download checks passed.");
} finally {
  await db.delete(packagingDocuments).where(eq(packagingDocuments.id, docId));
  if (sessions.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessions));
  await db.delete(usersTable).where(inArray(usersTable.id, ids));
  await pool.end();
}
