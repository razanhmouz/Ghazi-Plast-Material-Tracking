import { listPackagingAllocationHistory, getListPackagingAllocationHistoryQueryKey } from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AllocationTrace } from "./packaging-allocations";

export function PackagingAllocationHistory({ batchId }: { batchId: string }) {
  const history = useInfiniteQuery({
    queryKey: [...getListPackagingAllocationHistoryQueryKey(batchId), "infinite"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => listPackagingAllocationHistory(batchId, { limit: 20, cursor: pageParam }, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined,
    // Infinite queries rebuild each cursor sequentially on refresh, including save invalidation.
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const changes = history.data?.pages.flatMap(page => page.items) ?? [];
  return <section aria-label="Allocation history">
    <h3>Allocation history · read-only</h3>
    <p>Changes recorded since history tracking began. Earlier edits are not available. Shared-demo edits are not attributed to an authenticated staff member.</p>
    {history.isLoading && <p role="status">Loading allocation history…</p>}
    {history.isError && <p role="alert">{history.isFetchNextPageError ? "Older entries could not be loaded. Entries already shown are unchanged." : "Allocation history could not be refreshed."} <button className="ptc-btn" disabled={history.isFetching} onClick={() => void (history.isFetchNextPageError ? history.fetchNextPage() : history.refetch())}>Retry</button></p>}
    {!history.isLoading && !history.isError && changes.length === 0 && <p>No allocation changes recorded yet.</p>}
    {changes.map(change => <details key={change.id} style={{ marginBlock: 12 }}>
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
    {changes.length > 0 && <p role="status">Showing {changes.length} changes{history.isFetching && !history.isFetchingNextPage ? " · Refreshing…" : ""}</p>}
    {history.hasNextPage && <button className="ptc-btn" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>
      {history.isFetchingNextPage ? "Loading older changes…" : "Load more"}
    </button>}
  </section>;
}
