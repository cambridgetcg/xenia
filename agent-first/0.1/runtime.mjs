// SPDX-License-Identifier: MPL-2.0
// Repository-only module composition, not a Xenia conformance/authority claim.
import { isProxy } from 'node:util/types';
import { compileSchema, SchemaError } from './schema.mjs';

// Retryable means: the same call may succeed after the caller re-reads module
// state (catalog/describe). A failure with an unknown effect is never retryable.
const RETRYABLE=new Set(['MODULE_BUSY','ADMISSION_CHANGED','STALE_REVISION']);
export class ModuleError extends Error {
  constructor(code,started=false,context={}) {
    super(code);this.name='ModuleError';this.code=code;
    this.operation_started=started;this.effect_outcome=started?'unknown':'not_attempted';
    this.retryable=RETRYABLE.has(code);
    if(context.module!==undefined)this.module=context.module;
    if(context.operation!==undefined)this.operation=context.operation;
    if(context.module_version!==undefined)this.module_version=context.module_version;
    if(context.module_revision!==undefined)this.module_revision=context.module_revision;
  }
}

// A handler throws this to decline before any effect. The runtime honours it
// only for a code the operation declared in advance. The runtime does not
// observe effects: `not_applied` is the module author's declaration, not
// something the runtime checked.
export const DETAIL_LIMIT=200;
export class Decline extends Error {
  constructor(code,detail){
    super('DECLINED');this.name='Decline';this.refusal_code=code;this.detail=detail;
  }
}

