# B05 P059–P061 development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. All tests used isolated SQLite review databases. No live pharmacy data or cutover was used.

## Delivered contract

- P059: accrual P&L recognizes net revenue excluding GST at sale time, subtracts customer returns and reverses their saved GST and batch COGS, recognizes full posted expenses when incurred, and excludes purchases, later settlements and savings transfers from new income or expense. The report shows pre-discount listed sales, discounts, GST, rounding, invoice total, return, net COGS, gross profit and operating profit.
- P060: dashboard exposes the master business and stock KPI set, including month sales, cash/digital receipts, credit created, customer/supplier/vendor balances, overdue dues, refunds, expenses, stock and expiry values/counts, reorder and operating profit. Sensitive cost/profit and stock valuation require `report.cost`; vendor/dues data requires `dues.manage`. Related cards open Reports, Accounts or Inventory.
- P061: Reports has Pakistan-local date ranges, paged ledger entries, empty states, role enforcement below the UI, and native Save dialogs for CSV, Excel and PDF exports. Its range and entry contracts can be reused by later individual reports R001 onward; those reports are not claimed here.

## Independent calculation fixture

The linked pharmacy book posts a Rs 100 purchase of 10 units, Rs 120 sales across cash/card/digital/credit, Rs 20 customer return, Rs 15 customer collection, Rs 30 later supplier payment, Rs 10 purchase return, Rs 25 incurred utility expense with partial/later vendor settlement, and Rs 7 savings transfer. The independently expected accrual result is Rs 100 net revenue, Rs 50 net COGS and Rs 25 incurred expense, yielding Rs 25 operating profit. The purchase and subsequent settlements do not double count. A separate GST fixture checks Rs 11 invoiced sales, Rs 1 GST, Rs 5.50 return with Rs 0.50 GST and Rs 1.50 returned COGS; net ex-GST revenue is Rs 5 and operating profit Rs 2.50.

## Verification

- `npx jest tests/cash-closing.test.js --runInBand --silent`: 10/10 passed, including linked P&L/stock KPI and GST boundary assertions. Excel workbook reopened and operating profit cell checked; PDF signature checked.
- `node --test tests/*.test.cjs` in `modernization`: 25/25 passed, including denied cashier report/exports and hidden sensitive dashboard totals.
- `npm run build` in `modernization`: TypeScript and Vite passed.
- Sequential isolated Electron E2E: linked reporting plus B04 shift/period and B02/B03 regressions, 5/5 passed. The linked flow signs in, closes/revises, restarts, checks dashboard and P&L rows, and saves/reads CSV, Excel and PDF.
- Linked desktop flow repeated three times with Playwright `--workers=1 --repeat-each=3`: 3/3 passed. Each repetition calls `mkdtemp` and seeds its own SQLite database.

This is development and automated desktop evidence. Formal manual QA Run 1/2/3, owner/accounting signoff against actual pharmacy statements, the full 91-scenario campaign, hardware and go-live gates remain pending. P075 remains separate.
