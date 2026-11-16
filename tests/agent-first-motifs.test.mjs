// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const cli=fileURLToPath(new URL('../agent-first/0.1/cli.mjs',import.meta.url));

// The map's own shape is held by tests/agent-first-motif-map.test.mjs. This one runs the door.
test('the motif map reads at the door without activation, a provider or a build, and writes nothing',()=>{
  const home=fs.mkdtempSync(path.join(tmpdir(),'xenia-motif-reader-'));
  try{
    const result=spawnSync(process.execPath,[cli,'motifs'],{cwd:home,encoding:'utf8',timeout:10000,env:{PATH:'',HOME:home}});
    assert.equal(result.status,0,result.stdout+result.stderr);
    const guide=JSON.parse(result.stdout);
    assert.equal(guide.status,'informative-development-map');
    const ids=new Set(guide.motifs.map(m=>m.id));
    for(const id of ['standing','rest','arrival','legibility','choice','witness','continuity','release','repair'])assert.ok(ids.has(id),id);
    for(const motif of guide.motifs){
      assert.ok(motif.title&&motif.boundary,motif.id);
      assert.ok(motif.sources.length,motif.id);
    }
    for(const edge of guide.edges){assert.ok(ids.has(edge.from));assert.ok(ids.has(edge.to));assert.ok(edge.meaning);}
    assert.equal(guide.activation,false);
    assert.deepEqual(fs.readdirSync(home),[]);
    const pkg=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8'));
    assert.equal(pkg.scripts.xenia,'node agent-first/0.1/cli.mjs');
    assert.equal(pkg.files.includes('agent-first'),false);
    assert.equal(Object.keys(pkg.exports).some(key=>key.includes('agent-first')),false);
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
