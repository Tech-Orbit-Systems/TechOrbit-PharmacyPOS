const { ProductCatalogService } = require('./product-catalog');

class GenericAlternativesService {
  constructor(db) {
    this.db = db;
    this.catalog = new ProductCatalogService(db);
  }

  source(productId) {
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('Choose a valid medicine');
    const product = this.db.prepare('SELECT * FROM Products WHERE id=? AND active=1').get(id);
    if (!product) throw new Error('Medicine was not found or is inactive');
    if (!String(product.generic_name || '').trim()) throw new Error('This medicine has no generic name configured');
    return product;
  }

  candidates(source, asOfDate) {
    const clauses = ['p.active=1', 'p.id<>?', "lower(trim(p.generic_name))=lower(trim(?))"];
    const params = [source.id, source.generic_name];
    if (String(source.strength || '').trim()) {
      clauses.push("lower(trim(coalesce(p.strength,'')))=lower(trim(?))");
      params.push(source.strength);
    }
    if (String(source.dosage_form || '').trim()) {
      clauses.push("lower(trim(coalesce(p.dosage_form,'')))=lower(trim(?))");
      params.push(source.dosage_form);
    }
    params.push(asOfDate);
    return this.db.prepare(`SELECT DISTINCT p.* FROM Products p
      JOIN ProductBatches b ON b.product_id=p.id
      WHERE ${clauses.join(' AND ')}
        AND b.quantity_on_hand>0 AND (b.expiry_date IS NULL OR b.expiry_date>?)
      ORDER BY p.name COLLATE NOCASE,p.id`).all(...params);
  }

  view({ productId, asOfDate = new Date().toISOString().slice(0, 10), userId = null, roleCode = null }) {
    const source = this.source(productId);
    const items = this.candidates(source, asOfDate)
      .map((product) => this.catalog.buildCounterProduct(product, asOfDate))
      .filter((product) => product.sellableBaseQuantity > 0);
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO AuditLog
      (occurred_at,user_id,role_code,action,entity_type,entity_id,new_json,device_id)
      VALUES (?,?,?,'medicine.alternatives.view','product',?,?,?)`)
      .run(now, userId, roleCode, String(source.id), JSON.stringify({ candidateIds: items.map((item) => item.id) }), 'modern-desktop');
    return {
      source: { id: source.id, name: source.name, genericName: source.generic_name, strength: source.strength, dosageForm: source.dosage_form },
      items,
    };
  }

  select({ sourceProductId, alternativeProductId, asOfDate = new Date().toISOString().slice(0, 10), userId = null, roleCode = null }) {
    const source = this.source(sourceProductId);
    const alternativeId = Number(alternativeProductId);
    const match = this.candidates(source, asOfDate).find((candidate) => candidate.id === alternativeId);
    if (!match) throw new Error('Alternative is no longer eligible or has no valid stock');
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO AuditLog
      (occurred_at,user_id,role_code,action,entity_type,entity_id,new_json,device_id)
      VALUES (?,?,?,'medicine.alternatives.select','product',?,?,?)`)
      .run(now, userId, roleCode, String(source.id), JSON.stringify({ sourceProductId: source.id, alternativeProductId: match.id }), 'modern-desktop');
    return this.catalog.buildCounterProduct(match, asOfDate);
  }
}

module.exports = { GenericAlternativesService };
