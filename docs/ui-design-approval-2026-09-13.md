# Approved Dashboard and POS design

Approved by the user on 2026-09-13. This records design approval, not completed application implementation.

## Authoritative decisions

- POS: use the user's attached light layout as the structural reference. Add only a Digital payment-method button alongside Cash and Card.
- Preserve the wide invoice, right product/batch finder, sale/held-sale tabs, barcode search, customer selector, and single bottom totals/payment/action toolbar.
- Do not add digital-payment reference fields, confirmation panels, provider selectors, or additional payment UI under this approval.
- Dashboard: use the latest shown dashboard with net-sales range buttons and Receivables & Payables replacing the bottom-right Current Shift panel.
- Chart ranges: 7 Days, 1 Month, 6 Months, 1 Year, Custom. Show exact dates and range total. Chart filter is independent of today's KPI cards. Daily buckets for short ranges; calendar-month buckets for longer ranges, explicitly marking partial months.
- Keep operational stock/expiry alerts and recent sales. Receivables/payables visibility respects user permissions.
- Appearance: Light, Dark, System. Both themes share exactly the same components, layout, dimensions, order, spacing and behavior. Only theme color tokens change.
- Ignore generated-image geometry differences, placeholder-data inconsistencies and incidental extra controls. These are not approved design changes.

## Palette

Light: cobalt #2563EB, navy sidebar #142541, background #F3F6FA, white panels, text #172B4D.

Dark: background #0B1220, sidebar #0F172A, panels #162235, inputs #1E2D43, borders #334155, main text #F1F5F9, secondary text #B8C4D6, primary #2563EB, links #93C5FD. Verify component contrast during implementation.

## Review references

- POS layout authority: user attachment codex-clipboard-4c96f597-e4a6-4c93-9b17-ca1922943081.png, plus the Digital button decision above.
- Latest dashboard light: exec-2f47fdab-f9f6-4105-9c02-0946139496c2.png.
- Dashboard dark color reference: exec-7e558f90-11cb-4205-aace-e4dac8781ccd.png.
- POS light/dark comparison (illustrative only): exec-6fc8a2d9-e5bc-4d06-834a-4ac85391941c.png.

Generated references are in C:/Users/MulTiTech SoluTion/.codex/generated_images/01a09775-a893-7c03-bcf0-36bdd21bf383/. The written decisions take precedence over image-generation artifacts.

## Next implementation boundary

Inspect current repository and existing implementation before integrating these screens. Preserve existing business rules and use a shared theme-token system. Verify chart range behavior, payment-method persistence and identical light/dark geometry in the actual application. Do not claim screenshots are functional application screens.
