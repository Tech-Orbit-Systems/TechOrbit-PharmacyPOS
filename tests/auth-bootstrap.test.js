const fs = require("fs"); const os = require("os"); const path = require("path"); const bcrypt = require("bcrypt");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { bootstrapInitialUsers, hasPermission } = require("../infrastructure/sqlite/services/auth-bootstrap");

describe("Initial users and permissions", () => {
  let dir; let db;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "techorbit-auth-")); db = openDatabase({ filename: path.join(dir, "db.sqlite3") }); });
  afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const credentials = () => ({
    cashier: { username: "cashier", password: "Cashier#Temp1" }, pharmacist: { username: "pharmacist", password: "Pharma#Temp1" },
    manager: { username: "manager", password: "Manager#Temp1" }, admin: { username: "admin", password: "Admin#Temp123" },
  });
  test("creates four hashed temporary users requiring password change", () => {
    expect(bootstrapInitialUsers(db, credentials())).toEqual({ created: 4, skipped: false });
    const users = db.prepare("SELECT * FROM Users ORDER BY id").all();
    expect(users).toHaveLength(4); expect(users.every((u) => u.must_change_password === 1)).toBe(true);
    expect(users[0].password_hash).not.toContain("Temp1"); expect(bcrypt.compareSync("Cashier#Temp1", users[0].password_hash)).toBe(true);
    expect(bootstrapInitialUsers(db, credentials())).toEqual({ created: 0, skipped: true });
  });
  test("enforces role permissions and per-user overrides", () => {
    bootstrapInitialUsers(db, credentials()); const cashier = db.prepare("SELECT id FROM Users WHERE username='cashier'").get();
    expect(hasPermission(db, cashier.id, "sale.create")).toBe(true); expect(hasPermission(db, cashier.id, "purchase.manage")).toBe(false);
    const permission = db.prepare("SELECT id FROM Permissions WHERE code='sale.create'").get();
    db.prepare("INSERT INTO UserPermissions(user_id,permission_id,allowed) VALUES (?,?,0)").run(cashier.id, permission.id);
    expect(hasPermission(db, cashier.id, "sale.create")).toBe(false);
  });
  test("rejects missing or weak temporary credentials atomically", () => {
    const weak = credentials(); weak.admin.password = "short";
    expect(() => bootstrapInitialUsers(db, weak)).toThrow("at least 10");
    expect(db.prepare("SELECT count(*) count FROM Users").get().count).toBe(0);
  });
});
