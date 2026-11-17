// SPDX-License-Identifier: MPL-2.0
// The map's own shape is held by tests/agent-first-motif-map.test.mjs. This one runs the door: the index `motifs`
// prints, one entry for `motifs <id>`, an earlier name or a study id, and the help and arrive lines about them.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {checkArgv,usageHelp,NETWORK_NOTE} from '../agent-first/0.1/problems.mjs';
import {READ_ONLY} from '../agent-first/0.1/arrive.mjs';
const root=new URL('../',import.meta.url);
const kit=new URL('../agent-first/0.1/',import.meta.url);
const cli=fileURLToPath(new URL('cli.mjs',kit));
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const map=JSON.parse(read('agent-first/0.1/motifs.json'));
const ids=map.motifs.map(entry=>entry.id);
const LIMIT=8192;
const {MOTIF_OUTPUT_LIMIT_BYTES}=await import(new URL('../agent-first/0.1/motif-map.mjs',import.meta.url).href);
assert.equal(MOTIF_OUTPUT_LIMIT_BYTES,LIMIT);
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// A fresh process with PATH empty and a HOME that is not there, run from an empty directory.
function door(args,file=cli){
  const home=fs.mkdtempSync(path.join(tmpdir(),'xenia-motif-door-'));
  try{
    const result=spawnSync(process.execPath,[file,...args],{cwd:home,encoding:'utf8',timeout:15000,env:{PATH:'',HOME:path.join(home,'absent')}});
    assert.equal(result.error,undefined);
    assert.equal(result.stderr,'',`${args.join(' ')}: stderr stays silent`);
    assert.deepEqual(fs.readdirSync(home),[],`${args.join(' ')} wrote nothing`);
    return {status:result.status,stdout:result.stdout,bytes:Buffer.byteLength(result.stdout),value:JSON.parse(result.stdout)};
  }finally{fs.rmSync(home,{recursive:true,force:true});}
}
const helpers=()=>import(new URL('motif-map.mjs',kit).href);

test('motifs prints an index of the map under 8192 bytes, without activation, a provider or a build',async()=>{
  const {pathLine}=await helpers();
  const r=door(['motifs']);
  assert.equal(r.status,0,r.stdout);
  assert.ok(r.bytes<=LIMIT,`motifs is ${r.bytes} bytes`);
  const index=r.value;
  assert.equal(index.schema,'xenia.agent-first/0.1-development');
  assert.equal(index.kind,'motif-index');
  assert.equal(index.status,map.status);
  assert.match(index.use,/^Optional; no command needs this map\b/);
  assert.ok(index.use.includes('agent-first/0.1/motifs.json'),'the index says where the whole map is');
  assert.equal(index.reading,map.reading);
  assert.match(index.reading,/Practice describes what the pieces are built to do; it is not an instruction\./);
  // What boundary, limit and not_covered mean, as the map glosses them.
  assert.deepEqual(index.fields,map.fields);
  // That a then edge is a reading order is said by the path line and the then kind, and not a third time.
  assert.equal(r.stdout.split('nothing enforces').length-1,2);
  assert.equal(index.path,pathLine(map));
  // Each entry, in the file's order, with its id, place, title and question; the crossing has no question.
  assert.deepEqual(index.entries,map.motifs.map(({id,place,title,question})=>({id,place,title,...(question===undefined?{}:{question})})));
  assert.deepEqual(index.edges,map.edges);
  assert.deepEqual(index.edge_kinds,map.edge_kinds.map(({id,meaning})=>({id,meaning})));
  assert.deepEqual(index.studies,map.studies);
  assert.deepEqual(index.without_study,map.without_study);
  // The earlier ids of the kit map that are not ids now, written out with where each went.
  // Each with its status, so that a split is not read as a rename.
  assert.deepEqual(index.renamed,[{name:'bounded-work',status:'split',now:['witness','choice']},{name:'change',status:'renamed',now:['continuity/replaced']},{name:'exit',status:'renamed',now:['release']}]);
  const fromMap=map.reconciliation.name_rows.filter(row=>row.vocabulary==='kit-map'&&!ids.includes(row.name)).map(({name,status,now})=>({name,status,now}));
  assert.deepEqual(index.renamed,fromMap);
  assert.deepEqual(index.self_sufficiency,{motifs_and_catalog:map.self_sufficiency.motifs_and_catalog,network:NETWORK_NOTE});
  assert.deepEqual(index.not_established,map.not_established);
  assert.ok(Array.isArray(index.next)&&index.next.length>=1&&index.next.length<=4);
  for(const item of index.next){assert.deepEqual(checkArgv(item.argv,item.needs),{ok:true},JSON.stringify(item));assert.equal(typeof item.why,'string');}
  // The page rendered from the whole map, by its path in the checkout; tests/agent-first-motif-page.test.mjs holds it.
  assert.equal(index.page,'agent-first/0.1/MOTIFS.md');
  assert.deepEqual(Object.keys(index),['schema','kind','status','use','reading','fields','path','page','entries','edges','edge_kinds','studies','without_study','renamed','self_sufficiency','next','not_established']);
});

