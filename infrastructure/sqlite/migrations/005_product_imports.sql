CREATE TABLE ImportJobs (
  id INTEGER PRIMARY KEY,
  import_type TEXT NOT NULL CHECK (import_type IN ('product_master','opening_stock')),
  source_name TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  duplicate_policy TEXT NOT NULL CHECK (duplicate_policy IN ('error','skip','update')),
  status TEXT NOT NULL CHECK (status IN ('previewed','committed','failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  committed_rows INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES Users(id),
  created_at TEXT NOT NULL,
  committed_at TEXT
);
CREATE TABLE ImportRows (
  id INTEGER PRIMARY KEY,
  import_job_id INTEGER NOT NULL REFERENCES ImportJobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  normalized_json TEXT,
  action TEXT NOT NULL CHECK (action IN ('insert','update','skip','error')),
  errors_json TEXT NOT NULL DEFAULT '[]',
  product_id INTEGER REFERENCES Products(id),
  UNIQUE(import_job_id,row_number)
);
CREATE UNIQUE INDEX idx_import_committed_checksum ON ImportJobs(import_type,source_sha256) WHERE status='committed';
CREATE INDEX idx_import_jobs_created ON ImportJobs(import_type,created_at DESC);
CREATE INDEX idx_import_rows_job_action ON ImportRows(import_job_id,action,row_number);
CREATE INDEX idx_products_active_name_nocase ON Products(name COLLATE NOCASE,active);
CREATE INDEX idx_products_generic_nocase ON Products(generic_name COLLATE NOCASE) WHERE active=1;
