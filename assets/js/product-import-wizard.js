const MAX_PRODUCT_IMPORT_BYTES = 8 * 1024 * 1024;
const DUPLICATE_POLICY_HELP = {
  error: "Safest option: no existing product data will change.",
  skip: "Existing products stay unchanged; only new products will be imported.",
  update: "Existing product master fields and sale units will be updated after confirmation.",
};

function normalizeDuplicatePolicy(value) {
  return Object.prototype.hasOwnProperty.call(DUPLICATE_POLICY_HELP, value) ? value : "error";
}

function importStatusPresentation(status) {
  const states = {
    validating: { text: "Uploading and validating the workbook...", style: "progress-bar-info", busy: true },
    ready: { text: "Validation passed. Review the preview, then confirm the import.", style: "progress-bar-success", busy: false },
    blocked: { text: "Validation found errors. Download the report, correct the file, and preview again.", style: "progress-bar-danger", busy: false },
    committing: { text: "Saving validated products atomically...", style: "progress-bar-info", busy: true },
    success: { text: "Import completed successfully.", style: "progress-bar-success", busy: false },
    failed: { text: "Import failed. No partial import was saved.", style: "progress-bar-danger", busy: false },
  };
  return states[status] || states.failed;
}

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
    this.currentJob = null;
    this.busy = false;
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
    $("#productImportDuplicatePolicy").on("change", event => {
      const policy = normalizeDuplicatePolicy(event.target.value);
      $("#productImportPolicyHelp").text(DUPLICATE_POLICY_HELP[policy]);
      this.clearPreview();
    });
    $("#productImportPreviewButton").on("click", () => this.preview());
    $("#productImportCommitButton").on("click", () => this.commit());
    $("#productImportModal").on("hidden.bs.modal", () => this.reset());
    return true;
  }

  handleFileSelection(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    const result = validateProductImportFile(file);
    const info = this.$("#productImportFileInfo");
    this.$("#productImportPreviewButton").prop("disabled", !result.valid);
    this.clearPreview();
    info.removeClass("alert-success alert-danger alert-warning");
    if (result.valid) {
      info.addClass("alert-success").text(`${result.name} (${result.displaySize}) is ready for preview.`);
    } else {
      info.addClass(file ? "alert-danger" : "alert-warning").text(result.error);
    }
    return result;
  }

  async preview() {
    if (this.busy) return null;
    const input = this.$("#productImportFile")[0];
    const file = input && input.files && input.files[0];
    const validation = validateProductImportFile(file);
    if (!validation.valid) return this.handleFileSelection({ target: input });
    const button = this.$("#productImportPreviewButton");
    this.busy = true;
    this.setStatus("validating");
    button.prop("disabled", true).text("Validating...");
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("duplicatePolicy", normalizeDuplicatePolicy(this.$("#productImportDuplicatePolicy").val()));
    if (this.user && this.user._id) body.append("createdBy", this.user._id);
    try {
      const response = await fetch(`${this.apiBase}/v2/imports/products/preview`, { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The workbook could not be validated.");
      this.renderPreview(payload);
      this.currentJob = payload;
      this.setStatus(payload.errorRows > 0 ? "blocked" : "ready");
      return payload;
    } catch (error) {
      this.clearPreview();
      this.setStatus("failed", error.message);
      this.$("#productImportFileInfo").removeClass("alert-success alert-warning").addClass("alert-danger").text(error.message);
      return null;
    } finally {
      this.busy = false;
      button.prop("disabled", false).html('Refresh Preview <i class="fa fa-refresh"></i>');
    }
  }

  renderPreview(result) {
    const $ = this.$;
    const rows = $("#productImportPreviewRows").empty();
    (result.rows || []).forEach(row => {
      const tr = $("<tr>");
      const values = [row.rowNumber, row.action, row.normalized && row.normalized.sku, row.normalized && row.normalized.barcode, row.normalized && row.normalized.name, (row.errors || []).join("; ")];
      values.forEach(value => $("<td>").text(value == null ? "" : String(value)).appendTo(tr));
      if (row.action === "error") tr.addClass("danger");
      tr.appendTo(rows);
    });
    $("#productImportSummary").text(`${result.totalRows} rows checked: ${result.validRows} valid, ${result.errorRows} errors, ${result.skippedRows} skipped.`);
    $("#productImportPreviewLimit").text(result.previewTruncated ? "Showing the first 200 rows. The error report contains every validation error." : `Showing all ${(result.rows || []).length} preview rows.`);
    $("#productImportErrorsDownload").attr("href", `${this.apiBase}/v2/imports/products/${result.jobId}/errors.csv`).toggle(Number(result.errorRows) > 0);
    $("#productImportPreview").show();
    $("#productImportCommitButton").toggle(Number(result.errorRows) === 0).prop("disabled", Number(result.errorRows) !== 0);
  }

  async commit() {
    if (this.busy || !this.currentJob || Number(this.currentJob.errorRows) > 0) return null;
    this.busy = true;
    this.setStatus("committing");
    this.$("#productImportCommitButton").prop("disabled", true);
    try {
      const response = await fetch(`${this.apiBase}/v2/imports/products/${this.currentJob.jobId}/commit`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The import could not be completed.");
      this.setStatus("success", `${payload.committedRows} products imported successfully; ${payload.skippedRows} skipped.`);
      this.$("#productImportPreviewButton").prop("disabled", true);
      return payload;
    } catch (error) {
      this.setStatus("failed", error.message);
      this.$("#productImportCommitButton").prop("disabled", false);
      return null;
    } finally {
      this.busy = false;
    }
  }

  setStatus(status, detail) {
    const state = importStatusPresentation(status);
    this.$("#productImportStatus").show();
    this.$("#productImportStatusText").text(detail || state.text);
    this.$("#productImportProgressBar").removeClass("progress-bar-info progress-bar-success progress-bar-danger active").addClass(state.style).toggleClass("active", state.busy);
  }

  clearPreview() {
    this.currentJob = null;
    this.$("#productImportPreview").hide();
    this.$("#productImportPreviewRows").empty();
    this.$("#productImportErrorsDownload").hide().attr("href", "#");
    this.$("#productImportCommitButton").hide().prop("disabled", true);
  }

  reset() {
    this.clearPreview();
    this.$("#productImportFile").val("");
    this.$("#productImportPreviewButton").prop("disabled", true);
    this.$("#productImportFileInfo")
      .removeClass("alert-success alert-danger")
      .addClass("alert-warning")
      .text("No file selected.");
    this.$("#productImportStatus").hide();
  }
}

module.exports = {
  MAX_PRODUCT_IMPORT_BYTES,
  DUPLICATE_POLICY_HELP,
  ProductImportWizard,
  canManageProductImport,
  formatFileSize,
  normalizeDuplicatePolicy,
  importStatusPresentation,
  validateProductImportFile,
};
