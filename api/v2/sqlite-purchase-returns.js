const express=require("express");const {PurchaseReturnsService}=require("../../infrastructure/sqlite/services/purchase-returns");
function createPurchaseReturnsRouter({getDatabase}){const router=express.Router();router.post("/",(req,res)=>{try{const result=new PurchaseReturnsService(getDatabase()).post(req.body);res.status(result.idempotent?200:201).json(result);}catch(error){res.status(422).json({error:"PURCHASE_RETURN_FAILED",message:error.message});}});return router;}
module.exports={createPurchaseReturnsRouter};
