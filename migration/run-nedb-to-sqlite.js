const path = require("path");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { migrateLegacyInventory } = require("./nedb-to-sqlite");
const args = process.argv.slice(2); const commit = args.includes("--commit");
const positional = args.filter((arg) => arg !== "--commit");
if (positional.length !== 2) { console.error("Usage: node migration/run-nedb-to-sqlite.js <inventory.db> <target.sqlite3> [--commit]"); process.exitCode = 2; }
else { const db = openDatabase({ filename: path.resolve(positional[1]) });
  try { console.log(JSON.stringify(migrateLegacyInventory({ db, sourceFile: path.resolve(positional[0]), commit }), null, 2)); }
  finally { db.close(); } }
