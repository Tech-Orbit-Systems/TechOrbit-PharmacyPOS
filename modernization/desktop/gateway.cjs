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
  SalesQuotationService,
} = require("../../infrastructure/sqlite/services/sales-quotation");
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
        return { ...user, demo: this.demo,canViewProfit:hasPermission(this.db,user.id,'report.cost'),
          canManageSettings:hasPermission(this.db,user.id,'settings.manage'),
          canManageBackup:hasPermission(this.db,user.id,'backup.manage'),
          canViewSalesReport:hasPermission(this.db,user.id,'invoice.search'),canViewInventory:hasPermission(this.db,user.id,'inventory.view'),canViewDues:hasPermission(this.db,user.id,'dues.manage'),canViewAuditReport:hasPermission(this.db,user.id,'audit.view'),canViewClosingReport:hasPermission(this.db,user.id,'closing.create'),canViewVendorDues:hasPermission(this.db,user.id,'dues.manage')&&hasPermission(this.db,user.id,'expense.manage') };
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
      .prepare("SELECT u.active,u.must_change_password,r.code role_code FROM Users u JOIN Roles r ON r.id=u.role_id WHERE u.id=?")
      .get(this.session.id);
    if (!active?.active) throw Error("Account is inactive");
    this.session.roleCode = active.role_code;
    if (command === "changePassword") {
      const r = this.auth.changePassword({ ...input, userId: this.session.id });
      this.session.mustChangePassword = false;
      return r;
    }
    if (active.must_change_password)
      throw Error("Change your temporary password first");
    if (['usersCatalog','usersList','userDetail','userCreate','userUpdate','userResetPassword','userSetPermission'].includes(command)) {
      if (this.session.roleCode !== 'admin') throw Error('Only an admin can manage users');
      this.authorize('user.manage');
      const service = new (require('./users.cjs').UsersAdmin)(this.db);
      if (command === 'usersCatalog') return service.catalog();
      if (command === 'usersList') return service.list();
      if (command === 'userDetail') return service.detail(input.id);
      if (command === 'userCreate') return service.create(input,this.session);
      if (command === 'userUpdate') return service.update(input,this.session);
      if (command === 'userResetPassword') return service.resetPassword(input,this.session);
      return service.setPermission(input,this.session);
    }
    if (command === 'settingsRead') {
      this.authorize('settings.manage');
      return require('./settings.cjs').current(this.db);
    }
    if (command === 'backupStatus') {
      this.authorize('backup.manage');
      if (!this.dailyBackup) throw Error('Backup status is unavailable');
      return this.dailyBackup.status();
    }
    if (command === 'backupList') {
      this.authorize('backup.manage');
      if (!this.dailyBackup) throw Error('Backup management is unavailable');
      const versions=this.db.prepare('SELECT version FROM SchemaMigrations ORDER BY version').all().map(row=>row.version);
      return this.dailyBackup.manager.list({allowedMigrationVersions:versions});
    }
    if (command === 'backupCreate') {
      this.authorize('backup.manage');
      if (!this.dailyBackup) throw Error('Backup management is unavailable');
      return this.dailyBackup.createNow();
    }
    if (command === 'counterDefaults') {
      this.authorize('sale.create');
      const {read} = require('./settings.cjs');
      return {defaultSaleUnit:read(this.db,'defaultSaleUnit'),defaultPaymentMethod:read(this.db,'defaultPaymentMethod')};
    }
    if (command === 'settingsSave') {
      this.authorize('settings.manage');
      return require('./settings.cjs').save(this.db, input, this.session);
    }
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
      if(!this.permission('sale.create')&&!this.permission('closing.create'))throw Error('Your role does not allow this action');
      return this.db.prepare("SELECT id,opened_at,device_id FROM CashShifts WHERE user_id=? AND device_id='modern-desktop' AND status='open' ORDER BY opened_at DESC LIMIT 1").get(this.session.id)||null;
    }
    if(command==='closingShiftPreview'){
      this.authorize('closing.create');
      const shift=this.db.prepare('SELECT user_id,device_id FROM CashShifts WHERE id=?').get(input.shiftId);
      if(!shift||shift.device_id!=='modern-desktop')throw Error('Cash shift was not found');
      if(shift.user_id!==this.session.id&&!this.permission('closing.revise'))throw Error('Your role does not allow this shift');
      return new (require('../../infrastructure/sqlite/services/cash-closing').CashClosingService)(this.db).shiftPreview(input);
    }
    if(command==='closingPeriodPreview'){
      this.authorize('report.cost');
      return new (require('../../infrastructure/sqlite/services/cash-closing').CashClosingService)(this.db).sixMonthReport(input.asOf);
    }
    if(command==='closingPeriodRangePreview'){
      this.authorize('report.cost');
      return new (require('../../infrastructure/sqlite/services/cash-closing').CashClosingService)(this.db).rangeReport(input.from,input.to);
    }
    if(command==='closingPeriodCompletedPreview'){
      this.authorize('report.cost');
      return new (require('../../infrastructure/sqlite/services/six-month-closing').SixMonthClosingService)(this.db).preview(input);
    }
    if(command==='closingPeriodExport'){
      this.authorize('report.cost');
      let report;
      if(input?.closingId){
        this.authorize('closing.revise');
        const detail=new (require('../../infrastructure/sqlite/services/six-month-closing').SixMonthClosingService)(this.db).detail(input.closingId);
        if(detail.legacy)throw Error('Legacy period snapshot needs independent reconciliation before export');
        report=detail.current;
      }else report=new (require('../../infrastructure/sqlite/services/cash-closing').CashClosingService)(this.db).rangeReport(input?.from,input?.to);
      return {filename:`TechOrbit_PharmacyPOS_Six_Month_${report.periodStart}_${report.periodEnd}.csv`,csv:require('../../infrastructure/sqlite/services/period-export').periodCsv(report)};
    }
    if(['reportProfitLoss','reportEntries','reportExport'].includes(command)){
      this.authorize('report.cost');
      const reports=require('./reports.cjs');
      if(command==='reportProfitLoss')return reports.profitLoss(this.db,input);
      if(command==='reportEntries')return reports.reportEntries(this.db,input);
      if(input.format==='xlsx')return reports.reportXlsx(this.db,input);
      if(input.format==='pdf')return reports.reportPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.reportCsv(this.db,input);
    }
    if(['dailySalesSummary','dailySalesEntries','dailySalesExport'].includes(command)){
      this.authorize('invoice.search');
      const reports=require('./daily-sales.cjs'),options={costVisible:this.permission('report.cost')};
      if(command==='dailySalesSummary')return reports.dailySalesSummary(this.db,input,options);
      if(command==='dailySalesEntries')return reports.dailySalesEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.dailySalesXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.dailySalesPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.dailySalesCsv(this.db,input,options);
    }
    if(['medicineSummary','medicineEntries','medicineExport'].includes(command)){
      this.authorize('invoice.search');
      const reports=require('./sales-breakdown.cjs'),options={costVisible:this.permission('report.cost')};
      if(command==='medicineSummary')return reports.medicineSummary(this.db,input,options);
      if(command==='medicineEntries')return reports.medicineEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.medicineXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.medicinePdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.medicineCsv(this.db,input,options);
    }
    if(['customerReturnSummary','customerReturnEntries','customerReturnExport'].includes(command)){
      this.authorize('invoice.search');
      const reports=require('./customer-return-report.cjs'),options={costVisible:this.permission('report.cost')};
      if(command==='customerReturnSummary')return reports.customerReturnSummary(this.db,input,options);
      if(command==='customerReturnEntries')return reports.customerReturnEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.customerReturnXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.customerReturnPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.customerReturnCsv(this.db,input,options);
    }
    if(['supplierReturnSummary','supplierReturnEntries','supplierReturnExport'].includes(command)){
      this.authorize('report.cost');
      const reports=require('./supplier-return-report.cjs');
      if(command==='supplierReturnSummary')return reports.supplierReturnSummary(this.db,input);
      if(command==='supplierReturnEntries')return reports.supplierReturnEntries(this.db,input);
      if(input.format==='xlsx')return reports.supplierReturnXlsx(this.db,input);
      if(input.format==='pdf')return reports.supplierReturnPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.supplierReturnCsv(this.db,input);
    }
      if(['purchaseSummary','purchaseEntries','purchaseExport','supplierPurchaseSummary','supplierPurchaseEntries','supplierPurchaseExport'].includes(command)){
      this.authorize('report.cost');
      const reports=require('./purchase-report.cjs');
        if(command==='supplierPurchaseSummary')return reports.supplierPurchaseSummary(this.db,input);
        if(command==='supplierPurchaseEntries')return reports.supplierPurchaseEntries(this.db,input);
        if(command==='supplierPurchaseExport'){
          if(input.format==='xlsx')return reports.supplierPurchaseXlsx(this.db,input);
          if(input.format==='pdf')return reports.supplierPurchasePdf(this.db,input);
          if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
          return reports.supplierPurchaseCsv(this.db,input);
        }
      if(command==='purchaseSummary')return reports.purchaseSummary(this.db,input);
      if(command==='purchaseEntries')return reports.purchaseEntries(this.db,input);
      if(input.format==='xlsx')return reports.purchaseXlsx(this.db,input);
      if(input.format==='pdf')return reports.purchasePdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.purchaseCsv(this.db,input);
    }
    if(['closingPeriodClose','closingPeriodHistory','closingPeriodDetail','closingPeriodRevise'].includes(command)){
      this.authorize('closing.revise');
      const service=new (require('../../infrastructure/sqlite/services/six-month-closing').SixMonthClosingService)(this.db);
      if(command==='closingPeriodClose')return service.close({...input,userId:this.session.id});
      if(command==='closingPeriodHistory')return service.history();
      if(command==='closingPeriodDetail')return service.detail(input.closingId);
      return service.revise({...input,userId:this.session.id});
    }
    if(['bonusStockSummary','bonusStockEntries','bonusStockExport'].includes(command)){
      this.authorize('report.cost');
      const reports=require('./bonus-stock-report.cjs');
      if(command==='bonusStockSummary')return reports.bonusStockSummary(this.db,input);
      if(command==='bonusStockEntries')return reports.bonusStockEntries(this.db,input);
      if(input.format==='xlsx')return reports.bonusStockXlsx(this.db,input);
      if(input.format==='pdf')return reports.bonusStockPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.bonusStockCsv(this.db,input);
    }
    if(['lowStockSummary','lowStockEntries','lowStockExport'].includes(command)){
      this.authorize('inventory.view');
      const reports=require('./low-stock-report.cjs');
      if(command==='lowStockSummary')return reports.lowStockSummary(this.db,input);
      if(command==='lowStockEntries')return reports.lowStockEntries(this.db,input);
      if(input.format==='xlsx')return reports.lowStockXlsx(this.db,input);
      if(input.format==='pdf')return reports.lowStockPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.lowStockCsv(this.db,input);
    }
    if(['expirySummary','expiryEntries','expiryExport'].includes(command)){
      this.authorize('inventory.view');
      const reports=require('./expiry-report.cjs'),options={costVisible:this.permission('report.cost')};
      if(command==='expirySummary')return reports.expirySummary(this.db,input,options);
      if(command==='expiryEntries')return reports.expiryEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.expiryXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.expiryPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.expiryCsv(this.db,input,options);
    }
    if(['batchStockSummary','batchStockEntries','batchStockExport'].includes(command)){
      this.authorize('inventory.view');
      const reports=require('./batch-stock-report.cjs'),options={costVisible:this.permission('report.cost')};
      if(command==='batchStockSummary')return reports.batchStockSummary(this.db,input,options);
      if(command==='batchStockEntries')return reports.batchStockEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.batchStockXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.batchStockPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.batchStockCsv(this.db,input,options);
    }
    if(['stockMovementSummary','stockMovementEntries','stockMovementExport'].includes(command)){
      this.authorize('inventory.view');
      const reports=require('./stock-movement-report.cjs');
      if(command==='stockMovementSummary')return reports.stockMovementSummary(this.db,input);
      if(command==='stockMovementEntries')return reports.stockMovementEntries(this.db,input);
      if(input.format==='xlsx')return reports.stockMovementXlsx(this.db,input);
      if(input.format==='pdf')return reports.stockMovementPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.stockMovementCsv(this.db,input);
    }
    if(['adjustmentSummary','adjustmentEntries','adjustmentExport'].includes(command)){
      this.authorize('inventory.view');
      const reports=require('./adjustment-report.cjs');
      if(command==='adjustmentSummary')return reports.adjustmentSummary(this.db,input);
      if(command==='adjustmentEntries')return reports.adjustmentEntries(this.db,input);
      if(input.format==='xlsx')return reports.adjustmentXlsx(this.db,input);
      if(input.format==='pdf')return reports.adjustmentPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.adjustmentCsv(this.db,input);
    }
    if(['stockValuationSummary','stockValuationEntries','stockValuationExport'].includes(command)){
      this.authorize('inventory.view');this.authorize('report.cost');
      const reports=require('./stock-valuation-report.cjs');
      if(command==='stockValuationSummary')return reports.stockValuationSummary(this.db,input);
      if(command==='stockValuationEntries')return reports.stockValuationEntries(this.db,input);
      if(input.format==='xlsx')return reports.stockValuationXlsx(this.db,input);
      if(input.format==='pdf')return reports.stockValuationPdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.stockValuationCsv(this.db,input);
    }
    if(['customerBalanceSummary','customerBalanceEntries','customerBalanceExport'].includes(command)){
      this.authorize('dues.manage');
      const reports=require('./account-balance-reports.cjs');
      if(command==='customerBalanceSummary')return reports.accountBalanceSummary(this.db,input);
      if(command==='customerBalanceEntries')return reports.accountBalanceEntries(this.db,input);
      if(input.format==='xlsx')return reports.accountBalanceXlsx(this.db,input);
      if(input.format==='pdf')return reports.accountBalancePdf(this.db,input);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.accountBalanceCsv(this.db,input);
    }
    if(['supplierBalanceSummary','supplierBalanceEntries','supplierBalanceExport'].includes(command)){
      this.authorize('dues.manage');
      const reports=require('./account-balance-reports.cjs');
      if(command==='supplierBalanceSummary')return reports.accountBalanceSummary(this.db,input,{type:'supplier'});
      if(command==='supplierBalanceEntries')return reports.accountBalanceEntries(this.db,input,{type:'supplier'});
      if(input.format==='xlsx')return reports.accountBalanceXlsx(this.db,input,{type:'supplier'});
      if(input.format==='pdf')return reports.accountBalancePdf(this.db,input,{type:'supplier'});
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.accountBalanceCsv(this.db,input,{type:'supplier'});
    }
    if(['vendorBalanceSummary','vendorBalanceEntries','vendorBalanceExport'].includes(command)){
      this.authorize('dues.manage');this.authorize('expense.manage');
      const reports=require('./account-balance-reports.cjs');
      if(command==='vendorBalanceSummary')return reports.accountBalanceSummary(this.db,input,{type:'vendor'});
      if(command==='vendorBalanceEntries')return reports.accountBalanceEntries(this.db,input,{type:'vendor'});
      if(input.format==='xlsx')return reports.accountBalanceXlsx(this.db,input,{type:'vendor'});
      if(input.format==='pdf')return reports.accountBalancePdf(this.db,input,{type:'vendor'});
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.accountBalanceCsv(this.db,input,{type:'vendor'});
    }
    if(['overdueBalanceSummary','overdueBalanceEntries','overdueBalanceExport'].includes(command)){
      this.authorize('dues.manage');
      const reports=require('./account-balance-reports.cjs'),options={type:'overdue',vendorVisible:this.permission('expense.manage')};
      if(command==='overdueBalanceSummary')return reports.accountBalanceSummary(this.db,input,options);
      if(command==='overdueBalanceEntries')return reports.accountBalanceEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.accountBalanceXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.accountBalancePdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.accountBalanceCsv(this.db,input,options);
    }
    if(['settlementSummary','settlementEntries','settlementExport'].includes(command)){
      this.authorize('dues.manage');
      const reports=require('./settlement-report.cjs'),options={vendorVisible:this.permission('expense.manage')};
      if(command==='settlementSummary')return reports.settlementSummary(this.db,input,options);
      if(command==='settlementEntries')return reports.settlementEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.settlementXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.settlementPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.settlementCsv(this.db,input,options);
    }
    if(['dailyClosingSummary','dailyClosingEntries','dailyClosingExport'].includes(command)){
      this.authorize('closing.create');
      const reports=require('./daily-closing-report.cjs'),options={};
      if(command==='dailyClosingSummary')return reports.dailyClosingSummary(this.db,input,options);
      if(command==='dailyClosingEntries')return reports.dailyClosingEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.dailyClosingXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.dailyClosingPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.dailyClosingCsv(this.db,input,options);
    }
    if(['auditSummary','auditEntries','auditExport'].includes(command)){
      this.authorize('audit.view');
      const reports=require('./audit-report.cjs'),options={costVisible:this.permission('report.cost'),customerVisible:this.permission('customer.history')};
      if(command==='auditSummary')return reports.auditSummary(this.db,input,options);
      if(command==='auditEntries')return reports.auditEntries(this.db,input,options);
      if(input.format==='xlsx')return reports.auditXlsx(this.db,input,options);
      if(input.format==='pdf')return reports.auditPdf(this.db,input,options);
      if(input.format&&input.format!=='csv')throw Error('Choose a supported export format');
      return reports.auditCsv(this.db,input,options);
    }
    if(command.startsWith('closing')){
      const cash=new (require('../../infrastructure/sqlite/services/cash-closing').CashClosingService)(this.db);
      const daily=new (require('../../infrastructure/sqlite/services/daily-closing').DailyClosingService)(this.db);
      const config=new (require('../../infrastructure/sqlite/services/closing-configuration').ClosingConfigurationService)(this.db);
      if(command==='closingHandover'){
        this.authorize('closing.create');
        const day=this.db.prepare("SELECT id FROM BusinessDays WHERE status='open'").get();
        const prior=this.db.prepare("SELECT id,counted_cash_minor,business_day_id FROM CashShifts WHERE device_id='modern-desktop' AND status='closed' ORDER BY closed_at DESC,id DESC LIMIT 1").get();
        return prior&&day&&prior.business_day_id===day.id?{shiftId:prior.id,countedCashMinor:prior.counted_cash_minor}:null;
      }
      if(command==='closingShiftOpen'){
        this.authorize('closing.create');
        return cash.open({...input,userId:this.session.id,deviceId:'modern-desktop'});
      }
      if(command==='closingShiftClose'){
        this.authorize('closing.create');
        const shift=this.db.prepare('SELECT device_id,user_id FROM CashShifts WHERE id=?').get(input.shiftId);
        if(!shift||shift.device_id!=='modern-desktop')throw Error('Cash shift was not found');
        return cash.close({...input,userId:this.session.id,deviceId:'modern-desktop'});
      }
      if(command==='closingDayPreview'){
        this.authorize('closing.revise');
        return daily.preview(input);
      }
      if(command==='closingDayClose'){
        this.authorize('closing.revise');
        return daily.close({...input,userId:this.session.id});
      }
      if(command==='closingDayHistory'){
        this.authorize('closing.revise');
        return daily.history();
      }
      if(command==='closingDayDetail'){
        this.authorize('closing.revise');
        return daily.detail(input.businessDayId);
      }
      if(command==='closingDayRevise'){
        this.authorize('closing.revise');
        return daily.revise({...input,userId:this.session.id});
      }
      if(command==='closingConfig'){
        this.authorize('closing.revise');
        return {policy:config.policy(),accounts:config.accounts()};
      }
      if(command==='closingSavePolicy'){
        this.authorize('settings.manage');
        return config.savePolicy(input,this.session.id);
      }
      if(command==='closingSaveAccount'){
        this.authorize('settings.manage');
        return config.saveAccount(input,this.session.id);
      }
      if(command==='closingAllocate'){
        this.authorize('closing.revise');
        return config.allocate(input,this.session.id);
      }
      if(command==='closingSavingsTransfer'){
        this.authorize('closing.revise');
        return config.recordSavingsTransfer(input,this.session.id);
      }
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
    if(['customerSearch','customerDetail','duesList','duesHistory','receivableCollect','supplierPay','vendorPay','expenseMetadata','vendorSave','expenseList','expensePost','expenseVoid'].includes(command)){
      const service=new (require('./accounts.cjs').AccountsDesktop)(this.db);
      if(command==='customerSearch'||command==='customerDetail'){this.authorize('customer.history');return command==='customerSearch'?service.customers(input):service.customerDetail(input);}
      if(command==='duesList'||command==='duesHistory'||command==='receivableCollect'||command==='supplierPay'||command==='vendorPay'){
        this.authorize('dues.manage');
        if(command==='duesList')return service.dues(input);
        if(command==='duesHistory')return service.history(input);
        if(command==='receivableCollect')return service.collect(input,this.session);
        if(command==='supplierPay')return service.paySupplier(input,this.session);
        this.authorize('expense.manage');return service.payVendor(input,this.session);
      }
      this.authorize('expense.manage');
      if(command==='expenseMetadata')return service.metadata();
      if(command==='vendorSave')return service.saveVendor(input,this.session);
      if(command==='expenseList')return service.expenses(input);
      if(command==='expensePost')return service.postExpense(input,this.session);
      return service.voidExpense(input,this.session);
    }
    if (command === "dashboard") {
      this.authorize("sale.create");
      return dashboard(this.db, input, {
        userId: this.session.id,
        financial: this.permission("dues.manage"),
        costVisible: this.permission('report.cost'),
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
    if(['customerReturnPreview','customerReturnPost','supplierReturnPreview','supplierReturnPost'].includes(command)){
      const customer=command.startsWith('customer');
      this.authorize(customer?'return.customer':'return.supplier');
      const Service=customer?require('../../infrastructure/sqlite/services/customer-returns').CustomerReturnsService:require('../../infrastructure/sqlite/services/purchase-returns').PurchaseReturnsService;
      const service=new Service(this.db);
      const request={...input,returnedAt:null};
      return command.endsWith('Preview')?service.preview(request):service.post({...request,createdBy:this.session.id,roleCode:this.session.roleCode,deviceId:'modern-desktop'});
    }
    if(['invoiceSearch','invoiceDetail','customerHistory'].includes(command)){
      const service=new (require('./sales-history.cjs').SalesHistoryDesktop)(this.db);
      if(command==='customerHistory'){this.authorize('customer.history');return service.customerHistory(input);}
      this.authorize('invoice.search');
      if(command==='invoiceSearch')return service.search(input);
      return service.detail(input,{canPrint:this.permission('receipt.print'),canViewCustomerHistory:this.permission('customer.history'),canStartReturn:this.permission('return.customer'),canViewAudit:this.permission('audit.view')});
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
    if (command === "saleRecovery") {
      this.authorize("sale.create");
      const key = String(input.key || "");
      if (!/^TO-[a-f0-9-]{36}$/.test(key))
        throw Error("Invalid sale reference");
      const saved = this.db
        .prepare("SELECT id,created_by FROM Sales WHERE idempotency_key=?")
        .get(key);
      if (!saved) return { status: "not_found" };
      if (saved.created_by !== this.session.id)
        throw Error("Sale reference belongs to another user");
      return {
        status: "posted",
        receipt: new SalesQueryService(this.db).receipt(saved.id),
      };
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
        invoiceNumber: require('./settings.cjs').read(this.db, 'invoicePrefix') + '-' + String(input.key || '').replace(/^TO-/, ''),
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
        cashTenderedMinor:input.cashTenderedMinor==null?null:input.cashTenderedMinor,
        enforceCashTender:command==='post'&&creditMode==='paid'&&input.paymentMethod==='cash',
      };
      if(creditMode!=='paid'){
        const due=String(input.dueDate||'');
        sale.paymentMethod='credit';sale.collectionMethod=input.paymentMethod;
        sale.amountPaidMinor=creditMode==='credit'?0:input.paidMinor;sale.dueDate=due;
      }
      if (!/^TO-[a-f0-9-]{36}$/.test(sale.idempotencyKey))
        throw Error("Invalid sale reference");
      const requestFingerprint=crypto.createHash("sha256").update(JSON.stringify({items:sale.items,paymentMethod:sale.paymentMethod,customerId:sale.customerId,invoiceDiscountType:sale.invoiceDiscountType,invoiceDiscountValue:sale.invoiceDiscountValue,creditMode,amountPaidMinor:sale.amountPaidMinor||0,dueDate:sale.dueDate||null,collectionMethod:sale.collectionMethod||null,warningAcknowledged:sale.warningAcknowledged,doctorName:sale.doctorName,prescriptionReference:sale.prescriptionReference,cashTenderedMinor:sale.cashTenderedMinor})).digest("hex");
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
      return new SalesQuotationService(this.db).quote(sale);
    }
    throw Error("Unknown operation");
  }
}
module.exports = { Gateway };
