import type { Run } from "@workspace/api-client-react";
import { ClipboardCheck, Pencil, Truck, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt, InspPill } from "@/lib/trace-shared";

export function OperationsTable({ runs, onChecklist, onEdit }: { runs: Run[]; onChecklist: (r: Run) => void; onEdit: (r: Run) => void }) {
  if (runs.length === 0) return <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No batches to show.</div>;
  return (
    <div className="rounded-xl border bg-card overflow-hidden" data-testid="table-operations">
      <div className="hidden md:grid grid-cols-[120px_1fr_120px_150px_1fr_190px] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b bg-secondary/60">
        <span>Batch</span><span>Destination</span><span className="text-right">Dest. qty</span><span>Ink lot</span><span>QC status</span><span className="text-right">QC Inspection Checklist</span>
      </div>
      {runs.map((r) => {
        const dests = r.destinations.length ? r.destinations : [null];
        const filled = r.checklist.length;
        return (
          <div key={r.id} data-testid={`group-batch-${r.id}`} className="border-b last:border-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 bg-[hsl(192_30%_95%)] border-b border-dashed">
              <span className="font-mono font-semibold">{r.id}</span>
              <span className="font-mono text-xs text-muted-foreground" data-testid={`text-batch-total-${r.id}`}>Batch total {fmt(r.quantity)} cups · split below</span>
            </div>
            {dests.map((d, i) => (
              <div key={d?.name ?? "none"} data-testid={`row-op-${r.id}-${i}`} className="grid grid-cols-2 md:grid-cols-[120px_1fr_120px_150px_1fr_190px] gap-3 px-4 py-3 items-center hover:bg-secondary/40 transition-colors">
                <div className="font-mono text-xs text-muted-foreground">{r.id}<span className="block text-[10px]">of {fmt(r.quantity)}</span></div>
                <div className="flex items-center gap-1.5 text-sm">
                  {d ? (<>{d.type === "shipped" ? <Truck className="h-3.5 w-3.5 text-primary" /> : <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />}{d.name}</>) : <span className="text-muted-foreground text-xs">No destination recorded</span>}
                </div>
                <div className="font-mono font-semibold tabular-nums text-right" data-testid={`text-dest-qty-${r.id}-${i}`}>{d ? fmt(d.quantity) : "—"}</div>
                <div className="font-mono text-sm flex items-center gap-1">
                  {r.inkLot || <span className="text-[hsl(28_80%_35%)] text-xs font-sans">Missing</span>}
                  {i === 0 && <button data-testid={`button-edit-ink-${r.id}`} onClick={() => onEdit(r)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label={`Edit ink lot for ${r.id}`}><Pencil className="h-3 w-3" /></button>}
                </div>
                <div className="flex items-center gap-2"><InspPill v={r.inspectionResult} /><span className="text-[10px] font-mono text-muted-foreground">{filled} check{filled === 1 ? "" : "s"}</span></div>
                <div className="col-span-2 md:col-span-1 md:text-right">
                  <Button size="sm" variant="outline" data-testid={`link-checklist-${r.id}-${i}`} onClick={() => onChecklist(r)}>
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Open checklist
                  </Button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
