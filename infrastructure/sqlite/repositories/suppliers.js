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

  save(supplier) {
    if (!supplier?.name?.trim()) throw new Error("Supplier name is required");
    const values = {
      name: supplier.name.trim(),
      phone: supplier.phone?.trim() || null,
      email: supplier.email?.trim() || null,
      address: supplier.address?.trim() || null,
      active: supplier.active === false ? 0 : 1,
      updatedAt: new Date().toISOString(),
    };
    if (!supplier.id) return this.create(values);
    if (!Number.isSafeInteger(supplier.id) || supplier.id < 1 || !this.findById(supplier.id)) {
      throw new Error("Supplier was not found");
    }
    this.db.prepare(`UPDATE Suppliers SET name=@name,phone=@phone,email=@email,address=@address,
      active=@active,updated_at=@updatedAt WHERE id=@id`).run({ ...values, id: supplier.id });
    return this.findById(supplier.id);
  }
}

module.exports = { SuppliersRepository };
