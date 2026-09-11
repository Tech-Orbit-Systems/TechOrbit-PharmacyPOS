ALTER TABLE Products ADD COLUMN generic_name TEXT;
ALTER TABLE Products ADD COLUMN manufacturer TEXT;
ALTER TABLE Products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'medicine';
ALTER TABLE Products ADD COLUMN dosage_form TEXT;
ALTER TABLE Products ADD COLUMN strength TEXT;
ALTER TABLE Products ADD COLUMN pack_description TEXT;
ALTER TABLE Products ADD COLUMN base_unit TEXT NOT NULL DEFAULT 'piece';
ALTER TABLE Products ADD COLUMN box_sale_price_minor INTEGER CHECK (box_sale_price_minor IS NULL OR box_sale_price_minor >= 0);
ALTER TABLE Products ADD COLUMN strip_sale_price_minor INTEGER CHECK (strip_sale_price_minor IS NULL OR strip_sale_price_minor >= 0);
ALTER TABLE Products ADD COLUMN reorder_level NUMERIC NOT NULL DEFAULT 0 CHECK (reorder_level >= 0);
ALTER TABLE Products ADD COLUMN default_supplier_id INTEGER REFERENCES Suppliers(id);
ALTER TABLE Products ADD COLUMN prescription_required INTEGER NOT NULL DEFAULT 0 CHECK (prescription_required IN (0, 1));
ALTER TABLE Products ADD COLUMN controlled_medicine INTEGER NOT NULL DEFAULT 0 CHECK (controlled_medicine IN (0, 1));
ALTER TABLE Products ADD COLUMN gst_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (gst_rate_basis_points BETWEEN 0 AND 10000);
ALTER TABLE Products ADD COLUMN tax_status TEXT NOT NULL DEFAULT 'exempt' CHECK (tax_status IN ('taxable', 'exempt'));
ALTER TABLE Products ADD COLUMN notes TEXT;
ALTER TABLE Products ADD COLUMN created_by INTEGER;
ALTER TABLE Products ADD COLUMN updated_by INTEGER;
ALTER TABLE Products ADD COLUMN legacy_stock_control INTEGER;

CREATE TABLE ProductUnits (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES Products(id),
  unit_name TEXT NOT NULL,
  base_quantity NUMERIC NOT NULL CHECK (base_quantity > 0),
  selling_price_minor INTEGER CHECK (selling_price_minor IS NULL OR selling_price_minor >= 0),
  is_default_sale_unit INTEGER NOT NULL DEFAULT 0 CHECK (is_default_sale_unit IN (0, 1)),
  allows_fractional_quantity INTEGER NOT NULL DEFAULT 0 CHECK (allows_fractional_quantity IN (0, 1)),
  UNIQUE(product_id, unit_name)
);

ALTER TABLE ProductBatches ADD COLUMN manufacturing_date TEXT;
ALTER TABLE ProductBatches ADD COLUMN opening_quantity NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE ProductBatches ADD COLUMN purchased_quantity NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE ProductBatches ADD COLUMN bonus_quantity NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE ProductBatches ADD COLUMN disposed_quantity NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE BatchReceipts (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES ProductBatches(id),
  purchase_id INTEGER REFERENCES Purchases(id),
  supplier_id INTEGER REFERENCES Suppliers(id),
  purchased_base_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (purchased_base_quantity >= 0),
  bonus_base_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (bonus_base_quantity >= 0),
  total_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_minor >= 0),
  effective_unit_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (effective_unit_cost_minor >= 0),
  received_at TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

