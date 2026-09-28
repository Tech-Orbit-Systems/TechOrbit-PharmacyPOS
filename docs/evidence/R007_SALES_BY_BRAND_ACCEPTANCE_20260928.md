# R007 Sales by Brand/Manufacturer development evidence — 2026-09-28

Branch: `feature/approved-dashboard-pos-ui`. Isolated SQLite review data only.

## Delivered

- Sales by Brand/Manufacturer groups saved sale and linked return lines by the current product manufacturer/brand. Blank current brand stays visible as `Unspecified brand` so no revenue vanishes from totals. This current-metadata provenance is disclosed.
- R004 line-level invoice rounding, return GST/COGS reversal, date and relevant product/supplier/customer/cashier/payment filters, paged detail, permission-safe cost/profit and native CSV/Excel/PDF exports remain available. The Excel sheet uses a valid `Sales by Brand-Manufacturer` name.

## Verification

- An isolated two-medicine fixture places both products under North Labs, yielding one brand group whose net sales equals Daily Sales. The linked fixture checks Rs 100 net sales and Rs 50 net COGS for Linked brand. Blank-brand fallback and Excel export sheet were checked.
- Affected Jest suites: 22/22 passed; modern integration 25/25 passed; TypeScript/Vite production build passed.
- Five sequential isolated Electron flows passed, including linked R001-R007 reports, brand CSV save/read and B02/B03/B04 regression. Cashier brand groups have no cost/profit fields.

These are development checks. Formal manual QA Run 1/2/3, actual pharmacy statements, owner accounting approval and release gates remain pending.
