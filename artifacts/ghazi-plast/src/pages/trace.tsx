import { useMemo, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetTrace, useUpdateRun, getGetTraceQueryKey } from "@workspace/api-client-react";
import { OperationsTable } from "@/components/operations-table";
import { ChecklistDialog } from "@/components/checklist-dialog";
import { QualityDecisionPanel } from "@/components/quality-decision-panel";
import { OwnerVerification } from "@/components/owner-verification";
import { INSP, REL, fmt, Pill, InspPill, invalidateTrace, type Insp, type Rel } from "@/lib/trace-shared";
import type { Run, Material, RunUpdate } from "@workspace/api-client-react";
import { Search, ScanBarcode, Download, RefreshCw, AlertTriangle, Pencil, Truck, Warehouse, Factory, Package, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { WorkflowProgress } from "@/components/workflow-progress";

function exportCsv(runs: Run[], materials: Material[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["run_id", "material_id", "supplier", "run_quantity", "ink_lot", "inspection", "release", "quality_notes", "updated_at", "destination", "destination_type", "destination_quantity"];
  const rows: (string | number)[][] = [];
  for (const r of runs) {
    const sup = materials.find((m) => m.id === r.materialId)?.supplier ?? "";
    const base = [r.id, r.materialId, sup, r.quantity, r.inkLot, r.inspectionResult, r.releaseDecision, r.qualityNotes, r.updatedAt];
    if (r.destinations.length === 0) rows.push([...base, "", "", ""]);
    for (const d of r.destinations) rows.push([...base, d.name, d.type, d.quantity]);
  }
  const csv = [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ghazi-plast-trace-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TracePage() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Run | null>(null);
  const [focusRun, setFocusRun] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const params = search ? { search } : undefined;
  const [checklistRun, setChecklistRun] = useState<Run | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useGetTrace(params, { query: { queryKey: getGetTraceQueryKey(params), refetchInterval: 30000, refetchOnWindowFocus: true } });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const materials = useMemo(() => data?.materials ?? [], [data]);
  const runs = useMemo(() => data?.runs ?? [], [data]);
  const totals = useMemo(() => {
    const cups = runs.reduce((s, r) => s + r.quantity, 0);
    let shipped = 0, inventory = 0;
    const byRel: Record<Rel, number> = { pending: 0, released: 0, hold: 0, rejected: 0 };
    const customers = new Set<string>();
    for (const r of runs) {
      byRel[r.releaseDecision] += r.quantity;
      for (const d of r.destinations) {
        if (d.type === "shipped") { shipped += d.quantity; customers.add(d.name); } else inventory += d.quantity;
      }
    }
    const open = runs.filter((r) => r.releaseDecision === "pending" || r.inspectionResult === "pending").length;
    return { cups, shipped, inventory, byRel, customers: customers.size, open };
  }, [runs]);

  const submit = (v: string) => { setSearch(v.trim()); setFocusRun(null); };

  return (
    <div className="min-h-[100dvh] grid-paper">
      <header className="border-b bg-sidebar/90 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded border border-primary/60 text-primary grid place-items-center font-mono font-semibold text-xs">GP</div>
            <div className="leading-tight">
              <div className="font-bold tracking-tight">Ghazi Plast</div>
              <div className="micro !text-[10px]">Material trace / QA</div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span data-testid="status-demo" className="font-mono text-[10px] uppercase tracking-wider rounded border border-accent/50 text-accent px-2 py-1">Demo data · shared workspace, no sign-in</span>
            <OwnerVerification />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 md:px-6 py-5 space-y-4">
        <WorkflowProgress resultsReady={Boolean(search && !isFetching && !isError && materials.length > 0)} />

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] rise">
          <form onSubmit={(e) => { e.preventDefault(); submit(input); }} className="panel p-3">
            <Label htmlFor="trace-search" className="micro flex items-center gap-1.5 mb-2">
              <ScanBarcode className="h-3.5 w-3.5 text-primary" /> Type or scan barcode · Enter to trace
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="trace-search" ref={inputRef} data-testid="input-search" value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="MAT-P77-001 or P-77" className="pl-9 pr-10 h-10 font-mono bg-background" autoComplete="off" />
                {input ? (
                  <button type="button" data-testid="button-clear-search" onClick={() => { setInput(""); submit(""); inputRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Clear search"><X className="h-4 w-4" /></button>
                ) : (
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] border rounded px-1.5 py-0.5 text-muted-foreground bg-muted">/</kbd>
                )}
              </div>
              <Button type="submit" data-testid="button-search" className="h-10">Trace</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] items-center">
              <span className="micro !text-[10px]">Quick</span>
              {["MAT-P77-001", "P-77"].map((q) => (
                <button key={q} type="button" data-testid={`button-quick-${q}`} onClick={() => { setInput(q); submit(q); }}
                  className="font-mono px-1.5 rounded border bg-background hover:border-primary hover:text-primary transition-colors">{q}</button>
              ))}
            </div>
          </form>
          {isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-md" />) : !isError && (
            [
              { l: "Affected production", v: fmt(totals.cups), sub: `cups (${runs.map((r) => fmt(r.quantity)).join(" + ") || "0"})`, id: "cups", c: "text-accent", bar: "bg-accent" },
              { l: "Shipped quantities", v: fmt(totals.shipped), sub: `cups across ${totals.customers} customer${totals.customers === 1 ? "" : "s"}`, id: "shipped", c: "text-primary", bar: "bg-primary" },
              { l: "Remaining inventory", v: fmt(totals.inventory), sub: "cups in warehouse", id: "inventory", c: "text-[hsl(var(--ok))]", bar: "bg-[hsl(var(--ok))]" },
            ].map((s) => (
              <div key={s.id} className="panel p-3 relative overflow-hidden">
                <span className={cn("absolute left-0 top-0 bottom-0 w-0.5", s.bar)} aria-hidden />
                <div className="micro">{s.l}</div>
                <div className={cn("text-3xl font-semibold font-mono mt-1.5 tabular-nums", s.c)} data-testid={`stat-${s.id}`}>{s.v}</div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5 break-words">{s.sub}</div>
              </div>
            ))
          )}
        </section>

        {isLoading ? <LoadingState /> : isError ? (
          <div className="panel p-10 text-center">
            <ShieldAlert className="h-8 w-8 mx-auto text-destructive" />
            <h2 className="mt-3 font-semibold">Trace data could not be loaded</h2>
            <p className="text-sm text-muted-foreground mt-1">The server did not respond. Your edits are safe; nothing was changed.</p>
            <Button className="mt-4" data-testid="button-retry" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Retry</Button>
          </div>
        ) : materials.length === 0 && runs.length === 0 ? (
          <div className="panel border-dashed p-12 text-center rise">
            <Package className="h-8 w-8 mx-auto text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No material matches “{search}”</h2>
            <p className="text-sm text-muted-foreground mt-1">Check the label. Material IDs look like <span className="font-mono">MAT-P77-001</span>; supplier codes like <span className="font-mono">P-77</span>.</p>
            <Button variant="outline" className="mt-4" data-testid="button-reset-search" onClick={() => { setInput(""); submit(""); }}>Show all materials</Button>
          </div>
        ) : (
          <>
            {materials.map((m) => (
              <div key={m.id} data-testid={`card-material-${m.id}`} className="rise rounded-md border tone-warn !bg-accent/[0.07] p-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-8 w-8 shrink-0 rounded bg-accent text-accent-foreground grid place-items-center"><AlertTriangle className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-foreground" data-testid="text-material-id">{m.id}</span>
                      <Pill cls="tone-warn">Supplier {m.supplier}</Pill>
                    </div>
                    <p className="text-sm mt-0.5 text-foreground/85" data-testid="text-material-alert">{m.alert}</p>
                  </div>
                </div>
                <div className="font-mono text-xs flex gap-3">
                  <span>{runs.filter((r) => r.materialId === m.id).length} runs affected</span>
                  <span className="text-muted-foreground" data-testid="stat-held">hold/rejected {fmt(totals.byRel.hold + totals.byRel.rejected)}</span>
                  <span className="text-muted-foreground" data-testid="stat-open">open {totals.open}/{runs.length}</span>
                </div>
              </div>
            ))}

            <div className="grid gap-4 lg:grid-cols-3 items-start">
              <Tabs defaultValue="ops" className="rise lg:col-span-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <TabsList className="bg-secondary border grid grid-cols-2 h-auto w-full sm:flex sm:w-auto">
                    <TabsTrigger value="ops" data-testid="tab-operations" className="text-xs">Operations table</TabsTrigger>
                    <TabsTrigger value="flow" data-testid="tab-flow" className="text-xs">Trace flow</TabsTrigger>
                    <TabsTrigger value="runs" data-testid="tab-runs" className="text-xs">Production runs</TabsTrigger>
                    <TabsTrigger value="dist" data-testid="tab-distribution" className="text-xs">Distribution</TabsTrigger>
                  </TabsList>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" data-testid="button-refresh" onClick={() => refetch()} disabled={isFetching}>
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />Refresh
                    </Button>
                    <Button size="sm" data-testid="button-export" disabled={runs.length === 0} onClick={() => exportCsv(runs, materials)}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
                    </Button>
                  </div>
                </div>
                <TabsContent value="ops" className="mt-3">
                  <OperationsTable runs={runs} onChecklist={setChecklistRun} onEdit={setEditing} />
                </TabsContent>
                <TabsContent value="flow" className="mt-3">
                  <FlowView materials={materials} runs={runs} focus={focusRun} setFocus={setFocusRun} onEdit={setEditing} />
                </TabsContent>
                <TabsContent value="runs" className="mt-3">
                  <RunsView runs={runs} onEdit={setEditing} />
                </TabsContent>
                <TabsContent value="dist" className="mt-3">
                  <DistView runs={runs} />
                </TabsContent>
              </Tabs>
              <DestinationOverview runs={runs} />
            </div>
            <QualityDecisionPanel runs={runs} />
          </>
        )}
      </main>
      <EditDialog run={editing} onClose={() => setEditing(null)} />
      <ChecklistDialog run={checklistRun} onClose={() => setChecklistRun(null)} />
    </div>
  );
}

function DestinationOverview({ runs }: { runs: Run[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; type: string; total: number }>();
    for (const r of runs) for (const d of r.destinations) {
      const e = map.get(d.name) ?? { name: d.name, type: d.type, total: 0 };
      e.total += d.quantity; map.set(d.name, e);
    }
    return [...map.values()].sort((a, b) => (a.type === b.type ? b.total - a.total : a.type === "shipped" ? -1 : 1));
  }, [runs]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <aside className="panel rise overflow-hidden" data-testid="panel-destination-overview">
      <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2">
        <h2 className="micro !text-foreground">Destination overview</h2>
        <span className="font-mono text-[10px] text-muted-foreground">recorded quantities</span>
      </div>
      <div className="p-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No destinations recorded for these batches.</p>}
        {rows.map((d) => (
          <div key={d.name} data-testid={`overview-destination-${d.name}`}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 min-w-0">
                {d.type === "shipped" ? <Truck className="h-3.5 w-3.5 text-primary shrink-0" /> : <Warehouse className="h-3.5 w-3.5 text-[hsl(var(--ok))] shrink-0" />}
                <span className="truncate">{d.name}</span>
              </span>
              <span className="font-mono tabular-nums font-semibold">{fmt(d.total)}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", d.type === "shipped" ? "bg-primary" : "bg-[hsl(var(--ok))]")} style={{ width: `${(d.total / max) * 100}%` }} />
            </div>
            <div className="micro !text-[10px] mt-1">{d.type === "shipped" ? "Shipped · recall contact" : "Internal stock"}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-md" />
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 rounded-md lg:col-span-2" /><Skeleton className="h-80 rounded-md" /></div>
    </div>
  );
}

function FlowView({ materials, runs, focus, setFocus, onEdit }: { materials: Material[]; runs: Run[]; focus: string | null; setFocus: (s: string | null) => void; onEdit: (r: Run) => void }) {
  return (
    <div className="rounded-md border bg-card p-4 md:p-6">
      <div className="grid md:grid-cols-[200px_1fr] gap-4 md:gap-8">
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Factory className="h-3 w-3" />Raw material</div>
          {materials.map((m) => (
            <div key={m.id} className="rounded-lg border tone-warn !bg-accent/[0.07] p-3">
              <div className="font-mono text-sm font-semibold">{m.id}</div>
              <div className="text-xs text-muted-foreground">{m.supplier} · {m.name}</div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />Alert active</div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Runs → destinations · click a run to isolate</div>
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No production runs recorded for this material.</p>}
          {runs.map((r) => {
            const dim = focus && focus !== r.id;
            const destTotal = r.destinations.reduce((s, d) => s + d.quantity, 0);
            const unaccounted = r.quantity - destTotal;
            return (
              <div key={r.id} data-testid={`flow-run-${r.id}`} className={cn("grid sm:grid-cols-[180px_40px_1fr] items-stretch gap-2 sm:gap-0 transition-opacity duration-300", dim && "opacity-30")}>
                <button onClick={() => setFocus(focus === r.id ? null : r.id)} data-testid={`button-focus-${r.id}`}
                  className={cn("text-left rounded-lg border p-3 bg-background hover:border-primary transition-all", focus === r.id && "border-primary ring-2 ring-primary/20")}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm">{r.id}</span>
                    <span className="h-2 w-2 rounded-full" style={{ background: REL[r.releaseDecision].bar }} />
                  </div>
                  <div className="font-mono text-lg font-bold tabular-nums">{fmt(r.quantity)}<span className="text-xs font-normal text-muted-foreground ml-1">cups</span></div>
                  <div className="text-[11px] text-muted-foreground truncate">Ink: {r.inkLot || <em>not recorded</em>}</div>
                </button>
                <svg className="hidden sm:block w-full h-full" viewBox="0 0 40 60" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 30 H40" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" className="flow" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="rounded-lg border bg-background p-3 space-y-2">
                  <div className="flex h-7 rounded overflow-hidden border">
                    {r.destinations.map((d) => (
                      <div key={d.name} title={`${d.name}: ${fmt(d.quantity)}`} className={cn("h-full grid place-items-center text-[10px] font-mono font-medium transition-all", d.type === "shipped" ? "bg-primary text-primary-foreground" : "bg-[hsl(var(--ok))] text-background")}
                        style={{ width: `${(d.quantity / Math.max(r.quantity, destTotal)) * 100}%` }}>
                        {((d.quantity / r.quantity) * 100).toFixed(1)}%
                      </div>
                    ))}
                    {unaccounted > 0 && <div className="h-full bg-[repeating-linear-gradient(45deg,hsl(var(--muted)),hsl(var(--muted))_4px,hsl(var(--border))_4px,hsl(var(--border))_8px)]" style={{ width: `${(unaccounted / r.quantity) * 100}%` }} />}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {r.destinations.map((d) => (
                      <span key={d.name} className="flex items-center gap-1.5">
                        {d.type === "shipped" ? <Truck className="h-3 w-3 text-primary" /> : <Warehouse className="h-3 w-3 text-muted-foreground" />}
                        {d.name} <span className="font-mono text-muted-foreground">{fmt(d.quantity)}</span>
                      </span>
                    ))}
                    {unaccounted !== 0 && <span className="text-destructive font-medium">{unaccounted > 0 ? `${fmt(unaccounted)} unaccounted` : `${fmt(-unaccounted)} over-allocated`}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex gap-1.5 flex-wrap">
                      <InspPill v={r.inspectionResult} />
                      <Pill cls={REL[r.releaseDecision].cls}>{REL[r.releaseDecision].label}</Pill>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7" data-testid={`button-edit-flow-${r.id}`} onClick={() => onEdit(r)}><Pencil className="h-3 w-3 mr-1" />Decide</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RunsView({ runs, onEdit }: { runs: Run[]; onEdit: (r: Run) => void }) {
  if (runs.length === 0) return <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No runs used this material.</div>;
  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <div className="md:min-w-[860px]">
      <div className="hidden md:grid grid-cols-[110px_90px_1fr_110px_150px_1.4fr_90px] gap-3 px-4 py-2.5 micro border-b bg-secondary/60">
        <span>Run</span><span className="text-right">Cups</span><span>Ink lot</span><span>Inspection</span><span>Release</span><span>Quality notes</span><span />
      </div>
      {runs.map((r) => (
        <div key={r.id} data-testid={`row-run-${r.id}`} className="group grid grid-cols-2 md:grid-cols-[110px_90px_1fr_110px_150px_1.4fr_90px] gap-3 px-4 py-3 border-b last:border-0 items-center hover:bg-secondary/40 transition-colors">
          <div><div className="font-mono font-semibold">{r.id}</div><div className="text-[10px] text-muted-foreground font-mono">{new Date(r.updatedAt).toLocaleString()}</div></div>
          <div className="font-mono tabular-nums text-right">{fmt(r.quantity)}</div>
          <div className="font-mono text-sm">{r.inkLot || <span className="text-accent text-xs font-sans">Missing</span>}</div>
          <div><InspPill v={r.inspectionResult} /></div>
          <div><Pill cls={REL[r.releaseDecision].cls} testId={`status-release-${r.id}`}>{REL[r.releaseDecision].label}</Pill></div>
          <div className="col-span-2 md:col-span-1 text-xs text-muted-foreground line-clamp-2">{r.qualityNotes || "—"}</div>
          <div className="col-span-2 md:col-span-1 md:text-right">
            <Button size="sm" variant="outline" data-testid={`button-edit-${r.id}`} onClick={() => onEdit(r)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

function DistView({ runs }: { runs: Run[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; type: string; total: number; parts: { run: string; q: number; rel: Rel }[] }>();
    for (const r of runs) for (const d of r.destinations) {
      const e = map.get(d.name) ?? { name: d.name, type: d.type, total: 0, parts: [] };
      e.total += d.quantity; e.parts.push({ run: r.id, q: d.quantity, rel: r.releaseDecision });
      map.set(d.name, e);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [runs]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) return <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No distribution records yet.</div>;
  return (
    <div className="rounded-md border bg-card p-4 md:p-6 space-y-4">
      {rows.map((d) => (
        <div key={d.name} data-testid={`row-destination-${d.name}`} className="grid md:grid-cols-[200px_1fr_90px] gap-2 md:gap-4 items-center">
          <div className="flex items-center gap-2">
            {d.type === "shipped" ? <Truck className="h-4 w-4 text-primary" /> : <Warehouse className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium">{d.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.type === "shipped" ? "Shipped · recall contact" : "Internal stock"}</span>
          </div>
          <div className="h-6 bg-muted rounded overflow-hidden flex" style={{ width: `${(d.total / max) * 100}%`, minWidth: 40 }}>
            {d.parts.map((p) => (
              <div key={p.run} title={`${p.run}: ${fmt(p.q)} · ${REL[p.rel].label}`} className="h-full border-r border-card last:border-0 grid place-items-center text-[10px] font-mono text-background"
                style={{ width: `${(p.q / d.total) * 100}%`, background: REL[p.rel].bar }}>{p.run}</div>
            ))}
          </div>
          <div className="font-mono font-semibold tabular-nums md:text-right">{fmt(d.total)}</div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-3 border-t text-[11px] text-muted-foreground">
        {(Object.keys(REL) as Rel[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: REL[k].bar }} />{REL[k].label}</span>)}
      </div>
    </div>
  );
}

function EditDialog({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateRun();
  const [form, setForm] = useState<RunUpdate>({ inkLot: "", inspectionResult: "pending", releaseDecision: "pending", qualityNotes: "" });
  useEffect(() => {
    if (run) setForm({ inkLot: run.inkLot, inspectionResult: run.inspectionResult, releaseDecision: run.releaseDecision, qualityNotes: run.qualityNotes });
  }, [run]);
  const blocked = form.releaseDecision === "released" && form.inspectionResult !== "passed";
  const save = () => {
    if (!run || blocked) return;
    update.mutate({ id: run.id, data: { ...form, inkLot: form.inkLot.trim() } }, {
      onSuccess: (r) => {
        invalidateTrace(qc);
        toast({ title: `${r.id} saved`, description: `${INSP[r.inspectionResult].label} · ${REL[r.releaseDecision].label}` });
        onClose();
      },
      onError: () => toast({ title: "Save failed", description: "The record was not updated. Try again.", variant: "destructive" }),
    });
  };
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">{run?.id} <span className="font-sans font-normal text-muted-foreground text-sm">· {run && fmt(run.quantity)} cups</span></DialogTitle>
          <DialogDescription>Batch quality record. Saved to the shared demo database.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="ink">Ink lot</Label>
            <Input id="ink" data-testid="input-ink-lot" maxLength={100} className="font-mono mt-1.5" placeholder="e.g. INK-2291-B" value={form.inkLot} onChange={(e) => setForm({ ...form, inkLot: e.target.value })} />
          </div>
          <Segment label="Inspection result" value={form.inspectionResult} options={(Object.keys(INSP) as Insp[]).map((k) => ({ v: k, l: INSP[k].label }))} onChange={(v) => setForm({ ...form, inspectionResult: v as Insp })} testId="insp" />
          <Segment label="Release decision" value={form.releaseDecision} options={(Object.keys(REL) as Rel[]).map((k) => ({ v: k, l: k === "pending" ? "Pending" : REL[k].label }))} onChange={(v) => setForm({ ...form, releaseDecision: v as Rel })} testId="release" />
          {blocked && <p data-testid="text-release-blocked-edit" className="text-xs rounded-md border tone-bad p-2 flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />A batch can only be released after its inspection has passed. A justification cannot override a pending or failed inspection. Record the checks in the QC Inspection Checklist first.</p>}
          <div>
            <Label htmlFor="notes">Quality notes</Label>
            <Textarea id="notes" data-testid="input-notes" maxLength={5000} rows={4} className="mt-1.5" placeholder="Findings, sample sizes, customer contact…" value={form.qualityNotes} onChange={(e) => setForm({ ...form, qualityNotes: e.target.value })} />
            <div className="text-[10px] text-right text-muted-foreground font-mono mt-1">{form.qualityNotes.length}/5000</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel">Cancel</Button>
          <Button onClick={save} disabled={update.isPending || blocked} data-testid="button-save">{update.isPending ? "Saving…" : "Save record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Segment({ label, value, options, onChange, testId }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; testId: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 grid gap-1 p-1 rounded-lg bg-secondary" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
        {options.map((o) => (
          <button key={o.v} type="button" data-testid={`button-${testId}-${o.v}`} onClick={() => onChange(o.v)}
            className={cn("rounded-md py-1.5 text-xs font-medium transition-all", value === o.v ? "bg-card shadow-sm text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}
