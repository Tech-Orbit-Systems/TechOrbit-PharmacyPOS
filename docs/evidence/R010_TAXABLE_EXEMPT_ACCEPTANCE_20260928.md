# R010 Taxable vs Exempt Sales development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Taxable vs Exempt Sales classifies saved medicine sale lines and linked returns using the sale-line taxable base and GST rate recorded at posting. Positive taxable base or saved GST rate means Taxable; a positive priced line with neither is Exempt. A zero-value line without tax evidence remains visibly `Zero-value / unverified` rather than being silently classified.
- It shows invoiced sales, returns, net sales, net GST, net ex-GST revenue and taxable base, plus authorized COGS/profit. Returns reverse the original line's tax class. Relevant date, official/calendar day, product, generic, category, brand, recorded supplier, customer, cashier and original method filters, paged detail and native CSV/Excel/PDF exports remain available. Cost/profit remain protected.

## Verification

- A discounted two-medicine fixture has a taxable Paracetamol line and an exempt Ibuprofen line; both groups sum exactly to Daily Sales after invoice rounding. Exempt GST is zero and taxable GST equals the invoice GST. A linked exempt fixture with customer return reconciles Rs 100 net sales, zero GST and zero taxable base. Desktop CSV and cashier cost denial passed.
- Affected Jest suites: 23/23 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R010 reporting and B02/B03/B04 regression.

These are development checks. This report is not a statutory tax filing. Formal manual QA Run 1/2/3, actual pharmacy tax statement reconciliation, owner accounting approval and release gates remain pending.
