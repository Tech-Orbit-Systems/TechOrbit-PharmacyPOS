class SqliteCounterClient {
  constructor({baseUrl="http://localhost:3210/api/v2",fetchImpl=globalThis.fetch}={}) { this.baseUrl=baseUrl.replace(/\/$/,""); this.fetch=fetchImpl; }
  async request(path,options) { const response=await this.fetch(`${this.baseUrl}${path}`,options); const body=await response.json(); if(!response.ok){const error=new Error(body.message||"Request failed");error.code=body.error;error.status=response.status;throw error;} return body; }
  barcodeLookup(barcode) { return this.request(`/products/barcode/${encodeURIComponent(String(barcode))}`); }
  productSearch(term,limit=30) { return this.request(`/products/search?q=${encodeURIComponent(term)}&limit=${limit}`); }
  postSale(sale) { return this.request("/sales",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(sale)}); }
  receipt(saleId) { return this.request(`/sales/${encodeURIComponent(saleId)}/receipt`); }
  static isEnabled(storage=globalThis.localStorage) { const value=storage?.getItem("techorbit.sqliteCounterEnabled"); return value===true||value==="true"; }
}
if(typeof module!=="undefined")module.exports={SqliteCounterClient};
if(typeof window!=="undefined")window.SqliteCounterClient=SqliteCounterClient;
