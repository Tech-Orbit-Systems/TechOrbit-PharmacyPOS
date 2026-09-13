# POS feedback implementation — 2026-09-13

## Delivered

- Shared live shift badge on Dashboard/POS: current user and modern-desktop device, open/closed/unavailable states; refresh on focus and every 30 seconds.
- Add Customer form in POS, required name/phone, normalized phone duplicate checks and audit entry; selects the saved customer.
- Enlarged, responsive subtotal/discount/total group. Same layout for light/dark.
- Product-specific sale-unit dropdown, packing ratios and batch stock unit labels. Prices and stock conversions use the existing authoritative SQLite sales engine.
- Paid in full / Partial payment / Full credit. Customer and valid due date required for credit. Partial received amount uses Cash/Card/Digital; only outstanding amount becomes a receivable. Receipt shows received and remaining amounts. Full credit does not create a money collection.
- Retail remains a price-list label, not a payment method. Credit does not change product prices.
- Held sales preserve credit details and refresh product/unit definitions on resume. Replay validation includes the partial collection method.

## Units and data safety

Demo-only, idempotent unit additions: Panadol/Cetirizine 10 tablets per strip and 10 strips per box; ORS 10 sachets per pack and 100 per box; Amoxicillin 10 capsules per strip and 100 per box. These are sample pack sizes, NOT universal manufacturer rules. Real products must have their own configured packing sizes/prices; sealed or indivisible products must not gain invalid single-unit choices.

Existing demo strip-based inventory/history is preserved; tablet conversion is 0.1 strip. No silent stock rebasing, production database migration or operational data changes. The launcher remains a separate SQLite review application, not a production rollout.

## Verification

- TypeScript and Vite production build passed.
- Existing backend regression: 31 suites / 99 tests passed.
- 7 Node tests passed: pricing/stock conversion, repeat seed, shift open/closed, customer validation/deduplication, full/partial credit, Digital money movement, receivable amount, invalid dates/overpayment, replay guards and prior range/gateway tests.
- Actual Electron E2E passed: prior dashboard range/hold/receipt flows plus shift badges on both pages, Add Customer selection, tablet/box/pack selection, partial Digital sale (1,200 total / 200 paid / 1,000 due), full credit (500 due), missing-customer blocking, same light/dark geometry.
- Evidence: modernization/evidence/pos-light.png, pos-dark.png, pos-partial-credit.png, dashboard-light.png, dashboard-dark.png.
- Physical printer output and all monitor/DPI combinations remain unverified.

## Next

Review this increment using the demo database, confirm manufacturer-specific unit pack sizes before real imports, and implement the remaining disabled modern screens separately. Retail/wholesale price lists are a separate feature from customer credit terms.
