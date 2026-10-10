import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EvidenceTeam } from "@workspace/api-client-react";

const endpoint = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/packaging/teams`;
export async function teamRequest(path = "", method = "GET", body?: unknown) {
  const res = await fetch(endpoint + path, { method, credentials: "include",
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Team request failed. Please retry.");
  return res.status === 204 ? undefined : res.json();
}
export function useEvidenceTeams(userId?: string) {
  return useQuery<EvidenceTeam[]>({ queryKey: ["evidence-teams", userId], enabled: !!userId,
    staleTime: 0, refetchInterval: 30000, queryFn: () => teamRequest() });
}
export function PackagingTeams({ userId }: { userId: string }) {
  const teams = useEvidenceTeams(userId);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [member, setMember] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const action = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await teamRequest(path, method, body);
      await qc.invalidateQueries({ queryKey: ["evidence-teams"] });
      await qc.invalidateQueries({ queryKey: ["packaging-documents"] });
      setMember(""); setName(""); setMessage("Team permissions saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update team."); }
    finally { setBusy(false); }
  };
  const team = teams.data?.find(t => t.id === selected && t.isOwner);
  return <details>
    <summary>Manage approved evidence teams</summary>
    <p>Your account ID: <code>{userId}</code>. Give this ID to your team owner to request access.</p>
    <p>Teams are managed by their creator, not verified company staff directories. Approve only colleagues you trust. Members can read all evidence explicitly shared with their team and share their own files. Private files remain private.</p>
    {teams.isError && <p role="alert">Teams could not be loaded. <button onClick={() => void teams.refetch()}>Retry</button></p>}
    <fieldset disabled={busy}>
      <label className="ptc-field">New evidence team name<input maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
      <button className="ptc-btn" disabled={!name.trim()} onClick={() => void action("", "POST", { name })}>Create team</button>
      <label className="ptc-field">Team you manage<select value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Choose team</option>
        {teams.data?.filter(t => t.isOwner).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label>
      {team && <>
        <label className="ptc-field">Colleague account ID<input value={member} onChange={e => setMember(e.target.value)} /></label>
        <button className="ptc-btn" disabled={!member.trim()} onClick={() => void action(`/${team.id}/members/${encodeURIComponent(member.trim())}`, "PUT")}>Approve member</button>
        <p>You are the team owner. Removing a member blocks future downloads; already downloaded copies cannot be recalled.</p>
        <ul>{team.members.map(id => <li key={id}><code>{id}</code>{" "}
          <button className="ptc-btn" onClick={() => void action(`/${team.id}/members/${encodeURIComponent(id)}`, "DELETE")}>Remove member</button>
        </li>)}</ul>
        {!team.members.length && <p>No approved colleagues yet.</p>}
      </>}
    </fieldset>
    {error && <p role="alert" className="ptc-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
