const {openDatabase,runMigrations}=require('../infrastructure/sqlite/database');
const fs=require('fs'),path=require('path'),os=require('os');
const {CashClosingService}=require('../infrastructure/sqlite/services/cash-closing');
const {recordMoneyMovement}=require('../infrastructure/sqlite/services/money-movement');
const {ClosingConfigurationService}=require('../infrastructure/sqlite/services/closing-configuration');
const {DailyClosingService}=require('../infrastructure/sqlite/services/daily-closing');
const {SixMonthClosingService}=require('../infrastructure/sqlite/services/six-month-closing');

describe('cash shift ownership and closing',()=>{
  let db,service,user1,user2;
  const t=(hour)=>`2026-09-12T${String(hour).padStart(2,'0')}:00:00Z`;
  beforeEach(()=>{
    db=openDatabase({filename:':memory:'});service=new CashClosingService(db);
    const add=(name)=>Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES(?,?,?,1,?,?)")
      .run(name,'fixture',name,t(0),t(0)).lastInsertRowid);
    user1=add('cashier-a');user2=add('cashier-b');
  });
  afterEach(()=>db.close());
  const money=(userId,deviceId,at,direction,amount)=>recordMoneyMovement(db,{direction,method:'cash',amountMinor:amount,referenceType:'test',referenceId:`${userId}-${at}-${direction}`,occurredAt:at,userId,deviceId});

  test('uses cashier, device and shift ID; handover keeps prior ownership',()=>{
    const first=service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:10000,openedAt:t(8)});
    money(user1,'COUNTER-1',t(9),'in',5000);
    money(user1,'COUNTER-1',t(10),'out',1200);
    money(user2,'COUNTER-2',t(10),'in',9000);
    expect(()=>service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:0,openedAt:t(11)})).toThrow(/current device shift/);
    expect(()=>service.close({shiftId:first.id,countedCashMinor:13800,closedAt:t(12),userId:user2})).toThrow(/assigned cashier/);
    const one=service.close({shiftId:first.id,countedCashMinor:13750,closedAt:t(12),userId:user1,varianceReason:'Counted short'});
    expect(one).toMatchObject({expectedCashMinor:13800,varianceMinor:-50,status:'closed'});
    const next=service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:13750,openedAt:t(12),handoverConfirmed:true});
    money(user2,'COUNTER-1',t(13),'in',300);
    const two=service.close({shiftId:next.id,countedCashMinor:14050,closedAt:t(14),userId:user2});
    expect(two.expectedCashMinor).toBe(14050);
    expect(db.prepare('SELECT user_id,device_id,shift_id FROM MoneyMovements WHERE reference_id=?').get(`${user2}-${t(13)}-in`))
      .toEqual({user_id:user2,device_id:'COUNTER-1',shift_id:next.id});
    expect(()=>service.close({shiftId:first.id,countedCashMinor:1})).toThrow(/already closed/);
    expect(()=>money(user1,'COUNTER-1',t(9),'in',1)).toThrow(/Closed shift/);
    expect(()=>service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:0,openedAt:t(11)})).toThrow(/overlap/);
  });

  test('blocks closing when legacy cash has no proven shift attribution',()=>{
    const shift=service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:100,openedAt:t(8)});
    db.prepare("INSERT INTO MoneyMovements(direction,method,amount_minor,reference_type,reference_id,occurred_at,user_id) VALUES('in','cash',25,'legacy','1',?,?)").run(t(9),user1);
    expect(()=>service.close({shiftId:shift.id,countedCashMinor:125,closedAt:t(10),userId:user1})).toThrow(/Unattributed/);
    expect(db.prepare('SELECT status FROM CashShifts WHERE id=?').get(shift.id).status).toBe('open');
  });

  test('six month fixture remains immutable',()=>{
    const report=service.sixMonthReport(t(0));
    expect(report.months.map(x=>x.month)).toEqual(['2026-07','2026-08','2026-09']);
    const manager=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES('manager-period','fixture','Manager',3,?,?)")
      .run(t(0),t(0)).lastInsertRowid);
    expect(()=>service.closeSixMonth({cycleStart:'2026-07-01',userId:manager})).toThrow(/not complete/);
    const closed=service.closeSixMonth({cycleStart:'2026-01-01',userId:manager});
    expect(closed.closingId).toBeGreaterThan(0);
    expect(closed).toMatchObject({periodStart:'2026-01-01',periodEnd:'2026-06-30'});
    expect(()=>service.closeSixMonth({cycleStart:'2026-01-01',userId:manager})).toThrow(/overlaps/);
    const period=new SixMonthClosingService(db);
    const detail=period.detail(closed.closingId);
    expect(detail.original.totals).toEqual(closed.totals);
    expect(period.history()[0]).toMatchObject({id:closed.closingId,legacy:0,revisionCount:0});
    const custom=service.rangeReport('2026-04-10T04:00:00Z','2026-05-15T15:00:00Z');
    expect(custom.months.map(x=>x.month)).toEqual(['2026-04','2026-05']);
    db.prepare("INSERT INTO Expenses(category_id,amount_minor,method,expense_date,description,idempotency_key,status,created_at) VALUES(1,100,'cash','2026-05-01T08:00:00Z','Late correction','late-period-expense','posted',?)").run(t(0));
    expect(()=>period.revise({closingId:closed.closingId,userId:manager})).toThrow(/reason/);
    const revision=period.revise({closingId:closed.closingId,userId:manager,reason:'Late posted expense reconciled'});
    expect(revision).toMatchObject({revisionNumber:1,periodStart:'2026-01-01',periodEnd:'2026-06-30'});
    expect(revision.totals.expensesMinor).toBe(100);
    expect(period.detail(closed.closingId).original.totals.expensesMinor).toBe(0);
    expect(period.detail(closed.closingId).current.totals.expensesMinor).toBe(100);
  });

  test('Pakistan month boundary and return GST/COGS reverse profit before as-of cutoff',()=>{
    const sale=(invoice,at,total,gst,cogs)=>Number(db.prepare(`INSERT INTO Sales
      (invoice_number,idempotency_key,sold_at,payment_method,payment_status,gross_minor,line_discount_minor,
       invoice_discount_minor,taxable_minor,gst_minor,exact_total_minor,rounding_minor,final_total_minor,
       amount_paid_minor,balance_due_minor,cogs_minor,status,created_at)
      VALUES(?,?,?,'cash','paid',?,0,0,?,?,?,?,?,?,0,?,'posted',?)`)
      .run(invoice,invoice,at,total-gst,total-gst,gst,total,0,total,total,cogs,at).lastInsertRowid);
    const august=sale('AUG','2026-08-31T18:59:00Z',220,20,80);
    const september=sale('SEP','2026-08-31T19:01:00Z',1100,100,300);
    sale('AFTER-CUTOFF','2026-09-02T00:01:00Z',999,0,0);
    expect(august).toBeGreaterThan(0);
    const product=Number(db.prepare("INSERT INTO Products(name,created_at,updated_at) VALUES('Test',?,?)").run(t(0),t(0)).lastInsertRowid);
    const item=Number(db.prepare(`INSERT INTO SaleItems
      (sale_id,line_number,product_id,product_name_snapshot,sale_unit,entered_quantity,base_quantity,
       original_unit_price_minor,charged_unit_price_minor,gross_minor,line_discount_minor,
       allocated_invoice_discount_minor,taxable_minor,gst_rate_basis_points,gst_minor,line_total_minor,cogs_minor)
      VALUES(?,1,?,'Test','piece',1,1,1000,1000,1000,0,0,1000,1000,100,1100,300)`).run(september,product).lastInsertRowid);
    const returnedAt='2026-09-01T01:00:00Z';
    const returned=Number(db.prepare(`INSERT INTO SaleReturns(sale_id,idempotency_key,returned_at,total_minor,reason,created_at)
      VALUES(?,?,?,550,'Partial return',?)`).run(september,'RET-SEP',returnedAt,returnedAt).lastInsertRowid);
    db.prepare('INSERT INTO SaleReturnItems(sale_return_id,sale_item_id,product_id,base_quantity,refund_minor,cogs_minor,gst_minor) VALUES(?,?,?,0.5,550,150,50)')
      .run(returned,item,product);
    db.prepare("INSERT INTO Expenses(category_id,amount_minor,method,expense_date,description,idempotency_key,status,created_at) VALUES(1,100,'cash',?,'Cost','exp-report','posted',?)")
      .run('2026-09-01T06:00:00+05:00',returnedAt);
    const report=service.sixMonthReport('2026-09-02T00:00:00Z');
    const aug=report.months.find(x=>x.month==='2026-08');
    const sep=report.months.find(x=>x.month==='2026-09');
    expect(aug).toMatchObject({salesMinor:220,gstMinor:20,cogsMinor:80,grossProfitMinor:120});
    expect(sep).toMatchObject({salesMinor:1100,customerReturnsMinor:550,netSalesMinor:550,gstMinor:50,cogsMinor:150,grossProfitMinor:350,expensesMinor:100,operatingProfitMinor:250});
    expect(report.periodEnd).toBe('2026-09-02');
    expect(service.sixMonthReport('2026-08-31T19:30:00Z').months.at(-1).month).toBe('2026-09');
  });

  test('cashier reason, Rs 50 policy boundary, manager approval and forced close',()=>{
    const config=new ClosingConfigurationService(db);
    const manager=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES('manager-b04','fixture','Manager',3,?,?)")
      .run(t(0),t(0)).lastInsertRowid);
    const first=service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:10000,openedAt:t(8)});
    expect(()=>service.close({shiftId:first.id,countedCashMinor:15000,closedAt:t(9),userId:user1})).toThrow(/reason/);
    expect(service.close({shiftId:first.id,countedCashMinor:15000,closedAt:t(9),userId:user1,varianceReason:'Counted extra'}).varianceMinor).toBe(5000);
    expect(()=>service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:0,openedAt:t(9),handoverConfirmed:true})).toThrow(/previous counted/);
    const second=service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:15000,openedAt:t(9),handoverConfirmed:true});
    expect(second.handover_from_shift_id).toBe(first.id);
    expect(()=>service.close({shiftId:second.id,countedCashMinor:20001,closedAt:t(10),userId:user2,varianceReason:'Counted extra'})).toThrow(/manager approval/);
    const closed=service.close({shiftId:second.id,countedCashMinor:20001,closedAt:t(10),userId:manager,varianceReason:'Counted extra',forcedCloseReason:'Cashier unavailable'});
    expect(closed.varianceMinor).toBe(5001);
    expect(db.prepare('SELECT approved_by,forced_close_reason FROM CashShifts WHERE id=?').get(second.id))
      .toEqual({approved_by:manager,forced_close_reason:'Cashier unavailable'});
    expect(config.savePolicy({varianceToleranceMinor:10000,sixMonthCycleStartMonth:4},manager))
      .toEqual({varianceToleranceMinor:10000,sixMonthCycleStartMonth:4});
    expect(service.sixMonthReport(t(0)).months.map(row=>row.month)).toEqual(['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
  });

  test('pharmacy can configure multiple bank and wallet accounts without fixed names',()=>{
    const config=new ClosingConfigurationService(db);
    const manager=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES('manager-accounts','fixture','Manager',3,?,?)")
      .run(t(0),t(0)).lastInsertRowid);
    expect(()=>config.saveAccount({kind:'bank',name:'Unauthorized'},user1)).toThrow(/Manager permission/);
    const bank1=config.saveAccount({kind:'bank',name:'Operating bank'},manager);
    const bank2=config.saveAccount({kind:'bank',name:'Counter bank'},manager);
    const wallet=config.saveAccount({kind:'wallet',name:'Local wallet'},manager);
    const savings=config.saveAccount({kind:'savings',name:'Savings reserve'},manager);
    expect(config.accounts()).toHaveLength(4);
    const movement=recordMoneyMovement(db,{direction:'in',method:'card',amountMinor:12000,referenceType:'test',referenceId:'card-1',occurredAt:t(9),userId:user1});
    expect(()=>config.allocate({movementId:movement.lastInsertRowid,accountId:wallet.id},manager)).toThrow(/bank account/);
    expect(config.allocate({movementId:movement.lastInsertRowid,accountId:bank2.id},manager).accountId).toBe(bank2.id);
    expect(config.saveAccount({id:bank1.id,kind:'bank',name:'Main bank',active:false},manager).active).toBe(0);
    service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:0,openedAt:t(8)});
    expect(config.recordSavingsTransfer({accountId:savings.id,amountMinor:5000,transferredAt:t(9),reference:'Bank transfer receipt'},manager).amountMinor).toBe(5000);
    expect(()=>config.recordSavingsTransfer({accountId:savings.id,amountMinor:5000,transferredAt:t(9),reference:'bank transfer receipt'},manager)).toThrow(/already recorded/);
    expect(service.sixMonthReport(t(10)).totals.savingsTransferredMinor).toBe(5000);
  });

  test('business day stays open past midnight, requires allocation, and preserves revisions',()=>{
    const config=new ClosingConfigurationService(db),daily=new DailyClosingService(db);
    const manager=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES('manager-daily','fixture','Manager',3,?,?)")
      .run(t(0),t(0)).lastInsertRowid);
    const account=config.saveAccount({kind:'bank',name:'Pharmacy bank'},manager);
    const shift=service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:10000,openedAt:t(8)});
    money(user1,'COUNTER-1',t(9),'in',5000);
    const card=recordMoneyMovement(db,{direction:'in',method:'card',amountMinor:12000,referenceType:'test',referenceId:'card-day',occurredAt:t(9),userId:user1,deviceId:'COUNTER-1'});
    service.close({shiftId:shift.id,countedCashMinor:15000,closedAt:t(10),userId:user1});
    const nextMorning='2026-09-13T01:00:00Z';
    const preview=daily.preview({asOf:nextMorning});
    expect(preview.businessDayId).toBe(shift.business_day_id);
    expect(preview).toMatchObject({cashExpectedMinor:15000,cashCountedMinor:15000,unresolvedMovementCount:1});
    expect(()=>daily.close({userId:manager,asOf:nextMorning})).toThrow(/Allocate or reconcile/);
    config.allocate({movementId:card.lastInsertRowid,accountId:account.id},manager);
    const closed=daily.close({userId:manager,asOf:nextMorning,accountActuals:{[account.id]:12000}});
    expect(closed).toMatchObject({status:'closed',cashExpectedMinor:15000,cashCountedMinor:15000});
    expect(closed.accounts[0]).toMatchObject({name:'Pharmacy bank',expectedNetMinor:12000,actualNetMinor:12000});
    expect(()=>config.allocate({movementId:card.lastInsertRowid,accountId:account.id},manager)).toThrow(/Closed business day/);
    const revised=daily.revise({businessDayId:closed.businessDayId,userId:manager,cashCountedMinor:14900,reason:'Signed recount'});
    expect(revised).toMatchObject({revisionNumber:1,cashVarianceMinor:-100});
    const detail=daily.detail(closed.businessDayId);
    expect(detail.original.cashVarianceMinor).toBe(0);
    expect(detail.current.cashVarianceMinor).toBe(-100);
    expect(detail.revisions).toHaveLength(1);
    const next=service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:8000,openedAt:'2026-09-13T02:00:00Z'});
    expect(next.business_day_id).not.toBe(shift.business_day_id);
    expect(daily.preview({asOf:'2026-09-13T03:00:00Z'}).businessDayId).toBe(next.business_day_id);
  });

  test('upgrade attaches only open legacy shifts and keeps closed history unchanged',()=>{
    const migrationDir=path.join(__dirname,'../infrastructure/sqlite/migrations');
    const oldDir=fs.mkdtempSync(path.join(os.tmpdir(),'pharmacy-old-migrations-'));
    try{
      for(const file of fs.readdirSync(migrationDir).filter(name=>/^\d+_.+\.sql$/.test(name)&&Number(name.slice(0,3))<=21))
        fs.copyFileSync(path.join(migrationDir,file),path.join(oldDir,file));
      const old=openDatabase({filename:':memory:',migrationsDir:oldDir});
      try{
        const now=new Date().toISOString();
        const legacyClosed=Number(old.prepare("INSERT INTO CashShifts(user_id,device_id,opened_at,opening_cash_minor,status,closed_at,counted_cash_minor,created_at) VALUES(?, 'COUNTER-1', ?, 100, 'closed', ?, 100, ?)")
          .run(null,'2026-09-01T08:00:00Z','2026-09-01T10:00:00Z',now).lastInsertRowid);
        const legacyOpen=Number(old.prepare("INSERT INTO CashShifts(user_id,device_id,opened_at,opening_cash_minor,status,created_at) VALUES(?, 'COUNTER-1', ?, 100, 'open', ?)")
          .run(null,'2026-09-01T11:00:00Z',now).lastInsertRowid);
        runMigrations(old,migrationDir);
        expect(old.prepare('SELECT business_day_id FROM CashShifts WHERE id=?').get(legacyClosed).business_day_id).toBeNull();
        const attached=old.prepare('SELECT business_day_id FROM CashShifts WHERE id=?').get(legacyOpen).business_day_id;
        expect(attached).toBeGreaterThan(0);
        expect(old.prepare('SELECT opened_at FROM BusinessDays WHERE id=?').get(attached).opened_at).toBe('2026-09-01T11:00:00Z');
      }finally{old.close()}
    }finally{fs.rmSync(oldDir,{recursive:true,force:true})}
  });
});
