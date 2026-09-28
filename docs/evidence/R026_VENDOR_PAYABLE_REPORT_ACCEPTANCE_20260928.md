# R026 Vendor Payable Report acceptance - 2026-09-28

Vendor expense debt at creation excludes any initial paid portion. Later vendor payments reduce the payable and reconcile to saved expense balance. Vendor/reference/due-date/status filters, party totals, paging and native CSV/Excel/PDF require both dues.manage and expense.manage. Void payables are excluded. Settlements are not recognized again as incurred expense.

## Evidence

- Affected Jest 31/31 passed: 100000 expense - 25000 initial payment = 75000 original debt; 30000 later settlement leaves 45000 balance. Restart readback, empty filter, native export signatures and saved expense drift rejection passed.
- Modern integration 25/25 and cashier denial passed.
- TypeScript/Vite build passed.
- Sequential isolated Electron accounts (including R024/R025/R026 native CSV exports) and linked closing regression 2/2 passed. Vendor paid report readback records later 7000 minor settlement separately.

Formal manual three-run QA, actual-pharmacy owner accounting reconciliation and release gates remain Open.
