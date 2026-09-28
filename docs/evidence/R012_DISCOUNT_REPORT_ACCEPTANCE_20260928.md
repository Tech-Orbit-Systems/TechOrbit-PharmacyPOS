# R012 Discount Report development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Discount Report shows posted line discounts, allocated invoice discounts, linked return reversals and net discounts by medicine. It reads immutable sale-line discount amounts. For each linked return, reversal is proportional to cumulative returned base quantity, so successive partial returns sum to the original discount without double counting.
- Date and official/calendar day, product, generic, category, brand, recorded supplier, customer, cashier and original payment filters are available. Paged sale/return detail and native CSV, Excel and PDF exports use the same permission-safe gateway; COGS and profit remain restricted.

## Verification

- A posted sale with Rs 0.30 line and Rs 1.20 invoice discounts reconciled to the Daily Sales Rs 1.50 discount amount. Two linked returns of 3 and 7 of the original 10 base units reversed Rs 0.45 then Rs 1.05. The full return left zero net discount, and CSV/Excel/PDF outputs were parsed or checked for valid file signatures.
- Affected Jest suites: 24/24 passed; modern integration 25/25 passed; TypeScript/Vite production build passed. All 23 sequential isolated Electron desktop tests passed, including B02–B04 and R001–R011 regression. The linked report flow saved and read back Discount Report CSV, Excel and PDF. Cashier gateway checks confirmed cost was hidden.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy discount policy/statement review, owner accounting approval and release gates remain pending.
