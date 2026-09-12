const MAX_PRODUCT_IMPORT_BYTES = 8 * 1024 * 1024;

function canManageProductImport(user) {
  if (!user) return false;
  const isAdmin = user.role_code === "admin" || Number(user._id) === 1;
  return isAdmin && Number(user.perm_products) !== 0;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateProductImportFile(file) {
  if (!file) return { valid: false, error: "Select an Excel .xlsx file." };
  const name = String(file.name || "").trim();
  if (!/\.xlsx$/i.test(name)) {
    return { valid: false, error: "Only .xlsx Excel files are supported." };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, error: "The selected file is empty or cannot be read." };
  }
  if (file.size > MAX_PRODUCT_IMPORT_BYTES) {
    return { valid: false, error: "The selected file is larger than 8 MB." };
  }
  return { valid: true, name, size: file.size, displaySize: formatFileSize(file.size) };
}

class ProductImportWizard {
  constructor({ $, user, apiBase }) {
    this.$ = $;
    this.user = user;
    this.apiBase = String(apiBase || "").replace(/\/$/, "");
  }

  init() {
    const $ = this.$;
    if (!canManageProductImport(this.user)) {
      $("#productImportButton").remove();
      $("#productImportModal").remove();
      return false;
    }

    $("#productImportButton").show();
    $("#productImportTemplate").attr("href", `${this.apiBase}/v2/imports/products/template`);
    $("#productImportFile").on("change", event => this.handleFileSelection(event));
    $("#productImportModal").on("hidden.bs.modal", () => this.reset());
    return true;
  }

  handleFileSelection(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    const result = validateProductImportFile(file);
    const info = this.$("#productImportFileInfo");
    this.$("#productImportPreviewButton").prop("disabled", !result.valid);
    info.removeClass("alert-success alert-danger alert-warning");
    if (result.valid) {
      info.addClass("alert-success").text(`${result.name} (${result.displaySize}) is ready for preview.`);
    } else {
      info.addClass(file ? "alert-danger" : "alert-warning").text(result.error);
    }
    return result;
  }

  reset() {
    this.$("#productImportFile").val("");
    this.$("#productImportPreviewButton").prop("disabled", true);
    this.$("#productImportFileInfo")
      .removeClass("alert-success alert-danger")
      .addClass("alert-warning")
      .text("No file selected.");
  }
}

module.exports = {
  MAX_PRODUCT_IMPORT_BYTES,
  ProductImportWizard,
  canManageProductImport,
  formatFileSize,
  validateProductImportFile,
};
