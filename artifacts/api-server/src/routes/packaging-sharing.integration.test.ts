// Development-only regression check; runs against the configured API workflow.
// pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/routes/packaging-sharing.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, usersTable, sessionsTable, packagingTeams, packagingTeamMembers, packagingDocuments, packagingBatches, packagingAccessHistory } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createSession } from "../lib/auth";

const ids = [randomUUID(), randomUUID(), randomUUID()];
const sessions: string[] = [];
const docs: string[] = [randomUUID(), randomUUID()];
let teamId: string | undefined;
async function request(user: number | null, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`http://localhost:80/api/packaging${path}`, {
    method, headers: { "Content-Type": "application/json", ...(user === null ? {} : { Authorization: `Bearer ${sessions[user]}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Tests intentionally inspect both success and error envelopes, including absent keys.
  const responseBody: any = res.status === 204 ? undefined :
    res.headers.get("content-type")?.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, body: responseBody };
}
try {
  for (const id of ids) {
    await db.insert(usersTable).values({ id });
    sessions.push(await createSession({ user: { id, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "integration-test-only" }));
  }
  const [batch] = await db.select().from(packagingBatches).limit(1);
  assert.ok(batch, "Requires an existing development batch");
  const base = `/batches/${batch.id}/documents`;
  assert.equal((await request(null, "/teams")).status, 401);
  assert.equal((await request(null, base)).status, 401);
  const team = await request(0, "/teams", "POST", { name: "Sharing regression test" });
  assert.equal(team.status, 201);
  teamId = team.body.id;
  await db.insert(packagingDocuments).values(docs.map(id => ({
    id, ownerId: ids[0], batchId: batch.id, kind: "inspection_report", name: "test.pdf",
    contentType: "application/pdf", size: 12, objectPath: `/objects/packaging/${id}`,
  })));
  assert.equal((await request(1, base)).body.length, 0);
  assert.equal((await request(1, `/teams/${teamId}/members/${ids[1]}`, "PUT")).status, 404);
  assert.equal((await request(0, `/teams/${teamId}/members/${ids[1]}`, "PUT")).status, 204);
  assert.equal((await request(1, base)).body.length, 0, "Membership must not expose private documents");
  assert.equal((await request(0, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: teamId })).status, 200);
  const shared = await request(1, base);
  assert.deepEqual(shared.body.map((d: { id: string }) => d.id), [docs[0]]);
  assert.equal(shared.body[0].canManage, false);
  assert.equal(shared.body[0].objectPath, undefined);
  assert.equal(shared.body[0].ownerId, undefined);
  assert.equal(shared.body[0].scanSha256, undefined);
  assert.equal(shared.body[0].scanRetryAt, undefined);
  assert.equal((await request(1, `${base}/${docs[0]}/download`)).status, 423, "Team access must not bypass quarantine");
  assert.equal((await request(2, base)).body.length, 0);
  assert.equal((await request(2, `${base}/${docs[0]}/download`)).status, 404);
  assert.equal((await request(1, `${base}/${docs[1]}/download`)).status, 404);
  assert.equal((await request(1, `/batches/wrong-batch/documents/${docs[0]}/download`)).status, 404);
  assert.equal((await request(1, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: null })).status, 404);
  assert.equal((await request(2, "/teams")).body.length, 0);
  assert.equal((await request(1, "/teams")).body[0].isOwner, false);
  assert.equal((await request(1, `/teams/${teamId}/members/${ids[2]}`, "PUT")).status, 404);
  assert.equal((await request(1, `/teams/${teamId}/members/${ids[1]}`, "DELETE")).status, 404);
  assert.equal((await request(0, `/teams/${teamId}/members/${ids[1]}`, "DELETE")).status, 204);
  assert.equal((await request(1, base)).body.length, 0);
  assert.equal((await request(1, `${base}/${docs[0]}/download`)).status, 404);
  assert.equal((await request(1, "/teams")).body.length, 0);
  assert.equal((await request(0, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: null })).status, 200);
  assert.equal((await request(0, base)).body.filter((d: { id: string }) => docs.includes(d.id)).length, 2);
  const teamHistory = `/teams/${teamId}/access-history`;
  const docHistory = `${base}/${docs[0]}/access-history`;
  assert.equal((await request(null, teamHistory)).status, 401);
  assert.equal((await request(null, docHistory)).status, 401);
  for (const user of [1, 2]) {
    assert.equal((await request(user, teamHistory)).status, 404);
    assert.equal((await request(user, docHistory)).status, 404);
  }
  assert.equal((await request(0, `/batches/wrong-batch/documents/${docs[0]}/access-history`)).status, 404);
  assert.equal((await request(0, `${teamHistory}?before=oops`)).status, 400);
  let history = (await request(0, teamHistory)).body;
  assert.deepEqual(history.items.map((row: any) => row.action), ["member_removed", "member_approved"]);
  for (const row of history.items) {
    assert.equal(row.actorId, ids[0]);
    assert.equal(row.memberId, ids[1]);
    assert.ok(Number.isFinite(Date.parse(row.createdAt)));
  }
  const originalRemovalId = history.items[0].id;
  history = (await request(0, docHistory)).body;
  assert.equal(history.items.length, 2);
  assert.deepEqual(history.items.map((row: any) => [row.previousTeamId, row.nextTeamId]), [[teamId, null], [null, teamId]]);
  assert.ok(history.items.every((row: any) => row.actorId === ids[0] && row.action === "sharing_changed"));
  // Repeated no-op mutations do not fabricate history.
  await request(0, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: null });
  await request(0, `/teams/${teamId}/members/${ids[1]}`, "DELETE");
  assert.equal((await request(0, docHistory)).body.items.length, 2);
  assert.equal((await request(0, teamHistory)).body.items.length, 2);
  await request(0, `/teams/${teamId}/members/${ids[1]}`, "PUT");
  await request(0, `/teams/${teamId}/members/${ids[1]}`, "PUT");
  assert.equal((await request(0, teamHistory)).body.items.length, 3);
  assert.equal((await request(1, teamHistory)).status, 404, "Even approved members cannot read owner history");
  await request(0, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: teamId });
  assert.equal((await request(1, docHistory)).status, 404, "Read access does not grant sharing history access");
  // Concurrent sharing writes must record the actual locked previous state.
  await Promise.all([
    request(0, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: null }),
    request(0, `${base}/${docs[0]}/sharing`, "PATCH", { sharedTeamId: null }),
  ]);
  assert.equal((await request(0, docHistory)).body.items.length, 4);
  const older = (await request(0, `${teamHistory}?before=${originalRemovalId}`)).body;
  assert.deepEqual(older.items.map((row: any) => row.action), ["member_approved"]);
  assert.equal((await request(0, `${base}/${docs[1]}/access-history`)).body.items.length, 0);
  assert.equal((await request(0, docHistory, "DELETE")).status, 404, "History has no deletion endpoint");
  assert.equal((await request(0, docHistory, "PATCH", {})).status, 404, "History has no editing endpoint");
  console.info("Evidence team authorization regression checks passed.");
} finally {
  await db.delete(packagingAccessHistory).where(inArray(packagingAccessHistory.actorId, ids));
  await db.delete(packagingDocuments).where(inArray(packagingDocuments.id, docs));
  if (teamId) {
    await db.delete(packagingTeamMembers).where(eq(packagingTeamMembers.teamId, teamId));
    await db.delete(packagingTeams).where(eq(packagingTeams.id, teamId));
  }
  if (sessions.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessions));
  await db.delete(usersTable).where(inArray(usersTable.id, ids));
  await pool.end();
}
