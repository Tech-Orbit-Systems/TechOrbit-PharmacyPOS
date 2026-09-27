-- Preserve existing PeriodClosings rows; details apply only to new, policy-checked closures.
CREATE TABLE PeriodClosingDetails (
  period_closing_id INTEGER PRIMARY KEY REFERENCES PeriodClosings(id),
  from_utc TEXT NOT NULL,
  to_utc TEXT NOT NULL,
  cycle_start_month INTEGER NOT NULL CHECK(cycle_start_month BETWEEN 1 AND 12),
  report_json TEXT NOT NULL
);
CREATE TABLE PeriodClosingRevisions (
  id INTEGER PRIMARY KEY,
  period_closing_id INTEGER NOT NULL REFERENCES PeriodClosings(id),
  revision_number INTEGER NOT NULL,
  previous_report_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  revised_at TEXT NOT NULL,
  revised_by INTEGER NOT NULL REFERENCES Users(id),
  UNIQUE(period_closing_id,revision_number)
);