const identifier=/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const text=(value,max=1024)=>typeof value==='string'&&value.length>0&&value.length<=max;
const plain=value=>value!==null&&typeof value==='object'&&!isProxy(value)&&
  !Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function record(value,keys){
  if(!plain(value)||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!keys.includes(key)))throw new ModuleError('INVALID_MODULE');
  if(Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))throw new ModuleError('INVALID_MODULE');
}
const refusalCode=/^[a-z][a-z0-9_]*$/;
function prepareRefusals(list){
  if(list===undefined)return Object.freeze([]);
  if(!Array.isArray(list)||isProxy(list)||list.length>16)throw new ModuleError('INVALID_MODULE');
  const seen=new Set(),out=[];
  for(const item of list){
    record(item,['code','meaning','effect','next']);
    if(typeof item.code!=='string'||item.code.length>64||!refusalCode.test(item.code)||seen.has(item.code)||
      !text(item.meaning,512)||item.effect!=='not_applied'||(item.next!==undefined&&!text(item.next,512)))throw new ModuleError('INVALID_MODULE');
    seen.add(item.code);
    out.push(Object.freeze({code:item.code,meaning:item.meaning,effect:'not_applied',...(item.next===undefined?{}:{next:item.next})}));
  }
  return Object.freeze(out.sort((a,b)=>a.code<b.code?-1:1));
}
// An operation's card says what it expects: a short summary, optionally an
// example value and/or a repository path to a larger example, and optionally a
// schema. The summary, the example and example_ref are informative. A schema
// is enforced: schema.mjs compiles it here, once, and invoke holds every input
// to it before the host gate is asked. A schema schema.mjs does not read, or
// an example that does not match its own schema, refuses the whole module.
// The summary and the schema (not the example) are part of the upgrade
// signature, because they are what a caller relies on.
// Returns {note, check}: the frozen note that describe copies, and beside it
// the compiled checker, or undefined when the card has no schema.
const refusedCard=(reason,fields={})=>Object.assign(new ModuleError('INVALID_MODULE'),{reason,...fields});
function prepareInputNote(note){
  if(note===undefined)return {};
  record(note,['summary','example','example_ref','schema']);
  if(!text(note.summary,512)||(note.example_ref!==undefined&&!text(note.example_ref,256)))throw new ModuleError('INVALID_MODULE');
  let example,schema,check;
  if(note.example!==undefined){try{example=freezeData(snapshotInput(note.example));}catch{throw new ModuleError('INVALID_MODULE');}}
  if(note.schema!==undefined){
    // The schema is copied as bounded JSON data first, so no accessor or proxy on it is ever run.
    try{schema=freezeData(snapshotInput(note.schema));}catch{throw refusedCard('input_schema_not_usable');}
    try{check=compileSchema(schema).check;}
    catch(error){
      throw refusedCard('input_schema_not_usable',error instanceof SchemaError?{schema_refusal:{reason:error.reason,pointer:error.pointer}}:{});
    }
    if(example!==undefined){
      const miss=check(example);
      if(miss)throw refusedCard('input_example_does_not_match_schema',miss);
    }
  }
  return {check,note:Object.freeze({summary:note.summary,...(example===undefined?{}:{example}),
    ...(note.example_ref===undefined?{}:{example_ref:note.example_ref}),...(schema===undefined?{}:{schema})})};
}
// What an operation says comes back: one short summary. Informative only: the
// runtime never holds a returned value to it. Part of the upgrade signature.
function prepareReturnsNote(note){
  if(note===undefined)return undefined;
  record(note,['summary']);
  if(!text(note.summary,512))throw new ModuleError('INVALID_MODULE');
  return Object.freeze({summary:note.summary});
}
function prepareDefinition(input){
  record(input,['id','version','contract','title','motif','description','source','operations']);
  for(const key of ['id','version','contract','title','motif','description'])if(!text(input[key]))throw new ModuleError('INVALID_MODULE');
  if(!identifier.test(input.id)||input.id.length>80||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.version))throw new ModuleError('INVALID_MODULE');
  if(input.source!==undefined&&!text(input.source,2048))throw new ModuleError('INVALID_MODULE');
  if(!plain(input.operations))throw new ModuleError('INVALID_MODULE');
  const names=Reflect.ownKeys(input.operations);
  if(!names.length||names.length>32||names.some(name=>typeof name!=='string'||!identifier.test(name)||name.length>80))throw new ModuleError('INVALID_MODULE');
  record(input.operations,names);
  const operations={};
  for(const name of names.sort()){
    const op=input.operations[name];record(op,['description','effects','run','refusals','input','returns']);
    if(!text(op.description)||typeof op.run!=='function'||!Array.isArray(op.effects)||isProxy(op.effects)||
      op.effects.some(effect=>!['local-read','local-write'].includes(effect))||new Set(op.effects).size!==op.effects.length)throw new ModuleError('INVALID_MODULE');
    let card;
    // A module refused for its card names the module and the operation; both were checked as identifiers above.
    try{card=prepareInputNote(op.input);}
    catch(error){if(error instanceof ModuleError&&error.reason!==undefined){error.module=input.id;error.operation=name;}throw error;}
    // `check` is kept beside the note, not in it: describe copies the note, never the checker.
    operations[name]={description:op.description,effects:Object.freeze([...op.effects].sort()),run:op.run,
      refusals:prepareRefusals(op.refusals),input:card.note,check:card.check,returns:prepareReturnsNote(op.returns)};
    Object.freeze(operations[name]);
  }
  return {id:input.id,version:input.version,contract:input.contract,title:input.title,
    motif:input.motif,description:input.description,...(input.source===undefined?{}:{source:input.source}),operations};
}
// A schema enters the signature with its object keys in sorted order, so the
// same schema written in another key order is the same; a list (enum,
// required) is compared in the order written.
const sortedKeys=(key,value)=>plain(value)?Object.fromEntries(Object.keys(value).sort().map(name=>[name,value[name]])):value;
const signature=definition=>JSON.stringify(Object.entries(definition.operations).map(([id,op])=>[id,op.effects,op.refusals.map(r=>[r.code,r.effect]),
  op.input?.summary??null,op.input?.schema===undefined?null:JSON.stringify(op.input.schema,sortedKeys),op.returns?.summary??null]));