test('the path line is built from the map: ground, the then edges in order, the back edges, the optional return and the crossing',async()=>{
  const {pathLine}=await helpers();
  assert.equal(pathLine(map),'Ground: standing, rest. Cards, in a reading order that nothing enforces: arrival → legibility → choice → witness → continuity → release. Back: witness → choice, continuity → choice. Optional return: release → arrival. Crossing: repair.');
  // It reads the data, not a copy of it: a map without back edges gives a line without them.
  const changed=structuredClone(map);
  changed.edges=changed.edges.filter(edge=>edge.kind!=='back');
  assert.doesNotMatch(pathLine(changed),/Back:/);
});

// The card of continuity is the largest. The diagnostic below says how much room the fullest card has left under the
// bound, so that the next edit can see it; a card is made smaller by shortening its entry's own text, not by dropping
// the caller line or the commands note.
test('motifs <id> prints each entry as the file has it, with what touches it, under 8192 bytes in a fresh process',t=>{
  let least={id:null,room:Infinity};
  for(const entry of map.motifs){
    const r=door(['motifs',entry.id]);
    assert.equal(r.status,0,`${entry.id}: ${r.stdout}`);
    assert.ok(r.bytes<=LIMIT,`motifs ${entry.id} is ${r.bytes} bytes`);
    if(LIMIT-r.bytes<least.room)least={id:entry.id,room:LIMIT-r.bytes};
    const card=r.value;
    assert.deepEqual(Object.keys(card),['schema','kind','motif','edges','commands','commands_note','modules','studies','not_established'],entry.id);
    // A card can be read without the index: it says that it says nothing about the caller.
    assert.ok(card.not_established.includes('anything about a caller\'s identity, authority, safety or inner state'),entry.id);
    assert.equal(card.kind,'motif-card');
    assert.deepEqual(card.motif,entry,'the entry exactly as in the file');
    assert.deepEqual(card.edges,map.edges.filter(edge=>edge.from===entry.id||edge.to===entry.id),entry.id);
    assert.deepEqual(card.commands,map.commands.filter(row=>row.motifs.includes(entry.id)).map(({argv,does})=>({argv,does})),entry.id);
    assert.deepEqual(card.modules,map.modules.filter(row=>row.motif===entry.id||row.also?.includes(entry.id)),entry.id);
    assert.deepEqual(card.studies,map.studies.filter(row=>row.motif===entry.id),entry.id);
    assert.equal(card.commands_note,'`does` is what a command does here, not what it establishes; `help <command>` gives its usage.');
    assert.ok(card.not_established.length>=3&&card.not_established.every(item=>map.not_established.includes(item)),entry.id);
    for(const item of ['that any duty is met','that an entry describes a running service','that a passing check establishes a motif'])assert.ok(card.not_established.includes(item),`${entry.id}: ${item}`);
  }
  // Ground and the crossing have no edges; release has two, and leaves only by the optional return.
  assert.deepEqual(door(['motifs','rest']).value.edges,[]);
  assert.deepEqual(door(['motifs','repair']).value.edges,[]);
  assert.deepEqual(door(['motifs','release']).value.edges.filter(edge=>edge.from==='release').map(edge=>edge.kind),['optional-return']);
  t.diagnostic(`least room under ${LIMIT} bytes: motifs ${least.id}, ${least.room} bytes`);
});

