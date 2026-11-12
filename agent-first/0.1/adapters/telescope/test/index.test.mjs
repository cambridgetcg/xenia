// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createModuleRuntime } from '../../../runtime.mjs';
const entry = new URL('../index.mjs', import.meta.url);
async function adapter() {
  assert.ok(existsSync(entry), 'the optional Telescope module must exist');
  return import(entry.href);
}

test('the reader is an optional inert module until explicitly activated', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  let calls = 0;
  const definition = createTelescopeSurfaceModule({
    parseXeniaSurfaceManifestEvidence(body) { assert.ok(body instanceof Uint8Array); assert.deepEqual([...body], [123]); calls++; return { ok: false, code: 'invalid_json' }; },
  });
  const host = createModuleRuntime();
  host.register(definition);
  assert.equal(calls, 0);
  assert.equal(Object.hasOwn(host.describe(definition.id).operations[0], 'run'), false);
  assert.deepEqual(host.describe(definition.id).operations[0].effects, []);
  await assert.rejects(host.invoke(definition.id, 'recognize', { manifest_text: '{' }), { code: 'MODULE_INACTIVE' });
  assert.equal(calls, 0);
  host.activate(definition.id);
  const receipt = await host.invoke(definition.id, 'recognize', { manifest_text: '{' });
  assert.equal(calls, 1);
  assert.equal(receipt.outcome, 'returned');
  assert.equal(receipt.establishes_external_effect, false);
  assert.equal(receipt.value.recognized, false);
  assert.equal(receipt.value.problem, 'invalid_json');
  assert.equal(receipt.value.surface_conformance, 'not_tested');
  assert.equal(receipt.value.authority, 'none');
});


test('an absent provider is explicit and does not trigger package discovery', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  for (const provider of [undefined, null, {}, { parseXeniaSurfaceManifestEvidence: true }]) {
    assert.throws(() => createTelescopeSurfaceModule(provider), { code: 'TELESCOPE_PROVIDER_REQUIRED' });
  }
});


test('only well-formed JSON text input enters the provider', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  let calls = 0;
  const definition = createTelescopeSurfaceModule({ parseXeniaSurfaceManifestEvidence() { calls++; return {ok:false,code:'invalid_json'}; } });
  for (const input of [null, {}, [], {manifest_text: 1}, {manifest_text:'{}',extra:true}, {manifest_text:'\ud800'}]) {
    const result = definition.operations.recognize.run(input);
    assert.equal(result.recognized, false);
    assert.equal(result.problem, 'invalid_input');
  }
  assert.equal(calls, 0);
});


test('the UTF-8 byte cap is checked before provider parsing', async () => {
  const { createTelescopeSurfaceModule, MAX_MANIFEST_BYTES } = await adapter();
  assert.equal(MAX_MANIFEST_BYTES, 65_536);
  let calls = 0;
  const definition = createTelescopeSurfaceModule({ parseXeniaSurfaceManifestEvidence() { calls++; return {ok:false,code:'invalid_json'}; } });
  for (const text of ['x'.repeat(MAX_MANIFEST_BYTES + 1), '界'.repeat(Math.floor(MAX_MANIFEST_BYTES / 3) + 1)]) {
    const result = definition.operations.recognize.run({manifest_text:text});
    assert.equal(result.problem, 'input_too_large');
  }
  assert.equal(calls, 0);
  definition.operations.recognize.run({manifest_text:' '.repeat(MAX_MANIFEST_BYTES)});
  assert.equal(calls, 1);
});


function summary() {
  return {
    schema_version:'xenia.surface.manifest/0.1', profile:'xenia-surface/0.1',
    service_canonical_origin:'https://example.com', resource_count:1, html_resource_count:1,
    declared_claim_count:1, declared_asserted_claim_count:0, declared_tested_claim_count:0,
    declared_attested_claim_count:1, declared_pass_claim_count:1, declared_fail_claim_count:0,
    declared_unknown_claim_count:0, not_covered_count:1,
  };
}

