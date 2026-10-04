const commands=require('./commands.cjs');
const schemas=require('./ipc-schemas.json');
const known=new Set(commands);
const strict={
  login:{username:'string:80',password:'string:256'},
  changePassword:{currentPassword:'string:256',newPassword:'string:256'},
  userDetail:{id:'id'},
  userCreate:{username:'string:40',displayName:'string:100',roleCode:'role'},
  userUpdate:{id:'id',displayName:'string:100',roleCode:'role',active:'boolean'},
  userResetPassword:{id:'id'},
  userSetPermission:{id:'id',permissionCode:'string:80',mode:'mode'},
};
const empty=new Set(['logout','usersCatalog','usersList','settingsRead','counterDefaults','productSuppliers','shiftStatus','expenseMetadata','closingHandover','customers','resetDemo','reviewAccess']);
function invalid(){throw Error('Invalid request payload')}
function matches(value,schema,depth=0){
  if(depth>16)return false;
  if(schema.kind==='union')return schema.variants.some(part=>matches(value,part,depth+1));
  if(schema.kind==='intersection')return schema.variants.every(part=>matches(value,part,depth+1));
  if(schema.kind==='literal')return value===schema.value;
  if(schema.kind==='undefined')return value===undefined;
  if(schema.kind==='null')return value===null;
  if(schema.kind==='never')return false;
  if(schema.kind==='opaque')return true;
  if(schema.kind==='string')return typeof value==='string'&&value.length<=12000000;
  if(schema.kind==='number')return typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e12;
  if(schema.kind==='boolean')return typeof value==='boolean';
  if(schema.kind==='array')return Array.isArray(value)&&value.length<=10000&&value.every(item=>matches(item,schema.item,depth+1));
  if(schema.kind==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
    for(const [key,field] of Object.entries(schema.properties)){
      if(!Object.hasOwn(value,key)){if(!field.optional)return false;continue}
      if(!matches(value[key],field.schema,depth+1))return false;
    }
    for(const [key,item] of Object.entries(value)){
      if(Object.hasOwn(schema.properties,key))continue;
      if(schema.stringIndex){if(!matches(item,schema.stringIndex,depth+1))return false;continue}
      if(schema.numberIndex&&/^(0|[1-9][0-9]*)$/.test(key)){if(!matches(item,schema.numberIndex,depth+1))return false;continue}
      return false;
    }
    return true;
  }
  return false;
}
function validateInput(command,input){
  if(!known.has(command))invalid();
  if(input===undefined||input===null)input={};
  if(typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)invalid();
  let nodes=0;
  const visit=(value,depth,key='')=>{
    if(++nodes>20000||depth>12)invalid();
    if(value===null||value===undefined)return;
    if(typeof value==='string'){
      const limit=key==='base64'&&['openingStockPreviewFile','productImportInspect','productImportPreview'].includes(command)?12000000:4096;
      if(value.length>limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))invalid();
      return;
    }
    if(typeof value==='number'){
      if(!Number.isFinite(value)||Math.abs(value)>1e12)invalid();
      if((key==='page'||key==='pageSize')&&(!Number.isSafeInteger(value)||value<1||value>(key==='pageSize'?1000:1000000)))invalid();
      return;
    }
    if(typeof value==='boolean')return;
    if(typeof value!=='object')invalid();
    if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)invalid();
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return}
    for(const [key,item] of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(key)||key.length>100)invalid();
      visit(item,depth+1,key);
    }
  };
  visit(input,0);
  if(['openingStockPreviewFile','productImportInspect','productImportPreview'].includes(command)){
    if(typeof input.name!=='string'||!/^[^\\/:*?"<>|\u0000-\u001f]{1,160}\.(csv|xlsx)$/i.test(input.name)||input.name==='.'||input.name==='..')invalid();
    if(typeof input.base64!=='string'||input.base64.length<4||input.base64.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))invalid();
  }
  if(!matches(input,schemas[command]))invalid();
  if(empty.has(command)&&Object.keys(input).length)invalid();
  const schema=strict[command];
  if(schema){
    if(Object.keys(input).length!==Object.keys(schema).length||Object.keys(input).some(key=>!Object.hasOwn(schema,key)))invalid();
    for(const [key,kind] of Object.entries(schema)){
      const value=input[key];
      if(kind==='id'){if(!Number.isSafeInteger(value)||value<1)invalid()}
      else if(kind==='boolean'){if(typeof value!=='boolean')invalid()}
      else if(kind==='role'){if(!['cashier','pharmacist','manager','admin'].includes(value))invalid()}
      else if(kind==='mode'){if(!['allow','deny','inherit'].includes(value))invalid()}
      else if(kind.startsWith('string:')){if(typeof value!=='string'||value.length>Number(kind.slice(7)))invalid()}
    }
  }
  return input;
}
module.exports={validateInput};
