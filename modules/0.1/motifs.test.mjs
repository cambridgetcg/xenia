// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const cli=new URL('./cli.mjs',import.meta.url);
const root=new URL('../../',import.meta.url);
function command(args,home){const result=spawnSync(process.execPath,[cli.pathname,'motifs',...args],{env:{PATH:'',HOME:home},encoding:'utf8',timeout:5000});return {status:result.status,value:JSON.parse(result.stdout),stderr:result.stderr};}
test('the human view is a pure rendering of the same motif contracts',async()=>{
 const renderer=new URL('./motifs.mjs',import.meta.url);assert.ok(existsSync(renderer),'The motif human-view renderer is missing');
 const {renderMotifs}=await import(renderer.href);
 const atlas=JSON.parse(await readFile(new URL('./motifs.json',import.meta.url),'utf8'));
 const before=JSON.stringify(atlas),markdown=renderMotifs(atlas);
 assert.ok(markdown.startsWith('<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->'));
 for(const card of atlas.motifs){assert.ok(markdown.includes(card.title));assert.ok(markdown.includes(card.question));assert.ok(markdown.includes(card.boundary));}
 assert.ok(markdown.includes('Illustrative example'));
 assert.ok(markdown.includes('[README.md](README.md)'));
 assert.equal(JSON.stringify(atlas),before);
 assert.equal(renderMotifs(atlas),markdown);
 assert.equal(await readFile(new URL('MOTIFS.md',root),'utf8'),markdown,'Regenerate the human view when canonical motif cards change');
});
test('one motif carries its context without loading its neighbours or interpreting its ID as a path',()=>{
 const single=command(['release'],'/nonexistent-xenia-motif-home');
 assert.equal(single.status,0,'Individual motif reading is missing');
 assert.equal(single.value.motif.id,'release');
 assert.ok(single.value.source.baseline_revision);
 assert.ok(single.value.verification_boundary);
 assert.ok(single.value.connections.every(edge=>edge.from==='release'||edge.to==='release'));
 const unknown=command(['../../.config/agenttool/agent.json'],'/nonexistent-xenia-motif-home');
 assert.equal(unknown.status,1);assert.equal(unknown.value.error.code,'unknown_motif');
 assert.ok(!JSON.stringify(unknown.value).includes('.config'));
});
test('motifs are available through the existing door as standalone source-grounded cards',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'xenia-motif-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const result=command([],path.join(folder,'absent-home'));assert.equal(result.status,0,'The motif reading path is missing');assert.equal(result.stderr,'');
 const atlas=result.value;assert.equal(atlas.status,'interpretive-design-cards');assert.equal(atlas.motifs.length,6);
 const ids=new Set(atlas.motifs.map(m=>m.id));assert.equal(ids.size,atlas.motifs.length);
 for(const motif of atlas.motifs){
  for(const field of ['title','question','purpose','standalone_use','boundary','on_change','on_exit'])assert.ok(typeof motif[field]==='string'&&motif[field].length>15,`${motif.id}/${field}`);
  for(const field of ['needs','produces','practice','sources','checks'])assert.ok(Array.isArray(motif[field])&&motif[field].length>0,`${motif.id}/${field}`);
  assert.deepEqual(motif.required_motifs,[],'Connections must not become hidden prerequisites');
  assert.equal(motif.example.kind,'illustrative');
  for(const source of [...motif.sources,...motif.checks]){assert.ok(!source.path.startsWith('/')&&!source.path.includes('..'));assert.ok((await readFile(new URL(source.path,root))).byteLength>0);}
 }
 for(const edge of atlas.connections){assert.ok(ids.has(edge.from)&&ids.has(edge.to));assert.ok(edge.meaning.length>15);}
 const reachable=new Set(['arrival']);for(let i=0;i<atlas.motifs.length;i++)for(const edge of atlas.connections)if(reachable.has(edge.from))reachable.add(edge.to);
 assert.equal(reachable.size,ids.size);
 assert.deepEqual(await readdir(folder),[],'Reading motifs must not create runtime state');
});
