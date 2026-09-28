# R020 Batch Stock Report acceptance — 2026-09-28

## Scope and result

R020 shows all live product batches, including zero-stock and inactive-product batches for traceability. It uses the existing inventory presenter for physical/sellable quantities, expiry/stock status, movement components and effective cost. Product groups and totals reconcile to the displayed batches. Product/SKU/batch, generic, category, brand, supplier, stock status and active-only filters, paged detail and CSV/Excel/PDF exports are available. `inventory.view` is required; estimated cost and value require `report.cost` and are removed from lower-permission exports.

This is a live snapshot, not a historical stock ledger or posted accounting valuation.

## Automated evidence

- Affected Jest `tests/inventory-live-stock.test.js`, `tests/purchase-returns.test.js`, `tests/sales-posting.test.js` and `tests/cash-closing.test.js`: 38/38 passed. Isolated live, zero and expired batches matched the inventory detail's quantities/value, verified filters, pagination, cost redaction and CSV/Excel/PDF signatures.
- Modern integration: 25/25 passed, including cashier denial.
- TypeScript/Vite production build passed.
- Full sequential isolated Electron desktop suite: 23/23 passed. Inventory-to-batch report and native CSV readback passed.

Formal three-run manual QA, actual-pharmacy physical stock reconciliation and owner signoff remain Pending. Release gates remain Open.
