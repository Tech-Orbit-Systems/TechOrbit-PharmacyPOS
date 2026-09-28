# R013 Customer Return Report development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Customer Return Report reads posted customer returns and original invoice/medicine links. It shows returned value, GST reversal, cash refund, receivable credit, returned quantity, restocked quantity and non-sellable disposal quantity. Refund and receivable credit are allocated across return lines by saved returned value so line filters keep totals additive; unfiltered lines must reconcile to each saved return header.
- It offers official closing day or Pakistan calendar date, product/SKU, generic, current category/brand, recorded batch supplier, customer, original cashier and original payment filters, plus paged detail. COGS reversal requires cost permission. Native CSV, Excel and PDF exports are available.

## Verification

- Two actual posted returns on cash and credit invoices reconciled Rs 7.80 returned value to Daily Sales: Rs 2.60 cash refund and Rs 5.20 receivable credit. Restocked and non-sellable quantities were 2 and 4 base units. Saved GST reversal, filtering, paging and cashier cost redaction passed. An after-midnight return stayed on the open official day and moved to the next Pakistan calendar date in calendar view.
- Affected Jest suites: 26/26 passed; modern integration 25/25 passed; TypeScript/Vite production build passed. All 23 sequential isolated Electron desktop flows passed, including B02–B04 and R001–R012 regression. The linked return report showed the original invoice and saved/read back its CSV; Excel/PDF file generation passed automated signature checks.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy owner/accounting reconciliation and release gates remain pending.
