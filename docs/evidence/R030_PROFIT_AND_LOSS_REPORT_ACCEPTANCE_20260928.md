# R030 Profit and Loss Report acceptance - 2026-09-28

Final catalogue acceptance reuses P059 accrual calculations: saved sales less GST and returns, sold batch COGS less returned COGS, then incurred posted expenses. Purchases, later dues settlements and savings do not recognize new income/expense. Pakistan calendar date ranges, page validation, cost permission and native CSV/Excel/PDF remain. Exports now check detail gross/GST/COGS/contribution against summary, and CSV includes GST/discount/rounding scope. Incomplete custom dates clear stale UI totals and disable exports. Zero page/page-size is now rejected in P&L and recent shared account/settlement/closing report paging.

## Evidence

- Affected Jest final retest 31/31 passed. Independent linked detail contributions sum to 2500 operating profit, with exactly one incurred expense and no settlement/purchase/savings rows. Empty period and invalid page are checked; existing GST fixture reconciles net GST/revenue and return COGS.
- Modern integration 26/26 passed with cost/profit permission denial.
- TypeScript/Vite build passed.
- Sequential isolated Electron accounts and linked closing/P&L regression 2/2 passed. Incomplete custom dates cleared old operating-profit row and disabled export; final period shows 100 net revenue, 25 expense and 25 operating profit; native CSV/Excel/PDF readbacks passed after restart.

Formal manual three-run QA, actual-pharmacy owner accounting reconciliation and all release gates remain Open.
