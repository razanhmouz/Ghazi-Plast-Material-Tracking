import { useState } from "react";
import { getGetTraceQueryKey, useGetTrace } from "@workspace/api-client-react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fmt } from "@/lib/trace-shared";

export function OwnerVerification() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-owner-verification">
          <ClipboardCheck className="h-4 w-4 mr-2" />Owner verification
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Owner verification · P-77</DialogTitle>
          <DialogDescription>Independently review recorded quantities and shipping destinations. Read-only: no shipments or quality decisions are changed.</DialogDescription>
        </DialogHeader>
        {open && <VerificationReport />}
      </DialogContent>
    </Dialog>
  );
}

function VerificationReport() {
  const params = { search: "P-77" };
  const { data, isFetching, isError, refetch } = useGetTrace(params, {
    query: { queryKey: getGetTraceQueryKey(params), refetchOnMount: "always", refetchOnWindowFocus: true },
  });
  if (isFetching) return <p role="status">Checking current P-77 records…</p>;
  if (isError || !data) return <div role="alert">Unable to verify current records. <Button variant="outline" onClick={() => refetch()}>Retry</Button></div>;
  const materialIds = new Set(data.materials.filter((m) => m.supplier === "P-77").map((m) => m.id));
  const runs = data.runs.filter((r) => materialIds.has(r.materialId));
  const customers = new Map<string, number>();
  let inventory = 0;
  for (const run of runs) for (const destination of run.destinations) {
    if (destination.type === "shipped") customers.set(destination.name, (customers.get(destination.name) ?? 0) + destination.quantity);
    else inventory += destination.quantity;
  }
  const production = runs.reduce((sum, run) => sum + run.quantity, 0);
  const shipped = [...customers.values()].reduce((sum, qty) => sum + qty, 0);
  const balanced = runs.length > 0 && runs.every((run) => run.quantity === run.destinations.reduce((sum, d) => sum + d.quantity, 0));
  const matches = balanced && production === 7000 && inventory === 1000 && customers.size === 3 &&
    customers.get("Customer A") === 2500 && customers.get("Customer B") === 1500 && customers.get("Customer C") === 2000;
  return (
    <div className="space-y-4 text-sm" data-testid="owner-verification-report">
      <p role="status" className={`rounded-lg border p-3 font-semibold ${matches ? "tone-ok" : "tone-bad"}`}>
        {matches ? "Records match: 7,000 cups and 3 shipping destinations." : "Discrepancy: current records do not match the expected P-77 quantities or destinations."}
      </p>
      <section>
        <h3 className="font-semibold mb-2">Affected production</h3>
        {runs.map((run) => <div key={run.id} className="flex justify-between gap-3 border-b py-2"><span className="font-mono">{run.id}</span><span>{fmt(run.quantity)} cups</span></div>)}
        <p className="font-semibold mt-2">Total: {fmt(production)} cups <span className="font-normal text-muted-foreground">(expected 7,000)</span></p>
      </section>
      <section>
        <h3 className="font-semibold mb-2">Shipping destinations · {customers.size}</h3>
        {[...customers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, qty]) => (
          <div key={name} className="border-b py-2">
            <div className="flex justify-between gap-3"><span>{name}</span><span>{fmt(qty)} cups</span></div>
            <p className="text-xs text-muted-foreground">{runs.flatMap((r) => r.destinations.filter((d) => d.type === "shipped" && d.name === name).map((d) => `${r.id}: ${fmt(d.quantity)}`)).join(" · ")}</p>
          </div>
        ))}
      </section>
      <section className="rounded-lg bg-secondary p-3 space-y-1">
        <h3 className="font-semibold">Quantity reconciliation</h3>
        <p>{fmt(shipped)} shipped + {fmt(inventory)} in warehouse = {fmt(shipped + inventory)} cups</p>
        <p className={balanced ? "text-primary" : "text-destructive"}>{balanced ? "Every batch’s destinations account for its full production quantity." : "One or more batch totals cannot be reconciled."}</p>
        <p className="text-xs text-muted-foreground">Warehouse inventory is not a shipping destination.</p>
      </section>
      <p className="text-xs text-muted-foreground">This checks the shared demo’s stored records, not physical stock or proof of delivery.</p>
      <Button variant="outline" onClick={() => refetch()}>Recheck records</Button>
    </div>
  );
}
