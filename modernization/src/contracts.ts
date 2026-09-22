export type Theme = "light" | "dark" | "system";
export type Payment = "cash" | "card" | "digital";
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
  items: { productId: number; saleUnit: string; quantity: number; unitPriceMinor:number; discountType:"fixed"|"percentage"; discountValue:number; overrideBatchId:number|null; overrideReason:string }[];
}
export interface User {
  id: number;
  displayName: string;
  roleCode: string;
  mustChangePassword: boolean;
  demo: boolean;
}
export interface Quote {
  amountPaidMinor:number;
  balanceDueMinor:number;
  grossMinor: number;
  invoiceDiscountMinor: number;
  gstMinor: number;
  roundingMinor: number;
  finalTotalMinor: number;
  items: {
    productId: number;
    originalUnitPriceMinor:number;
    chargedUnitPriceMinor:number;
    grossMinor:number;
    lineDiscountMinor:number;
    gstMinor:number;
    lineTotalMinor:number;
    allocations: { batchId: number; quantity: number }[];
  }[];
}
export interface Receipt {
  invoiceNumber: string;
  soldAt: string;
  items: {
    productName: string;
    saleUnit: string;
    quantity: number;
    originalUnitPriceMinor:number;
    unitPriceMinor:number;
    lineDiscountMinor:number;
    gstMinor:number;
    lineTotalMinor: number;
  }[];
  totals: {
    finalTotalMinor: number;
    lineDiscountMinor:number;
    gstMinor: number;
    roundingMinor: number;
    invoiceDiscountMinor: number;
  };
  payment: { method: string;amountPaidMinor:number;balanceDueMinor:number;dueDate:string|null };
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
  };
  shift: boolean;
  low: any[];
  expiry: any[];
  balances: {
    receivable: { total: number; overdue: number };
    payable: { total: number; soon: number };
  } | null;
  recent: any[];
}
export interface Api {
  supplierList(input:{q:string}):Promise<Supplier[]>;
  supplierSave(input:SupplierInput):Promise<Supplier>;
  purchaseProducts(input:{q:string}):Promise<PurchaseProduct[]>;
  purchasePreview(input:PurchaseInput):Promise<PurchasePreview>;
  purchasePost(input:PurchaseInput):Promise<PurchaseResult>;
  purchaseHistory(input:{supplierId?:number}):Promise<PurchaseHistory[]>;
  purchaseDetail(input:{id:number}):Promise<PurchaseDetail>;
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
  createCustomer(input:{name:string;phone:string}):Promise<{id:number;name:string;phone:string}>;
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
  ledger(input: { type: string }): Promise<any[]>;
  quote(input: SaleInput): Promise<Quote>;
  post(input: SaleInput): Promise<Receipt>;
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
export interface PurchaseDetail extends PurchaseHistory {notes:string|null;items:{id:number;product_name:string;purchase_unit:string;purchased_quantity:number;bonus_quantity:number;batch_number:string|null;expiry_date:string|null;base_quantity_received:number;effective_unit_cost_minor:number;line_total_minor:number}[]}
export interface ProductImportInspection {headers:string[];totalRows:number;sampleRows:Record<string,unknown>[];suggestedMapping:Record<string,string>}
export interface ProductImportPreviewRow {rowNumber:number;action:string;errors:string[];normalized:{sku:string|null;barcode:string|null;name:string|null;manufacturer:string|null;baseUnit:string}}
export interface ProductImportPreview {jobId:number;totalRows:number;validRows:number;errorRows:number;skippedRows:number;rows:ProductImportPreviewRow[]}
