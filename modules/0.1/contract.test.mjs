// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
const card=JSON.parse(await readFile(new URL('./adapters/agenttool-collab/module.json',import.meta.url),'utf8'));
test('the inspectable module card supplies a closed input schema for every operation',()=>{
 assert.ok(card.input_schemas,'Module operations need discoverable input schemas');
 assert.deepEqual(Object.keys(card.input_schemas).sort(),[...card.descriptor.operations].sort());
 const ajv=new Ajv2020({strict:true});
 for(const [name,schema] of Object.entries(card.input_schemas)) {
   assert.equal(schema.type,'object',name);assert.equal(schema.additionalProperties,false,name);
   const check=ajv.compile(schema);assert.equal(check({undeclared:'field'}),false,name);
 }
 assert.equal(ajv.compile(card.input_schemas.createTask)({idempotency_key:'fixture',title:'Bounded task'}),true);
 assert.equal(ajv.compile(card.input_schemas.report)({idempotency_key:'fixture',kind:'decision',body:'This must not be silently authorized'}),false);
 assert.equal(ajv.compile(card.input_schemas.next)({event_limit:51}),false);
});
