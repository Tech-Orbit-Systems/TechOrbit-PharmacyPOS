ALTER TABLE Sales ADD COLUMN cash_tendered_minor INTEGER CHECK (cash_tendered_minor IS NULL OR cash_tendered_minor >= 0);
ALTER TABLE Sales ADD COLUMN cash_change_minor INTEGER CHECK (cash_change_minor IS NULL OR cash_change_minor >= 0);
