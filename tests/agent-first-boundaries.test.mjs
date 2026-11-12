// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));
const loader=new URL('../agent-first/0.1/provider.mjs',import.meta.url).href;
const selected=process.env.XENIA_STARTER_TEST_PACKAGE;

function fixture(){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'xenia-boundary-')));
  const provider=path.join(root,'provider');
  const pins=JSON.parse(fs.readFileSync(new URL('../agent-first/0.1/agenttool.lock.json',import.meta.url),'utf8')).local_starter.files;
  if(selected)for(const name of Object.keys(pins)){
    const target=path.join(provider,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(selected,name),target);
  }
  return {root,provider,notes:path.join(root,'notes'),cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function run(f,args,hook){
  return spawnSync(process.execPath,[...(hook?['--import',pathToFileURL(hook).href]:[]),cli,...args],
    {encoding:'utf8',timeout:10000,cwd:f.root,env:{PATH:process.env.PATH,HOME:f.root,TMPDIR:f.root}});
}

test('a provider FIFO is refused without blocking the event loop',{skip:process.platform==='win32'},()=>{
  const root=fs.mkdtempSync(path.join(tmpdir(),'xenia-fifo-'));
  // TMPDIR must be outside the package root, which is now refused otherwise.
  const temp=fs.mkdtempSync(path.join(tmpdir(),'xenia-fifo-tmp-'));
  try{
    const made=spawnSync('mkfifo',[path.join(root,'package.json')],{encoding:'utf8'});
    assert.equal(made.status,0,made.stderr);
    const code=`import {loadReviewedStarter} from ${JSON.stringify(loader)};try{await loadReviewedStarter(process.argv[1]);process.exitCode=2;}catch(e){console.log(JSON.stringify({code:e.code}));}`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',code,root],{encoding:'utf8',timeout:2000,env:{PATH:process.env.PATH,HOME:root,TMPDIR:temp}});
    assert.equal(result.error,undefined,'a nonregular provider file must reject promptly, not time out');
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).code,'PROVIDER_PIN_MISMATCH');
    assert.deepEqual(fs.readdirSync(root),['package.json']);
  }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(temp,{recursive:true,force:true});}
});

test('context and smoke refuse notes inside provider code, including a symlinked parent',{skip:!selected},()=>{
  const f=fixture();
  try{
    const targets=[path.join(f.provider,'private-notes')];
    if(process.platform!=='win32'){
      const alias=path.join(f.root,'provider-alias');fs.symlinkSync(f.provider,alias,'dir');
      targets.push(path.join(alias,'aliased-notes'));
    }
    for(const command of [['context','init'],['starter-smoke']])for(const target of targets){
      const result=run(f,[...command,'--package',f.provider,'--dir',target]);
      assert.equal(result.error,undefined);
      assert.notEqual(result.status,0,'retained notes must not be created inside dependency code');
      const output=JSON.parse(result.stdout);
      assert.equal(output.error.code,'CONTEXT_ROOT_OVERLAP');
      assert.equal(output.error.operation_started,false);
      assert.equal(fs.existsSync(target),false);
      assert.equal(fs.readdirSync(f.root).some(name=>name.startsWith('xenia-reviewed-provider-')),false);
    }
  }finally{f.cleanup();}
});

for(const fault of ['readback','cleanup'])test(`smoke ${fault} failure does not claim its earlier writes were unattempted`,{skip:!selected},()=>{
  const f=fixture();
  try{
    const hook=path.join(f.root,'fault.mjs');
    fs.writeFileSync(hook,`import fs from 'node:fs';import path from 'node:path';import {syncBuiltinESMExports} from 'node:module';
      const read=fs.readFileSync,remove=fs.rmSync;
      fs.readFileSync=function(file,...args){if(${JSON.stringify(fault)}==='readback'&&typeof file==='string'&&path.resolve(file)===${JSON.stringify(path.join(f.notes,'handoff.md'))})throw new Error('injected private readback detail');return read.call(this,file,...args);};
      fs.rmSync=function(file,...args){if(${JSON.stringify(fault)}==='cleanup'&&String(file).includes('xenia-reviewed-provider-'))throw new Error('injected private cleanup detail');return remove.call(this,file,...args);};syncBuiltinESMExports();`);
    const result=run(f,['starter-smoke','--package',f.provider,'--dir',f.notes],hook);
    assert.equal(result.error,undefined);assert.notEqual(result.status,0);
    const output=JSON.parse(result.stdout);
    assert.match(fs.readFileSync(path.join(f.notes,'handoff.md'),'utf8'),/these notes remain/);
    assert.equal(output.error.operation_started,true,'successful earlier writes must remain visible in failure evidence');
    assert.notEqual(output.error.effect_outcome,'not_attempted');
    assert.ok(output.error.returned_operations.includes('handoff'));
    assert.equal(output.error.phase,fault==='readback'?'verification':'cleanup');
    assert.equal(output.error.retryable,false);
    assert.equal(result.stdout.includes('injected private'),false);
    assert.match(fs.readFileSync(path.join(f.notes,'handoff.md'),'utf8'),/these notes remain/);
  }finally{f.cleanup();}
});

test('context cleanup failure preserves its acknowledged operation boundary',{skip:!selected},()=>{
  const f=fixture();
  try{
    const hook=path.join(f.root,'fault.mjs');
    fs.writeFileSync(hook,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const original=fs.rmSync;fs.rmSync=function(file,...args){if(String(file).includes('xenia-reviewed-provider-'))throw new Error('injected cleanup');return original.call(this,file,...args);};syncBuiltinESMExports();`);
    const result=run(f,['context','init','--package',f.provider,'--dir',f.notes],hook);
    assert.equal(result.error,undefined);assert.notEqual(result.status,0);
    const output=JSON.parse(result.stdout);
    assert.equal(output.error.operation_started,true);
    assert.deepEqual(output.error.returned_operations,['init']);
    assert.equal(output.error.phase,'cleanup');
    assert.equal(fs.existsSync(path.join(f.notes,'manifest.json')),true);
  }finally{f.cleanup();}
});

test('a chosen handoff FIFO is refused promptly without changing notes',{skip:!selected||process.platform==='win32'},()=>{
  const f=fixture();
  try{
    assert.equal(run(f,['context','init','--package',f.provider,'--dir',f.notes]).status,0);
    const status=JSON.parse(run(f,['context','status','--package',f.provider,'--dir',f.notes]).stdout).result.value;
    const expected=status.sources.find(s=>s.id==='handoff').sha256;
    const before=fs.readFileSync(path.join(f.notes,'handoff.md'));
    const pipe=path.join(f.root,'chosen.pipe');
    assert.equal(spawnSync('mkfifo',[pipe]).status,0);
    const result=spawnSync(process.execPath,[cli,'context','handoff','--package',f.provider,'--dir',f.notes,'--input',pipe,'--expect',expected],
      {encoding:'utf8',timeout:2000,env:{PATH:process.env.PATH,HOME:f.root,TMPDIR:f.root}});
    assert.equal(result.error,undefined,'an unsupported handoff file must reject, not block waiting for a writer');
    assert.notEqual(result.status,0);
    assert.equal(JSON.parse(result.stdout).error.code,'INVALID_INPUT');
    assert.deepEqual(fs.readFileSync(path.join(f.notes,'handoff.md')),before);
  }finally{f.cleanup();}
});
