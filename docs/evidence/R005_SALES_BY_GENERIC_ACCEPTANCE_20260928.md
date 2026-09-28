# R005 Sales by Generic development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Sales by Generic groups saved generic-name snapshots from sale lines and linked customer returns. Multiple medicine products with the same generic merge into one group. Blank historical generic names appear as `Unspecified generic` so their revenue remains visible and reconciled.
- The report retains exact date and official/calendar day selection, product/SKU, generic, category, brand, recorded sold-batch supplier, customer, cashier and original payment-method filters. Sale-line rounding and return reversal use the R004 ledger method. Paged detail and CSV/Excel/PDF exports are available; cashier cost/profit protection remains enforced below the UI.

## Verification

- An isolated fixture posts a tablet and syrup under the same saved generic, then verifies one combined group and exact agreement with Daily Sales. Generic search, CSV heading, Excel saved group and PDF signature passed. A linked desktop fixture with no saved generic verifies the explicit fallback group and Rs 100 net sales.
- Affected Jest suites: 22/22 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R005 reports, generic CSV save/read and B02/B03/B04 regression.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statements, owner accounting approval and release gates remain pending.
