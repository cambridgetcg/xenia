// SPDX-License-Identifier: MPL-2.0
// Operation cards: what an operation says to send (a summary, an example and,
// when it declares one, a schema), what it says comes back, and who checks
// the input. A declared schema is held by the runtime, before the host gate.
// These tests use fixture modules in this process and the three core modules;
// no provider, no network and no adapter is involved.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createModuleRuntime,ModuleError} from '../agent-first/0.1/runtime.mjs';
import {createXeniaModules} from '../agent-first/0.1/modules.mjs';
import {commandFailure,errorProjection,failureNotEstablished} from '../agent-first/0.1/command-state.mjs';
import {buildProblem,checkArgv,CARD_NOTE,INPUT_REASONS,PROBLEM_CODES} from '../agent-first/0.1/problems.mjs';
import {SCHEMA_REFUSALS} from '../agent-first/0.1/schema.mjs';

const kit=new URL('../agent-first/0.1/',import.meta.url);
const cli=fileURLToPath(new URL('cli.mjs',kit));
function run(...args){
  const r=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH}});
  assert.equal(r.error,undefined);assert.equal(r.stderr,'');
  return {status:r.status,stdout:r.stdout,value:JSON.parse(r.stdout)};
}

const schema=()=>({type:'object',additionalProperties:false,required:['title'],
  properties:{title:{type:'string',minLength:1,maxLength:20},count:{type:'integer',minimum:1,maximum:5},
    place:{type:'object',additionalProperties:false,required:['shelf'],properties:{shelf:{type:'string',enum:['top','low']}}}}});
const SUMMARY='One object: a title, an optional count from 1 to 5, and an optional place.';
const RETURNS='The thing that was sent, unchanged.';
const card=(extra={})=>({summary:SUMMARY,schema:schema(),example:{title:'First',count:2},...extra});
function definition({input=card(),returns={summary:RETURNS},effects=[],run:handler=value=>value,version='1.0.0'}={}){
  return {id:'example.card',version,contract:'example.card/1',title:'Card fixture',motif:'legibility',description:'A fixture with a card.',
    operations:{put:{description:'Keep one titled thing.',effects,run:handler,...(input===null?{}:{input}),...(returns===null?{}:{returns})}}};
}
const thrown=action=>{try{action();}catch(error){return error;}return undefined;};

test('describe shows the card: what to send, an example, the schema, what comes back, and who checks the input',()=>{
  const runtime=createModuleRuntime();
  const op=runtime.register(definition()).operations[0];
  assert.deepEqual(op.input,{summary:SUMMARY,example:{title:'First',count:2},schema:schema()});
  assert.deepEqual(op.returns,{summary:RETURNS});
  assert.equal(op.input_checked_by,'runtime');
  assert.deepEqual(Object.keys(op),['id','description','effects','refusals','input','returns','input_checked_by'],'neither the handler nor the checker is in the description');
  // What describe hands out is a copy.
  op.input.schema.properties.title.maxLength=1;op.returns.summary='changed';
  const again=runtime.describe('example.card').operations[0];
  assert.equal(again.input.schema.properties.title.maxLength,20);
  assert.equal(again.returns.summary,RETURNS);
  // Without a schema the card says the handler checks; without a card it still says so.
  const plain=createModuleRuntime().register(definition({input:{summary:'Any JSON value.'},returns:null})).operations[0];
  assert.equal(plain.input_checked_by,'handler');assert.equal(plain.returns,undefined);assert.equal(plain.input.schema,undefined);
  const bare=createModuleRuntime().register(definition({input:null,returns:null})).operations[0];
  assert.equal(bare.input_checked_by,'handler');assert.equal(bare.input,undefined);assert.equal(bare.returns,undefined);
});

