CREATE TABLE PurchaseReturns (
 id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES Purchases(id), supplier_id INTEGER NOT NULL REFERENCES Suppliers(id),
 idempotency_key TEXT NOT NULL UNIQUE, returned_at TEXT NOT NULL, total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 payable_credit_minor INTEGER NOT NULL DEFAULT 0 CHECK(payable_credit_minor>=0), refund_minor INTEGER NOT NULL DEFAULT 0 CHECK(refund_minor>=0),
 refund_method TEXT, reason TEXT NOT NULL, created_by INTEGER REFERENCES Users(id), created_at TEXT NOT NULL
);
CREATE TABLE PurchaseReturnItems (
 id INTEGER PRIMARY KEY, purchase_return_id INTEGER NOT NULL REFERENCES PurchaseReturns(id), purchase_item_id INTEGER NOT NULL REFERENCES PurchaseItems(id),
 product_id INTEGER NOT NULL REFERENCES Products(id), batch_id INTEGER NOT NULL REFERENCES ProductBatches(id), quantity NUMERIC NOT NULL CHECK(quantity>0),
 unit_cost_minor INTEGER NOT NULL CHECK(unit_cost_minor>=0), line_total_minor INTEGER NOT NULL CHECK(line_total_minor>=0)
);
CREATE INDEX idx_purchase_returns_purchase ON PurchaseReturns(purchase_id,returned_at,id);
CREATE INDEX idx_purchase_return_items_source ON PurchaseReturnItems(purchase_item_id);
