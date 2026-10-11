import { createHash } from "node:crypto";
import { z } from "zod";

export function validateEmail(value: string | undefined): string | null {
  // Accept one plain address only, never address lists or injected headers.
  if (!value || /[\r\n]/.test(value)) return null;
  const parsed = z.string().trim().max(254).email().safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getEmailConfiguration(env: Record<string, string | undefined> = process.env) {
  const recipient = validateEmail(env.QUALITY_NOTIFICATION_RECIPIENT);
  const sender = validateEmail(env.RESEND_FROM_EMAIL);
  if (!recipient) return { error: "The notification recipient email address is missing or invalid." } as const;
  if (!sender) return { error: "The Resend sender email address is missing or invalid." } as const;
  if (!env.RESEND_API_KEY?.trim()) return { error: "RESEND_API_KEY is not configured on the server." } as const;
  return { recipient, sender, apiKey: env.RESEND_API_KEY.trim() } as const;
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

type Notification = { requestId: string; recipient: string; sender?: string; subject: string; body: string };
type DeliveryResult = { status: "sent" | "failed" | "unknown"; messageId?: string; error?: string };
type Send = (url: string, init: RequestInit) => Promise<Response>;

export async function deliverDecisionEmail(notification: Notification, send: Send = fetch,
  timeoutMs = 30000,
  config = getEmailConfiguration(),
): Promise<DeliveryResult> {
  if (config.error) return { status: "failed", error: config.error };
  const recipient = validateEmail(notification.recipient);
  const sender = validateEmail(notification.sender ?? config.sender);
  if (!recipient || !sender) return { status: "failed", error: "The sender or recipient email address is invalid. No email was sent." };
  const idempotencyKey = `quality-${createHash("sha256").update(notification.requestId).digest("hex")}`;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<DeliveryResult> => {
        const response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ from: `Ghazi Plast <${sender}>`, to: [recipient], subject: notification.subject, text: notification.body }),
          signal: controller.signal,
        });
        if (!response.ok) return {
          status: response.status >= 500 || response.status === 408 ? "unknown" : "failed",
          error: response.status === 401 ? "Resend rejected the API key. Check RESEND_API_KEY on the server."
            : response.status === 403 ? "Resend denied sending. With onboarding@resend.dev, the recipient must be your Resend account email; otherwise use a verified-domain sender. Also check the API key's sending permissions."
            : response.status === 429 ? "Resend's sending limit was reached. The decision is saved, but email was not accepted."
            : response.status === 409 ? "Resend reported an idempotency conflict. Check the Resend email log before sending again."
            : `Resend returned HTTP ${response.status}. Check the Resend email log and sender configuration.`,
        };
        const data = await response.json() as { id?: string };
        if (typeof data.id !== "string" || !data.id) return { status: "unknown", error: "Resend did not return an email ID. Check the Resend email log before sending again." };
        return { status: "sent", messageId: data.id };
      })(),
      new Promise<DeliveryResult>(resolve => {
        timer = setTimeout(() => {
          resolve({ status: "unknown", error: "Resend timed out. The email may have been accepted; check the Resend email log before sending again." });
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } catch {
    return { status: "unknown", error: "The Resend response was interrupted. Check the Resend email log before sending again." };
  } finally { if (timer) clearTimeout(timer); }
}
