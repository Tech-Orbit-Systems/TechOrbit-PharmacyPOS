# Test Results

## 2026-09-13 - Pre-UI readiness gate

- Customer accounts/returns, stock adjustments, backup/restore, session security and reconciliation verified.
- Full regression result before final Windows package: 31 suites and 99 tests passed.
- Security enforcement is feature-gated until the final UI adopts signed v2 sessions.

## 2026-09-12 - Operations backend

- Supplier payments: partial/final payment, idempotency, overpayment rollback and ledger reconciliation verified.
- Purchase returns: source-line limits, available-stock protection, payable credit and atomic rollback verified.
- Expenses: post, idempotency, money out, controlled void, reversal and audit verified.
- Closing: cash ledger expectation, variance, duplicate close protection, six consecutive months and immutable period snapshot verified.
- Final regression: 24 suites and 88 tests passed before Windows packaging.

## 2026-09-12 - Import workflow

- Product Master: template, `.xlsx` validation, preview cap, complete CSV errors, duplicate policies and atomic commit verified.
- Opening Stock: medicine batch/expiry, date formats, configured units, base-unit conversion, product-specific lock, no purchase creation, movement, audit and rollback verified.
- Full suite before final package: 20 suites and 80 tests passed.

Date: 2026-09-11

## Environment

- Windows desktop
- Node.js 24.19.0
- npm 11.17.0
- Git 2.55.0
- PharmaSpot 1.5.3 from upstream `main`

## Automated

| Check | Result | Evidence |
|---|---|---|
| Dependency install | Pass | 1,321 packages installed with `npm ci` |
| Utility tests | Pass | 1 suite, 18 tests passed |
| Coverage output | Blocked | Restricted test process could not create `source/coverage`; assertions still passed |
| Dependency audit | Risk | 35 vulnerabilities: 5 moderate, 29 high, 1 critical |

## Launch

| Path | Result | Finding |
|---|---|---|
| `npm run start` | Blocked | Forge detects `yarn.lock`; Yarn is absent |
| Direct Electron | Blocked before UI | Express 5 rejects `express.all("/*")` |
| Baseline branch | Pass | Server started and listened on port 3210 after one-line Express compatibility fix |

## Core-flow smoke-test matrix

| Flow | Source verified | Interactive status |
|---|---:|---|
| Login/users/permissions | Yes | Default admin login passed; `/users/check` fails to end its response |
| Inventory/products | Yes | Disposable product created; quantity read back and updated |
| Barcode lookup | Yes | Exact disposable barcode lookup passed |
| Cart/paid/held transactions | Yes | Paid transaction persisted and stock reduced from 10 to 8; held flow source-verified only |
| Receipt/printing path | Yes | Pending physical-printer verification |
| Expiry fields and blocking expired sales | Yes | Field persisted, but slash characters are HTML-escaped and calculations do not unescape them; defect recorded |
| Customer create/edit/select | Yes | Create/list passed; lookup-by-ID failed due numeric/string ID mismatch |
| Settings | Yes | Endpoint reachable; detailed UI save remains pending |
| Backup/restore | Yes | Pending safe disposable-data test |

No production data was used. Disposable records have names prefixed `TechOrbit Smoke` / `Smoke Product` and a sale ID prefixed `SMOKE-`. Printing must first be tested with a PDF printer or preview, and restore only against disposable baseline data.

## SQLite foundation — 2026-09-11

- SQLite engine: 3.50.2 through `better-sqlite3` 12.2.0.
- Migration runner: passed first-run and reopen/idempotency checks.
- Schema constraints: unique barcode and product foreign key checks passed.
- FEFO: expired batches excluded and remaining batches ordered by earliest expiry.
- Combined test result: 2 suites, 23 tests passed.
- Electron ABI/package verification remains required before the SQLite adapter is connected to the running desktop app.

## Purchase, import, and packaging verification — 2026-09-11

- Purchase receiving: purchase header, item, batch, and movement commit atomically.
- Rollback: invalid product in any line leaves all four purchase/stock tables unchanged.
- Duplicate invoices: unique supplier/invoice constraint prevents duplicate stock receipt.
- NeDB dry-run: reports product, supplier, opening quantity, duplicate barcode, and invalid expiry results without writes.
- NeDB commit fixture: product count and batch quantity reconcile exactly with opening movements.
- Re-import safety: SHA-256 source checksum prevents importing the same source twice.
- Automated result: 4 suites, 30 tests passed.
- Packaging result: Windows x64 package created at `source/out/TechOrbit Pharmacy POS-win32-x64`.
- Packaged native check: SQLite 3.53.4 loaded successfully under Electron 37.10.3 / Node 22.21.1.
- Evidence: `test-evidence/packaged-sqlite-smoke.json`.
- Environment prerequisites installed: Yarn 1.22.22, Python 3.12, and Visual Studio 2022 C++ Build Tools.
- Dependency audit currently reports 36 issues (5 moderate, 30 high, 1 critical); no forced/breaking audit fix was applied.

## Domain expansion and conflict fixes — 2026-09-11

