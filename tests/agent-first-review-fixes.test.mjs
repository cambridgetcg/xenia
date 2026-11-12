// SPDX-License-Identifier: MPL-2.0
// Regressions from the review of "a no that tells the truth".
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createModuleRuntime,Decline} from '../agent-first/0.1/runtime.mjs';
import {createLocalStarterModule} from '../agent-first/0.1/adapters/local-starter.mjs';
const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));
const root=fs.mkdtempSync(path.join(tmpdir(),'xenia-review-'));
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const run=(...args)=>{
  const r=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
  assert.equal(r.error,undefined);assert.equal(r.stderr,'');
  return {status:r.status,out:JSON.parse(r.stdout),raw:r.stdout};
};
const put=(name,content)=>{const file=path.join(root,name);fs.writeFileSync(file,content);return file;};
const starterError=code=>{const e=new Error(code);e.name='StarterError';e.code=code;return e;};
const adapter=throwing=>{
  const starter=Object.fromEntries(['initStarter','inspectStarter','renderStarter','writeHandoff'].map(n=>[n,()=>{throw starterError(throwing());}]));
  const module=createLocalStarterModule({starter,dir:'/explicit/notes',version:'0.1.0-dev.0'});
  const runtime=createModuleRuntime({authorize:()=>true});
  runtime.register(module);runtime.activate(module.id);
  return {runtime,id:module.id};
};

test('init: unsafe_root can come after the provider created the root, so it is never "nothing happened"',async()=>{
  const {runtime,id}=adapter(()=>'unsafe_root');
  await assert.rejects(runtime.invoke(id,'init',{}),e=>{
    assert.equal(e.code,'OPERATION_FAILED');assert.equal(e.effect_outcome,'unknown');assert.equal(e.operation_started,true);return true;});
  // failures before the provider creates anything stay declared
  const early=adapter(()=>'parent_unavailable');
  await assert.rejects(early.runtime.invoke(early.id,'init',{}),e=>e.code==='DECLINED'&&e.refusal.code==='parent_unavailable'&&e.effect_outcome==='not_applied');
  // reads cannot have created anything: still declared
  await assert.rejects(runtime.invoke(id,'status',{}),e=>e.code==='DECLINED'&&e.refusal.code==='unsafe_root');
});

test('handoff: unsafe_root does not claim nothing was touched; the file is the thing that was not replaced',async()=>{
  const {runtime,id}=adapter(()=>'unsafe_root');
  await assert.rejects(runtime.invoke(id,'handoff',{text:'t',expectedSha256:'a'.repeat(64)}),e=>{
    assert.equal(e.code,'DECLINED');
    assert.doesNotMatch(e.refusal.meaning,/Nothing was read or written/);
    assert.match(e.refusal.meaning,/not replaced/);assert.match(e.refusal.meaning,/lock|temporary/i);return true;});
});

test('a handler that declines after acting is reported only as the module declaring it, not as observed',async()=>{
  const {out}=run('invoke','xenia.surface','manifest','--input',put('bad.json','{}'));
  assert.equal(out.error.effect_outcome,'not_applied');
  assert.ok(out.not_established.some(s=>/declar/i.test(s)&&/runtime did not (observe|check|verify)/i.test(s)),JSON.stringify(out.not_established));
  const readme=fs.readFileSync(new URL('../agent-first/0.1/README.md',import.meta.url),'utf8');
  assert.match(readme,/not_applied[^.]*declaration|declaration[^.]*not_applied/i);
  const explain=run('explain','xenia.surface').out;
  assert.match(JSON.stringify(explain),/declaration/i);
});

test('a Decline whose fields throw is an unknown-effect failure, not a raw error',async()=>{
  const runtime=createModuleRuntime();
  runtime.register({id:'t.mod',version:'1.0.0',contract:'t/1',title:'T',motif:'legibility',description:'d',
    operations:{go:{description:'x',effects:[],refusals:[{code:'no',meaning:'m',effect:'not_applied'}],run:()=>{
      const d=new Decline('no','x');Object.defineProperty(d,'detail',{get(){throw new Error('boom');}});throw d;}}}});
  runtime.activate('t.mod');
  await assert.rejects(runtime.invoke('t.mod','go',null),e=>{
    assert.equal(e.code,'OPERATION_FAILED');assert.equal(e.operation_started,true);assert.equal(e.effect_outcome,'unknown');
    assert.equal(e.module,'t.mod');assert.equal(e.operation,'go');return true;});
  assert.equal(runtime.describe('t.mod').in_flight,0);
});

