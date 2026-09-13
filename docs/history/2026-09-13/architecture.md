# Architecture

## Current system

Electron starts a local Express server. The renderer calls HTTP endpoints for inventory, customers, categories, users, settings, and transactions. Each module owns a NeDB file under the application data folder. Checkout inserts a transaction and then decrements product quantity.

## Target boundaries

- `desktop`: Electron lifecycle, secure preload bridge, windows, updates, printing, backup/restore.
- `ui`: presentation only; no direct database or Node access.
- `application`: use cases such as receive stock, sell, return, close shift, and reconcile cash.
- `domain`: pharmacy rules, money/quantity types, batch allocation, expiry checks, permissions.
- `infrastructure`: SQLite repositories, migrations, filesystem backup, printer adapters.

## Target SQLite schema

The initial migration must implement these tables before UI work:

- Products
- ProductBatches
- Suppliers
- Purchases
- PurchaseItems
- InventoryMovements
- Customers
- Users
- Sales
- SaleItems
- Returns and ReturnItems
- Expenses
- CashShifts and CashClosings
- Settings
- AuditLog

## Critical invariants

- Stock is derived from immutable InventoryMovements, reconciled against batch balances.
- Every sale item references a product and, where applicable, a batch.
- Batch allocation defaults to FEFO (first-expiry-first-out) and never sells expired stock.
- Purchase receiving, sale posting, return posting, and cash closing each run in one SQLite transaction.
- Money is stored as integer minor units; quantities use an explicit precision policy.
- Posted financial records are reversed, not edited or deleted.
- AuditLog records actor, action, entity, timestamp, device, and before/after metadata.

## Migration strategy

Introduce a repository interface beside NeDB, add SQLite schema migrations, then build a one-time validated importer. Run both implementations against contract tests before switching the default. Keep a read-only copy of source NeDB files in `backups/` during every migration rehearsal.
