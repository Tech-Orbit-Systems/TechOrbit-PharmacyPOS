# PharmaSpot Baseline Audit

Date: 2026-09-11

## Scope

This audit establishes a safe baseline for a standalone Tech Orbit desktop Pharmacy POS. No UI redesign has been attempted. JaniWheels projects and folders were not accessed or modified.

## Upstream and licensing

- Upstream: https://github.com/drkNsubuga/PharmaSpot
- Imported branch: `main`
- License: MIT; the upstream `LICENSE` file and attribution remain unchanged in `source/`.
- Upstream origin remains configured for fetch/pull until a Tech Orbit GitHub fork is created.

## Technical baseline

- Electron desktop shell with local Express API.
- NeDB data files are stored below the Electron application data directory.
- Main functional modules: inventory, transactions, customers, users, categories, and settings.
- Front end is a single HTML/jQuery application with bundled CSS/JS.

## Confirmed capabilities from source

- Login, bcrypt password verification, user permissions, and default admin bootstrap.
- Product CRUD, category assignment, barcode lookup, stock quantity, minimum-stock alert, cost/price, supplier text, and one expiry date per product.
- Cart/checkout, paid and held transactions, customer orders, inventory decrement after completed payment, transaction history and filters.
- Customer create/read/update/delete endpoints and customer selection during checkout.
- Receipt HTML generation and print-js path.
- Store/network settings and logo upload.
- Backup and restore menu paths, SHA-256 integrity validation, and zip-slip path checking.

## Baseline execution results

- `npm ci`: completed; 1,321 packages installed.
- Dependency audit: 35 known vulnerabilities reported (5 moderate, 29 high, 1 critical). No forced upgrades were applied because that could introduce breaking changes.
- Jest: 18/18 tests passed. Coverage report creation was blocked by the restricted execution account writing to `D:`; this did not affect test assertions.
- `npm run start`: blocked because Electron Forge selects the committed `yarn.lock` but Yarn is not installed.
- Direct Electron launch: reached server startup, then failed on Express 5 rejecting the legacy `/*` route.
- Minimal compatibility fix: changed the wildcard route to Express 5 syntax `/{*path}` on the baseline branch.
- Post-fix launch: pass; local server listened on port 3210 and served the application API.
- API smoke test: default admin login, barcode lookup, paid sale persistence, and stock decrement passed.
- Customer create passed, but customer lookup by ID failed because the record is stored with a numeric `_id` while the route queries a string.
- Expiry input is stored HTML-escaped (`31&#x2F;12&#x2F;2030`), while expiry calculations consume it without unescaping; batch migration must correct this legacy-data issue.

## Risks and gaps

1. NeDB has no relational constraints or atomic multi-table sale posting.
2. One expiry date and one stock quantity are attached to Product; real pharmacies require batch-level expiry, purchase cost, and stock.
3. Transaction and stock decrement are not an ACID database transaction.
4. Supplier is free text; there is no supplier/purchase ledger.
5. Returns, expenses, cash shifts/closing, and immutable audit trail are absent.
6. Automated tests cover utilities only; core API and end-to-end flows are untested.
7. Default `admin/admin` is insecure and must require a first-run password change before production.
8. Dependency vulnerabilities and deprecated packages require controlled upgrades after the database baseline is secured.
9. Current permissive CORS and renderer/runtime trust model need a dedicated Electron security review.
10. `/api/users/check` initializes the default user but never completes the HTTP response.
11. Customer lookup/edit has an ID type mismatch, and expiry dates are stored HTML-escaped.

## Decision

Use PharmaSpot as a functional reference and incremental baseline, but migrate persistence to SQLite and introduce a proper pharmacy domain schema before redesigning the UI.
