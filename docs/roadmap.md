# Delivery roadmap

The master Excel tracker owns feature status, dependencies, test evidence and sequencing. This file summarizes it; it must not override it. Historical roadmap text is preserved in `history/2026-09-13/roadmap.md`.

## Current checkpoint

SQLite foundations and the approved Dashboard/POS review increment are delivered. The operational NeDB database has not been migrated. A modern production installer and complete release acceptance are pending.

## Authorized sequence

The user authorized decision-independent packages first, with decision-dependent work discussed afterward. P006 stays pending until actual scope/owner decisions are recorded. It is not a blanket blocker to already confirmed functional requirements.

1. P005: reconcile documentation and maintain one current delivery status.
2. P029: modern Product Master list/editor and validation, reusing the backend.
3. P030: product-specific packing, default units and price configuration. No universal manufacturer ratio or silent historical stock rebase.
4. P031: explicit generic alternatives by generic/strength/form/valid stock; no automatic substitution.
5. P032: batch inventory, physical/sellable quantities, expiry and protected costing.
6. P033: separate manual/bulk opening stock with product-specific history lock.
7. P034: modern Product Excel/CSV import using existing validated contracts.
8. P035: controlled stock corrections and damaged/expired disposal.
9. P036: supplier and purchase receiving workflows, bonus/effective cost and payables.
10. Continue tracker phases: counter completeness, accounts/returns, closing/reports, settings/security/backup, reliability, full acceptance, real-data rehearsal, installer/pilot and explicit go-live.

## Important distinctions

- Product import backend, legacy wizard and opening-stock backend already exist; modern integration is pending, not a new backend rewrite.
- Legacy `stock` mapping and initial domain-schema conflicts have fixture-tested corrections. Actual production mapping/reconciliation still requires owner-approved source data.
- UI discussion is no longer globally parked: the blue Dashboard/POS design is approved. Reuse the same design system for scoped screens; do not invent a redesign.
- Closing foundation does not satisfy digital reconciliation/revisions or corrected return/tax-aware six-month totals. Track P055–P058 explicitly.
- Historical packaging and dependency-audit results are dated evidence, not proof of current modern production readiness.

## Work-package gate

Implement, run relevant automated and desktop E2E tests, regress previous flows, fix/retest, commit/push, then update the same Excel tracker. No package is reported complete while its push or tracker update remains outstanding. Test real operational data only through an approved isolated copy.
