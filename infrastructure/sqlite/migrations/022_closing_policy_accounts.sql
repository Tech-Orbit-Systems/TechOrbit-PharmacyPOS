-- Closing policy belongs to this pharmacy installation. Existing rows keep their original values.
INSERT OR IGNORE INTO Settings(key,value_json,updated_at) VALUES
 ('closingVarianceToleranceMinor','5000',datetime('now')),
 ('sixMonthCycleStartMonth','1',datetime('now'));

CREATE TABLE ClosingAccounts (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('bank','wallet','savings')),
  name TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(kind,name)
);
CREATE INDEX idx_closing_accounts_kind_active ON ClosingAccounts(kind,active);

CREATE TABLE ClosingMovementAllocations (
  movement_id INTEGER PRIMARY KEY REFERENCES MoneyMovements(id),
  account_id INTEGER NOT NULL REFERENCES ClosingAccounts(id),
  allocated_at TEXT NOT NULL,
  allocated_by INTEGER NOT NULL REFERENCES Users(id)
);
CREATE INDEX idx_closing_allocations_account ON ClosingMovementAllocations(account_id);

CREATE TABLE SavingsTransfers (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES ClosingAccounts(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  transferred_at TEXT NOT NULL,
  reference TEXT,
  recorded_by INTEGER NOT NULL REFERENCES Users(id),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_savings_transfer_reference ON SavingsTransfers(account_id,reference COLLATE NOCASE);

ALTER TABLE CashShifts ADD COLUMN variance_reason TEXT;
ALTER TABLE CashShifts ADD COLUMN approved_by INTEGER REFERENCES Users(id);
ALTER TABLE CashShifts ADD COLUMN forced_close_reason TEXT;
ALTER TABLE CashShifts ADD COLUMN handover_from_shift_id INTEGER REFERENCES CashShifts(id);

CREATE TABLE BusinessDays (
  id INTEGER PRIMARY KEY,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','closed')),
  closed_by INTEGER REFERENCES Users(id),
  close_reason TEXT,
  snapshot_json TEXT,
  CHECK((status='open' AND closed_at IS NULL) OR (status='closed' AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX idx_business_day_one_open ON BusinessDays(status) WHERE status='open';
ALTER TABLE CashShifts ADD COLUMN business_day_id INTEGER REFERENCES BusinessDays(id);
CREATE INDEX idx_cash_shifts_business_day ON CashShifts(business_day_id,status);
-- Attach only still-open shifts. Closed historical shifts remain untouched for explicit reconciliation.
INSERT INTO BusinessDays(opened_at,status)
  SELECT MIN(opened_at),'open' FROM CashShifts WHERE status='open' HAVING COUNT(*)>0;
UPDATE CashShifts SET business_day_id=(SELECT id FROM BusinessDays WHERE status='open')
  WHERE status='open' AND business_day_id IS NULL;

CREATE TABLE BusinessDayRevisions (
  id INTEGER PRIMARY KEY,
  business_day_id INTEGER NOT NULL REFERENCES BusinessDays(id),
  revision_number INTEGER NOT NULL,
  previous_snapshot_json TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  revised_at TEXT NOT NULL,
  revised_by INTEGER NOT NULL REFERENCES Users(id),
  UNIQUE(business_day_id,revision_number)
);
