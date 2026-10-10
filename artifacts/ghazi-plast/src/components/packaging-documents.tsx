import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import type { PackagingDocument } from "@workspace/api-client-react";
import { PackagingTeams, useEvidenceTeams } from "./packaging-teams";

const labels = { supplier_declaration: "Supplier declaration / certificate", migration_report: "Migration test report", inspection_report: "Inspection report" };
type Kind = keyof typeof labels;
const scanLabels = {
  pending: "Pending malware scan — quarantined",
  clean: "Malware scan passed — certification unverified",
  rejected: "Rejected by malware scan — download blocked (unsafe or unscannable file)",
  scan_error: "Scan error — quarantined; retrying automatically",
};
const api = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
async function checked(response: Response) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Request failed (${response.status}). Please retry.`);
  }
  return response;
}

export function PackagingDocuments({ batchId }: { batchId: string }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const teams = useEvidenceTeams(user?.id);
  const [kind, setKind] = useState<Kind>("supplier_declaration");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const endpoint = `${api}/packaging/batches/${encodeURIComponent(batchId)}/documents`;
  const key = ["packaging-documents", batchId, user?.id];
  const documents = useQuery<PackagingDocument[]>({
    queryKey: key, enabled: isAuthenticated, staleTime: 0, refetchInterval: 5000,
    queryFn: async () => (await checked(await fetch(endpoint, { credentials: "include" }))).json(),
  });
  const upload = async () => {
    setError(""); setMessage("");
    if (!file || !file.size || file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name) || file.name.length > 180) {
      setError("Choose a non-empty PDF, PNG or JPEG up to 10 MiB, with a filename no longer than 180 characters."); return;
    }
    setBusy(true);
    try {
      await checked(await fetch(endpoint, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/octet-stream", "x-document-name": encodeURIComponent(file.name), "x-document-kind": kind },
        body: file,
      }));
      setFile(null); if (input.current) input.current.value = "";
      await qc.invalidateQueries({ queryKey: key });
      setMessage("Evidence uploaded into quarantine. Download becomes available only after a successful malware scan. Certification and batch status have not changed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Please retry."); }
    finally { setBusy(false); }
  };
  const download = async (doc: PackagingDocument) => {
    setError(""); setBusy(true);
    try {
      const response = await checked(await fetch(`${endpoint}/${doc.id}/download`, { credentials: "include" }));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = doc.name;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed. Please retry."); }
    finally { setBusy(false); }
  };
  const returnTo = `${window.location.pathname}?documentBatch=${encodeURIComponent(batchId)}`;
  const share = async (doc: PackagingDocument, sharedTeamId: string | null) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await checked(await fetch(`${endpoint}/${doc.id}/sharing`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedTeamId }),
      }));
      await qc.invalidateQueries({ queryKey: key });
      setMessage(sharedTeamId ? "Evidence shared with the approved team. It remains unverified." : "Evidence is now private to your account.");
    } catch (e) { setError(e instanceof Error ? e.message : "Sharing failed."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Batch evidence documents">
    <h3>Evidence files</h3>
    <p>Evidence is quarantined until malware scanning succeeds. A passed scan does not verify certification, food-contact suitability, or guarantee that a file is safe.</p>
    {isLoading ? <p>Checking document access…</p> : !isAuthenticated ?
      <a className="ptc-btn" href={`${api}/login?returnTo=${encodeURIComponent(returnTo)}`}>Log in to upload or download your evidence</a> :
      <>
        <p><small>Uploads start private. Only the uploader can share a file with an approved evidence team. <a href={`${api}/logout?returnTo=${encodeURIComponent(returnTo)}`}>Log out</a></small></p>
        {user && <PackagingTeams key={user.id} userId={user.id}/>}
        {documents.isLoading ? <p>Loading documents…</p> : documents.isError ?
          <p role="alert" className="ptc-error">Documents could not be loaded. <button className="ptc-btn" onClick={() => void documents.refetch()}>Retry</button></p> :
          documents.data?.length ? <ul style={{ paddingLeft: 20 }}>{documents.data.map(doc => <li key={doc.id} style={{ marginBottom: 12, overflowWrap: "anywhere" }}>
            <strong>{doc.name}</strong> — {labels[doc.kind]}<br/>
            <small>{(doc.size / 1024).toFixed(1)} KiB · {new Date(doc.createdAt).toLocaleString()} · Uploaded, unverified</small>{" "}
            <span role="status">{scanLabels[doc.scanStatus] ?? "Quarantined — scan status unavailable"}</span>{" "}
            <button className="ptc-btn" disabled={busy || doc.scanStatus !== "clean"} onClick={() => void download(doc)}>Download</button>
            <p><small>{doc.sharedTeamId ? `Shared with ${teams.data?.find(t => t.id === doc.sharedTeamId)?.name ?? "an evidence team"}` : "Private to uploader"}</small></p>
            {doc.canManage && <label className="ptc-field">Who can read this file?
              <select aria-label={`Sharing for ${doc.name}`} disabled={busy || teams.isLoading || teams.isError} value={doc.sharedTeamId ?? ""} onChange={e => void share(doc, e.target.value || null)}>
                <option value="">Private — only me</option>
                {doc.sharedTeamId && !teams.data?.some(t => t.id === doc.sharedTeamId) && <option value={doc.sharedTeamId}>Previously shared team (no longer a member)</option>}
                {teams.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>}
          </li>)}</ul> : <p>No private or team-shared files available to your account for this batch.</p>}
        <fieldset disabled={busy}>
          <label className="ptc-field">Document category<select value={kind} onChange={e => setKind(e.target.value as Kind)}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="ptc-field">Evidence file · PDF, PNG or JPEG · max 10 MiB<input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); setMessage(""); }}/></label>
          <button type="button" className="ptc-btn ptc-btn-primary" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Transferring file…" : "Upload evidence"}</button>
        </fieldset>
      </>}
    {error && <p className="ptc-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
