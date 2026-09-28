# R029 Daily Closing Report acceptance - 2026-09-28

Saved closed BusinessDays snapshots are reported with original/latest revision selection. Pakistan opening/actual-close date, closer and counter filters select whole days. Cash/account snapshot equations reconcile, original snapshot and revision reasons remain available, and open days are excluded. Totals sum variances, shifts and actual savings; daily closing cash balances are not summed into a new balance. Native CSV/Excel/PDF include snapshot details, bank/wallet amounts and shifts. Requires closing.create, consistent with authorized closing history; no cost/profit data is exposed.

## Evidence

- Affected Jest 31/31 passed: cross-midnight opening versus actual closing dates, original zero variance versus revised -100 minor, saved bank actual 12000, paging and CSV/Excel/PDF signatures.
- Modern integration 26/26 passed with revoked-closing-access denial below UI.
- TypeScript/Vite build passed.
- Sequential isolated Electron accounts, linked closing/restart/report and daily closing workflow regression 3/3 passed. Latest revision reason and saved CSV -50 minor variance, plus original revision 0 of 1, verified after application restart.

Formal manual three-run QA, actual-pharmacy owner reconciliation and all release gates remain Open.
