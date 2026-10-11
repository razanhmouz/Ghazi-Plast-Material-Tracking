import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionEmail, deliverDecisionEmail } from "./quality-email";

const decision = { requestId: "test-decision", action: "recall", batchIds: ["TEST-CUP"], rationale: "Review migration report\nHold pending review", quantity: 30, createdAt: new Date("2026-10-11T12:00:00Z") };
const runs = [{ id: "TEST-CUP", quantity: 30, materialId: "TEST-MAT", inkLot: "TEST-INK", inspectionResult: "passed", destinations: [{ name: "Test customer", quantity: 30, type: "shipped" }] }];
const notification = { requestId: decision.requestId, recipient: "test@example.invalid", ...decisionEmail(decision, runs) };

test("email snapshots all decision history fields and batch contents", () => {
  for (const field of ["Issue Recall Order", "test-decision", "TEST-CUP", "30 cups", decision.rationale, "2026-10-11T12:00:00.000Z", "TEST-INK", "TEST-MAT", "Test customer"]) assert.ok(notification.body.includes(field), field);
  assert.ok(decisionEmail({ ...decision, action: "release" }, runs).subject.includes("Release Shipment"));
});

test("Gmail acceptance returns sent and RFC message is correctly encoded", async () => {
  let calls = 0;
  const result = await deliverDecisionEmail(notification, async raw => {
    calls++;
    const mime = Buffer.from(raw, "base64url").toString();
    assert.ok(mime.includes("To: test@example.invalid"));
    assert.ok(mime.includes("Message-ID: <"));
    assert.equal(Buffer.from(mime.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString(), notification.body);
    return Response.json({ id: "gmail-test-id" });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "sent", messageId: "gmail-test-id" });
});

test("permission failures and ambiguous responses never retry automatically", async () => {
  for (const [code, status] of [[403, "failed"], [429, "failed"], [500, "unknown"]] as const) {
    let calls = 0;
    const result = await deliverDecisionEmail(notification, async () => { calls++; return new Response("", { status: code }); });
    assert.equal(result.status, status);
    assert.equal(calls, 1);
  }
  assert.equal((await deliverDecisionEmail(notification, async () => { throw new Error("Connection lost"); })).status, "unknown");
  assert.equal((await deliverDecisionEmail(notification, async () => Response.json({}))).status, "unknown");
});

test("stalled sends become uncertain rather than triggering duplicate emails", async () => {
  let calls = 0;
  const result = await deliverDecisionEmail(notification, () => { calls++; return new Promise(() => {}); }, 5);
  assert.equal(result.status, "unknown");
  assert.equal(calls, 1);
});
