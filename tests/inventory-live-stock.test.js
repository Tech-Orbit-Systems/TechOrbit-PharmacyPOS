const { openDatabase } = require('../infrastructure/sqlite/database');
const { InventoryLiveStockService, expiryStatus } = require('../infrastructure/sqlite/services/inventory-live-stock');
const {lowStockSummary,lowStockEntries,lowStockCsv,lowStockXlsx,lowStockPdf}=require('../modernization/desktop/low-stock-report.cjs');
const {expirySummary,expiryEntries,expiryCsv,expiryXlsx,expiryPdf}=require('../modernization/desktop/expiry-report.cjs');
const {batchStockSummary,batchStockEntries,batchStockCsv,batchStockXlsx,batchStockPdf}=require('../modernization/desktop/batch-stock-report.cjs');

describe('P032 batch live stock', () => {
  test('R020 batch stock preserves zero batches and matches live inventory quantities and cost redaction',async()=>{
    const db=openDatabase({filename:':memory:'});
    try{
      const now='2026-09-18T08:00:00Z',product=db.prepare(`INSERT INTO Products(name,sku,base_unit,created_at,updated_at) VALUES('Batch Item','BATCH-1','piece',?,?)`).run(now,now).lastInsertRowid;
      const add=(number,expiry,qty)=>db.prepare(`INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES(?,?,?,100,200,?,?,?,?)`).run(product,number,expiry,qty,now,now,now).lastInsertRowid;
      const live=add('LIVE','2027-12-31',8),zero=add('EMPTY','2027-12-31',0);add('OLD','2026-09-17',2);
      const options={now:new Date(now),costVisible:true},report=batchStockSummary(db,{},options);
      expect(report.totals).toMatchObject({batchCount:3,physicalQuantity:10,sellableQuantity:8,zeroStockBatches:1,expiredBatches:1,stockValueMinor:1000});
      expect(report.items.find(row=>row.id===zero)).toMatchObject({physicalQuantity:0,sellableQuantity:0});
      const detail=new InventoryLiveStockService(db).detail({batchId:live},{asOfDate:'2026-09-18',costVisible:true});
      expect(report.items.find(row=>row.id===live)).toMatchObject({physicalQuantity:detail.batch.physicalQuantity,sellableQuantity:detail.batch.sellableQuantity,stockValueMinor:detail.batch.stockValueMinor});
      expect(batchStockSummary(db,{batch:'EMPTY'},options).totals.batchCount).toBe(1);
      expect(batchStockEntries(db,{page:1,pageSize:1},options).hasMore).toBe(true);
      const hidden=batchStockSummary(db,{}, {now:new Date(now),costVisible:false});
      expect(hidden.totals.stockValueMinor).toBeNull();
      expect(batchStockCsv(db,{}, {now:new Date(now),costVisible:false}).csv).not.toContain('Stock value minor');
      expect(Buffer.from((await batchStockXlsx(db,{},options)).base64,'base64').subarray(0,2).toString()).toBe('PK');
      expect(Buffer.from(batchStockPdf(db,{},options).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
    }finally{db.close()}
  });
  test('R019 expiry report keeps expired physical stock and cumulative 30/60/90 filters with cost redaction',async()=>{
    const db=openDatabase({filename:':memory:'});
    try{
      const now='2026-09-18T08:00:00Z',product=db.prepare(`INSERT INTO Products(name,sku,base_unit,created_at,updated_at) VALUES('Expiry Bands','EXP-BANDS','piece',?,?)`).run(now,now).lastInsertRowid;
      const add=(batch,days,qty)=>{
        const date=new Date(Date.parse('2026-09-18T00:00:00Z')+days*86400000).toISOString().slice(0,10);
        db.prepare(`INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES(?,?,?,100,200,?,?,?,?)`).run(product,batch,date,qty,now,now,now);
      };
      add('OLD',0,2);add('D30',30,3);add('D60',60,4);add('D90',90,5);add('SAFE',91,6);
      const options={now:new Date(now),costVisible:true},report=expirySummary(db,{horizon:'all'},options);
      expect(report.totals).toMatchObject({batchCount:5,physicalQuantity:20,sellableQuantity:18,physicalValueMinor:2000,sellableValueMinor:1800});
      expect(report.groups.map(row=>row.batchCount)).toEqual([1,1,1,1,1,0]);
      expect(expirySummary(db,{horizon:'30'},options).totals.batchCount).toBe(1);
      expect(expirySummary(db,{horizon:'60'},options).totals.batchCount).toBe(2);
      expect(expirySummary(db,{horizon:'90'},options).totals.batchCount).toBe(3);
      expect(expirySummary(db,{horizon:'expired'},options).items[0]).toMatchObject({physicalQuantity:2,sellableQuantity:0});
      expect(expiryEntries(db,{page:1,pageSize:2},options).hasMore).toBe(true);
      const hidden=expirySummary(db,{horizon:'all'},{now:new Date(now),costVisible:false});
      expect(hidden.totals.physicalValueMinor).toBeNull();
      expect(expiryCsv(db,{}, {now:new Date(now),costVisible:false}).csv).not.toContain('value minor');
      expect(Buffer.from((await expiryXlsx(db,{},options)).base64,'base64').subarray(0,2).toString()).toBe('PK');
      expect(Buffer.from(expiryPdf(db,{},options).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
    }finally{db.close()}
  });
  test('R018 groups active product stock, excludes expired sellable units and exports alerts',async()=>{
    const db=openDatabase({filename:':memory:'});
    try{
      const now='2026-09-18T08:00:00Z';
      const low=db.prepare(`INSERT INTO Products(name,sku,base_unit,minimum_stock,reorder_level,created_at,updated_at) VALUES('Low Item','LOW-1','piece',5,10,?,?)`).run(now,now).lastInsertRowid;
      const out=db.prepare(`INSERT INTO Products(name,sku,base_unit,minimum_stock,reorder_level,created_at,updated_at) VALUES('Expired Item','OUT-1','piece',5,0,?,?)`).run(now,now).lastInsertRowid;
      db.prepare(`INSERT INTO ProductBatches(product_id,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES(?,'2027-12-31',100,200,8,?,?,?)`).run(low,now,now,now);
      db.prepare(`INSERT INTO ProductBatches(product_id,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES(?,'2026-09-17',100,200,12,?,?,?)`).run(out,now,now,now);
      const input={status:'all'},options={now:new Date(now)},report=lowStockSummary(db,input,options);
      expect(report.totals).toMatchObject({productCount:2,lowCount:1,outCount:1,physicalQuantity:20,sellableQuantity:8,expiredQuantity:12,unitsToClearAlert:9});
      expect(report.items.find(row=>row.productId===out)).toMatchObject({physicalQuantity:12,sellableQuantity:0,threshold:5,status:'out',unitsToClearAlert:6});
      expect(lowStockSummary(db,{q:'LOW-1'},options).items).toHaveLength(1);
      expect(lowStockEntries(db,{status:'all',page:1,pageSize:1},options).hasMore).toBe(true);
      expect(lowStockCsv(db,input,options).csv).toContain('"Out of stock products","1"');
      expect(Buffer.from((await lowStockXlsx(db,input,options)).base64,'base64').subarray(0,2).toString()).toBe('PK');
      expect(Buffer.from(lowStockPdf(db,input,options).base64,'base64').subarray(0,4).toString()).toBe('%PDF');
      expect(Object.keys(report.items[0])).not.toContain('unitCostMinor');
    }finally{db.close()}
  });
  test('shows physical stock, blocks expired sellable stock and protects cost', () => {
    const db = openDatabase({ filename: ':memory:' });
    try {
      const now = new Date().toISOString();
      const productId = db.prepare(`INSERT INTO Products(name,generic_name,manufacturer,base_unit,minimum_stock,reorder_level,created_at,updated_at)
        VALUES('Expiry Test','Paracetamol','Test Labs','tablet',5,10,?,?)`).run(now, now).lastInsertRowid;
      const batchId = db.prepare(`INSERT INTO ProductBatches(product_id,batch_number,manufacturing_date,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,opening_quantity,purchased_quantity,bonus_quantity,received_at,created_at,updated_at)
        VALUES(?,'EXP-1','2025-01-01','2026-09-17',250,500,12,2,9,1,?,?,?)`).run(productId, now, now, now).lastInsertRowid;
      db.prepare(`INSERT INTO InventoryMovements(product_id,batch_id,movement_type,quantity_delta,reference_type,reference_id,occurred_at,note)
        VALUES(?,?,'sale',-3,'sale','1',?,'test sale')`).run(productId, batchId, now);
      const service = new InventoryLiveStockService(db);
      const hidden = service.list({ q: 'Expiry Test', stock: 'all', expiry: 'expired', page: 1 }, { asOfDate: '2026-09-18', costVisible: false });
      expect(hidden.total).toBe(1);
      expect(hidden.items[0]).toMatchObject({ physicalQuantity: 12, sellableQuantity: 0, stockStatus: 'EXPIRED', expiryStatus: 'EXPIRED', soldQuantity: 3, effectiveCostMinor: null, stockValueMinor: null });
      const detail = service.detail({ batchId: Number(batchId) }, { asOfDate: '2026-09-18', costVisible: true });
      expect(detail.batch.effectiveCostMinor).toBe(250);
      expect(detail.batch.stockValueMinor).toBe(3000);
      expect(detail.movements[0].quantity_delta).toBe(-3);
      expect(expiryStatus(null, '2026-09-18')).toBe('NO EXPIRY');
    } finally { db.close(); }
  });
});

