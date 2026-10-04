const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');

test('P063 admin manages four roles, temporary passwords, status and audited overrides',async()=>{
  const db=openDatabase({filename:':memory:'});
  try{
    seedDemo(db);
    const admin=new Gateway(db,{demo:true});
    await admin.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
    const catalog=await admin.call('usersCatalog');
    assert.deepEqual(catalog.roles.map(r=>r.code),['cashier','pharmacist','manager','admin']);
    const created=[];
    for(const roleCode of catalog.roles.map(r=>r.code)){
      const result=await admin.call('userCreate',{username:`p063-${roleCode}`,displayName:`P063 ${roleCode}`,roleCode});
      assert.match(result.temporaryPassword,/^[A-Za-z0-9_-]+aA1!$/);
      assert.equal(result.user.mustChangePassword,true);
      assert.equal(JSON.stringify(result.user).includes('password'),false);
      created.push(result);
    }
    await assert.rejects(admin.call('userCreate',{username:'p063-cashier',displayName:'Duplicate',roleCode:'cashier'}),/already in use/);
    assert.equal((await admin.call('usersList')).length>=5,true);
    for(const result of created){
      const gateway=new Gateway(db,{demo:true});
      const login=await gateway.call('login',{username:result.user.username,password:result.temporaryPassword});
      assert.equal(login.roleCode,result.user.roleCode);
      assert.equal(login.mustChangePassword,true);
      await assert.rejects(gateway.call('dashboard',{range:'today'}),/temporary password/);
      await gateway.call('changePassword',{currentPassword:result.temporaryPassword,newPassword:`P063-${result.user.roleCode}-Unique-2026!`});
      if(result.user.roleCode==='admin')assert.ok((await gateway.call('usersList')).length>=5);
      else await assert.rejects(gateway.call('usersList'),/Only an admin/);
    }
    const cashier=created[0].user;
    await assert.rejects(admin.call('userSetPermission',{id:cashier.id,permissionCode:'user.manage',mode:'allow'}),/reserved for admins/);
    const grant=await admin.call('userSetPermission',{id:cashier.id,permissionCode:'settings.manage',mode:'allow'});
    assert.equal(grant.effective,true);
    const cashierGateway=new Gateway(db,{demo:true});
    await cashierGateway.call('login',{username:cashier.username,password:'P063-cashier-Unique-2026!'});
    assert.ok(await cashierGateway.call('settingsRead'));
    await admin.call('userSetPermission',{id:cashier.id,permissionCode:'settings.manage',mode:'deny'});
    await assert.rejects(cashierGateway.call('settingsRead'),/role does not allow/);
    await admin.call('userSetPermission',{id:cashier.id,permissionCode:'settings.manage',mode:'inherit'});
    assert.equal((await admin.call('userDetail',{id:cashier.id})).overrides['settings.manage'],undefined);
    await assert.rejects(admin.call('userUpdate',{id:1,displayName:'Demo',roleCode:'cashier',active:true}),/own admin access/);
    const disabled=await admin.call('userUpdate',{id:cashier.id,displayName:'Disabled Cashier',roleCode:'cashier',active:false});
    assert.equal(disabled.active,false);
    await assert.rejects(cashierGateway.call('dashboard',{range:'today'}),/inactive/);
    await assert.rejects(admin.call('userResetPassword',{id:cashier.id}),/Activate/);
    await admin.call('userUpdate',{id:cashier.id,displayName:'Restored Cashier',roleCode:'cashier',active:true});
    const reset=await admin.call('userResetPassword',{id:cashier.id});
    assert.equal(reset.user.mustChangePassword,true);
    await assert.rejects(cashierGateway.call('dashboard',{range:'today'}),/temporary password/);
    const passwordAudit=db.prepare("SELECT previous_json,new_json FROM AuditLog WHERE action='user.password_reset' AND entity_id=?").get(String(cashier.id));
    assert.ok(passwordAudit);
    assert.equal(JSON.stringify(passwordAudit).includes(reset.temporaryPassword),false);
    assert.equal(JSON.stringify(db.prepare("SELECT * FROM AuditLog WHERE entity_type='user'").all()).includes(reset.temporaryPassword),false);
  }finally{db.close()}
});
