// SPDX-License-Identifier: MPL-2.0
// The Standing motif, made executable: reading what a door offers is a floor.
// It holds in every module state and after every refusal, never asks the host
// gate, and takes no caller identity.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createModuleRuntime,Decline,ModuleError} from '../agent-first/0.1/runtime.mjs';
import {createXeniaModules} from '../agent-first/0.1/modules.mjs';
import {createLocalStarterModule} from '../agent-first/0.1/adapters/local-starter.mjs';

const kit=new URL('../agent-first/0.1/',import.meta.url);
const kitDir=fileURLToPath(kit);
const motifs=JSON.parse(fs.readFileSync(new URL('motifs.json',kit),'utf8'));

const fixture=(version='1.0.0',extra={})=>({id:'floor.fixture',version,contract:'floor.fixture/1',title:'Floor fixture',motif:'standing',description:'A fixture.',
  operations:{
    read:{description:'Read.',effects:[],run:input=>({input})},
    write:{description:'Write.',effects:['local-write'],run:()=>({wrote:true})},
    fail:{description:'Fails undeclared.',effects:[],run:()=>{throw new Error('boom');}},
    refuse:{description:'Declines.',effects:[],refusals:[{code:'nope',meaning:'Declined.',effect:'not_applied'}],run:()=>{throw new Decline('nope','why');}},
    ...extra}});

function watched(){
  const calls=[];
  const runtime=createModuleRuntime({authorize:request=>{calls.push(request);return false;}});
  return {runtime,calls};
}
function assertFloor(runtime,calls,id){
  const before=calls.length;
  const described=runtime.describe(id);
  const listed=runtime.catalog();
  assert.equal(described.id,id);
  assert.ok(listed.some(entry=>entry.id===id));
  assert.ok(described.operations.length>0,'operations stay describable');
  assert.equal(calls.length,before,'reading never calls the host gate');
}

test('describe and catalog take no caller identity and no gate',()=>{
  const {runtime}=watched();
  assert.equal(runtime.describe.length,1,'describe takes only the module id');
  assert.equal(runtime.catalog.length,0,'catalog takes nothing');
  runtime.register(fixture());
  const text=JSON.stringify(runtime.describe('floor.fixture'));
  for(const word of ['caller','identity','principal','agent_id'])assert.equal(text.includes(word),false,word);
});

test('the floor holds in every module state',async()=>{
  for(const state of ['registered','active','paused','retired']){
    const {runtime,calls}=watched();
    runtime.register(fixture());
    if(state!=='registered')runtime.activate('floor.fixture');
    if(state==='paused')runtime.pause('floor.fixture');
    if(state==='retired')runtime.retire('floor.fixture');
    assert.equal(runtime.describe('floor.fixture').state,state);
    assertFloor(runtime,calls,'floor.fixture');
  }
});

test('the floor holds while a call is in flight and while retiring',async()=>{
  const {runtime,calls}=watched();
  let release;const gate=new Promise(resolve=>{release=resolve;});
  runtime.register(fixture('1.0.0',{slow:{description:'Waits.',effects:[],run:()=>gate}}));
  runtime.activate('floor.fixture');
  const pending=runtime.invoke('floor.fixture','slow',null);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(runtime.describe('floor.fixture').in_flight,1);
  assertFloor(runtime,calls,'floor.fixture');
  runtime.retire('floor.fixture');
  assert.equal(runtime.describe('floor.fixture').state,'retiring');
  assertFloor(runtime,calls,'floor.fixture');
  release();await pending;
  assert.equal(runtime.describe('floor.fixture').state,'retired');
  assertFloor(runtime,calls,'floor.fixture');
});

