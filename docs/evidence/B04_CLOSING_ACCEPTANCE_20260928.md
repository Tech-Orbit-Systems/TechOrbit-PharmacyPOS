# B04 closing verification — 28 September 2026 (Pakistan time)

Scope: P055–P058 on isolated SQLite databases. No operational data or live cutover was used.

## Independent linked-book control totals

The same synthetic pharmacy books include a part-paid purchase, Cash/Card/Digital and full-credit sales, a due collection, a customer refund/restock, a supplier payment and return, an incurred expense and vendor settlement, and one referenced savings transfer. Expected figures were calculated from those transactions before comparing with the application's stored results:

| Control | Expected, paisa | Verified result |
| --- | ---: | --- |
| Opening cash | 10,000 | 10,000 |
| Cash receipts less cash payments | 2,500 | 2,500 |
| Counted and expected cash | 12,500 | 12,500 |
| Bank net | -3,000 | -3,000 |
| Wallet net | 1,500 | 1,500 |
| Gross sales | 12,000 | 12,000 |
| Customer returns | 2,000 | 2,000 |
| Net sales | 10,000 | 10,000 |
| COGS after return | 5,000 | 5,000 |
| Gross profit | 5,000 | 5,000 |
| Incurred expenses | 2,500 | 2,500 |
| Operating profit | 2,500 | 2,500 |
| Purchases / supplier return | 10,000 / 1,000 | 10,000 / 1,000 |
| Actual savings transfer | 700 | 700 |
| Customer / supplier / vendor due | 2,500 / 4,000 / 1,000 | 2,500 / 4,000 / 1,000 |
| Remaining batch stock | 4 units | 4 units |

The original daily close retains counted cash of 12,500 paisa. A signed recount revision records 12,450 paisa and a -50 paisa variance without replacing the original. The desktop flow rejects official close while digital movements are unresolved, allocates them to configured accounts, closes the day, and verifies both snapshots after restart. The period flow tests configurable official closure, Pakistan cutoffs, a late expense revision, CSV Save dialog/readback, history, and restart.

## Three independent Electron runs

`modernization/e2e/closing-linked-golden.spec.cjs`, `closing-workflow.spec.cjs`, and `closing-period.spec.cjs` were run with `--repeat-each=3`. Every execution created a fresh temporary SQLite database. The [machine-readable Playwright result](b04-three-run-20260928.json) records start times, durations and pass status for each repetition.

| Scenario | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Linked books, official close, reasoned revision, restart | Passed 6.176 s | Passed 4.623 s | Passed 4.642 s |
| Shift/day configuration, digital allocation, revision, restart | Passed 5.037 s | Passed 4.870 s | Passed 4.902 s |
| Six-month close, custom range, late correction, export, restart | Passed 4.030 s | Passed 3.765 s | Passed 4.434 s |

Playwright totals: 9 expected, 9 passed, 0 skipped, 0 unexpected, 0 flaky; elapsed 45.392 s. The linked-book control is also exercised by `tests/cash-closing.test.js`. B02 accounts and B03 returns desktop regressions are run separately in the final package gate.

Final package gate: closing Jest 10/10, modern integration 24/24, TypeScript/Vite build, and six sequential isolated Electron E2E tests including B02/B03 regression passed. An earlier build-plus-Electron parallel run timed out before the login screen in one desktop case; rerunning the complete desktop suite after the build produced 6/6 passes.

These are automated desktop and developer-calculated fixture runs. They do not certify an external pharmacy's bank statements, physical hardware, the remaining master test scenarios, or go-live. Manual QA/owner accounting signoff remains a release gate.
