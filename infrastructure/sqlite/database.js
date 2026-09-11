const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function listMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
}

function runMigrations(db, migrationsDir) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS SchemaMigrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM SchemaMigrations").all().map((row) => row.version),
  );
  const record = db.prepare(
    "INSERT INTO SchemaMigrations (version, applied_at) VALUES (?, ?)",
  );

  for (const file of listMigrationFiles(migrationsDir)) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}

function openDatabase({ filename, migrationsDir = path.join(__dirname, "migrations") }) {
  if (!filename) throw new Error("SQLite filename is required");
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  runMigrations(db, migrationsDir);
  return db;
}

module.exports = { openDatabase, runMigrations };
