# P033 Opening-Stock Manual And Import UI

Status: completed, accepted and pushed in commit `36b449d` on 2026-09-18. The canonical tracker is updated.

## Delivered

- Opening stock is a separate Inventory workflow rather than a product or purchase field.
- Manual entry supports active-product search, configured units, entry date, medicine batch/expiry, quantity, unit cost and notes.
- Excel and CSV files use the existing opening-stock contract with a downloadable XLSX template.
- Every manual or file submission creates a persisted preview job before commit.
- Preview shows matched product, batch, normalized expiry, entered quantity, converted base quantity, unit cost and row errors.
- `MM/YYYY` expiry values normalize to the last day of that month.
- CSV parsing preserves identifiers such as leading-zero barcodes as text.
- A product becomes opening-stock locked only after that same product has an inventory movement.
- Commit is atomic, creates no purchase/payable, records the opening quantity on the batch, writes an inventory movement and records manual/import audit actions separately.
- File size is limited to 4 MB and desktop IPC keeps the existing request-size restriction for other commands.

## Verification

- Targeted opening-stock Jest suite: 3/3 passed.
- Targeted modern desktop gateway test: 1/1 passed, including manual entry, CSV leading-zero preservation, template generation, locking and role denial.
- TypeScript and Vite production build: passed.
- Isolated Electron E2E: 1/1 passed; the desktop flow completed in 6.7 seconds.
- Visual evidence: `modernization/evidence/opening-stock-preview.png`.

## Boundaries

- P033 does not create supplier purchases or payables.
- Product-master import remains P034; adjustments/disposal remain P035; purchases remain P036.
- Final release acceptance remains a separate gate.