test('recognition projects bounded facts and never upgrades declared claims into proof', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  const supplied = {...summary(),raw_body:'PRIVATE-FIXTURE',claims_verified:true};
  const definition=createTelescopeSurfaceModule({parseXeniaSurfaceManifestEvidence:()=>({ok:true,value:supplied})});
  const result=definition.operations.recognize.run({manifest_text:'{}'});
  assert.equal(result.recognized,true);
  assert.deepEqual(result.summary,summary());
  assert.equal(result.claims_verified,false);
  assert.equal(result.evidence_verified,false);
  assert.equal(result.covenant_adoption,'not_assessed');
  assert.equal(result.surface_conformance,'not_tested');
  assert.equal(result.authority,'none');
  supplied.resource_count=8;
  assert.equal(result.summary.resource_count,1);
  assert.ok(!JSON.stringify(result).includes('PRIVATE-FIXTURE'));
});


test('a malformed provider return is unknown, not a false document verdict or private diagnostic', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  const reports = [null, {}, {ok:'yes'}, {ok:false,code:'PRIVATE-FIXTURE'},
    {ok:true,value:{...summary(),resource_count:-1}},
    {ok:true,value:{...summary(),declared_claim_count:2}},
    {ok:true,value:{...summary(),service_canonical_origin:'https://user:PRIVATE-FIXTURE@example.com'}},
    {ok:true,value:{...summary(),service_canonical_origin:'https://example.com/?token=PRIVATE-FIXTURE'}},
  ];
  for (const report of reports) {
    const definition=createTelescopeSurfaceModule({parseXeniaSurfaceManifestEvidence:()=>report});
    let result;
    assert.doesNotThrow(()=>{result=definition.operations.recognize.run({manifest_text:'{}'});});
    assert.equal(result.recognized,null);
    assert.equal(result.problem,'provider_contract_mismatch');
    assert.equal(result.summary,null);
    assert.ok(!JSON.stringify(result).includes('PRIVATE-FIXTURE'));
  }
});

test('the selected parser is fixed until an explicit module upgrade', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  const namespace={parseXeniaSurfaceManifestEvidence:()=>({ok:false,code:'invalid_json'})};
  const definition=createTelescopeSurfaceModule(namespace);
  namespace.parseXeniaSurfaceManifestEvidence=()=>({ok:false,code:'xenia_surface_profile_mismatch'});
  assert.equal(definition.operations.recognize.run({manifest_text:'{}'}).problem,'invalid_json');
});

test('retiring the reader makes no later provider call and preserves the admitted receipt', async () => {
  const { createTelescopeSurfaceModule } = await adapter();
  let calls=0;
  const definition=createTelescopeSurfaceModule({parseXeniaSurfaceManifestEvidence:()=>{calls++;return {ok:true,value:summary()};}});
  const host=createModuleRuntime(); host.register(definition); host.activate(definition.id);
  const pending=host.invoke(definition.id,'recognize',{manifest_text:'{}'});
  host.retire(definition.id);
  const receipt=await pending;
  assert.equal(receipt.value.recognized,true);
  assert.equal(receipt.module.version,definition.version);
  await assert.rejects(host.invoke(definition.id,'recognize',{manifest_text:'{}'}),{code:'MODULE_RETIRED'});
  assert.equal(calls,1);
  host.register({id:'fixture.other',version:'1.0.0',contract:'fixture.other/1',title:'Other',motif:'independence',description:'Independent fixture.',operations:{echo:{description:'Return data.',effects:[],run:input=>input}}});
  host.activate('fixture.other');
  assert.equal((await host.invoke('fixture.other','echo','still available')).value,'still available');
});


