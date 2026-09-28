# R021 Stock Movement Report acceptance — 2026-09-28

The report reads saved InventoryMovements with signed base quantities, type, original source reference, product, batch, user and reason. Official/calendar date and product/generic/category/brand/supplier/batch/reference/type filters select the period rows. In/out/net totals and type groups reconcile to those rows. Paged detail and CSV/Excel/PDF are available under inventory.view; cashier access is denied. No cost is included. This report is period activity, not a reconstructed historical opening/closing balance.

## Evidence

- Affected Jest: 39/39 passed, including an actual purchase and supplier return whose net quantity matches saved InventoryMovements.
- Modern integration: 25/25 passed, including cashier denial.
- TypeScript/Vite build passed.
- Full sequential isolated Electron regression: 23/23 passed, including movement UI and native CSV readback.

Formal three-run manual QA, actual-pharmacy stock reconciliation and owner acceptance remain Pending; all release gates remain Open.
