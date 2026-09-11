# SQLite foundation

This module is intentionally parallel to the existing NeDB implementation. It must not become the production default until importer reconciliation and repository contract tests are complete.

## Responsibilities

- `database.js` opens SQLite safely, enables foreign keys/WAL, and applies numbered migrations atomically.
- `migrations/` contains immutable, ordered schema migrations.
- `repositories/` contains persistence adapters without UI or Electron dependencies.

## Rules

- Never edit a migration after it has shipped; add the next numbered migration.
- Store money as integer minor units.
- Store ISO dates as `YYYY-MM-DD` and timestamps as UTC ISO-8601 strings.
- Allocate sellable batches using FEFO and exclude expired/zero-stock batches.
- Post purchases, sales, returns, batch balances, and inventory movements inside one SQLite transaction.
- Back up NeDB data before every migration rehearsal and retain reconciliation reports.

## Electron integration

`better-sqlite3` is a native dependency. Before wiring this module into the Electron main process, rebuild native modules for the exact Electron version using Electron Forge's rebuild lifecycle and verify the packaged Windows application. Node-only tests are not sufficient evidence of Electron ABI compatibility.
