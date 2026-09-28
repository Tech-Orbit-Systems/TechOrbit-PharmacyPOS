# R017 Bonus Stock/Scheme Report acceptance — 2026-09-28

## Scope and result

R017 reports only posted purchase lines with recorded bonus units. It shows supplier, invoice, medicine, batch, paid and free purchase units, base quantities, paid cost and effective unit cost, with product grouping and paged line detail. Each line checks the original batch receipt's paid/free base quantities, paid cost and effective unit cost before it enters report totals. Official closing day and Pakistan calendar date, supplier/product/generic/category/brand filters and CSV/Excel/PDF exports are available. `report.cost` gates desktop access; a cashier is denied.

The paid cost remains the actual purchase cost spread over paid and free units. The report does not present bonus units as separate expense or realized saving. Current physical stock after later movements is covered by the live stock reports.

## Automated evidence

- Affected Jest `tests/purchase-returns.test.js`, `tests/sales-posting.test.js` and `tests/cash-closing.test.js`: 34/34 passed. An isolated bonus purchase reconciled paid/free base units to its receipt; an intentionally corrupted receipt was rejected. CSV and Excel/PDF signatures passed.
- Modern integration: 25/25 passed, including cashier cost-permission denial.
- TypeScript/Vite production build passed.
- Full sequential isolated Electron desktop suite: 23/23 passed after closing a pre-existing purchase detail dialog in the linked bonus purchase scenario. The UI showed the bonus purchase and exported CSV with its original invoice.

Formal three-run manual QA, actual-pharmacy stock reconciliation and owner/accounting signoff remain Pending. Release gates remain Open.
