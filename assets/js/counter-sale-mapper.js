function defaultUnit(product) {
  return product.units?.find(unit=>unit.is_default_sale_unit) || product.units?.[0];
}

function catalogProductToCart(product) {
  const unit=defaultUnit(product);
  if(!unit) throw new Error("Product has no configured sale unit");
  return {id:product.id,_id:product.id,name:product.name,sku:product.sku||product.barcode,price:Number(unit.selling_price_minor||0)/100,
    quantity:Number(product.sellableBaseQuantity),stock:1,expirationDate:null,sqliteProductId:product.id,sqliteSaleUnit:unit.unit_name,
    sqliteUnitPriceMinor:Number(unit.selling_price_minor||0),prescriptionRequired:Boolean(product.prescriptionRequired),controlledMedicine:Boolean(product.controlledMedicine)};
}

function buildSqliteSale({orderNumber,cart,paymentType,discount,soldAt}) {
  const paymentMethod=Number(paymentType)===3?"card":"cash";
  const invoiceDiscountMinor=Math.round(Number(discount||0)*100);
  return {invoiceNumber:`TO-${orderNumber}`,idempotencyKey:`counter-${orderNumber}`,soldAt:new Date(soldAt).toISOString(),paymentMethod,
    invoiceDiscountType:invoiceDiscountMinor>0?"fixed":undefined,invoiceDiscountValue:invoiceDiscountMinor,
    items:cart.map(item=>{if(!item.sqliteProductId||!item.sqliteSaleUnit)throw new Error("Cart contains an item not loaded from SQLite");return {productId:item.sqliteProductId,saleUnit:item.sqliteSaleUnit,quantity:Number(item.quantity),unitPriceMinor:item.sqliteUnitPriceMinor};})};
}
module.exports={catalogProductToCart,buildSqliteSale};
