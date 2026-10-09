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
  const current = resultsReady ? 4 : 3;
  return (
    <section aria-labelledby="workflow-heading" className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex flex-wrap justify-between gap-2">
        <h2 id="workflow-heading" className="font-semibold text-sm">Staff workflow</h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Step {current} of 4 · {resultsReady ? "Trace results displayed" : "Ready to trace"}
        </span>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const active = index + 1 === current;
          return (
            <li key={step.title} aria-current={active ? "step" : undefined}
              className={`p-4 border-b last:border-b-0 xl:border-b-0 xl:border-r last:border-r-0 ${active ? "bg-primary/5" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {index + 1}
                </span>
                <h3 className="font-semibold text-sm">{step.title}</h3>
              </div>
              <p className="text-[11px] font-medium text-primary mb-1">{step.owner}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
            </li>
          );
        })}
      </ol>
      <p className="px-4 py-2 border-t text-[11px] text-muted-foreground">
        Workflow guide, not a completion audit. Tracing does not change quality decisions or shipment statuses.
      </p>
    </section>
  );
}
