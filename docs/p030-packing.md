# P030 Packing and prices — 2026-09-13

## Delivered

Products rows open a packing editor. Each configured unit has its base-quantity multiplier, explicit selling price, default-sale flag and fractional policy. Ratios are expressed against the permanent product base unit; no manufacturer values are inferred. Box/strip/pack and custom units share the product barcode. The POS uses the saved default and supports the configured unit selector.

Select a price source (for example box), enter its ratio and price, and use Calculate other prices. The displayed unit prices are calculated proportionally and rounded to whole PKR. They remain editable before save. This is an explicit calculator, not a persistent formula link: recalculate after changing a ratio or source price. Packing saves also round prices to whole PKR. Existing general Product Master/import price precision is not silently rewritten; cross-workflow pricing/rounding acceptance remains with P037 and import packages.

Only settings.manage roles may read/write packing. Server validation requires unique names, a base multiplier of exactly one, one default, bounded positive multipliers, valid nonnegative prices and boolean policies. Recognized sealed unit names (including compound names ending in pack/box/etc.) and capsules reject fractional sales. Custom dispensing-unit policies must be configured responsibly; product-specific clinical suitability is not inferred from unit names.

Any batch, movement, sale item or purchase item locks existing unit names and multipliers. New units, default selection and future prices can be configured without rebasing recorded stock. Saves are transactional, audited and reject stale editors. Historical sale snapshots are not repriced.

## Verification

- TypeScript/Vite build passed.
- 9 modern automated tests passed. P030 checks stock conservation, posted base quantity, immutable old sale price snapshot, stale edits, locked history, duplicate units, sealed/fractional rejection, role checks and complete rollback on audit failure.
- 3 actual Electron tests passed (20.7 seconds): prior Dashboard/POS, P029 product repetition and P030 packing-to-sale flow.
- P030 E2E calculates 20-sachet bulk pack PKR 900, existing 100-sachet box PKR 4500, persists configuration, selects the new default on barcode scan and reaches posted receipt.
- Root regression rerun: 31 suites / 99 tests passed (39.699 seconds).
- Screenshot review found horizontal overflow. Widened dialog and constrained grid columns; final E2E explicitly checks no horizontal overflow. Light and dark screenshots visually reviewed in modernization/evidence/packing-light.png and packing-dark.png.
- No live data or user cart was touched. No schema migration was necessary. Demo ratios remain examples; production mapping is a separate owner-verified task.

## Remaining

P031 generic alternatives is next. Full master three-run signoff, import pricing consistency, production pack mapping, hardware checks and release approval remain pending. This package does not approve clinical substitutions or production readiness.
