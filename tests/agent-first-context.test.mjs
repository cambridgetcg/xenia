// SPDX-License-Identifier: MPL-2.0
// Explicit opt-in exercises the reviewed real package; default runs need no provider.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));
const selected=process.env.XENIA_STARTER_TEST_PACKAGE;
function run(...args){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
  assert.equal(result.error,undefined);return result;
}
function success(...args){const r=run(...args);assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);}

test('real selected context survives consumer restart, rejects stale writes, and outlives provider removal', {skip:!selected},()=>{
  const parent=fs.mkdtempSync(path.join(tmpdir(),'xenia-context-e2e-'));
  const provider=path.join(parent,'provider'),notes=path.join(parent,'notes'),other=path.join(parent,'other-notes');
  const input=path.join(parent,'chosen.md');
  const lock=JSON.parse(fs.readFileSync(new URL('../agent-first/0.1/agenttool.lock.json',import.meta.url),'utf8')).local_starter;
  try{
    // A disposable copy of exact provider bytes lets removal be tested without
    // moving the shared downloaded distribution or touching real personal notes.
    for(const name of Object.keys(lock.files)){
      const target=path.join(provider,name);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(selected,name),target);
    }
    const args=['--package',provider,'--dir',notes];
    const initialized=success('context','init',...args);
    assert.equal(initialized.result.value.format,'agenttool-local-init/v1');
    assert.equal(initialized.retirement.state,'retired');
    const status=success('context','status',...args).result.value;
    const oldHash=status.sources.find(s=>s.id==='handoff').sha256;
    const text='# Chosen context\r\n\r\nA question may travel without becoming an obligation.\r\n';
    fs.writeFileSync(input,text);
    const written=success('context','handoff',...args,'--input',input,'--expect',oldHash).result.value;
    assert.equal(written.previous_sha256,oldHash);
    // Each CLI call above and below is a fresh process, not a reused object.
    const rendered=success('context','render',...args).result.value;
    assert.equal(rendered.sources.find(s=>s.id==='handoff').content,text);
    fs.writeFileSync(input,'this stale candidate must not replace the chosen context');
    const stale=run('context','handoff',...args,'--input',input,'--expect',oldHash);
    assert.notEqual(stale.status,0);
    const staleError=JSON.parse(stale.stdout).error;
    assert.equal(staleError.code,'DECLINED');assert.equal(staleError.refusal.code,'write_conflict');
    assert.equal(staleError.effect_outcome,'not_applied');assert.equal(staleError.operation_started,true);
    assert.equal(fs.readFileSync(path.join(notes,'handoff.md'),'utf8'),text);
    fs.writeFileSync(path.join(notes,'memories.md'),'DISABLED_FIXTURE_MUST_NOT_BE_RENDERED');
    const selectedView=success('context','render',...args);
    assert.equal(JSON.stringify(selectedView).includes('DISABLED_FIXTURE_MUST_NOT_BE_RENDERED'),false);
    assert.equal(selectedView.result.value.sources.find(s=>s.id==='memory').status,'disabled');
    success('context','init','--package',provider,'--dir',other);
    const isolated=success('context','render','--package',provider,'--dir',other);
    assert.equal(JSON.stringify(isolated).includes('A question may travel'),false);
    const existing=run('context','init',...args);
    assert.notEqual(existing.status,0);
    const existingError=JSON.parse(existing.stdout).error;
    assert.equal(existingError.refusal.code,'already_exists');assert.equal(existingError.effect_outcome,'not_applied');
    assert.equal(fs.readFileSync(path.join(notes,'handoff.md'),'utf8'),text);
    fs.renameSync(provider,path.join(parent,'removed-provider'));
    const unavailable=run('context','render',...args);
    assert.notEqual(unavailable.status,0);
    assert.equal(JSON.parse(unavailable.stdout).error.code,'PROVIDER_UNAVAILABLE');
    assert.equal(fs.readFileSync(path.join(notes,'handoff.md'),'utf8'),text);
    assert.equal(success('demo').agenttool_required,false);
    assert.equal(success('catalog').modules.length,3);
  }finally{
    // Test-only cleanup of this fresh synthetic fixture, not module retirement.
    fs.rmSync(parent,{recursive:true,force:true});
  }
});