test('an earlier name is MOTIF_NOT_FOUND, exit 2, with now_at and a next argv for each id it went to, and is not repeated',()=>{
  const studyIds=map.studies.map(row=>row.study);
  const earlier=map.reconciliation.name_rows.filter(row=>!ids.includes(row.name)&&!studyIds.includes(row.name));
  assert.deepEqual(earlier.map(row=>row.name).sort(),['Change without silent replacement','Chosen action','Continuity without capture','Exit without erasure','Legibility','bounded-work','change','exit']);
  for(const row of earlier){
    const r=door(['motifs',row.name]);
    assert.equal(r.status,2,`${row.name}: ${r.stdout}`);
    assert.ok(r.bytes<=LIMIT);
    assert.equal(r.value.error.code,'MOTIF_NOT_FOUND');
    const problem=r.value.problem;
    assert.deepEqual(problem.now_at,row.now,row.name);
    assert.deepEqual(problem.valid,ids);
    const went=[...new Set(row.now.map(now=>now.split('/')[0]))];
    assert.deepEqual(problem.next_actions.map(action=>action.argv),[...went.map(id=>['motifs',id]),['motifs']],row.name);
    for(const action of problem.next_actions){
      assert.deepEqual(checkArgv(action.argv),{ok:true});
      assert.equal(door(action.argv).status,0,action.argv.join(' '));
    }
    assert.equal(new RegExp(`(^|[^A-Za-z-])${escape(row.name)}([^A-Za-z-]|$)`).test(r.stdout),false,`${row.name} is not repeated`);
  }
});

test('a face named as entry/face is MOTIF_NOT_FOUND with that entry as its first next action, and is not repeated',()=>{
  const faces=map.motifs.flatMap(entry=>Object.keys(entry.faces??{}).map(face=>[entry.id,face]));
  assert.deepEqual(faces,[['continuity','carried'],['continuity','replaced']]);
  for(const [id,face] of faces){
    const r=door(['motifs',`${id}/${face}`]);
    assert.equal(r.status,2,r.stdout);assert.equal(r.value.error.code,'MOTIF_NOT_FOUND');
    assert.equal(r.value.problem.now_at,undefined,'a face is not an earlier name');
    assert.match(r.value.problem.detail,/a face of an entry/);
    assert.deepEqual(r.value.problem.next_actions.map(action=>action.argv),[['motifs',id],['motifs']]);
    assert.equal(r.stdout.includes(`${id}/${face}`),false,'the word given is not repeated');
  }
  // A face that is not there, a head that is not an entry, or a longer path is an id the map does not have.
  for(const word of ['continuity/nonesuch','nonesuch/carried','continuity/carried/carried','standing/carried']){
    const r=door(['motifs',word]);
    assert.equal(r.status,2);assert.deepEqual(r.value.problem.next_actions.map(action=>action.argv),[['motifs']],word);
  }
  // Every value the index gives as where an earlier id went can be followed to an entry.
  for(const row of door(['motifs']).value.renamed)for(const now of row.now){
    const r=door(['motifs',now]);
    assert.ok(r.status===0||r.value.problem.next_actions[0].argv[1]===now.split('/')[0],now);
  }
});

test('motifs study show <earlier name> is STUDY_NOT_FOUND with now_at and a next action for each entry it went to',()=>{
  for(const [name,went] of [['exit',['release']],['bounded-work',['witness','choice']],['change',['continuity']],['Chosen action',['choice']]]){
    const r=door(['motifs','study','show',name]);
    assert.equal(r.status,2,r.stdout);assert.equal(r.value.error.code,'STUDY_NOT_FOUND');
    assert.deepEqual(r.value.problem.now_at,map.reconciliation.name_rows.find(row=>row.name===name).now,name);
    assert.deepEqual(r.value.problem.next_actions.map(action=>action.argv),[...went.map(id=>['motifs','study','show',id]),['motifs','study']],name);
    for(const action of r.value.problem.next_actions)assert.equal(door(action.argv).status,0,action.argv.join(' '));
    assert.equal(new RegExp(`(^|[^A-Za-z-])${escape(name)}([^A-Za-z-]|$)`).test(r.stdout),false,`${name} is not repeated`);
  }
  const plain=door(['motifs','study','show','nonesuch']);
  assert.equal(plain.status,2);assert.equal(plain.value.problem.now_at,undefined);
  assert.deepEqual(plain.value.problem.next_actions.map(action=>action.argv),[['motifs','study']]);
  // An id in both lists shows the study, and the detail and the study help say so.
  assert.equal(door(['motifs','study','show','arrival']).value.kind,'study-card');
  assert.match(plain.value.problem.detail,/An id in both lists shows the study/);
  assert.match(door(['motifs','study','help']).value.meaning,/An id in both lists shows the study/);
});

