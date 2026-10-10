import { useQuery } from "@tanstack/react-query";
import type { PackagingScannerHealth } from "@workspace/api-client-react";

const titles = {
  healthy: "Scanner available",
  retrying: "Temporary scan failure — retrying",
  outage: "Persistent scan failures — operator action needed",
  blocked: "Scanning blocked — definitions unavailable or stale",
  unknown: "Scanner health not yet confirmed",
};

export function PackagingScannerStatus({ endpoint, userId }: { endpoint: string; userId: string }) {
  const health = useQuery<PackagingScannerHealth>({
    queryKey: ["packaging-scanner-health", endpoint, userId],
    staleTime: 0, refetchInterval: 15_000,
    queryFn: async () => {
      const response = await fetch(`${endpoint}/scanner-health`, { credentials: "include" });
      if (!response.ok) throw new Error("Health unavailable");
      return response.json();
    },
  });
  if (health.isError) return <p role="alert" className="ptc-error">
    Scanner health could not be refreshed; do not assume scanning is working. Quarantined downloads remain blocked.
    Ask the operator to check the API and database. <button className="ptc-btn" onClick={() => void health.refetch()}>Retry health check</button>
  </p>;
  if (!health.data) return <p role="status">Checking scanner health…</p>;
  const h = health.data;
  const attention = h.status !== "healthy" || h.aging || h.errors > 0;
  return <aside aria-label="Evidence scanner health" role={attention ? "alert" : "status"}>
    <strong>{titles[h.status]}</strong>
    <p>{h.queued} quarantined · {h.errors} awaiting retry in this batch, limited to evidence you can access.
      {h.oldestQueuedAt && <> Oldest upload: {new Date(h.oldestQueuedAt).toLocaleString()}.</>}
    </p>
    {h.status === "retrying" && <p>Retries are automatic, normally after 5 minutes. Three consecutive failed checks spanning at least 10 minutes are treated as an outage.</p>}
    {h.status === "outage" && <p>Ask the operator to check ClamAV availability, server capacity, private storage and database access. Restore the service; existing quarantined files retry automatically. Do not re-upload or bypass quarantine.</p>}
    {h.status === "blocked" && <p>Definitions are {h.definitions}. Ask the operator to run/check freshclam, its write permissions and network access to database.clamav.net. Definitions must have a successful update check within 48 hours. Updates retry automatically after 30 minutes.</p>}
    {h.status === "unknown" && <p>Wait for the availability check (every 5 minutes). If this persists beyond 10 minutes, ask the operator to check or restart the scan worker.</p>}
    {h.aging && <p><strong>Quarantine delay:</strong> Evidence has waited at least 30 minutes. Check worker activity, storage access and scanner capacity; a backlog is not proof of a scanner outage.</p>}
    {h.errors > 0 && h.status === "healthy" && <p>The scanner availability check passed, but evidence is awaiting retry. If the delay persists, check storage access and worker logs.</p>}
    <small>Last scanner check: {h.lastCheckAt ? new Date(h.lastCheckAt).toLocaleString() : "not yet completed"}.
      {" "}Last successful check: {h.lastSuccessAt ? new Date(h.lastSuccessAt).toLocaleString() : "none since restart"}.
      {" "}Definitions checked: {h.definitionsCheckedAt ? new Date(h.definitionsCheckedAt).toLocaleString() : "unavailable"}.
      {" "}Consecutive failures: {h.consecutiveFailures}. Availability history is for this server since restart; queue age survives restarts.
      {" "}Health does not release files or verify certification.</small>
  </aside>;
}
