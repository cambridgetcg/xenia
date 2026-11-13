// SPDX-License-Identifier: MPL-2.0
// The kit's small schema checker, held to strict Ajv on the same cases. Ajv
// is a development dependency of this repository; schema.mjs imports nothing,
// and only this file brings the two together. What agreement shows is that the
// two give the same answer, at the same place, for the listed schemas and
// values. It does not show that the checker implements JSON Schema. Two
// differences were found while writing these tests, and each has a test below:
// which keyword is named for a value of the wrong type on one kind of string
// node, and a required name that is the empty string.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import {compileSchema,SchemaError,SCHEMA_KEYWORDS,SCHEMA_TYPES,SCHEMA_REFUSALS,SCHEMA_MAX_DEPTH} from '../agent-first/0.1/schema.mjs';

const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/agent-first-schema-cases.json',import.meta.url),'utf8'));
// Strict, and asked to read own properties only, as the JSON Schema text
// means them. Without `ownProperties` Ajv takes a name every object inherits
// (toString, constructor) to be present; this checker never does.
const strictAjv=()=>new Ajv2020({strict:true,ownProperties:true});
// What Ajv calls the value this checker gives as `expected`.
const ajvExpected=(error,schemaNames)=>({
  type:()=>error.params.type,
  enum:()=>error.params.allowedValues,
  required:()=>error.params.missingProperty,
  additionalProperties:()=>schemaNames(error.instancePath),
  minLength:()=>error.params.limit,maxLength:()=>error.params.limit,
  minimum:()=>error.params.limit,maximum:()=>error.params.limit,
  pattern:()=>error.params.pattern,
}[error.keyword]());
// The schema node for the value at one pointer, and the property names it declares.
const nodeAt=(schema,pointer)=>{
  let node=schema;
  for(const part of pointer.split('/').slice(1))node=node.properties[part.replaceAll('~1','/').replaceAll('~0','~')];
  return node;
};
const declaredNames=schema=>pointer=>Object.keys(nodeAt(schema,pointer).properties??{});
// The one place the two name a different keyword for the same miss. On a
// string node that has an enum and also a length or pattern keyword, Ajv
// tries the enum before it looks at the type, so a value that is not a string
// is an `enum` miss there. This checker tries the type first, on every node.
function typeBeforeEnum(schema,miss,first){
  if(miss.keyword!=='type'||miss.expected!=='string'||first.keyword!=='enum')return false;
  const node=nodeAt(schema,miss.pointer);
  return node.type==='string'&&Array.isArray(node.enum)&&['minLength','maxLength','pattern'].some(key=>Object.hasOwn(node,key));
}
// Returns undefined when both say the value matches; otherwise the checker's
// miss, with `ajv_keyword` set when Ajv named another keyword for it.
function agree(schema,validate,check,value,label){
  const miss=check(value);
  const ok=validate(value);
  assert.equal(miss===undefined,ok,`${label}: the checker and Ajv disagree on whether the value matches`);
  if(ok)return undefined;
  const first=validate.errors[0];
  assert.deepEqual(Object.keys(miss),['pointer','keyword','expected'],label);
  assert.equal(miss.pointer,first.instancePath,`${label}: pointer`);
  if(typeBeforeEnum(schema,miss,first))return {miss,ajv_keyword:first.keyword};
  assert.equal(miss.keyword,first.keyword,`${label}: keyword`);
  assert.deepEqual(miss.expected,ajvExpected(first,declaredNames(schema)),`${label}: expected`);
  return {miss};
}

