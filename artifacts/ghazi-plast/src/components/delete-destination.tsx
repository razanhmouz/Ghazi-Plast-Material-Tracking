import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTraceQueryKey, useDeleteDestination, type Run, type Trace } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errMessage, fmt, invalidateTrace } from "@/lib/trace-shared";

export function DeleteDestination({ run, index, close }: { run: Run; index: number; close: () => void }) {
  const mutation = useDeleteDestination();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const destination = run.destinations[index];
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) close(); }}>
    <DialogContent onEscapeKeyDown={e => { if (mutation.isPending) e.preventDefault(); }}
      onInteractOutside={e => { if (mutation.isPending) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Delete Destination?</DialogTitle>
        <DialogDescription>Permanently remove {destination.name} from {run.id}, including its {fmt(destination.quantity)} cups. This changes recorded totals; it does not recall or cancel an actual shipment.</DialogDescription>
      </DialogHeader>
      <p className="text-sm">Batch total: <strong>{fmt(run.quantity)} → {fmt(run.quantity - destination.quantity)} cups</strong></p>
      <p className="text-sm text-muted-foreground">Affected Production and {destination.type === "shipped" ? "Shipped Quantities" : "Remaining Inventory"} will decrease by {fmt(destination.quantity)} cups.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>Cancel</Button>
        <Button variant="destructive" disabled={mutation.isPending || !!error} data-testid="confirm-delete-destination" onClick={() => {
          if (mutation.isPending) return;
          mutation.mutate({ id: run.id, index, data: { expectedQuantity: run.quantity, expectedDestinations: run.destinations } }, {
            onSuccess: async updated => {
              const filter = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === getGetTraceQueryKey()[0] };
              await qc.cancelQueries(filter);
              qc.setQueriesData<Trace>(filter, old => old ? { ...old, runs: old.runs.map(r => r.id === updated.id ? updated : r) } : old);
              void invalidateTrace(qc);
              close();
            },
            onError: e => { setError(errMessage(e)); void invalidateTrace(qc); },
          });
        }}>{mutation.isPending ? "Deleting…" : "Delete Destination"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
