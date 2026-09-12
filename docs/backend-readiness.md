# Backend Readiness Gate

Date: 2026-09-13

## Ready before UI design

- SQLite pharmacy schema and numbered migrations through `011_stock_adjustments.sql`.
- Product master and batch-aware opening stock imports.
- FEFO sales, purchases, supplier/customer accounts, returns, expenses, stock adjustments and disposals.
- Cash shifts, variance closing and immutable six-month closing snapshots.
- Signed v2 sessions, strong password change, role permissions and local-origin CORS.
- Verified SQLite backup, checksum manifest, integrity check, retention and offline restore rehearsal.
- Inventory, payable, receivable and foreign-key reconciliation report.

## UI integration contract

The final UI must call v2 APIs and must not contain business or SQL logic. During UI migration, enable `TECHORBIT_V2_AUTH_REQUIRED=1`, store the signed session only in the secure desktop process, attach `Authorization: Bearer <token>`, and force temporary users through password change before other actions.

## Deliberately deferred

- Visual design system, navigation, forms, tables and dashboards.
- Printer-specific UI and physical-printer acceptance testing.
- Signed installer, updater and production deployment are release work after UI acceptance.
- Live NeDB cutover must use a customer backup and reconciliation rehearsal; it is not performed against current user data automatically.
