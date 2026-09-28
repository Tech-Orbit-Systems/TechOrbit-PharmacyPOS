# R028 Due Payment/Collection Report acceptance - 2026-09-28

Later customer collections and supplier/vendor payments use Pakistan payment dates. Each payment reconciles amount, method, direction and timestamp to exactly one saved MoneyMovements row; missing/duplicate/drifting links block the report. Account type, party, method, original/payment reference and recorded-by filters, paged detail and CSV/Excel/PDF respect dues.manage and vendor expense permission. Initial invoice payments, return credit/refunds and savings are excluded; net is settlement cash flow. Shared account reference fallback also now labels verified sources without invoice number as Purchase/Expense/Sale # rather than source-not-linked.

## Evidence

- Affected Jest 31/31 passed.
- Integration 26/26 passed, including independent 3 settlements: 1000 collected, 8000 paid, -7000 net; replay creates one movement; method/page/export signatures, vendor exclusion/denial and drift rejection passed.
- Initial TypeScript build caught report filter name collision with posting contract; renamed SettlementReportInput and rebuild passed.
- Sequential isolated Electron accounts/R024-R028 native exports and linked closing regression 2/2 passed; digital collection reference and saved CSV 1000 collected minor verified.

Formal manual three-run QA, actual-pharmacy owner reconciliation and all release gates remain Open.
