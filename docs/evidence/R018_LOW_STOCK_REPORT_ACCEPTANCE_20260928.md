# R018 Low Stock Report acceptance — 2026-09-28

## Scope and result

R018 is a live snapshot of active products. It aggregates all batches per product, keeps physical and sellable base quantities separate, excludes expired batches from sellable stock, and applies the configured reorder level or minimum stock. It shows low versus out-of-stock products and units needed to clear the threshold. Product/SKU, generic, category, brand, default supplier and status filters are available with paged detail and CSV/Excel/PDF exports. It contains no cost fields and requires `inventory.view`; cashier access is denied and the tab is hidden for that role.

The report is explicitly current state, not a historical stock reconstruction or purchase order. Expired physical stock remains visible so it cannot mask a shortage.

## Automated evidence

- Affected Jest `tests/inventory-live-stock.test.js`, `tests/purchase-returns.test.js`, `tests/sales-posting.test.js` and `tests/cash-closing.test.js`: 36/36 passed. Isolated current and expired batches reconciled physical/sellable/expired quantities, low/out counts, thresholds, pagination and all export signatures.
- Modern integration: 25/25 passed, including cashier permission denial.
- TypeScript/Vite production build passed.
- Full sequential isolated Electron desktop suite: 23/23 passed. Inventory-to-report UI and native CSV readback passed.

Formal three-run manual QA, actual-pharmacy stock reconciliation and owner signoff remain Pending. Release gates remain Open.
