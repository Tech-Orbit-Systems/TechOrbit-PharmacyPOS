const fs=require('fs'),os=require('os'),path=require('path');
const {openDatabase}=require('../infrastructure/sqlite/database');
const {ProductsRepository}=require('../infrastructure/sqlite/repositories/products');
const {ProductUnitsRepository}=require('../infrastructure/sqlite/repositories/product-units');
const {GenericAlternativesService}=require('../infrastructure/sqlite/services/generic-alternatives');

describe('generic alternatives',()=>{
 let dir,db,products,service,now;
 beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'to-alternatives-'));db=openDatabase({filename:path.join(dir,'db.sqlite3')});products=new ProductsRepository(db);service=new GenericAlternativesService(db);now=new Date().toISOString();});
 afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 function add(name,{generic='Paracetamol',strength='500 mg',form='Tablet',expiry='2099-01-01',stock=10,prescription=false,controlled=false}={}){
  const p=products.create({name,genericName:generic,strength,dosageForm:form,baseUnit:'tablet',prescriptionRequired:prescription,controlledMedicine:controlled});
  new ProductUnitsRepository(db).configure(p.id,[{unitName:'tablet',baseQuantity:1,sellingPriceMinor:100,isDefaultSaleUnit:true}]);
  db.prepare('INSERT INTO ProductBatches(product_id,batch_number,expiry_date,unit_cost_minor,sale_price_minor,quantity_on_hand,received_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(p.id,name,expiry,50,100,stock,now,now,now);
  return p;
 }
 test('matches generic, strength and dosage form and excludes invalid stock',()=>{
  const source=add('Source'),valid=add('Valid',{prescription:true}),controlled=add('Controlled',{controlled:true});add('Wrong strength',{strength:'250 mg'});add('Wrong form',{form:'Syrup'});add('Expired',{expiry:'2020-01-01'});add('Empty',{stock:0});
  const result=service.view({productId:source.id,asOfDate:'2026-09-17',roleCode:'pharmacist'});
  expect(result.items.map(x=>x.id)).toEqual([controlled.id,valid.id]);
  expect(result.items.find(x=>x.id===valid.id).prescriptionRequired).toBe(true);
  expect(result.items.find(x=>x.id===controlled.id).controlledMedicine).toBe(true);
  expect(db.prepare("SELECT COUNT(*) n FROM AuditLog WHERE action='medicine.alternatives.view'").get().n).toBe(1);
 });
 test('requires explicit eligible selection and audits it',()=>{
  const source=add('Source'),valid=add('Valid'),wrong=add('Wrong',{generic:'Ibuprofen'});
  expect(service.select({sourceProductId:source.id,alternativeProductId:valid.id,asOfDate:'2026-09-17',roleCode:'pharmacist'}).id).toBe(valid.id);
  expect(()=>service.select({sourceProductId:source.id,alternativeProductId:wrong.id,asOfDate:'2026-09-17'})).toThrow(/eligible/);
  expect(db.prepare("SELECT json_extract(new_json,'$.alternativeProductId') id FROM AuditLog WHERE action='medicine.alternatives.select'").get().id).toBe(valid.id);
 });
});
