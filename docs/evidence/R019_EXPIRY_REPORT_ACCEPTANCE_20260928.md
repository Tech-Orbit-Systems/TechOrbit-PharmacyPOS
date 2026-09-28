# R019 Expiry Report acceptance — 2026-09-28

## Scope and result

R019 shows live positive-stock batches by Pakistan civil date. A batch expiring today is expired and has zero sellable quantity while its physical quantity remains visible. The next 30/60/90-day filters are cumulative and exclude expired batches; summary bands are exclusive. Product/SKU/batch, generic, category, brand and supplier filters, paged detail and CSV/Excel/PDF exports are available. Physical and sellable value are estimated using the same effective batch cost convention as live inventory. The `inventory.view` permission is required; value fields and exports are omitted without `report.cost`.

This is a current snapshot and estimated value, not a historical stock or posted accounting balance.

## Automated evidence

- Affected Jest `tests/inventory-live-stock.test.js`, `tests/purchase-returns.test.js`, `tests/sales-posting.test.js` and `tests/cash-closing.test.js`: 37/37 passed. Isolated boundary dates 0/30/60/90/91 days reconciled physical/sellable quantities, values, cumulative filters and cost redaction; CSV/Excel/PDF signatures passed.
- Modern integration: 25/25 passed, including cashier denial.
- TypeScript/Vite production build passed.
- Full sequential isolated Electron desktop suite: 23/23 passed. Inventory-to-expiry UI, 30-day selection, authorized value and native CSV readback passed.

Formal three-run manual QA, actual-pharmacy expiry/stock reconciliation and owner signoff remain Pending. Release gates remain Open.
