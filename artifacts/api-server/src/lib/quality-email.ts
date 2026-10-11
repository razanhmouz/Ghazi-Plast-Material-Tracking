import { createHash } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";

export function notificationRecipients(emails: (string | null)[]): string[] {
  return [...new Set(emails.map(email => email?.trim().toLowerCase() ?? "")
    .filter(email => /^[^\s@,<>;]+@[^\s@,<>;]+\.[^\s@,<>;]+$/.test(email)))].sort();
}

export function decisionEmail(decision: {
  requestId: string; action: string; batchIds: string[]; rationale: string; quantity: number; createdAt: Date;
}, runs: { id: string; quantity: number; materialId: string; inkLot: string; inspectionResult: string; destinations: { name: string; quantity: number; type: string }[] }[]) {
  const action = decision.action === "recall" ? "Issue Recall Order" : "Release Shipment";
  return {
    subject: `Ghazi Plast — ${action}`,
    body: [
      "GHAZI PLAST — DECISION HISTORY NOTIFICATION",
      `Action: ${action}`,
      `Decision ID: ${decision.requestId}`,
      `Recorded at (UTC): ${decision.createdAt.toISOString()}`,
      `Affected batches: ${decision.batchIds.join(", ")}`,
      `Total quantity: ${decision.quantity.toLocaleString("en-US")} cups`,
      "", "Reason / instructions:", decision.rationale,
      "", "BATCH CONTENTS AT THE TIME OF THE DECISION",
      ...runs.flatMap(run => [
        "", `${run.id}: ${run.quantity.toLocaleString("en-US")} cups`,
        `Material lot: ${run.materialId}`,
        `Ink lot: ${run.inkLot || "Not recorded"}`,
        `Inspection: ${run.inspectionResult}`,
        ...run.destinations.map(d => `  ${d.name} — ${d.quantity.toLocaleString("en-US")} cups (${d.type})`),
      ]),
      "", "This email communicates a human-recorded instruction. It does not execute a physical recall, dispatch goods, change shipment status, or notify other customers.",
    ].join("\n"),
  };
}

type Notification = { requestId: string; recipient: string; subject: string; body: string };
type DeliveryResult = { status: "sent" | "failed" | "unknown"; messageId?: string; error?: string };
type Send = (raw: string) => Promise<Response>;

export async function deliverDecisionEmail(notification: Notification, send: Send = raw =>
  new ReplitConnectors().proxy("google-mail", "/gmail/v1/users/me/messages/send", { method: "POST", body: { raw } }),
  timeoutMs = 30000,
): Promise<DeliveryResult> {
  const messageId = `${createHash("sha256").update(notification.requestId).digest("hex")}@notifications.ghazi-plast.invalid`;
  const raw = Buffer.from([
    "To: undisclosed-recipients:;",
    `Bcc: ${notification.recipient.split(",").join(",\r\n ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(notification.subject).toString("base64")}?=`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64", "",
    Buffer.from(notification.body).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "",
  ].join("\r\n")).toString("base64url");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<DeliveryResult> => {
        const response = await send(raw);
        if (!response.ok) return {
          status: response.status >= 500 || response.status === 408 ? "unknown" : "failed",
          error: response.status === 401 || response.status === 403
            ? "Gmail authorization failed. Reconnect Gmail with send permission."
            : `Gmail returned HTTP ${response.status}. Check the mailbox before sending again.`,
        };
        const data = await response.json() as { id?: string };
        if (!data.id) return { status: "unknown", error: "Gmail did not return a message ID. Check Sent mail before sending again." };
        return { status: "sent", messageId: data.id };
      })(),
      new Promise<DeliveryResult>(resolve => {
        timer = setTimeout(() => resolve({ status: "unknown", error: "Gmail response timed out. It may have sent the email; check Sent mail before sending again." }), timeoutMs);
      }),
    ]);
  } catch {
    return { status: "unknown", error: "The Gmail response was interrupted. Check Sent mail before sending again." };
  } finally { if (timer) clearTimeout(timer); }
}
