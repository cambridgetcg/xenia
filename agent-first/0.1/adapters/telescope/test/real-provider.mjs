// SPDX-License-Identifier: MPL-2.0
// Explicit local integration check. The selected provider is executable host code.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createModuleRuntime} from '../../../runtime.mjs';
import {createTelescopeSurfaceModule} from '../index.mjs';
import {defineSurfaceManifest} from '../../../../../dist/surface-0.1.js';

if(process.argv.length !== 3) throw new Error('Pass one explicitly reviewed local provider entry path.');
const provider = await import(pathToFileURL(resolve(process.argv[2])).href);
const host = createModuleRuntime();
const definition = createTelescopeSurfaceModule(provider);
host.register(definition);
await assert.rejects(host.invoke(definition.id,'recognize',{manifest_text:'{}'}),{code:'MODULE_INACTIVE'});
host.activate(definition.id);
const manifest = defineSurfaceManifest({
  service:{name:'Local module interoperability',canonicalUrl:'https://example.com/',description:'An unserved local fixture.'},
  resources:[{id:'about',href:'https://example.com/about'}],
});
const generated = await host.invoke(definition.id,'recognize',{manifest_text:JSON.stringify(manifest)});
assert.equal(generated.value.recognized,true);
assert.equal(generated.value.summary.resource_count,1);
assert.equal(generated.value.summary.declared_claim_count,0);
assert.equal(generated.value.surface_conformance,'not_tested');

const text=readFileSync(new URL('../../../../../surface/0.1/example-manifest.json',import.meta.url),'utf8');
const publishedExample=await host.invoke(definition.id,'recognize',{manifest_text:text});
assert.equal(publishedExample.value.recognized,true);
assert.equal(publishedExample.value.summary.declared_asserted_claim_count,1);
assert.equal(publishedExample.value.claims_verified,false);
const declared=JSON.parse(text);
declared.claims[0].evidence_state='attested';declared.claims[0].outcome='pass';
const onlyADeclaration=await host.invoke(definition.id,'recognize',{manifest_text:JSON.stringify(declared)});
assert.equal(onlyADeclaration.value.summary.declared_attested_claim_count,1);
assert.equal(onlyADeclaration.value.summary.declared_pass_claim_count,1);
assert.equal(onlyADeclaration.value.evidence_verified,false);
assert.equal(onlyADeclaration.value.authority,'none');
const retired=host.retire(definition.id);
await assert.rejects(host.invoke(definition.id,'recognize',{manifest_text:text}),{code:'MODULE_RETIRED'});
assert.equal(generated.value.recognized,true);
console.log(JSON.stringify({
  kind:'offline-real-XENIA-producer-to-AgentTool-reader',
  generated_manifest:generated.value,published_example:publishedExample.value,
  declaration_did_not_become_proof:onlyADeclaration.value,
  retired:retired.state,new_invocation_blocked:true,
  not_established:['live service conformance','claim truth','identity','consent','authority','published package equivalence'],
},null,2));
