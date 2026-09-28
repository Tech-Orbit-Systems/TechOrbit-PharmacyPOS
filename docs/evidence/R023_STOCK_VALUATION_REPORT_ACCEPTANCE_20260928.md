# R023 Stock Valuation Report acceptance — 2026-09-28

Current physical/sellable/blocked valuation uses saved ProductBatches.unit_cost_minor, which purchase receiving weights and sales allocations use. Physical quantity times saved cost is rounded per batch, then summed by product and grand total. This carrying-cost basis is explicitly distinguished from the existing latest-receipt effective-cost estimate in live inventory. No historical reconstruction or automatic write-down is performed. Batch/product filters, paged detail and CSV/Excel/PDF require both inventory.view and report.cost.

## Evidence

- Affected Jest: 41/41 passed. Two different-cost receipts in the same batch produced saved weighted cost 200 versus latest receipt 300; physical value reconciled to 4000 minor and inactive stock moved to blocked value. Export signatures passed.
- Modern integration: 25/25 passed with cashier denial.
- TypeScript/Vite build passed after correcting stale display fields and UTF-8 encoding.
- Full sequential isolated Electron regression: 23/23 passed with valuation UI and native CSV readback.

Formal three-run manual QA, actual-pharmacy stock/accounting reconciliation and owner acceptance remain Pending; release gates remain Open.
