# Pharmacy POS master specification

This is the concise versioned development specification. The detailed requirement register and delivery state remain in the canonical master tracker. The fuller functional baseline is `../docs/master-specification.md` at the workspace level, interpreted with later approved decisions in this repository.

## Purpose and operating model

TechOrbit Pharmacy POS is a standalone Windows desktop application for one pharmacy, one local PC, and a local database. Cloud, multi-PC, and multi-branch synchronization are outside V1. The product must support the complete day-to-day pharmacy workflow while keeping financial, inventory, security, and audit data durable after restart.

## Current technology

- Electron desktop runtime.
- Modern UI: React 19, TypeScript, and Vite in `modernization/`.
- Legacy UI/runtime: HTML, jQuery, local Express API, and NeDB.
- Target persistence: SQLite through `better-sqlite3`, numbered migrations, foreign keys, WAL, repositories, and transactional services.
- Modern desktop transport: sandboxed preload/IPC gateway and worker. The review database is isolated from operational data by default.

The legacy and modern paths currently coexist. The modern review launcher is not yet the production replacement or signed installer.

## Roles and security

Supported roles are Admin, Cashier, Pharmacist/Forms Manager, and other standard users as defined by the permission register. Authorization must be enforced below the UI. Temporary passwords require change on first login. Passwords are hashed. Sensitive cost/profit fields and controlled actions require explicit permission and audit records.

## Products, units, barcode, and pricing

- A medicine/product has a permanent identity, optional unique main barcode, SKU, generic/brand details, strength, dosage form, GST state, active state, and pharmacy fields.
- Packing is product-specific. Box, strip, and base/loose units use explicit integer conversion factors. There is no universal manufacturer ratio.
- The main barcode may identify the configured default sale unit. Manual search supports strip/tablet sale where required.
- Posted history preserves the sold unit, quantity, price, discount, tax, and conversion snapshot. Packing changes must not rewrite history or silently rebase stock.
- Automatic derived pricing and authorized manual price adjustment are supported. Cashier discount limits, line discount, invoice discount, taxable amount, GST, and final whole-PKR rounding must be enforced and persisted.
- Money is stored as integer paisa. A final rounding adjustment must be explicit and independently reconcilable.

## Inventory, purchases, and suppliers

- Stock is batch-based with physical and sellable quantities, expiry, purchase attribution, actual cost, and immutable movements.
- FEFO selects the earliest valid batch. Expired stock remains physically visible but is not sellable.
- Negative stock is rejected unless an explicit approved rule says otherwise.
- Purchases record supplier, invoice, items, batches, bonus/free quantities, effective cost, paid amount, payable, money movement, and audit in one transaction.
- Supplier balances support partial and final payments, idempotency, overpayment protection, returns/credits, and ledger reconciliation.
- Opening stock is separate from purchases, creates no payable, and becomes locked per product after subsequent history. Controlled adjustments require reason, actor, and audit.

## Sales, customers, returns, and receipts

- POS supports barcode/search, unit choice, quantity, FEFO preview, held sale, Cash/Card/Digital, full or partial credit, warning acknowledgement, and immutable receipt retrieval.
- Cash sales require tendered amount and record change without overstating money received. Credit requires a saved customer and approved identity/due fields.
- A posted sale atomically writes sale snapshots, stock allocation/movements, COGS, receivable, collected money, and audit. Duplicate or uncertain retries must not create a second sale.
- Customers support balances, partial collections, remaining dues, history, and reconciled ledgers.
- Returns must reference valid posted quantities, restore eligible stock to the correct batch, reverse COGS/tax/receivable or money effects correctly, and retain audit history.
- Historical search and reprint must use saved invoice snapshots, not current product settings. The target is a readable 80mm receipt with customer and pharmacy copies and no unnecessary batch detail.

## Expiry, schemes, reports, and closing

- Expiry warnings and sale restrictions use normalized local dates and batch validity.
- Free-item schemes such as Buy 10 Boxes Get 1 Free must preserve purchased versus bonus quantity and effective cost. Any sale promotion rules require separate approved behavior.
- Reports must reconcile sales, returns, discounts, GST, COGS, expenses, profit/loss, stock, customer dues, supplier payables, cashier/shift activity, and period boundaries.
- Daily closing separates cash, bank, and wallet flows and preserves cashier/shift attribution, handover, counted cash, variance, official closing, and reasoned revisions.
- Six-month and custom reporting must use Pakistan-local cutoffs and must not equate revenue, profit, cash, earnings, and savings.

## Reliability and release acceptance

- Critical workflows require realistic isolated data, calculation checks, database checks, related-screen/report checks, restart persistence, an invalid case, and regression of affected features.
- Production migration requires backup, mapping, dry run, rejected-row review, stock/financial control totals, reconciliation, and demonstrated rollback.
- Final acceptance requires three documented runs of each required scenario, physical scanner and 80mm printer evidence, four-role access checks, backup/restore and fault recovery, performance/DPI checks, a signed modern installer, pilot, and explicit go-live approval.

Use `docs/TEST_SCENARIOS.md` for the concise test catalogue and the tracker `Test Matrix` sheet for authoritative scenario IDs and run status.