test('the checker reads three types and ten keywords, and says so',()=>{
  assert.deepEqual([...SCHEMA_TYPES],['object','string','integer']);
  assert.deepEqual([...SCHEMA_KEYWORDS].sort(),['additionalProperties','enum','maxLength','minLength','maximum','minimum','pattern','properties','required','type'].sort());
  assert.ok(Object.isFrozen(SCHEMA_TYPES)&&Object.isFrozen(SCHEMA_KEYWORDS)&&Object.isFrozen(SCHEMA_REFUSALS));
  for(const [reason,text] of Object.entries(SCHEMA_REFUSALS)){assert.match(reason,/^[a-z_]+$/);assert.ok(text.length>10,reason);}
  const source=fs.readFileSync(new URL('../agent-first/0.1/schema.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/^\s*import\s|\bimport\(|\brequire\(/m,'schema.mjs imports nothing');
});

for(const row of cases.schemas)test(`fixture, ${row.name}: every listed value gets the answer strict Ajv gives, at the same place`,()=>{
  const validate=strictAjv().compile(row.schema);
  const {check}=compileSchema(row.schema);
  for(const value of row.valid){
    assert.equal(check(value),undefined,`should match: ${JSON.stringify(value)}`);
    assert.equal(validate(value),true,`Ajv should match: ${JSON.stringify(value)}`);
  }
  assert.ok(row.invalid.length>0);
  for(const item of row.invalid){
    const label=JSON.stringify(item.value);
    const found=agree(row.schema,validate,check,item.value,label);
    assert.deepEqual(found.miss,{pointer:item.pointer,keyword:item.keyword,expected:item.expected},label);
    assert.equal(found.ajv_keyword,item.strict_ajv_keyword,`${label}: the fixture records which keyword Ajv names when it is another one`);
  }
});

// A fixed-seed generator: the same values are tried on every run.
function generator(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};}
const POOL=[null,true,false,0,1,-1,2,3,5,9,50,51,1.5,1e300,9007199254740991,9007199254740992,'','a','ab','abc','abcd','t','e1','x'.repeat(13),'x'.repeat(201),
  'observation','decision','task-claim','Task','f'.repeat(64),'F'.repeat(64),'f'.repeat(65),'é','😀','😀😀','\ud83d',[],[1],['ab'],{},{a:1}];
const EXTRA_NAMES=['zz','valueOf','isPrototypeOf','a','0','hash ','Anchor'];
function changed(value,random,depth=0){
  const pick=list=>list[Math.floor(random()*list.length)];
  if(value===null||typeof value!=='object'||Array.isArray(value)||depth>3||random()<0.2)return structuredClone(pick(POOL));
  const copy={...value},keys=Object.keys(copy);
  const move=random();
  if(move<0.25&&keys.length)delete copy[pick(keys)];
  else if(move<0.45)copy[pick(EXTRA_NAMES)]=structuredClone(pick(POOL));
  else if(keys.length){const key=pick(keys);copy[key]=changed(copy[key],random,depth+1);}
  else copy[pick(EXTRA_NAMES)]=1;
  return copy;
}
test('four thousand generated values per fixture schema get the answer strict Ajv gives, at the same place',()=>{
  let compared=0,missed=0,otherKeyword=0;const keywords=new Set();
  for(const [index,row] of cases.schemas.entries()){
    const validate=strictAjv().compile(row.schema);
    const {check}=compileSchema(row.schema);
    const random=generator(20261113+index);
    for(let round=0;round<4000;round++){
      let value=structuredClone(row.valid[Math.floor(random()*row.valid.length)]);
      const steps=1+Math.floor(random()*3);
      for(let step=0;step<steps;step++)value=changed(value,random);
      const found=agree(row.schema,validate,check,value,`${row.name} #${round} ${JSON.stringify(value)}`);
      compared++;
      if(found){missed++;keywords.add(found.miss.keyword);if(found.ajv_keyword)otherKeyword++;}
    }
  }
  assert.equal(compared,4000*cases.schemas.length);
  assert.ok(missed>compared/4&&missed<compared,'the generated values hold both matches and misses');
  // `agree` lets the keyword differ only on the one kind of node described above; this run meets it.
  assert.ok(otherKeyword>0&&otherKeyword<missed/4,`a wrong type named as enum by Ajv: ${otherKeyword} of ${missed} misses`);
  assert.deepEqual([...keywords].sort(),['additionalProperties','enum','maxLength','maximum','minLength','minimum','pattern','required','type'],'every keyword that can miss did miss at least once');
});

test('a required name that is the empty string is reported missing; Ajv says so only when asked for every error',()=>{
  const schema={type:'object',additionalProperties:false,properties:{'':{type:'string'},a:{type:'string'}},required:['']};
  const {check}=compileSchema(schema);
  assert.deepEqual(check({}),{pointer:'',keyword:'required',expected:''});
  assert.deepEqual(check({a:'x'}),{pointer:'',keyword:'required',expected:''});
  assert.equal(check({'':'x'}),undefined);
  const every=new Ajv2020({strict:true,ownProperties:true,allErrors:true}).compile(schema);
  assert.equal(every({}),false);
  assert.deepEqual(every.errors.map(error=>[error.keyword,error.params.missingProperty]),[['required','']]);
  assert.equal(every({'':'x'}),true);
  // Recorded, not relied on: the pinned Ajv (8.20.0), stopping at the first
  // error as the other tests here run it, takes {} to match this schema. If
  // a later Ajv reports the missing name, this line is the one to remove.
  assert.equal(strictAjv().compile(schema)({}),true);
  // No fixture schema requires an empty name, so the other tests do not meet this.
  const requiresEmpty=node=>(node.required??[]).includes('')||Object.values(node.properties??{}).some(requiresEmpty);
  assert.equal(cases.schemas.some(row=>requiresEmpty(row.schema)),false);
});

test('a miss repeats nothing the value held: not an undeclared name, not a value',()=>{
  const row=cases.schemas.find(item=>item.name==='strings with an enum and length bounds');
  const {check}=compileSchema(row.schema);
  for(const value of [
    {idempotency_key:'k',kind:'observation',body:'seen',PLANTED_NAME_9431:1},
    {idempotency_key:'k',kind:'PLANTED_VALUE_9431',body:'seen'},
    {idempotency_key:'k',kind:'observation',body:'PLANTED_VALUE_9431 and more'},
    {idempotency_key:'k',kind:'observation',body:'seen',task_id:{PLANTED_NAME_9431:'PLANTED_VALUE_9431'}},
    'PLANTED_VALUE_9431',
  ]){
    const miss=check(value);
    assert.ok(miss,JSON.stringify(value));
    assert.doesNotMatch(JSON.stringify(miss),/PLANTED/);
  }
});

test('an own property named __proto__ is read as a property, and the prototype is never taken for one',()=>{
  const declared=JSON.parse('{"type":"object","additionalProperties":false,"required":["__proto__"],"properties":{"__proto__":{"type":"string","maxLength":2}}}');
  const {check}=compileSchema(declared);
  assert.deepEqual(check({}),{pointer:'',keyword:'required',expected:'__proto__'},'an inherited __proto__ is not the property');
  assert.equal(check(JSON.parse('{"__proto__":"ok"}')),undefined);
  assert.deepEqual(check(JSON.parse('{"__proto__":"long"}')),{pointer:'/__proto__',keyword:'maxLength',expected:2});
  const closed=compileSchema({type:'object',additionalProperties:false,properties:{a:{type:'integer'}}}).check;
  assert.deepEqual(closed(JSON.parse('{"a":1,"__proto__":{"a":2}}')),{pointer:'',keyword:'additionalProperties',expected:['a']},'an own __proto__ key is an undeclared name');
  assert.equal(closed(Object.create({b:1},{a:{value:1,enumerable:true}})),undefined,'inherited names are not read');
  // A schema written as a JavaScript literal with `__proto__:` sets a prototype instead of declaring a name.
  assert.throws(()=>compileSchema({type:'object',additionalProperties:false,properties:{__proto__:{type:'string'}}}),{name:'SchemaError',reason:'keyword_value_not_usable',pointer:'/properties'});
});

for(const row of cases.refused)test(`refused at compile, ${row.name} (strict Ajv ${row.strict_ajv} it)`,()=>{
  assert.throws(()=>compileSchema(row.schema),error=>{
    assert.ok(error instanceof SchemaError);
    assert.equal(error.name,'SchemaError');
    assert.equal(error.reason,row.reason);
    assert.equal(error.pointer,row.pointer);
    assert.ok(Object.hasOwn(SCHEMA_REFUSALS,error.reason));
    return true;
  });
  let ajvRefused=false;
  try{strictAjv().compile(row.schema);}catch{ajvRefused=true;}
  assert.equal(ajvRefused?'refuses':'accepts',row.strict_ajv,'the fixture records what strict Ajv does with this schema');
});

test('every refusal the checker names has a case, and the cases include ones strict Ajv accepts',()=>{
  const seen=new Set(cases.refused.map(row=>row.reason));
  seen.add('too_deep');
  assert.deepEqual([...seen].sort(),Object.keys(SCHEMA_REFUSALS).sort());
  for(const reason of ['type_missing','object_not_closed','pattern_without_max_length','unknown_keyword'])
    assert.ok(cases.refused.some(row=>row.reason===reason&&row.strict_ajv==='accepts'),`${reason}: stricter than strict Ajv`);
});

test('a schema nested past the depth limit, or one that holds itself, is refused and not followed',()=>{
  const nest=levels=>{let node={type:'string'};for(let i=0;i<levels;i++)node={type:'object',additionalProperties:false,properties:{a:node}};return node;};
  assert.equal(compileSchema(nest(SCHEMA_MAX_DEPTH)).check(1).keyword,'type');
  assert.throws(()=>compileSchema(nest(SCHEMA_MAX_DEPTH+1)),{name:'SchemaError',reason:'too_deep'});
  const loop={type:'object',additionalProperties:false,properties:{}};loop.properties.again=loop;
  assert.throws(()=>compileSchema(loop),{name:'SchemaError',reason:'too_deep'});
});

test('the compiled checker keeps its own copy: editing the schema or a miss afterwards changes nothing',()=>{
  const schema={type:'object',additionalProperties:false,required:['kind'],properties:{kind:{type:'string',enum:['a','b'],maxLength:1}}};
  const compiled=compileSchema(schema);
  assert.ok(Object.isFrozen(compiled));
  schema.properties.kind.enum.push('c');schema.properties.kind.maxLength=9;schema.required.length=0;schema.properties.more={type:'integer'};
  assert.deepEqual(compiled.check({}),{pointer:'',keyword:'required',expected:'kind'});
  const first=compiled.check({kind:'c'});
  assert.deepEqual(first,{pointer:'/kind',keyword:'enum',expected:['a','b']});
  first.expected.push('c');
  assert.deepEqual(compiled.check({kind:'c'}).expected,['a','b']);
  const names=compiled.check({kind:'a',more:1});
  assert.deepEqual(names,{pointer:'',keyword:'additionalProperties',expected:['kind']});
  names.expected.push('more');
  assert.deepEqual(compiled.check({kind:'a',more:1}).expected,['kind']);
});

test('a pattern is tried only on text that passed maxLength, and holds no state between calls',()=>{
  const {check}=compileSchema({type:'string',pattern:'^(?:a+)+$',maxLength:8});
  const started=Date.now();
  assert.deepEqual(check('a'.repeat(200000)+'!'),{pointer:'',keyword:'maxLength',expected:8});
  assert.ok(Date.now()-started<1000,'an over-long string is refused by its length, before the pattern is tried');
  for(let i=0;i<3;i++){assert.equal(check('aaa'),undefined);assert.equal(check('aab').keyword,'pattern');}
});
