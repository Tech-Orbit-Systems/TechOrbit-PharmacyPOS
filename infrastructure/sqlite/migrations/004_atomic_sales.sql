CREATE TABLE Customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  normalized_phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_customers_phone ON Customers(normalized_phone) WHERE normalized_phone IS NOT NULL;

CREATE TABLE Sales (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  sold_at TEXT NOT NULL,
  customer_id INTEGER REFERENCES Customers(id),
  customer_name_snapshot TEXT,
  customer_phone_snapshot TEXT,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','partial','credit','reversed')),
  gross_minor INTEGER NOT NULL CHECK (gross_minor >= 0),
  line_discount_minor INTEGER NOT NULL CHECK (line_discount_minor >= 0),
  invoice_discount_minor INTEGER NOT NULL CHECK (invoice_discount_minor >= 0),
  taxable_minor INTEGER NOT NULL CHECK (taxable_minor >= 0),
  gst_minor INTEGER NOT NULL CHECK (gst_minor >= 0),
  exact_total_minor INTEGER NOT NULL CHECK (exact_total_minor >= 0),
  rounding_minor INTEGER NOT NULL,
  final_total_minor INTEGER NOT NULL CHECK (final_total_minor >= 0),
  amount_paid_minor INTEGER NOT NULL CHECK (amount_paid_minor >= 0),
  balance_due_minor INTEGER NOT NULL CHECK (balance_due_minor >= 0),
  due_date TEXT,
  cogs_minor INTEGER NOT NULL CHECK (cogs_minor >= 0),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  created_by INTEGER REFERENCES Users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE SaleItems (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES Sales(id),
  line_number INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES Products(id),
  product_name_snapshot TEXT NOT NULL,
  generic_name_snapshot TEXT,
  sale_unit TEXT NOT NULL,
  entered_quantity NUMERIC NOT NULL CHECK (entered_quantity > 0),
  base_quantity NUMERIC NOT NULL CHECK (base_quantity > 0),
  original_unit_price_minor INTEGER NOT NULL CHECK (original_unit_price_minor >= 0),
  charged_unit_price_minor INTEGER NOT NULL CHECK (charged_unit_price_minor >= 0),
  gross_minor INTEGER NOT NULL CHECK (gross_minor >= 0),
  line_discount_type TEXT CHECK (line_discount_type IN ('fixed','percentage')),
  line_discount_value NUMERIC NOT NULL DEFAULT 0 CHECK (line_discount_value >= 0),
  line_discount_minor INTEGER NOT NULL CHECK (line_discount_minor >= 0),
  allocated_invoice_discount_minor INTEGER NOT NULL CHECK (allocated_invoice_discount_minor >= 0),
  taxable_minor INTEGER NOT NULL CHECK (taxable_minor >= 0),
  gst_rate_basis_points INTEGER NOT NULL CHECK (gst_rate_basis_points BETWEEN 0 AND 10000),
  gst_minor INTEGER NOT NULL CHECK (gst_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  cogs_minor INTEGER NOT NULL CHECK (cogs_minor >= 0),
  prescription_warning INTEGER NOT NULL DEFAULT 0 CHECK (prescription_warning IN (0,1)),
  controlled_warning INTEGER NOT NULL DEFAULT 0 CHECK (controlled_warning IN (0,1)),
  UNIQUE(sale_id,line_number)
);

CREATE TABLE SaleItemAllocations (
  id INTEGER PRIMARY KEY,
  sale_item_id INTEGER NOT NULL REFERENCES SaleItems(id),
  batch_id INTEGER NOT NULL REFERENCES ProductBatches(id),
  base_quantity NUMERIC NOT NULL CHECK (base_quantity > 0),
  expiry_date_snapshot TEXT,
  unit_cost_minor_snapshot INTEGER NOT NULL CHECK (unit_cost_minor_snapshot >= 0),
  cogs_minor INTEGER NOT NULL CHECK (cogs_minor >= 0)
);

CREATE INDEX idx_sales_date ON Sales(sold_at);
CREATE INDEX idx_sales_customer ON Sales(customer_id,sold_at);
CREATE INDEX idx_sale_items_product ON SaleItems(product_id,sale_id);
CREATE INDEX idx_sale_allocations_batch ON SaleItemAllocations(batch_id,sale_item_id);
