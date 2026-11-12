// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const cli=new URL('../agent-first/0.1/cli.mjs',import.meta.url);
function run(...args){
  assert.ok(existsSync(cli),'one agent-first CLI entry must exist');
  const result=spawnSync(process.execPath,[fileURLToPath(cli),...args],{cwd:tmpdir(),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH}});
  assert.equal(result.error,undefined);return result;
}

test('the CLI exposes an inert catalog, usable examples and the real local lifecycle',()=>{
  const listed=run('catalog');assert.equal(listed.status,0,listed.stderr+listed.stdout);
  const catalog=JSON.parse(listed.stdout);
  assert.equal(catalog.modules.length,3);assert.ok(catalog.modules.every(m=>m.state==='registered'));
  const explained=run('explain','xenia.surface');assert.equal(explained.status,0,explained.stdout);
  assert.equal(JSON.parse(explained.stdout).example.resources[0].href,'https://example.com/about');
  const demonstrated=run('demo','--full');assert.equal(demonstrated.status,0,demonstrated.stderr+demonstrated.stdout);
  const demo=JSON.parse(demonstrated.stdout);
  assert.equal(demo.surface.profile,'xenia-surface/0.1');
  assert.equal(demo.covenant.declaration.status,'draft');
  assert.equal(demo.work.valid,true);
  assert.equal(demo.lifecycle.retired.state,'retired');
  assert.equal(demo.lifecycle.new_invocation_blocked,true);
  assert.equal(demo.agenttool_required,false);
});

test('an unreviewed provider package is refused before any provider code is imported',async()=>{
  const file=new URL('../agent-first/0.1/provider.mjs',import.meta.url);
  assert.ok(existsSync(file),'the optional provider boundary must exist');
  const {loadReviewedStarter}=await import(file.href);
  const root=mkdtempSync(path.join(tmpdir(),'xenia-provider-test-'));
  const marker=path.join(root,'executed');
  try{
    mkdirSync(path.join(root,'dist'));
    writeFileSync(path.join(root,'package.json'),'{}');
    writeFileSync(path.join(root,'dist/core.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'not allowed');`);
    await assert.rejects(loadReviewedStarter(root),{code:'PROVIDER_PIN_MISMATCH'});
    assert.equal(existsSync(marker),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
