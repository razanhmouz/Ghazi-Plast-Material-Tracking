import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTraceQueryKey, useAddDestination } from "@workspace/api-client-react";
import type { Run, Trace } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMessage, fmt, invalidateTrace } from "@/lib/trace-shared";

export function AddDestination({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" disabled={!runs.length} data-testid="button-add-destination">+ Add Destination</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Destination</DialogTitle>
        <DialogDescription>Add quantities to a batch and its shipped or warehouse totals. This does not transfer existing inventory or release a shipment.</DialogDescription>
      </DialogHeader>
      {open && <DestinationForm runs={runs} close={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}

function DestinationForm({ runs, close }: { runs: Run[]; close: () => void }) {
  const qc = useQueryClient();
  const mutation = useAddDestination();
  const [batch, setBatch] = useState(runs[0]?.id ?? "");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState<"shipped" | "inventory">("shipped");
  const [passed, setPassed] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ signature: string; id: string } | null>(null);
  const amount = Number(quantity);
  const run = runs.find(r => r.id === batch);
  const valid = !!run && !!name.trim() && Number.isInteger(amount) && amount > 0 && amount <= 1000000000 && passed;
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault();
    if (!valid || mutation.isPending) return;
    setError("");
    const signature = JSON.stringify([batch, name.trim(), amount, type]);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    mutation.mutate({ id: batch, data: { requestId: request.current.id, name: name.trim(), quantity: amount, type, confirmedPassed: true } }, {
      onSuccess: updated => {
        qc.setQueriesData<Trace>({ predicate: q => q.queryKey[0] === getGetTraceQueryKey()[0] }, old =>
          old ? { ...old, runs: old.runs.map(r => r.id === updated.id ? updated : r) } : old);
        void invalidateTrace(qc);
        close();
      },
      onError: e => setError(errMessage(e)),
    });
  }}>
    <fieldset disabled={mutation.isPending} className="space-y-4">
      <div className="space-y-1"><Label htmlFor="destination-batch">Batch</Label>
        <select id="destination-batch" className="w-full rounded-md border bg-background p-2" value={batch} onChange={e => setBatch(e.target.value)}>
          {runs.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="destination-name">Destination Name</Label><Input id="destination-name" value={name} onChange={e => setName(e.target.value)} maxLength={200} required /></div>
      <div className="space-y-1"><Label htmlFor="destination-quantity">Quantity (cups)</Label><Input id="destination-quantity" type="number" min={1} max={1000000000} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
      <div className="space-y-1"><Label htmlFor="destination-type">Destination type</Label>
        <select id="destination-type" className="w-full rounded-md border bg-background p-2" value={type} onChange={e => setType(e.target.value as typeof type)}>
          <option value="shipped">Shipped to customer</option><option value="inventory">Warehouse inventory</option>
        </select>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-cyan-400" checked={passed} onChange={e => setPassed(e.target.checked)} required />
        I confirm this destination’s quantity has passed inspection. Record a Passed badge for this row only; leave the batch quality decision unchanged.
      </label>
      {run && Number.isInteger(amount) && amount > 0 && <p className="text-sm text-primary">Batch total: {fmt(run.quantity)} → {fmt(run.quantity + amount)} cups</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={!valid}>{mutation.isPending ? "Saving…" : "Save Destination"}</Button>
      </div>
    </fieldset>
  </form>;
}