ALTER TABLE Purchases ADD COLUMN idempotency_key TEXT;
ALTER TABLE Purchases ADD COLUMN amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0);
ALTER TABLE Purchases ADD COLUMN balance_due_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_due_minor >= 0);
ALTER TABLE Purchases ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE Purchases ADD COLUMN due_date TEXT;
ALTER TABLE Purchases ADD COLUMN notes TEXT;
CREATE UNIQUE INDEX idx_purchases_idempotency ON Purchases(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE PurchaseItems ADD COLUMN receipt_id INTEGER REFERENCES BatchReceipts(id);
ALTER TABLE PurchaseItems ADD COLUMN purchase_unit TEXT NOT NULL DEFAULT 'piece';
ALTER TABLE PurchaseItems ADD COLUMN units_per_purchase_unit NUMERIC NOT NULL DEFAULT 1 CHECK (units_per_purchase_unit > 0);
ALTER TABLE PurchaseItems ADD COLUMN purchased_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (purchased_quantity >= 0);
ALTER TABLE PurchaseItems ADD COLUMN bonus_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (bonus_quantity >= 0);
ALTER TABLE PurchaseItems ADD COLUMN base_quantity_received NUMERIC NOT NULL DEFAULT 0 CHECK (base_quantity_received >= 0);
ALTER TABLE PurchaseItems ADD COLUMN effective_unit_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (effective_unit_cost_minor >= 0);

CREATE TABLE Roles (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE Permissions (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, description TEXT NOT NULL);
CREATE TABLE RolePermissions (
  role_id INTEGER NOT NULL REFERENCES Roles(id), permission_id INTEGER NOT NULL REFERENCES Permissions(id),
  PRIMARY KEY(role_id, permission_id)
);
CREATE TABLE Users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL, role_id INTEGER NOT NULL REFERENCES Roles(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE UserPermissions (
  user_id INTEGER NOT NULL REFERENCES Users(id), permission_id INTEGER NOT NULL REFERENCES Permissions(id),
  allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)), PRIMARY KEY(user_id, permission_id)
);

CREATE TABLE Payables (
  id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES Suppliers(id),
  source_type TEXT NOT NULL, source_id TEXT NOT NULL, original_minor INTEGER NOT NULL CHECK (original_minor >= 0),
  balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0), due_date TEXT, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source_type, source_id)
);
CREATE TABLE Receivables (
  id INTEGER PRIMARY KEY, customer_id INTEGER, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
  original_minor INTEGER NOT NULL CHECK (original_minor >= 0), balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0),
  due_date TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_id)
);
CREATE TABLE MoneyMovements (
  id INTEGER PRIMARY KEY, direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  method TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
  user_id INTEGER REFERENCES Users(id), note TEXT
);
CREATE TABLE Settings (
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by INTEGER REFERENCES Users(id), updated_at TEXT NOT NULL
);
CREATE TABLE AuditLog (
  id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL, user_id INTEGER REFERENCES Users(id), role_code TEXT,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, previous_json TEXT, new_json TEXT,
  reason TEXT, device_id TEXT
);

INSERT INTO Roles(code, name) VALUES ('cashier','Cashier'),('pharmacist','Pharmacist'),('manager','Manager'),('admin','Admin');
INSERT INTO Permissions(code, description) VALUES
 ('sale.create','Create and finalize sales'),('sale.price_edit','Edit sale unit price'),('sale.discount','Apply sale discounts'),
 ('invoice.search','Search invoices'),('receipt.print','Print and reprint receipts'),('customer.history','View customer history'),
 ('closing.create','Perform daily closing'),('batch.override','Override FEFO batch with reason'),('return.customer','Process customer returns'),
 ('purchase.manage','Manage purchases'),('return.supplier','Process supplier returns'),('expense.manage','Manage expenses'),
 ('dues.manage','Manage receivables and payables'),('closing.revise','Revise daily closing'),('stock.adjust','Adjust stock'),
 ('report.cost','View cost and profit reports'),('user.manage','Manage users and permissions'),('settings.manage','Manage settings'),
 ('backup.manage','Manage backup and restore'),('audit.view','View audit log');
INSERT INTO RolePermissions(role_id, permission_id)
 SELECT r.id, p.id FROM Roles r JOIN Permissions p WHERE
 (r.code='cashier' AND p.code IN ('sale.create','sale.price_edit','sale.discount','invoice.search','receipt.print','customer.history','closing.create')) OR
 (r.code='pharmacist' AND p.code IN ('sale.create','sale.price_edit','sale.discount','invoice.search','receipt.print','customer.history','closing.create','batch.override','return.customer')) OR
 (r.code='manager' AND p.code IN ('invoice.search','receipt.print','customer.history','closing.create','batch.override','return.customer','purchase.manage','return.supplier','expense.manage','dues.manage','closing.revise','stock.adjust')) OR
 r.code='admin';

INSERT INTO Settings(key, value_json, updated_at) VALUES
 ('currency','"PKR"',datetime('now')),('defaultGstBasisPoints','0',datetime('now')),
 ('expiryAlertDays','[30,60,90]',datetime('now')),('batchRequiredForMedicine','true',datetime('now')),
 ('receiptWidthMm','80',datetime('now')),('backupRetentionDays','30',datetime('now'));

CREATE INDEX idx_product_units_product ON ProductUnits(product_id);
CREATE INDEX idx_batch_receipts_batch ON BatchReceipts(batch_id);
CREATE INDEX idx_payables_supplier_status ON Payables(supplier_id, status);
CREATE INDEX idx_money_movements_time_method ON MoneyMovements(occurred_at, method);
CREATE INDEX idx_audit_entity ON AuditLog(entity_type, entity_id, occurred_at);