test('a study id is MOTIF_NOT_FOUND with the command that shows the study, and other text is not repeated',()=>{
  for(const id of map.studies.map(row=>row.study).filter(id=>!ids.includes(id))){
    const r=door(['motifs',id]);
    assert.equal(r.status,2,`${id}: ${r.stdout}`);
    assert.equal(r.value.error.code,'MOTIF_NOT_FOUND');
    assert.equal(r.value.problem.now_at,undefined,'a study id is another list, not an earlier name');
    assert.deepEqual(r.value.problem.next_actions[0].argv,['motifs','study','show',id]);
    const shown=door(r.value.problem.next_actions[0].argv);
    assert.equal(shown.status,0);assert.equal(shown.value.kind,'study-card');assert.equal(shown.value.study_card.id,id);
  }
  // arrival is a study id and an entry id: the entry answers.
  assert.equal(door(['motifs','arrival']).value.kind,'motif-card');
  const r=door(['motifs','private-untrusted-value']);
  assert.equal(r.status,2);assert.equal(r.value.error.code,'MOTIF_NOT_FOUND');
  assert.deepEqual(r.value.problem.valid,ids);
  assert.deepEqual(r.value.problem.next_actions.map(action=>action.argv),[['motifs']]);
  assert.equal(r.stdout.includes('private-untrusted-value'),false);
  assert.equal(r.value.problem.now_at,undefined);
});

