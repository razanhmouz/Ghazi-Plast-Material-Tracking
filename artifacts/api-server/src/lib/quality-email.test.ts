import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionEmail, deliverDecisionEmail, getEmailConfiguration, validateEmail } from "./quality-email";

const decision = { requestId: "test-decision", action: "recall", batchIds: ["TEST-CUP"], rationale: "Review migration report\nHold pending review", quantity: 30, createdAt: new Date("2026-10-11T12:00:00Z") };
const runs = [{ id: "TEST-CUP", quantity: 30, materialId: "TEST-MAT", inkLot: "TEST-INK", inspectionResult: "passed", destinations: [{ name: "Test customer", quantity: 30, type: "shipped" }] }];
const notification = { requestId: decision.requestId, recipient: "test@example.invalid", ...decisionEmail(decision, runs) };
const config = getEmailConfiguration({ RESEND_API_KEY: "fake-test-key", RESEND_FROM_EMAIL: "onboarding@resend.dev", QUALITY_NOTIFICATION_RECIPIENT: notification.recipient });
type MockSend = (url: string, init: RequestInit) => Promise<Response>;
const deliver = (send: MockSend, timeoutMs = 1000) => deliverDecisionEmail(notification, send, timeoutMs, config);

test("email snapshots all decision history fields and batch contents", () => {
  for (const field of ["Issue Recall Order", "test-decision", "TEST-CUP", "30 cups", decision.rationale, "2026-10-11T12:00:00.000Z", "TEST-INK", "TEST-MAT", "Test customer"]) assert.ok(notification.body.includes(field), field);
  assert.ok(decisionEmail({ ...decision, action: "release" }, runs).subject.includes("Release Shipment"));
});

test("Resend acceptance returns sent with correct JSON and server-side authentication", async () => {
  let calls = 0;
  const result = await deliver(async (url, init) => {
    calls++;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer fake-test-key");
    assert.deepEqual(JSON.parse(init.body as string), { from: "Ghazi Plast <onboarding@resend.dev>", to: [notification.recipient], subject: notification.subject, text: notification.body });
    return Response.json({ id: "resend-test-id" });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "sent", messageId: "resend-test-id" });
});

test("permission failures and ambiguous responses never retry automatically", async () => {
  for (const [code, status] of [[401, "failed"], [403, "failed"], [409, "unknown"], [422, "failed"], [429, "failed"], [500, "unknown"], [408, "unknown"]] as const) {
    let calls = 0;
    const result = await deliver(async () => { calls++; return new Response("Do not expose arbitrary provider response text", { status: code }); });
    assert.equal(result.status, status);
    assert.equal(calls, 1);
    assert.ok(!result.error?.includes("Do not expose"));
    if (code === 403) assert.ok(result.error?.includes("Resend account email"));
  }
  assert.equal((await deliver(async () => { throw new Error("Connection lost"); })).status, "unknown");
  assert.equal((await deliver(async () => Response.json({}))).status, "unknown");
  assert.equal((await deliver(async () => new Response("invalid json"))).status, "unknown");
});

test("stalled sends become uncertain rather than triggering duplicate emails", async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const result = await deliver((_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); }, 5);
  assert.equal(result.status, "unknown");
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
});

test("email validation accepts one plain address and rejects invalid or injected input", () => {
  assert.equal(validateEmail(" test@example.invalid "), "test@example.invalid");
  for (const value of [undefined, "", "bad", "x@example.invalid\r\nBcc: other@example.invalid", "one@example.invalid,two@example.invalid", "a..b@example.com", "Name <one@example.com>"]) {
    assert.equal(validateEmail(value), null);
  }
});

test("invalid recipient and missing configuration never contact Resend", async () => {
  const neverSend: MockSend = async () => { assert.fail("Must not contact Resend"); };
  assert.equal((await deliverDecisionEmail({ ...notification, recipient: "invalid" }, neverSend, 1000, config)).status, "failed");
  assert.equal((await deliverDecisionEmail(notification, neverSend, 1000, getEmailConfiguration({}))).status, "failed");
  const missingKey = getEmailConfiguration({ RESEND_FROM_EMAIL: "onboarding@resend.dev", QUALITY_NOTIFICATION_RECIPIENT: "test@example.invalid" });
  assert.ok(missingKey.error?.includes("RESEND_API_KEY"));
  assert.equal((await deliverDecisionEmail(notification, neverSend, 1000, missingKey)).status, "failed");
});

test("same decision uses a stable Resend idempotency key", async () => {
  const keys: string[] = [];
  const send: MockSend = async (_url, init) => {
    keys.push(new Headers(init.headers).get("Idempotency-Key")!);
    return Response.json({ id: "stable-id" });
  };
  await deliver(send);
  await deliver(send);
  assert.equal(keys[0], keys[1]);
  assert.match(keys[0], /^quality-[a-f0-9]{64}$/);
});
