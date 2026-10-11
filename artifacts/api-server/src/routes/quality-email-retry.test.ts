import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { PreviewQualityEmailRetryResponse } from "@workspace/api-zod";
import { db, qualityActions, qualityNotifications } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createQualityEmailRetryRouter } from "./quality-email-retry";
import { getEmailConfiguration } from "../lib/quality-email";
import { RETRY_WINDOW_MS, retryBlock } from "../lib/quality-email-retry";

const config = () => getEmailConfiguration({ RESEND_API_KEY: "fake", RESEND_FROM_EMAIL: "sender@example.invalid", QUALITY_NOTIFICATION_RECIPIENT: "recipient@example.invalid" });

test("authenticated confirmed retries are atomic, immutable and bounded, with mocked Resend only", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => req.headers["x-test-auth"] === "yes") as typeof req.isAuthenticated;
    req.user = { id: "retry-test-actor" } as Express.User;
    next();
  });
  let calls = 0;
  let code = 200;
  const payloads: RequestInit[] = [];
  app.use(createQualityEmailRetryRouter(config, async (_url, init) => {
    calls++; payloads.push(init!);
    await new Promise(resolve => setTimeout(resolve, 30));
    return code === 200 ? Response.json({ id: "mock-email" }) : new Response("", { status: code });
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address() as { port: number };
  const ids: string[] = [];
  const seed = async (status = "failed", provider = "resend", age = 0) => {
    const requestId = `retry-test-${randomUUID()}`; ids.push(requestId);
    await db.insert(qualityActions).values({ requestId, action: "recall", batchIds: ["TEST"], rationale: "Original instruction", quantity: 42 });
    await db.insert(qualityNotifications).values({ requestId, status, provider, sender: "sender@example.invalid", recipient: "recipient@example.invalid", subject: "Original subject", body: "Original quantity: 42", createdAt: new Date(Date.now() - age) });
    return requestId;
  };
  const request = (id: string, data?: unknown, auth = true) => fetch(`http://127.0.0.1:${address.port}/quality-actions/${id}/email-retry`, {
    method: data ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-test-auth": auth ? "yes" : "no" }, body: data ? JSON.stringify(data) : undefined,
  });
  try {
    const id = await seed();
    assert.equal((await request(id, undefined, false)).status, 401);
    const preview = PreviewQualityEmailRetryResponse.parse(await (await request(id)).json());
    assert.equal(preview.body, "Original quantity: 42");
    assert.equal(preview.currentRecipient, "recipient@example.invalid");
    assert.equal((await request(id, { version: preview.version, confirmed: false })).status, 400);
    assert.equal((await request(id, { version: preview.version, confirmed: true }, false)).status, 401);
    const confirmation = { version: preview.version, confirmed: true };
    const results = await Promise.all([request(id, confirmation), request(id, confirmation)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(calls, 1);
    assert.equal(JSON.parse(payloads[0].body as string).text, preview.body);
    assert.equal((await request(id, confirmation)).status, 409);
    const [saved] = await db.select().from(qualityActions).where(eq(qualityActions.requestId, id));
    assert.equal(saved.quantity, 42); assert.equal(saved.rationale, "Original instruction");
    const [email] = await db.select().from(qualityNotifications).where(eq(qualityNotifications.requestId, id));
    assert.equal(email.retryAudit.length, 1);
    assert.equal(email.retryAudit[0].actor, "retry-test-actor");
    assert.ok(retryBlock({ ...email, status: "failed", messageId: null, recipient: "changed@example.invalid" }, config()));

    const unknown = await seed("unknown");
    const uncertain = PreviewQualityEmailRetryResponse.parse(await (await request(unknown)).json());
    assert.equal(uncertain.requiresReconciliation, true);
    assert.equal((await request(unknown, { version: uncertain.version, confirmed: true })).status, 400);
    code = 503;
    assert.equal((await request(unknown, { version: uncertain.version, confirmed: true, logsCheckedNoAcceptance: true, reconciliation: "Checked Resend logs: no accepted email for this decision." })).status, 200);
    const afterFailure = PreviewQualityEmailRetryResponse.parse(await (await request(unknown)).json());
    assert.equal(afterFailure.requiresReconciliation, true);
    assert.notEqual(afterFailure.version, uncertain.version);
    const key = new Headers(payloads[1].headers).get("Idempotency-Key");
    code = 200;
    await request(unknown, { version: afterFailure.version, confirmed: true, logsCheckedNoAcceptance: true, reconciliation: "Rechecked Resend logs: no accepted email." });
    assert.equal(new Headers(payloads[2].headers).get("Idempotency-Key"), key);
    assert.equal(payloads[1].body, payloads[2].body);
    for (const blockedId of [await seed("failed", "gmail"), await seed("failed", "resend", RETRY_WINDOW_MS), await seed("sending"), await seed("sent")]) {
      const blocked = PreviewQualityEmailRetryResponse.parse(await (await request(blockedId)).json());
      assert.ok(blocked.blockedReason);
      assert.equal((await request(blockedId, { version: blocked.version, confirmed: true })).status, 409);
    }
    assert.equal(calls, 3);
  } finally {
    for (const id of ids) {
      await db.delete(qualityNotifications).where(eq(qualityNotifications.requestId, id));
      await db.delete(qualityActions).where(eq(qualityActions.requestId, id));
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
