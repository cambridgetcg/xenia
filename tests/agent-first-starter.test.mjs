// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {createModuleRuntime} from '../agent-first/0.1/runtime.mjs';
const url=new URL('../agent-first/0.1/adapters/local-starter.mjs',import.meta.url);

async function factory(){assert.ok(existsSync(url),'the removable AgentTool adapter must exist');return (await import(url.href)).createLocalStarterModule;}

test('AgentTool integration binds one explicit root and does not run during discovery',async()=>{
  const make=await factory(),calls=[];
  const starter=Object.fromEntries(['initStarter','inspectStarter','renderStarter','writeHandoff'].map(name=>[name,(...args)=>{calls.push([name,...args]);return {from:name};}]));
  const module=make({starter,dir:'/explicit/notes',version:'0.1.0-dev.0',source:'fixture API, not a real distribution'});
  const runtime=createModuleRuntime({authorize:r=>r.module.id===module.id});
  runtime.register(module);runtime.activate(module.id);
  assert.deepEqual(calls,[]);
  assert.equal(JSON.stringify(runtime.describe(module.id)).includes('/explicit/notes'),false);
  await runtime.invoke(module.id,'status',{});
  await runtime.invoke(module.id,'render',{});
  await runtime.invoke(module.id,'handoff',{text:'selected',expectedSha256:'a'.repeat(64)});
  assert.deepEqual(calls,[['inspectStarter','/explicit/notes'],['renderStarter','/explicit/notes'],['writeHandoff','/explicit/notes','selected','a'.repeat(64)]]);
  const count=calls.length;
  // Designed refusal, not a failure: declared invalid_input, nothing attempted.
  await assert.rejects(runtime.invoke(module.id,'render',{dir:'/other/root'}),e=>{
    assert.equal(e.code,'DECLINED');assert.equal(e.refusal.code,'invalid_input');
    assert.equal(e.effect_outcome,'not_applied');return true;});
  assert.equal(calls.length,count);
  runtime.retire(module.id);
  await assert.rejects(runtime.invoke(module.id,'render',{}),{code:'MODULE_RETIRED'});
  assert.equal(calls.length,count);
});

test('the adapter rejects an incomplete provider instead of discovering credentials or substituting a backend',async()=>{
  const make=await factory();
  assert.throws(()=>make({starter:{},dir:'/explicit/notes',version:'0.1.0-dev.0'}),{code:'INVALID_PROVIDER'});
});

test('provider failure codes map to declared refusals; unnamed failures stay unknown',async()=>{
  const make=await factory();
  const fail=code=>{const e=new Error(code);e.name='StarterError';e.code=code;return e;};
  let next;
  const starter=Object.fromEntries(['initStarter','inspectStarter','renderStarter','writeHandoff'].map(n=>[n,()=>{throw fail(next);}]));
  const module=make({starter,dir:'/explicit/notes',version:'0.1.0-dev.0'});
  const runtime=createModuleRuntime({authorize:()=>true});
  runtime.register(module);runtime.activate(module.id);
  const hand={text:'t',expectedSha256:'a'.repeat(64)};
  const cases=[['handoff','write_conflict',hand],['handoff','write_locked',hand],['handoff','invalid_handoff',hand],
    ['init','already_exists',{}],['status','missing_root',{}],['render','missing_root',{}]];
  for(const [op,code,input] of cases){
    next=code;
    await assert.rejects(runtime.invoke(module.id,op,input),e=>{
      assert.equal(e.code,'DECLINED',code);assert.equal(e.refusal.code,code);
      assert.equal(e.operation_started,true);assert.equal(e.effect_outcome,'not_applied');
      assert.ok(e.refusal.meaning&&e.refusal.next);assert.equal(e.module,module.id);assert.equal(e.operation,op);return true;});
  }
  for(const code of ['write_uncertain','write_failed','init_uncertain','something_new']){
    next=code;
    await assert.rejects(runtime.invoke(module.id,'handoff',hand),{code:'OPERATION_FAILED',effect_outcome:'unknown'});
  }
  // a refusal code another operation declared is not trusted here
  next='write_conflict';
  await assert.rejects(runtime.invoke(module.id,'status',{}),{code:'OPERATION_FAILED',effect_outcome:'unknown'});
});
