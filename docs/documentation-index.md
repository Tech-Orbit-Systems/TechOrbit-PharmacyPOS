# Documentation ownership and precedence

1. Latest explicit user decision, recorded in the master tracker.
2. Master delivery tracker: `D:/TechOrbit/PharmacyPOS/docs/outputs/pharmacy-pos-tracker-20260913/TechOrbit_PharmacyPOS_Master_Development_Tracker.xlsx`.
3. Functional requirements: workspace `docs/master-specification.md`, with `specification-alignment.md` and subsequent approved design/feedback notes.
4. Current versioned implementation: `source/docs/architecture.md`, `roadmap.md`, package-specific evidence, and actual source/tests.
5. Dated changelog/test entries and `source/docs/history/` are historical records; newer evidence supersedes their status claims without deleting them.

The workspace-level early audit/architecture/roadmap copies are historical and are not an independently maintained status source. Use this index and current versioned docs instead. Do not maintain competing 'latest' trackers.

## P005 verification

- Compared modern launcher/preload/gateway with legacy runtime entries, migration files and current tracker.
- Corrected legacy-versus-review data/transport description, completed import foundations, approved UI status and remaining release work.
- Preserved old architecture/roadmap documents under history for traceability.
- Retained P055/P057 correctness gaps, physical printer limits, scheduler/configuration backup gaps and production-cutover prohibition.
- Documentation-only change: no application or operational database mutation. Repository diff/check and referenced-path verification accompany this package; prior b8a749e tests remain dated evidence, not a newly run test claim.
