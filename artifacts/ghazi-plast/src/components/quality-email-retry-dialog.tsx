import { useEffect, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { usePreviewQualityEmailRetry, useConfirmQualityEmailRetry, getListQualityActionsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errMessage } from "@/lib/trace-shared";

export function QualityEmailRetryButton({ requestId }: { requestId: string }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const preview = usePreviewQualityEmailRetry(requestId, { query: {
    queryKey: ["quality-email-retry", requestId, auth.user?.id],
    enabled: open && auth.isAuthenticated, staleTime: 0, gcTime: 0,
  } });
  const retry = useConfirmQualityEmailRetry();
  useEffect(() => { setOpen(false); setChecked(false); setNotes(""); setError(""); }, [auth.user?.id]);
  const data = preview.data;
  if (!auth.isAuthenticated) return null;
  return <>
    <Button size="sm" variant="outline" className="mt-2" onClick={() => { setChecked(false); setNotes(""); setError(""); setOpen(true); }}>Review email retry</Button>
    <Dialog open={open} onOpenChange={value => { if (!retry.isPending) setOpen(value); }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Confirm original email retry</DialogTitle><DialogDescription>This retries only the saved notification. The original decision, batches, quantities and email contents will not change. No automatic retries are performed.</DialogDescription></DialogHeader>
        {preview.isFetching ? <p>Loading current email status…</p> : preview.isError ? <p role="alert">{errMessage(preview.error)}</p> : data && <>
          <div className="text-sm space-y-1 break-words"><p>Current configured recipient: <strong>{data.currentRecipient}</strong></p><p>Original recipient (retry destination): <strong>{data.recipient}</strong></p><p>Original sender: {data.sender}</p><p>Safe retry deadline: {new Date(data.expiresAt).toLocaleString()}</p></div>
          <strong className="text-sm">{data.subject}</strong>
          <pre className="text-xs whitespace-pre-wrap break-words max-h-56 overflow-auto rounded border p-3">{data.body}</pre>
          {data.blockedReason ? <p role="alert" className="text-sm text-amber-500">{data.blockedReason}</p> : data.requiresReconciliation && <div className="space-y-2 text-sm">
            <p>The outcome is uncertain. Check Resend’s email logs for the decision ID, recipient and time above. If accepted or still uncertain, close this dialog—do not retry.</p>
            <label className="flex gap-2"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I checked Resend logs and confirmed that no email was accepted.</label>
            <Textarea aria-label="Resend log reconciliation details" placeholder="Record when and what you checked in Resend logs (no secrets)." maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>}
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={retry.isPending} onClick={() => setOpen(false)}>Cancel, send nothing</Button>
          <Button disabled={!data || preview.isFetching || preview.isError || !!data.blockedReason || retry.isPending || (data.requiresReconciliation && (!checked || notes.trim().length < 10))}
            onClick={() => {
              if (!data || retry.isPending) return;
              setError("");
              retry.mutate({ requestId, data: { version: data.version, confirmed: true, logsCheckedNoAcceptance: checked, reconciliation: notes } }, {
                onSuccess: () => { void qc.invalidateQueries({ queryKey: getListQualityActionsQueryKey() }); setOpen(false); },
                onError: e => { setError(errMessage(e)); void qc.invalidateQueries({ queryKey: getListQualityActionsQueryKey() }); },
              });
            }}>{retry.isPending ? "Retrying…" : "Confirm & retry original email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
