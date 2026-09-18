# P032 Modern Batch Live-Stock Screen

Status: completed, accepted and pushed in commit `3985519` on 2026-09-18. The canonical tracker is updated.

## Delivered

- Inventory navigation is enabled for pharmacist, manager and admin roles through `inventory.view`.
- Batch-level search, stock-status filtering, expiry filtering and 25-row pagination.
- Physical stock remains visible for expired batches while sellable stock is forced to zero.
- Stock status shows in-stock, low-stock, out-of-stock, expired or near-expiry state.
- Batch detail shows product and supplier traceability, manufacturing/expiry dates, quantity history and the latest 100 inventory movements.
- Effective cost and estimated stock value are returned and rendered only when the user has `report.cost`.
- The existing SQLite batch, receipt and movement records remain authoritative; the screen does not create or mutate stock.

## Verification

- Targeted Jest service test: 1 passed.
- Targeted modern gateway test: 1 passed.
- TypeScript and Vite production build: passed.
- Isolated Electron E2E: 1 passed in 7.3 seconds (11.9 seconds total runner time).
- Visual evidence: `modernization/evidence/inventory-live-stock.png`.

Per the owner decision on 2026-09-18, a single successful E2E run is sufficient for new work. Regression is limited to the changed module and directly affected flows; unrelated previously accepted modules are not repeatedly rerun.

## Boundaries

- P032 is read-only inventory monitoring. Opening stock, imports, adjustments/disposal and purchases remain P033-P036.
- Full master acceptance and release gates remain separate from this package-level test.
