import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateRun } from "@workspace/api-client-react";
import type { ChecklistEntry, Run } from "@workspace/api-client-react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { errMessage, fmt, INSP, invalidateTrace, type Insp } from "@/lib/trace-shared";

export function ChecklistDialog({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateRun();
  const [items, setItems] = useState<ChecklistEntry[]>([]);
  const [overall, setOverall] = useState<Insp>("pending");
  const [inkLot, setInkLot] = useState("");
  const initFor = useRef<string | null>(null);

  useEffect(() => {
    if (!run) { initFor.current = null; return; }
    if (initFor.current === run.id) return;
    initFor.current = run.id;
    setItems(run.checklist.map((c) => ({ ...c })));
    setOverall(run.inspectionResult);
    setInkLot(run.inkLot);
  }, [run]);

  const patch = (i: number, p: Partial<ChecklistEntry>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const invalid = items.some((x) => !x.label.trim());
  const anyFailed = items.some((x) => x.result === "failed");
  const passBlocked = run?.releaseDecision === "released" && overall !== "passed";

  const save = () => {
    if (!run || invalid || passBlocked) return;
    const releaseDecision = run.releaseDecision;
    update.mutate({ id: run.id, data: {
      inkLot: inkLot.trim(), inspectionResult: overall, releaseDecision, qualityNotes: run.qualityNotes,
      checklist: items.map((x) => ({ label: x.label.trim(), result: x.result, notes: x.notes.trim() })),
    } }, {
      onSuccess: (r) => {
        invalidateTrace(qc);
        toast({ title: `${r.id} checklist saved`, description: `${r.checklist.length} checks · inspection ${INSP[r.inspectionResult].label.toLowerCase()}` });
        onClose();
      },
      onError: (e) => toast({ title: "Checklist not saved", description: errMessage(e), variant: "destructive" }),
    });
  };

  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono" data-testid="text-checklist-batch">QC Inspection Checklist · {run?.id}</DialogTitle>
          <DialogDescription>{run && fmt(run.quantity)} cups. Enter the checks your staff actually performed. Nothing here is a preset standard; unrecorded items stay pending.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cl-ink">Ink lot for this batch</Label>
            <Input id="cl-ink" data-testid="input-checklist-ink" maxLength={100} className="font-mono mt-1.5" placeholder="e.g. INK-2291-B" value={inkLot} onChange={(e) => setInkLot(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label>Inspection entries</Label><span className="font-mono text-[10px] text-muted-foreground">{items.length}/100</span></div>
            {items.length === 0 && (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground" data-testid="empty-checklist">No checks recorded for this batch yet. Add each check as it is performed.</div>
            )}
            {items.map((x, i) => (
              <div key={i} data-testid={`row-check-${i}`} className="rounded-lg border bg-background p-3 space-y-2">
                <div className="flex gap-2">
                  <Input data-testid={`input-check-label-${i}`} maxLength={200} placeholder="Check performed, e.g. Odor sample of 20 cups" value={x.label} onChange={(e) => patch(i, { label: e.target.value })} className={cn(!x.label.trim() && "border-destructive/60")} />
                  <Button variant="ghost" size="icon" data-testid={`button-remove-check-${i}`} aria-label="Remove check" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-secondary">
                  {(Object.keys(INSP) as Insp[]).map((k) => (
                    <button key={k} type="button" data-testid={`button-check-${i}-${k}`} onClick={() => patch(i, { result: k })}
                      className={cn("rounded-md py-1 text-xs font-medium transition-all", x.result === k ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{INSP[k].label}</button>
                  ))}
                </div>
                <Textarea data-testid={`input-check-notes-${i}`} maxLength={2000} rows={2} placeholder="Notes, sample size, observer" value={x.notes} onChange={(e) => patch(i, { notes: e.target.value })} />
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={items.length >= 100} data-testid="button-add-check" onClick={() => setItems((xs) => [...xs, { label: "", result: "pending", notes: "" }])}><Plus className="h-3.5 w-3.5 mr-1" />Add check</Button>
          </div>
          <div>
            <Label>Overall inspection result</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-1 p-1 rounded-lg bg-secondary">
              {(Object.keys(INSP) as Insp[]).map((k) => (
                <button key={k} type="button" data-testid={`button-overall-${k}`} onClick={() => setOverall(k)}
                  className={cn("rounded-md py-1.5 text-xs font-medium transition-all", overall === k ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{INSP[k].label}</button>
              ))}
            </div>
            {passBlocked && <p className="text-xs text-destructive mt-1.5">This batch is released. Change its release decision manually in the batch editor before recording a non-passed inspection.</p>}
            {anyFailed && overall !== "failed" && <p className="text-xs text-[hsl(28_70%_28%)] mt-1.5">A check is marked failed. Confirm the overall result is correct.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-checklist-cancel">Cancel</Button>
          <Button onClick={save} disabled={update.isPending || invalid || passBlocked} data-testid="button-checklist-save">{update.isPending ? "Saving…" : "Save checklist"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
