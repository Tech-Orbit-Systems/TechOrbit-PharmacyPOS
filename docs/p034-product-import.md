# P034 Product Import

Status: implemented and acceptance-tested on 2026-09-18.

## Delivered

- Product Master now opens an administrator-only import workflow from the Products page.
- A documented XLSX template can be downloaded from the workflow.
- XLSX and CSV files up to 8 MB and 5,000 rows are inspected before preview.
- Source columns can be mapped explicitly to the 24 supported product fields; exact template headers map automatically.
- Preview reports insert, update, skip, and error outcomes without changing product data.
- Existing barcode/SKU handling is selectable as error, skip, or update.
- Validation errors can be downloaded as a quoted CSV report.
- A clean preview commits products and sale units in one database transaction and records the import audit entry.
- CSV and XLSX text identifiers preserve leading zeroes.

## Acceptance evidence

- Backend import tests: 3 suites / 8 tests passed.
- Desktop gateway test: 1 test passed.
- TypeScript and Vite production build passed.
- Isolated Electron E2E: 1 test passed in 6.6 seconds, including mapping, preview, leading-zero barcode, commit, and Product Master search.
- Evidence image: `modernization/evidence/product-import-preview.png`.

## Operational notes

- Access requires the existing `settings.manage` permission.
- A preview with any validation error cannot be committed.
- Recommitting the same source file is blocked by its stored SHA-256 digest.
- No production database or live cutover was used during acceptance.
