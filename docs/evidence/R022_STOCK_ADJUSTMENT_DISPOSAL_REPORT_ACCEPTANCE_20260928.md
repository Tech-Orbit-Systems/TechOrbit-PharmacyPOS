# R022 Stock Adjustment/Disposal Report acceptance — 2026-09-28

Saved adjustment movements reconcile to original StockAdjustmentItems with stored previous/new quantities, or non-sellable customer-return allocations. Gain, loss, manual disposal and return disposal are distinct groups. Official/calendar dates and product/generic/category/brand/supplier/batch/reference/kind filters, paged detail and CSV/Excel/PDF are available under inventory.view. No historical disposal cost is inferred from present batch prices.

## Evidence

- Affected Jest: 40/40 passed. Actual manual disposal/gain and customer-return disposal reconciled; corrupted previous/new reconciliation was rejected. All export signatures passed.
- Modern integration: 25/25 passed with cashier denial.
- TypeScript/Vite build passed.
- Full sequential isolated Electron regression: 23/23 passed. Actual posted desktop disposal appeared in the report and native CSV readback.

Formal three-run manual QA, actual-pharmacy stock reconciliation and owner acceptance remain Pending; release gates remain Open.
