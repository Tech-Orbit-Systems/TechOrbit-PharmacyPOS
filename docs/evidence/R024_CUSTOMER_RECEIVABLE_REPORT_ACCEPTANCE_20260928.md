# R024 Customer Receivable Report acceptance - 2026-09-28

Current saved receivables reconcile original debt after initial payment minus later collections minus return credits to both account and sale balances. Customer/reference, due-date and open/paid/overdue filters, stable party groups, paged detail and CSV/Excel/PDF require dues.manage. Due today is not overdue; Pakistan civil date defines the boundary. No historical balance reconstruction.

## Evidence

- Affected Jest 26/26 passed: independent 500 original - 100 collection - 200 credit = 200 current balance; overdue boundary, empty result, dates, pagination, native export signatures and drift rejection.
- Modern integration 25/25 passed, including cashier permission denial.
- TypeScript/Vite build passed.
- Sequential desktop suite: 22/23 initially passed. First accounts launch timed out while build was concurrently replacing assets. After build completed, affected accounts flow rerun passed 1/1, including customer filter and native saved CSV with 1000 collection minor. All 23 flows therefore passed across initial run and targeted retest; this is not a clean single full-suite pass.

Formal manual three-run QA, actual-pharmacy owner reconciliation and release gates remain Open.
