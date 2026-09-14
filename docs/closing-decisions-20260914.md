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
