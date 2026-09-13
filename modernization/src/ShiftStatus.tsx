import {useEffect,useState} from 'react';
import {Clock} from 'lucide-react';
export function ShiftStatus(){
 const [shift,setShift]=useState<{opened_at:string}|null>(null),[state,setState]=useState('loading');
 useEffect(()=>{let active=true;const refresh=()=>window.pharmacy.shiftStatus().then(value=>{if(active){setShift(value);setState('ready')}}).catch(()=>{if(active)setState('error')});void refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[]);
 const label=state==='loading'?'Checking shift':state==='error'?'Shift unavailable':shift?'Shift open':'Shift closed';
 return <span className={'shift-status '+(shift&&state==='ready'?'open':'closed')} role="status" aria-label={label} title={shift?'Opened '+new Date(shift.opened_at).toLocaleString():label}><Clock size={15}/>{label}</span>
}
