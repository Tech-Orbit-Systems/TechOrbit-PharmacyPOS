# Closing decisions — 14 September 2026

Source: owner discussion followed by confirmation that there was no additional condition after the interrupted sentence. This records requirements, not completed implementation or release approval.

## Owner-confirmed direction

- Provide a separate Six-Month Closing navigation tab/module in the desktop app. Offer fixed period choices and custom date/time ranges, with historical information, charts and detailed values in the same module.
- Include detailed profit/loss, earnings and savings information. Exact savings/earnings definitions and the final fixed presets remain to be agreed; do not silently treat savings, revenue, profit and available cash as the same measure.
- One PC can be used by multiple cashiers in successive shifts. Each shift requires a cash handover, mostly automatic summary/carry-forward and a quick transition so the next cashier can continue. End the day with one official daily close.
- Daily closing must separate cash, bank and wallet amounts, with bank/wallet-wise breakdown rather than only an aggregate Digital total. Preserve the approved simple Cash/Card/Digital POS layout.

## Proposed implementation safeguards, not additional owner approvals

- Keep each transaction attributed to its original cashier/shift. Carry forward handover balances, not ownership of historical transactions.
- Recommend counted-cash entry, variance visibility and quick receiving-cashier confirmation. Exact confirmation/discrepancy and unclosed-shift policies remain open.
- Show sales, returns, discounts, GST, COGS, expenses and net profit/loss separately from cash/account balances, customer receivables and supplier payables. Confirm the report definitions before final accounting acceptance.
- Capture the destination bank/wallet through a minimal workflow; the precise selection/default mechanism and account list have not been approved. Avoid guessing an account from the Digital button. Card receipts and bank settlement must not be double-counted.
- Agree the time cutoff, exact presets, official closing snapshot/revision rules and savings formula before final closing implementation. Keep the existing Pakistan timezone requirement.

## Tracker impact and verification

D03, D04 and D20 record the approved direction while retaining unresolved sub-decisions. P055–P058 acceptance/next-action notes reflect it; their development statuses remain unchanged. No application code or live data changed. No new application test run or completion percentage increase is claimed.

## Owner clarification — 27 September 2026 (supersedes open policy questions above)

- Cashier enters counted cash. Every nonzero variance needs a reason. Up to and including Rs 50, the cashier may close without manager approval; above Rs 50, manager approval is mandatory. The amount is configurable per pharmacy.
- The next cashier sees the previous counted handover amount, counts it and confirms it. Original cashier and shift ownership remain unchanged. Official daily close waits until every shift is closed. A manager may force-close an unavailable cashier's shift with a counted amount and reason.
- Bank, wallet and savings accounts are a configurable, dynamic list for each pharmacy installation. Names and counts are never fixed globally. Cash/Card/Digital stays simple in POS; digital movements must be allocated to a configured bank or wallet before official close.
- A business day does not end at a fixed clock or midnight. It remains open until its official close; only then can the next business day begin.
- The six-month reporting cycle has a pharmacy-configurable start month. Do not assume a universal January–June and July–December cycle. The approved separate six-month module still needs fixed/custom range and history/chart acceptance.
- Earnings are operating profit shown separately from cash. Savings are only transfers actually recorded into a configured savings account, not an inferred remainder of profit.
- Official daily closing preserves its original snapshot. A manager's later revision requires a reason and keeps prior values. Release acceptance still requires end-to-end evidence and three documented runs.
