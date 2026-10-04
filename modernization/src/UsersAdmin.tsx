import {useEffect,useState} from 'react';
import type {ManagedUser,UsersCatalog} from './contracts';

export function UsersAdmin(){
  const [catalog,setCatalog]=useState<UsersCatalog|null>(null);
  const [users,setUsers]=useState<ManagedUser[]>([]);
  const [selected,setSelected]=useState<ManagedUser|null>(null);
  const [draft,setDraft]=useState({username:'',displayName:'',roleCode:'cashier'});
  const [temporaryPassword,setTemporaryPassword]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const refresh=async(id?:number)=>{
    const [nextCatalog,nextUsers]=await Promise.all([window.pharmacy.usersCatalog(),window.pharmacy.usersList()]);
    setCatalog(nextCatalog);setUsers(nextUsers);
    if(id)setSelected(await window.pharmacy.userDetail({id}));
  };
  useEffect(()=>{refresh().catch(e=>setError((e as Error).message))},[]);
  const run=async(action:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('');setTemporaryPassword('');
    try{await action()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  const create=(event:React.FormEvent)=>{event.preventDefault();run(async()=>{
    const result=await window.pharmacy.userCreate(draft);
    setDraft({username:'',displayName:'',roleCode:'cashier'});
    await refresh(result.user.id);setTemporaryPassword(result.temporaryPassword);
    setNotice('Account created. Copy the temporary password now; it will not be shown again.');
  })};
  const update=(event:React.FormEvent)=>{event.preventDefault();if(!selected)return;run(async()=>{
    await window.pharmacy.userUpdate({id:selected.id,displayName:selected.displayName,roleCode:selected.roleCode,active:selected.active});
    await refresh(selected.id);setNotice('Account saved and audited.');
  })};
  const reset=()=>{if(!selected||!window.confirm(`Reset password for ${selected.username}?`))return;run(async()=>{
    const result=await window.pharmacy.userResetPassword({id:selected.id});
    await refresh(selected.id);setTemporaryPassword(result.temporaryPassword);
    setNotice('Password reset. Copy this temporary password now; it will not be shown again.');
  })};
  const override=(permissionCode:string,mode:'allow'|'deny'|'inherit')=>{if(!selected)return;run(async()=>{
    await window.pharmacy.userSetPermission({id:selected.id,permissionCode,mode});
    await refresh(selected.id);setNotice('Permission override saved and audited.');
  })};
  return <section className="panel users-admin">
    <h2>Users and roles</h2>
    <p>Admin-only account management. New and reset passwords must be changed on first sign-in.</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {temporaryPassword&&<div className="temporary-password" role="status"><strong>One-time temporary password</strong><code>{temporaryPassword}</code><small>Share it privately with this user. This value is not saved in the audit log.</small><button type="button" onClick={()=>setTemporaryPassword('')}>Dismiss</button></div>}
    <form onSubmit={create} className="settings-fields">
      <label>Username<input required pattern="[a-z][a-z0-9._-]{2,39}" autoComplete="off" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value})}/></label>
      <label>Display name<input required minLength={2} maxLength={100} value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label>
      <label>Role<select value={draft.roleCode} onChange={e=>setDraft({...draft,roleCode:e.target.value})}>{catalog?.roles.map(role=><option key={role.code} value={role.code}>{role.name}</option>)}</select></label>
      <button className="primary" disabled={busy}>Create account</button>
    </form>
    <div className="users-layout">
      <div className="inventory-table"><table><thead><tr><th>Account</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{users.map(user=><tr key={user.id}><td><strong>{user.displayName}</strong><small>{user.username}</small></td><td>{user.roleCode}</td><td>{user.active?'Active':'Inactive'}{user.mustChangePassword?' · Password change required':''}</td><td><button type="button" onClick={()=>{setTemporaryPassword('');window.pharmacy.userDetail({id:user.id}).then(setSelected).catch(e=>setError((e as Error).message))}}>Manage</button></td></tr>)}</tbody></table></div>
      {selected&&<div className="user-detail"><h3>{selected.username}</h3><form onSubmit={update} className="settings-fields">
        <label>Display name<input required minLength={2} maxLength={100} value={selected.displayName} onChange={e=>setSelected({...selected,displayName:e.target.value})}/></label>
        <label>Role<select value={selected.roleCode} onChange={e=>setSelected({...selected,roleCode:e.target.value})}>{catalog?.roles.map(role=><option key={role.code} value={role.code}>{role.name}</option>)}</select></label>
        <label>Account status<select value={selected.active?'active':'inactive'} onChange={e=>setSelected({...selected,active:e.target.value==='active'})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <div className="user-actions"><button className="primary" disabled={busy}>Save account</button><button type="button" disabled={busy||!selected.active} onClick={reset}>Reset password</button></div>
      </form><h4>Permission overrides</h4><p>Inherit uses the selected role's defaults.</p><div className="permission-list">{catalog?.permissions.map(permission=>{
        const own=selected.overrides||{};
        const mode=Object.hasOwn(own,permission.code)?own[permission.code]?'allow':'deny':'inherit';
        const roleDefault=catalog.rolePermissions.some(row=>row.roleCode===selected.roleCode&&row.permissionCode===permission.code);
        return <label key={permission.code}><span><strong>{permission.code}</strong><small>{permission.description} · Role default: {roleDefault?'Allowed':'Denied'}</small></span><select aria-label={`${permission.code} override`} disabled={busy} value={mode} onChange={e=>override(permission.code,e.target.value as 'allow'|'deny'|'inherit')}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></select></label>;
      })}</div></div>}
    </div>
  </section>;
}
