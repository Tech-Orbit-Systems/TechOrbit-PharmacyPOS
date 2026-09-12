# Product Master Bulk Import Guide

## Opening stock import

Use **Import > Opening Stock (batch-aware)** only after the product master exists. Download its separate template and identify each product by SKU or barcode. Medicine rows require a batch number and expiry date; expiry accepts `YYYY-MM-DD`, `DD/MM/YYYY`, or `MM/YYYY`. Quantity may use any unit configured for that product and is converted to base units. `unit_cost` is the cost of one base unit in PKR.

Opening stock is blocked per product once that product has any inventory movement. Transactions on another product do not block a genuinely new product. A successful import creates or updates physical batches, writes `opening` inventory movements and an audit entry, and never creates a purchase or payable. Preview is mandatory and the commit is atomic.

## Safe workflow

1. Download the XLSX template from the Product Import screen/API.
2. Keep barcodes and phone-like identifiers formatted as text so leading zeros remain intact.
3. Upload one workbook containing no more than 5,000 non-empty product rows.
4. Select a duplicate policy: `error` (safest default), `skip`, or `update`.
5. Review totals and every reported row error. Preview never changes Products or ProductUnits.
6. Commit only a zero-error preview. The commit is atomic: all eligible rows and units succeed, or all changes roll back.

## Template columns

`sku`, `barcode`, `name`, `generic_name`, `manufacturer`, `category`, `product_type`, `dosage_form`, `strength`, `pack_description`, `base_unit`, `units_per_strip`, `strips_per_box`, `base_sale_price`, `strip_sale_price`, `box_sale_price`, `minimum_stock`, `reorder_level`, `prescription_required`, `controlled_medicine`, `gst_percent`, `tax_status`, `active`, `notes`.

Prices are entered in PKR and stored internally in integer paisa. `product_type` accepts `medicine`, `general`, or `cosmetic`. `tax_status` accepts `taxable` or `exempt`; exempt rows always store zero GST. Boolean fields accept yes/no, true/false, or 1/0.

## Duplicate policies

- `error`: duplicate barcode/SKU blocks commit and appears in the error report.
- `skip`: existing barcode/SKU remains unchanged and the row is counted as skipped.
- `update`: the existing product and its unit configuration are replaced by the reviewed row. Historical transaction snapshots remain unchanged.

Product Master import does not create stock. Opening stock is a separate import workflow so batch, expiry, unit conversion, cost, and stock movements can be validated independently.
