INSERT OR IGNORE INTO Settings(key,value_json,updated_at)
VALUES('receiptProfile','{"pharmacyName":"TechOrbit Pharmacy POS","address":null,"phone":null,"taxRegistration":null,"footer":"Thank you for your purchase"}',datetime('now'));

CREATE TABLE SaleReceiptSnapshots (
  sale_id INTEGER PRIMARY KEY REFERENCES Sales(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL
);

INSERT INTO SaleReceiptSnapshots(sale_id,payload_json,created_at)
SELECT s.id,
  json_object(
    'version',1,
    'profile',json(COALESCE((SELECT value_json FROM Settings WHERE key='receiptProfile'),'{}')),
    'cashier',json_object('id',s.created_by,'name',COALESCE(u.display_name,'Unknown cashier'),'roleCode',COALESCE(r.code,'unknown')),
    'saleId',s.id,
    'invoiceNumber',s.invoice_number,
    'soldAt',s.sold_at,
    'customer',json_object('name',s.customer_name_snapshot,'phone',s.customer_phone_snapshot),
    'payment',json_object(
      'method',s.payment_method,'status',s.payment_status,'amountPaidMinor',s.amount_paid_minor,
      'balanceDueMinor',s.balance_due_minor,'dueDate',s.due_date,
      'cashTenderedMinor',s.cash_tendered_minor,'cashChangeMinor',s.cash_change_minor
    ),
    'totals',json_object(
      'grossMinor',s.gross_minor,'lineDiscountMinor',s.line_discount_minor,
      'invoiceDiscountMinor',s.invoice_discount_minor,'taxableMinor',s.taxable_minor,
      'gstMinor',s.gst_minor,'exactTotalMinor',s.exact_total_minor,
      'roundingMinor',s.rounding_minor,'finalTotalMinor',s.final_total_minor
    ),
    'items',json(COALESCE((
      SELECT json_group_array(json(item_json)) FROM (
        SELECT json_object(
          'lineNumber',si.line_number,'productName',si.product_name_snapshot,
          'genericName',si.generic_name_snapshot,'saleUnit',si.sale_unit,
          'quantity',si.entered_quantity,'originalUnitPriceMinor',si.original_unit_price_minor,
          'unitPriceMinor',si.charged_unit_price_minor,'grossMinor',si.gross_minor,
          'lineDiscountMinor',si.line_discount_minor,
          'invoiceDiscountMinor',si.allocated_invoice_discount_minor,
          'gstRateBasisPoints',si.gst_rate_basis_points,'gstMinor',si.gst_minor,
          'lineTotalMinor',si.line_total_minor
        ) item_json
        FROM SaleItems si WHERE si.sale_id=s.id ORDER BY si.line_number
      )
    ),'[]')),
    'warningAcknowledgement',NULL
  ),
  COALESCE(s.created_at,s.sold_at)
FROM Sales s
LEFT JOIN Users u ON u.id=s.created_by
LEFT JOIN Roles r ON r.id=u.role_id;
