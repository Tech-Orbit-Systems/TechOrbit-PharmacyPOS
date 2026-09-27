const crypto=require("crypto");
const METHODS=new Set(["cash","card","digital","bank_transfer","mobile_wallet","other"]);
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const validDate=(value,label)=>{if(Number.isNaN(Date.parse(value)))throw new Error(`Choose a valid ${label}`);return value;};

class ExpensesService{
 constructor(db){this.db=db;this.postTx=db.transaction(x=>this.postInternal(x));this.settleTx=db.transaction(x=>this.settleInternal(x));this.voidTx=db.transaction(x=>this.voidInternal(x));}
 post(x){
  if(!x?.idempotencyKey?.trim())throw new Error("Idempotency key is required");
  const incurred=Number(x.incurredAmountMinor??x.amountMinor),paid=Number(x.amountPaidMinor??incurred),method=x.method||"cash";
  const normalized={categoryId:Number(x.categoryId),vendorId:x.vendorId==null?null:Number(x.vendorId),incurredAmountMinor:incurred,amountPaidMinor:paid,method,expenseDate:x.expenseDate||null,dueDate:x.dueDate||null,reference:String(x.reference||"").trim()||null,description:String(x.description||"").trim()};
  const requestFingerprint=hash(normalized),old=this.db.prepare("SELECT * FROM Expenses WHERE idempotency_key=?").get(x.idempotencyKey.trim());
  if(old){if(!old.request_fingerprint)throw new Error("This legacy expense reference cannot be replayed safely; review the saved expense");if(old.request_fingerprint!==requestFingerprint)throw new Error("Expense reference was already used with different details");return{...this.result(old),idempotent:true};}
  return this.postTx({...x,...normalized,requestFingerprint});
 }
 postInternal(x){
  const category=this.db.prepare("SELECT id FROM ExpenseCategories WHERE id=? AND active=1").get(x.categoryId);if(!category)throw new Error("Active expense category was not found");
  const amount=Number(x.incurredAmountMinor),paid=Number(x.amountPaidMinor),method=x.method;
  if(!Number.isSafeInteger(amount)||amount<=0)throw new Error("Expense amount must be a positive integer");
  if(!Number.isSafeInteger(paid)||paid<0||paid>amount)throw new Error("Amount paid cannot exceed the expense amount");
  if(paid>0&&!METHODS.has(method))throw new Error("Choose the actual payment method");
  if(!x.description)throw new Error("Expense description is required");
  const at=validDate(x.expenseDate||new Date().toISOString(),"expense date"),balance=amount-paid;
  if(balance>0){if(!x.vendorId)throw new Error("Vendor is required when an expense balance remains");if(!x.dueDate)throw new Error("Due date is required when an expense balance remains");validDate(x.dueDate,"due date");if(x.dueDate<at.slice(0,10))throw new Error("Due date cannot be earlier than the expense date");}
  const vendor=x.vendorId?this.db.prepare("SELECT * FROM Vendors WHERE id=? AND active=1").get(x.vendorId):null;if(x.vendorId&&!vendor)throw new Error("Active vendor was not found");
  const now=new Date().toISOString(),storedMethod=paid>0?method:"credit";
  const id=Number(this.db.prepare(`INSERT INTO Expenses(category_id,amount_minor,method,expense_date,vendor,description,idempotency_key,status,created_by,created_at,vendor_id,amount_paid_minor,balance_due_minor,due_date,reference,request_fingerprint) VALUES (?,?,?,?,?,?,?,'posted',?,?,?,?,?,?,?,?)`).run(category.id,amount,storedMethod,at,vendor?.name||null,x.description,x.idempotencyKey.trim(),x.createdBy||null,now,vendor?.id||null,paid,balance,x.dueDate||null,x.reference,x.requestFingerprint).lastInsertRowid);
  if(paid>0)this.money("out",method,paid,"expense",id,at,x.createdBy,x.reference||x.description,x.deviceId);
  if(balance>0)this.db.prepare("INSERT INTO ExpensePayables(expense_id,vendor_id,original_minor,balance_minor,due_date,status,created_at,updated_at) VALUES (?,?,?,?,?,'unpaid',?,?)").run(id,vendor.id,balance,balance,x.dueDate,now,now);
  this.audit("expense.post",id,x,null,{incurredAmountMinor:amount,amountPaidMinor:paid,balanceDueMinor:balance,method:storedMethod,vendorId:vendor?.id||null,dueDate:x.dueDate,reference:x.reference});
  return{...this.result(this.db.prepare("SELECT * FROM Expenses WHERE id=?").get(id)),idempotent:false};
 }
 settle(x){
  if(!x?.payableId||!x.idempotencyKey?.trim())throw new Error("Vendor payable and idempotency key are required");
  const normalized={payableId:Number(x.payableId),amountMinor:Number(x.amountMinor),method:x.method||"cash",paidAt:x.paidAt||null,reference:String(x.reference||"").trim()||null},requestFingerprint=hash(normalized);
  const old=this.db.prepare("SELECT * FROM ExpensePayments WHERE idempotency_key=?").get(x.idempotencyKey.trim());if(old){if(old.request_fingerprint!==requestFingerprint)throw new Error("Payment reference was already used with different details");return{...this.paymentResult(old),idempotent:true};}
  return this.settleTx({...x,...normalized,requestFingerprint});
 }
 settleInternal(x){
  const payable=this.db.prepare("SELECT * FROM ExpensePayables WHERE id=?").get(x.payableId);if(!payable)throw new Error("Vendor payable was not found");if(payable.status==='paid'||Number(payable.balance_minor)===0)throw new Error("Vendor payable is already settled");
  const expense=this.db.prepare("SELECT * FROM Expenses WHERE id=? AND status='posted'").get(payable.expense_id);if(!expense)throw new Error("Linked expense was not found");
  const amount=Number(x.amountMinor),method=x.method||"cash";if(!Number.isSafeInteger(amount)||amount<=0||amount>Number(payable.balance_minor))throw new Error("Payment must be positive and not exceed balance");if(!METHODS.has(method))throw new Error("Unsupported payment method");
  const paidAt=validDate(x.paidAt||new Date().toISOString(),"payment date");if(Date.parse(paidAt)<Date.parse(expense.expense_date))throw new Error("Payment date cannot be earlier than the expense");const now=new Date().toISOString();
  const id=Number(this.db.prepare("INSERT INTO ExpensePayments(payable_id,expense_id,vendor_id,amount_minor,method,reference,idempotency_key,request_fingerprint,paid_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(payable.id,expense.id,payable.vendor_id,amount,method,x.reference,x.idempotencyKey.trim(),x.requestFingerprint,paidAt,x.createdBy||null,now).lastInsertRowid);
  const balance=Number(payable.balance_minor)-amount,status=balance===0?'paid':'partial';this.db.prepare("UPDATE ExpensePayables SET balance_minor=?,status=?,updated_at=? WHERE id=?").run(balance,status,now,payable.id);this.db.prepare("UPDATE Expenses SET amount_paid_minor=amount_paid_minor+?,balance_due_minor=? WHERE id=?").run(amount,balance,expense.id);
  this.money("out",method,amount,"expense_payment",id,paidAt,x.createdBy,x.reference||"Vendor payment",x.deviceId);this.audit("expense.payable.payment",expense.id,x,{balanceMinor:payable.balance_minor},{balanceMinor:balance,status,paymentId:id,method,paidAt,reference:x.reference});
  return{...this.paymentResult(this.db.prepare("SELECT * FROM ExpensePayments WHERE id=?").get(id)),idempotent:false};
 }
 void(x){if(!x?.expenseId||!x.reason?.trim())throw new Error("Expense ID and void reason are required");return this.voidTx(x);}
 voidInternal(x){const row=this.db.prepare("SELECT * FROM Expenses WHERE id=?").get(x.expenseId);if(!row)throw new Error("Expense was not found");if(row.status!=="posted")throw new Error("Expense is already void");if(Number(row.balance_due_minor)>0||this.db.prepare("SELECT 1 FROM ExpensePayments WHERE expense_id=?").get(row.id))throw new Error("Settle or reconcile the vendor payable before reversing this expense");const now=new Date().toISOString();this.db.prepare("UPDATE Expenses SET status='void',voided_at=?,voided_by=?,void_reason=? WHERE id=?").run(now,x.createdBy||null,x.reason.trim(),row.id);this.db.prepare("UPDATE ExpensePayables SET balance_minor=0,status='void',updated_at=? WHERE expense_id=?").run(now,row.id);if(Number(row.amount_paid_minor)>0)this.money("in",row.method,row.amount_paid_minor,"expense_void",row.id,now,x.createdBy,x.reason.trim(),x.deviceId);this.audit("expense.void",row.id,x,{status:"posted"},{status:"void"});return this.result(this.db.prepare("SELECT * FROM Expenses WHERE id=?").get(row.id));}
 money(direction,method,amount,type,id,at,user,note,deviceId){require('./money-movement').recordMoneyMovement(this.db,{direction,method,amountMinor:amount,referenceType:type,referenceId:id,occurredAt:at,userId:user,deviceId,note});}
 audit(action,id,x,previous,next){this.db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,role_code,action,entity_type,entity_id,previous_json,new_json,reason,device_id) VALUES (?,?,?,?,'expense',?,?,?,?,?)`).run(new Date().toISOString(),x.createdBy||null,x.roleCode||null,action,String(id),previous&&JSON.stringify(previous),JSON.stringify(next),x.reason||null,x.deviceId||null);}
 result(row){return{expenseId:Number(row.id),incurredAmountMinor:Number(row.amount_minor),amountPaidMinor:Number(row.amount_paid_minor),balanceDueMinor:Number(row.balance_due_minor),status:row.status};}
 paymentResult(row){const payable=this.db.prepare("SELECT balance_minor,status FROM ExpensePayables WHERE id=?").get(row.payable_id);return{paymentId:Number(row.id),payableId:Number(row.payable_id),expenseId:Number(row.expense_id),amountMinor:Number(row.amount_minor),balanceMinor:Number(payable.balance_minor),status:payable.status};}
}
module.exports={ExpensesService};
