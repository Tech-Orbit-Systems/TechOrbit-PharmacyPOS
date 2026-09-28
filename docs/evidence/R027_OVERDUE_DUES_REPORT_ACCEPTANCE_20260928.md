# R027 Overdue Dues Report acceptance - 2026-09-28

Current positive dues before today's Pakistan date are overdue; due today is excluded. Customer/supplier/vendor totals remain separate, with gross outstanding clearly not net assets/liabilities or profit. Stable type + party ID prevents name/ID collisions. Account type, party/reference/due-date and 1-30/31-60/61-90/over-90-day filters, paged detail and native CSV/Excel/PDF reuse reconciled saved balance equations. Vendor data requires expense access beneath the UI, including export.

## Evidence

- Affected Jest 31/31 passed, regressing customer, supplier, vendor and linked books.
- Integration 26/26 passed: colliding party IDs/names remain three separate groups; 30/61/91-day boundaries, pagination, exports and vendor denial/exclusion checked.
- TypeScript/Vite build passed.
- Sequential isolated Electron accounts/R024-R027 reports with native exports and linked closing regression 2/2 passed. Customer 1-30-day overdue filter and native CSV type totals verified.

Formal manual three-run QA, actual-pharmacy owner reconciliation and all release gates remain Open.
