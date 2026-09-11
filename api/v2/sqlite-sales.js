const express = require("express");
const { SalesPostingService } = require("../../infrastructure/sqlite/services/sales-posting");
const { SalesQueryService } = require("../../infrastructure/sqlite/services/sales-query");

function classifyError(error) {
  if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return { status:409, code:"DUPLICATE_SALE", message:"Invoice number or submission key already exists" };
  const badRequest = /required|unsupported|cannot|must|not found|insufficient|quantity|discount|customer|due date/i.test(error.message);
  return badRequest ? { status:422, code:"SALE_VALIDATION_FAILED", message:error.message } : { status:500, code:"SALE_POSTING_FAILED", message:"Sale could not be completed" };
}

function createSqliteSalesRouter({ getDatabase }) {
  const router=express.Router();
  router.post("/",(req,res)=>{ try { const result=new SalesPostingService(getDatabase()).post(req.body); res.status(201).json(result); } catch(error) { const mapped=classifyError(error); res.status(mapped.status).json({error:mapped.code,message:mapped.message}); } });
  router.get("/",(req,res)=>{ try { res.json(new SalesQueryService(getDatabase()).search(req.query)); } catch(error) { res.status(400).json({error:"INVALID_SEARCH",message:"Sale search parameters are invalid"}); } });
  router.get("/:saleId/receipt",(req,res)=>{ const receipt=new SalesQueryService(getDatabase()).receipt(Number(req.params.saleId)); if(!receipt)return res.status(404).json({error:"SALE_NOT_FOUND",message:"Sale was not found"}); res.json(receipt); });
  router.get("/:saleId",(req,res)=>{ const sale=new SalesQueryService(getDatabase()).getById(Number(req.params.saleId)); if(!sale)return res.status(404).json({error:"SALE_NOT_FOUND",message:"Sale was not found"}); res.json(sale); });
  return router;
}
module.exports={createSqliteSalesRouter,classifyError};
