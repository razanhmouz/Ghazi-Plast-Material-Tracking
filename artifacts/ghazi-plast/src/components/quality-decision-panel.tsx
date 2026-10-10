import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListQualityActions, useRecordQualityAction, getListQualityActionsQueryKey } from "@workspace/api-client-react";
import type { QualityAction, QualityActionInput, Run } from "@workspace/api-client-react";
import { Gavel, History, OctagonAlert, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { errMessage, errStatus, fmt, InspPill, invalidateTrace } from "@/lib/trace-shared";

type Action = QualityActionInput["action"];
const ACT: Record<Action, { label: string; verb: string; Icon: typeof Gavel; cls: string }> = {
  recall: { label: "Issue Recall Order", verb: "Recall order", Icon: OctagonAlert, cls: "tone-bad" },
  release: { label: "Release Shipment", verb: "Release instruction", Icon: PackageCheck, cls: "tone-ok" },
};

export const DISCLAIMER = "the tool supports human decision-making; it does not automatically notify customers or initiate a product recall.";

export function QualityDecisionPanel({ runs }: { runs: Run[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const history = useListQualityActions({ query: { queryKey: getListQualityActionsQueryKey(), refetchInterval: 30000, refetchOnWindowFocus: true } });
  const record = useRecordQualityAction();
  const [action, setAction] = useState<Action | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [rationale, setRationale] = useState("");
  const [confirming, setConfirming] = useState(false);
  const reqRef = useRef<{ sig: string; id: string } | null>(null);

  const selRuns = runs.filter((r) => sel.includes(r.id));
  const qty = selRuns.reduce((s, r) => s + r.quantity, 0);
  const notPassed = action === "release" ? selRuns.filter((r) => r.inspectionResult !== "passed") : [];
  const canReview = !!action && sel.length > 0 && selRuns.length === sel.length && rationale.trim().length > 0 && notPassed.length === 0;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const payload = (): QualityActionInput => {
    const batchIds = [...sel].sort();
    const body = { action: action as Action, batchIds, rationale: rationale.trim() };
    const sig = JSON.stringify(body);
    if (!reqRef.current || reqRef.current.sig !== sig) reqRef.current = { sig, id: crypto.randomUUID() };
    return { requestId: reqRef.current.id, ...body };
  };

  const confirm = () => {
    if (!canReview || record.isPending) return;
    record.mutate({ data: payload() }, {
      onSuccess: (a) => {
        qc.invalidateQueries({ queryKey: getListQualityActionsQueryKey() });
        invalidateTrace(qc);
        toast({ title: `${ACT[a.action].verb} recorded`, description: `${a.batchIds.join(", ")} · internal record only, nothing was sent.` });
        reqRef.current = null;
        setConfirming(false); setAction(null); setSel([]); setRationale("");
      },
      onError: (e) => {
        const s = errStatus(e);
        toast({ variant: "destructive", title: s === 400 ? "Not recorded: prerequisites not met" : s === 409 ? "Not recorded: duplicate request conflict" : "Not recorded",
          description: s === 409 ? "This request ID was already used for a different decision. Edit the draft and try again." : errMessage(e) });
        if (s === 409) reqRef.current = null;
      },
    });
  };

  return (
    <section data-testid="panel-quality-decision" className="rise rounded-xl border border-primary/30 bg-card overflow-hidden">
      <div className="bg-sidebar text-sidebar-foreground border-b px-4 md:px-5 py-3 flex flex-wrap items-center gap-2">
        <Gavel className="h-4 w-4 text-sidebar-primary" />
        <h2 className="font-semibold tracking-tight">Quality Decision Panel</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider opacity-70">For the Quality Manager · identity not verified in this shared demo</span>
      </div>
      <p data-testid="text-disclaimer" className="px-4 md:px-5 py-2.5 text-sm border-b tone-warn border-x-0 border-t-0 flex gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />{DISCLAIMER}
      </p>
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="p-4 md:p-5 space-y-4 lg:border-r">
          <div>
            <Label>1 · Action</Label>
            <div className="grid sm:grid-cols-2 gap-2 mt-1.5">
              {(Object.keys(ACT) as Action[]).map((k) => {
                const A = ACT[k];
                return (
                  <button key={k} type="button" data-testid={`button-action-${k}`} onClick={() => setAction(k)}
                    className={cn("flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold text-left transition-all", action === k ? A.cls + " ring-1 ring-current/30" : "bg-background hover:border-primary")}>
                    <A.Icon className="h-4 w-4" />{A.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>2 · Batch scope (select explicitly)</Label>
            <div className="mt-1.5 space-y-1.5">
              {runs.length === 0 && <p className="text-xs text-muted-foreground">No batches in the current trace.</p>}
              {runs.map((r) => {
                const on = sel.includes(r.id);
                const blocked = action === "release" && r.inspectionResult !== "passed";
                return (
                  <label key={r.id} data-testid={`option-batch-${r.id}`} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors", on ? "border-primary bg-primary/5" : "bg-background hover:bg-secondary/50")}>
                    <input type="checkbox" data-testid={`checkbox-batch-${r.id}`} checked={on} onChange={() => toggle(r.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    <span className="font-mono font-semibold text-sm">{r.id}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{fmt(r.quantity)} cups</span>
                    <span className="ml-auto"><InspPill v={r.inspectionResult} /></span>
                    {blocked && on && <span className="sr-only">cannot be released</span>}
                  </label>
                );
              })}
            </div>
            {notPassed.length > 0 && (
              <p data-testid="text-release-blocked" className="text-xs text-destructive mt-2">Release requires a passed inspection. Not passed: {notPassed.map((r) => r.id).join(", ")}. A rationale cannot override this.</p>
            )}
          </div>
          <div>
            <Label htmlFor="qa-rationale">3 · Rationale</Label>
            <Textarea id="qa-rationale" data-testid="input-rationale" maxLength={5000} rows={3} className="mt-1.5" placeholder="Why this decision, what evidence was reviewed" value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="button-review-action" disabled={!canReview} onClick={() => setConfirming(true)}>Review and confirm</Button>
            {sel.length > 0 && <span className="font-mono text-xs text-muted-foreground">{sel.length} batch{sel.length > 1 ? "es" : ""} · {fmt(qty)} cups</span>}
          </div>
        </div>
        <DecisionHistory q={history} />
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !record.isPending && setConfirming(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action && ACT[action].label}?</DialogTitle>
            <DialogDescription>This saves an internal instruction only. It does not notify customers, execute a recall, dispatch goods, or change shipment quantities or statuses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border divide-y">
              {selRuns.map((r) => (
                <div key={r.id} className="flex justify-between px-3 py-2" data-testid={`confirm-batch-${r.id}`}><span className="font-mono">{r.id}</span><span className="font-mono tabular-nums">{fmt(r.quantity)} cups</span></div>
              ))}
              <div className="flex justify-between px-3 py-2 font-semibold bg-secondary/50"><span>Total in scope</span><span className="font-mono tabular-nums" data-testid="text-confirm-total">{fmt(qty)} cups</span></div>
            </div>
            <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">Rationale</div><p className="whitespace-pre-wrap break-words">{rationale.trim()}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" data-testid="button-confirm-cancel" disabled={record.isPending} onClick={() => setConfirming(false)}>Cancel, change nothing</Button>
            <Button data-testid="button-confirm-action" disabled={record.isPending || !canReview} onClick={confirm}>{record.isPending ? "Recording…" : "Confirm and record"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DecisionHistory({ q }: { q: { data?: QualityAction[]; isLoading: boolean; isError: boolean; refetch: () => unknown } }) {
  const items = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [q.data]);
  return (
    <div className="p-4 md:p-5 bg-secondary/30">
      <div className="flex items-center gap-2 mb-3"><History className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold text-sm">Decision history</h3><span className="text-[10px] font-mono text-muted-foreground ml-auto">append-only</span></div>
      {q.isLoading ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : q.isError ? (
          <div className="text-sm text-center py-6"><p className="text-muted-foreground">History could not be loaded.</p><Button size="sm" variant="outline" className="mt-2" data-testid="button-retry-history" onClick={() => q.refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Retry</Button></div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="empty-history">No decisions recorded yet.</div>
        ) : (
          <ol className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {items.map((a) => {
              const A = ACT[a.action];
              return (
                <li key={a.requestId} data-testid={`history-${a.requestId}`} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", A.cls)}><A.Icon className="h-3 w-3" />{A.verb}</span>
                    <span className="font-mono text-xs">{a.batchIds.join(", ")}</span>
                    <span className="font-mono text-xs text-muted-foreground">{fmt(a.quantity)} cups</span>
                  </div>
                  <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{a.rationale}</p>
                  <div className="font-mono text-[10px] text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleString()} · internal instruction, not executed</div>
                </li>
              );
            })}
          </ol>
        )}
    </div>
  );
}
