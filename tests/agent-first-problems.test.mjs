// SPDX-License-Identifier: MPL-2.0
// The door's own errors orient: every code carries a problem in Surface's shape.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const dir=new URL('../agent-first/0.1/',import.meta.url);
const cli=fileURLToPath(new URL('cli.mjs',dir));
const {PROBLEM_CODES,REFUSAL_CODES,USAGE_CODES,buildProblem,checkArgv,COMMAND_NAMES}=await import(new URL('problems.mjs',dir).href);

function run(args,extra={}){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH},...extra});
  assert.equal(result.error,undefined);
  assert.equal(result.stderr,'','stderr stays silent');
  return {...result,value:JSON.parse(result.stdout)};
}
const ctxs=[
  {argv:['context','status','--package','/p','--dir','/d'],moduleIds:['xenia.surface'],lock:{name:'@x/y',version:'1.0.0',source:'https://example.com/s'}},
  {argv:['demo'],moduleIds:['xenia.surface']},
  {argv:[]},
];
const synthetic=(code,extra={})=>({code,operation_started:false,effect_outcome:'not_attempted',retryable:false,...extra});

test('the problem table covers every code the sources can throw',()=>{
  const found=new Set();
  const files=['cli.mjs','invoke.mjs','input-file.mjs','command-state.mjs','context.mjs','door.mjs','modules.mjs','motif-studies.mjs','provider.mjs','runtime.mjs','adapters/local-starter.mjs'];
  for(const file of files){
    const text=fs.readFileSync(new URL(file,dir),'utf8');
    for(const m of text.matchAll(/ModuleError\('([A-Z_]+)'/g))found.add(m[1]);
    for(const m of text.matchAll(/\b(?:fail|problem)\('([A-Z_]+)'/g))found.add(m[1]);
    for(const m of text.matchAll(/'((?:CLEANUP|VERIFICATION)_FAILED|CLI_FAILED)'/g))found.add(m[1]);
  }
  for(const code of ['DECLINED','OPERATION_FAILED','UNKNOWN_COMMAND','STUDY_NOT_FOUND','BUILD_REQUIRED'])found.add(code);
  const missing=[...found].filter(code=>!PROBLEM_CODES.includes(code));
  assert.deepEqual(missing,[]);
});

test('refusal codes declared by modules are all known to the door',()=>{
  const codes=new Set();
  for(const file of ['modules.mjs','adapters/local-starter.mjs']){
    for(const m of fs.readFileSync(new URL(file,dir),'utf8').matchAll(/code:'([a-z_]+)',effect:'not_applied'/g))codes.add(m[1]);
  }
  assert.ok(codes.size>=8);
  assert.deepEqual([...codes].filter(code=>!REFUSAL_CODES.includes(code)),[]);
});

test('invariant for every code and refusal: terminal => no next actions; otherwise at least one real one',()=>{
  const cases=[];
  for(const code of PROBLEM_CODES)for(const started of [false,true]){
    cases.push(synthetic(code,{operation_started:started,effect_outcome:started?'unknown':'not_attempted',module:'xenia.surface',
      mismatch:{file:'dist/core.mjs',aspect:'sha256'},valid:['a','b'],phase:'verification',returned_operations:started?['init']:[]}));
  }
  for(const code of REFUSAL_CODES)for(const prior of [false,true]){
    cases.push(synthetic('DECLINED',{operation_started:true,effect_outcome:prior?'unknown':'not_applied',refusal:{code,meaning:'m',detail:'d'},
      returned_operations:prior?['init']:[]}));
  }
  cases.push(synthetic('DECLINED',{operation_started:true,effect_outcome:'not_applied',refusal:{code:'something_new',meaning:'m'}}));
  for(const error of cases)for(const ctx of ctxs){
    const p=buildProblem(error,ctx);
    const label=`${error.code}/${error.refusal?.code??''}`;
    assert.equal(p.code,error.code,label);
    assert.equal(typeof p.detail,'string',label);assert.ok(p.detail.length>10&&p.detail.length<700,label);
    assert.equal(typeof p.terminal,'boolean',label);assert.equal(typeof p.retryable,'boolean',label);
    assert.ok(Array.isArray(p.next_actions),label);
    if(p.terminal)assert.deepEqual(p.next_actions,[],label);
    else assert.ok(p.next_actions.length>=1,label);
    for(const action of p.next_actions){
      assert.ok(Array.isArray(action.argv)&&action.argv.every(a=>typeof a==='string'),label);
      assert.equal(typeof action.why,'string',label);assert.ok(action.why.length>3,label);
      assert.deepEqual(checkArgv(action.argv,action.needs),{ok:true},`${label}: ${JSON.stringify(action)}`);
    }
  }
});

test('every suggested next action that needs no external files really runs',()=>{
  const seen=new Set();
  for(const code of PROBLEM_CODES)for(const ctx of ctxs){
    for(const action of buildProblem(synthetic(code,{module:'xenia.surface'}),ctx).next_actions){
      const key=JSON.stringify(action.argv);
      if(seen.has(key)||action.needs||['context','starter-smoke'].includes(action.argv[0]))continue;
      seen.add(key);
      const result=run(action.argv);
      assert.equal(result.status,0,`${key}: ${result.stdout}`);
    }
  }
  assert.ok(seen.size>=4);
});

test('an unknown command is said to be unknown, lists the valid commands and suggests the nearest',()=>{
  const r=run(['catalogue']);
  assert.equal(r.status,2);
  assert.equal(r.value.error.code,'UNKNOWN_COMMAND');
  assert.equal(r.value.error.operation_started,false);assert.equal(r.value.error.effect_outcome,'not_attempted');
  const p=r.value.problem;
  assert.match(p.detail,/unknown/i);
  for(const name of COMMAND_NAMES)assert.ok(p.detail.includes(name)||p.valid.includes(name),name);
  assert.ok(p.next_actions.some(a=>JSON.stringify(a.argv)==='["catalog"]'));
  assert.equal(r.stdout.includes('catalogue'),false,'the unknown word is not echoed');
  assert.ok(Array.isArray(r.value.not_established)&&r.value.not_established.length>0);
});

test('"wake" is answered plainly: this kit has no wake',()=>{
  const r=run(['wake']);
  assert.equal(r.status,2);
  const p=r.value.problem;
  assert.equal(r.value.error.code,'UNKNOWN_COMMAND');
  assert.match(p.detail,/no wake/i);
  const argvs=p.next_actions.map(a=>JSON.stringify(a.argv));
  assert.ok(argvs.includes('["arrive"]'));
  assert.ok(argvs.includes('["context","status"]'));
  const ctx=p.next_actions.find(a=>a.argv[0]==='context');
  assert.ok(ctx.needs.some(n=>n.startsWith('--package')));
  assert.equal(/wakes?\s+(you|it|a being)/i.test(p.detail),false);
});

test('module and study not-found errors list the valid ids',()=>{
  const m=run(['explain','nope.module']);
  assert.equal(m.status,2);
  assert.equal(m.value.error.code,'MODULE_NOT_FOUND');
  assert.deepEqual([...m.value.problem.valid].sort(),['agenttool.local-context','agenttool.skills-inspector','agenttool.telescope-surface','xenia.covenant','xenia.surface','xenia.work']);
  const s=run(['motifs','study','run','private-untrusted-value']);
  assert.equal(s.status,2);assert.equal(s.value.error.code,'STUDY_NOT_FOUND');
  assert.deepEqual([...s.value.problem.valid].sort(),['arrival','ending','recovery','representation']);
  assert.equal(s.stdout.includes('private-untrusted-value'),false);
  assert.ok(s.value.problem.next_actions.length>=1);
});

test('"motifs study show <motif-id>" answers with the related studies, or says none exist yet',()=>{
  const some=run(['motifs','study','show','legibility']);
  assert.equal(some.status,0);
  assert.equal(some.value.kind,'motif-studies');
  assert.equal(some.value.motif_id,'legibility');
  assert.deepEqual(some.value.studies.map(s=>s.id).sort(),['arrival','recovery','representation']);
  assert.ok(some.value.studies.every(s=>s.relation&&s.limit));
  const none=run(['motifs','study','show','standing']);
  assert.equal(none.status,0);
  assert.deepEqual(none.value.studies,[]);assert.equal(none.value.none_exist_yet,true);
  assert.ok(none.value.not_established.length>0);
  assert.equal(run(['motifs','study','show','arrival']).value.motif.id,'arrival','a study id still shows its card');
});

test('"motifs <id>" returns one card; an unknown id lists the valid ones',()=>{
  const card=run(['motifs','legibility']);
  assert.equal(card.status,0);
  assert.equal(card.value.motif.id,'legibility');
  assert.ok(card.value.not_established.length>0);
  const bad=run(['motifs','nonesuch']);
  assert.equal(bad.status,2);assert.equal(bad.value.error.code,'MOTIF_NOT_FOUND');
  assert.ok(bad.value.problem.valid.includes('legibility'));
  assert.deepEqual(bad.value.problem.next_actions[0].argv,['motifs']);
});

test('declined results name the refusal, not_applied, and a next action specific to it',()=>{
  const ctx=ctxs[0];
  const decline=(code,extra={})=>buildProblem(synthetic('DECLINED',{operation_started:true,effect_outcome:'not_applied',refusal:{code,meaning:'x'},...extra}),ctx);
  assert.deepEqual(decline('write_conflict').next_actions[0].argv,['context','status','--package','/p','--dir','/d']);
  assert.deepEqual(decline('already_exists').next_actions[0].argv,['context','status','--package','/p','--dir','/d']);
  assert.deepEqual(decline('missing_root').next_actions[0].argv,['context','init','--package','/p','--dir','/d']);
  assert.equal(decline('write_locked').retryable,true);
  assert.equal(decline('write_conflict').retryable,false);
  assert.match(decline('write_conflict').detail,/not (replaced|changed|written)|nothing/i);
  // After earlier operations returned the overall outcome is unknown, and the detail must not claim otherwise.
  const later=decline('write_conflict',{effect_outcome:'unknown',returned_operations:['init']});
  assert.match(later.detail,/unknown/i);
});

test('a missing build is BUILD_REQUIRED with the exact prepare commands and nothing started',()=>{
  const base=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-build-required-'));
  try{
    const folder=path.join(base,'agent-first','0.1');fs.mkdirSync(folder,{recursive:true});
    for(const name of fs.readdirSync(dir))if(name.endsWith('.mjs')||name.endsWith('.json'))fs.copyFileSync(new URL(name,dir),path.join(folder,name));
    for(const args of [['demo'],['motifs','study','run','ending'],['motifs','study','journey']]){
      const copy=spawnSync(process.execPath,[path.join(folder,'cli.mjs'),...args],{cwd:base,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH}});
      assert.equal(copy.stderr,'');
      const out=JSON.parse(copy.stdout);
      assert.equal(copy.status,1,args.join(' '));
      assert.equal(out.error.code,'BUILD_REQUIRED',args.join(' '));
      assert.equal(out.error.operation_started,false);assert.equal(out.error.effect_outcome,'not_attempted');
      assert.match(out.problem.detail,/npm ci --ignore-scripts/);assert.match(out.problem.detail,/npm run build/);
      assert.equal(out.problem.terminal,false);assert.ok(out.problem.next_actions.length>=1);
    }
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('PROVIDER_PIN_MISMATCH names what was expected and which file differed',()=>{
  const base=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-pin-'));
  try{
    const pkg=path.join(base,'pkg');fs.mkdirSync(path.join(pkg,'dist'),{recursive:true});
    fs.writeFileSync(path.join(pkg,'package.json'),'{}');
    const lock=JSON.parse(fs.readFileSync(new URL('agenttool.lock.json',dir),'utf8')).local_starter;
    const r=run(['context','status','--package',pkg,'--dir',path.join(base,'notes')]);
    assert.equal(r.status,1);
    assert.equal(r.value.error.code,'PROVIDER_PIN_MISMATCH');
    assert.equal(r.value.error.operation_started,false);
    const d=r.value.problem.detail;
    assert.ok(d.includes(lock.name)&&d.includes(lock.version)&&d.includes(lock.source),d);
    assert.ok(d.includes('package.json'),d);
    assert.equal(fs.existsSync(path.join(base,'notes')),false);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('-h and --help work at top level and after a subcommand; exit codes are documented',()=>{
  for(const args of [['-h'],['--help'],['help'],['bogus','--help']]){
    const r=run(args);assert.equal(r.status,0,args.join(' '));
    assert.deepEqual(Object.keys(r.value.exit_codes).sort(),['0','1','2','3','4']);
    assert.ok(r.value.commands.some(c=>c.startsWith('motifs study')));
    assert.ok(r.value.not_established.length>0);
  }
  for(const args of [['catalog','-h'],['catalog','--help'],['context','init','--help'],['help','explain'],['explain','--help']]){
    const r=run(args);assert.equal(r.status,0,args.join(' '));
    assert.equal(r.value.command,args[args[0]==='help'?1:0]);
    assert.ok(r.value.usage.includes(r.value.command));
    assert.deepEqual(Object.keys(r.value.exit_codes).sort(),['0','1','2','3','4']);
  }
  assert.equal(run(['help','bogus']).value.error.code,'UNKNOWN_COMMAND');
});

test('usage errors exit 2; refusals and operation failures exit 1',()=>{
  assert.equal(run(['catalog','extra']).status,2);
  assert.equal(run(['catalog','extra']).value.error.code,'INVALID_ARGUMENTS');
  assert.equal(run(['context','nope']).status,2);
  assert.equal(run(['motifs','study','journey','extra']).status,2);
  for(const code of USAGE_CODES)assert.ok(PROBLEM_CODES.includes(code),code);
  assert.equal(run(['context','status','--package','/definitely/not/here','--dir','/tmp/xenia-x']).status,1);
});
