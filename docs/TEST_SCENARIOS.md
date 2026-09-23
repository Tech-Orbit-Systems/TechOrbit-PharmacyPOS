# Pharmacy POS test scenarios

The canonical tracker `Test Matrix` sheet owns scenario IDs, run evidence, and three-run acceptance status. This file is a concise execution guide; it does not mark acceptance.

For every critical scenario: use an isolated database, enter realistic data through the application, verify calculations independently, inspect persisted records/related views, restart and verify persistence, exercise an invalid case, and regress directly affected accepted flows.

## Core scenarios

1. Receive a medicine purchase with batch/expiry, bonus boxes, and partial supplier payment. Verify physical/sellable stock, effective cost, payable, money movement, supplier ledger, and restart persistence.
2. Pay the remaining supplier balance in multiple payments. Verify overpayment rejection, idempotent retry, ledger reconciliation, and reports.
3. Sell the same product as a box, strip, and loose tablet using its configured conversion. Verify unit prices, base-stock decrement, FEFO allocations, COGS, receipt snapshots, and restart persistence.
4. Scan the main barcode and manually search/select another unit. Preserve leading zeros and reject inactive, expired, or insufficient stock.
5. Apply an allowed cashier line discount and invoice discount. Attempt the exact limit and one paisa above it. Verify GST, rounding, permission, audit, and saved receipt values.
6. Enter cash tender below, equal to, and above the final total. Reject insufficient tender, show correct change, and record only the sale total as money received.
7. Make full-credit and partial-credit sales. Require the correct customer data, persist receivable balances, reject invalid payment details, and protect replay/idempotency.
8. Collect a customer due partially and finally. Verify customer history, balance, money movement, closing, and restart persistence.
9. Return part and all of a posted invoice line. Reject excess/duplicate return, restore eligible stock to the correct batch, reverse COGS/tax/receivable or refund correctly, and retain the original invoice.
10. Search invoices by invoice number, medicine/generic, customer phone, payment status, and date range. Verify paging, saved historical values after product edits, and permission controls.
11. Print and reprint pharmacy/customer 80mm receipts with long names, multiple lines, large amounts, discounts, GST, dues, rounding, and copy labels. Verify actual printer output and no unwanted batch detail.
12. Create near-expiry, expired, and valid batches. Verify warning acknowledgement, FEFO selection, expired-stock exclusion, authorized batch override with reason, and audit.
13. Execute Buy 10 Boxes Get 1 Free on purchasing. Verify purchased/bonus quantity, stock, effective cost, payable, and return limits. Test any sale-side promotion only after its rule is approved.
14. Import products and opening stock from XLSX/CSV. Verify leading-zero identifiers, mapping, duplicate policies, full error export, preview, atomic commit, product-specific opening lock, and no payable.
15. Perform count correction, damage/loss, and expiry disposal. Verify permissions, mandatory reason, actor, movements, negative-stock rejection, and history.
16. Run daily close with cash, card/bank/wallet, credit sales, due collections, supplier payments, refunds, expenses, and purchases. Verify shift ownership, handover, counted cash, variance, official close, and reasoned revision.
17. Run the golden P&L dataset. Independently reconcile sales less returns and GST, COGS and return reversal, discounts, expenses, profit/loss, customer dues, supplier payables, and closing balances.
18. Test Admin, Cashier, Pharmacist/Forms Manager, and standard user. Verify allowed and forbidden actions, first-login password change, protected financial fields, controlled-medicine actions, and no raw error leakage.
19. Create an automatic backup, restore a disposable copy, and compare record counts plus stock/financial control totals. Test checksum failure, locked/disk-full conditions, interrupted update, and rollback preservation.
20. Restart after products, purchases, sales, payments, returns, adjustments, and closing. Verify all records and balances persist with no duplicate replay.

## Release-only acceptance

- Execute every required tracker scenario three independent times with evidence.
- Record physical scanner and 80mm printer model/driver/DPI results.
- Run agreed target-hardware performance, accessibility, DPI, long-session, fault, migration rehearsal, installer/upgrade, full-day pilot, and rollback checks.
- Do not mark go-live until all mandatory release gates and explicit owner approval are recorded.
