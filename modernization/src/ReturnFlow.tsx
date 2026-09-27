import {useRef,useState} from 'react';
import type {CustomerReturnInput,CustomerReturnPreview,InvoiceDetail,PurchaseDetail,SupplierReturnInput,SupplierReturnPreview} from './contracts';
import {Dialog,money} from './shared';

const reference=()=>`TO-${crypto.randomUUID()}`;
const refundMethods=[['cash','Cash'],['card','Card'],['digital','Digital'],['bank_transfer','Bank transfer'],['mobile_wallet','Mobile wallet'],['other','Other']];

export function CustomerReturnFlow({invoice,onClose,onPosted}:{invoice:InvoiceDetail;onClose:()=>void;onPosted:(message:string)=>void}){
 const [quantities,setQuantities]=useState<Record<number,string>>({}),[restock,setRestock]=useState<Record<number,boolean>>({}),[confirmed,setConfirmed]=useState<Record<number,boolean>>({});
 const [reason,setReason]=useState(''),[method,setMethod]=useState(''),[preview,setPreview]=useState<CustomerReturnPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef(reference());
 const payload=():CustomerReturnInput=>({saleId:invoice.saleId,reason,refundMethod:method||null,idempotencyKey:key.current,
  items:invoice.items.filter(item=>Number(quantities[item.id]||0)>0).map(item=>({saleItemId:item.id,baseQuantity:Number(quantities[item.id]),restockable:Boolean(restock[item.id]),conditionConfirmed:Boolean(confirmed[item.id])}))});
 const change=()=>{setPreview(null);setError('')};
 const inspect=async()=>{setBusy(true);setError('');try{setPreview(await window.pharmacy.customerReturnPreview(payload()))}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const post=async()=>{if(!preview)return;setBusy(true);setError('');try{const result=await window.pharmacy.customerReturnPost(payload());onPosted(`Customer return #${result.returnId} posted. Due credit ${money(result.receivableCreditMinor)} · Refund ${money(result.refundMinor)}.`)}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <Dialog title={`Customer return · ${invoice.invoiceNumber}`} onClose={()=>!busy&&onClose()}><div className="purchase-review return-flow">
  <p>Original invoice stays saved. Enter returned quantities in base units; review due credit and actual refund before posting.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  {invoice.items.map(item=><fieldset key={item.id}><legend>{item.productName} · line {item.lineNumber}</legend><p>Sold {item.quantity} {item.saleUnit} = {item.baseQuantity} base units · Already returned {item.returnedBaseQuantity} · Available {item.returnableBaseQuantity}</p>
   <label>Base quantity to return<input aria-label={`Return base quantity line ${item.lineNumber}`} type="number" min="0" max={item.returnableBaseQuantity} step="any" value={quantities[item.id]||''} onChange={e=>{setQuantities(x=>({...x,[item.id]:e.target.value}));change()}}/></label>
   <label className="purchase-check"><input aria-label={`Restock line ${item.lineNumber}`} type="checkbox" checked={Boolean(restock[item.id])} onChange={e=>{setRestock(x=>({...x,[item.id]:e.target.checked}));setConfirmed(x=>({...x,[item.id]:false}));change()}}/> Return to original sellable batch</label>
   {restock[item.id]&&<label className="purchase-check"><input aria-label={`Confirm condition line ${item.lineNumber}`} type="checkbox" checked={Boolean(confirmed[item.id])} onChange={e=>{setConfirmed(x=>({...x,[item.id]:e.target.checked}));change()}}/> I confirm the item is unopened, valid and suitable for resale</label>}
   {!restock[item.id]&&<small>Damaged, opened or expired returns are recorded as non-sellable disposal.</small>}
  </fieldset>)}
  <label>Return reason<textarea aria-label="Customer return reason" maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);change()}}/></label>
  <button onClick={inspect} disabled={busy}>Review customer return</button>
  {preview&&<section aria-label="Customer return preview"><h3>Confirm return</h3>{preview.lines.map(line=><p key={line.saleItemId}>{line.baseQuantity} base units · {line.restockable?'Original batch restock':'Non-sellable disposal'} · {money(line.totalMinor)} including GST {money(line.gstMinor)}</p>)}
   <dl><div><dt>Total reversal</dt><dd>{money(preview.totalMinor)}</dd></div><div><dt>Customer due reduced first</dt><dd>{money(preview.receivableCreditMinor)}</dd></div><div><dt>Actual refund</dt><dd>{money(preview.refundMinor)}</dd></div></dl>
   {preview.refundMinor>0&&<label>Actual refund method<select aria-label="Customer refund method" value={method} onChange={e=>setMethod(e.target.value)}><option value="">Select method</option>{refundMethods.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
   <button className="primary" disabled={busy||(preview.refundMinor>0&&!method)} onClick={post}>{busy?'Posting…':'Post customer return'}</button>
  </section>}
 </div></Dialog>;
}

export function SupplierReturnFlow({purchase,onClose,onPosted}:{purchase:PurchaseDetail;onClose:()=>void;onPosted:(message:string)=>void}){
 const [quantities,setQuantities]=useState<Record<number,string>>({}),[reason,setReason]=useState(''),[method,setMethod]=useState(''),[preview,setPreview]=useState<SupplierReturnPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef(reference());
 const payload=():SupplierReturnInput=>({purchaseId:purchase.id,reason,refundMethod:method||null,idempotencyKey:key.current,
  items:purchase.items.filter(item=>Number(quantities[item.id]||0)>0).map(item=>({purchaseItemId:item.id,quantity:Number(quantities[item.id])}))});
 const change=()=>{setPreview(null);setError('')};
 const inspect=async()=>{setBusy(true);setError('');try{setPreview(await window.pharmacy.supplierReturnPreview(payload()))}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const post=async()=>{if(!preview)return;setBusy(true);setError('');try{const result=await window.pharmacy.supplierReturnPost(payload());onPosted(`Supplier return #${result.returnId} posted. Payable credit ${money(result.payableCreditMinor)} · Refund received ${money(result.refundMinor)}.`)}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <Dialog title={`Supplier return · ${purchase.invoice_number||'#'+purchase.id}`} onClose={()=>!busy&&onClose()}><div className="purchase-review return-flow">
  <p>Return against this original purchase. Only current source batch stock can be sent back; payable is reduced before any actual refund is recorded.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  {purchase.items.map(item=><fieldset key={item.id}><legend>{item.product_name}</legend><p>Batch {item.batch_number||'n.a.'} · Received {item.base_quantity_received} base units · Already returned {item.returned_quantity} · In batch {item.batch_available_quantity}</p>
   <label>Base quantity to return<input aria-label={`Supplier return quantity line ${item.id}`} type="number" min="0" max={Math.min(item.returnable_base_quantity,item.batch_available_quantity)} step="any" value={quantities[item.id]||''} onChange={e=>{setQuantities(x=>({...x,[item.id]:e.target.value}));change()}}/></label>
  </fieldset>)}
  <label>Return reason<textarea aria-label="Supplier return reason" maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);change()}}/></label>
  <button onClick={inspect} disabled={busy}>Review supplier return</button>
  {preview&&<section aria-label="Supplier return preview"><h3>Confirm return</h3>{preview.lines.map(line=><p key={line.purchaseItemId}>{line.quantity} base units · Batch {line.batchNumber||'n.a.'} · {money(line.totalMinor)}</p>)}
   <dl><div><dt>Return value</dt><dd>{money(preview.totalMinor)}</dd></div><div><dt>Supplier payable reduced first</dt><dd>{money(preview.payableCreditMinor)}</dd></div><div><dt>Actual refund received</dt><dd>{money(preview.refundMinor)}</dd></div></dl>
   {preview.refundMinor>0&&<label>Actual refund method<select aria-label="Supplier refund method" value={method} onChange={e=>setMethod(e.target.value)}><option value="">Select method</option>{refundMethods.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
   <button className="primary" disabled={busy||(preview.refundMinor>0&&!method)} onClick={post}>{busy?'Posting…':'Post supplier return'}</button>
  </section>}
 </div></Dialog>;
}
