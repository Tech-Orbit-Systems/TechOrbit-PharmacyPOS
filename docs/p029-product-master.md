# P029 Modern Product Master — 2026-09-13

## Delivered scope

Products navigation now opens the SQLite-backed searchable, paged list and create/edit editor. Supports permanent IDs, leading-zero optional unique barcode, generic/manufacturer/category/type/form/strength/pack description, base unit and selling prices, stock thresholds, supplier, prescription/controlled flags, GST state, notes and active status. Deactivation preserves records and excludes new barcode sales. Duplicate names require explicit confirmation. Product management uses the existing settings.manage permission.

Writes are transactional with audit records, retry-safe creation references, stale-edit rejection and a locked existing base unit. Matching base/strip/box price definitions remain coherent. Conflicting base-versus-pack prices are rejected when those refer to the same unit.

## Verification

- Root regression: 31 suites, 99 tests passed.
- Modern build: TypeScript + Vite passed.
- Modern automated regression: 8 tests passed, including P029 validation, duplicate handling, pagination, permission rejection, stale edits, retry mismatch, audit-failure rollback and base-unit/price protections.
- Actual Electron regression: 2 tests passed on final run (26.8 seconds). Existing dashboard/POS checks retained. P029 creates, reopens, edits and deactivates three distinct products, preserving their inactive records. These repetitions are not a signoff of all 85 master acceptance scenarios.
- Light editor and dark list screenshots visually inspected. Evidence in modernization/evidence/products-light.png, products-dark.png and product-editor-light.png.
- First product E2E failed because its final assertion expected inactive products after remounting the default active list. Test now selects All products explicitly. Final rerun passed.
- Review identified the strip/box base-price conflict and added validation plus tests. Final rerun passed.

All runtime fixtures use isolated test databases. No production DB, existing user cart, JaniWheels project or license notices were modified.

## Boundaries and next package

This completes the list/editor package, not production readiness. P030 remains pending: editable per-product ratios, default sale unit, manual/derived prices and fractional/sealed-unit policy. Product creation does not add stock or costs. Opening stock, inventory, imports and purchases remain separate tracker packages. Actual manufacturer pack values must be supplied/verified before production migration, not guessed from demo data. No full master three-run or hardware acceptance is claimed.
