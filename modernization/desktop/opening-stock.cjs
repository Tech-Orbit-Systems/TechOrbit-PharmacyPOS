const {OpeningStockImportService}=require('../../infrastructure/sqlite/services/opening-stock-import');
const {parseOpeningStockFile,createOpeningStockTemplate}=require('../../infrastructure/import/opening-stock-import-files');

class OpeningStockDesktop {
 constructor(db){this.db=db;this.service=new OpeningStockImportService(db)}
 products(input={}){const q=String(input.q||'').trim().slice(0,100),pattern=`%${q.replace(/[\\%_]/g,'\\$&')}%`;return this.db.prepare(`SELECT p.id,p.sku,p.barcode,p.name,p.generic_name,p.product_type,p.base_unit,
   EXISTS(SELECT 1 FROM InventoryMovements im WHERE im.product_id=p.id) locked
   FROM Products p WHERE p.active=1 AND (?='' OR p.name LIKE ? ESCAPE '\\' OR p.generic_name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\') ORDER BY p.name,p.id LIMIT 50`).all(q,pattern,pattern,pattern,pattern).map(product=>({...product,locked:Boolean(product.locked),units:this.db.prepare('SELECT unit_name,base_quantity,allows_fractional_quantity FROM ProductUnits WHERE product_id=? ORDER BY is_default_sale_unit DESC,base_quantity,id').all(product.id)}));}
 previewManual(input,userId){const product=this.db.prepare('SELECT id,sku,barcode FROM Products WHERE id=? AND active=1').get(Number(input.productId));if(!product)throw Error('Choose an active product');return this.service.preview({sourceName:'manual-entry',createdBy:userId,rows:[{sku:product.sku,barcode:product.barcode,entry_date:input.entryDate,batch_number:input.batchNumber,expiry_date:input.expiryDate,unit:input.unit,quantity:input.quantity,unit_cost:input.unitCost,notes:input.notes}]});}
 async previewFile(input,userId){const name=String(input.name||'').slice(0,200);if(!/\.(xlsx|csv)$/i.test(name))throw Error('Choose an XLSX or CSV opening-stock file');const buffer=Buffer.from(String(input.base64||''),'base64');if(!buffer.length||buffer.length>4*1024*1024)throw Error('Opening-stock file must be between 1 byte and 4 MB');const rows=await parseOpeningStockFile(buffer,name);return this.service.preview({rows,sourceName:name,sourceBuffer:buffer,createdBy:userId});}
 async template(){const buffer=await createOpeningStockTemplate();return{name:'TechOrbit-Opening-Stock-Template.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base64:buffer.toString('base64')}}
 commit(input){return this.service.commit(Number(input.jobId))}
}
module.exports={OpeningStockDesktop};