test('the floor holds after every refusal and error code the runtime can emit',async()=>{
  // The list of codes comes from the source, so a new code without a case here fails.
  const source=fs.readFileSync(new URL('runtime.mjs',kit),'utf8');
  const emitted=new Set([...source.matchAll(/(?:ModuleError|fail)\('([A-Z_]+)'/g)].map(match=>match[1]));
  const seen=new Set();
  const {runtime,calls}=watched();
  const observe=async(code,action)=>{
    let error;
    try{await action();}catch(thrown){error=thrown;}
    assert.ok(error instanceof ModuleError,`${code} must be thrown as a ModuleError`);
    assert.equal(error.code,code);
    seen.add(error.code);
    assertFloor(runtime,calls,'floor.fixture');
  };
  runtime.register(fixture());
  await observe('MODULE_EXISTS',()=>runtime.register(fixture()));
  await observe('INVALID_MODULE',()=>runtime.register({id:'bad'}));
  await observe('MODULE_NOT_FOUND',()=>runtime.describe('nobody.here'));
  await observe('MODULE_INACTIVE',()=>runtime.invoke('floor.fixture','read',null));
  runtime.activate('floor.fixture');
  await observe('OPERATION_NOT_FOUND',()=>runtime.invoke('floor.fixture','missing',null));
  await observe('INVALID_INPUT',()=>runtime.invoke('floor.fixture','read',()=>1));
  await observe('POLICY_BLOCKED',()=>runtime.invoke('floor.fixture','write',null));
  await observe('OPERATION_FAILED',()=>runtime.invoke('floor.fixture','fail',null));
  await observe('DECLINED',()=>runtime.invoke('floor.fixture','refuse',null));
  await observe('STALE_REVISION',()=>runtime.upgrade('floor.fixture',fixture('1.1.0'),{expectedRevision:99}));
  await observe('CONTRACT_MISMATCH',()=>runtime.upgrade('floor.fixture',{...fixture('1.1.0'),contract:'other/1'},{expectedRevision:1}));
  // MODULE_BUSY: replacement while a call is in flight.
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const other=createModuleRuntime({authorize:()=>false});
  other.register(fixture('1.0.0',{slow:{description:'Waits.',effects:[],run:()=>gate}}));other.activate('floor.fixture');
  const pending=other.invoke('floor.fixture','slow',null);
  await new Promise(resolve=>setImmediate(resolve));
  assert.throws(()=>other.upgrade('floor.fixture',fixture('1.1.0',{slow:{description:'Waits.',effects:[],run:()=>gate}}),{expectedRevision:1}),{code:'MODULE_BUSY'});
  seen.add('MODULE_BUSY');release();await pending;
  // ADMISSION_CHANGED: the module is paused while the host gate decides.
  const racing=createModuleRuntime({authorize:async()=>{racing.pause('floor.fixture');return true;}});
  racing.register(fixture());racing.activate('floor.fixture');
  await assert.rejects(racing.invoke('floor.fixture','write',null),{code:'ADMISSION_CHANGED'});
  seen.add('ADMISSION_CHANGED');
  runtime.retire('floor.fixture');
  await observe('MODULE_RETIRED',()=>runtime.invoke('floor.fixture','read',null));
  assert.deepEqual([...emitted].filter(code=>!seen.has(code)).sort(),[],'every code the runtime can emit was exercised');
});

const cliCommands=[['arrive'],['help'],['help','invoke'],['motifs'],['motifs','standing'],['catalog'],['explain','xenia.surface'],['explain','agenttool.local-context'],
  ['help','feedback'],['feedback','new']];

test('at the door, reading commands succeed with no provider, no build and no identity',()=>{
  // A copy of the kit alone: no dist/, no node_modules, no provider package.
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'xenia-floor-')));
  try{
    const bare=path.join(home,'agent-first','0.1');
    fs.cpSync(kitDir,bare,{recursive:true});
    for(const argv of cliCommands){
      const result=spawnSync(process.execPath,[path.join(bare,'cli.mjs'),...argv],
        {cwd:home,encoding:'utf8',timeout:15000,env:{PATH:'',HOME:home,TMPDIR:home}});
      assert.equal(result.status,0,`${argv.join(' ')}: ${result.stdout}${result.stderr}`);
      assert.equal(result.stderr,'');
      const body=JSON.parse(result.stdout);
      assert.equal(body.error,undefined,argv.join(' '));
    }
    assert.deepEqual(fs.readdirSync(home).sort(),['agent-first'],'reading created nothing');
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('the same reads succeed after the door has refused something',()=>{
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'xenia-floor-refused-')));
  try{
    const run=argv=>spawnSync(process.execPath,[path.join(kitDir,'cli.mjs'),...argv],
      {cwd:home,encoding:'utf8',timeout:15000,env:{PATH:'',HOME:home,TMPDIR:home}});
    for(const refused of [['nonsense'],['explain','nobody.here'],['context','status','--package',home,'--dir',home],['invoke','xenia.surface','manifest','--input',path.join(home,'missing.json')]]){
      assert.notEqual(run(refused).status,0,refused.join(' '));
      for(const argv of cliCommands)assert.equal(run(argv).status,0,`${argv.join(' ')} after ${refused.join(' ')}`);
    }
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});

