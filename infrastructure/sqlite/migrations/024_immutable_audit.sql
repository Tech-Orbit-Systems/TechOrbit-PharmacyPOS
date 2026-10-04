-- Audit history is append-only. Operational diagnostics live outside AuditLog.
-- New events capture a role/reason snapshot even if a legacy writer omits them.
-- Existing rows are not guessed or retroactively rewritten.
CREATE TABLE AuditEventContext (
  audit_id INTEGER PRIMARY KEY REFERENCES AuditLog(id),
  role_code TEXT,
  reason TEXT
);

CREATE TRIGGER audit_context_on_insert AFTER INSERT ON AuditLog
BEGIN
  INSERT INTO AuditEventContext(audit_id,role_code,reason)
  VALUES (
    NEW.id,
    COALESCE(NEW.role_code,(SELECT r.code FROM Users u JOIN Roles r ON r.id=u.role_id WHERE u.id=NEW.user_id)),
    COALESCE(NULLIF(trim(NEW.reason),''),NEW.action)
  );
END;

CREATE TRIGGER audit_context_no_update BEFORE UPDATE ON AuditEventContext
BEGIN SELECT RAISE(ABORT, 'Audit context cannot be changed'); END;

CREATE TRIGGER audit_context_no_delete BEFORE DELETE ON AuditEventContext
BEGIN SELECT RAISE(ABORT, 'Audit context cannot be deleted'); END;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON AuditLog
BEGIN SELECT RAISE(ABORT, 'Audit history cannot be changed'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON AuditLog
BEGIN SELECT RAISE(ABORT, 'Audit history cannot be deleted'); END;
