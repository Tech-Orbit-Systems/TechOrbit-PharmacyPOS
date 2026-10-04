const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

const input=path.join(__dirname,'../src/contracts.ts');
const output=path.join(__dirname,'../desktop/ipc-schemas.json');
const program=ts.createProgram([input],{strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022});
const checker=program.getTypeChecker();
const source=program.getSourceFile(input);
const api=source.statements.find(node=>ts.isInterfaceDeclaration(node)&&node.name.text==='Api');
if(!api)throw Error('Api interface was not found');

function schema(type,stack=[]){
  const flags=type.flags;
  if(flags&ts.TypeFlags.StringLiteral)return{kind:'literal',value:type.value};
  if(flags&ts.TypeFlags.NumberLiteral)return{kind:'literal',value:type.value};
  if(flags&ts.TypeFlags.BooleanLiteral)return{kind:'literal',value:type.intrinsicName==='true'};
  if(flags&ts.TypeFlags.Null)return{kind:'null'};
  if(flags&ts.TypeFlags.Undefined)return{kind:'undefined'};
  if(flags&ts.TypeFlags.Never)return{kind:'never'};
  if(flags&ts.TypeFlags.Any)return{kind:'opaque',reason:'any'};
  if(flags&ts.TypeFlags.Unknown)return{kind:'opaque',reason:'unknown'};
  if(type.isUnion())return{kind:'union',variants:type.types.map(item=>schema(item,stack))};
  if(type.isIntersection()){
    const parts=type.types.map(item=>schema(item,stack));
    if(parts.every(part=>part.kind==='object')){
      const properties={};
      for(const part of parts)for(const [key,field] of Object.entries(part.properties)){
        if(!Object.hasOwn(properties,key))properties[key]=field;
        else properties[key]={optional:properties[key].optional&&field.optional,schema:{kind:'intersection',variants:[properties[key].schema,field.schema]}};
      }
      return{kind:'object',properties,
        ...((parts.find(part=>part.stringIndex))?{stringIndex:parts.find(part=>part.stringIndex).stringIndex}:{}),
        ...((parts.find(part=>part.numberIndex))?{numberIndex:parts.find(part=>part.numberIndex).numberIndex}:{})};
    }
    return{kind:'intersection',variants:parts};
  }
  if(flags&ts.TypeFlags.StringLike)return{kind:'string'};
  if(flags&ts.TypeFlags.NumberLike)return{kind:'number'};
  if(flags&ts.TypeFlags.BooleanLike)return{kind:'boolean'};
  if(checker.isArrayType(type))return{kind:'array',item:schema(checker.getTypeArguments(type)[0],stack)};
  if(flags&ts.TypeFlags.Object){
    if(stack.includes(type))throw Error(`Recursive input type: ${checker.typeToString(type)}`);
    const next=[...stack,type],properties={};
    for(const property of checker.getPropertiesOfType(type)){
      const declaration=property.valueDeclaration||property.declarations?.[0]||api;
      properties[property.name]={optional:Boolean(property.flags&ts.SymbolFlags.Optional),schema:schema(checker.getTypeOfSymbolAtLocation(property,declaration),next)};
    }
    const stringIndex=checker.getIndexTypeOfType(type,ts.IndexKind.String);
    const numberIndex=checker.getIndexTypeOfType(type,ts.IndexKind.Number);
    return{kind:'object',properties,...(stringIndex?{stringIndex:schema(stringIndex,next)}:{}),...(numberIndex?{numberIndex:schema(numberIndex,next)}:{})};
  }
  throw Error(`Unsupported input type: ${checker.typeToString(type)} (${flags})`);
}
const result={};
for(const member of api.members){
  if(!ts.isMethodSignature(member))continue;
  const name=member.name.getText(source);
  if(member.parameters.length>1)throw Error(`Multiple IPC parameters for ${name}`);
  result[name]=member.parameters.length?schema(checker.getTypeAtLocation(member.parameters[0])):{kind:'object',properties:{}};
}
const commands=require('../desktop/commands.cjs');
if(commands.length!==Object.keys(result).length||commands.some(name=>!Object.hasOwn(result,name)))throw Error('Api and command inventory differ');
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(`Generated ${Object.keys(result).length} IPC input schemas`);