test('an unusable --input file says which problem it is, and help invoke states the rules',()=>{
  const cases={
    missing:[path.join(root,'absent.json'),/missing/i],
    notJson:[put('nj.json','{nope'),/one JSON value/i],
    duplicate:[put('dup.json','{"a":1,"a":2}'),/repeat/i],
    bom:[put('bom.json',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{}')])),/byte-order mark/i],
    badUtf8:[put('u8.json',Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d])),/UTF-8/],
    oversize:[put('big.json','"'+'a'.repeat(1024*1024+8)+'"'),/1 MiB|too large|over/i],
    deep:[put('deep.json','['.repeat(40)+']'.repeat(40)),/nest|limit/i],
  };
  const link=path.join(root,'link.json');fs.symlinkSync(put('real.json','{}'),link);cases.symlink=[link,/symbolic link/i];
  const seen=new Set();
  for(const [name,[file,pattern]] of Object.entries(cases)){
    const {out}=run('invoke','xenia.surface','manifest','--input',file);
    assert.equal(out.error.code,'INVALID_INPUT',name);
    assert.match(out.problem.detail,pattern,name);
    assert.doesNotMatch(out.problem.detail,/is missing, not a regular file/,name);
    seen.add(out.problem.detail);
  }
  assert.equal(seen.size,Object.keys(cases).length,'each cause reads differently');
  const help=run('help','invoke').out;
  assert.match(JSON.stringify(help),/byte-order mark/);assert.match(JSON.stringify(help),/1 MiB/);
});

test('OPERATION_NOT_FOUND names the operations that exist',()=>{
  const {out}=run('invoke','xenia.surface','nope','--input',put('y.json','{}'));
  assert.equal(out.error.code,'OPERATION_NOT_FOUND');
  assert.deepEqual(out.problem.valid,['manifest']);
  assert.match(out.problem.detail,/manifest/);
});

test('arrive and explain show how to invoke; arrive does not grant permission or assign the reader a name',()=>{
  const a=run('arrive').out;
  assert.equal(a.may_do_without_asking,undefined);
  assert.ok(Array.isArray(a.read_only_commands));
  assert.deepEqual(Object.keys(a).sort(),['here','how_to_stop','kind','not_established','purpose','read_only_commands','read_only_commands_note','reply_expected','report','schema']);
  assert.match(a.read_only_commands_note,/permit|decid/i);
  assert.ok(a.read_only_commands.some(i=>i.argv[0]==='invoke'&&i.needs));
  assert.doesNotMatch(JSON.stringify(a),/your human|"caller"|"you":/i);
  const e=run('explain','xenia.surface').out;
  assert.ok(e.next.some(n=>n.argv[0]==='invoke'&&n.argv[1]==='xenia.surface'&&n.argv[2]==='manifest'&&n.needs));
  const w=run('explain','xenia.work').out;
  assert.match(JSON.stringify(w),/relative to the repository root/);
});

test('a relative --dir is refused before anything is created',()=>{
  const {status,out}=run('context','init','--package',path.join(root,'pkg'),'--dir','notes-rel');
  assert.equal(status,1);assert.equal(out.error.code,'INVALID_CONTEXT_ROOT');
  assert.equal(out.error.effect_outcome,'not_attempted');assert.match(out.problem.detail,/absolute/);
  assert.equal(fs.existsSync(path.join(root,'notes-rel')),false);
});

test('help context shows handoff and the outside-the-package rule',()=>{
  const h=run('help','context').out;
  assert.match(JSON.stringify(h),/context handoff/);assert.match(JSON.stringify(h),/--expect/);
  assert.match(JSON.stringify(h),/outside/);
});

test('the CLI problem says it is a kit-local shape, not a Surface problem',()=>{
  const src=fs.readFileSync(new URL('../agent-first/0.1/problems.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/in Surface.s shape/);
  const readme=fs.readFileSync(new URL('../agent-first/0.1/README.md',import.meta.url),'utf8');
  assert.match(readme,/not\*{0,2} `xenia\.surface\.problem/);
});
