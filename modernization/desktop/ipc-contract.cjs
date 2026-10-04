const commands=require('./commands.cjs');
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
function validateInput(command,input){
  if(!known.has(command))invalid();
  if(input===undefined||input===null)input={};
  if(typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype)invalid();
  let nodes=0;
  const visit=(value,depth)=>{
    if(++nodes>20000||depth>12)invalid();
    if(value===null)return;
    if(typeof value==='string'){if(value.length>12000000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))invalid();return}
    if(typeof value==='number'){if(!Number.isFinite(value))invalid();return}
    if(typeof value==='boolean')return;
    if(typeof value!=='object')invalid();
    if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)invalid();
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return}
    for(const [key,item] of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(key)||key.length>100)invalid();
      visit(item,depth+1);
    }
  };
  visit(input,0);
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
