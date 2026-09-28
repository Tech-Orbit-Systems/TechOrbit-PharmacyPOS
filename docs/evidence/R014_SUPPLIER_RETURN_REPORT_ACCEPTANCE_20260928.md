# R014 Supplier Return Report development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Supplier Return Report reads posted purchase returns and original purchase/batch links. It separates returned stock value, reduction of the outstanding supplier payable and actual refund received. Payable credit/refund are allocated across saved return lines by line value, and unfiltered lines must reconcile to each return header.
- Date with official closing day or Pakistan calendar option, supplier, product/SKU, generic, current category/brand and original batch filters, paged detail and native CSV/Excel/PDF exports are available. Access requires the cost-report permission; cashier access is denied.

## Verification

- An actual posted supplier return of Rs 4 reduced the payable; after the remaining Rs 6 was paid, a second Rs 2 return recorded an actual bank refund. Report totals were Rs 6 returned stock value, Rs 4 payable credit and Rs 2 refund, with six units removed from the original batch. Money movement, payable balance, filters, paging and CSV/Excel/PDF output signatures passed.
- Affected Jest suites: 31/31 passed; modern integration 25/25 passed; TypeScript/Vite production build passed. All 23 sequential isolated Electron desktop flows passed, including B02–B04 and R001–R013 regression. The linked supplier return report showed the original purchase and supplier, reconciled Rs 10 return/payable credit, and saved/read back CSV.

These are development checks. Formal manual QA Run 1/2/3, actual supplier statements and owner accounting approval, and release gates remain pending.
