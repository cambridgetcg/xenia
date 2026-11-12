// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createModuleRuntime} from '../agent-first/0.1/runtime.mjs';
import {checkArgv} from '../agent-first/0.1/problems.mjs';
const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(tmpdir(),'xenia-invoke-'));
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const run=(...args)=>{
  const r=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
  assert.equal(r.error,undefined);assert.equal(r.stderr,'');
  return {status:r.status,out:JSON.parse(r.stdout),raw:r.stdout};
};
const put=(name,content)=>{const file=path.join(root,name);fs.writeFileSync(file,content);return file;};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const surfaceInput={service:{name:'Local example',canonicalUrl:'https://example.com/',description:'An unserved reference example.'},resources:[{id:'about',href:'https://example.com/about'}]};
const covenantInput={hostName:'Local example',canonicalUrl:'https://example.com/',speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z'};

test('invoke walks register, activate, invoke once, retire and prints a receipt',()=>{
  const text=JSON.stringify(surfaceInput);
  const file=put('surface.json',text);
  const {status,out}=run('invoke','xenia.surface','manifest','--input',file);
  assert.equal(status,0,JSON.stringify(out));
  assert.equal(out.kind,'one-shot-invocation-receipt');
  assert.equal(out.module.id,'xenia.surface');
  assert.equal(out.module.version,'0.1.0-dev.0');
  assert.equal(out.module.revision,1);
  assert.equal(out.operation,'manifest');
  assert.deepEqual(out.effects,[]);
  assert.equal(out.input.bytes,Buffer.byteLength(text));assert.equal(out.input.sha256,sha(text));
  assert.match(out.input.decoding,/no repeated object keys/);
  assert.equal(out.outcome,'returned');
  assert.equal(out.result.profile,'xenia-surface/0.1');
  assert.deepEqual(out.lifecycle.steps,['register','activate','invoke','retire']);
  assert.equal(out.lifecycle.final_state,'retired');
  assert.ok(out.not_established.length>=3);
  assert.ok(out.not_established.some(s=>/external effect|authority|conformance/.test(s)));
  assert.equal(out.raw,undefined);
});

test('the other effect-free operations are invocable',()=>{
  const cov=run('invoke','xenia.covenant','draft','--input',put('cov.json',JSON.stringify(covenantInput)));
  assert.equal(cov.status,0,cov.raw);assert.equal(cov.out.result.declaration.status,'draft');
  const work=fs.readFileSync(new URL('../work/0.1/examples/declined.json',import.meta.url));
  const checked=run('invoke','xenia.work','check','--input',put('work.json',work));
  assert.equal(checked.status,0,checked.raw);assert.equal(checked.out.result.valid,true);
  assert.equal(checked.out.input.sha256,sha(work));
});

test('a declared refusal keeps its receipt: nothing applied, and what to do next',()=>{
  const {status,out}=run('invoke','xenia.surface','manifest','--input',put('bad.json','{}'));
  assert.equal(status,1);
  assert.equal(out.error.code,'DECLINED');
  assert.equal(out.error.effect_outcome,'not_applied');
  assert.equal(out.receipt.outcome,'declined');
  assert.equal(out.receipt.module.id,'xenia.surface');
  assert.equal(out.receipt.input.sha256,sha('{}'));
  assert.equal(out.receipt.lifecycle.final_state,'retired');
  assert.equal(out.receipt.result,undefined);
  assert.equal(out.problem.terminal,false);
  assert.deepEqual(out.problem.next_actions[0].argv,['explain','xenia.surface']);
  assert.ok(out.receipt.not_established.length>=2);
});

test('an effectful operation is refused plainly, before anything runs, with the dedicated command named',()=>{
  const file=put('x.json','{}');
  const {status,out}=run('invoke','agenttool.local-context','init','--input',file);
  assert.equal(status,1);
  assert.equal(out.error.code,'HOST_GATE_REQUIRED');
  assert.equal(out.error.operation_started,false);
  assert.equal(out.error.effect_outcome,'not_attempted');
  assert.match(out.problem.detail,/no host gate/i);
  assert.match(out.problem.detail,/context/);
  assert.equal(out.problem.terminal,false);
  assert.ok(out.problem.next_actions.some(a=>a.argv[0]==='help'&&a.argv[1]==='context'));
  assert.equal(out.receipt,undefined);
});

test('unknown module and unknown operation are typed and orient',()=>{
  const file=put('y.json','{}');
  const a=run('invoke','xenia.nope','manifest','--input',file);
  assert.equal(a.status,2);assert.equal(a.out.error.code,'MODULE_NOT_FOUND');
  assert.deepEqual(a.out.problem.next_actions[0].argv,['catalog']);
  const b=run('invoke','xenia.surface','nope','--input',file);
  assert.equal(b.status,1);assert.equal(b.out.error.code,'OPERATION_NOT_FOUND');
  assert.equal(b.out.error.effect_outcome,'not_attempted');
  assert.deepEqual(b.out.problem.next_actions[0].argv,['explain','xenia.surface']);
});

test('the input file is bounded, no-follow and strictly decoded; nothing runs when it is not usable',()=>{
  const bytes=name=>Buffer.from(name);
  const cases={
    missing:path.join(root,'absent.json'),
    notJson:put('nj.json','{nope'),
    duplicate:put('dup.json','{"a":1,"a":2}'),
    bom:put('bom.json',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),bytes('{}')])),
    badUtf8:put('u8.json',Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d])),
    oversize:put('big.json','"'+'a'.repeat(1024*1024+8)+'"'),
    trailing:put('tr.json','{} {}'),
    deep:put('deep.json','['.repeat(40)+']'.repeat(40)),
  };
  const link=path.join(root,'link.json');fs.symlinkSync(put('real.json','{}'),link);cases.symlink=link;
  cases.directory=root;
  for(const [name,file] of Object.entries(cases)){
    const {status,out}=run('invoke','xenia.surface','manifest','--input',file);
    assert.equal(status,1,name);
    assert.equal(out.error.code,'INVALID_INPUT',name);
    assert.equal(out.error.operation_started,false,name);
    assert.equal(out.error.effect_outcome,'not_attempted',name);
    assert.equal(out.receipt,undefined,name);
    assert.doesNotMatch(out.problem.detail,/written/i,name);
    assert.deepEqual(out.problem.next_actions[0].argv,['help','invoke'],name);
  }
});

