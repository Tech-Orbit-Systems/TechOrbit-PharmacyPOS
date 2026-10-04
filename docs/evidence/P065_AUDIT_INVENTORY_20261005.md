# P065 business audit inventory

The desktop worker requires a signed-in actor before business commands. Business
mutations are saved with their `AuditLog` event in the same SQLite transaction.
The new `AuditEventContext` trigger captures a historical role snapshot and a
routine action reason when an older writer omits them. It does not rewrite or
guess context for pre-migration events. Both tables reject update and delete.
The event's `occurred_at` remains a UTC instant; the protected viewer and
CSV/XLSX/PDF exports also show its Asia/Karachi local time.

| Business action family | Audit action or event | Owning writer |
| --- | --- | --- |
| Settings and users | `settings.change`, `user.create`, `user.update`, `user.password_reset`, `user.permission` | `modernization/desktop/settings.cjs`, `users.cjs` |
| Product, unit, supplier and vendor masters | `product.create`, `product.update`, `product.packing`, `supplier.create`, `supplier.update`, `vendor.save` | `product-master.cjs`, `packing.cjs`, `purchases.cjs`, `accounts.cjs` |
| Customer master and imports | `customer.create`, `product.import`, `opening_stock.manual`, `opening_stock.import` | `customer-create.cjs`, import services |
| Stock and purchasing | `stock.adjust`, purchase receive, supplier payment and supplier return events | stock-adjustment, purchase-receiving, purchase-payments and purchase-returns services |
| Sales and customer accounts | `sale.post`, `sale.return`, `receivable.payment`, generic alternative events | sales-posting, customer-returns, customer-accounts and generic-alternatives services |
| Expenses and vendor accounts | `expense.post`, `expense.payable.payment`, `expense.void` | expenses service |
| Cash, daily and six-month closing | `cash_shift.open`, close/force-close, `business_day.close`, `business_day.revise`, `six_month.close`, `six_month.revise`, closing policy/account/allocation/transfer | cash-closing, daily-closing, six-month-closing and closing-configuration services |

New customer audit facts omit contact details. Supplier and vendor profile
audits capture business name and active status, not phone/address/email.
Settings, authentication and configuration payloads are masked in the viewer;
credentials, contact/prescription fields and unauthorized financial facts are
redacted. Free-form reasons are sanitized, and customer/sale/receivable reasons
are hidden from viewers without customer-history permission. Raw audit exports
use the same protected report path. Legacy rows with unknown actor or recorded
role stay explicitly unattributed rather than assigning a current role.

Audit history has no retention/prune operation. Operational diagnostics and
privacy-filtered support bundles are separately tracked under P088; neither
may replace or mutate the business audit history.
