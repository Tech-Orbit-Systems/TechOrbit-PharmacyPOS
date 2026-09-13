function createCustomer(db,input,userId){
 const name=String(input.name||'').trim(),phone=String(input.phone||'').trim();
 if(name.length<2||name.length>120)throw Error('Customer name must be 2–120 characters');
 if(!/^[+\d\s()-]+$/.test(phone))throw Error('Enter a valid customer phone number');
 let normalized=phone.replace(/\D/g,'');
 if(normalized.startsWith('0092'))normalized=normalized.slice(2);
 if(normalized.startsWith('92')&&normalized.length===12)normalized='0'+normalized.slice(2);
 if(normalized.length<7||normalized.length>15)throw Error('Phone number must contain 7–15 digits');
 return db.transaction(()=>{
  const existing=db.prepare('SELECT id,name,phone,active FROM Customers WHERE normalized_phone=?').get(normalized);
  if(existing){if(existing.active&&existing.name.toLowerCase()===name.toLowerCase())return existing;throw Error('This phone number already belongs to a customer. Select the existing customer.');}
  const now=new Date().toISOString();const id=Number(db.prepare('INSERT INTO Customers(name,phone,normalized_phone,created_at,updated_at) VALUES(?,?,?,?,?)').run(name,phone,normalized,now,now).lastInsertRowid);
  db.prepare("INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,new_json) VALUES(?,?,'customer.create','customer',?,?)").run(now,userId,String(id),JSON.stringify({name,phone}));
  return {id,name,phone};
 })();
}
module.exports={createCustomer};
