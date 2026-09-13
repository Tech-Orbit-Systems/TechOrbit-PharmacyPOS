const crypto = require("crypto");
const {
  SessionAuthService,
} = require("../../infrastructure/security/session-auth");
const {
  hasPermission,
} = require("../../infrastructure/sqlite/services/auth-bootstrap");
const {
  ProductCatalogService,
} = require("../../infrastructure/sqlite/services/product-catalog");
const {
  SalesPostingService,
} = require("../../infrastructure/sqlite/services/sales-posting");
const {
  SalesQueryService,
} = require("../../infrastructure/sqlite/services/sales-query");
const { dashboard } = require("./dashboard.cjs");
const { dayKey } = require("./ranges.cjs");
class Gateway {
  constructor(db, { demo = false } = {}) {
    this.db = db;
    this.demo = demo;
    this.auth = new SessionAuthService(
      db,
      crypto.randomBytes(48).toString("hex"),
    );
    this.session = null;
    this.failures = 0;
    this.blockedUntil = 0;
  }
  permission(code) {
    return hasPermission(this.db, this.session.id, code);
  }
  authorize(code) {
    if (!this.permission(code))
      throw Error("Your role does not allow this action");
  }
  async call(command, input = {}) {
    if (command === "login") {
      if (Date.now() < this.blockedUntil)
        throw Error("Too many attempts. Please wait one minute.");
      try {
        const { user } = this.auth.login(input);
        this.session = user;
        this.expires = Date.now() + 8 * 3600000;
        this.failures = 0;
        return { ...user, demo: this.demo };
      } catch (error) {
        if (++this.failures >= 5) {
          this.blockedUntil = Date.now() + 60000;
          this.failures = 0;
        }
        throw error;
      }
    }
    if (command === "logout") {
      this.session = null;
      return true;
    }
    if (!this.session || Date.now() > this.expires)
      throw Error("Please sign in");
    const active = this.db
      .prepare("SELECT active,must_change_password FROM Users WHERE id=?")
      .get(this.session.id);
    if (!active?.active) throw Error("Account is inactive");
    if (command === "changePassword") {
      const r = this.auth.changePassword({ ...input, userId: this.session.id });
      this.session.mustChangePassword = false;
      return r;
    }
    if (active.must_change_password)
      throw Error("Change your temporary password first");
    if (command === "dashboard") {
      this.authorize("sale.create");
      return dashboard(this.db, input, {
        userId: this.session.id,
        financial: this.permission("dues.manage"),
      });
    }
    if (command === "search") {
      this.authorize("sale.create");
      return new ProductCatalogService(this.db).search(
        String(input.q || "").slice(0, 100),
        dayKey(new Date()),
        30,
      );
    }
    if (command === "barcode") {
      this.authorize("sale.create");
      return new ProductCatalogService(this.db).findByBarcode(
        String(input.barcode || "").slice(0, 100),
        dayKey(new Date()),
      );
    }
    if (command === "customers") {
      this.authorize("sale.create");
      return this.db
        .prepare(
          "SELECT id,name,phone FROM Customers WHERE active=1 ORDER BY name LIMIT 500",
        )
        .all();
    }
    if (command === "ledger") {
      this.authorize("dues.manage");
      if (input.type === "customers")
        return this.db
          .prepare(
            "SELECT c.name,r.balance_minor,r.due_date FROM Receivables r LEFT JOIN Customers c ON c.id=r.customer_id WHERE r.balance_minor>0 ORDER BY r.due_date LIMIT 200",
          )
          .all();
      if (input.type === "suppliers")
        return this.db
          .prepare(
            "SELECT s.name,p.balance_minor,p.due_date FROM Payables p LEFT JOIN Suppliers s ON s.id=p.supplier_id WHERE p.balance_minor>0 ORDER BY p.due_date LIMIT 200",
          )
          .all();
      throw Error("Unknown ledger");
    }
    if (command === "quote" || command === "post") {
      this.authorize("sale.create");
      if (
        !Array.isArray(input.items) ||
        input.items.length < 1 ||
        input.items.length > 200
      )
        throw Error("Add between 1 and 200 sale lines");
      if (!["cash", "card", "digital"].includes(input.paymentMethod))
        throw Error("Choose Cash, Card or Digital");
      if (!Number.isSafeInteger(input.discountMinor) || input.discountMinor < 0)
        throw Error("Enter a valid discount");
      if (input.discountMinor > 0) this.authorize("sale.discount");
      const sale = {
        invoiceNumber: String(input.key || ""),
        idempotencyKey: String(input.key || ""),
        items: input.items.map((i) => ({
          productId: i.productId,
          saleUnit: i.saleUnit,
          quantity: i.quantity,
        })),
        paymentMethod: input.paymentMethod,
        customerId: input.customerId || null,
        invoiceDiscountType: "fixed",
        invoiceDiscountValue: input.discountMinor,
        createdBy: this.session.id,
        roleCode: this.session.roleCode,
        deviceId: "modern-desktop",
      };
      if (!/^TO-[a-f0-9-]{36}$/.test(sale.idempotencyKey))
        throw Error("Invalid sale reference");
      if (command === "post") {
        const old = this.db
          .prepare("SELECT id,created_by FROM Sales WHERE idempotency_key=?")
          .get(sale.idempotencyKey);
        if (old) {
          if (old.created_by !== this.session.id)
            throw Error("Sale reference belongs to another user");
          const saved = new SalesQueryService(this.db).getById(old.id);
          const same =
            saved.payment_method === sale.paymentMethod &&
            saved.customer_id === (sale.customerId || null) &&
            saved.invoice_discount_minor === sale.invoiceDiscountValue &&
            JSON.stringify(
              saved.items.map((i) => ({
                productId: i.product_id,
                saleUnit: i.sale_unit,
                quantity: i.entered_quantity,
              })),
            ) === JSON.stringify(sale.items);
          if (!same)
            throw Error(
              "This reference was already posted with different details. Review the completed sale before starting a new one.",
            );
          return new SalesQueryService(this.db).receipt(old.id);
        }
        const posted = new SalesPostingService(this.db).post(sale);
        return new SalesQueryService(this.db).receipt(posted.saleId);
      }
      // Reuse authoritative tax, rounding and FEFO logic, rolling back every quote write.
      this.db.exec("SAVEPOINT modern_quote");
      try {
        return new SalesPostingService(this.db).post(sale);
      } finally {
        this.db.exec("ROLLBACK TO modern_quote; RELEASE modern_quote");
      }
    }
    throw Error("Unknown operation");
  }
}
module.exports = { Gateway };
