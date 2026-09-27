ALTER TABLE ReceivablePayments ADD COLUMN request_fingerprint TEXT;
ALTER TABLE ReceivablePayments ADD COLUMN reference TEXT;
ALTER TABLE PurchasePayments ADD COLUMN request_fingerprint TEXT;

CREATE TABLE Vendors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE Expenses ADD COLUMN vendor_id INTEGER REFERENCES Vendors(id);
ALTER TABLE Expenses ADD COLUMN amount_paid_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Expenses ADD COLUMN balance_due_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Expenses ADD COLUMN due_date TEXT;
ALTER TABLE Expenses ADD COLUMN reference TEXT;
ALTER TABLE Expenses ADD COLUMN request_fingerprint TEXT;

UPDATE Expenses
SET amount_paid_minor=amount_minor,
    balance_due_minor=0
WHERE status IN ('posted','void');

CREATE TABLE ExpensePayables (
  id INTEGER PRIMARY KEY,
  expense_id INTEGER NOT NULL UNIQUE REFERENCES Expenses(id),
  vendor_id INTEGER NOT NULL REFERENCES Vendors(id),
  original_minor INTEGER NOT NULL CHECK(original_minor >= 0),
  balance_minor INTEGER NOT NULL CHECK(balance_minor >= 0),
  due_date TEXT,
  status TEXT NOT NULL CHECK(status IN ('unpaid','partial','paid','void')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ExpensePayments (
  id INTEGER PRIMARY KEY,
  payable_id INTEGER NOT NULL REFERENCES ExpensePayables(id),
  expense_id INTEGER NOT NULL REFERENCES Expenses(id),
  vendor_id INTEGER NOT NULL REFERENCES Vendors(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  method TEXT NOT NULL CHECK(method IN ('cash','card','digital','bank_transfer','mobile_wallet','other')),
  reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  created_by INTEGER REFERENCES Users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_customers_normalized_phone ON Customers(normalized_phone,id);
CREATE INDEX idx_receivables_status_due ON Receivables(status,due_date,id);
CREATE INDEX idx_payables_status_due ON Payables(status,due_date,id);
CREATE INDEX idx_expenses_vendor_date ON Expenses(vendor_id,expense_date DESC,id DESC);
CREATE INDEX idx_expense_payables_status_due ON ExpensePayables(status,due_date,id);
CREATE INDEX idx_expense_payments_payable_time ON ExpensePayments(payable_id,paid_at,id);
