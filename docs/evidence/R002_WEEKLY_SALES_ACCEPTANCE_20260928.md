# R002 Weekly Sales development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only; no live cutover.

## Delivered

- Weekly Sales groups the selected official closing days or Pakistan calendar dates into Monday-start weeks. The requested date range remains exact; the first and last displayed week may therefore be partial. It retains R001 product, category, brand, recorded batch supplier, customer, cashier, payment method, invoice/return detail and permission rules.
- Sales, returns, net sales, GST, ex-GST revenue, discount, paid-at-sale, credit, refunds, COGS and gross profit reconcile with the underlying daily ledger totals. Weekly CSV, Excel and PDF include week summaries; CSV and Excel include filtered invoice/return detail. Cashiers cannot receive COGS or profit fields.

## Verification

- An isolated two-invoice fixture across Friday 11 September and Monday 14 September 2026 yields week keys 7 and 14 September, Rs 26 sales including GST and Rs 11.40 batch COGS. The sum of weekly net sales equals the full invoice total. Invalid period selection is rejected.
- Affected Jest suites: 19/19 passed. Modern integration: 25/25 passed, including weekly cashier cost denial. TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including B02 accounts, B03 returns, B04 closing and linked R001/R002 reports. The desktop Weekly Sales view reconciled Rs 100 net sales and saved/read back the CSV week summary.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statement approval and release gates remain pending.
