# Changelog

## 2026-09-12 - Bulk import workflow

- Added admin-only Product Master import wizard with template, preview, duplicate policies, lifecycle status and CSV errors.
- Added separate batch-aware Opening Stock Excel import with expiry validation, unit conversion, product-specific locking, atomic inventory movements and audit logging.

All notable Tech Orbit baseline and migration changes are recorded here.

## Unreleased — modernization/baseline

### Added

- Structured project workspace and project documentation.
- Baseline audit, architecture decision, roadmap, and test evidence.
- SQLite target schema plan and migration workspace.

### Fixed

- Prepared Express 5 wildcard-route compatibility fix required for launch.

### Preserved

- Upstream PharmaSpot MIT license and attribution.
- Existing functional behavior; no UI redesign or domain rewrite.

## Unreleased — modernization/techorbit-branding

### Changed

- Renamed the application and package to TechOrbit Pharmacy POS.
- Replaced the inherited repository README and visible SVG logo with Tech Orbit branding.
- Updated Electron app ID, Windows package name, publisher repository, contribution links, author, and copyright year.
- Disabled the inherited vendor update server until a signed Tech Orbit release endpoint is available.
- Preserved the original MIT copyright and permission notice in `LICENSE` and documented attribution in the README.

### Verified

- Automated test suite passes: 18/18.
- Rebranded Electron window title is `TechOrbit Pharmacy POS`.
- Local server launches successfully on port 3210.

## Unreleased — feature/sqlite-foundation

### Added

- `better-sqlite3` local database dependency.
- Atomic numbered migration runner with foreign keys, WAL, and schema history.
- Initial pharmacy tables for Products, ProductBatches, Suppliers, Purchases, PurchaseItems, and InventoryMovements.
- Repository adapters for products, suppliers, barcode lookup, and FEFO batch selection.
- SQLite constraint, migration-idempotency, barcode, foreign-key, and FEFO tests.

### Verified

- Full automated suite passes: 23/23 tests.
- Existing NeDB remains the active application database; no production cutover has occurred.

## Unreleased — purchase and migration foundation

### Added

- Atomic purchase receiving service covering Purchases, PurchaseItems, ProductBatches, and InventoryMovements.
- Duplicate supplier invoice protection and full rollback on invalid purchase items.
- NeDB inventory migration with dry-run mode, source checksum protection, supplier normalization, opening batches, and opening movements.
- Legacy import tracking migration and `npm run migrate:inventory` command.

### Verified

- Full automated suite passes: 30/30 tests.
- Windows x64 Electron package builds successfully.
- Packaged application loads native SQLite 3.53.4 under Electron 37.10.3 / Node 22.21.1.
- Existing NeDB remains active; no production migration has been committed.

## Unreleased — domain schema conflict resolution

### Added

- Expanded Product Master fields for generic, manufacturer, product type, dosage, strength, pack, units, pricing, reorder, prescription, controlled medicine, GST, notes, and audit actors.
- Configurable ProductUnits with base-unit conversion, default sale unit, price, and fractional-quantity policy.
- Physical-batch versus BatchReceipt separation for repeat receipts and purchase attribution.
- Roles, permissions, per-user overrides, four-user secure bootstrap, Settings, AuditLog, Payables, Receivables, and MoneyMovements.
- Purchase bonus stock, effective cost, unit conversion, partial/credit payment, supplier payable, money movement, idempotency, and audit posting.

### Fixed

- Legacy `stock` flag is preserved separately and no longer deactivates imported products.
- Legacy HTML-escaped `DD/MM/YYYY`, exact ISO dates, and `MM/YYYY` expiry values normalize safely.
- Repeat receipt of the same physical batch creates a new receipt lot rather than failing the batch uniqueness rule.
- Exempt products always store a zero GST rate; final payable rounding is isolated from precise internal minor-unit calculations.

### Security and verification

- Electron upgraded to 44.3.0 and Electron Forge packages aligned to 7.11.2.
- Production dependency audit reports zero vulnerabilities.
- Full automated suite passes 43/43 tests.
- Windows x64 package and packaged native SQLite smoke test pass.

## Unreleased — atomic sales engine

### Added

- Sales, SaleItems, and SaleItemAllocations with immutable invoice, product, unit, price, tax, expiry, and batch-cost snapshots.
- Atomic FEFO allocation across multiple valid batches with expired-stock exclusion and stock movements.
- Line fixed/percentage discounts, invoice fixed/percentage discounts, product GST, and final whole-rupee rounding.
- Cash/digital/partial/credit collection handling, customer receivables, COGS, and actual money movements.
- Invoice/idempotency uniqueness, complete rollback on line failure, and sale audit entries.
- Actual collection-method requirement for initial partial payments on credit sales.

### Verified

- Full automated suite passes 50/50 tests across 8 suites.
- Production dependency audit reports zero vulnerabilities.
- Windows x64 package and packaged native SQLite smoke test pass on Electron 44.3.0.
# Unreleased — Sales API integration

- Added a lazy application SQLite runtime at the production app-data location.
- Added versioned atomic sale posting at `POST /api/v2/sales` without replacing legacy NeDB checkout.
- Added filtered sale search, full sale detail, and immutable receipt snapshot endpoints.
- Added HTTP integration coverage for posting, FEFO-backed detail, receipt immutability, validation, and duplicate protection.
# Unreleased — SQLite counter catalog

- Added versioned active-product lookup by string barcode, preserving leading zeros.
- Added counter search across product name, generic name, SKU, and barcode.
- Added valid sellable-stock totals, configured units, and FEFO batch previews with expired batches excluded.
- Added a default-off client adapter for catalog lookup, atomic sale posting, and receipt retrieval.
- Added HTTP and client-adapter integration tests.
# Unreleased — Feature-flagged counter UI wiring

- Wired the existing barcode form to SQLite catalog lookup when the counter feature flag is enabled.
- Added prescription and controlled-medicine counter warnings.
- Added a tested mapper from SQLite products/cart rows into atomic sale payloads.
- Routed new paid cash/card counter sales through SQLite and fetched the immutable receipt snapshot after posting.
- Kept the feature disabled by default; hold orders and the existing NeDB checkout remain unchanged.
# Unreleased — Product Master bulk import foundation

- Added migration 005 with durable import jobs, row outcomes, committed-file idempotency, and query indexes.
- Added XLSX template generation and parsing with leading-zero barcode preservation.
- Added preview validation, row errors, duplicate barcode/SKU detection, and error/skip/update policies.
- Added atomic product and unit commit, audit logging, duplicate-file protection, and SQLite optimize hook.
- Added bounded multipart API upload and 5,000-row performance coverage.
- Scoped ExcelJS transitive UUID to a patched compatible version; production audit remains clean.