- Automated result: 7 suites, 43 tests passed.
- Product Master: expanded pharmacy fields, leading-zero barcode, duplicate barcode, duplicate active-name query, activation history, GST/exempt rules passed.
- Units: box/strip/base conversion, one default unit, and fractional policy passed.
- Batch receipts: repeat physical batch receipt and separate purchase-lot attribution passed.
- Purchases: bonus quantity, effective cost, full/partial/credit payment, payable, money movement, idempotency, audit, and rollback passed.
- Expiry: ISO, month/year last-day conversion, and legacy escaped date normalization passed; medicine batch/expiry enforcement passed.
- Users: four roles, bcrypt hashing, mandatory password change, permission defaults, overrides, and atomic weak-password rejection passed.
- Import: legacy stock flag preservation, active-product default, opening batches/movements, duplicate source protection, and reconciliation passed.
- Production dependency audit: 0 vulnerabilities.
- Package: Windows x64 build succeeded with Electron 44.3.0.
- Packaged native test: SQLite 3.53.4 loaded under Node 24.20.0.
- Evidence: `test-evidence/packaged-sqlite-smoke-v2.json`.
- Production NeDB cutover was not performed.

## Atomic sales engine — 2026-09-11

- Automated result: 8 suites, 50 tests passed.
- FEFO: nearest valid expiry selected first and one sale splits across multiple batches.
- Expired inventory remains physically visible but is excluded from sellable allocation.
- Stock: batch balances, per-batch allocations, and negative InventoryMovements reconcile.
- Accounting: actual batch costs create COGS snapshots; credit balances create Receivables; only collected money creates MoneyMovements.
- Pricing: original and edited prices, line discount, allocated invoice discount, taxable amount, GST, exact total, rounding adjustment, and final total are persisted.
- Credit validation: customer, phone, due date, payment limit, and actual collection method are enforced.
- Reliability: duplicate idempotency key and invoice number are blocked; any invalid line rolls back sale, stock, money, and ledger writes.
- Production dependency audit: 0 vulnerabilities.
- Package: Windows x64 build passed; packaged SQLite 3.53.4 loaded under Electron 44.3.0 / Node 24.20.0.
- Evidence: `test-evidence/packaged-sqlite-sales-engine.json`.
- UI/API wiring and production NeDB cutover were not performed in this phase.

## Sales API integration — 2026-09-12

- Added additive `/api/v2/sales` endpoints for atomic posting, search, detail, and receipt snapshots.
- Search verified by invoice and product; filters also support customer phone, payment status, date range, and bounded result limits.
- Receipt verification confirms product names, prices, discounts, GST, rounding, payment state, and customer identity are read from immutable sale snapshots.
- Invalid submissions return safe validation responses; duplicate invoice/idempotency submissions return HTTP 409.
- Legacy NeDB transaction routes remain unchanged and continue to be the default checkout path.
- Automated result: 9 suites, 52 tests passed.

## SQLite counter catalog — 2026-09-12

- Barcode lookup preserves leading zeros and only returns active products.
- Expired stock is excluded from sellable quantity and FEFO batch preview.
- Product response includes units, prices, GST state, prescription and controlled-medicine warnings.
- Search verified for product name, generic name, SKU, and barcode.
- Client adapter remains disabled unless `techorbit.sqliteCounterEnabled` is explicitly set to `true`.
- Automated result: 11 suites, 56 tests passed.
- Legacy NeDB UI remains the default; no live-data cutover was performed.

## Feature-flagged counter UI wiring — 2026-09-12

- Barcode-to-cart mapping preserves SQLite product identity, sale unit, price in minor units, and sellable quantity.
- Paid cash/card payloads use stable invoice/idempotency keys and fixed discounts converted to minor units.
- Mixed legacy/SQLite carts are blocked before posting.
- SQLite posting is followed by immutable receipt retrieval before checkout success is shown.
- Full automated result: 12 suites, 59 tests passed.
- Renderer syntax and Git diff checks passed; production dependency audit reports 0 vulnerabilities.
- Live desktop runtime: Electron processes launched, server returned HTTP 200, catalog missing-product returned 404, and empty search returned safe HTTP 422.
- Visual UI automation was unavailable because the Electron window was not exposed by the Windows-control provider.
- Feature flag remained disabled during live smoke; no production data or checkout was changed.

## Product Master bulk import foundation — 2026-09-12

- Template round-trip preserves a leading-zero barcode and all 24 canonical headers.
- Preview leaves Products unchanged and reports duplicate-in-file, existing barcode/SKU, required field, tax, GST, numeric, and enum errors.
- Commit atomically creates/updates Products and ProductUnits, records ImportRows linkage and AuditLog, and blocks repeated commits/files.
- Explicit duplicate policies `error`, `skip`, and `update` passed.
- 5,000-row preview passed the desktop performance budget.
- HTTP template download, multipart preview, commit, and repeat-commit conflict passed.
- Automated result: 15 suites, 65 tests passed.
- Production dependency audit: 0 vulnerabilities.
