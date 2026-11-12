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
  await assert.rejects(runtime.invoke(module.id,'render',{dir:'/other/root'}),{code:'OPERATION_FAILED'});
  assert.equal(calls.length,count);
  runtime.retire(module.id);
  await assert.rejects(runtime.invoke(module.id,'render',{}),{code:'MODULE_RETIRED'});
  assert.equal(calls.length,count);
});

test('the adapter rejects an incomplete provider instead of discovering credentials or substituting a backend',async()=>{
  const make=await factory();
  assert.throws(()=>make({starter:{},dir:'/explicit/notes',version:'0.1.0-dev.0'}),{code:'INVALID_PROVIDER'});
});
