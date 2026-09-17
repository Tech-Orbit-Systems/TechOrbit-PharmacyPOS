const { openDatabase } = require('../infrastructure/sqlite/database');
const { InventoryLiveStockService, expiryStatus } = require('../infrastructure/sqlite/services/inventory-live-stock');

describe('P032 batch live stock', () => {
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

