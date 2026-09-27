const {openDatabase}=require('../infrastructure/sqlite/database');
const {CashClosingService}=require('../infrastructure/sqlite/services/cash-closing');
const {recordMoneyMovement}=require('../infrastructure/sqlite/services/money-movement');

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
    const one=service.close({shiftId:first.id,countedCashMinor:13750,closedAt:t(12),userId:user1});
    expect(one).toMatchObject({expectedCashMinor:13800,varianceMinor:-50,status:'closed'});
    const next=service.open({userId:user2,deviceId:'COUNTER-1',openingCashMinor:13750,openedAt:t(12)});
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
    expect(()=>service.close({shiftId:shift.id,countedCashMinor:125,closedAt:t(10)})).toThrow(/Unattributed/);
    expect(db.prepare('SELECT status FROM CashShifts WHERE id=?').get(shift.id).status).toBe('open');
  });

  test('six month fixture remains immutable',()=>{
    const report=service.sixMonthReport(t(0));
    expect(report.months.map(x=>x.month)).toEqual(['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
    const closed=service.closeSixMonth({asOf:t(0)});
    expect(closed.closingId).toBeGreaterThan(0);
    expect(()=>service.closeSixMonth({asOf:t(0)})).toThrow(/UNIQUE/);
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
});
