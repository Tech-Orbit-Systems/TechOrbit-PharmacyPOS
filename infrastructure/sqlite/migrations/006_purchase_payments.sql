CREATE TABLE PurchasePayments (
  id INTEGER PRIMARY KEY,
  payable_id INTEGER NOT NULL REFERENCES Payables(id),
  purchase_id INTEGER NOT NULL REFERENCES Purchases(id),
  supplier_id INTEGER NOT NULL REFERENCES Suppliers(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','bank_transfer','mobile_wallet','other')),
  reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  paid_at TEXT NOT NULL,
  created_by INTEGER REFERENCES Users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_purchase_payments_payable_time ON PurchasePayments(payable_id,paid_at,id);
CREATE INDEX idx_purchase_payments_supplier_time ON PurchasePayments(supplier_id,paid_at,id);
