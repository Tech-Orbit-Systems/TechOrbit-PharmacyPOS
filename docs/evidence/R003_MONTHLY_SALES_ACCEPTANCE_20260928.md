# R003 Monthly Sales development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Monthly Sales groups exact selected official closing days or Pakistan calendar dates by first of month. First and last months may be partial. It retains R001/R002 product, category, brand, recorded batch supplier, customer, cashier and payment filters; permission-safe paged invoice/return detail and native CSV, Excel and PDF exports.
- Monthly summaries include sales, returns, net sales, GST, ex-GST revenue, COGS and gross profit where authorized. Exports include monthly summaries, while CSV/Excel retain filtered invoice and return detail. Cashier views and exports omit cost/profit.

## Verification

- A two-invoice fixture straddles Pakistan midnight between 30 September and 1 October 2026. Each month has Rs 13 invoiced sales; both reconcile to Rs 26 and Rs 11.40 total actual batch COGS. The same exact date range reconciles to Daily Sales.
- Affected Jest suites: 20/20 passed; modern integration 25/25 passed, including monthly cashier cost denial; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, covering linked R001-R003 reporting and B02/B03/B04 regression. Monthly Sales desktop totals reconciled Rs 100 net sales and CSV month summary saved/read back.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statements, owner accounting approval and release gates remain pending.