test('an unknown schema keyword fails registration, and so does every other schema the checker refuses',()=>{
  const refused={
    unknown_keyword:{type:'object',additionalProperties:false,properties:{title:{type:'string',format:'uri',maxLength:200}}},
    type_missing:{type:'object',additionalProperties:false,properties:{title:{maxLength:3}}},
    type_not_supported:{type:'object',additionalProperties:false,properties:{tags:{type:'array'}}},
    object_not_closed:{type:'object',properties:{title:{type:'string'}}},
    required_not_in_properties:{type:'object',additionalProperties:false,properties:{title:{type:'string'}},required:['name']},
    keyword_outside_its_type:{type:'object',additionalProperties:false,properties:{count:{type:'integer',maxLength:3}}},
    pattern_without_max_length:{type:'object',additionalProperties:false,properties:{title:{type:'string',pattern:'^[a-z]+$'}}},
    keyword_value_not_usable:{type:'object',additionalProperties:false,properties:{title:{type:'string',minLength:9,maxLength:3}}},
    not_a_schema_object:'object',
  };
  for(const [rule,value] of Object.entries(refused)){
    const runtime=createModuleRuntime();
    const error=thrown(()=>runtime.register(definition({input:{summary:SUMMARY,schema:value}})));
    assert.ok(error instanceof ModuleError,rule);
    assert.equal(error.code,'INVALID_MODULE',rule);
    assert.equal(error.reason,'input_schema_not_usable',rule);
    assert.equal(error.schema_refusal.reason,rule);
    assert.ok(Object.hasOwn(SCHEMA_REFUSALS,error.schema_refusal.reason),rule);
    assert.equal(typeof error.schema_refusal.pointer,'string',rule);
    assert.equal(error.module,'example.card',rule);assert.equal(error.operation,'put',rule);
    assert.equal(error.operation_started,false,rule);assert.equal(error.effect_outcome,'not_attempted',rule);
    assert.throws(()=>runtime.describe('example.card'),{code:'MODULE_NOT_FOUND'},`${rule}: nothing was registered`);
  }
  assert.equal(thrown(()=>createModuleRuntime().register(definition({input:{summary:SUMMARY,schema:refused.unknown_keyword}}))).schema_refusal.pointer,'/properties/title/format');
  // A schema that is not bounded JSON data never reaches the checker.
  let read=0;
  const accessor={type:'object',additionalProperties:false};Object.defineProperty(accessor,'properties',{enumerable:true,get(){read++;return {};}});
  for(const value of [accessor,{type:'string',maxLength:()=>3},new Proxy({type:'string'},{})]){
    const error=thrown(()=>createModuleRuntime().register(definition({input:{summary:SUMMARY,schema:value}})));
    assert.equal(error.code,'INVALID_MODULE');assert.equal(error.reason,'input_schema_not_usable');
    assert.equal(error.schema_refusal,undefined);
  }
  assert.equal(read,0,'no accessor on a schema is run');
});

test('an example that does not match its own schema fails registration',()=>{
  const runtime=createModuleRuntime();
  const error=thrown(()=>runtime.register(definition({input:card({example:{title:'First',count:9}})})));
  assert.ok(error instanceof ModuleError);
  assert.equal(error.code,'INVALID_MODULE');
  assert.equal(error.reason,'input_example_does_not_match_schema');
  assert.equal(error.pointer,'/count');assert.equal(error.keyword,'maximum');assert.equal(error.expected,5);
  assert.equal(error.module,'example.card');assert.equal(error.operation,'put');
  assert.throws(()=>runtime.describe('example.card'),{code:'MODULE_NOT_FOUND'});
  // An example with no schema is not held to anything, and a schema needs no example.
  assert.equal(createModuleRuntime().register(definition({input:{summary:SUMMARY,example:{anything:[1,2]}}})).operations[0].input_checked_by,'handler');
  assert.equal(createModuleRuntime().register(definition({input:{summary:SUMMARY,schema:schema()}})).operations[0].input_checked_by,'runtime');
  // example_ref names a file the runtime never reads, so it is not checked against the schema.
  assert.equal(createModuleRuntime().register(definition({input:{summary:SUMMARY,schema:schema(),example_ref:'work/0.1/examples/declined.json'}})).operations[0].input.example_ref,'work/0.1/examples/declined.json');
});

