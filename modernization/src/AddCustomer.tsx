import {useState} from 'react';
import {Dialog} from './shared';
export function AddCustomer({onSaved,onClose}:{onSaved:(customer:{id:number;name:string;phone:string})=>void;onClose:()=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <Dialog title="Add customer" onClose={()=>{if(!busy)onClose()}}><form className="customer-form" onSubmit={async event=>{event.preventDefault();if(busy)return;const fields=new FormData(event.currentTarget);setBusy(true);setError('');try{onSaved(await window.pharmacy.createCustomer({name:String(fields.get('name')),phone:String(fields.get('phone'))}));onClose()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><label>Customer name<input name="name" required minLength={2} maxLength={120} autoComplete="name"/></label><label>Phone number<input name="phone" required type="tel" maxLength={25} autoComplete="tel"/></label><small>Name and phone identify the customer for credit and payment follow-up.</small>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Saving…':'Save customer'}</button></form></Dialog>
}
