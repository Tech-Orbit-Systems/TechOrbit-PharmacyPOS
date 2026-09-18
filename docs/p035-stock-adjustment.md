# P035 Stock Adjustment and Disposal

Status: implemented and acceptance-tested on 2026-09-18.

## Delivered

- Inventory batches now expose an authorized Adjust action.
- Count correction accepts the observed physical quantity and derives a gain or loss from current stock.
- Damage/stock loss and expiry/disposal accept an explicit removal quantity.
- The preview shows the signed quantity change and resulting physical stock before confirmation.
- Every post requires a reason, occurrence time, explicit confirmation and a unique idempotency key.
- Negative-ending stock, zero changes, malformed dates, duplicate batch lines and overlong reasons are rejected.
- Controlled medicines require manager or administrator authority in addition to `stock.adjust` permission.
- Posting updates the batch, disposal total, inventory movement and audit log atomically.
- Batch movement history displays the adjustment reason and signed quantity.

## Acceptance evidence

- Backend service: 1 suite / 3 tests passed.
- Desktop gateway: 1 test passed.
- TypeScript and Vite production build passed.
- Isolated Electron E2E: 1 successful run passed in 4.4 seconds after fixing audit-reason visibility and a test-locator ambiguity.
- Evidence image: `modernization/evidence/stock-adjustment-preview.png`.

## Operational notes

- No production database or live cutover was used.
- Adjustment records are immutable; corrections require a new compensating adjustment.
- P036 remains the next package for suppliers and purchase receiving screens.