test('input that does not match the card is INVALID_INPUT with a JSON pointer; nothing is attempted and the host gate is never asked',async()=>{
  let gate=0,ran=0;
  const runtime=createModuleRuntime({authorize:()=>{gate++;return true;}});
  runtime.register(definition({effects:['local-read','local-write'],run:value=>{ran++;return value;}}));
  runtime.activate('example.card');
  const cases=[
    [{},'','required','title'],
    [{title:''},'/title','minLength',1],
    [{title:'x'.repeat(21)},'/title','maxLength',20],
    [{title:'ok',count:6},'/count','maximum',5],
    [{title:'ok',count:0},'/count','minimum',1],
    [{title:'ok',count:'2'},'/count','type','integer'],
    [{title:'ok',place:{shelf:'middle'}},'/place/shelf','enum',['top','low']],
    [{title:'ok',place:{}},'/place','required','shelf'],
    [{title:'ok',place:['top']},'/place','type','object'],
    [{title:'ok',PLANTED_NAME_7:'PLANTED_VALUE_7'},'','additionalProperties',['title','count','place']],
    [{title:'ok',place:{shelf:'top',PLANTED_NAME_7:1}},'/place','additionalProperties',['shelf']],
    [null,'','type','object'],
    [['ok'],'','type','object'],
    ['PLANTED_VALUE_7','','type','object'],
  ];
  for(const [input,pointer,keyword,expected] of cases){
    const label=JSON.stringify(input);
    await assert.rejects(runtime.invoke('example.card','put',input),error=>{
      assert.ok(error instanceof ModuleError,label);
      assert.equal(error.code,'INVALID_INPUT',label);assert.equal(error.reason,'does_not_match_card',label);
      assert.equal(error.pointer,pointer,label);assert.equal(error.keyword,keyword,label);assert.deepEqual(error.expected,expected,label);
      assert.equal(error.operation_started,false,label);assert.equal(error.effect_outcome,'not_attempted',label);assert.equal(error.retryable,false,label);
      assert.equal(error.module,'example.card');assert.equal(error.operation,'put');
      assert.equal(error.module_version,'1.0.0');assert.equal(error.module_revision,1);
      assert.doesNotMatch(JSON.stringify(errorProjection(error))+error.message,/PLANTED/,'nothing the caller wrote is repeated');
      return true;
    });
  }
  assert.equal(gate,0,'the host gate was never asked');
  assert.equal(ran,0,'the handler never ran');
  assert.equal(runtime.describe('example.card').in_flight,0);
  // No input at all is read as null, and is held to the card like any other.
  await assert.rejects(runtime.invoke('example.card','put'),{code:'INVALID_INPUT',reason:'does_not_match_card',pointer:'',keyword:'type'});
  // An input that is not bounded JSON data is refused before the card is consulted: no reason, no pointer.
  await assert.rejects(runtime.invoke('example.card','put',{title:()=>'ok'}),error=>error.code==='INVALID_INPUT'&&error.reason===undefined&&error.pointer===undefined);
  assert.equal(gate,0);assert.equal(ran,0);
  // The same runtime then admits an input that matches: the gate is asked once and the handler runs once.
  assert.deepEqual((await runtime.invoke('example.card','put',{title:'ok',count:5,place:{shelf:'low'}})).value,{title:'ok',count:5,place:{shelf:'low'}});
  assert.equal(gate,1);assert.equal(ran,1);
});

test('the card is consulted after the state and operation checks, and before the gate',async()=>{
  const order=[];
  const runtime=createModuleRuntime({authorize:()=>{order.push('gate');return false;}});
  runtime.register(definition({effects:['local-write'],run:()=>{order.push('handler');}}));
  await assert.rejects(runtime.invoke('example.card','put',{}),{code:'MODULE_INACTIVE'},'a module that is not active says so first');
  runtime.activate('example.card');
  await assert.rejects(runtime.invoke('example.card','nope',{}),{code:'OPERATION_NOT_FOUND'});
  await assert.rejects(runtime.invoke('example.card','put',{}),{code:'INVALID_INPUT',reason:'does_not_match_card'});
  assert.deepEqual(order,[]);
  await assert.rejects(runtime.invoke('example.card','put',{title:'ok'}),{code:'POLICY_BLOCKED'});
  assert.deepEqual(order,['gate'],'a matching input is what reaches the gate');
});

