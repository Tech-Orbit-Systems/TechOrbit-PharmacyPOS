CREATE TABLE Suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE Products (
  id INTEGER PRIMARY KEY,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  default_sale_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (default_sale_price_minor >= 0),
  minimum_stock NUMERIC NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ProductBatches (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES Products(id),
  supplier_id INTEGER REFERENCES Suppliers(id),
  batch_number TEXT,
  expiry_date TEXT,
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  sale_price_minor INTEGER NOT NULL CHECK (sale_price_minor >= 0),
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, batch_number, expiry_date)
);

CREATE TABLE Purchases (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES Suppliers(id),
  invoice_number TEXT,
  purchased_at TEXT NOT NULL,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'posted', 'void')),
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE PurchaseItems (
  id INTEGER PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES Purchases(id),
  product_id INTEGER NOT NULL REFERENCES Products(id),
  batch_id INTEGER NOT NULL REFERENCES ProductBatches(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

CREATE TABLE InventoryMovements (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES Products(id),
  batch_id INTEGER REFERENCES ProductBatches(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening', 'purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment', 'transfer')),
  quantity_delta NUMERIC NOT NULL CHECK (quantity_delta <> 0),
  reference_type TEXT NOT NULL,
  reference_id TEXT,
  occurred_at TEXT NOT NULL,
  user_id INTEGER,
  note TEXT
);

CREATE INDEX idx_products_name ON Products(name);
CREATE INDEX idx_batches_fefo ON ProductBatches(product_id, expiry_date, received_at);
CREATE INDEX idx_batches_supplier ON ProductBatches(supplier_id);
CREATE INDEX idx_movements_product_time ON InventoryMovements(product_id, occurred_at);
CREATE INDEX idx_movements_batch_time ON InventoryMovements(batch_id, occurred_at);
CREATE UNIQUE INDEX idx_purchases_supplier_invoice ON Purchases(supplier_id, invoice_number) WHERE invoice_number IS NOT NULL;