test('invoke usage: missing or extra arguments point at its own usage',()=>{
  for(const args of [['invoke'],['invoke','xenia.surface','manifest'],['invoke','xenia.surface','manifest','--input'],['invoke','xenia.surface','manifest','--input','a','--input','b'],['invoke','a','b','c','--input','f']]){
    const {status,out}=run(...args);
    assert.equal(status,2,args.join(' '));
    assert.equal(out.error.code,'INVALID_ARGUMENTS');
    assert.deepEqual(out.problem.next_actions[0].argv,['help','invoke']);
  }
  const help=run('help','invoke');
  assert.equal(help.status,0);assert.match(help.out.usage,/^invoke <module-id> <operation-id> --input <file>/);
  assert.equal(run('help').out.commands.some(c=>c.startsWith('invoke ')),true);
});

test('checkArgv accepts the invoke shape and its suggested actions are runnable',()=>{
  assert.equal(checkArgv(['invoke','xenia.surface','manifest','--input','f']).ok,true);
  assert.equal(checkArgv(['invoke','xenia.surface','manifest']).ok,false);
  assert.equal(checkArgv(['invoke','xenia.surface','manifest'],['--input <file>']).ok,true);
});

test('explain and catalog carry per-operation input and the fresh-runtime marker',()=>{
  const e=run('explain','xenia.surface').out;
  const op=e.module.operations.find(o=>o.id==='manifest');
  assert.ok(op.input.summary.length>10);
  assert.equal(op.input.example.resources[0].href,'https://example.com/about');
  assert.equal(e.example.resources[0].href,'https://example.com/about');
  const w=run('explain','xenia.work').out;
  assert.equal(w.module.operations[0].input.example_ref,'work/0.1/examples/declined.json');
  const c=run('catalog').out;
  assert.match(c.runtime.scope,/this process/i);
  assert.match(c.runtime.note,/state, revision and in_flight/);
  assert.ok(c.runtime.not_established.length>=1);
  // the example for each effect-free operation actually works
  for(const id of ['xenia.surface','xenia.covenant']){
    const ex=run('explain',id).out.example;
    const r=run('invoke',id,id==='xenia.surface'?'manifest':'draft','--input',put(id+'.ex.json',JSON.stringify(ex)));
    assert.equal(r.status,0,r.raw);
  }
});

const def=(input)=>({id:'example.echo',version:'1.0.0',contract:'example.echo/1',title:'t',motif:'m',description:'d',
  operations:{echo:{description:'e',effects:[],...(input?{input}:{}),run:v=>v}}});
test('runtime: an operation may describe its input; an invalid description is refused; the summary is part of the upgrade signature',()=>{
  const runtime=createModuleRuntime();
  const d=runtime.register(def({summary:'Any JSON value.',example:{a:1}}));
  assert.deepEqual(d.operations[0].input,{summary:'Any JSON value.',example:{a:1}});
  d.operations[0].input.example.a=2;
  assert.equal(runtime.describe('example.echo').operations[0].input.example.a,1,'described input is a copy');
  assert.equal(createModuleRuntime().register(def()).operations[0].input,undefined);
  for(const bad of [{},{summary:''},{summary:'x',extra:1},{summary:'x',example:()=>1},{summary:'x'.repeat(600)},'text'])
    assert.throws(()=>createModuleRuntime().register(def(bad)),{code:'INVALID_MODULE'});
  assert.throws(()=>runtime.upgrade('example.echo',def({summary:'A different shape.',example:{a:1}}),{expectedRevision:1}),{code:'CONTRACT_MISMATCH'});
  assert.equal(runtime.upgrade('example.echo',def({summary:'Any JSON value.',example:{b:2}}),{expectedRevision:1}).revision,2,'a new example alone is compatible');
});