test('input that matches the card reaches the gate and the handler as one deeply frozen snapshot',async()=>{
  let atGate,atHandler;
  const runtime=createModuleRuntime({authorize:request=>{atGate=request.input;return true;}});
  runtime.register(definition({effects:['local-write'],run:value=>{atHandler=value;return 'kept';}}));
  runtime.activate('example.card');
  const input={title:'Chosen',count:3,place:{shelf:'top'}};
  const pending=runtime.invoke('example.card','put',input);
  input.title='changed by the caller after the call';input.place.shelf='nowhere';input.extra=1;
  const result=await pending;
  assert.equal(result.outcome,'returned');assert.equal(result.value,'kept');
  assert.equal(atGate,atHandler,'the gate and the handler were given the same object');
  assert.notEqual(atHandler,input);
  assert.deepEqual(atHandler,{title:'Chosen',count:3,place:{shelf:'top'}});
  assert.ok(Object.isFrozen(atHandler)&&Object.isFrozen(atHandler.place));
  assert.throws(()=>{atHandler.title='edited by the handler';},TypeError);
});

test('an operation without a schema is bounded by the runtime and checked by its handler',async()=>{
  const seen=[];
  const runtime=createModuleRuntime();
  runtime.register(definition({input:{summary:'Any JSON value.'},run:value=>{seen.push(value);return value;}}));
  runtime.activate('example.card');
  for(const value of [null,'text',[1,{a:2}],{anything:{at:['all']}}])assert.deepEqual((await runtime.invoke('example.card','put',value)).value,value);
  assert.equal(seen.length,4);
  await assert.rejects(runtime.invoke('example.card','put',()=>1),error=>error.code==='INVALID_INPUT'&&error.reason===undefined);
});

