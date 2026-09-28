# R011 GST Report development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- GST Report groups posted medicine lines and linked returns by the sale's saved GST rate, with Exempt and zero-value unverified groups kept separate. It displays sales GST, return GST, net GST and taxable base. Return GST reverses the original line's rate and value; invoice rounding continues to follow saved sale-line allocation.
- Official closing day or Pakistan calendar date, product, generic, category, brand, recorded supplier, customer, cashier and original payment filters are available. Paged detail, permission-safe cost/profit, and native CSV, Excel and PDF exports are included.

## Verification

- A mixed taxable/exempt two-medicine sale reconciled group GST and net sales to Daily Sales. A separate 10% GST fixture checked Rs 1.00 sale GST, Rs 0.50 linked return GST and Rs 0.50 net GST with Rs 5.00 taxable base. The cashier gateway hid COGS in GST rows and CSV.
- Affected Jest suites: 23/23 passed; modern integration 25/25 passed; TypeScript/Vite production build passed. The isolated Electron linked workflow passed with CSV, Excel and PDF GST exports and prior B02–B04/R001–R010 flows. The broad desktop suite passed 22/23, with the linked workflow then passing individually after increasing its Excel export wait for a slow host run. Older POS test fixtures were updated for mandatory warning acknowledgement/cash tender, and a B02 settlement fixture was moved after its purchase timestamp; each affected flow passed individually.

These are development checks, not statutory filing approval. Formal pharmacy tax statement reconciliation, owner signoff, three-run manual acceptance and release gates remain pending.
