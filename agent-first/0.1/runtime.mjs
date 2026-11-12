// SPDX-License-Identifier: MPL-2.0
// Repository-only module composition, not a Xenia conformance/authority claim.
import { isProxy } from 'node:util/types';

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
// only for a code the operation declared in advance.
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
    const op=input.operations[name];record(op,['description','effects','run','refusals']);
    if(!text(op.description)||typeof op.run!=='function'||!Array.isArray(op.effects)||isProxy(op.effects)||
      op.effects.some(effect=>!['local-read','local-write'].includes(effect))||new Set(op.effects).size!==op.effects.length)throw new ModuleError('INVALID_MODULE');
    operations[name]={description:op.description,effects:Object.freeze([...op.effects].sort()),run:op.run,
      refusals:prepareRefusals(op.refusals)};
    Object.freeze(operations[name]);
  }
  return {id:input.id,version:input.version,contract:input.contract,title:input.title,
    motif:input.motif,description:input.description,...(input.source===undefined?{}:{source:input.source}),operations};
}
const signature=definition=>JSON.stringify(Object.entries(definition.operations).map(([id,op])=>[id,op.effects,op.refusals.map(r=>[r.code,r.effect])]));

export const MODULE_INPUT_LIMITS=Object.freeze({maxBytes:1024*1024,maxDepth:32,maxNodes:65536});
function freezeData(value){
  if(value!==null&&typeof value==='object'){
    for(const child of Object.values(value))freezeData(child);
    Object.freeze(value);
  }
  return value;
}
function snapshotInput(value){
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
      operations:[...entry.operations].map(([id,op])=>({id,description:op.description,effects:[...op.effects],refusals:op.refusals.map(r=>({...r}))}))};
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
        const declared=error instanceof Decline&&typeof error.refusal_code==='string'?
          op.refusals.find(r=>r.code===error.refusal_code):undefined;
        if(!declared)throw fail('OPERATION_FAILED',true);
        const refusal={code:declared.code,meaning:declared.meaning,
          ...(declared.next===undefined?{}:{next:declared.next}),
          ...(typeof error.detail==='string'&&error.detail.length?{detail:error.detail.slice(0,DETAIL_LIMIT)}:{})};
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
