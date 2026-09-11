ALTER TABLE Products ADD COLUMN legacy_source_id TEXT;
CREATE UNIQUE INDEX idx_products_legacy_source_id ON Products(legacy_source_id) WHERE legacy_source_id IS NOT NULL;
CREATE TABLE LegacyImports (
  id INTEGER PRIMARY KEY, source_file TEXT NOT NULL, source_sha256 TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL, product_count INTEGER NOT NULL, opening_quantity NUMERIC NOT NULL
);
