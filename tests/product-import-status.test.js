const fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),express=require("express");
const {openDatabase}=require("../infrastructure/sqlite/database");
const {ProductImportService}=require("../infrastructure/sqlite/services/product-import");
const {createProductImportRouter}=require("../api/v2/sqlite-product-import");

test("product import status endpoint reports previewed and committed lifecycle",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"to-import-status-"));const db=openDatabase({filename:path.join(dir,"db.sqlite3")});
  const preview=new ProductImportService(db).preview({rows:[{sku:"STATUS-1",name:"Status Product",base_sale_price:10}],sourceName:"status.xlsx"});
  const app=express();app.use("/api/v2/imports/products",createProductImportRouter({getDatabase:()=>db}));const server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const url=`http://127.0.0.1:${server.address().port}/api/v2/imports/products`;
  try{let response=await fetch(`${url}/${preview.jobId}`);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:"previewed",totalRows:1,validRows:1});response=await fetch(`${url}/${preview.jobId}/commit`,{method:"POST"});expect(response.status).toBe(200);response=await fetch(`${url}/${preview.jobId}`);expect(await response.json()).toMatchObject({status:"committed",committedRows:1});expect((await fetch(`${url}/999999`)).status).toBe(404);}finally{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
