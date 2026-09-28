const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../../infrastructure/sqlite/database');
const {seedDemo}=require('../desktop/demo.cjs');
const {Gateway}=require('../desktop/gateway.cjs');
const reports=require('../desktop/account-balance-reports.cjs');
const {ExpensesService}=require('../../infrastructure/sqlite/services/expenses');
test('R027 overdue distinguishes colliding party IDs, aging boundaries and vendor access',async()=>{
 const db=openDatabase({filename:':memory:'});
 try{
  seedDemo(db);const options={type:'overdue',now:new Date('2026-12-01T00:00:00Z')};
  db.prepare("UPDATE Receivables SET due_date='2026-11-01'").run();
  db.prepare("UPDATE Payables SET due_date='2026-10-01'").run();
  const vendor=Number(db.prepare("INSERT INTO Vendors(name,created_at,updated_at) VALUES('Ahmed Khan','2026-09-01','2026-09-01')").run().lastInsertRowid);
  new ExpensesService(db).post({vendorId:vendor,categoryId:db.prepare('SELECT id FROM ExpenseCategories LIMIT 1').get().id,incurredAmountMinor:10000,amountPaidMinor:0,method:'cash',expenseDate:'2026-09-01T09:00:00Z',dueDate:'2026-09-01',description:'Utility charge',idempotencyKey:'r027-vendor'});
  const result=reports.accountBalanceSummary(db,{},options);
  assert.equal(result.parties.length,3);assert.equal(result.totals.partyCount,3);
  assert.equal(result.totals.balanceMinor,result.byType.reduce((sum,x)=>sum+x.balanceMinor,0));
  assert.equal(reports.accountBalanceSummary(db,{aging:'1-30'},options).items.length,1);
  assert.equal(reports.accountBalanceSummary(db,{aging:'61-90'},options).items[0].type,'supplier');
  assert.equal(reports.accountBalanceSummary(db,{aging:'90+'},options).items[0].type,'vendor');
  assert.equal(reports.accountBalanceEntries(db,{page:1,pageSize:1},options).hasMore,true);
  assert.ok(reports.accountBalanceCsv(db,{},options).csv.includes('"vendor balance minor","10000"'));
  assert.equal(Buffer.from((await reports.accountBalanceXlsx(db,{},options)).base64,'base64').subarray(0,2).toString(),'PK');
  assert.equal(Buffer.from(reports.accountBalancePdf(db,{},options).base64,'base64').subarray(0,4).toString(),'%PDF');
  // Authorized account reader without expense access must not receive vendor data.
  db.prepare("DELETE FROM RolePermissions WHERE role_id=(SELECT id FROM Roles WHERE code='admin') AND permission_id=(SELECT id FROM Permissions WHERE code='expense.manage')").run();
  const gateway=new Gateway(db);await gateway.call('login',{username:'demo',password:'TechOrbit-Demo-2026!'});
  const safe=await gateway.call('overdueBalanceSummary',{});assert.ok(safe.items.every(x=>x.type!=='vendor'));
  await assert.rejects(gateway.call('overdueBalanceSummary',{accountType:'vendor'}),/does not allow/);
  await assert.rejects(gateway.call('overdueBalanceExport',{accountType:'vendor',format:'csv'}),/does not allow/);
 }finally{db.close()}
});
