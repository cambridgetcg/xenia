// SPDX-License-Identifier: MPL-2.0
// A small, closed reading of JSON Schema that imports nothing. It exists so a
// host can hold a value to a shape that was published in advance, before
// anything else looks at the value. It is not a JSON Schema implementation:
// it reads three types and ten keywords, and it refuses to compile a schema
// that holds anything else instead of ignoring the part it does not read.
//
//   compileSchema(schema).check(value)
//
// returns undefined when the value matches, or the first miss:
//
//   pointer   an RFC 6901 pointer into the value, built only from names the
//             schema declares; for `required` and `additionalProperties` it
//             points at the object
//   keyword   the schema keyword that missed
//   expected  the schema's own word for that keyword: the type, the enum
//             list, the limit, the pattern; for `required` the one missing
//             name; for `additionalProperties` the names the schema declares
//
// A miss repeats nothing the value held: no undeclared name and no value.
// Inside one node the keywords are tried in this order: type, enum, maximum,
// minimum, maxLength, minLength, pattern, required, additionalProperties,
// properties. tests/agent-first-schema.test.mjs holds this checker and strict
// Ajv to the same cases: on them the two agree on whether a value matches and
// on where the first miss is, and name the same keyword for it, with one
// difference. On a string node that has an enum and also a length or pattern
// keyword, Ajv tries the enum before the type, so it calls a value that is
// not a string an `enum` miss; here the type is tried first on every node.
// Outside those cases one more difference is recorded there: a required name
// that is the empty string, which this checker reports missing and Ajv 8.20.0
// reports only when asked for every error.
// The value is expected to be JSON data; only own enumerable names are read.
// String lengths are counted in Unicode code points, as JSON Schema counts
// them. A pattern is compiled once with the `u` flag and is tried only on
// text that already passed maxLength; maxLength bounds that text, not the
// time a pattern takes on it.
//
// compileSchema reads the schema's own enumerable properties as they are. A
// caller that did not write the schema object hands in a plain-data copy; the
// runtime does, so no accessor or proxy on a module's schema is ever run.

export const SCHEMA_TYPES=Object.freeze(['object','string','integer']);
const TYPE_KEYWORDS=Object.freeze({
  object:Object.freeze(['properties','required','additionalProperties']),
  string:Object.freeze(['enum','minLength','maxLength','pattern']),
  integer:Object.freeze(['enum','minimum','maximum']),
});
export const SCHEMA_KEYWORDS=Object.freeze(['type',...new Set(Object.values(TYPE_KEYWORDS).flat())]);
export const SCHEMA_MAX_DEPTH=32;
// Why a schema was not compiled. SchemaError.reason is always one of these keys.
export const SCHEMA_REFUSALS=Object.freeze({
  not_a_schema_object:'A schema, and the schema of each property, must be a plain JSON object.',
  unknown_keyword:`A schema holds a key this checker does not read. It reads: ${SCHEMA_KEYWORDS.join(', ')}.`,
  type_missing:'A schema, and the schema of each property, must state its type.',
  type_not_supported:`The type must be one of: ${SCHEMA_TYPES.join(', ')}. A list of types is not read.`,
  keyword_outside_its_type:'A keyword is used on a type it does not apply to.',
  object_not_closed:'An object must say additionalProperties: false, so that every name it accepts is declared.',
  required_not_in_properties:'A required name is not declared in properties.',
  pattern_without_max_length:'A pattern must come with maxLength, so the text it is tried on is bounded.',
  keyword_value_not_usable:'The value of a keyword is not usable: a limit that is not a whole number in range or that contradicts its pair, a list that is empty or repeats or holds another type, a pattern that does not compile, or properties that is not a plain object.',
  too_deep:`The schema is nested more than ${SCHEMA_MAX_DEPTH} levels deep, or holds itself.`,
});
export class SchemaError extends Error{
  // pointer: an RFC 6901 pointer into the schema, to the key at fault or to the node that lacks one.
  constructor(reason,pointer){super(reason);this.name='SchemaError';this.reason=reason;this.pointer=pointer;}
}

const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const escapeName=name=>name.replaceAll('~','~0').replaceAll('/','~1');
const wholeNumber=value=>typeof value==='number'&&Number.isSafeInteger(value);
function codePoints(text){
  let count=0;
  for(let i=0;i<text.length;i++){
    const unit=text.charCodeAt(i);
    if(unit>=0xd800&&unit<=0xdbff&&i+1<text.length&&(text.charCodeAt(i+1)&0xfc00)===0xdc00)i++;
    count++;
  }
  return count;
}
// A non-empty list of distinct values that all pass `ok`.
const distinctList=(value,ok)=>Array.isArray(value)&&value.length>0&&value.every(ok)&&new Set(value).size===value.length;
const miss=(pointer,keyword,expected)=>({pointer,keyword,expected});

