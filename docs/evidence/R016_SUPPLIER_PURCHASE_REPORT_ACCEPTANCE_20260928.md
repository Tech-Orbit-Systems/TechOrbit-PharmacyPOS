# R016 Supplier Purchase Report acceptance — 2026-09-28

## Scope and result

R016 groups posted purchase invoices by stable supplier ID while retaining paged invoice detail. It reuses R015's reconciled purchase selection, so supplier totals match purchase totals for the same date, supplier and product filters. Each supplier shows invoice count, gross purchases, linked supplier returns, net purchases, receiving-time payment, later payment, current payable and purchased/bonus base units. The report supports official closing day or Pakistan calendar date and CSV, Excel and PDF exports. `report.cost` permission gates every desktop command; cashier access is denied.

## Automated evidence

- `npm test -- --runInBand tests/purchase-returns.test.js tests/sales-posting.test.js tests/cash-closing.test.js`: 33/33 passed. A two-supplier isolated fixture reconciled group and grand totals, filtered one supplier, checked pagination and CSV/Excel/PDF signatures.
- `modernization/npm test`: 25/25 passed, including cashier denial.
- `modernization/npm run build`: TypeScript and Vite passed.
- `modernization/npx playwright test --workers=1`: 23/23 passed after fixing a test selector ambiguity. Linked desktop flow read back the supplier-grouped CSV and reconciled PKR 100 purchases, PKR 10 returns, PKR 90 net and PKR 40 payable.

Formal three-run manual QA, actual pharmacy supplier-statement reconciliation and owner/accounting signoff remain pending. Release gates remain Open.
