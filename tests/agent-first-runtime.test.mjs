// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
const runtimeUrl = new URL('../agent-first/0.1/runtime.mjs', import.meta.url);

async function api() {
  assert.ok(existsSync(runtimeUrl), 'the agent-first module runtime must exist');
  return import(runtimeUrl.href);
}

function definition(version='1.0.0', handler=(input)=>input) {
  return {
    id:'example.echo', version, contract:'example.echo/1',
    title:'Echo', motif:'legibility', description:'Returns explicitly supplied data.',
    operations:{echo:{description:'Return the input.', effects:[], run:handler}},
  };
}

test('registration is inert, legible, and requires explicit activation before invocation', async()=>{
  const {createModuleRuntime}=await api();
  let calls=0;
  const runtime=createModuleRuntime();
  runtime.register(definition('1.0.0', input=>{calls++;return input;}));
  assert.equal(calls,0);
  const entry=runtime.describe('example.echo');
  assert.equal(entry.state,'registered');
  assert.equal(entry.revision,1);
  assert.equal(entry.operations[0].id,'echo');
  assert.equal(Object.hasOwn(entry.operations[0],'run'),false);
  await assert.rejects(runtime.invoke('example.echo','echo',{value:1}),{code:'MODULE_INACTIVE'});
  runtime.activate('example.echo');
  const result=await runtime.invoke('example.echo','echo',{value:1});
  assert.equal(calls,1);
  assert.equal(result.outcome,'returned');
  assert.deepEqual(result.value,{value:1});
  assert.equal(result.module.version,'1.0.0');
  assert.equal(result.module.revision,1);
  assert.equal(result.establishes_external_effect,false);
});

