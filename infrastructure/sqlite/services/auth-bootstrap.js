const bcrypt = require("bcrypt");

const ROLE_CODES = ["cashier", "pharmacist", "manager", "admin"];

function bootstrapInitialUsers(db, credentials) {
  if (!credentials || ROLE_CODES.some((role) => !credentials[role]?.password || !credentials[role]?.username)) {
    throw new Error("Temporary username and password are required for all four roles");
  }
  const existing = db.prepare("SELECT count(*) count FROM Users").get().count;
  if (existing > 0) return { created: 0, skipped: true };
  const insert = db.prepare(`INSERT INTO Users
    (username, password_hash, display_name, role_id, active, must_change_password, created_at, updated_at)
    SELECT ?, ?, ?, id, 1, 1, ?, ? FROM Roles WHERE code=?`);
  return db.transaction(() => {
    const now = new Date().toISOString();
    for (const role of ROLE_CODES) {
      const record = credentials[role];
      if (record.password.length < 10) throw new Error(`Temporary password for ${role} must be at least 10 characters`);
      insert.run(record.username.trim(), bcrypt.hashSync(record.password, 12), record.displayName || role, now, now, role);
    }
    return { created: 4, skipped: false };
  })();
}

function hasPermission(db, userId, permissionCode) {
  const override = db.prepare(`SELECT up.allowed FROM UserPermissions up JOIN Permissions p ON p.id=up.permission_id
    WHERE up.user_id=? AND p.code=?`).get(userId, permissionCode);
  if (override) return override.allowed === 1;
  return Boolean(db.prepare(`SELECT 1 FROM Users u JOIN RolePermissions rp ON rp.role_id=u.role_id
    JOIN Permissions p ON p.id=rp.permission_id WHERE u.id=? AND u.active=1 AND p.code=?`).get(userId, permissionCode));
}

module.exports = { ROLE_CODES, bootstrapInitialUsers, hasPermission };
