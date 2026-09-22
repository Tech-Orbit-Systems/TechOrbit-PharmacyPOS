ALTER TABLE SaleItems ADD COLUMN near_expiry_warning INTEGER NOT NULL DEFAULT 0 CHECK (near_expiry_warning IN (0,1));

CREATE TABLE SaleWarningAcknowledgements (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL UNIQUE REFERENCES Sales(id),
  warnings_json TEXT NOT NULL,
  doctor_name TEXT,
  prescription_reference TEXT,
  acknowledged_by INTEGER NOT NULL REFERENCES Users(id),
  acknowledged_at TEXT NOT NULL
);

CREATE INDEX idx_sale_warning_ack_actor ON SaleWarningAcknowledgements(acknowledged_by,acknowledged_at);
