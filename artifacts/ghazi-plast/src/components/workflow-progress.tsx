import { useState } from "react";

const steps = [
  {
    title: "Receive & link records",
    owner: "Production Department",
    description: "Receive P-77 records and supplier documentation, then link them to both cup production runs: CUP-501 and CUP-502.",
  },
  {
    title: "Record quality & deliveries",
    owner: "Quality checks · Shipping Department",
    description: "Record quality checks and release decisions for each batch. Shipping links batch quantities to specific customers.",
  },
  {
    title: "Search & start tracking",
    owner: "User",
    description: "Search for P-77 to initiate tracking. This is a read-only trace and does not alter any actual shipment status.",
  },
  {
    title: "Review affected output",
    owner: "Tracking results",
    description: "View all affected finished batches, outbound deliveries, and remaining warehouse inventory.",
  },
];

export function WorkflowProgress({ resultsReady }: { resultsReady: boolean }) {
  const [paused, setPaused] = useState(false);
  const current = resultsReady ? 4 : 3;
  return (
    <section aria-labelledby="workflow-heading" className="panel overflow-hidden">
      <div className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2">
        <h2 id="workflow-heading" className="micro !text-foreground">Material flow / Live pipeline</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-primary" aria-live="polite">
          Step {current} of 4 · {resultsReady ? "Trace results displayed" : "Ready to trace"}
        </span>
      </div>
      <div className="px-4 pt-4 pb-3 border-b">
        <div className={`pipeline-rail ${paused ? "pipeline-paused" : ""}`} aria-hidden="true">
          {steps.map((step, index) => (
            <div key={step.title} className="pipeline-station">
              <span className={`pipeline-node ${index + 1 === current ? "pipeline-node-active" : ""}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              {index < steps.length - 1 && (
                <div className="pipeline-track">
                  <span className="pipeline-dashes" />
                  <span className="pipeline-packet" />
                  <span className="pipeline-packet pipeline-packet-second" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-[10px] text-muted-foreground">Animated workflow guide · not live shipment activity</span>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}
            className="shrink-0 rounded border px-2 py-1 text-[11px] text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {paused ? "Resume motion" : "Pause motion"}
          </button>
        </div>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const n = index + 1;
          const active = n === current;
          const done = n < current;
          return (
            <li key={step.title} aria-current={active ? "step" : undefined}
              className={`relative p-4 border-b sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0 ${active ? "bg-primary/[0.06]" : ""}`}>
              {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" aria-hidden />}
              <div className="flex items-center gap-2.5 mb-2">
                <span className={`h-6 w-6 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold shrink-0 ${active ? "bg-primary text-primary-foreground border-primary" : done ? "border-primary/60 text-primary" : "border-border text-muted-foreground"}`}>
                  {String(n).padStart(2, "0")}
                </span>
                <h3 className="font-semibold text-sm leading-tight">{step.title}</h3>
              </div>
              <p className="micro !text-primary/90 mb-1">{step.owner}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
            </li>
          );
        })}
      </ol>
      <p className="px-4 py-2 border-t font-mono text-[10px] text-muted-foreground">
        Workflow guide, not a completion audit. Tracing does not change quality decisions or shipment statuses.
      </p>
    </section>
  );
}
