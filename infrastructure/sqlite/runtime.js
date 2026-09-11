const path = require("path");
const { openDatabase } = require("./database");

let database;

function getSqliteFilename() {
  if (process.env.TECHORBIT_SQLITE_PATH) return process.env.TECHORBIT_SQLITE_PATH;
  if (!process.env.APPDATA || !process.env.APPNAME) {
    throw new Error("Application data path is not initialized");
  }
  return path.join(process.env.APPDATA, process.env.APPNAME, "server", "databases", "pharmacy.sqlite3");
}

function getDatabase() {
  if (!database) database = openDatabase({ filename: getSqliteFilename() });
  return database;
}

function closeDatabase() {
  if (database) database.close();
  database = undefined;
}

module.exports = { getDatabase, getSqliteFilename, closeDatabase };
