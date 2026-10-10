import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EvidenceAccessHistory as History } from "@workspace/api-client-react";

export function EvidenceAccessHistory({ endpoint, userId }: { endpoint: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const history = useQuery<History>({
    queryKey: ["evidence-access-history", userId, endpoint, before],
    enabled: open, staleTime: 0, refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch(`${endpoint}${before ? `?before=${before}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Access history is unavailable or you no longer have permission.");
      return res.json();
    },
  });
  return <details onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Access history</summary>
    <p><small>Changes recorded since access tracking began. Earlier access is not reconstructed. Account and team IDs identify exactly who and what changed.</small></p>
    {history.isLoading ? <p>Loading access history…</p> : history.isError ?
      <p role="alert">{history.error.message} <button className="ptc-btn" onClick={() => void history.refetch()}>Retry</button></p> :
      history.data && <>
        {!history.data.items.length && <p>No access changes recorded.</p>}
        <ol>{history.data.items.map(change => <li key={change.id} style={{ overflowWrap: "anywhere" }}>
          {change.action === "sharing_changed"
            ? <>Sharing: {change.previousTeamId ? `team ${change.previousTeamId}` : "Private"} → {change.nextTeamId ? `team ${change.nextTeamId}` : "Private"}</>
            : <>{change.action === "member_approved" ? "Approved member" : "Removed member"} <code>{change.memberId}</code></>}
          <br/><small>By account <code>{change.actorId}</code> · <time dateTime={String(change.createdAt)}>{new Date(change.createdAt).toLocaleString()}</time></small>
        </li>)}</ol>
        <button className="ptc-btn" disabled={!cursors.length} onClick={() => setCursors(c => c.slice(0, -1))}>Newer changes</button>{" "}
        <button className="ptc-btn" disabled={!history.data.nextBefore} onClick={() => setCursors(c => [...c, history.data!.nextBefore!])}>Older changes</button>
      </>}
  </details>;
}
