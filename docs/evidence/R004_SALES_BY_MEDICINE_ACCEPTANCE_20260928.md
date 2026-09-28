# R004 Sales by Medicine development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Sales by Medicine groups posted saved medicine lines and their linked customer-return lines by product ID, retaining saved medicine/generic names. Product/SKU filtering acts on medicine lines. Category and brand read current product metadata; supplier matches recorded sold-batch attribution. Date, official/calendar day, customer, cashier and original payment method filters are available.
- Invoice rounding is allocated to medicine lines by the same cumulative rule used when posting customer returns. Sales, returns, GST, actual batch COGS and gross profit reconcile to R001 Daily Sales with no medicine filter. Paged line detail and CSV/Excel/PDF native exports are available. Cashier views and exports omit COGS and gross profit.

## Verification

- A two-medicine discounted/GST invoice test confirms medicine group sums equal the posted invoice and Daily Sales totals after rounding allocation. A linked pharmacy fixture confirms Rs 120 sales, Rs 20 medicine return, Rs 100 net sales, Rs 50 net COGS and Rs 50 gross profit. Product, supplier and protected cost filters, paging, Excel net sales cell and PDF signature passed.
- Affected Jest suites: 21/21 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R004 reports, CSV/Excel/PDF save/read and B02/B03/B04 regression. Cashier desktop access has no medicine cost/profit values.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statement reconciliation, owner signoff and release gates remain pending.
