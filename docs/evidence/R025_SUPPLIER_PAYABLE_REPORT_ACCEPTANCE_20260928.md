# R025 Supplier Payable Report acceptance - 2026-09-28

Supplier payables reconcile original unpaid purchase debt, later supplier payments and supplier return credits to both saved account and purchase balance. Initial payments are outside original debt. Supplier/reference, due-date/status filters, party totals, paged detail and native CSV/Excel/PDF require dues.manage. Unlinked-source accounts are labelled and checked against their saved account equation without fabricated purchase/payment history.

## Evidence

- Affected Jest 27/27 passed after retest with 30-second per-test limit: linked closing export fixture initially exceeded default 5 seconds under parallel build/integration load. Independent supplier equation 1000 - 200 payment - 300 credit = 500 balance; native signatures and balance drift rejection passed.
- Modern integration 25/25 passed including cashier denial.
- TypeScript/Vite build passed before desktop launch.
- Sequential isolated Electron regression: returns and linked closing 2/2 passed. Accounts initially failed on exact dropdown label; explicit accessible label fixed and affected accounts/customer-supplier reports retest 1/1 passed. Supplier paid filter and native CSV verified zero balance after settlement.

Formal manual three-run QA, actual-pharmacy owner reconciliation and release gates remain Open.
