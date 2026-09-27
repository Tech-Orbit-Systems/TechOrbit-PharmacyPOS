ALTER TABLE SaleReturns ADD COLUMN request_fingerprint TEXT;
ALTER TABLE SaleReturnItems ADD COLUMN restockable INTEGER NOT NULL DEFAULT 1 CHECK(restockable IN (0,1));
ALTER TABLE SaleReturnItems ADD COLUMN gst_minor INTEGER NOT NULL DEFAULT 0 CHECK(gst_minor>=0);
ALTER TABLE PurchaseReturns ADD COLUMN request_fingerprint TEXT;