export const MODULE_INPUT_LIMITS=Object.freeze({maxBytes:1024*1024,maxDepth:32,maxNodes:65536});
function freezeData(value){
  if(value!==null&&typeof value==='object'){
    for(const child of Object.values(value))freezeData(child);
    Object.freeze(value);
  }
  return value;
}
// A copy of `value` when it is bounded JSON data (plain objects, arrays, strings, finite numbers, booleans and
// null, within MODULE_INPUT_LIMITS); INVALID_INPUT when it is not. invoke holds every input to this. It is
// exported so that the session door can hold what a handler returned, or what a binding shows, to the same rule
// before writing it on a line; the runtime itself still returns a handler's value as it is.
export function snapshotInput(value){
  let nodes=0,bytes=0;
  const ancestors=new Set();
  const add=count=>{bytes+=count;if(bytes>MODULE_INPUT_LIMITS.maxBytes)throw new ModuleError('INVALID_INPUT');};
  function visit(item,depth){
    if(++nodes>MODULE_INPUT_LIMITS.maxNodes||depth>MODULE_INPUT_LIMITS.maxDepth)throw new ModuleError('INVALID_INPUT');
    if(item===null||typeof item==='boolean'||(typeof item==='number'&&Number.isFinite(item))){add(JSON.stringify(item).length);return;}
    if(typeof item==='string'){
      if(item.length>MODULE_INPUT_LIMITS.maxBytes)throw new ModuleError('INVALID_INPUT');
      add(Buffer.byteLength(JSON.stringify(item)));return;
    }
    if(!item||typeof item!=='object'||isProxy(item)||ancestors.has(item))throw new ModuleError('INVALID_INPUT');
    const array=Array.isArray(item);
    if(array?Object.getPrototypeOf(item)!==Array.prototype:!plain(item))throw new ModuleError('INVALID_INPUT');
    const descriptors=Object.getOwnPropertyDescriptors(item),keys=Reflect.ownKeys(descriptors);
    if(keys.some(key=>typeof key!=='string'||!Object.hasOwn(descriptors[key],'value')))throw new ModuleError('INVALID_INPUT');
    if(array&&(item.length>MODULE_INPUT_LIMITS.maxNodes||keys.length!==item.length+1))throw new ModuleError('INVALID_INPUT');
    ancestors.add(item);add(2);
    const names=array?Array.from({length:item.length},(_,i)=>String(i)):keys;
    for(const [index,key] of names.entries()){
      const descriptor=descriptors[key];
      if(!descriptor||!descriptor.enumerable)throw new ModuleError('INVALID_INPUT');
      if(index)add(1);
      if(!array)add(Buffer.byteLength(JSON.stringify(key))+1);
      visit(descriptor.value,depth+1);
    }
    ancestors.delete(item);
  }
  visit(value,0);
  return structuredClone(value);
}

