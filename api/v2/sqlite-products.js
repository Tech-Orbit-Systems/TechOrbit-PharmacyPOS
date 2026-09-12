const express=require("express");
const {ProductCatalogService}=require("../../infrastructure/sqlite/services/product-catalog");

function createSqliteProductsRouter({getDatabase}) {
  const router=express.Router();
  router.get("/barcode/:barcode",(req,res)=>{try{const product=new ProductCatalogService(getDatabase()).findByBarcode(req.params.barcode,req.query.asOfDate);if(!product)return res.status(404).json({error:"PRODUCT_NOT_FOUND",message:"Active product was not found"});res.json(product);}catch(error){res.status(422).json({error:"INVALID_BARCODE",message:error.message});}});
  router.get("/search",(req,res)=>{try{res.json(new ProductCatalogService(getDatabase()).search(req.query.q,req.query.asOfDate,req.query.limit));}catch(error){res.status(422).json({error:"INVALID_SEARCH",message:error.message});}});
  return router;
}
module.exports={createSqliteProductsRouter};
