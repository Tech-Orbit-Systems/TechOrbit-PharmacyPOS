export type Theme = "light" | "dark" | "system";
export type Payment = "cash" | "card" | "digital";
export interface ClosingAccount {id:number;kind:'bank'|'wallet'|'savings';name:string;active:number}
export interface ClosingDay {
  businessDayId:number;openedAt:string;asOf:string;status:'open'|'closed';closedAt?:string;
  shiftCount:number;openShifts:number;legacyOpenShifts:number;unresolvedMovementCount:number;
  unresolvedMovements:{id:number;method:string;direction:string;amountMinor:number;needsShift:boolean}[];
  cashOpeningMinor:number;cashExpectedMinor:number;cashCountedMinor:number|null;cashVarianceMinor:number|null;
  accounts:{id:number;kind:string;name:string;inMinor:number;outMinor:number;expectedNetMinor:number;actualNetMinor?:number;varianceMinor?:number}[];
  savingsTransferredMinor:number;shifts:{id:number;user_id:number;device_id:string;status:string;opened_at:string;closed_at:string|null;counted_cash_minor:number|null}[];
  reason?:string|null;revisionNumber?:number;revisionReason?:string;
}
export interface PeriodAmounts {salesMinor:number;customerReturnsMinor:number;netSalesMinor:number;gstMinor:number;cogsMinor:number;grossProfitMinor:number;expensesMinor:number;operatingProfitMinor:number;purchasesMinor:number;purchaseReturnsMinor:number;savingsTransferredMinor:number}
export interface PeriodReport {
  periodStart:string;periodEnd:string;from:string;asOf:string;cycleStartMonth:number;
  cycleStart?:string;cycleEnd?:string;closingId?:number;revisionNumber?:number;
  months:({month:string}&PeriodAmounts)[];
  totals:PeriodAmounts;
}
export type CreditMode = 'paid' | 'partial' | 'credit';
export interface Product {
  id: number;
  name: string;
  genericName: string;
  manufacturer: string;
  strength: string;
  dosageForm: string;
  barcode: string;
  baseUnit: string;
  sellableBaseQuantity: number;
  prescriptionRequired: boolean;
  controlledMedicine: boolean;
  units: {
    unit_name: string;
    base_quantity: number;
    selling_price_minor: number | null;
    is_default_sale_unit: number;
    allows_fractional_quantity: number;
  }[];
  batches: {
    id: number;
    batch_number: string;
    expiry_date: string | null;
    quantity_on_hand: number;
    sale_price_minor: number;
  }[];
}
export interface Line {
  product: Product;
  unit: string;
  quantity: number;
  unitPrice: string;
  discountType: "fixed" | "percentage";
  discountValue: string;
  overrideBatchId: number | null;
  overrideReason: string;
}
export interface SaleInput {
  creditMode?:CreditMode;
  paidMinor?:number;
  dueDate?:string;
  key: string;
  paymentMethod: Payment;
  discountMinor?: number;
  invoiceDiscountType: "fixed" | "percentage";
  invoiceDiscountValue: number;
  customerId: number | null;
  warningAcknowledged?: boolean;
  doctorName?: string;
  prescriptionReference?: string;
  cashTenderedMinor?: number | null;
  items: { productId: number; saleUnit: string; quantity: number; unitPriceMinor:number; discountType:"fixed"|"percentage"; discountValue:number; overrideBatchId:number|null; overrideReason:string }[];
}
export interface User {
  id: number;
  displayName: string;
  roleCode: string;
  mustChangePassword: boolean;
  demo: boolean;
  canViewProfit:boolean;
  canViewSalesReport:boolean;
}
export interface Quote {
  amountPaidMinor:number;
  balanceDueMinor:number;
  grossMinor: number;
  invoiceDiscountMinor: number;
  gstMinor: number;
  roundingMinor: number;
  finalTotalMinor: number;
  cashTenderedMinor:number|null;
  cashChangeMinor:number|null;
  items: {
    productId: number;
    originalUnitPriceMinor:number;
    chargedUnitPriceMinor:number;
    grossMinor:number;
    lineDiscountMinor:number;
    gstMinor:number;
    lineTotalMinor:number;
    allocations: { batchId: number; quantity: number }[];
    warnings: { type: "near_expiry" | "prescription" | "controlled"; batchId?: number; expiryDate?: string }[];
  }[];
  warnings: { lineNumber: number; productId: number; type: "near_expiry" | "prescription" | "controlled"; batchId?: number; expiryDate?: string }[];
}
export interface Receipt {
  version:number;
  saleId:number;
  invoiceNumber: string;
  soldAt: string;
  profile:{pharmacyName:string;address:string|null;phone:string|null;taxRegistration:string|null;footer:string};
  cashier:{id:number|null;name:string;roleCode:string};
  customer:{name:string|null;phone:string|null};
  items: {
    lineNumber:number;
    productName: string;
    genericName:string|null;
    saleUnit: string;
    quantity: number;
    originalUnitPriceMinor:number;
    unitPriceMinor:number;
    grossMinor:number;
    lineDiscountMinor:number;
    invoiceDiscountMinor:number;
    gstRateBasisPoints:number;
    gstMinor:number;
    lineTotalMinor: number;
  }[];
  totals: {
    grossMinor:number;
    taxableMinor:number;
    exactTotalMinor:number;
    finalTotalMinor: number;
    lineDiscountMinor:number;
    gstMinor: number;
    roundingMinor: number;
    invoiceDiscountMinor: number;
  };
  payment: { method: string;amountPaidMinor:number;balanceDueMinor:number;dueDate:string|null;cashTenderedMinor:number|null;cashChangeMinor:number|null };
  warningAcknowledgement: null | { warnings:{lineNumber:number;productId:number;type:string;batchId?:number;expiryDate?:string}[];doctorName:string|null;prescriptionReference:string|null;acknowledgedBy:string;acknowledgedAt:string };
}
export interface DashboardData {
  range: { from: string; to: string; monthly: boolean };
  chart: { key: string; amount: number }[];
  rangeTotal: number;
  today: {
    net: number;
    profit: number | null;
    count: number;
    cash: number | null;
    operatingProfit:number|null;netExGst:number|null;refunds:number;
  };
  shift: boolean;
  low: any[];
  expiry: any[];
  balances: {
    receivable: { total: number; overdue: number };
    payable: { total: number; soon: number };
  } | null;
  vendorDues:number|null;expiredValue:number|null;reorderCount:number;
  businessKpis:{monthSalesMinor:number;cashReceivedMinor:number;digitalReceivedMinor:number;creditCreatedMinor:number|null;overdueDuesMinor:number|null;expensesMinor:number|null};
  stockKpis:{totalProducts:number;outOfStockProducts:number;lowStockProducts:number;nearExpiryBatches:number;expiredBatches:number;totalStockValueMinor:number|null;sellableStockValueMinor:number|null};
  recent: any[];
}
export interface ProfitLossReport {
  range:{from:string;to:string;start:string;end:string;asOf:string};
  salesGrossMinor:number;listedGrossMinor:number;salesGstMinor:number;salesExGstMinor:number;salesDiscountMinor:number;salesRoundingMinor:number;saleCount:number;
  returnsGrossMinor:number;returnsGstMinor:number;returnsExGstMinor:number;returnedCogsMinor:number;returnCount:number;
  netRevenueMinor:number;soldCogsMinor:number;cogsMinor:number;grossProfitMinor:number;expensesMinor:number;expenseCount:number;operatingProfitMinor:number;
}
export interface ReportEntry {kind:string;id:number;occurred_at:string;reference:string;gross_minor:number;gst_minor:number;cogs_minor:number;contribution_minor:number}
export interface ReportEntries {range:{from:string;to:string};page:number;pageSize:number;hasMore:boolean;items:ReportEntry[]}
export interface DailySalesRow {day:string;kind?:string;id?:number;occurred_at?:string;reference?:string;customer?:string|null;cashier?:string|null;method?:string;
  salesMinor:number;returnsMinor:number;netSalesMinor:number;gstMinor:number;netExGstMinor:number;discountMinor:number;cogsMinor:number|null;grossProfitMinor:number|null;
  paidAtSaleMinor:number;creditCreatedMinor:number;refundMinor:number;receivableCreditMinor:number;saleCount:number;returnCount:number}
