export type Theme = "light" | "dark" | "system";
export type Payment = "cash" | "card" | "digital";
export type CreditMode = 'paid' | 'partial' | 'credit';
export interface Product {
  id: number;
  name: string;
  genericName: string;
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
}
export interface SaleInput {
  creditMode?:CreditMode;
  paidMinor?:number;
  dueDate?:string;
  key: string;
  paymentMethod: Payment;
  discountMinor: number;
  customerId: number | null;
  items: { productId: number; saleUnit: string; quantity: number }[];
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
    lineTotalMinor: number;
  }[];
  totals: {
    finalTotalMinor: number;
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
