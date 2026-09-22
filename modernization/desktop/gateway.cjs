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
    if (['packingDetail','packingSave'].includes(command)) {
      this.authorize('settings.manage');
      const service=new (require('./packing.cjs').Packing)(this.db);
      try{return command==='packingDetail'?service.detail(input.id):service.save(input,this.session.id);}
      catch(error){if(error.code?.startsWith('SQLITE'))throw Error('Packing could not be saved. Check values and retry.');throw error;}
    }
    if (['productList','productDetail','productSave','productSuppliers'].includes(command)) {
      this.authorize('settings.manage');
      const master=new (require('./product-master.cjs').ProductMaster)(this.db);
      try {
        if(command==='productList')return master.list(input);
        if(command==='productDetail')return master.detail(input.id);
        if(command==='productSuppliers')return master.suppliers();
        return master.save(input,this.session.id);
      } catch(error){if(error.code?.startsWith('SQLITE'))throw Error('Product could not be saved. Check values and retry.');throw error;}
    }
    if(['productImportInspect','productImportPreview','productImportTemplate','productImportErrors','productImportCommit'].includes(command)){
      this.authorize('settings.manage');
      const service=new (require('./product-import.cjs').ProductImportDesktop)(this.db);
      if(command==='productImportInspect')return service.inspect(input);
      if(command==='productImportPreview')return service.preview(input,this.session.id);
      if(command==='productImportTemplate')return service.template();
      if(command==='productImportErrors')return service.errors(input);
      return service.commit(input);
    }
    if(command==='shiftStatus'){
      this.authorize('sale.create');
      return this.db.prepare("SELECT id,opened_at,device_id FROM CashShifts WHERE user_id=? AND device_id='modern-desktop' AND status='open' ORDER BY opened_at DESC LIMIT 1").get(this.session.id)||null;
    }
    if (command === 'inventoryList' || command === 'inventoryDetail') {
      this.authorize('inventory.view');
      const service = new (require('../../infrastructure/sqlite/services/inventory-live-stock').InventoryLiveStockService)(this.db);
      const options = { asOfDate: dayKey(new Date()), costVisible: this.permission('report.cost') };
      return command === 'inventoryList' ? service.list(input, options) : service.detail(input, options);
    }
    if(command==='stockAdjustmentDetail'||command==='stockAdjustmentPost'){
      this.authorize('stock.adjust');
      const service=new (require('./stock-adjustment.cjs').StockAdjustmentDesktop)(this.db);
      return command==='stockAdjustmentDetail'?service.detail(input):service.post(input,this.session);
    }
    if(['supplierList','supplierSave','purchaseProducts','purchasePreview','purchasePost','purchaseHistory','purchaseDetail'].includes(command)){
      this.authorize('purchase.manage');
      const service=new (require('./purchases.cjs').PurchasesDesktop)(this.db);
      try{
        if(command==='supplierList')return service.suppliers(input);
        if(command==='supplierSave')return service.saveSupplier(input,this.session);
        if(command==='purchaseProducts')return service.products(input);
        if(command==='purchasePreview')return service.preview(input);
        if(command==='purchasePost')return service.post(input,this.session);
        if(command==='purchaseHistory')return service.history(input);
        return service.detail(input);
      }catch(error){if(error.code?.startsWith('SQLITE'))throw Error('Purchase could not be saved. Check the supplier invoice number and retry.');throw error;}
    }
    if (['openingStockProducts','openingStockPreviewManual','openingStockPreviewFile','openingStockTemplate','openingStockCommit'].includes(command)) {
      this.authorize('stock.adjust');
      const service=new (require('./opening-stock.cjs').OpeningStockDesktop)(this.db);
      if(command==='openingStockProducts')return service.products(input);
      if(command==='openingStockPreviewManual')return service.previewManual(input,this.session.id);
      if(command==='openingStockPreviewFile')return service.previewFile(input,this.session.id);
      if(command==='openingStockTemplate')return service.template();
      return service.commit(input);
    }
    if(command==='createCustomer'){
      this.authorize('sale.create');
      return require('./customer-create.cjs').createCustomer(this.db,input,this.session.id);
    }
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
    if (command === "alternativeSearch" || command === "alternativeSelect") {
      this.authorize("medicine.alternatives");
      const service = new (require("../../infrastructure/sqlite/services/generic-alternatives").GenericAlternativesService)(this.db);
      if (command === "alternativeSearch")
        return service.view({ productId: input.productId, userId: this.session.id, roleCode: this.session.roleCode });
      return service.select({
        sourceProductId: input.sourceProductId,
        alternativeProductId: input.alternativeProductId,
        userId: this.session.id,
        roleCode: this.session.roleCode,
      });
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
      const invoiceDiscountType=input.invoiceDiscountType||"fixed";
      const invoiceDiscountValue=input.invoiceDiscountValue??input.discountMinor??0;
      if(!["fixed","percentage"].includes(invoiceDiscountType))throw Error("Choose a valid invoice discount type");
      if(!Number.isFinite(invoiceDiscountValue)||invoiceDiscountValue<0||(invoiceDiscountType==="fixed"&&!Number.isSafeInteger(invoiceDiscountValue))||(invoiceDiscountType==="percentage"&&invoiceDiscountValue>100))throw Error("Enter a valid invoice discount");
      if(invoiceDiscountValue>0)this.authorize("sale.discount");
      const creditMode=input.creditMode||'paid';
      if(!['paid','partial','credit'].includes(creditMode))throw Error('Choose a valid payment type');
      if(creditMode==='partial'&&(!Number.isSafeInteger(input.paidMinor)||input.paidMinor<=0))throw Error('Partial payment received must be greater than zero');
      const doctorName=String(input.doctorName||'').trim(),prescriptionReference=String(input.prescriptionReference||'').trim();
      if(doctorName.length>150)throw Error('Doctor name must be 150 characters or fewer');
      if(prescriptionReference.length>200)throw Error('Prescription reference must be 200 characters or fewer');
      const sale = {
        invoiceNumber: String(input.key || ""),
        idempotencyKey: String(input.key || ""),
        items: input.items.map((i) => {
          const item={productId:i.productId,saleUnit:i.saleUnit,quantity:i.quantity};
          if(i.unitPriceMinor!=null){if(!Number.isSafeInteger(i.unitPriceMinor)||i.unitPriceMinor<0)throw Error("Enter a valid unit price");this.authorize("sale.price_edit");item.unitPriceMinor=i.unitPriceMinor;}
          const type=i.discountType||"fixed",value=i.discountValue||0;
          if(!["fixed","percentage"].includes(type)||!Number.isFinite(value)||value<0||(type==="fixed"&&!Number.isSafeInteger(value))||(type==="percentage"&&value>100))throw Error("Enter a valid line discount");
          if(value>0)this.authorize("sale.discount");item.discountType=type;item.discountValue=value;
          if(i.overrideBatchId!=null){this.authorize("batch.override");const batchId=Number(i.overrideBatchId),reason=String(i.overrideReason||'').trim();if(!Number.isSafeInteger(batchId)||batchId<1)throw Error("Choose a valid batch");if(!reason)throw Error("Enter a reason for manual batch selection");if(reason.length>500)throw Error("Batch override reason must be 500 characters or fewer");item.overrideBatchId=batchId;item.overrideReason=reason;}
          return item;
        }),
        paymentMethod: input.paymentMethod,
        customerId: input.customerId || null,
        invoiceDiscountType,
        invoiceDiscountValue,
        createdBy: this.session.id,
        roleCode: this.session.roleCode,
        deviceId: "modern-desktop",
        warningAcknowledged:Boolean(input.warningAcknowledged),
        doctorName:doctorName||null,
        prescriptionReference:prescriptionReference||null,
        enforceWarningAcknowledgement:command==='post',
      };
      if(command==='post'&&creditMode!=='paid'){
        if(!sale.customerId)throw Error('Select or add a customer for a credit sale');
        const due=String(input.dueDate||'');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||Number.isNaN(Date.parse(due))||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due||due<dayKey(new Date()))throw Error('Choose a valid due date, today or later');
        sale.paymentMethod='credit';sale.collectionMethod=input.paymentMethod;
        sale.amountPaidMinor=creditMode==='credit'?0:input.paidMinor;sale.dueDate=due;
      }
      if (!/^TO-[a-f0-9-]{36}$/.test(sale.idempotencyKey))
        throw Error("Invalid sale reference");
      const requestFingerprint=crypto.createHash("sha256").update(JSON.stringify({items:sale.items,paymentMethod:sale.paymentMethod,customerId:sale.customerId,invoiceDiscountType:sale.invoiceDiscountType,invoiceDiscountValue:sale.invoiceDiscountValue,creditMode,amountPaidMinor:sale.amountPaidMinor||0,dueDate:sale.dueDate||null,collectionMethod:sale.collectionMethod||null,warningAcknowledged:sale.warningAcknowledged,doctorName:sale.doctorName,prescriptionReference:sale.prescriptionReference})).digest("hex");
      sale.requestFingerprint=requestFingerprint;
      if (command === "post") {
        const old = this.db
          .prepare("SELECT id,created_by,request_fingerprint FROM Sales WHERE idempotency_key=?")
          .get(sale.idempotencyKey);
        if (old) {
          if (old.created_by !== this.session.id)
            throw Error("Sale reference belongs to another user");
          if(old.request_fingerprint&&old.request_fingerprint!==requestFingerprint)throw Error("This reference was already posted with different details. Review the completed sale before starting a new one.");
          if(old.request_fingerprint)return new SalesQueryService(this.db).receipt(old.id);
          const saved = new SalesQueryService(this.db).getById(old.id);
          const collection = this.db.prepare("SELECT method FROM MoneyMovements WHERE reference_type='sale' AND reference_id=? ORDER BY id LIMIT 1").get(String(old.id));
          const same =
            (creditMode !== 'partial' || collection?.method === sale.collectionMethod) &&
            saved.payment_method === sale.paymentMethod &&
            (creditMode==='paid'||(saved.amount_paid_minor===sale.amountPaidMinor&&saved.due_date===sale.dueDate)) &&
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
        const quote=new SalesPostingService(this.db).post(sale);
        const received=creditMode==='credit'?0:creditMode==='partial'?input.paidMinor:quote.finalTotalMinor;
        if(received>quote.finalTotalMinor)throw Error('Received amount cannot exceed the sale total');
        return {...quote,amountPaidMinor:received,balanceDueMinor:quote.finalTotalMinor-received};
      } finally {
        this.db.exec("ROLLBACK TO modern_quote; RELEASE modern_quote");
      }
    }
    throw Error("Unknown operation");
  }
}
module.exports = { Gateway };