test('the optional local provider is the real source-derived AgentTool reader', async () => {
  const providerUrl=new URL('../provider/index.mjs',import.meta.url);
  assert.ok(existsSync(providerUrl),'the source-pinned optional provider must be present');
  const provider=await import(providerUrl.href);
  assert.deepEqual(Object.keys(provider),['parseXeniaSurfaceManifestEvidence']);
  const {createTelescopeSurfaceModule}=await adapter();
  const {readFileSync}=await import('node:fs');
  const text=readFileSync(new URL('../../../../../surface/0.1/example-manifest.json',import.meta.url),'utf8');
  const host=createModuleRuntime();const module=createTelescopeSurfaceModule(provider);
  host.register(module);host.activate(module.id);
  const result=(await host.invoke(module.id,'recognize',{manifest_text:text})).value;
  assert.equal(result.recognized,true);
  assert.equal(result.summary.resource_count,1);
  assert.equal(result.summary.declared_asserted_claim_count,1);
  assert.equal(result.claims_verified,false);
  assert.equal(result.surface_conformance,'not_tested');
  const malformed=(await host.invoke(module.id,'recognize',{manifest_text:'{'})).value;
  assert.equal(malformed.problem,'invalid_json');
});


test('a local machine-readable contract describes inputs and actual result variants', async () => {
  const contractUrl=new URL('../contract.json',import.meta.url);
  assert.ok(existsSync(contractUrl),'the module contract must be present');
  const {readFileSync}=await import('node:fs');
  const {default:Ajv}=await import('ajv/dist/2020.js');
  const {default:addFormats}=await import('ajv-formats');
  const contract=JSON.parse(readFileSync(contractUrl,'utf8'));
  const ajv=new Ajv({strict:true});addFormats(ajv);
  const input=ajv.compile(contract.input_schema),output=ajv.compile(contract.output_schema);
  const {createTelescopeSurfaceModule}=await adapter();
  assert.equal(input({manifest_text:'{}'}),true);
  assert.equal(input({manifest_text:'{}',extra:true}),false);
  assert.equal(input({manifest_text:3}),false);
  for(const providerResult of [{ok:true,value:summary()},{ok:false,code:'invalid_json'},null]){
    const module=createTelescopeSurfaceModule({parseXeniaSurfaceManifestEvidence:()=>providerResult});
    assert.equal(module.id,contract.module_id);
    assert.equal(module.contract,contract.contract);
    const result=module.operations.recognize.run({manifest_text:'{}'});
    assert.equal(output(result),true,JSON.stringify(output.errors));
    assert.equal(output({...result,authority:'granted'}),false);
  }
});

test('an explicit wrapper upgrade preserves prior real-reader attribution and rejects stale replacement', async () => {
  const {createTelescopeSurfaceModule}=await adapter();
  const provider=await import(new URL('../provider/index.mjs',import.meta.url).href);
  const {readFileSync}=await import('node:fs');
  const text=readFileSync(new URL('../../../../../surface/0.1/example-manifest.json',import.meta.url),'utf8');
  const host=createModuleRuntime();const first=createTelescopeSurfaceModule(provider);
  host.register(first);host.activate(first.id);
  const before=await host.invoke(first.id,'recognize',{manifest_text:text});
  // Synthetic adapter revision: no new upstream release is claimed.
  const next={...createTelescopeSurfaceModule(provider),version:'0.1.1-dev.0',source:'Synthetic wrapper revision for a lifecycle test; same verified parser.'};
  host.upgrade(first.id,next,{expectedRevision:before.module.revision});
  const after=await host.invoke(first.id,'recognize',{manifest_text:text});
  assert.equal(before.module.version,'0.1.0-dev.0');
  assert.equal(after.module.version,'0.1.1-dev.0');
  assert.notEqual(before.module.revision,after.module.revision);
  assert.deepEqual(before.value,after.value);
  assert.throws(()=>host.upgrade(first.id,next,{expectedRevision:before.module.revision}),{code:'STALE_REVISION'});
});
