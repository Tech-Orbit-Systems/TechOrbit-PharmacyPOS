class SalesQueryService {
  constructor(db) { this.db = db; }

  search(filters = {}) {
    const where = []; const params = [];
    if (filters.invoiceNumber) { where.push("s.invoice_number LIKE ?"); params.push(`%${filters.invoiceNumber.trim()}%`); }
    if (filters.phone) { where.push("s.customer_phone_snapshot LIKE ?"); params.push(`%${filters.phone.trim()}%`); }
    if (filters.paymentStatus) { where.push("s.payment_status = ?"); params.push(filters.paymentStatus); }
    if (filters.dateFrom) { where.push("s.sold_at >= ?"); params.push(filters.dateFrom); }
    if (filters.dateTo) { where.push("s.sold_at <= ?"); params.push(filters.dateTo); }
    if (filters.product) { where.push("EXISTS (SELECT 1 FROM SaleItems si WHERE si.sale_id=s.id AND (si.product_name_snapshot LIKE ? OR si.generic_name_snapshot LIKE ?))"); const value=`%${filters.product.trim()}%`; params.push(value,value); }
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    return this.db.prepare(`SELECT s.* FROM Sales s ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY s.sold_at DESC,s.id DESC LIMIT ?`).all(...params,limit);
  }

  searchPaged(filters={}){
    const where=[],params=[];
    const addLike=(sql,value)=>{if(value){where.push(sql);params.push(`%${String(value).trim().replace(/[\\%_]/g,'\\$&')}%`);}};
    addLike("s.invoice_number LIKE ? ESCAPE '\\'",filters.invoiceNumber);
    addLike("s.customer_phone_snapshot LIKE ? ESCAPE '\\'",filters.phone);
    if(filters.paymentStatus){if(!['paid','partial','credit','reversed'].includes(filters.paymentStatus))throw Error('Choose a valid payment status');where.push('s.payment_status=?');params.push(filters.paymentStatus);}
    if(filters.dateFrom){if(!/^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom))throw Error('Choose a valid from date');where.push('s.sold_at>=?');params.push(filters.dateFrom+'T00:00:00+05:00');}
    if(filters.dateTo){if(!/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo))throw Error('Choose a valid to date');where.push('s.sold_at<?');const end=new Date(filters.dateTo+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);params.push(end.toISOString().slice(0,10)+'T00:00:00+05:00');}
    if(filters.dateFrom&&filters.dateTo&&filters.dateFrom>filters.dateTo)throw Error('From date cannot be after to date');
    if(filters.product){where.push("EXISTS (SELECT 1 FROM SaleItems si WHERE si.sale_id=s.id AND (si.product_name_snapshot LIKE ? ESCAPE '\\' OR si.generic_name_snapshot LIKE ? ESCAPE '\\'))");const pattern=`%${String(filters.product).trim().replace(/[\\%_]/g,'\\$&')}%`;params.push(pattern,pattern);}
    const page=Number(filters.page||1),pageSize=Math.min(Math.max(Number(filters.pageSize)||25,1),100);if(!Number.isSafeInteger(page)||page<1)throw Error('Choose a valid page');
    const clause=where.length?'WHERE '+where.join(' AND '):'';const total=this.db.prepare(`SELECT COUNT(*) count FROM Sales s ${clause}`).get(...params).count;
    const items=this.db.prepare(`SELECT s.id,s.invoice_number,s.sold_at,s.customer_name_snapshot,s.customer_phone_snapshot,s.payment_method,s.payment_status,s.final_total_minor,s.amount_paid_minor,s.balance_due_minor,s.due_date,(SELECT GROUP_CONCAT(si.product_name_snapshot, ', ') FROM SaleItems si WHERE si.sale_id=s.id ORDER BY si.line_number) products FROM Sales s ${clause} ORDER BY s.sold_at DESC,s.id DESC LIMIT ? OFFSET ?`).all(...params,pageSize,(page-1)*pageSize);
    return{items,total:Number(total),page,pageSize};
  }

  getById(id) {
    const sale = this.db.prepare("SELECT * FROM Sales WHERE id=?").get(id);
    if (!sale) return null;
    const items = this.db.prepare("SELECT * FROM SaleItems WHERE sale_id=? ORDER BY line_number").all(id);
    const allocations = this.db.prepare(`SELECT a.* FROM SaleItemAllocations a JOIN SaleItems i ON i.id=a.sale_item_id WHERE i.sale_id=? ORDER BY i.line_number,a.id`).all(id);
    return { ...sale, items: items.map(item => ({ ...item, allocations: allocations.filter(a => a.sale_item_id === item.id) })) };
  }

  receipt(id) {
    const sale = this.getById(id);
    if (!sale) return null;
    const acknowledgement=this.db.prepare(`SELECT a.*,u.display_name acknowledged_by_name FROM SaleWarningAcknowledgements a JOIN Users u ON u.id=a.acknowledged_by WHERE a.sale_id=?`).get(id);
    return {
      saleId:sale.id, invoiceNumber:sale.invoice_number, soldAt:sale.sold_at,
      customer:{name:sale.customer_name_snapshot,phone:sale.customer_phone_snapshot},
      payment:{method:sale.payment_method,status:sale.payment_status,amountPaidMinor:sale.amount_paid_minor,balanceDueMinor:sale.balance_due_minor,dueDate:sale.due_date,cashTenderedMinor:sale.cash_tendered_minor,cashChangeMinor:sale.cash_change_minor},
      totals:{grossMinor:sale.gross_minor,lineDiscountMinor:sale.line_discount_minor,invoiceDiscountMinor:sale.invoice_discount_minor,taxableMinor:sale.taxable_minor,gstMinor:sale.gst_minor,exactTotalMinor:sale.exact_total_minor,roundingMinor:sale.rounding_minor,finalTotalMinor:sale.final_total_minor},
      items:sale.items.map(item=>({lineNumber:item.line_number,productName:item.product_name_snapshot,genericName:item.generic_name_snapshot,saleUnit:item.sale_unit,quantity:item.entered_quantity,originalUnitPriceMinor:item.original_unit_price_minor,unitPriceMinor:item.charged_unit_price_minor,lineDiscountMinor:item.line_discount_minor,gstMinor:item.gst_minor,lineTotalMinor:item.line_total_minor,prescriptionWarning:Boolean(item.prescription_warning),controlledWarning:Boolean(item.controlled_warning),nearExpiryWarning:Boolean(item.near_expiry_warning)})),
      warningAcknowledgement:acknowledgement?{warnings:JSON.parse(acknowledgement.warnings_json),doctorName:acknowledgement.doctor_name,prescriptionReference:acknowledgement.prescription_reference,acknowledgedBy:acknowledgement.acknowledged_by_name,acknowledgedAt:acknowledgement.acknowledged_at}:null
    };
  }
}
module.exports={SalesQueryService};
