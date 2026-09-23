# Pharmacy POS Codex rules

Read these files before changing code:

1. `../docs/outputs/pharmacy-pos-tracker-20260913/TechOrbit_PharmacyPOS_Master_Development_Tracker.xlsx`
2. `docs/documentation-index.md`
3. `docs/PHARMACY_POS_MASTER_SPEC.md`
4. `docs/PROJECT_STATUS.md`
5. The package-specific source, tests, and evidence named by the tracker.

The master tracker owns feature IDs, order, dependencies, acceptance criteria, status, test evidence, decisions, and release gates. New explicit owner decisions take precedence and must be recorded in the tracker. Do not treat an old chat or dated document as proof that work is complete.

## Development safeguards

- Preserve working functionality and original license notices. Do not rewrite the application without a documented technical reason and owner approval.
- Make only changes required by the active tracker package. Inspect dependencies and affected workflows first.
- Keep business rules in the domain/service layer. UI validation is not a substitute for server-side enforcement.
- Use SQLite migrations for schema changes. Make migrations deliberate, repeatable, transactional, and safe for existing data.
- Never delete or silently reinterpret user data. No live cutover, destructive cleanup, or historical stock/unit rebasing without approval, backup, and reconciliation.
- Store money as integer paisa and make PKR rounding explicit. Independently verify totals, GST, discounts, COGS, dues, refunds, and closing figures.
- Prevent negative stock unless an approved business rule explicitly permits it. Preserve batch, expiry, FEFO, unit conversion, and audit history.
- Keep review/test data isolated from operational data. Do not use placeholder or mock records in production workflows.
- Preserve backward compatibility where practical. Do not silently change business rules.
- Use modular, maintainable code and parameterized database access. Do not expose secrets, raw internal errors, or protected cost/profit data.
- Verify persistence after application restart for every critical stored workflow.

## Completion gate

For an implementation package:

1. Run the relevant automated tests and desktop E2E flow with isolated data.
2. Regress directly affected accepted workflows and fix/retest failures.
3. Commit and push the authorized changes to the correct branch.
4. Update the same canonical tracker with status, real test evidence, branch, commit, dates, gaps, and next action. Update affected roadmap, test matrix, decisions, and release gates.
5. Report changed files and any remaining limitation. Do not claim completion if tests, push, or tracker saving is still pending.

Backend-only delivery is not end-to-end module completion. Unit-test counts do not satisfy three-run acceptance. Go-live requires every recorded release gate and explicit owner authorization.
