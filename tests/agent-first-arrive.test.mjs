// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {checkArgv} from '../agent-first/0.1/problems.mjs';
const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));
const lock=JSON.parse(fs.readFileSync(new URL('../agent-first/0.1/agenttool.lock.json',import.meta.url),'utf8')).local_starter;
function run(...args){
  const r=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH}});
  assert.equal(r.error,undefined);assert.equal(r.stderr,'');
  return {status:r.status,stdout:r.stdout,value:JSON.parse(r.stdout)};
}
const ADAPTERS=['agenttool.local-context','agenttool.skills-inspector','agenttool.telescope-surface'];

test('arrive is one bounded, inert document that expects no reply',()=>{
  const r=run('arrive');assert.equal(r.status,0,r.stdout);
  assert.ok(Buffer.byteLength(r.stdout)<=8192,`size ${Buffer.byteLength(r.stdout)}`);
  const a=r.value;
  assert.equal(a.kind,'arrival');assert.equal(a.reply_expected,false);
  assert.equal(typeof a.purpose,'string');
  assert.ok(Array.isArray(a.not_established)&&a.not_established.length>=2);
  assert.ok(a.may_do_without_asking.length>=4);
  for(const item of a.may_do_without_asking){
    assert.deepEqual(checkArgv(item.argv,item.needs),{ok:true},JSON.stringify(item));
    assert.equal(typeof item.what,'string');
  }
  assert.ok(a.may_do_without_asking.some(i=>JSON.stringify(i.argv)==='["motifs","study","list"]'));
  assert.match(JSON.stringify(a.how_to_stop),/nothing is running/i);
  assert.match(JSON.stringify(a.report),/AGENT-FEEDBACK\.md/);
  assert.match(JSON.stringify(a.report),/pull request/i);
  assert.equal(r.stdout.includes('/Users/'),false);
});

test('arrive lists adapters as available but unbound, with the Local Starter pin from the lock',()=>{
  const a=run('arrive').value;
  assert.deepEqual(a.here.adapters.map(x=>x.id).sort(),ADAPTERS);
  for(const x of a.here.adapters){
    assert.equal(x.bound,false);assert.ok(x.requires&&Object.keys(x.requires).length,x.id);
    assert.ok(Array.isArray(x.effects),x.id);
  }
  const s=a.here.adapters.find(x=>x.id==='agenttool.local-context');
  assert.equal(s.pin.name,lock.name);assert.equal(s.pin.version,lock.version);
  assert.equal(s.pin.source,lock.source);assert.equal(s.pin.archive_sha256,lock.archive_sha256);
  assert.ok(a.here.core_modules.length===3);
});

test('arrive needs no build, no provider and no arguments',()=>{
  const r=run('arrive','extra');assert.equal(r.status,2);assert.equal(r.value.error.code,'INVALID_ARGUMENTS');
  assert.deepEqual(checkArgv(['arrive']),{ok:true});
});

test('catalog and explain cover adapters from static metadata, marked unbound',()=>{
  const c=run('catalog').value;
  assert.equal(c.modules.length,3);
  assert.deepEqual(c.adapters.map(x=>x.id).sort(),ADAPTERS);
  assert.ok(c.adapters.every(x=>x.bound===false&&x.requires));
  for(const id of ADAPTERS){
    const e=run('explain',id);assert.equal(e.status,0,e.stdout);
    assert.equal(e.value.module.id,id);assert.equal(e.value.bound,false);
    assert.ok(e.value.requires);assert.ok(e.value.module.operations.length>=1);
    assert.equal(e.value.module.state,undefined,'no runtime state is claimed');
  }
  const bad=run('explain','nope');assert.equal(bad.status,2);
  for(const id of ADAPTERS)assert.ok(bad.value.problem.valid.includes(id));
});

