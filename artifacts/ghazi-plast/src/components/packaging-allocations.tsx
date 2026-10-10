import React from "react";
import type { PackagingAllocation } from "@workspace/api-client-react";

export function AllocationTrace({ allocations }: { allocations: PackagingAllocation[] }) {
  return <section aria-label="Exact finished-lot allocations">
    <h3>Exact finished-lot → customer allocations</h3>
    {allocations.length ? <div className="ptc-table-wrap"><table><thead><tr><th>Finished lot</th><th>Customer / destination</th><th>Allocated quantity</th></tr></thead><tbody>
      {allocations.map((a, i) => <tr key={i}><td>{a.finishedLotId}</td><td>{a.customer}</td><td>{String(a.quantity)} {a.unit}</td></tr>)}
    </tbody></table></div> : <p>No exact allocations recorded. Customer quantities are unknown until staff enter them.</p>}
    <small>Staff-recorded finished-goods quantities, not shipment confirmations. Distribution completeness and remaining stock are unknown. Do not add quantities across material records that may reference the same goods.</small>
  </section>;
}

export function AllocationFields({ value, change }: { value: PackagingAllocation[]; change: (value: PackagingAllocation[]) => void }) {
  const update = (index: number, patch: Partial<PackagingAllocation>) => change(value.map((a, i) => i === index ? { ...a, ...patch } : a));
  return <div className="ptc-field-wide">
    <div className="ptc-form-section">05 / Exact finished-lot allocations</div>
    <p>Enter one total per finished lot and customer/destination. Use a consistent unit per lot. Existing aggregate links below do not establish quantities or customer mappings.</p>
    {value.map((a, i) => <fieldset key={i} style={{border:"1px solid var(--pt-line)",padding:12,marginBottom:12}}>
      <legend>Allocation {i + 1}</legend>
      <div className="ptc-form-grid">
        <label className="ptc-field">Finished lot ID *<input aria-label={`Allocation ${i+1} finished lot`} required maxLength={100} value={a.finishedLotId} onChange={e=>update(i,{finishedLotId:e.target.value})}/></label>
        <label className="ptc-field">Customer / destination *<input aria-label={`Allocation ${i+1} customer`} required maxLength={200} value={a.customer} onChange={e=>update(i,{customer:e.target.value})}/></label>
        <label className="ptc-field">Allocated quantity *<input aria-label={`Allocation ${i+1} quantity`} type="number" required min={["kg","liters"].includes(a.unit)?"0.000000001":"1"} max="1000000000" step={["kg","liters"].includes(a.unit)?"any":"1"} value={a.quantity || ""} onChange={e=>update(i,{quantity:Number(e.target.value)})}/></label>
        <label className="ptc-field">Finished-goods unit<select aria-label={`Allocation ${i+1} unit`} value={a.unit} onChange={e=>update(i,{unit:e.target.value as PackagingAllocation["unit"]})}>{["pieces","kg","liters","rolls","sheets","cartons"].map(u=><option key={u}>{u}</option>)}</select></label>
      </div>
      <button type="button" className="ptc-btn" onClick={()=>{if(window.confirm("Remove this allocation? The removal takes effect only when you save the record.")) change(value.filter((_,j)=>j!==i));}}>Remove allocation {i+1}</button>
    </fieldset>)}
    <button type="button" className="ptc-btn" disabled={value.length>=100} onClick={()=>change([...value,{finishedLotId:"",customer:"",quantity:0,unit:"pieces"}])}>Add allocation</button>
    {!value.length&&<p>No exact allocations entered.</p>}
  </div>;
}
