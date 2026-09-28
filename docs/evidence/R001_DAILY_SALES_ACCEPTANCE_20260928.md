# R001 Daily Sales development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Tests used isolated SQLite review databases. No live pharmacy data or cutover was used.

## Delivered contract

- Daily Sales groups posted invoices and linked returns by official closing day by default. A separate Pakistan calendar date view is selectable. A sale after midnight remains on the still-open official day; historical events without a matching BusinessDay fall back to Pakistan calendar date.
- Date, product/SKU, category, brand/manufacturer, recorded batch supplier, customer name/phone, cashier and payment method filters select whole invoices and their linked returns. Category and brand read current product metadata; supplier reads the recorded sold-batch attribution. The report displays this filter scope.
- Daily totals and paged detail show invoiced sales, returns, net sales, GST, net ex-GST, discount, original paid-at-sale, credit created, refund, receivable credit, net batch COGS and gross profit. Later customer collections do not inflate paid-at-sale. Cost and profit require `report.cost`; a cashier with invoice search permission can view sales without these values. Exports follow the same permission and filters.
- Native Save dialogs export CSV, Excel and PDF. CSV and Excel include full filtered detail and relevant totals. PDF shows filtered entries and net sales totals; it is a compact print summary.

## Reconciliation and verification

- The linked pharmacy fixture independently expects Rs 120 posted sales, Rs 20 returns, Rs 100 net sales, Rs 50 net COGS and Rs 50 gross profit before incurred expenses. Original paid-at-sale is Rs 80 and credit created Rs 40 despite a later customer collection. Supplier, customer, product, category, brand, cashier and payment-method filters, escaped search and paging were asserted against source records. A separate GST/discount fixture expects Rs 13 final sale, Rs 1.94 GST, Rs 1.50 discounts, Rs 11.06 ex-GST sale, Rs 5.40 COGS and Rs 5.66 gross profit.
- A closed BusinessDay running from 2026-09-11 08:00 UTC to 2026-09-12 02:00 UTC contains a sale at 2026-09-11 21:00 UTC. The official view assigns it to September 11, while Pakistan calendar view assigns it to September 12, without duplicate counting.
- Affected Jest suites: 18/18 passed. Modern integration: 25/25 passed. TypeScript/Vite production build passed.
- Sequential isolated Electron E2E: linked report and export flow, B04 shift and period flows, B02 accounts and B03 returns regression: 5/5 passed. The linked desktop flow saved and read back CSV, Excel and PDF and verified the cashier role view.
- Linked desktop flow repeated three times with Playwright `--workers=1 --repeat-each=3`: 3/3 passed. Each repetition used a fresh temporary SQLite database.

This is development and automated desktop evidence. Formal manual QA Run 1/2/3, owner/accounting signoff against actual pharmacy statements, the wider acceptance campaign, hardware and go-live gates remain pending.
