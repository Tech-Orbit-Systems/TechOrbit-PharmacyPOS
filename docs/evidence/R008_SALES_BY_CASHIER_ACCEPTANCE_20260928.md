# R008 Sales by Cashier development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Sales by Cashier groups saved sale and linked customer-return medicine lines by the original sale user's current display name. Linked returns reduce that original cashier's net sales; the report discloses this attribution. Missing users appear as `Unattributed cashier` so totals remain reconciled.
- Exact date and official/calendar day selection, relevant product/generic/category/brand/recorded supplier/customer/cashier/payment filters, paged detail, line rounding, GST/COGS, permission-safe cost/profit and native CSV/Excel/PDF exports remain available.

## Verification

- Two saved sales attributed to Counter A and Counter B each contribute Rs 13 including GST, and their sum matches Daily Sales. Filtering to Counter A selects one group. The linked fixture verifies Rs 100 net sales, Rs 20 returns and Rs 50 net COGS for its original cashier, with desktop CSV readback.
- Affected Jest suites: 23/23 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R008 reports and B02/B03/B04 regression. Cashier cost/profit fields remain hidden.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statement reconciliation, owner accounting approval and release gates remain pending.