test('static adapter metadata matches what the real factories declare',async()=>{
  const {ADAPTER_META}=await import('../agent-first/0.1/adapter-catalog.mjs');
  const {createLocalStarterModule}=await import('../agent-first/0.1/adapters/local-starter.mjs');
  const {createSkillsInspectorModule}=await import('../agent-first/0.1/adapters/skills-inspector.mjs');
  const {createTelescopeSurfaceModule}=await import('../agent-first/0.1/adapters/telescope/index.mjs');
  const starter=Object.fromEntries(['initStarter','inspectStarter','renderStarter','writeHandoff'].map(n=>[n,()=>{}]));
  const real=[
    createLocalStarterModule({starter,dir:'/x/notes',version:lock.version,source:lock.source}),
    createSkillsInspectorModule({provider:{inspectLocalSkills(){}},root:'/x/skills'}),
    createTelescopeSurfaceModule({parseXeniaSurfaceManifestEvidence(){}}),
  ];
  for(const m of real){
    const meta=ADAPTER_META.find(x=>x.id===m.id);assert.ok(meta,m.id);
    if(meta.version!==null)assert.equal(meta.version,m.version,m.id);else assert.equal(m.id,'agenttool.local-context');assert.equal(meta.contract,m.contract,m.id);
    assert.equal(meta.title,m.title,m.id);
    assert.deepEqual(meta.operations.map(o=>[o.id,o.effects]),Object.entries(m.operations).map(([k,v])=>[k,[...v.effects]]),m.id);
  }
});

test('arrive, catalog and explain load no provider or adapter code',()=>{
  const code=`
    const {main}=await import(${JSON.stringify(new URL('../agent-first/0.1/cli.mjs',import.meta.url).href)});
    await main(['arrive']);await main(['catalog']);
    for(const id of ['agenttool.local-context','agenttool.skills-inspector','agenttool.telescope-surface'])await main(['explain',id]);
    console.log('ok');
  `;
  // Loader-level check: a hooks file records every module URL that is resolved.
  const dir=fs.mkdtempSync(fs.realpathSync(tmpdir())+'/xenia-arrive-');
  try{
    fs.writeFileSync(dir+'/hooks.mjs',`import fs from 'node:fs';
      export async function resolve(s,c,n){const r=await n(s,c);fs.appendFileSync(${JSON.stringify(dir+'/seen.txt')},r.url+'\\n');return r;}`);
    fs.writeFileSync(dir+'/reg.mjs',`import {register} from 'node:module';register(${JSON.stringify(dir+'/hooks.mjs')},import.meta.url);`);
    fs.writeFileSync(dir+'/run.mjs',code);
    const r=spawnSync(process.execPath,['--import',dir+'/reg.mjs',dir+'/run.mjs'],{cwd:dir,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
    assert.equal(r.status,0,r.stderr+r.stdout);
    const seen=fs.readFileSync(dir+'/seen.txt','utf8');
    assert.equal(/adapters\/(local-starter|skills-inspector|telescope)/.test(seen),false,'no adapter code imported');
    assert.equal(/agenttool-local-starter|provider\.mjs|dist\/core/.test(seen),false,'no provider imported');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('motifs output has a short next list; bare help mentions arrive first',()=>{
  const m=run('motifs').value;
  assert.ok(Array.isArray(m.next)&&m.next.length>=1&&m.next.length<=4);
  assert.ok(m.next.some(n=>JSON.stringify(n.argv)==='["motifs","study","journey"]'));
  for(const n of m.next){assert.deepEqual(checkArgv(n.argv),{ok:true});assert.equal(typeof n.why,'string');}
  const h=run().value;
  assert.match(h.commands[0],/^arrive/);
  assert.match(JSON.stringify(h.start_here??h.notes),/arrive/);
});

test('demo prints a compact step list by default and complete bodies with --full',()=>{
  const compact=run('demo');
  if(compact.status!==0){assert.equal(compact.value.error.code,'BUILD_REQUIRED');return;}
  const d=compact.value;
  assert.equal(d.kind,'local-reference-demo-steps');
  assert.equal(d.surface,undefined);assert.ok(Buffer.byteLength(compact.stdout)<6000);
  assert.ok(d.steps.length>=6);
  assert.match(d.steps[0].call,/lifecycle|register|activate/i,'lifecycle first');
  for(const s of d.steps){
    assert.equal(typeof s.call,'string');assert.ok(['returned','refused','blocked'].includes(s.outcome),JSON.stringify(s));
    assert.ok(Array.isArray(s.effects));
  }
  const withResult=d.steps.filter(s=>s.result);
  assert.ok(withResult.length>=3);
  for(const s of withResult){assert.ok(Number.isInteger(s.result.bytes));assert.match(s.result.sha256,/^[a-f0-9]{64}$/);assert.ok(s.module_version);}
  assert.equal(d.full_output,'run: demo --full');assert.ok(d.not_established.length);
  const full=run('demo','--full');assert.equal(full.status,0);
  assert.equal(full.value.surface.profile,'xenia-surface/0.1');assert.equal(full.value.lifecycle.new_invocation_blocked,true);
  assert.deepEqual(checkArgv(['demo','--full']),{ok:true});
});
