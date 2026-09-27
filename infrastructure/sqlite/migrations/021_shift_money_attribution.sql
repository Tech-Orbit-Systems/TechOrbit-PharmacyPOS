ALTER TABLE MoneyMovements ADD COLUMN device_id TEXT;
ALTER TABLE MoneyMovements ADD COLUMN shift_id INTEGER REFERENCES CashShifts(id);
CREATE INDEX idx_money_shift_method_time ON MoneyMovements(shift_id,method,occurred_at);
CREATE INDEX idx_cash_shift_device_window ON CashShifts(device_id,opened_at,closed_at);
