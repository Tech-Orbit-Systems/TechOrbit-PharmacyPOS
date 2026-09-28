# R015 Purchase Report development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Purchase Report reads posted purchase headers and verifies saved item totals. It separates payment at receiving from later supplier payments, linked supplier returns, payable credit/refund, current balance, net purchased value, purchased base units and bonus base units. The payment and credit equation must reconcile to each current purchase balance.
- Date with official closing day or Pakistan calendar option, supplier and product/SKU/generic/current category/brand filters, paged invoice detail and native CSV/Excel/PDF exports are available. Product filters select whole purchases containing a matching line. The scope states that linked returns and current balances include later activity. Access requires cost-report permission.

## Verification

- A two-purchase fixture with actual later payment and two supplier returns reconciled Rs 12 posted purchases, Rs 6 linked returns, Rs 6 net purchases, Rs 2 paid at receiving, Rs 6 later paid and zero current payable. One bonus base unit appeared separately from twelve purchased base units. Product filtering, pagination and CSV/Excel/PDF output signatures passed.
- Affected Jest suites: 32/32 passed; modern integration 25/25 passed; TypeScript/Vite production build passed. All 23 sequential isolated Electron desktop flows passed, including B02–B04 and R001–R014 regression. The linked purchase report reconciled Rs 100 purchase, Rs 10 supplier return, Rs 90 net purchase, Rs 20 receiving payment, Rs 30 later payment and Rs 40 current payable, then saved/read back CSV. Cashier access was denied.

These are development checks. Formal manual QA Run 1/2/3, actual supplier statements and owner accounting approval, and release gates remain pending.
