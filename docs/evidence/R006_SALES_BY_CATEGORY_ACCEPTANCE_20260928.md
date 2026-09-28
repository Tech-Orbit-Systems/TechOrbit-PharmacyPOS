# R006 Sales by Category development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Sales by Category groups posted medicine sale lines and linked return lines using current product categories. Blank current categories remain visible as `Uncategorised`, preserving reconciliation. The report discloses that category is current metadata while medicine/generic names are saved sale snapshots.
- Exact date and official/calendar day filters, product/SKU, generic, category, brand, recorded sold-batch supplier, customer, cashier and original payment-method filters remain available. Paged detail and native CSV/Excel/PDF exports use the permission-safe R004 ledger contract.

## Verification

- A two-medicine fixture places both products in Pain relief and confirms one category group equals Daily Sales after invoice rounding. A linked fixture verifies Rs 100 net sales, Rs 20 returns and Rs 50 net COGS in General care. Desktop review fixture verifies the explicit Uncategorised fallback and CSV summary.
- Affected Jest suites: 22/22 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R006 reporting and B02/B03/B04 regression. Cashier cost/profit values remain hidden.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statement reconciliation, owner accounting approval and release gates remain pending.
