class SuppliersRepository {
  constructor(db) {
    this.db = db;
  }

  create(supplier) {
    if (!supplier?.name?.trim()) throw new Error("Supplier name is required");
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO Suppliers (name, phone, email, address, active, created_at, updated_at)
      VALUES (@name, @phone, @email, @address, @active, @createdAt, @updatedAt)
    `).run({
      name: supplier.name.trim(),
      phone: supplier.phone || null,
      email: supplier.email || null,
      address: supplier.address || null,
      active: supplier.active === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });
    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return this.db.prepare("SELECT * FROM Suppliers WHERE id = ?").get(id) || null;
  }

  listActive() {
    return this.db.prepare("SELECT * FROM Suppliers WHERE active = 1 ORDER BY name, id").all();
  }
}

module.exports = { SuppliersRepository };
