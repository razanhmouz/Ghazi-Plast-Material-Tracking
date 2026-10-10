import { useListPackagingAllocationHistory, getListPackagingAllocationHistoryQueryKey } from "@workspace/api-client-react";
import { AllocationTrace } from "./packaging-allocations";

export function PackagingAllocationHistory({ batchId }: { batchId: string }) {
  const history = useListPackagingAllocationHistory(batchId, {
    query: { queryKey: getListPackagingAllocationHistoryQueryKey(batchId), staleTime: 0, refetchInterval: 30_000 },
  });
  return <section aria-label="Allocation history">
    <h3>Allocation history · read-only</h3>
    <p>Changes recorded since history tracking began. Earlier edits are not available. Shared-demo edits are not attributed to an authenticated staff member.</p>
    {history.isLoading && <p role="status">Loading allocation history…</p>}
    {history.isError && <p role="alert">Allocation history could not be loaded. <button className="ptc-btn" onClick={() => void history.refetch()}>Retry</button></p>}
    {!history.isLoading && !history.isError && history.data?.length === 0 && <p>No allocation changes recorded yet.</p>}
    {history.data?.map(change => <details key={change.id} style={{ marginBlock: 12 }}>
      <summary style={{ cursor: "pointer" }}>
        <time dateTime={String(change.createdAt)}>{new Date(change.createdAt).toLocaleString()}</time>
        {" · Shared-demo edit · "}{change.lotId}
      </summary>
      <small>Not a verified staff identity. All quantities remain human-entered trace records, not confirmed shipments.</small>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>Correction reason: </strong>{change.correctionReason || "No reason recorded."}</p>
      <h4>Before</h4>
      {change.before.length ? <AllocationTrace allocations={change.before}/> : <p>No customer allocations.</p>}
      <h4>After</h4>
      {change.after.length ? <AllocationTrace allocations={change.after}/> : <p>No customer allocations — all mappings removed.</p>}
    </details>)}
  </section>;
}
