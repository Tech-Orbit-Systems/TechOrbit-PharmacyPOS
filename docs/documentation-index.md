# Documentation ownership and precedence

1. Latest explicit user decision, recorded in the master tracker.
2. Master delivery tracker: `D:/TechOrbit/PharmacyPOS/docs/outputs/pharmacy-pos-tracker-20260913/TechOrbit_PharmacyPOS_Master_Development_Tracker.xlsx`.
3. Functional requirements: workspace `docs/master-specification.md`, with `specification-alignment.md` and subsequent approved design/feedback notes.
4. Current versioned implementation: `source/docs/architecture.md`, `roadmap.md`, package-specific evidence, and actual source/tests.
5. Dated changelog/test entries and `source/docs/history/` are historical records; newer evidence supersedes their status claims without deleting them.

Codex entry points:

- `../AGENTS.md`: permanent repository rules and completion gate.
- `PHARMACY_POS_MASTER_SPEC.md`: concise versioned system specification.
- `PROJECT_STATUS.md`: latest concise audit/status summary.
- `TEST_SCENARIOS.md`: practical scenario catalogue; tracker run fields remain authoritative.

The workspace-level early audit/architecture/roadmap copies are historical and are not an independently maintained status source. Use this index and current versioned docs instead. Do not maintain competing 'latest' trackers.

## P005 verification

- Compared modern launcher/preload/gateway with legacy runtime entries, migration files and current tracker.
- Corrected legacy-versus-review data/transport description, completed import foundations, approved UI status and remaining release work.
- Preserved old architecture/roadmap documents under history for traceability.
- Retained P055/P057 correctness gaps, physical printer limits, scheduler/configuration backup gaps and production-cutover prohibition.
- Documentation-only change: no application or operational database mutation. Repository diff/check and referenced-path verification accompany this package; prior b8a749e tests remain dated evidence, not a newly run test claim.

## R013-R031 catalogue acceptance

Each report has its own committed/pushed implementation and acceptance record. Final checkpoint: financial Jest 31/31, modern integration 27/27, build and full sequential isolated Electron regression 23/23 passed. The canonical tracker owns completion dates, commits and formal release gates. P065 audit completeness remains separate from R031 reporting.

- [R013 acceptance](evidence/R013_CUSTOMER_RETURN_REPORT_ACCEPTANCE_20260928.md)
- [R014 acceptance](evidence/R014_SUPPLIER_RETURN_REPORT_ACCEPTANCE_20260928.md)
- [R015 acceptance](evidence/R015_PURCHASE_REPORT_ACCEPTANCE_20260928.md)
- [R016 acceptance](evidence/R016_SUPPLIER_PURCHASE_REPORT_ACCEPTANCE_20260928.md)
- [R017 acceptance](evidence/R017_BONUS_STOCK_SCHEME_REPORT_ACCEPTANCE_20260928.md)
- [R018 acceptance](evidence/R018_LOW_STOCK_REPORT_ACCEPTANCE_20260928.md)
- [R019 acceptance](evidence/R019_EXPIRY_REPORT_ACCEPTANCE_20260928.md)
- [R020 acceptance](evidence/R020_BATCH_STOCK_REPORT_ACCEPTANCE_20260928.md)
- [R021 acceptance](evidence/R021_STOCK_MOVEMENT_REPORT_ACCEPTANCE_20260928.md)
- [R022 acceptance](evidence/R022_STOCK_ADJUSTMENT_DISPOSAL_REPORT_ACCEPTANCE_20260928.md)
- [R023 acceptance](evidence/R023_STOCK_VALUATION_REPORT_ACCEPTANCE_20260928.md)
- [R024 acceptance](evidence/R024_CUSTOMER_RECEIVABLE_REPORT_ACCEPTANCE_20260928.md)
- [R025 acceptance](evidence/R025_SUPPLIER_PAYABLE_REPORT_ACCEPTANCE_20260928.md)
- [R026 acceptance](evidence/R026_VENDOR_PAYABLE_REPORT_ACCEPTANCE_20260928.md)
- [R027 acceptance](evidence/R027_OVERDUE_DUES_REPORT_ACCEPTANCE_20260928.md)
- [R028 acceptance](evidence/R028_DUE_PAYMENT_COLLECTION_REPORT_ACCEPTANCE_20260928.md)
- [R029 acceptance](evidence/R029_DAILY_CLOSING_REPORT_ACCEPTANCE_20260928.md)
- [R030 acceptance](evidence/R030_PROFIT_AND_LOSS_REPORT_ACCEPTANCE_20260928.md)
- [R031 acceptance](evidence/R031_AUDIT_LOG_REPORT_ACCEPTANCE_20260928.md)
