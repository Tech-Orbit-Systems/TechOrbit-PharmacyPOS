const {
  MAX_PRODUCT_IMPORT_BYTES,
  canManageProductImport,
  formatFileSize,
  validateProductImportFile,
} = require("../assets/js/product-import-wizard");

describe("product import wizard", () => {
  test("allows admins with product permission", () => {
    expect(canManageProductImport({ role_code: "admin", perm_products: 1 })).toBe(true);
    expect(canManageProductImport({ _id: 1, perm_products: 1 })).toBe(true);
  });

  test("blocks non-admins and users without product permission", () => {
    expect(canManageProductImport({ role_code: "cashier", perm_products: 1 })).toBe(false);
    expect(canManageProductImport({ role_code: "admin", perm_products: 0 })).toBe(false);
    expect(canManageProductImport(null)).toBe(false);
  });

  test("validates a readable xlsx within the size limit", () => {
    expect(validateProductImportFile({ name: "products.XLSX", size: 4096 })).toEqual({
      valid: true,
      name: "products.XLSX",
      size: 4096,
      displaySize: "4.0 KB",
    });
  });

  test("rejects missing, empty, wrong-type, and oversized files", () => {
    expect(validateProductImportFile()).toMatchObject({ valid: false });
    expect(validateProductImportFile({ name: "products.xlsx", size: 0 })).toMatchObject({ valid: false });
    expect(validateProductImportFile({ name: "products.csv", size: 20 })).toMatchObject({ valid: false });
    expect(validateProductImportFile({ name: "products.xlsx", size: MAX_PRODUCT_IMPORT_BYTES + 1 })).toMatchObject({ valid: false });
  });

  test("formats file sizes for users", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  test("rejects filenames that only contain the xlsx suffix as part of another extension", () => {
    expect(validateProductImportFile({ name: "products.xlsx.exe", size: 100 })).toMatchObject({ valid: false });
  });
});
