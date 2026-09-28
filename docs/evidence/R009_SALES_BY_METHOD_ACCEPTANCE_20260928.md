# R009 Sales by Payment Method development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Sales by Payment Method groups saved sale/return lines by the original invoice method: cash, card, digital or credit. Returns reduce that original method's net sales. Later receivable collections stay separate from new sale revenue, even if collected by another method; the report discloses this rule.
- Exact date and official/calendar day filters, product/generic/category/brand/recorded supplier/customer/cashier/method filters, paged line detail, invoice rounding, GST and COGS reconciliation, permission-safe cost/profit and native CSV/Excel/PDF exports remain available.

## Verification

- The linked pharmacy book has Rs 40 cash sales with Rs 20 returned, Rs 20 card, Rs 20 digital and Rs 40 credit. Net by original method is cash Rs 20, card Rs 20, digital Rs 20, credit Rs 40, totaling Rs 100, despite a later Rs 15 cash collection of credit dues. Method filter and cashier cost denial passed.
- Affected Jest suites: 23/23 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R009 reporting, method CSV save/read and B02/B03/B04 regression.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statement reconciliation, owner accounting approval and release gates remain pending.
