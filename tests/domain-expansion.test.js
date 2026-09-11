const fs = require("fs");
const os = require("os");
const path = require("path");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { normalizeExpiry, roundPayableToRupee } = require("../infrastructure/domain/utils");

describe("Expanded pharmacy domain schema", () => {
  let dir; let db;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "techorbit-domain-")); db = openDatabase({ filename: path.join(dir, "db.sqlite3") }); });
  afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  test("creates roles, permissions, settings and accounting tables", () => {
    expect(db.prepare("SELECT count(*) count FROM Roles").get().count).toBe(4);
    expect(db.prepare("SELECT count(*) count FROM Permissions").get().count).toBeGreaterThanOrEqual(20);
    expect(db.prepare("SELECT value_json FROM Settings WHERE key='currency'").get().value_json).toBe('"PKR"');
    for (const table of ["ProductUnits", "BatchReceipts", "Payables", "Receivables", "MoneyMovements", "AuditLog", "Users"]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table).name).toBe(table);
    }
  });

  test("role defaults preserve sensitive access boundaries", () => {
    const allowed = db.prepare(`SELECT p.code FROM RolePermissions rp JOIN Roles r ON r.id=rp.role_id
      JOIN Permissions p ON p.id=rp.permission_id WHERE r.code=?`).all("cashier").map((row) => row.code);
    expect(allowed).toContain("sale.create");
    expect(allowed).toContain("closing.create");
    expect(allowed).not.toContain("purchase.manage");
    expect(allowed).not.toContain("report.cost");
    expect(db.prepare(`SELECT count(*) count FROM RolePermissions rp JOIN Roles r ON r.id=rp.role_id WHERE r.code='admin'`).get().count).toBe(20);
  });

  test("normalizes exact, month-year and legacy escaped expiry dates", () => {
    expect(normalizeExpiry("2028-02-29")).toBe("2028-02-29");
    expect(normalizeExpiry("09/2027")).toBe("2027-09-30");
    expect(normalizeExpiry("31&#x2F;12&#x2F;2030")).toBe("2030-12-31");
    expect(normalizeExpiry("2028-02-30")).toBeNull();
  });

  test("rounds only final payable to the nearest rupee", () => {
    expect(roundPayableToRupee(1249)).toBe(1200);
    expect(roundPayableToRupee(1250)).toBe(1300);
    expect(() => roundPayableToRupee(12.5)).toThrow();
  });
});