test('the Standing motif points at this floor, with the covenant draft as secondary',()=>{
  const standing=motifs.motifs.find(motif=>motif.id==='standing');
  assert.equal(standing.implementation[0],'agent-first/0.1/runtime.mjs');
  assert.equal(standing.checks[0],'tests/agent-first-floor.test.mjs');
  assert.ok(standing.implementation.includes('agent-first/0.1/modules.mjs'),'the covenant-draft pointer stays, as secondary');
  assert.ok(standing.checks.includes('tests/agent-first-modules.test.mjs'));
  assert.match(standing.practice,/describe|catalog|read/i);
});

test('every motif pointer resolves to a real file or heading',()=>{
  const root=new URL('../',import.meta.url);
  for(const motif of motifs.motifs){
    for(const pointer of [...motif.implementation,...motif.checks,...motif.sources]){
      const [file]=pointer.split('#');
      assert.ok(fs.existsSync(new URL(file,root)),`${motif.id}: ${pointer}`);
    }
  }
});

test('Bounded work points at the mechanism that separates gate, attempt and outcome',()=>{
  const bounded=motifs.motifs.find(motif=>motif.id==='bounded-work');
  assert.ok(bounded.implementation.includes('agent-first/0.1/runtime.mjs'));
  assert.ok(bounded.implementation.includes('agent-first/0.1/command-state.mjs'));
  assert.ok(bounded.implementation.includes('work/0.1/check.mjs'),'the Work record checker stays');
  assert.match(bounded.limit,/deadline|cancel/i,'the limit says there is no deadline or cancellation');
});

test('Continuity names the provider as the owner of freshness and budgets',()=>{
  const continuity=motifs.motifs.find(motif=>motif.id==='continuity');
  assert.match(continuity.practice,/provider/i);
  assert.match(continuity.limit,/provider/i);
});

test('Exit does not promise a return the runtime does not provide',()=>{
  const exit=motifs.motifs.find(motif=>motif.id==='exit');
  assert.equal(exit.name.includes('room to return'),false);
  assert.match(exit.limit,/cannot be (?:re)?activated|never come back|new (?:process|runtime)/i);
});

test('every registered module and every adapter names a motif that exists in the map',async()=>{
  const ids=new Set(motifs.motifs.map(motif=>motif.id));
  const runtime=createModuleRuntime();
  for(const module of createXeniaModules())runtime.register(module);
  const starter=Object.fromEntries(['initStarter','inspectStarter','renderStarter','writeHandoff'].map(name=>[name,()=>({})]));
  runtime.register(createLocalStarterModule({starter,dir:'/explicit/notes',version:'0.1.0-dev.0'}));
  for(const entry of runtime.catalog())assert.ok(ids.has(entry.motif),`${entry.id} uses motif ${entry.motif}`);
  // Adapters that are not registered by the door still say which motif they serve.
  const adapterSources=['adapters/skills-inspector.mjs','adapters/telescope/index.mjs'];
  for(const file of adapterSources){
    const found=[...fs.readFileSync(new URL(file,kit),'utf8').matchAll(/\bmotif:\s*'([^']+)'/g)].map(match=>match[1]);
    assert.ok(found.length>0,file);
    for(const motif of found)assert.ok(ids.has(motif),`${file} uses motif ${motif}`);
  }
});

test('the catalog at the door shows motif ids that are in the map',()=>{
  const ids=new Set(motifs.motifs.map(motif=>motif.id));
  const result=spawnSync(process.execPath,[path.join(kitDir,'cli.mjs'),'catalog'],{encoding:'utf8',timeout:15000,env:{PATH:''}});
  assert.equal(result.status,0,result.stderr);
  for(const module of JSON.parse(result.stdout).modules)assert.ok(ids.has(module.motif),module.id);
});