test('an upgrade that changes a card is a signature change: the schema, or what the operation returns',async()=>{
  const fresh=()=>{const runtime=createModuleRuntime();runtime.register(definition());return runtime;};
  const next=(change={})=>definition({version:'1.1.0',...change});
  const tighter=schema();tighter.properties.title.maxLength=10;
  const looser=schema();delete looser.required;
  const wider=schema();wider.properties.note={type:'string',maxLength:5};
  const reordered=schema();reordered.properties.place.properties.shelf.enum.reverse();
  for(const [label,replacement] of [
    ['a tighter limit',next({input:card({schema:tighter})})],
    ['a required name dropped',next({input:card({schema:looser})})],
    ['a property added',next({input:card({schema:wider})})],
    ['a list in another order',next({input:card({schema:reordered})})],
    ['the schema removed',next({input:{summary:SUMMARY,example:{title:'First',count:2}}})],
    ['the input card removed',next({input:null})],
    ['returns reworded',next({returns:{summary:'Something else.'}})],
    ['returns removed',next({returns:null})],
  ]){
    const runtime=fresh();
    assert.throws(()=>runtime.upgrade('example.card',replacement,{expectedRevision:1}),{code:'CONTRACT_MISMATCH'},label);
    const kept=runtime.describe('example.card');
    assert.equal(kept.revision,1,label);assert.equal(kept.version,'1.0.0',label);
    assert.deepEqual(kept.operations[0].input.schema,schema(),label);
  }
  // Adding a schema, or a returns note, where there was none is a change too.
  const plain=createModuleRuntime();plain.register(definition({input:{summary:SUMMARY},returns:null}));
  assert.throws(()=>plain.upgrade('example.card',next({returns:null}),{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  assert.throws(()=>plain.upgrade('example.card',next({input:{summary:SUMMARY}}),{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  // The same schema with its keys written in another order, another example and another handler: compatible.
  const sameMeaning={required:['title'],properties:{place:{properties:{shelf:{enum:['top','low'],type:'string'}},required:['shelf'],additionalProperties:false,type:'object'},
    count:{maximum:5,minimum:1,type:'integer'},title:{maxLength:20,minLength:1,type:'string'}},additionalProperties:false,type:'object'};
  const runtime=fresh();runtime.activate('example.card');
  const upgraded=runtime.upgrade('example.card',next({input:card({schema:sameMeaning,example:{title:'Another'}}),run:()=>'new handler'}),{expectedRevision:1});
  assert.equal(upgraded.revision,2);assert.equal(upgraded.version,'1.1.0');
  assert.equal(upgraded.operations[0].input_checked_by,'runtime');
  assert.equal((await runtime.invoke('example.card','put',{title:'ok'})).value,'new handler');
  await assert.rejects(runtime.invoke('example.card','put',{title:''}),{code:'INVALID_INPUT',reason:'does_not_match_card',pointer:'/title',module_revision:2});
  // A replacement is prepared like a registration: its own schema must compile and hold its own example.
  assert.throws(()=>fresh().upgrade('example.card',next({input:card({example:{title:''}})}),{expectedRevision:1}),{code:'INVALID_MODULE',reason:'input_example_does_not_match_schema'});
});

test('the runtime keeps its own copy of the card: editing the definition afterwards changes nothing',async()=>{
  const d=definition();
  const runtime=createModuleRuntime();runtime.register(d);runtime.activate(d.id);
  d.operations.put.input.schema.properties.title.maxLength=1000;
  delete d.operations.put.input.schema.required;
  d.operations.put.input.schema.additionalProperties=true;
  d.operations.put.returns.summary='edited';
  await assert.rejects(runtime.invoke(d.id,'put',{title:'x'.repeat(21)}),{reason:'does_not_match_card',keyword:'maxLength',expected:20});
  await assert.rejects(runtime.invoke(d.id,'put',{}),{reason:'does_not_match_card',keyword:'required'});
  await assert.rejects(runtime.invoke(d.id,'put',{title:'ok',more:1}),{reason:'does_not_match_card',keyword:'additionalProperties'});
  const op=runtime.describe(d.id).operations[0];
  assert.equal(op.returns.summary,RETURNS);assert.deepEqual(op.input.schema,schema());
});

test('returns is a summary and nothing else, and no returned value is held to it',async()=>{
  for(const bad of [{},{summary:''},{summary:'x'.repeat(513)},{summary:5},{summary:'ok',schema:{type:'string'}},{summary:'ok',example:1},'text',['ok']]){
    const error=thrown(()=>createModuleRuntime().register(definition({returns:bad})));
    assert.equal(error?.code,'INVALID_MODULE',JSON.stringify(bad));
  }
  const withNull=definition();withNull.operations.put.returns=null;
  assert.throws(()=>createModuleRuntime().register(withNull),{code:'INVALID_MODULE'});
  const runtime=createModuleRuntime();
  runtime.register(definition({returns:{summary:'One JSON object.'},run:()=>'not an object at all'}));runtime.activate('example.card');
  const result=await runtime.invoke('example.card','put',{title:'ok'});
  assert.equal(result.outcome,'returned');assert.equal(result.value,'not an object at all');
});

test('each core operation carries a card: what to send, what comes back, and that its handler checks the input',()=>{
  const runtime=createModuleRuntime();
  for(const module of createXeniaModules())runtime.register(module);
  const operations=runtime.catalog().flatMap(module=>module.operations.map(op=>[`${module.id} ${op.id}`,op]));
  assert.deepEqual(operations.map(([label])=>label),['xenia.covenant draft','xenia.surface manifest','xenia.work check']);
  for(const [label,op] of operations){
    assert.ok(op.input.summary.length>20,label);
    assert.ok(op.input.example!==undefined||typeof op.input.example_ref==='string',label);
    assert.ok(op.returns.summary.length>20&&op.returns.summary.length<=512,label);
    assert.equal(op.input.schema,undefined,`${label}: the native function stays the only validator of this input`);
    assert.equal(op.input_checked_by,'handler',label);
    assert.deepEqual(op.refusals.map(refusal=>refusal.code),['invalid_input'],label);
    assert.doesNotMatch(op.returns.summary,/\b(?:conform|verified|safe|authori[sz]ed)\b/i,label);
  }
});

test('what each core card says comes back is what the operation returns for its own example',async()=>{
  const runtime=createModuleRuntime();
  for(const module of createXeniaModules())runtime.register(module);
  for(const {id} of runtime.catalog())runtime.activate(id);
  const cardOf=id=>runtime.describe(id).operations[0];
  const surface=cardOf('xenia.surface');
  const manifest=(await runtime.invoke('xenia.surface','manifest',surface.input.example)).value;
  assert.equal(manifest.schema_version,'xenia.surface.manifest/0.1');
  assert.ok(surface.returns.summary.includes(manifest.schema_version));
  const covenant=cardOf('xenia.covenant');
  const draft=(await runtime.invoke('xenia.covenant','draft',covenant.input.example)).value;
  assert.equal(draft.schema_version,'xenia.covenant.adoption/0.1');
  assert.ok(covenant.returns.summary.includes(draft.schema_version));
  assert.equal(draft.declaration.status,'draft');assert.match(covenant.returns.summary,/declaration\.status draft/);
  assert.equal(draft.release_verification.state,'unverified');assert.match(covenant.returns.summary,/unverified/);
  const outcomes=new Set();
  (function walk(value){if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='outcome')outcomes.add(item);walk(item);}})(draft);
  assert.deepEqual([...outcomes],['unknown']);assert.match(covenant.returns.summary,/every duty outcome unknown/);
  const work=cardOf('xenia.work');
  const record=JSON.parse(fs.readFileSync(new URL(`../${work.input.example_ref}`,import.meta.url),'utf8'));
  const checked=(await runtime.invoke('xenia.work','check',record)).value;
  assert.deepEqual(Object.keys(checked),['valid','schema_valid','issues','checks']);
  for(const key of Object.keys(checked))assert.ok(work.returns.summary.includes(key),key);
  const faulted=await runtime.invoke('xenia.work','check',{});
  assert.equal(faulted.outcome,'returned');assert.equal(faulted.value.valid,false);
  assert.match(work.returns.summary,/valid false/);
});

test('catalog, explain, help and arrive show the card and say, in one sentence used word for word, who checks the input',()=>{
  assert.match(CARD_NOTE,/input_checked_by/);assert.match(CARD_NOTE,/before the host gate/);assert.match(CARD_NOTE,/Nothing checks a returned value/);
  const explain=run('explain','xenia.surface');assert.equal(explain.status,0,explain.stdout);
  const op=explain.value.module.operations[0];
  assert.ok(op.input.summary&&op.input.example&&op.returns.summary);
  assert.equal(op.input_checked_by,'handler');
  assert.equal(explain.value.cards,CARD_NOTE);
  const catalog=run('catalog');assert.equal(catalog.status,0,catalog.stdout);
  assert.equal(catalog.value.cards,CARD_NOTE);
  for(const module of catalog.value.modules)for(const item of module.operations){
    assert.ok(item.returns.summary,module.id);assert.equal(item.input_checked_by,'handler',module.id);
  }
  const help=run('help').value;
  assert.equal(help.cards,CARD_NOTE);
  assert.match(run('help','explain').value.summary,/card/);
  assert.match(run('help','catalog').value.summary,/card/);
  assert.ok(run('help','invoke').value.rules.some(rule=>/does_not_match_card/.test(rule)&&/pointer/.test(rule)));
  assert.ok(fs.readFileSync(new URL('README.md',kit),'utf8').includes(CARD_NOTE));
  const arrive=run('arrive');
  assert.ok(Buffer.byteLength(arrive.stdout)<=8192,`arrive is ${Buffer.byteLength(arrive.stdout)} bytes`);
  assert.match(arrive.value.read_only_commands.find(item=>item.argv[0]==='explain').what,/card/);
});

test('the output projection of a failure carries pointer, keyword and expected, and the problem points at the card',async()=>{
  const runtime=createModuleRuntime();runtime.register(definition());runtime.activate('example.card');
  let error;
  try{await runtime.invoke('example.card','put',{title:'ok',count:9});}catch(caught){error=caught;}
  const problem=buildProblem(error,{argv:['invoke','example.card','put','--input','f'],moduleIds:['example.card']});
  assert.deepEqual(JSON.parse(JSON.stringify(errorProjection(error,problem.retryable))),{code:'INVALID_INPUT',operation_started:false,effect_outcome:'not_attempted',retryable:false,
    module:'example.card',operation:'put',module_version:'1.0.0',module_revision:1,reason:'does_not_match_card',pointer:'/count',keyword:'maximum',expected:5});
  assert.deepEqual(failureNotEstablished(error),['that a suggested next action will succeed']);
  assert.equal(problem.code,'INVALID_INPUT');assert.equal(problem.terminal,false);assert.equal(problem.retryable,false);
  assert.ok(problem.detail.includes(INPUT_REASONS.does_not_match_card));
  assert.match(problem.detail,/\/count/);assert.match(problem.detail,/maximum/);
  assert.match(problem.detail,/Nothing was run/);assert.match(problem.detail,/host gate was not asked/);
  assert.ok(problem.detail.length<700);
  assert.deepEqual(problem.next_actions.map(action=>action.argv),[['explain','example.card']]);
  assert.match(problem.next_actions[0].why,/card/);
  assert.deepEqual(checkArgv(problem.next_actions[0].argv),{ok:true});
  // A miss at the top of the input has an empty pointer; the sentence says so in words.
  let top;try{await runtime.invoke('example.card','put',[]);}catch(caught){top=caught;}
  assert.match(buildProblem(top,{moduleIds:['example.card']}).detail,/top of the input/);
  // A module the door does not list is pointed at the catalog instead.
  assert.deepEqual(buildProblem(error,{argv:['invoke'],moduleIds:['xenia.surface']}).next_actions[0].argv,['catalog']);
  // A composite command's failure keeps the same fields.
  const kept=commandFailure(error,{phase:'put',returned:[]});
  assert.equal(kept.code,'INVALID_INPUT');assert.equal(kept.reason,'does_not_match_card');
  assert.equal(kept.pointer,'/count');assert.equal(kept.keyword,'maximum');assert.equal(kept.expected,5);
  assert.equal(kept.effect_outcome,'not_attempted');
});

test('the projection reads named fields only, and says what an unknown or declined outcome leaves open',()=>{
  const unknown=Object.assign(new ModuleError('OPERATION_FAILED',true,{module:'m.x',operation:'go'}),{secret:'not copied',stack_like:'not copied'});
  const projected=errorProjection(unknown);
  assert.deepEqual(Object.keys(projected),['code','operation_started','effect_outcome','retryable','module','operation','module_version','module_revision','refusal','reason',
    'pointer','keyword','expected','schema_refusal','phase','returned_operations','verification','snapshot_cleanup']);
  assert.equal(projected.effect_outcome,'unknown');assert.equal(projected.retryable,false);
  assert.ok(failureNotEstablished(unknown).includes('whether the failed operation changed anything'));
  const declined=new ModuleError('DECLINED',true);declined.effect_outcome='not_applied';
  assert.ok(failureNotEstablished(declined).some(line=>/declaration/.test(line)&&/did not observe or verify/.test(line)));
  // The door prints exactly this projection.
  const out=run('invoke','xenia.surface','nope','--input','/nonexistent').value;
  assert.deepEqual(Object.keys(out.error),['code','operation_started','effect_outcome','retryable','module','operation','module_version','module_revision']);
  assert.deepEqual(out.not_established,['that a suggested next action will succeed']);
});

test('a module refused for its card says which part: the schema, or the example',()=>{
  assert.ok(PROBLEM_CODES.includes('INVALID_MODULE'));
  const bySchema=thrown(()=>createModuleRuntime().register(definition({input:{summary:SUMMARY,schema:{type:'array'}}})));
  const first=buildProblem(bySchema,{});
  assert.match(first.detail,/schema/);assert.match(first.detail,/Nothing was registered/);
  assert.deepEqual(JSON.parse(JSON.stringify(errorProjection(bySchema))).schema_refusal,{reason:'type_not_supported',pointer:'/type'});
  const byExample=thrown(()=>createModuleRuntime().register(definition({input:card({example:{}})})));
  const second=buildProblem(byExample,{});
  assert.match(second.detail,/example/);assert.match(second.detail,/Nothing was registered/);
  assert.notEqual(first.detail,second.detail);
  for(const problem of [first,second]){assert.equal(problem.terminal,false);assert.deepEqual(problem.next_actions[0].argv,['catalog']);}
  // Any other definition fault reads as before.
  assert.equal(buildProblem(thrown(()=>createModuleRuntime().register({id:'bad'})),{}).detail,'The module definition is not valid. Nothing was registered.');
});
