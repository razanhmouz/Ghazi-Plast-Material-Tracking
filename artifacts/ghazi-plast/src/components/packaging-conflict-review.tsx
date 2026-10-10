import type { PackagingBatch } from "@workspace/api-client-react";
import { AllocationTrace } from "./packaging-allocations";

export function PackagingConflictReview({ current, busy, reload, reconcile }: {
  current: PackagingBatch;
  busy: boolean;
  reload: () => void;
  reconcile: () => void;
}) {
  return <section aria-label="Review conflicting record" className="ptc-note" style={{ display: "block" }}>
    <h3>Another editor saved a newer record</h3>
    <p>Your unsaved form below is unchanged. Compare it with the latest saved values here, then reconcile your draft. Nothing is merged or saved automatically.</p>
    <details open>
      <summary>Latest saved record · {new Date(current.updatedAt).toLocaleString()}</summary>
      <dl style={{ overflowWrap: "anywhere" }}>
        {Object.entries(current).filter(([key]) => !["id", "demo", "updatedAt", "allocations"].includes(key)).map(([key, value]) =>
          <div key={key}><dt style={{ fontWeight: 600 }}>{key.replace(/([A-Z])/g, " $1")}</dt><dd style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{Array.isArray(value) ? value.join("\n") || "None" : value === "" ? "Not recorded" : String(value)}</dd></div>
        )}
      </dl>
      <AllocationTrace allocations={current.allocations ?? []}/>
    </details>
    <p>Saving your reconciled draft replaces these values, including the allocation list. Any further edits by another person will trigger another conflict.</p>
    <div className="ptc-form-actions">
      <button type="button" className="ptc-btn" disabled={busy} onClick={reload}>Reload latest · keep my draft</button>
      <button type="button" className="ptc-btn" disabled={busy} onClick={reconcile}>I reviewed the latest · reconcile my draft</button>
    </div>
  </section>;
}
