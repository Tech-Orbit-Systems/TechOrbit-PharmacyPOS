# P031 generic alternatives

Date: 2026-09-17

## Scope delivered

- Added an individually assignable `medicine.alternatives` permission, enabled by default for Pharmacist and Admin.
- Added exact case-insensitive generic matching, with strength and dosage-form matching whenever the source medicine has those values configured.
- Excluded inactive products, the source product itself, zero stock and expired stock.
- Returned product, generic, manufacturer, strength, dosage form, selling price, available base quantity and nearest valid expiry through the existing counter-product contract.
- Added a POS alternatives dialog. Opening it never changes the cart. `Add alternative` is a separate explicit action and adds another line instead of replacing the prescribed item.
- Preserved prescription-required and controlled-medicine warnings in the alternative result and cart.
- Audited both alternative views and explicit selections with actor, role, source and selected product IDs.

## Verification

- Root Jest regression: 32 suites / 101 tests passed.
- Modern Node checks: 10 tests passed.
- TypeScript and Vite production build passed.
- P031 service checks cover matching, invalid stock, warnings, explicit selection and audit.
- Gateway checks cover Cashier denial and Pharmacist/Admin access.

## Desktop acceptance

- The initial GPU subprocess failure (`0xC0000135`) occurred only inside the restricted command sandbox, which cannot provide Electron's GPU-driver access.
- The same isolated P031 test passed outside that sandbox in 8.4 seconds, including three explicit-selection repetitions.
- The complete modern Electron suite then passed: 4/4 tests covering P029, P030, P031 and the prior Dashboard/POS regression.
- No system runtime installation or application GPU workaround was required. Desktop E2E must run with the approved unsandboxed GUI test profile while still using its isolated temporary database.

No production database or operational data was used.
