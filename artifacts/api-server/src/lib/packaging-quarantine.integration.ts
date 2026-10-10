// Run explicitly against the development database/storage; cleans up only its own fixtures.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pino from "pino";
import { eq } from "drizzle-orm";
import { db, packagingBatches, packagingDocuments, pool } from "@workspace/db";
import router from "../routes/packaging-documents";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { evidenceDigest } from "./packaging-scan-worker";

const owner = `scan-test-${randomUUID()}`;
const app = express();
// Test-only identity injection on an ephemeral loopback server; never mounted by the application.
app.use((req, _res, next) => {
  req.isAuthenticated = (() => req.get("x-test-owner") !== undefined) as typeof req.isAuthenticated;
  req.user = { id: req.get("x-test-owner") } as typeof req.user;
  req.log = pino({ enabled: false });
  next();
});
app.use(router);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address() as { port: number };
const [batch] = await db.select().from(packagingBatches).limit(1);
assert.ok(batch, "Seed at least one development batch first");
const endpoint = `http://127.0.0.1:${address.port}/packaging/batches/${batch.id}/documents`;
const headers = { "x-test-owner": owner };
const storage = new ObjectStorageService();
try {
  const bytes = Buffer.from("%PDF-1.4\nexample\n%%EOF");
  const uploaded = await fetch(endpoint, {
    method: "POST", headers: { ...headers, "content-type": "application/octet-stream", "x-document-name": "scan-test.pdf", "x-document-kind": "inspection_report" },
    body: bytes,
  });
  assert.equal(uploaded.status, 201);
  const doc = await uploaded.json() as { id: string; scanStatus: string };
  assert.equal(doc.scanStatus, "pending");
  const url = `${endpoint}/${doc.id}/download`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { "x-test-owner": "other-user" } })).status, 404);
  for (const scanStatus of ["pending", "rejected", "scan_error", "unexpected"]) {
    await db.update(packagingDocuments).set({ scanStatus }).where(eq(packagingDocuments.id, doc.id));
    assert.equal((await fetch(url, { headers })).status, 423);
  }
  await db.update(packagingDocuments).set({ scanStatus: "clean" }).where(eq(packagingDocuments.id, doc.id));
  assert.equal((await fetch(url, { headers })).status, 423, "clean without digest remains blocked");
  await db.update(packagingDocuments).set({ scanSha256: evidenceDigest(bytes) }).where(eq(packagingDocuments.id, doc.id));
  const downloaded = await fetch(url, { headers });
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  const list = await (await fetch(endpoint, { headers })).json() as Record<string, unknown>[];
  assert.ok(list.every(row => !("objectPath" in row) && !("scanSha256" in row) && !("ownerId" in row)));
  assert.deepEqual(await (await fetch(endpoint, { headers: { "x-test-owner": "other-user" } })).json(), []);
  const file = await storage.getObjectEntityFile(`/objects/packaging/${doc.id}`);
  await file.save(Buffer.from("%PDF-1.4\nchanged\n%%EOF"), { resumable: false });
  assert.equal((await fetch(url, { headers })).status, 423);
  const [changed] = await db.select().from(packagingDocuments).where(eq(packagingDocuments.id, doc.id));
  assert.equal(changed.scanStatus, "pending");
  assert.equal(changed.scanSha256, null);
  const [unchangedBatch] = await db.select().from(packagingBatches).where(eq(packagingBatches.id, batch.id));
  assert.deepEqual(unchangedBatch, batch, "upload and scan status must not alter certification/batch data");
  console.log("Quarantine integration checks passed");
} finally {
  const docs = await db.select().from(packagingDocuments).where(eq(packagingDocuments.ownerId, owner));
  for (const doc of docs) {
    const path = `${storage.getPrivateObjectDir()}/packaging/${doc.id}`;
    const [bucket, ...parts] = path.replace(/^\//, "").split("/");
    await objectStorageClient.bucket(bucket).file(parts.join("/")).delete({ ignoreNotFound: true });
  }
  await db.delete(packagingDocuments).where(eq(packagingDocuments.ownerId, owner));
  server.close();
  await pool.end();
}