test('cli imports the map helpers only for motifs, so catalog works without them',()=>{
  const text=fs.readFileSync(new URL('cli.mjs',kit),'utf8');
  assert.equal(/^import[^\n]*motif-map\.mjs/m.test(text),false,'no static import of motif-map.mjs');
  assert.match(text,/await import\('\.\/motif-map\.mjs'\)/);
  const base=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-motif-map-absent-'));
  try{
    const folder=path.join(base,'agent-first','0.1');fs.mkdirSync(folder,{recursive:true});
    for(const name of ['cli.mjs','runtime.mjs','schema.mjs','modules.mjs','command-state.mjs','invoke.mjs','input-file.mjs','problems.mjs','adapter-catalog.mjs','arrive.mjs','motif-map.mjs','motifs.json']){
      fs.copyFileSync(new URL(name,kit),path.join(folder,name));
    }
    const copy=path.join(folder,'cli.mjs');
    assert.equal(door(['motifs'],copy).value.kind,'motif-index');
    assert.equal(door(['motifs','witness'],copy).value.kind,'motif-card');
    fs.rmSync(path.join(folder,'motif-map.mjs'));
    const catalog=door(['catalog'],copy);
    assert.equal(catalog.status,0);assert.equal(catalog.value.modules.length,3);
  }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('the helpers are pure: they read only the map they are given, and return copies',async()=>{
  const text=fs.readFileSync(new URL('motif-map.mjs',kit),'utf8');
  assert.match(text,/^\/\/ SPDX-License-Identifier: MPL-2\.0\n/);
  assert.equal(/\bimport\b/.test(text),false,'motif-map.mjs imports nothing');
  for(const word of ['process','fetch','setTimeout','setInterval','readFile','Date'])assert.equal(new RegExp(`\\b${word}\\b`).test(text),false,word);
  const {motifIndex,motifCard,earlierName}=await helpers();
  const copy=structuredClone(map);
  const index=motifIndex(copy),card=motifCard(copy,'continuity');
  index.edges[0].meaning='changed';card.motif.faces.carried.limit='changed';
  assert.deepEqual(copy,map,'the map given is not changed');
  assert.equal(motifCard(copy,'nonesuch'),undefined);
  assert.deepEqual(earlierName(copy,'bounded-work'),{now_at:['witness','choice']});
  assert.deepEqual(earlierName(copy,'recovery'),{study:'recovery'});
  assert.equal(earlierName(copy,'witness'),undefined,'a current id is not an earlier name');
  assert.equal(earlierName(copy,'toString'),undefined);
});

test('the words the door adds hold no greeting, no remark about the reader, no excluded register and no must, shall or should',async()=>{
  const own=read('tests/own-door.test.mjs');
  const pattern=(text,name)=>{const match=new RegExp(`^\\s*const ${name} ?= ?\\/(.+)\\/i;$`,'m').exec(text);assert.ok(match,name);return new RegExp(match[1],'i');};
  const words={GREETING:pattern(own,'GREETING'),ABOUT_READER:pattern(own,'ABOUT_READER'),EXCLUDED_REGISTER:pattern(read('tests/hospitality.test.mjs'),'EXCLUDED_REGISTER'),MODAL:/\b(must|shall|should)\b/i};
  const {motifIndex,motifCard}=await helpers();
  const index=motifIndex(map),card=motifCard(map,'witness');
  const found=door(['motifs','bounded-work']).value.problem,study=door(['motifs','recovery']).value.problem,none=door(['motifs','nonesuch']).value.problem;
  const face=door(['motifs','continuity/replaced']).value.problem,studyEarlier=door(['motifs','study','show','exit']).value.problem;
  const texts=[index.use,index.path,...index.next.map(item=>item.why),card.commands_note,
    ...[found,study,none,face,studyEarlier].flatMap(problem=>[problem.detail,...problem.next_actions.map(action=>action.why)]),
    usageHelp('motifs').summary,...usageHelp('motifs').rules,READ_ONLY.find(item=>item.argv.join(' ')==='motifs').what];
  for(const text of texts)for(const [name,word] of Object.entries(words))assert.doesNotMatch(text,word,`${name}: ${text}`);
});

test('arrive and help describe the map as it is now',()=>{
  const line=READ_ONLY.find(item=>item.argv.length===1&&item.argv[0]==='motifs');
  assert.equal(line.what,'Read the motif map: which file and test hold each concern.');
  assert.equal(Buffer.byteLength(line.what),58);
  const help=usageHelp('motifs');
  assert.equal(help.usage,'motifs [motif-id]');
  assert.match(help.summary,/index/);
  assert.ok(help.rules.some(rule=>rule.includes('now_at')),'help motifs names now_at');
  assert.ok(help.rules.some(rule=>rule.includes('8192 bytes')),'help motifs gives the bound');
  assert.ok(help.rules.some(rule=>rule.includes('agent-first/0.1/motifs.json')),'help motifs says where the whole map is');
  assert.ok(help.rules.some(rule=>rule.includes('a/b names face b of entry a')),'help motifs says what a slash in now_at is');
  assert.ok(help.rules.some(rule=>rule.includes('what boundary, limit and not_covered mean')),'help motifs names the fields gloss');

});

test('the README describes the index, now_at and the 8192-byte bounds, and no longer says motifs prints the whole map',()=>{
  const text=read('agent-first/0.1/README.md');
  assert.ok(text.includes('`motifs` prints an index of [the motif map](motifs.json), at most 8192 bytes'),'the index and its bound');
  assert.ok(text.includes('`motifs <motif-id>` prints one entry as the file has it'),'one entry');
  assert.ok(text.includes('An earlier name answers `MOTIF_NOT_FOUND` with `now_at`'),'an earlier name');
  assert.ok(text.includes('and `now_at` where `motifs` or `motifs study show` was given an earlier name'),'the problem fields');
  assert.ok(text.includes('so are `motifs` and each `motifs <motif-id>`'),'the bounds in Output sizes');
  // What help says the index lists, the README says: the earlier ids that are not ids now, not every earlier id.
  assert.ok(text.includes('the ids of the earlier kit map that are not ids now, with their status and where each went'),'the earlier ids');
  assert.equal(text.includes('the ids of the earlier kit map with where each went'),false);
  assert.ok(text.includes('what boundary, limit and not_covered mean'),'the fields gloss');
  assert.equal(text.includes('the whole map, about 79 KB) and'),false,'the old size sentence is gone');
  assert.equal(text.includes('(`motifs <motif-id>` returns one card)'),false);
});

test('the package does not publish the kit, and the npm script is the kit\'s one entry',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.xenia,'node agent-first/0.1/cli.mjs');
  assert.equal(pkg.files.includes('agent-first'),false);
  assert.equal(Object.keys(pkg.exports).some(key=>key.includes('agent-first')),false);
});