export function createModuleRuntime({authorize=()=>false}={}) {
  const entries=new Map();
  const get=id=>{const entry=entries.get(id);if(!entry)throw new ModuleError('MODULE_NOT_FOUND',false,{module:id});return entry;};
  const where=(id,entry)=>({module:id,module_version:entry.definition.version,module_revision:entry.revision});
  const usable=(entry,context)=>{if(['retiring','retired'].includes(entry.state))throw new ModuleError('MODULE_RETIRED',false,context??where(entry.definition.id,entry));};
  const transition=(entry,state)=>{if(entry.state!==state){entry.state=state;entry.epoch++;}};
  const describe=id=>{
    const entry=get(id),d=entry.definition;
    return {id:d.id,version:d.version,contract:d.contract,title:d.title,motif:d.motif,
      description:d.description,state:entry.state,revision:entry.revision,in_flight:entry.inFlight,
      ...(d.source===undefined?{}:{source:d.source}),
      // input_checked_by: `runtime` when the card carries a schema, which invoke holds the input to before the
      // gate; otherwise `handler`, and the runtime checks only that the input is bounded JSON data.
      operations:[...entry.operations].map(([id,op])=>({id,description:op.description,effects:[...op.effects],refusals:op.refusals.map(r=>({...r})),
        ...(op.input?{input:structuredClone(op.input)}:{}),...(op.returns?{returns:{...op.returns}}:{}),input_checked_by:op.check?'runtime':'handler'}))};
  };
  return {
    register(input){
      const definition=prepareDefinition(input);
      if(entries.has(definition.id))throw new ModuleError('MODULE_EXISTS',false,{module:definition.id});
      entries.set(definition.id,{definition,operations:new Map(Object.entries(definition.operations)),state:'registered',revision:1,inFlight:0,epoch:0});
      return describe(definition.id);
    },
    describe,
    catalog(){return [...entries.keys()].sort().map(describe);},
    activate(id){const entry=get(id);usable(entry);transition(entry,'active');return describe(id);},
    pause(id){const entry=get(id);usable(entry);transition(entry,'paused');return describe(id);},
    retire(id){const entry=get(id);transition(entry,entry.inFlight?'retiring':'retired');return describe(id);},
    upgrade(id,input,{expectedRevision}={}){
      const entry=get(id);
      usable(entry);
      if(entry.inFlight)throw new ModuleError('MODULE_BUSY',false,where(id,entry));
      if(expectedRevision!==entry.revision)throw new ModuleError('STALE_REVISION',false,where(id,entry));
      const definition=prepareDefinition(input);
      if(definition.id!==id || definition.contract!==entry.definition.contract||signature(definition)!==signature(entry.definition))throw new ModuleError('CONTRACT_MISMATCH',false,where(id,entry));
      entry.definition=definition;
      entry.operations=new Map(Object.entries(definition.operations));
      entry.revision++;
      entry.epoch++;
      return describe(id);
    },
    async invoke(id,operation,input=null){
      const entry=get(id);
      // Admission-time attribution: every error below names this module version.
      const context={...where(id,entry),operation};
      const fail=(code,started=false)=>new ModuleError(code,started,context);
      usable(entry,context);
      if(entry.state!=='active')throw fail('MODULE_INACTIVE');
      const op=entry.operations.get(operation);
      if(!op)throw fail('OPERATION_NOT_FOUND');
      const module={id,version:entry.definition.version,contract:entry.definition.contract,revision:entry.revision};
      const epoch=entry.epoch;
      let args;
      try {args=freezeData(snapshotInput(input));} catch {throw fail('INVALID_INPUT');}
      // When the card carries a schema, the frozen snapshot is held to it here: before the host gate is asked
      // and before the handler. A miss names a place, a keyword and the card's own word; nothing from the input.
      if(op.check){
        const miss=op.check(args);
        if(miss)throw Object.assign(fail('INVALID_INPUT'),{reason:'does_not_match_card',pointer:miss.pointer,keyword:miss.keyword,expected:miss.expected});
      }
      if(op.effects.length){
        let allowed=false;
        const request=freezeData({module:{...module},operation,effects:[...op.effects],input:args});
        try {allowed=await authorize(request)===true;} catch {}
        if(!allowed)throw fail('POLICY_BLOCKED');
      }
      usable(entry,context);
      if(entry.epoch!==epoch || entry.state!=='active')throw fail('ADMISSION_CHANGED');
      entry.inFlight++;
      try {
        const {run}=op;   // no receiver: handlers cannot reach the stored record
        const value=await run(args);
        return {module,operation,outcome:'returned',value,establishes_external_effect:false};
      } catch (error) {
        // Read the handler's words once, inside a guard: a Decline whose fields
        // throw is still a failure with an unknown effect, never a raw error.
        let declared,detail;
        try{
          if(error instanceof Decline&&typeof error.refusal_code==='string'){
            const code=error.refusal_code;
            declared=op.refusals.find(r=>r.code===code);
            detail=error.detail;
          }
        }catch{throw fail('OPERATION_FAILED',true);}
        if(!declared)throw fail('OPERATION_FAILED',true);
        const refusal={code:declared.code,meaning:declared.meaning,
          ...(declared.next===undefined?{}:{next:declared.next}),
          ...(typeof detail==='string'&&detail.length?{detail:detail.slice(0,DETAIL_LIMIT)}:{})};
        const declinedError=fail('DECLINED',true);
        declinedError.effect_outcome='not_applied';
        declinedError.refusal=refusal;
        throw declinedError;
      } finally {
        entry.inFlight--;
        if(entry.state==='retiring'&&!entry.inFlight)transition(entry,'retired');
      }
    },
  };
}
