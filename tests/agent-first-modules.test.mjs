// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createModuleRuntime } from '../agent-first/0.1/runtime.mjs';

const url=new URL('../agent-first/0.1/modules.mjs',import.meta.url);
async function modules(){
  assert.ok(existsSync(url),'the existing Xenia profiles must have real module adapters');
  return (await import(url.href)).createXeniaModules();
}

test('a local catalog and useful Xenia operations work with no AgentTool provider',async()=>{
  const runtime=createModuleRuntime();
  for(const module of await modules())runtime.register(module);
  assert.deepEqual(runtime.catalog().map(m=>m.id),['xenia.covenant','xenia.surface','xenia.work']);
  assert.ok(runtime.catalog().every(m=>m.state==='registered'));
  for(const {id} of runtime.catalog())runtime.activate(id);
  const surface=await runtime.invoke('xenia.surface','manifest',{
    service:{name:'Local example',canonicalUrl:'https://example.com/',description:'An unserved example.'},
    resources:[{id:'about',href:'https://example.com/about'}],
  });
  assert.equal(surface.value.profile,'xenia-surface/0.1');
  assert.equal(surface.value.claims.length,0);
  const draft=await runtime.invoke('xenia.covenant','draft',{
    hostName:'Local example',canonicalUrl:'https://example.com/',
    speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z',
  });
  assert.equal(draft.value.declaration.status,'draft');
  assert.equal(draft.value.declaration.speaker.authority_state,'unverified');
  assert.equal(draft.value.non_claims.no_conformance_badge,true);
  const fixture=JSON.parse(readFileSync(new URL('../work/0.1/examples/declined.json',import.meta.url),'utf8'));
  const checked=await runtime.invoke('xenia.work','check',fixture);
  assert.equal(checked.value.valid,true);
  assert.equal(checked.establishes_external_effect,false);
  runtime.retire('xenia.work');
  await assert.rejects(runtime.invoke('xenia.work','check',fixture),{code:'MODULE_RETIRED'});
  assert.equal((await runtime.invoke('xenia.covenant','draft',{
    hostName:'Still local',canonicalUrl:'https://example.com/',speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z',
  })).value.declaration.status,'draft');
});

test('invalid input to the pure builders is a declared refusal with bounded native detail',async()=>{
  const runtime=createModuleRuntime();
  for(const module of await modules())runtime.register(module);
  for(const {id} of runtime.catalog())runtime.activate(id);
  for(const [id,op] of [['xenia.surface','manifest'],['xenia.covenant','draft']]){
    assert.deepEqual(runtime.describe(id).operations[0].refusals.map(r=>r.code),['invalid_input']);
    await assert.rejects(runtime.invoke(id,op,{}),e=>{
      assert.equal(e.code,'DECLINED');assert.equal(e.effect_outcome,'not_applied');
      assert.equal(e.refusal.code,'invalid_input');
      assert.ok(e.refusal.detail.length>0&&e.refusal.detail.length<=200);return true;});
  }
  // a Work record that fails the checker is a normal report, not a refusal
  assert.equal((await runtime.invoke('xenia.work','check',{})).value.valid,false);
});
