# Roadmap

## Phase 0 — Clean baseline

- Preserve MIT attribution and upstream remote.
- Make original application launch reliably with npm-based setup.
- Capture deterministic smoke-test evidence and add API integration tests.
- Document data locations, backup/restore behavior, and security risks.

## Phase 1 — SQLite foundation (complete)

- Select a maintained SQLite driver compatible with the supported Electron/Node runtime.
- Create numbered migrations and the pharmacy schema described in `architecture.md`.
- Add foreign keys, unique constraints, indexes, checks, and transaction helpers.
- Implement repository contracts and tests for Products, ProductBatches, Purchases, InventoryMovements, Sales, and SaleItems first.

Completed foundation: migration runner, Products, Suppliers, ProductBatches, Purchases, PurchaseItems, InventoryMovements, repositories, purchase receipt transaction, and packaged native SQLite verification.

## Phase 2 — NeDB migration (dry-run foundation complete; production cutover blocked)

- Build a dry-run importer with record counts, rejected-row report, and checksums.
- Map legacy product quantity/expiry into initial batches and opening-balance movements.
- Reconcile sales totals and stock before cutover.
- Produce rollback and restore instructions.

Before production rehearsal, correct the legacy `stock` flag mapping and expand the schema for the finalized product, unit, batch-receipt, costing, and accounting requirements in `master-specification.md` and `specification-alignment.md`.

## Phase 2A — Domain schema expansion (complete)

- Expand Product Master and configurable units/base-unit conversions.
- Separate physical batches from purchase receipt lots for traceability, bonus stock, effective cost, and supplier returns.
- Add Users, Roles, Permissions, Settings, AuditLog, Payments/MoneyMovements, Receivables, and Payables.
- Add idempotency keys and posted/reversed transaction states.
- Update the importer and contract tests before any live-data migration.

## Phase 3 — Pharmacy operations

Backend increments completed: supplier payable settlement, supplier purchase returns, expense ledger, cash shifts and rolling six-month period closing. Front-end implementation is intentionally parked pending the dedicated UI/UX discussion.

- Supplier and purchase receiving workflows.
- Batch/expiry/FEFO stock handling.
- Returns, expenses, cash shifts and closing.
- Role-based permissions and immutable audit log.

Current increments completed: atomic sales/catalog APIs, default-off counter wiring, and the Product Master XLSX bulk-import backend (template, preview, validation, duplicate policy, atomic commit, errors, audit, and 5,000-row test). Legacy NeDB remains the default. Next increment: build the admin Product Import wizard and downloadable error report, then implement the separate batch-aware Opening Stock import workflow.

## Phase 4 — Security and reliability

- Remove default password, harden Electron context isolation, narrow CORS, validate all API inputs.
- Dependency upgrade program and automated backup/restore verification.
- Integration and end-to-end test suite, printer adapter tests, crash recovery.

## Phase 5 — UI modernization

- Establish design tokens and reusable components after workflows and schema are stable.
- Redesign incrementally without changing domain behavior.
- Optimize keyboard and barcode-scanner operation for pharmacy counters.

## Phase 6 — Release

- Signed Windows installer, versioned migrations, release notes, support runbook, and disaster-recovery rehearsal.
