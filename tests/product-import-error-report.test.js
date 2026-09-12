const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const { openDatabase } = require("../infrastructure/sqlite/database");
const { ProductImportService } = require("../infrastructure/sqlite/services/product-import");
const { createProductImportRouter, createImportErrorsCsv } = require("../api/v2/sqlite-product-import");

describe("product import error report", () => {
  test("creates Excel-safe, quoted CSV", () => {
    const csv = createImportErrorsCsv([
      { rowNumber: 2, errors: ["=CMD()"], raw: {} },
      { rowNumber: 3, errors: ['a,"b"'], raw: {} },
    ]);
    expect(csv).toContain('"row_number","errors","raw_data"');
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain('a,""b""');
  });

  test("downloads all validation errors and returns 404 for an unknown job", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "to-import-errors-"));
    const db = openDatabase({ filename: path.join(dir, "db.sqlite3") });
    const preview = new ProductImportService(db).preview({
      rows: [{ sku: "BAD-1", name: "" }, { sku: "BAD-2", product_type: "unknown" }],
      sourceName: "bad.xlsx",
    });
    const app = express();
    app.use("/api/v2/imports/products", createProductImportRouter({ getDatabase: () => db }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      const response = await fetch(`${url}/api/v2/imports/products/${preview.jobId}/errors.csv`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain(`product-import-errors-${preview.jobId}.csv`);
      const body = await response.text();
      expect(body).toContain('"2"');
      expect(body).toContain('"3"');
      expect((await fetch(`${url}/api/v2/imports/products/999999/errors.csv`)).status).toBe(404);
    } finally {
      await new Promise(resolve => server.close(resolve));
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