export interface DailySalesSummary {range:{from:string;to:string};dayMode:'official'|'calendar';period:'day'|'week'|'month';days:DailySalesRow[];totals:DailySalesRow;costVisible:boolean;filterScope:string}
export interface DailySalesEntries {range:{from:string;to:string};dayMode:'official'|'calendar';page:number;pageSize:number;hasMore:boolean;items:DailySalesRow[]}
export interface DailySalesInput {range:string;period?:'day'|'week'|'month';groupBy?:'medicine'|'generic';dayMode?:'official'|'calendar';from?:string;to?:string;product?:string;generic?:string;category?:string;brand?:string;supplier?:string;customer?:string;cashier?:string;method?:string}
export interface Api {
  medicineSummary(input:DailySalesInput):Promise<{groups:{groupKey:string;groupLabel:string;productId:number;medicine:string;generic:string;category:string;brand:string;soldQuantity:number;returnedQuantity:number;salesMinor:number;returnsMinor:number;netSalesMinor:number;gstMinor:number;netExGstMinor:number;discountMinor:number;cogsMinor:number|null;grossProfitMinor:number|null}[];totals:{netSalesMinor:number;gstMinor:number;cogsMinor:number|null;grossProfitMinor:number|null};costVisible:boolean;scope:string}>;
  medicineEntries(input:DailySalesInput&{page:number;pageSize?:number}):Promise<{page:number;pageSize:number;hasMore:boolean;items:{day:string;kind:string;reference:string;medicine:string;generic:string;quantity:number;netSalesMinor:number;gstMinor:number;cogsMinor:number|null;grossProfitMinor:number|null}[]}>;
  medicineExport(input:DailySalesInput&{format:'csv'|'xlsx'|'pdf'}):Promise<{saved:boolean}>;
  dailySalesSummary(input:DailySalesInput):Promise<DailySalesSummary>;
  dailySalesEntries(input:DailySalesInput&{page:number;pageSize?:number}):Promise<DailySalesEntries>;
  dailySalesExport(input:DailySalesInput&{format:'csv'|'xlsx'|'pdf'}):Promise<{saved:boolean}>;
  reportProfitLoss(input:{range:string;from?:string;to?:string}):Promise<ProfitLossReport>;
  reportEntries(input:{range:string;from?:string;to?:string;page:number;pageSize?:number}):Promise<ReportEntries>;
  reportExport(input:{range:string;from?:string;to?:string;format:'csv'|'xlsx'|'pdf'}):Promise<{saved:boolean}>;
  supplierList(input:{q:string}):Promise<Supplier[]>;
  supplierSave(input:SupplierInput):Promise<Supplier>;
  purchaseProducts(input:{q:string}):Promise<PurchaseProduct[]>;
  purchasePreview(input:PurchaseInput):Promise<PurchasePreview>;
  purchasePost(input:PurchaseInput):Promise<PurchaseResult>;
  purchaseHistory(input:{supplierId?:number}):Promise<PurchaseHistory[]>;
  purchaseDetail(input:{id:number}):Promise<PurchaseDetail>;
  customerReturnPreview(input:CustomerReturnInput):Promise<CustomerReturnPreview>;
  customerReturnPost(input:CustomerReturnInput):Promise<ReturnResult>;
  supplierReturnPreview(input:SupplierReturnInput):Promise<SupplierReturnPreview>;
  supplierReturnPost(input:SupplierReturnInput):Promise<ReturnResult>;
  productImportInspect(input:{name:string;base64:string}):Promise<ProductImportInspection>;
  productImportPreview(input:{name:string;base64:string;mapping:Record<string,string>;duplicatePolicy:string}):Promise<ProductImportPreview>;
  productImportTemplate(input?:undefined):Promise<DownloadFile>;
  productImportErrors(input:{jobId:number}):Promise<DownloadFile>;
  productImportCommit(input:{jobId:number}):Promise<{jobId:number;status:string;committedRows:number;skippedRows:number}>;
  openingStockProducts(input:{q:string}):Promise<OpeningStockProduct[]>;
  openingStockPreviewManual(input:Record<string,unknown>):Promise<OpeningStockPreview>;
  openingStockPreviewFile(input:{name:string;base64:string}):Promise<OpeningStockPreview>;
  openingStockTemplate(input?:undefined):Promise<{name:string;mime:string;base64:string}>;
  openingStockCommit(input:{jobId:number}):Promise<{jobId:number;status:string;committedRows:number}>;
  inventoryList(input:{q:string;stock:string;expiry:string;page:number}):Promise<InventoryResult>;
  inventoryDetail(input:{batchId:number}):Promise<{batch:InventoryBatch;movements:InventoryMovement[];costVisible:boolean}>;
  stockAdjustmentDetail(input:{batchId:number}):Promise<StockAdjustmentBatch>;
  stockAdjustmentPost(input:{batchId:number;mode:string;quantity:number;reason:string;occurredAt:string;idempotencyKey:string}):Promise<{adjustmentId:number;itemCount:number;idempotent:boolean}>;
  packingDetail(input:{id:number}):Promise<ProductMasterResult & {historyLocked:boolean}>;
  packingSave(input:Record<string,unknown>):Promise<ProductMasterResult & {historyLocked:boolean}>;
  productList(input:{q:string;state:string;page:number}):Promise<{items:ProductSummary[];total:number;page:number;pageSize:number}>;
  productDetail(input:{id:number}):Promise<ProductMasterResult>;
  productSave(input:Record<string,unknown>):Promise<ProductMasterResult>;
  productSuppliers():Promise<{id:number;name:string}[]>;
  shiftStatus():Promise<{id:number;opened_at:string;device_id:string}|null>;
  closingShiftPreview(input:{shiftId:number}):Promise<{shiftId:number;userId:number|null;deviceId:string;status:string;openedAt:string;closedAt:string|null;openingCashMinor:number;expectedCashMinor:number;countedCashMinor:number|null;varianceMinor:number|null;unattributedCashCount:number;movements:{method:string;direction:string;amount:number}[]}>;
  closingPeriodPreview(input:{asOf?:string}):Promise<PeriodReport>;
  closingPeriodRangePreview(input:{from:string;to:string}):Promise<PeriodReport>;
  closingPeriodCompletedPreview(input:{cycleStart?:string}):Promise<PeriodReport>;
  closingPeriodClose(input:{cycleStart:string;notes:string}):Promise<PeriodReport>;
  closingPeriodHistory(input:Record<string,never>):Promise<{id:number;period_start:string;period_end:string;closed_at:string;legacy:number;revisionCount:number}[]>;
  closingPeriodDetail(input:{closingId:number}):Promise<{closingId:number;legacy:boolean;original?:PeriodReport;current?:PeriodReport;originalTotals?:PeriodReport['totals'];periodStart?:string;periodEnd?:string;revisions:{revision_number:number;reason:string;revised_at:string}[]}>;
  closingPeriodRevise(input:{closingId:number;reason:string}):Promise<PeriodReport>;
  closingPeriodExport(input:{from?:string;to?:string;closingId?:number}):Promise<{saved:boolean}>;
  closingHandover():Promise<{shiftId:number;countedCashMinor:number}|null>;
  closingShiftOpen(input:{openingCashMinor:number;handoverConfirmed:boolean}):Promise<{id:number;business_day_id:number}>;
  closingShiftClose(input:{shiftId:number;countedCashMinor:number;varianceReason:string;forcedCloseReason:string}):Promise<{shiftId:number;varianceMinor:number}>;
  closingDayPreview(input:Record<string,never>):Promise<ClosingDay>;
  closingDayClose(input:{accountActuals:Record<number,number>;reason:string}):Promise<ClosingDay>;
  closingDayHistory(input:Record<string,never>):Promise<{id:number;opened_at:string;closed_at:string;revisionCount:number}[]>;
  closingDayDetail(input:{businessDayId:number}):Promise<{original:ClosingDay;current:ClosingDay;revisions:{revision_number:number;reason:string;revised_at:string}[]}>;
  closingDayRevise(input:{businessDayId:number;cashCountedMinor:number;accountActuals:Record<number,number>;reason:string}):Promise<ClosingDay>;
  closingConfig(input:Record<string,never>):Promise<{policy:{varianceToleranceMinor:number;sixMonthCycleStartMonth:number};accounts:ClosingAccount[]}>;
  closingSavePolicy(input:{varianceToleranceMinor:number;sixMonthCycleStartMonth:number}):Promise<{varianceToleranceMinor:number;sixMonthCycleStartMonth:number}>;
  closingSaveAccount(input:{id?:number;kind:'bank'|'wallet'|'savings';name:string;active:boolean}):Promise<ClosingAccount>;
  closingAllocate(input:{movementId:number;accountId:number}):Promise<{movementId:number;accountId:number}>;
  closingSavingsTransfer(input:{accountId:number;amountMinor:number;reference:string}):Promise<{id:number;amountMinor:number}>;
  createCustomer(input:{name:string;phone:string}):Promise<{id:number;name:string;phone:string}>;
  customerSearch(input:{q:string;page:number;pageSize?:number}):Promise<CustomerSearchResult>;
  customerDetail(input:{id:number}):Promise<CustomerAccountDetail>;
  duesList(input:{type:string;status:string;q:string;page:number;pageSize?:number}):Promise<DuesResult>;
  duesHistory(input:{type:string;id:number}):Promise<AccountPayment[]>;
  receivableCollect(input:SettlementInput):Promise<SettlementResult>;
  supplierPay(input:SettlementInput):Promise<SettlementResult>;
  vendorPay(input:SettlementInput):Promise<SettlementResult>;
  expenseMetadata():Promise<{categories:{id:number;name:string}[];vendors:Vendor[]}>;
  vendorSave(input:{id?:number;name:string;phone:string;active:boolean}):Promise<Vendor>;
  expenseList(input:{q:string;page:number;pageSize?:number}):Promise<ExpenseResult>;
  expensePost(input:ExpenseInput):Promise<{expenseId:number;incurredAmountMinor:number;amountPaidMinor:number;balanceDueMinor:number;status:string;idempotent:boolean}>;
  expenseVoid(input:{expenseId:number;reason:string}):Promise<{expenseId:number;status:string}>;
  login(input: { username: string; password: string }): Promise<User>;
  logout(): Promise<unknown>;
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<unknown>;
  dashboard(input: {
    range: string;
    from?: string;
    to?: string;
  }): Promise<DashboardData>;
  search(input: { q: string }): Promise<Product[]>;
  barcode(input: { barcode: string }): Promise<Product | null>;
  alternativeSearch(input: { productId: number }): Promise<AlternativeResult>;
  alternativeSelect(input: { sourceProductId: number; alternativeProductId: number }): Promise<Product>;
  customers(): Promise<{ id: number; name: string; phone: string }[]>;
  invoiceSearch(input:InvoiceSearchInput):Promise<InvoiceSearchResult>;
  invoiceDetail(input:{id:number}):Promise<InvoiceDetail>;
  customerHistory(input:{phone:string;page?:number}):Promise<InvoiceSearchResult>;
  ledger(input: { type: string }): Promise<any[]>;
  quote(input: SaleInput): Promise<Quote>;
  post(input: SaleInput): Promise<Receipt>;
  saleRecovery(input:{key:string}):Promise<{status:"posted";receipt:Receipt}|{status:"not_found"}>;
}
declare global {
  interface Window {
    pharmacy: Api;
  }
}
export interface ProductSummary {id:number;sku:string|null;name:string;barcode:string|null;generic_name:string|null;manufacturer:string|null;strength:string|null;base_unit:string;default_sale_price_minor:number;active:number}
export interface ProductMasterResult {product?:Record<string,string|number|boolean|null>;units?:Product['units'];needsConfirmation?:boolean;duplicates?:{id:number;name:string}[]}
export interface AlternativeResult {source:{id:number;name:string;genericName:string;strength:string;dosageForm:string};items:Product[]}
export interface InventoryBatch {
  id:number;productId:number;name:string;genericName:string|null;manufacturer:string|null;baseUnit:string;
  batchNumber:string|null;manufacturingDate:string|null;expiryDate:string|null;supplierName:string|null;
  openingQuantity:number;purchasedQuantity:number;bonusQuantity:number;soldQuantity:number;
  customerReturnQuantity:number;supplierReturnQuantity:number;adjustmentQuantity:number;disposedQuantity:number;
  physicalQuantity:number;sellableQuantity:number;minimumStock:number;reorderLevel:number;
  stockStatus:string;expiryStatus:string;effectiveCostMinor:number|null;stockValueMinor:number|null;
}
export interface InventoryMovement {id:number;movement_type:string;quantity_delta:number;reference_type:string;reference_id:string|null;occurred_at:string;note:string|null;user_name:string|null}
export interface StockAdjustmentBatch {batchId:number;batchNumber:string|null;expiryDate:string|null;physicalQuantity:number;name:string;genericName:string|null;baseUnit:string;controlledMedicine:boolean}
export interface InventoryResult {items:InventoryBatch[];total:number;page:number;pageSize:number;costVisible:boolean;asOfDate:string}
export interface OpeningStockProduct {id:number;sku:string|null;barcode:string|null;name:string;generic_name:string|null;product_type:string;base_unit:string;locked:boolean;units:{unit_name:string;base_quantity:number;allows_fractional_quantity:number}[]}
export interface OpeningStockPreviewRow {rowNumber:number;action:string;errors:string[];normalized:{productId:number|null;sku:string|null;barcode:string|null;name:string|null;batchNumber:string|null;expiryDate:string|null;entryDate:string;unit:string;quantity:number;baseQuantity:number;unitCostMinor:number;note:string|null}}
export interface OpeningStockPreview {jobId:number;totalRows:number;validRows:number;errorRows:number;skippedRows:number;rows:OpeningStockPreviewRow[]}
export interface DownloadFile {name:string;mime:string;base64:string}
export interface Supplier {id:number;name:string;phone:string|null;email:string|null;address:string|null;active:number;purchase_count?:number;balance_minor?:number}
export interface SupplierInput {id?:number;name:string;phone:string;email:string;address:string;active:boolean}
export interface PurchaseProduct {id:number;name:string;generic_name:string|null;product_type:string;base_unit:string;default_sale_price_minor:number;units:{unitName:string;baseQuantity:number;sellingPriceMinor:number|null;default:number}[]}
export interface PurchaseLineInput {productId:number;purchaseUnit:string;purchasedQuantity:number;bonusQuantity:number;unitCostMinor:number;salePriceMinor:number;batchNumber:string;expiryDate:string;manufacturingDate:string;updateSellingPrice:boolean}
export interface PurchaseInput {supplierId:number;invoiceNumber:string;purchasedAt:string;paymentMethod:string;amountPaidMinor:number;dueDate:string;notes:string;idempotencyKey:string;items:PurchaseLineInput[]}
export interface PurchasePreviewLine {line:number;productId:number;name:string;purchaseUnit:string;purchasedQuantity:number;bonusQuantity:number;baseQuantityReceived:number;lineTotalMinor:number;effectiveUnitCostMinor:number;batchNumber:string|null;expiryDate:string|null}
export interface PurchasePreview extends PurchaseInput {lines:PurchasePreviewLine[];totalMinor:number;balanceDueMinor:number}
export interface PurchaseResult {purchaseId:number;totalMinor:number;amountPaidMinor:number;balanceDueMinor:number;idempotent:boolean}
export interface PurchaseHistory {id:number;invoice_number:string;purchased_at:string;total_minor:number;amount_paid_minor:number;balance_due_minor:number;payment_method:string;due_date:string|null;supplier_name:string;item_count:number}
export interface PurchaseDetail extends PurchaseHistory {notes:string|null;items:{id:number;product_name:string;purchase_unit:string;purchased_quantity:number;bonus_quantity:number;batch_number:string|null;expiry_date:string|null;base_quantity_received:number;effective_unit_cost_minor:number;line_total_minor:number;returned_quantity:number;returnable_base_quantity:number;batch_available_quantity:number}[];returns:{id:number;returned_at:string;total_minor:number;payable_credit_minor:number;refund_minor:number;reason:string}[]}
export interface CustomerReturnInput {saleId:number;reason:string;refundMethod:string|null;idempotencyKey:string;items:{saleItemId:number;baseQuantity:number;restockable:boolean;conditionConfirmed:boolean}[]}
export interface SupplierReturnInput {purchaseId:number;reason:string;refundMethod:string|null;idempotencyKey:string;items:{purchaseItemId:number;quantity:number}[]}
export interface ReturnResult {returnId:number;totalMinor:number;refundMinor:number;receivableCreditMinor?:number;payableCreditMinor?:number;idempotent:boolean}
export interface CustomerReturnPreview {invoiceNumber:string;totalMinor:number;receivableCreditMinor:number;refundMinor:number;lines:{saleItemId:number;baseQuantity:number;restockable:boolean;totalMinor:number;gstMinor:number;cogsMinor:number;allocations:{batchNumber:string|null;baseQuantity:number}[]}[]}
export interface SupplierReturnPreview {invoiceNumber:string|null;totalMinor:number;payableCreditMinor:number;refundMinor:number;lines:{purchaseItemId:number;quantity:number;remainingQuantity:number;totalMinor:number;batchNumber:string|null}[]}
export interface ProductImportInspection {headers:string[];totalRows:number;sampleRows:Record<string,unknown>[];suggestedMapping:Record<string,string>}
export interface ProductImportPreviewRow {rowNumber:number;action:string;errors:string[];normalized:{sku:string|null;barcode:string|null;name:string|null;manufacturer:string|null;baseUnit:string}}
export interface ProductImportPreview {jobId:number;totalRows:number;validRows:number;errorRows:number;skippedRows:number;rows:ProductImportPreviewRow[]}
export interface InvoiceSearchInput {invoiceNumber:string;product:string;phone:string;paymentStatus:string;dateFrom:string;dateTo:string;page:number}
export interface InvoiceSummary {id:number;invoice_number:string;sold_at:string;customer_name_snapshot:string|null;customer_phone_snapshot:string|null;payment_method:string;payment_status:string;final_total_minor:number;amount_paid_minor:number;balance_due_minor:number;due_date:string|null;products:string|null}
export interface InvoiceSearchResult {items:InvoiceSummary[];total:number;page:number;pageSize:number}
export interface InvoiceDetail {saleId:number;invoiceNumber:string;soldAt:string;status:string;customer:{id:number|null;name:string|null;phone:string|null};payment:{method:string;status:string;amountPaidMinor:number;balanceDueMinor:number;dueDate:string|null;cashTenderedMinor:number|null;cashChangeMinor:number|null};totals:{grossMinor:number;lineDiscountMinor:number;invoiceDiscountMinor:number;taxableMinor:number;gstMinor:number;exactTotalMinor:number;roundingMinor:number;finalTotalMinor:number};receipt:Receipt;items:{id:number;lineNumber:number;productName:string;genericName:string|null;saleUnit:string;quantity:number;baseQuantity:number;unitPriceMinor:number;lineDiscountMinor:number;gstMinor:number;lineTotalMinor:number;returnedBaseQuantity:number;returnedMinor:number;returnableBaseQuantity:number}[];receivable:{id:number;balance_minor:number;due_date:string;status:string}|null;payments:{id:number;amount_minor:number;method:string;collected_at:string}[];returns:{id:number;returned_at:string;total_minor:number;receivable_credit_minor:number;refund_minor:number;reason:string}[];audit:{id:number;occurred_at:string;action:string;role_code:string|null;reason:string|null;new_json:unknown}[];actions:{canPrint:boolean;canViewCustomerHistory:boolean;canStartReturn:boolean;canViewAudit:boolean}}
export interface CustomerSummary {id:number;name:string;phone:string;normalized_phone:string;invoice_count:number;outstanding_minor:number}
export interface CustomerSearchResult {items:CustomerSummary[];total:number;page:number;pageSize:number}
export interface CustomerAccountDetail {customer:{id:number;name:string;phone:string;normalized_phone:string;created_at:string};summary:{invoice_count:number;invoiced_minor:number;collected_minor:number;outstanding_minor:number};invoices:{id:number;invoice_number:string;sold_at:string;final_total_minor:number;amount_paid_minor:number;balance_due_minor:number;payment_status:string;due_date:string|null}[];collections:{id:number;receivable_id:number;amount_minor:number;method:string;collected_at:string;invoice_number:string}[];returns:{id:number;total_minor:number;receivable_credit_minor:number;refund_minor:number;returned_at:string;invoice_number:string}[]}
export interface DueRow {type:'customer'|'supplier'|'vendor';id:number;party:string;reference:string;origin_date:string;due_date:string|null;original_minor:number;paid_minor:number;balance_minor:number;status:string;payment_count:number;overdue:number;settleable:number}
export interface DuesResult {items:DueRow[];total:number;page:number;pageSize:number}
export interface AccountPayment {id:number;amount_minor:number;method:string;reference?:string|null;occurred_at:string;audit_at:string|null;role_code:string|null}
export interface SettlementInput {payableId?:number;receivableId?:number;amountMinor:number;method:string;paidAt?:string;collectedAt?:string;reference:string;idempotencyKey:string}
export interface SettlementResult {paymentId:number;amountMinor:number;balanceMinor:number;status:string;idempotent:boolean}
export interface Vendor {id:number;name:string;phone:string|null;active:number;balance_minor:number}
export interface ExpenseInput {categoryId:number;vendorId:number|null;incurredAmountMinor:number;amountPaidMinor:number;method:string;expenseDate:string;dueDate:string;reference:string;description:string;idempotencyKey:string}
export interface ExpenseRow {id:number;expense_date:string;description:string;reference:string|null;amount_minor:number;amount_paid_minor:number;balance_due_minor:number;method:string;due_date:string|null;status:string;category_name:string;vendor_name:string|null;payable_id:number|null}
export interface ExpenseResult {items:ExpenseRow[];total:number;page:number;pageSize:number}
