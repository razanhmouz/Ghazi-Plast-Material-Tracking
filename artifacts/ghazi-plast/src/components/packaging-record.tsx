import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePackagingBatch, useUpdatePackagingBatch, getListPackagingBatchesQueryKey, type PackagingBatch, type PackagingBatchInput } from "@workspace/api-client-react";
import { Factory, Layers, Package, Truck, ShieldAlert, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AllocationFields, AllocationTrace } from "./packaging-allocations";
import { PackagingDocuments } from "./packaging-documents";

export const packagingLabels: Record<string, string> = { ink: "Ink", adhesive: "Adhesive", coating: "Coating", raw_material: "Raw material", pending: "Pending", released: "Released", hold: "On hold", documented: "Documented", review_required: "Review required" };
export function PackagingBadge({ value }: { value: string }) { return <span className={`ptc-badge ${value}`}>{packagingLabels[value] || value}</span>; }
export function PackagingDetail({ batch, close, edit }: { batch: PackagingBatch | undefined; close: () => void; edit: (batch: PackagingBatch) => void }) {
  return <Dialog open={!!batch} onOpenChange={open => !open && close()}><DialogContent className="ptc ptc-dialog" style={{minHeight:0}}>{batch && <>
    <div className="ptc-eyebrow">Recorded material genealogy {batch.demo && " / DEMO RECORD"}</div>
    <DialogTitle className="ptc-dialog-title">{batch.lotId}</DialogTitle>
    <DialogDescription className="ptc-dialog-desc">{batch.materialName} · {packagingLabels[batch.category]} · {batch.quantity.toLocaleString()} {batch.unit}</DialogDescription>
    <div className="ptc-references"><PackagingBadge value={batch.status}/><PackagingBadge value={batch.complianceStatus}/></div>
    <h3>Aggregate links · unallocated</h3>
    <div className="ptc-trace">
      <div className="ptc-node"><Factory/><small>01 / Supplier</small><h3>{batch.supplierName}</h3><p>{batch.supplierCountry || "Country not recorded"}</p></div>
      <div className="ptc-node"><Layers/><small>02 / Material lot</small><h3>{batch.lotId}</h3><p>{batch.materialName}</p></div>
      <div className="ptc-node"><Package/><small>03 / Finished lots</small>{batch.finishedBatches.length ? batch.finishedBatches.map((s,i) => <p key={i}>{s}</p>) : <p>No links recorded</p>}</div>
      <div className="ptc-node"><Truck/><small>04 / Customers & destinations</small>{batch.destinations.length ? batch.destinations.map((s,i) => <p key={i}>{s}</p>) : <p>No destinations recorded</p>}</div>
    </div>
    <small>These aggregate links remain unallocated: no pairing or quantity is implied. Only the explicit allocations below establish exact mappings.</small>
    <AllocationTrace allocations={batch.allocations ?? []}/>
    <div className="ptc-detail-grid"><div><h3>Supplier information</h3><p>{batch.supplierContact || "Contact not recorded"}</p><small>Last updated {new Date(batch.updatedAt).toLocaleString()}</small></div><div><h3>Quality documentation</h3><p>Reference: {batch.documentRef || "Not recorded"}</p><p>{batch.complianceNotes || "No compliance notes recorded."}</p></div></div>
    <div className="ptc-note"><ShieldAlert/>Human-entered declarations, not independently verified legal compliance or certification. Release status is a recorded decision, not an automated approval.</div>
    <PackagingDocuments key={batch.id} batchId={batch.id}/>
    <div className="ptc-form-actions"><button className="ptc-btn" onClick={close}>Close</button><button className="ptc-btn ptc-btn-primary" onClick={() => edit(batch)}><Pencil/>Edit complete record</button></div>
  </>}</DialogContent></Dialog>;
}
const blank: PackagingBatchInput = { lotId:"",category:"ink",materialName:"",supplierName:"",supplierCountry:"",supplierContact:"",quantity:0,unit:"kg",status:"pending",complianceStatus:"pending",documentRef:"",complianceNotes:"",finishedBatches:[],destinations:[] };
export function PackagingEditor({ batch, close, saved }: { batch: PackagingBatch | null; close: () => void; saved: (b: PackagingBatch) => void }) {
  const [form,setForm] = useState<PackagingBatchInput>(batch ? { ...batch } : blank);
  const [quantity,setQuantity] = useState(batch ? String(batch.quantity) : "");
  const [finished,setFinished] = useState(batch?.finishedBatches.join("\n") ?? "");
  const [destinations,setDestinations] = useState(batch?.destinations.join("\n") ?? "");
  const [error,setError] = useState("");
  const [allocations,setAllocations] = useState(batch?.allocations ?? []);
  const create = useCreatePackagingBatch(); const update = useUpdatePackagingBatch(); const qc = useQueryClient();
  const busy = create.isPending || update.isPending;
  const blocked = form.complianceStatus === "documented" && !form.documentRef.trim() ? "A document reference is required for a documented declaration." : form.status === "released" && form.complianceStatus !== "documented" ? "Release requires a documented declaration with a document reference." : "";
  const field = (key: keyof PackagingBatchInput, value: string) => setForm(f => ({...f,[key]:value}));
  const text = (key: "lotId"|"materialName"|"supplierName"|"supplierCountry"|"supplierContact"|"documentRef", label: string, max: number, required = false) => <label className="ptc-field">{label}<input data-testid={`input-packaging-${key}`} required={required} maxLength={max} value={form[key]} onChange={e => field(key,e.target.value)}/></label>;
  const select = (key: "category"|"unit"|"status"|"complianceStatus", label: string, options: string[]) => <label className="ptc-field">{label}<select data-testid={`select-packaging-${key}`} value={form[key]} onChange={e => field(key,e.target.value)}>{options.map(o => <option key={o} value={o}>{packagingLabels[o] || o}</option>)}</select></label>;
  const submit = () => {
    setError(""); if (blocked) return;
    const split = (s: string) => [...new Set(s.split("\n").map(v => v.trim()).filter(Boolean))];
    const lots = split(finished), customers = split(destinations);
    if (lots.length > 100 || customers.length > 100 || lots.some(s=>s.length>100) || customers.some(s=>s.length>200)) {setError("Use at most 100 links; finished lot IDs may be 100 characters and destinations 200 characters each.");return;}
    if (![form.lotId,form.materialName,form.supplierName].every(s=>s.trim())) {setError("Lot ID, material and supplier names cannot be blank.");return;}
    const pairs = new Set<string>(), units = new Map<string,string>();
    for (const a of allocations) {
      const lot = a.finishedLotId.trim(), customer = a.customer.trim(), pair = JSON.stringify([lot,customer]);
      if (!lot || !customer || !Number.isFinite(a.quantity) || a.quantity <= 0 || a.quantity > 1e9) {setError("Each allocation needs a finished lot, customer and quantity greater than zero (maximum 1 billion).");return;}
      if (["pieces","rolls","sheets","cartons"].includes(a.unit) && !Number.isInteger(a.quantity)) {setError("Count units require whole-number quantities.");return;}
      if (pairs.has(pair)) {setError("Combine duplicate finished-lot/customer allocations into one quantity.");return;}
      if (units.has(lot) && units.get(lot)!==a.unit) {setError("Use one consistent unit per finished lot in this record.");return;}
      pairs.add(pair); units.set(lot,a.unit);
    }
    const data: PackagingBatchInput = {...form,lotId:form.lotId.trim(),materialName:form.materialName.trim(),supplierName:form.supplierName.trim(),documentRef:form.documentRef.trim(),quantity:Number(quantity),finishedBatches:lots,destinations:customers,allocations};
    const options = {onSuccess: (b: PackagingBatch) => {qc.setQueryData<PackagingBatch[]>(getListPackagingBatchesQueryKey(),old => old ? (old.some(r=>r.id===b.id) ? old.map(r=>r.id===b.id?b:r) : [b,...old]) : [b]);void qc.invalidateQueries({queryKey:getListPackagingBatchesQueryKey()});saved(b);},onError:(e:unknown)=>setError(e instanceof Error ? e.message : "The record could not be saved. Your entries are preserved; try again.")};
    if(batch) update.mutate({id:batch.id,data},options);else create.mutate({data},options);
  };
  return <Dialog open onOpenChange={open=>!open&&!busy&&close()}><DialogContent className="ptc ptc-dialog" style={{minHeight:0}} onEscapeKeyDown={e=>busy&&e.preventDefault()} onInteractOutside={e=>busy&&e.preventDefault()}>
    <DialogTitle className="ptc-dialog-title">{batch?"Edit material batch":"Register material batch"}</DialogTitle><DialogDescription className="ptc-dialog-desc">Capture the source, quality declaration and downstream links in one record.</DialogDescription>
    <form onSubmit={e=>{e.preventDefault();submit();}}><fieldset disabled={busy}><div className="ptc-form-grid">
      <div className="ptc-form-section">01 / Material identification</div>
      {text("lotId","Lot ID *",100,true)}{select("category","Category",["ink","adhesive","coating","raw_material"])}{text("materialName","Material name *",200,true)}
      <label className="ptc-field">Quantity *<input data-testid="input-packaging-quantity" type="number" min="0" max="1000000000" step="any" required value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>{select("unit","Unit",["kg","liters","rolls","sheets"])}{select("status","Recorded batch status",["pending","hold","released"])}
      <div className="ptc-form-section">02 / Supplier record</div>{text("supplierName","Supplier name *",200,true)}{text("supplierCountry","Country",100)}{text("supplierContact","Contact / email / phone",200)}
      <div className="ptc-form-section">03 / Human-entered quality declaration</div>{select("complianceStatus","Documentation status",["pending","review_required","documented"])}{text("documentRef","Document reference (required if documented)",300)}
      <p className="ptc-field-wide">To attach evidence files, save this record, then open its details and use “Evidence files”. Uploads do not verify certification or change the recorded status.</p>
      <label className="ptc-field ptc-field-wide">Compliance notes<textarea data-testid="input-packaging-complianceNotes" rows={3} maxLength={3000} value={form.complianceNotes} onChange={e=>field("complianceNotes",e.target.value)}/></label>
      <div className="ptc-form-section">04 / Aggregate downstream links · unallocated</div>
      <label className="ptc-field">Finished batch IDs · one per line<textarea data-testid="input-packaging-finishedBatches" rows={3} value={finished} onChange={e=>setFinished(e.target.value)}/></label><label className="ptc-field">Customers / destinations · one per line<textarea data-testid="input-packaging-destinations" rows={3} value={destinations} onChange={e=>setDestinations(e.target.value)}/></label>
      <AllocationFields value={allocations} change={setAllocations}/>
    </div></fieldset>
    <div className="ptc-note"><ShieldAlert/>These are human-entered declarations, not verified legal compliance. “Documented” records a reference only; it does not certify food-contact suitability.</div>
    {(blocked||error)&&<p role="alert" className="ptc-error">{blocked||error}</p>}
    <div className="ptc-form-actions"><button type="button" className="ptc-btn" disabled={busy} onClick={close}>Cancel</button><button data-testid="button-save-packaging" className="ptc-btn ptc-btn-primary" disabled={busy||!!blocked}>{busy?"Saving record…":batch?"Save changes":"Create batch"}</button></div></form>
  </DialogContent></Dialog>;
}