test('compatible upgrades require the current revision and preserve earlier result attribution', async()=>{
  const {createModuleRuntime}=await api();
  const runtime=createModuleRuntime();
  runtime.register(definition('1.0.0',()=> 'old')); runtime.activate('example.echo');
  const oldResult=await runtime.invoke('example.echo','echo',null);
  assert.equal(typeof runtime.upgrade,'function','upgrade must be an explicit lifecycle operation');
  assert.throws(()=>runtime.upgrade('example.echo',definition('1.1.0'),{expectedRevision:0}),{code:'STALE_REVISION'});
  assert.throws(()=>runtime.upgrade('example.echo',{...definition('2.0.0'),contract:'example.echo/2'},{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  assert.equal(runtime.describe('example.echo').version,'1.0.0');
  runtime.upgrade('example.echo',definition('1.1.0',()=> 'new'),{expectedRevision:1});
  const next=await runtime.invoke('example.echo','echo',null);
  assert.equal(next.value,'new'); assert.equal(next.module.revision,2);
  assert.equal(oldResult.value,'old'); assert.equal(oldResult.module.version,'1.0.0');
  assert.throws(()=>runtime.upgrade('example.echo',definition('1.2.0'),{expectedRevision:1}),{code:'STALE_REVISION'});
});

test('retirement closes admission immediately, drains calls, and leaves other modules usable', async()=>{
  const {createModuleRuntime}=await api();
  const runtime=createModuleRuntime(); let release;
  runtime.register(definition('1.0.0',()=>new Promise(resolve=>{release=resolve;})));
  runtime.register({...definition(),id:'example.other'});
  runtime.activate('example.echo'); runtime.activate('example.other');
  const pending=runtime.invoke('example.echo','echo',null);
  assert.throws(()=>runtime.upgrade('example.echo',definition('1.1.0'),{expectedRevision:1}),{code:'MODULE_BUSY'});
  assert.equal(runtime.retire('example.echo').state,'retiring');
  await assert.rejects(runtime.invoke('example.echo','echo',null),{code:'MODULE_RETIRED'});
  release('retained result');
  const completed=await pending;
  assert.equal(completed.value,'retained result'); assert.equal(completed.module.version,'1.0.0');
  assert.equal(runtime.describe('example.echo').state,'retired');
  assert.equal(runtime.retire('example.echo').state,'retired');
  assert.throws(()=>runtime.activate('example.echo'),{code:'MODULE_RETIRED'});
  assert.throws(()=>runtime.upgrade('example.echo',definition('1.1.0'),{expectedRevision:1}),{code:'MODULE_RETIRED'});
  assert.equal((await runtime.invoke('example.other','echo','still here')).value,'still here');
  runtime.pause('example.other');
  await assert.rejects(runtime.invoke('example.other','echo',null),{code:'MODULE_INACTIVE'});
  runtime.activate('example.other');
  assert.equal((await runtime.invoke('example.other','echo','returned')).value,'returned');
});

test('local IO requires an explicit positive host gate and a pending gate cannot outlive retirement', async()=>{
  const {createModuleRuntime}=await api();
  let calls=0;
  const module=definition('1.0.0',()=>{calls++;return 'read';});
  module.operations.echo.effects=['local-read'];
  const closed=createModuleRuntime(); closed.register(module);closed.activate(module.id);
  await assert.rejects(closed.invoke(module.id,'echo',{}),{code:'POLICY_BLOCKED'});
  assert.equal(calls,0);
  let approve;
  const runtime=createModuleRuntime({authorize:()=>new Promise(resolve=>{approve=resolve;})});
  runtime.register(module);runtime.activate(module.id);
  const pending=runtime.invoke(module.id,'echo',{});
  assert.equal(runtime.retire(module.id).state,'retired');
  approve(true);
  await assert.rejects(pending,{code:'MODULE_RETIRED'});
  assert.equal(calls,0);
  const allowed=createModuleRuntime({authorize:request=>request.module.id===module.id && request.operation==='echo'});
  allowed.register(module);allowed.activate(module.id);
  assert.equal((await allowed.invoke(module.id,'echo',{})).value,'read');
  assert.equal(calls,1);
});

test('upgrade or pause/resume invalidates a pending gate instead of silently using its old approval',async()=>{
  const {createModuleRuntime}=await api();
  for(const change of ['upgrade','pause']){
    let approve,calls=0;
    const runtime=createModuleRuntime({authorize:()=>new Promise(resolve=>{approve=resolve;})});
    const d=definition('1.0.0',()=>{calls++;});d.operations.echo.effects=['local-read'];
    runtime.register(d);runtime.activate(d.id);
    const pending=runtime.invoke(d.id,'echo',{});
    if(change==='upgrade')runtime.upgrade(d.id,{...d,version:'1.1.0'},{expectedRevision:1});
    else {runtime.pause(d.id);runtime.activate(d.id);}
    approve(true);
    await assert.rejects(pending,{code:'ADMISSION_CHANGED'});
    assert.equal(calls,0);
  }
});

test('module contracts are copied, validated before mutation, and cannot upgrade their effect surface silently',async()=>{
  const {createModuleRuntime}=await api();
  const runtime=createModuleRuntime();
  const original=definition('1.0.0',()=> 'original');
  runtime.register(original); runtime.activate(original.id);
  original.version='changed';original.operations.echo.run=()=> 'changed';original.operations.echo.effects.push('local-write');
  assert.equal(runtime.describe('example.echo').version,'1.0.0');
  assert.deepEqual(runtime.describe('example.echo').operations[0].effects,[]);
  assert.equal((await runtime.invoke('example.echo','echo',null)).value,'original');
  assert.throws(()=>runtime.register({...definition(),id:'bad name'}),{code:'INVALID_MODULE'});
  assert.throws(()=>runtime.register({...definition(),id:'example.bad',permissions:'unsupported'}),{code:'INVALID_MODULE'});
  const changed=definition('1.1.0');changed.operations.echo.effects=['local-write'];
  assert.throws(()=>runtime.upgrade('example.echo',changed,{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  assert.equal(runtime.describe('example.echo').revision,1);
  assert.throws(()=>runtime.register({...definition(),id:'example.bad',operations:{}}),{code:'INVALID_MODULE'});
  assert.throws(()=>runtime.describe('example.bad'),{code:'MODULE_NOT_FOUND'});
});

test('the deferred host gate sees deeply immutable input matching the dispatched snapshot',async()=>{
  const {createModuleRuntime}=await api();let approve,inspected;
  const runtime=createModuleRuntime({authorize:request=>{
    assert.ok(Object.isFrozen(request));assert.ok(Object.isFrozen(request.module));assert.ok(Object.isFrozen(request.effects));
    assert.ok(Object.isFrozen(request.input));assert.ok(Object.isFrozen(request.input.nested));assert.ok(Object.isFrozen(request.input.items));
    assert.throws(()=>{request.input.nested.value='gate mutation';},TypeError);
    assert.throws(()=>request.effects.push('local-write'),TypeError);
    inspected=structuredClone(request.input);
    return new Promise(resolve=>{approve=resolve;});
  }});
  const d=definition();d.operations.echo.effects=['local-read'];runtime.register(d);runtime.activate(d.id);
  const input={nested:{value:'chosen'},items:['chosen']};
  const pending=runtime.invoke(d.id,'echo',input);pending.catch(()=>{});
  input.nested.value='caller mutation';input.items.push('later');
  assert.equal(typeof approve,'function','immutability must hold inside the gate, before approval');approve(true);
  assert.deepEqual((await pending).value,inspected);
  assert.deepEqual(inspected,{nested:{value:'chosen'},items:['chosen']});
});

test('operation errors are opaque, mark outcome unknown, and still drain the module',async()=>{
  const {createModuleRuntime}=await api();
  const runtime=createModuleRuntime();
  const d=definition('1.0.0',()=>{throw new Error('private fixture detail');});runtime.register(d);runtime.activate(d.id);
  await assert.rejects(runtime.invoke(d.id,'echo',{}),error=>{
    assert.equal(error.code,'OPERATION_FAILED');
    assert.equal(error.operation_started,true);
    assert.equal(error.effect_outcome,'unknown');
    assert.equal(error.retryable,false);
    assert.equal(error.message.includes('private fixture detail'),false);return true;
  });
  assert.equal(runtime.describe(d.id).in_flight,0);
  assert.equal(runtime.retire(d.id).state,'retired');
});

test('arguments are bounded JSON data, not shared memory, accessors, or executable objects',async()=>{
  const {createModuleRuntime}=await api();let calls=0,getters=0;
  const runtime=createModuleRuntime();
  runtime.register(definition('1.0.0',input=>{calls++;return input;}));runtime.activate('example.echo');
  const accessor=Object.defineProperty({},'value',{enumerable:true,get(){getters++;return 1;}});
  const cyclic={};cyclic.self=cyclic;
  for(const input of [NaN,{value:undefined},new Date(),new SharedArrayBuffer(8),accessor,cyclic]){
    await assert.rejects(runtime.invoke('example.echo','echo',input),{code:'INVALID_INPUT'});
  }
  assert.equal(calls,0);assert.equal(getters,0);
  assert.deepEqual((await runtime.invoke('example.echo','echo',{nested:[null,true,3,'text']})).value,{nested:[null,true,3,'text']});
});

function refusing(throwIt,refusals){
  return {...definition(),operations:{echo:{description:'Declines.',effects:[],refusals,run:throwIt}}};
}
const declared=[{code:'too_big',meaning:'Input is too large.',effect:'not_applied',next:'Send less.'}];

test('a declared refusal is a distinct DECLINED result, not OPERATION_FAILED',async()=>{
  const {createModuleRuntime,Decline}=await api();
  const runtime=createModuleRuntime();
  const d=refusing(()=>{throw new Decline('too_big','x'.repeat(500));},declared);
  runtime.register(d);runtime.activate(d.id);
  assert.deepEqual(runtime.describe(d.id).operations[0].refusals,declared);
  await assert.rejects(runtime.invoke(d.id,'echo',{}),e=>{
    assert.equal(e.code,'DECLINED');assert.equal(e.operation_started,true);assert.equal(e.effect_outcome,'not_applied');
    assert.equal(e.retryable,false);
    assert.deepEqual({...e.refusal,detail:undefined},{code:'too_big',meaning:'Input is too large.',next:'Send less.',detail:undefined});
    assert.equal(e.refusal.detail.length,200);
    assert.equal(e.module,'example.echo');assert.equal(e.operation,'echo');
    assert.equal(e.module_version,'1.0.0');assert.equal(e.module_revision,1);return true;});
  assert.equal(runtime.describe(d.id).in_flight,0);
});

test('an undeclared or malformed refusal is not trusted',async()=>{
  const {createModuleRuntime,Decline}=await api();
  for(const thrown of [()=>new Decline('other_code'),()=>new Decline(42),()=>new Decline(undefined),()=>({refusal_code:'too_big'}),()=>new Error('too_big')]){
    const runtime=createModuleRuntime();
    const d=refusing(()=>{throw thrown();},declared);runtime.register(d);runtime.activate(d.id);
    await assert.rejects(runtime.invoke(d.id,'echo',{}),{code:'OPERATION_FAILED',effect_outcome:'unknown',operation_started:true});
  }
});

test('refusal declarations are validated and part of the upgrade signature',async()=>{
  const {createModuleRuntime}=await api();
  const runtime=createModuleRuntime();
  for(const bad of [[{code:'Bad Code',meaning:'m',effect:'not_applied'}],[{code:'a',meaning:'m',effect:'unknown'}],
    [{code:'a',meaning:'m',effect:'not_applied'},{code:'a',meaning:'m',effect:'not_applied'}],[{code:'a',meaning:'',effect:'not_applied'}],
    [{code:'a',meaning:'m',effect:'not_applied',extra:1}],'nope'])
    assert.throws(()=>runtime.register({...refusing(()=>1,bad),id:'example.bad'}),{code:'INVALID_MODULE'});
  const d=refusing(()=>'ok',declared);runtime.register(d);runtime.activate(d.id);
  assert.throws(()=>runtime.upgrade(d.id,refusing(()=>'ok',[]),{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  assert.throws(()=>runtime.upgrade(d.id,{...refusing(()=>'ok',[...declared,{code:'more',meaning:'m',effect:'not_applied'}])},{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  runtime.upgrade(d.id,{...refusing(()=>'ok',declared),version:'1.1.0'},{expectedRevision:1});
  assert.equal((await runtime.invoke(d.id,'echo',{})).value,'ok');
});

test('errors name module, operation and admission-time version; retryable is per code',async()=>{
  const {createModuleRuntime}=await api();
  let release;
  const runtime=createModuleRuntime();
  runtime.register(definition('1.0.0',()=>new Promise(r=>{release=r;})));runtime.activate('example.echo');
  const pending=runtime.invoke('example.echo','echo',null);
  const busy=(()=>{try{runtime.upgrade('example.echo',definition('1.1.0'),{expectedRevision:1});}catch(e){return e;}})();
  assert.equal(busy.code,'MODULE_BUSY');assert.equal(busy.retryable,true);assert.equal(busy.module,'example.echo');assert.equal(busy.module_revision,1);
  // busy is checked before staleness; drain, then check stale
  release('x');await pending;
  const stale2=(()=>{try{runtime.upgrade('example.echo',definition('1.1.0'),{expectedRevision:9});}catch(e){return e;}})();
  assert.equal(stale2.code,'STALE_REVISION');assert.equal(stale2.retryable,true);
  await assert.rejects(runtime.invoke('example.echo','nope',null),e=>e.code==='OPERATION_NOT_FOUND'&&e.operation==='nope'&&e.module_version==='1.0.0'&&e.retryable===false);
  await assert.rejects(runtime.invoke('missing.mod','echo',null),e=>e.code==='MODULE_NOT_FOUND'&&e.module==='missing.mod');
  runtime.retire('example.echo');
  await assert.rejects(runtime.invoke('example.echo','echo',null),e=>e.code==='MODULE_RETIRED'&&e.retryable===false&&e.module_revision===1);
  // ADMISSION_CHANGED reports the revision the call was admitted under
  let approve;
  const gated=createModuleRuntime({authorize:()=>new Promise(r=>{approve=r;})});
  const d=definition();d.operations.echo.effects=['local-read'];gated.register(d);gated.activate(d.id);
  const p=gated.invoke(d.id,'echo',{});gated.upgrade(d.id,{...d,version:'1.1.0'},{expectedRevision:1});approve(true);
  await assert.rejects(p,e=>e.code==='ADMISSION_CHANGED'&&e.retryable===true&&e.module_version==='1.0.0'&&e.module_revision===1);
});

test('stored operation records are frozen and handlers run with no receiver',async()=>{
  const {createModuleRuntime}=await api();
  const runtime=createModuleRuntime();let seen='unset';
  runtime.register(definition('1.0.0',function(){seen=this;return 1;}));runtime.activate('example.echo');
  await runtime.invoke('example.echo','echo',null);
  assert.equal(seen,undefined);
  const view=runtime.describe('example.echo').operations[0];
  view.effects.push('local-write');view.description='changed';
  assert.deepEqual(runtime.describe('example.echo').operations[0].effects,[]);
  assert.equal(runtime.describe('example.echo').operations[0].description,'Return the input.');
  // the handler cannot reach and edit the stored record through a receiver
  const sneaky=definition('1.0.0',function(){try{this.effects.push('local-write');}catch{}return 'done';});
  const other=createModuleRuntime();other.register({...sneaky,id:'example.sneaky'});other.activate('example.sneaky');
  await other.invoke('example.sneaky','echo',null);
  assert.deepEqual(other.describe('example.sneaky').operations[0].effects,[]);
});
