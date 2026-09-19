ALTER TABLE Purchases ADD COLUMN request_fingerprint TEXT;
CREATE INDEX idx_purchases_supplier_time ON Purchases(supplier_id, purchased_at DESC, id DESC);
CREATE INDEX idx_purchase_items_purchase ON PurchaseItems(purchase_id, id);

