const {openDatabase,runMigrations}=require('../infrastructure/sqlite/database');
const fs=require('fs'),path=require('path'),os=require('os');
const {CashClosingService}=require('../infrastructure/sqlite/services/cash-closing');
const {recordMoneyMovement}=require('../infrastructure/sqlite/services/money-movement');
const {ClosingConfigurationService}=require('../infrastructure/sqlite/services/closing-configuration');
const {DailyClosingService}=require('../infrastructure/sqlite/services/daily-closing');
const {SixMonthClosingService}=require('../infrastructure/sqlite/services/six-month-closing');
const {SuppliersRepository}=require('../infrastructure/sqlite/repositories/suppliers');
const {ProductsRepository}=require('../infrastructure/sqlite/repositories/products');
const {ProductUnitsRepository}=require('../infrastructure/sqlite/repositories/product-units');
const {PurchaseReceivingService}=require('../infrastructure/sqlite/services/purchase-receiving');
const {PurchasePaymentsService}=require('../infrastructure/sqlite/services/purchase-payments');
const {PurchaseReturnsService}=require('../infrastructure/sqlite/services/purchase-returns');
const {SalesPostingService}=require('../infrastructure/sqlite/services/sales-posting');
const {CustomerReturnsService}=require('../infrastructure/sqlite/services/customer-returns');
const {CustomerAccountsService}=require('../infrastructure/sqlite/services/customer-accounts');
const {ExpensesService}=require('../infrastructure/sqlite/services/expenses');
const {profitLoss,reportEntries,reportCsv,reportXlsx,reportPdf}=require('../modernization/desktop/reports.cjs');
const {dashboard}=require('../modernization/desktop/dashboard.cjs');
const dailySales=require('../modernization/desktop/daily-sales.cjs');
const medicineSales=require('../modernization/desktop/sales-breakdown.cjs');

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
    const dailyReport=dailySales.dailySalesSummary(db,{range:'custom',from:'2026-08-31',to:'2026-09-01'},
      {costVisible:true,now:new Date('2026-09-02T00:00:00Z')});
    expect(dailyReport.days).toMatchObject([{day:'2026-09-01',salesMinor:1100,returnsMinor:550,netExGstMinor:500},
      {day:'2026-08-31',salesMinor:220,returnsMinor:0,netExGstMinor:200}]);
    const gstReport=medicineSales.medicineSummary(db,{range:'custom',from:'2026-09-01',to:'2026-09-01',groupBy:'gst'},
      {costVisible:false,now:new Date('2026-09-02T00:00:00Z')});
    expect(gstReport.totals).toMatchObject({salesGstMinor:100,returnGstMinor:50,gstMinor:50,taxableBaseMinor:500});
    expect(gstReport.groups[0]).toMatchObject({groupLabel:'10.00% GST',salesGstMinor:100,returnGstMinor:50,gstMinor:50,cogsMinor:null});
    expect(profitLoss(db,{range:'custom',from:'2026-09-01',to:'2026-09-01'},new Date('2026-09-02T00:00:00Z')))
      .toMatchObject({salesGrossMinor:1100,listedGrossMinor:1000,salesGstMinor:100,returnsGrossMinor:550,returnsGstMinor:50,
        netRevenueMinor:500,soldCogsMinor:300,returnedCogsMinor:150,cogsMinor:150,
        grossProfitMinor:350,expensesMinor:100,operatingProfitMinor:250});
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

  test('business day stays open past midnight, requires allocation, and preserves revisions',async()=>{
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
    const reports=require('../modernization/desktop/daily-closing-report.cjs'),input={range:'custom',from:'2026-09-13',to:'2026-09-13'};
    expect(reports.dailyClosingSummary(db,input).totals).toMatchObject({dayCount:1,cashVarianceMinor:-100});
    expect(reports.dailyClosingSummary(db,{...input,basis:'original'}).totals.cashVarianceMinor).toBe(0);
    expect(reports.dailyClosingSummary(db,{...input,dateBasis:'opened'}).totals.dayCount).toBe(0);
    expect(reports.dailyClosingSummary(db,{...input,from:'2026-09-12',to:'2026-09-12',dateBasis:'opened',device:'COUNTER-1'}).totals.dayCount).toBe(1);
    expect(reports.dailyClosingEntries(db,{...input,page:1}).items[0].snapshot.accounts[0].actualNetMinor).toBe(12000);
    expect(reports.dailyClosingCsv(db,input).csv).toContain('"Cash variance minor","-100"');
    expect(Buffer.from((await reports.dailyClosingXlsx(db,input)).base64,'base64').subarray(0,2).toString()).toBe('PK');
    expect(Buffer.from(reports.dailyClosingPdf(db,input).base64,'base64').subarray(0,4).toString()).toBe('%PDF');

    const next=service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:8000,openedAt:'2026-09-13T02:00:00Z'});
    expect(next.business_day_id).not.toBe(shift.business_day_id);
    expect(daily.preview({asOf:'2026-09-13T03:00:00Z'}).businessDayId).toBe(next.business_day_id);
  });

  test('independent mixed-movement fixture reconciles cash, bank, wallet and actual savings',()=>{
    const config=new ClosingConfigurationService(db),daily=new DailyClosingService(db);
    const manager=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES('manager-golden','fixture','Manager',3,?,?)")
      .run(t(0),t(0)).lastInsertRowid);
    const bank=config.saveAccount({kind:'bank',name:'Statement bank'},manager);
    const wallet=config.saveAccount({kind:'wallet',name:'Statement wallet'},manager);
    const reserve=config.saveAccount({kind:'savings',name:'Reserve'},manager);
    const shift=service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:10000,openedAt:t(8)});
    const events=[
      ['cash','in',12000,'paid cash sale',null],['cash','in',5000,'due collection',null],
      ['cash','out',3000,'customer refund',null],['cash','out',2000,'operating expense',null],
      ['card','in',20000,'paid card sale',bank.id],['bank_transfer','out',5000,'supplier payment',bank.id],
      ['digital','in',15000,'paid wallet sale',wallet.id],['mobile_wallet','out',4000,'vendor settlement',wallet.id],
      ['digital','out',1000,'customer wallet refund',wallet.id],
    ];
    events.forEach(([method,direction,amount,reference,accountId],index)=>{
      const inserted=recordMoneyMovement(db,{method,direction,amountMinor:amount,referenceType:'golden_fixture',referenceId:String(index),occurredAt:t(9+index),userId:user1,deviceId:'COUNTER-1',note:reference});
      if(accountId)config.allocate({movementId:inserted.lastInsertRowid,accountId},manager);
    });
    config.recordSavingsTransfer({accountId:reserve.id,amountMinor:6000,transferredAt:t(18),reference:'Signed savings transfer'},manager);
    expect(service.close({shiftId:shift.id,countedCashMinor:22000,closedAt:t(18),userId:user1}).expectedCashMinor).toBe(22000);
    const snapshot=daily.close({userId:manager,asOf:t(19),accountActuals:{[bank.id]:15000,[wallet.id]:10000}});
    expect(snapshot).toMatchObject({cashOpeningMinor:10000,cashExpectedMinor:22000,cashCountedMinor:22000,cashVarianceMinor:0,savingsTransferredMinor:6000,unresolvedMovementCount:0});
    expect(snapshot.accounts.find(row=>row.id===bank.id)).toMatchObject({inMinor:20000,outMinor:5000,expectedNetMinor:15000,actualNetMinor:15000,varianceMinor:0});
    expect(snapshot.accounts.find(row=>row.id===wallet.id)).toMatchObject({inMinor:15000,outMinor:5000,expectedNetMinor:10000,actualNetMinor:10000,varianceMinor:0});
    expect(daily.detail(snapshot.businessDayId).original.accounts).toEqual(snapshot.accounts);
  });

  test('linked pharmacy books reconcile day close, six-month profit, dues and stock independently',async()=>{
    const config=new ClosingConfigurationService(db),daily=new DailyClosingService(db);
    const manager=Number(db.prepare("INSERT INTO Users(username,password_hash,display_name,role_id,created_at,updated_at) VALUES('manager-linked','fixture','Manager',3,?,?)").run(t(0),t(0)).lastInsertRowid);
    const bank=config.saveAccount({kind:'bank',name:'Statement bank'},manager),wallet=config.saveAccount({kind:'wallet',name:'Statement wallet'},manager),reserve=config.saveAccount({kind:'savings',name:'Reserve'},manager);
    const supplier=new SuppliersRepository(db).create({name:'Linked supplier'});
    const product=new ProductsRepository(db).create({name:'Linked medicine',productType:'general',baseUnit:'piece'});
    new ProductUnitsRepository(db).configure(product.id,[{unitName:'piece',baseQuantity:1,sellingPriceMinor:2000,isDefaultSaleUnit:true}]);
    const customer=Number(db.prepare("INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES('Ali','03001234567','03001234567',?,?)").run(t(0),t(0)).lastInsertRowid);
    const vendor=Number(db.prepare("INSERT INTO Vendors(name,active,created_at,updated_at) VALUES('Linked utility',1,?,?)").run(t(0),t(0)).lastInsertRowid);
    const shift=service.open({userId:user1,deviceId:'COUNTER-1',openingCashMinor:10000,openedAt:t(8)});
    const purchase=new PurchaseReceivingService(db).receive({supplierId:supplier.id,invoiceNumber:'GOLD-BUY',idempotencyKey:'gold-buy',purchasedAt:t(9),createdBy:user1,deviceId:'COUNTER-1',paymentMethod:'card',amountPaidMinor:2000,dueDate:'2026-10-01',items:[{productId:product.id,purchasedQuantity:10,unitCostMinor:1000,salePriceMinor:2000,batchNumber:'GOLD-BATCH',expiryDate:'2028-12-31'}]});
    const sales=new SalesPostingService(db);
    const sell=(name,hour,method,quantity,extra={})=>sales.post({invoiceNumber:name,idempotencyKey:name,soldAt:t(hour),createdBy:user1,deviceId:'COUNTER-1',paymentMethod:method,items:[{productId:product.id,saleUnit:'piece',quantity}],...extra});
    const cash=sell('GOLD-CASH',10,'cash',2),card=sell('GOLD-CARD',11,'card',1),digital=sell('GOLD-DIGITAL',12,'digital',1);
    const credit=sell('GOLD-CREDIT',13,'credit',2,{customerId:customer,amountPaidMinor:0,dueDate:'2026-10-01'});
    expect([cash,card,digital,credit].map(row=>row.finalTotalMinor)).toEqual([4000,2000,2000,4000]);
    const receivable=db.prepare("SELECT id FROM Receivables WHERE source_type='sale' AND source_id=?").get(String(credit.saleId));
    new CustomerAccountsService(db).collect({receivableId:receivable.id,amountMinor:1500,method:'cash',collectedAt:t(14),createdBy:user1,deviceId:'COUNTER-1',idempotencyKey:'gold-collect'});
    const saleItem=db.prepare('SELECT id FROM SaleItems WHERE sale_id=?').get(cash.saleId);
    new CustomerReturnsService(db).post({saleId:cash.saleId,reason:'Unopened',returnedAt:t(15),refundMethod:'cash',createdBy:user1,deviceId:'COUNTER-1',idempotencyKey:'TO-11111111-1111-1111-1111-111111111111',items:[{saleItemId:saleItem.id,baseQuantity:1,restockable:true,conditionConfirmed:true}]});
    const payable=db.prepare("SELECT id FROM Payables WHERE source_type='purchase' AND source_id=?").get(String(purchase.purchaseId));
    new PurchasePaymentsService(db).post({payableId:payable.id,amountMinor:3000,method:'bank_transfer',paidAt:t(16),createdBy:user1,deviceId:'COUNTER-1',idempotencyKey:'gold-supplier-pay'});
    const purchaseItem=db.prepare('SELECT id FROM PurchaseItems WHERE purchase_id=?').get(purchase.purchaseId);
    new PurchaseReturnsService(db).post({purchaseId:purchase.purchaseId,reason:'Excess',returnedAt:t(17),createdBy:user1,deviceId:'COUNTER-1',idempotencyKey:'TO-22222222-2222-2222-2222-222222222222',items:[{purchaseItemId:purchaseItem.id,quantity:1}]});
    const expenses=new ExpensesService(db);
    const expense=expenses.post({categoryId:1,vendorId:vendor,incurredAmountMinor:2500,amountPaidMinor:1000,method:'cash',expenseDate:t(18),dueDate:'2026-10-01',description:'Utility bill',idempotencyKey:'gold-expense',createdBy:user1,deviceId:'COUNTER-1'});
    const vendorPayable=db.prepare('SELECT id FROM ExpensePayables WHERE expense_id=?').get(expense.expenseId);
    expenses.settle({payableId:vendorPayable.id,amountMinor:500,method:'mobile_wallet',paidAt:t(19),idempotencyKey:'gold-vendor-pay',createdBy:user1,deviceId:'COUNTER-1'});
    const movements=db.prepare("SELECT id,method FROM MoneyMovements WHERE occurred_at>=? AND occurred_at<? AND method<>'cash'").all(t(8),t(20));
    for(const row of movements)config.allocate({movementId:row.id,accountId:['card','bank_transfer'].includes(row.method)?bank.id:wallet.id},manager);
    config.recordSavingsTransfer({accountId:reserve.id,amountMinor:700,transferredAt:t(20),reference:'Signed reserve transfer'},manager);
    expect(service.close({shiftId:shift.id,countedCashMinor:12500,closedAt:t(21),userId:user1}).expectedCashMinor).toBe(12500);
    const next=service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:12500,openedAt:t(21),handoverConfirmed:true});
    service.close({shiftId:next.id,countedCashMinor:12500,closedAt:t(22),userId:user2});
    const closed=daily.close({userId:manager,asOf:t(23),accountActuals:{[bank.id]:-3000,[wallet.id]:1500}});
    expect(closed).toMatchObject({shiftCount:2,cashOpeningMinor:10000,cashExpectedMinor:12500,cashCountedMinor:12500,cashVarianceMinor:0,unresolvedMovementCount:0,savingsTransferredMinor:700});
    expect(closed.accounts.find(row=>row.id===bank.id)).toMatchObject({expectedNetMinor:-3000,actualNetMinor:-3000});
    expect(closed.accounts.find(row=>row.id===wallet.id)).toMatchObject({expectedNetMinor:1500,actualNetMinor:1500});
    const report=service.rangeReport('2026-09-01T00:00:00Z','2026-09-13T00:00:00Z');
    expect(report.totals).toMatchObject({salesMinor:12000,customerReturnsMinor:2000,netSalesMinor:10000,gstMinor:0,cogsMinor:5000,grossProfitMinor:5000,expensesMinor:2500,operatingProfitMinor:2500,purchasesMinor:10000,purchaseReturnsMinor:1000,savingsTransferredMinor:700});
    const reportInput={range:'custom',from:'2026-09-12',to:'2026-09-12'};
    const pnl=profitLoss(db,reportInput,new Date('2026-09-13T00:00:00Z'));
    expect(pnl).toMatchObject({salesGrossMinor:12000,returnsGrossMinor:2000,netRevenueMinor:10000,soldCogsMinor:6000,returnedCogsMinor:1000,cogsMinor:5000,expensesMinor:2500,operatingProfitMinor:2500});
    // R030 final catalogue acceptance: independently sum persisted P&L detail.
    const pnlRows=reportEntries(db,{...reportInput,page:1,pageSize:100}).items;
    expect(pnlRows.reduce((sum,row)=>sum+row.contribution_minor,0)).toBe(2500);
    expect(pnlRows.filter(row=>row.kind==='expense')).toHaveLength(1);
    expect(pnlRows.some(row=>['purchase','receivable_payment','purchase_payment','expense_payment','savings'].includes(row.kind))).toBe(false);
    expect(profitLoss(db,{range:'custom',from:'2026-09-11',to:'2026-09-11'}).operatingProfitMinor).toBe(0);
    expect(()=>reportEntries(db,{...reportInput,page:0})).toThrow(/valid report page/);

    expect(reportEntries(db,{...reportInput,page:1,pageSize:2}).items).toHaveLength(2);
    expect(reportEntries(db,{...reportInput,page:3,pageSize:2}).items).toHaveLength(2);
    const exported=reportCsv(db,reportInput,new Date('2026-09-13T00:00:00Z'));
    expect(exported.csv).toContain('"Operating profit minor","2500"');
    expect(exported.csv).not.toContain('GOLD-BUY');
    const salesFilter={range:'custom',from:'2026-09-12',to:'2026-09-12'};
    const dailyReport=dailySales.dailySalesSummary(db,salesFilter,{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(dailyReport.totals).toMatchObject({salesMinor:12000,returnsMinor:2000,netSalesMinor:10000,
      netExGstMinor:10000,cogsMinor:5000,grossProfitMinor:5000,paidAtSaleMinor:8000,creditCreatedMinor:4000,
      refundMinor:2000,saleCount:4,returnCount:1});
    expect(dailyReport.totals.netExGstMinor).toBe(pnl.netRevenueMinor);
    expect(dailyReport.totals.cogsMinor).toBe(pnl.cogsMinor);
    expect(dailySales.dailySalesSummary(db,{...salesFilter,customer:'Ali'},{costVisible:false}).totals)
      .toMatchObject({salesMinor:4000,returnsMinor:0,cogsMinor:null,grossProfitMinor:null});
    expect(dailySales.dailySalesSummary(db,{...salesFilter,method:'cash'},{costVisible:true}).totals)
      .toMatchObject({salesMinor:4000,returnsMinor:2000,netSalesMinor:2000});
    expect(dailySales.dailySalesSummary(db,{...salesFilter,supplier:'Linked supplier'},{costVisible:true}).totals.salesMinor).toBe(12000);
    expect(dailySales.dailySalesSummary(db,{...salesFilter,product:'Linked medicine'},{costVisible:true}).totals.saleCount).toBe(4);
    expect(dailySales.dailySalesSummary(db,{...salesFilter,cashier:'cashier-a'},{costVisible:true}).totals.saleCount).toBe(4);
    db.prepare("UPDATE Products SET category='General care',manufacturer='Linked brand' WHERE id=?").run(product.id);
    expect(dailySales.dailySalesSummary(db,{...salesFilter,category:'General care',brand:'Linked brand'},{costVisible:true}).totals.saleCount).toBe(4);
    expect(dailySales.dailySalesSummary(db,{...salesFilter,product:'%'},{costVisible:true}).totals.saleCount).toBe(0);
    const medicines=medicineSales.medicineSummary(db,salesFilter,{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(medicines.groups).toHaveLength(1);
    expect(medicines.groups[0]).toMatchObject({medicine:'Linked medicine',category:'General care',brand:'Linked brand',
      salesMinor:12000,returnsMinor:2000,netSalesMinor:10000,cogsMinor:5000,grossProfitMinor:5000});
    expect(medicines.totals.netSalesMinor).toBe(dailyReport.totals.netSalesMinor);
    const categories=medicineSales.medicineSummary(db,{...salesFilter,groupBy:'category'},{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(categories.groups).toHaveLength(1);
    expect(categories.groups[0]).toMatchObject({groupLabel:'General care',netSalesMinor:10000,cogsMinor:5000});
    const brands=medicineSales.medicineSummary(db,{...salesFilter,groupBy:'brand'},{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(brands.groups[0]).toMatchObject({groupLabel:'Linked brand',netSalesMinor:10000,cogsMinor:5000});
    const cashiers=medicineSales.medicineSummary(db,{...salesFilter,groupBy:'cashier'},{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(cashiers.groups).toHaveLength(1);
    expect(cashiers.groups[0]).toMatchObject({netSalesMinor:10000,returnsMinor:2000,cogsMinor:5000});
    const methods=medicineSales.medicineSummary(db,{...salesFilter,groupBy:'method'},{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(Object.fromEntries(methods.groups.map(row=>[row.groupLabel,row.netSalesMinor])))
      .toEqual({cash:2000,card:2000,digital:2000,credit:4000});
    expect(methods.totals.netSalesMinor).toBe(dailyReport.totals.netSalesMinor);
    const taxClasses=medicineSales.medicineSummary(db,{...salesFilter,groupBy:'tax'},{costVisible:true,now:new Date('2026-09-13T00:00:00Z')});
    expect(taxClasses.groups).toHaveLength(1);
    expect(taxClasses.groups[0]).toMatchObject({groupLabel:'Exempt',netSalesMinor:10000,gstMinor:0,taxableBaseMinor:0});
    expect(medicineSales.medicineSummary(db,{...salesFilter,groupBy:'method',method:'credit'},{costVisible:false}).totals)
      .toMatchObject({netSalesMinor:4000,cogsMinor:null,grossProfitMinor:null});
    expect(medicineSales.medicineSummary(db,{...salesFilter,product:'Linked medicine',supplier:'Linked supplier'},{costVisible:false}).totals)
      .toMatchObject({netSalesMinor:10000,cogsMinor:null,grossProfitMinor:null});
    expect(medicineSales.medicineEntries(db,{...salesFilter,page:1,pageSize:2},{costVisible:false})).toMatchObject({hasMore:true,page:1});
    expect(medicineSales.medicineCsv(db,salesFilter,{costVisible:false}).csv).not.toContain('COGS minor');
    const medicineExcel=await medicineSales.medicineXlsx(db,salesFilter,{costVisible:true});
    const medicineBook=new (require('exceljs').Workbook)();await medicineBook.xlsx.load(Buffer.from(medicineExcel.base64,'base64'));
    expect(medicineBook.getWorksheet('Sales by Medicine').getCell('I7').value).toBe(100);
    expect(Buffer.from(medicineSales.medicinePdf(db,salesFilter,{costVisible:false}).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
    expect(dailySales.dailySalesEntries(db,{...salesFilter,page:1,pageSize:2},{costVisible:true})).toMatchObject({hasMore:true,page:1});
    const dailyCsv=dailySales.dailySalesCsv(db,salesFilter,{costVisible:false});
    expect(dailyCsv.csv).toContain('"Net sales minor","10000"');
    expect(dailyCsv.csv).not.toContain('COGS minor');
    const dailyExcel=await dailySales.dailySalesXlsx(db,salesFilter,{costVisible:true});
    const dailyBook=new (require('exceljs').Workbook)();await dailyBook.xlsx.load(Buffer.from(dailyExcel.base64,'base64'));
    expect(dailyBook.getWorksheet('Daily Sales').getCell('B3').value).toBe(100);
    expect(Buffer.from(dailySales.dailySalesPdf(db,salesFilter,{costVisible:false}).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
    const excel=await reportXlsx(db,reportInput,new Date('2026-09-13T00:00:00Z'));
    const excelBook=new (require('exceljs').Workbook)();
    await excelBook.xlsx.load(Buffer.from(excel.base64,'base64'));
    expect(excelBook.getWorksheet('Profit and Loss').getCell('B10').value).toBe(25);
    const pdf=reportPdf(db,reportInput,new Date('2026-09-13T00:00:00Z'));
    expect(Buffer.from(pdf.base64,'base64').subarray(0,4).toString()).toBe('%PDF');
    expect(db.prepare('SELECT balance_minor FROM Receivables WHERE id=?').get(receivable.id).balance_minor).toBe(2500);
    expect(db.prepare('SELECT balance_minor FROM Payables WHERE id=?').get(payable.id).balance_minor).toBe(4000);
    expect(db.prepare('SELECT balance_minor FROM ExpensePayables WHERE id=?').get(vendorPayable.id).balance_minor).toBe(1000);
    expect(db.prepare("SELECT quantity_on_hand FROM ProductBatches WHERE batch_number='GOLD-BATCH'").get().quantity_on_hand).toBe(4);
    db.prepare('UPDATE Products SET minimum_stock=5 WHERE id=?').run(product.id);
    db.prepare("UPDATE ProductBatches SET expiry_date='2026-09-01' WHERE batch_number='GOLD-BATCH'").run();
    const kpi=dashboard(db,{range:'custom',from:'2026-09-12',to:'2026-09-12'},
      {userId:user1,financial:true,costVisible:true,now:new Date('2026-09-12T18:00:00Z')});
    expect(kpi).toMatchObject({vendorDues:1000,expiredValue:4000,reorderCount:1});
    expect(kpi.today).toMatchObject({netExGst:10000,operatingProfit:2500,refunds:2000});
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