// Returns a function (value, pointer) -> miss or undefined.
function compileNode(node,at,depth){
  const refuse=(reason,key)=>{throw new SchemaError(reason,key===undefined?at:`${at}/${escapeName(key)}`);};
  if(depth>SCHEMA_MAX_DEPTH)refuse('too_deep');
  if(!plainObject(node))refuse('not_a_schema_object');
  const keys=Object.keys(node);
  for(const key of keys)if(!SCHEMA_KEYWORDS.includes(key))refuse('unknown_keyword',key);
  if(!Object.hasOwn(node,'type'))refuse('type_missing');
  const type=node.type;
  if(typeof type!=='string'||!SCHEMA_TYPES.includes(type))refuse('type_not_supported','type');
  for(const key of keys)if(key!=='type'&&!TYPE_KEYWORDS[type].includes(key))refuse('keyword_outside_its_type',key);
  const has=key=>Object.hasOwn(node,key);

  if(type==='object'){
    if(!has('additionalProperties'))refuse('object_not_closed');
    if(node.additionalProperties!==false)refuse('object_not_closed','additionalProperties');
    if(has('properties')&&!plainObject(node.properties))refuse('keyword_value_not_usable','properties');
    const names=Object.keys(node.properties??{});
    const children=names.map(name=>({name,suffix:`/${escapeName(name)}`,
      check:compileNode(node.properties[name],`${at}/properties/${escapeName(name)}`,depth+1)}));
    const declared=new Set(names);
    let required=[];
    if(has('required')){
      if(!Array.isArray(node.required)||node.required.some(name=>typeof name!=='string')||
        new Set(node.required).size!==node.required.length)refuse('keyword_value_not_usable','required');
      if(node.required.some(name=>!declared.has(name)))refuse('required_not_in_properties','required');
      required=[...node.required];
    }
    return (value,pointer)=>{
      if(value===null||typeof value!=='object'||Array.isArray(value))return miss(pointer,'type','object');
      for(const name of required)if(!Object.hasOwn(value,name))return miss(pointer,'required',name);
      for(const key of Object.keys(value))if(!declared.has(key))return miss(pointer,'additionalProperties',[...names]);
      for(const child of children){
        if(!Object.hasOwn(value,child.name))continue;
        const found=child.check(value[child.name],pointer+child.suffix);
        if(found)return found;
      }
      return undefined;
    };
  }

  if(type==='string'){
    const allowed=has('enum')?(distinctList(node.enum,item=>typeof item==='string')?[...node.enum]:refuse('keyword_value_not_usable','enum')):undefined;
    for(const key of ['minLength','maxLength'])if(has(key)&&(!wholeNumber(node[key])||node[key]<0))refuse('keyword_value_not_usable',key);
    const min=node.minLength,max=node.maxLength;
    if(min!==undefined&&max!==undefined&&min>max)refuse('keyword_value_not_usable','minLength');
    let pattern,source;
    if(has('pattern')){
      source=node.pattern;
      if(typeof source!=='string')refuse('keyword_value_not_usable','pattern');
      if(max===undefined)refuse('pattern_without_max_length','pattern');
      try{pattern=new RegExp(source,'u');}catch{refuse('keyword_value_not_usable','pattern');}
    }
    return (value,pointer)=>{
      if(typeof value!=='string')return miss(pointer,'type','string');
      if(allowed&&!allowed.includes(value))return miss(pointer,'enum',[...allowed]);
      if(min!==undefined||max!==undefined){
        // A string of n UTF-16 units has at least n/2 code points, so one longer than twice the limit is over it without being counted.
        const length=max!==undefined&&value.length>max*2?max+1:codePoints(value);
        if(max!==undefined&&length>max)return miss(pointer,'maxLength',max);
        if(min!==undefined&&length<min)return miss(pointer,'minLength',min);
      }
      if(pattern&&!pattern.test(value))return miss(pointer,'pattern',source);
      return undefined;
    };
  }

  const allowed=has('enum')?(distinctList(node.enum,item=>typeof item==='number'&&Number.isInteger(item))?[...node.enum]:refuse('keyword_value_not_usable','enum')):undefined;
  for(const key of ['minimum','maximum'])if(has(key)&&!wholeNumber(node[key]))refuse('keyword_value_not_usable',key);
  const min=node.minimum,max=node.maximum;
  if(min!==undefined&&max!==undefined&&min>max)refuse('keyword_value_not_usable','minimum');
  return (value,pointer)=>{
    if(typeof value!=='number'||!Number.isInteger(value))return miss(pointer,'type','integer');
    if(allowed&&!allowed.includes(value))return miss(pointer,'enum',[...allowed]);
    if(max!==undefined&&value>max)return miss(pointer,'maximum',max);
    if(min!==undefined&&value<min)return miss(pointer,'minimum',min);
    return undefined;
  };
}

// Throws SchemaError when the schema is outside what this checker reads. The
// compiled checker keeps its own copy of every limit, name and list, so a
// later edit to `schema` changes nothing.
export function compileSchema(schema){
  const root=compileNode(schema,'',0);
  return Object.freeze({check:value=>root(value,'')});
}
