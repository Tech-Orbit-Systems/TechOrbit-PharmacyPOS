# Current architecture

Status reviewed 2026-09-13. The Excel master tracker is authoritative for delivery status. The prior architecture text is retained in `history/2026-09-13/architecture.md`.

## Two separate runtime paths

| Path | Entry and transport | Data | Release state |
| --- | --- | --- | --- |
| Legacy application | Root Electron entry `start.js`, local Express/HTTP and legacy renderer | Existing NeDB by default; additive v2 SQLite APIs and feature flags | Historical baseline, not replaced automatically |
| Modern review | `modernization/desktop/main.cjs`, sandboxed React renderer, named preload IPC, Node worker | Separate `review.sqlite3` by default | Dashboard/POS/appearance increment; not a production installer |

The review launcher does not import the legacy server. `TECHORBIT_UI_DATABASE` is an explicit alternate database override, not permission to cut over operational data. Do not use it with live data without an approved migration/backup/reconciliation procedure.

## Current boundaries

- React 19 / TypeScript / Vite render forms, tables and shared light/dark tokens.
- Electron disables renderer Node access and enables context isolation/sandboxing. A trusted-frame check and a named command allowlist restrict IPC.
- `modernization/desktop/gateway.cjs` authenticates, checks active users/password-change state/permissions and dispatches use cases inside a worker.
- Shared `infrastructure/sqlite/services` and repositories own domain validation, parameterized SQL, transactions and immutable financial snapshots. Business rules must not move into React.
- Legacy v2 HTTP endpoints use their own signed-session middleware. The modern IPC path calls the shared session-auth/domain services rather than attaching an HTTP bearer token. The final permission/transport security review remains P064/P074; an implementation distinction is not a security sign-off.

## Implemented database foundation

Numbered migrations 001–011 provide Products, ProductUnits, Suppliers, ProductBatches, BatchReceipts, Purchases/PurchaseItems, Sales/SaleItems/allocations, InventoryMovements, Customers, Receivables/Payables/MoneyMovements, Expenses, returns, users/roles/permissions, Settings/AuditLog, CashShifts and PeriodClosings. Daily digital reconciliation and revision requirements are NOT complete merely because shift/period tables exist.

SQLite uses foreign keys, WAL, indexes and transaction boundaries. Money is integer paisa with explicit final invoice rounding. Unit conversions retain original transaction units and quantities. Posted history is corrected through audited reversal/return/adjustment, not editing or deleting completed financial records.

## Verified and remaining

- Backend regression checkpoint: 31 suites / 99 tests. Review increment: 7 checks / 1 Electron E2E at b8a749e.
- Review UI supports chart ranges, barcode/search, units, held sales, Cash/Card/Digital, full/partial credit, add customer and live shift badge.
- Other modern operational screens, full receipts/hardware, recovery, daily digital/revised closing, corrected six-month totals, production data rehearsal and modern signed installer remain tracked work.
- P055: cash closing currently aggregates an inclusive time window without user/device ownership filtering. P057: six-month totals need Pakistan/as-of and return/tax reconciliation. These are not resolved by prior foundation tests.
- Backup helper/checksum/offline restore tests exist; scheduler/configuration archive and modern restore workflow remain pending.

## Source of truth

Master: `D:/TechOrbit/PharmacyPOS/docs/outputs/pharmacy-pos-tracker-20260913/TechOrbit_PharmacyPOS_Master_Development_Tracker.xlsx`.
Functional baseline: workspace `docs/master-specification.md` and `specification-alignment.md`, interpreted with later approved UI/POS decisions in this versioned docs folder. Read `documentation-index.md` for precedence.
