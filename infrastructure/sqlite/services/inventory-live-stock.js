const VALID_STOCK = new Set(['all', 'in_stock', 'low_stock', 'out_of_stock']);
const VALID_EXPIRY = new Set(['all', 'expired', '30', '60', '90', 'safe', 'none']);

function daysBetween(from, to) {
  if (!to) return null;
  return Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function expiryStatus(expiryDate, asOfDate) {
  const days = daysBetween(asOfDate, expiryDate);
  if (days === null) return 'NO EXPIRY';
  if (days <= 0) return 'EXPIRED';
  if (days <= 30) return 'WITHIN 30 DAYS';
  if (days <= 60) return 'WITHIN 60 DAYS';
  if (days <= 90) return 'WITHIN 90 DAYS';
  return 'SAFE';
}

function stockStatus(row, sellable, expiry) {
  if (expiry === 'EXPIRED') return 'EXPIRED';
  if (Number(row.quantity_on_hand) <= 0) return 'OUT OF STOCK';
  if (sellable <= Number(row.reorder_level || row.minimum_stock || 0)) return 'LOW STOCK';
  if (expiry.startsWith('WITHIN ')) return 'NEAR EXPIRY';
  return 'IN STOCK';
}

class InventoryLiveStockService {
  constructor(db) { this.db = db; }

  list(input = {}, options = {}) {
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = 25;
    const q = String(input.q || '').trim().slice(0, 100);
    const stock = String(input.stock || 'all');
    const expiry = String(input.expiry || 'all');
    if (!VALID_STOCK.has(stock) || !VALID_EXPIRY.has(expiry)) throw Error('Choose valid inventory filters');
    const asOfDate = String(options.asOfDate || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw Error('Invalid inventory date');
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = this.db.prepare(`
      SELECT b.id,b.product_id,b.supplier_id,b.batch_number,b.manufacturing_date,b.expiry_date,
        b.opening_quantity,b.purchased_quantity,b.bonus_quantity,b.disposed_quantity,
        b.quantity_on_hand,b.unit_cost_minor,b.sale_price_minor,b.received_at,
        p.name,p.generic_name,p.manufacturer,p.minimum_stock,p.reorder_level,p.base_unit,p.active,
        s.name supplier_name,
        COALESCE((SELECT br.effective_unit_cost_minor FROM BatchReceipts br WHERE br.batch_id=b.id ORDER BY br.received_at DESC,br.id DESC LIMIT 1),b.unit_cost_minor) effective_cost_minor,
        COALESCE((SELECT -SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='sale'),0) sold_quantity,
        COALESCE((SELECT SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='sale_return'),0) customer_return_quantity,
        COALESCE((SELECT -SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='purchase_return'),0) supplier_return_quantity,
        COALESCE((SELECT SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='adjustment'),0) adjustment_quantity
      FROM ProductBatches b
      JOIN Products p ON p.id=b.product_id
      LEFT JOIN Suppliers s ON s.id=b.supplier_id
      WHERE (?='' OR p.name LIKE ? ESCAPE '\\' OR p.generic_name LIKE ? ESCAPE '\\' OR p.manufacturer LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR b.batch_number LIKE ? ESCAPE '\\')
      ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END,b.expiry_date,p.name,b.id
    `).all(q, pattern, pattern, pattern, pattern, pattern).map(row => this.present(row, asOfDate, Boolean(options.costVisible)));
    const filtered = rows.filter(row => {
      const stockMatch = stock === 'all' || row.stockStatus.toLowerCase().replaceAll(' ', '_') === stock;
      const expiryMatch = expiry === 'all' ||
        (expiry === 'expired' && row.expiryStatus === 'EXPIRED') ||
        (expiry === '30' && row.expiryStatus === 'WITHIN 30 DAYS') ||
        (expiry === '60' && row.expiryStatus === 'WITHIN 60 DAYS') ||
        (expiry === '90' && row.expiryStatus === 'WITHIN 90 DAYS') ||
        (expiry === 'safe' && row.expiryStatus === 'SAFE') ||
        (expiry === 'none' && row.expiryStatus === 'NO EXPIRY');
      return stockMatch && expiryMatch;
    });
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, costVisible: Boolean(options.costVisible), asOfDate };
  }

  detail(input = {}, options = {}) {
    const batchId = Number(input.batchId);
    if (!Number.isSafeInteger(batchId) || batchId < 1) throw Error('Batch ID is required');
    const asOfDate = String(options.asOfDate || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw Error('Invalid inventory date');
    const costVisible = Boolean(options.costVisible);
    const raw = this.db.prepare(`SELECT b.*,p.name,p.generic_name,p.manufacturer,p.minimum_stock,p.reorder_level,p.base_unit,p.active,s.name supplier_name,
      COALESCE((SELECT br.effective_unit_cost_minor FROM BatchReceipts br WHERE br.batch_id=b.id ORDER BY br.received_at DESC,br.id DESC LIMIT 1),b.unit_cost_minor) effective_cost_minor,
      COALESCE((SELECT -SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='sale'),0) sold_quantity,
      COALESCE((SELECT SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='sale_return'),0) customer_return_quantity,
      COALESCE((SELECT -SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='purchase_return'),0) supplier_return_quantity,
      COALESCE((SELECT SUM(im.quantity_delta) FROM InventoryMovements im WHERE im.batch_id=b.id AND im.movement_type='adjustment'),0) adjustment_quantity
      FROM ProductBatches b JOIN Products p ON p.id=b.product_id LEFT JOIN Suppliers s ON s.id=b.supplier_id WHERE b.id=?`).get(batchId);
    if (!raw) throw Error('Batch not found');
    const batch = this.present(raw, asOfDate, costVisible);
    const movements = this.db.prepare(`SELECT im.id,im.movement_type,im.quantity_delta,im.reference_type,im.reference_id,im.occurred_at,im.note,u.display_name user_name
      FROM InventoryMovements im LEFT JOIN Users u ON u.id=im.user_id WHERE im.batch_id=? ORDER BY im.occurred_at DESC,im.id DESC LIMIT 100`).all(batchId);
    return { batch, movements, costVisible };
  }

  present(row, asOfDate, costVisible) {
    const expiry = expiryStatus(row.expiry_date, asOfDate);
    const physical = Number(row.quantity_on_hand);
    const sellable = row.active && expiry !== 'EXPIRED' ? physical : 0;
    const effectiveCostMinor = costVisible ? Number(row.effective_cost_minor || 0) : null;
    return {
      id: row.id, productId: row.product_id, name: row.name, genericName: row.generic_name,
      manufacturer: row.manufacturer, baseUnit: row.base_unit, batchNumber: row.batch_number,
      manufacturingDate: row.manufacturing_date, expiryDate: row.expiry_date, supplierName: row.supplier_name,
      openingQuantity: Number(row.opening_quantity || 0), purchasedQuantity: Number(row.purchased_quantity || 0),
      bonusQuantity: Number(row.bonus_quantity || 0), soldQuantity: Number(row.sold_quantity || 0),
      customerReturnQuantity: Number(row.customer_return_quantity || 0), supplierReturnQuantity: Number(row.supplier_return_quantity || 0),
      adjustmentQuantity: Number(row.adjustment_quantity || 0), disposedQuantity: Number(row.disposed_quantity || 0),
      physicalQuantity: physical, sellableQuantity: sellable, minimumStock: Number(row.minimum_stock || 0),
      reorderLevel: Number(row.reorder_level || 0), stockStatus: stockStatus(row, sellable, expiry), expiryStatus: expiry,
      effectiveCostMinor, stockValueMinor: effectiveCostMinor === null ? null : Math.round(effectiveCostMinor * physical),
    };
  }
}

module.exports = { InventoryLiveStockService, expiryStatus };
