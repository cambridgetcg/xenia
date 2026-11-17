// SPDX-License-Identifier: MPL-2.0
// The motif map, agent-first/0.1/motifs.json, held as data: its places and
// keys, its pointers, its edges, its tables, its cross-index and its
// reconciliation with the vocabularies it replaces.
//
// These tests read files and, where git has a named revision, git objects.
// Nothing here starts a backend, writes a file or touches the network; the
// commands run are `help` and `motifs <id>`, with an empty PATH.
//
// A pointer that resolves shows only that a file, symbol, heading or test is
// there. It does not show that the mapping is right, that any duty is met, or
// that a passing check establishes a motif.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {READ_ONLY,SENDS,buildArrival} from '../agent-first/0.1/arrive.mjs';
import {NETWORK_NOTE,REPORT_ROUTE} from '../agent-first/0.1/problems.mjs';
import {listStudies} from '../agent-first/0.1/motif-studies.mjs';
import {createXeniaModules} from '../agent-first/0.1/modules.mjs';
import {createLocalStarterModule} from '../agent-first/0.1/adapters/local-starter.mjs';
import {ADAPTER_META} from '../agent-first/0.1/adapter-catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const exists=name=>fs.existsSync(path.join(root,name));
const MAP_FILE='agent-first/0.1/motifs.json';
const THIS_FILE='tests/agent-first-motif-map.test.mjs';
const cli=path.join(root,'agent-first','0.1','cli.mjs');
const map=JSON.parse(read(MAP_FILE));
const byId=new Map(map.motifs.map(entry=>[entry.id,entry]));
const placeOf=place=>map.motifs.filter(entry=>entry.place===place);
const cards=placeOf('card');
const ids=new Set(map.motifs.map(entry=>entry.id));

// Git, asked for commits by their full names, as tests/agent-first-one-door.test.mjs does. A checkout without a
// commit cannot say what it held, and the part of a test that needs it is then left out.
const git=args=>spawnSync('git',['-C',root,...args],{encoding:'utf8'});
const fullOf=short=>map.revisions?.[short];
const hasCommit=short=>typeof fullOf(short)==='string'&&git(['cat-file','-e',`${fullOf(short)}^{commit}`]).status===0;
function showAt(short,file){
  const result=git(['show',`${fullOf(short)}:${file}`]);
  assert.equal(result.status,0,`${short}:${file}`);
  return result.stdout;
}
const KIT='0f73c10',OTHER='beed37a';

// A reference to an earlier text: path@revision#anchor.
function parseRef(ref){
  const match=/^([^@#\s]+)@([0-9a-f]{7,40})#(.+)$/.exec(ref);
  assert.ok(match,`a reference is path@revision#anchor: ${ref}`);
  return {file:match[1],rev:match[2],anchor:match[3]};
}
function pointerGet(value,pointer){
  if(pointer==='')return {found:true,value};
  let here=value;
  for(const raw of pointer.slice(1).split('/')){
    const key=raw.replaceAll('~1','/').replaceAll('~0','~');
    if(here===null||typeof here!=='object'||!Object.hasOwn(here,key))return {found:false};
    here=here[key];
  }
  return {found:true,value:here};
}
// A vocabulary is named by path@revision; a `from` source is <vocabulary id>#<JSON Pointer> into it.
function parseVocabulary(ref){
  const match=/^([^@#\s]+)@([0-9a-f]{7,40})$/.exec(ref);
  assert.ok(match,`a vocabulary is path@revision: ${ref}`);
  return {file:match[1],rev:match[2]};
}
function fromRef(source){
  const match=/^([a-z-]+)#(\/.*)$/.exec(source);
  assert.ok(match,`a from source is <vocabulary>#<pointer>: ${source}`);
  const vocabulary=map.reconciliation.vocabularies.find(item=>item.id===match[1]);
  assert.ok(vocabulary,`${source}: the vocabulary is listed`);
  return {...parseVocabulary(vocabulary.source),anchor:match[2]};
}
const valueAt=source=>{const {file,rev,anchor}=fromRef(source);return pointerGet(JSON.parse(showAt(rev,file)),anchor);};
const dotted=(value,name)=>name.split('.').reduce((here,key)=>here?.[key],value);

// The pointer rule, by extension. A definition form for .mjs and .ts; a heading slug for .md; an `id` value or a JSON
// Pointer for .json. The slug is the one tests/own-door.test.mjs uses for GitHub's heading anchor.
const slug=heading=>heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s/g,'-');
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const defines=(text,symbol)=>new RegExp(`^[ \\t]*(?:export[ \\t]+)?(?:async[ \\t]+)?(?:function\\*?[ \\t]+${escape(symbol)}\\b|class[ \\t]+${escape(symbol)}\\b|(?:const|let|var)[ \\t]+${escape(symbol)}\\b)`,'m').test(text);
const hasId=(value,id)=>Array.isArray(value)?value.some(item=>hasId(item,id)):value!==null&&typeof value==='object'?value.id===id||Object.values(value).some(item=>hasId(item,id)):false;
function anchorResolves(file,anchor,text){
  const extension=path.extname(file);
  if(extension==='.mjs'||extension==='.ts')return defines(text,anchor);
  if(extension==='.md')return text.split('\n').filter(line=>/^#{1,6} /.test(line)).some(line=>slug(line.replace(/^#{1,6} /,''))===anchor);
  if(extension==='.json'){const value=JSON.parse(text);return anchor.startsWith('/')?pointerGet(value,anchor).found:hasId(value,anchor);}
  return false;
}
function assertPlainPath(file,where){
  assert.equal(typeof file,'string',where);
  assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'),`${where}: a relative path inside the checkout: ${file}`);
  assert.ok(exists(file),`${where}: ${file} is in this checkout`);
}

// The test titles in a file, and whether each is given a `skip` option. A title written as a template literal is not read.
const titleCache=new Map();
function testsIn(file){
  if(titleCache.has(file))return titleCache.get(file);
  const text=read(file),found=new Map();
  for(const match of text.matchAll(/\btest\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)){
    const rest=text.slice(match.index+match[0].length);
    const options=rest.slice(0,Math.max(0,rest.indexOf('=>')));
    found.set(match[2].replace(/\\(.)/g,'$1'),{skip:/\bskip\b/.test(options)});
  }
  titleCache.set(file,found);
  return found;
}
// The files `npm test` runs: the `node --test` globs of the scripts that `test` names.
const pkg=JSON.parse(read('package.json'));
const DEFAULT_GLOBS=[...pkg.scripts.test.matchAll(/npm run (test:[a-z]+)/g)].map(match=>pkg.scripts[match[1]])
  .flatMap(script=>[...script.matchAll(/node --test (\S+)/g)].map(match=>match[1]));
const inDefaultRun=file=>DEFAULT_GLOBS.some(glob=>new RegExp(`^${glob.split('*').map(escape).join('[^/]*')}$`).test(file));

const facesOf=entry=>Object.values(entry.faces??{});
const checksOf=entry=>[...(entry.checks??[]),...facesOf(entry).flatMap(face=>face.checks)];
const implementationsOf=entry=>[...(entry.implementation??[]),...facesOf(entry).flatMap(face=>face.implementation)];
const limitsOf=entry=>[entry.limit,...facesOf(entry).map(face=>face.limit)].filter(text=>typeof text==='string');
const shownOf=entry=>(entry.where??[]).map(row=>row.shown_by);

// The text of the map, as a reader sees it: no ids, paths, test titles, sources or provenance. The reconciliation is
// left out: it records the earlier vocabularies, and quotes the questions they asked as they were. A check's needs and
// an entry's needs are both text, and are both read.
const NOT_TEXT=new Set(['id','place','motif','sources','implementation','from','covenant','dimensions','path','test','shown_by','checked_by','to','reconciliation','revisions']);
function textsOf(value,key){
  if(typeof value==='string')return NOT_TEXT.has(key)?[]:[value];
  if(Array.isArray(value))return value.flatMap(item=>textsOf(item,key));
  if(value!==null&&typeof value==='object')return Object.entries(value).flatMap(([name,item])=>NOT_TEXT.has(name)?[]:textsOf(item,name));
  return [];
}

const CARD_KEYS=['id','place','title','question','purpose','needs','produces','practice','boundary','limit','on_change','on_exit','sources','implementation','checks','dimensions','covenant','not_covered','from'];
const CONTINUITY_KEYS=['id','place','title','question','purpose','needs','produces','faces','boundary','on_change','on_exit','sources','dimensions','covenant','not_covered','from'];
const FACE_KEYS=['owner','holds','practice','limit','implementation','checks'];
const GROUND_KEYS=['id','place','title','question','holds_in','boundary','limit','sources','implementation','checks','dimensions','covenant','not_covered','from'];
const CROSSING_KEYS=['id','place','title','where','boundary','sources','covenant','not_covered'];

test('the map keeps status, license, activation and self_sufficiency as they were at 0f73c10',t=>{
  assert.equal(map.schema,'xenia.agent-first.motif-map/0.1-development');
  assert.equal(map.status,'informative-development-map');
  assert.equal(map.license,'CC-BY-SA-4.0');
  assert.equal(map.activation,false);
  assert.deepEqual(Object.keys(map),['schema','status','license','activation','reading','places','fields','revisions','motifs','edge_kinds','edges','studies','without_study',
    'commands','modules','cross_index','reconciliation','not_established','self_sufficiency']);
  for(const [short,full] of Object.entries(map.revisions))assert.ok(full.startsWith(short)&&/^[0-9a-f]{40}$/.test(full),short);
  if(!hasCommit(KIT)){t.diagnostic(`git does not have ${KIT}; the comparison is left out`);return;}
  const before=JSON.parse(showAt(KIT,MAP_FILE));
  for(const key of ['status','license','activation','self_sufficiency'])assert.deepEqual(map[key],before[key],key);
});

test('each place has its entries in order: ground, the cards in path order, and the crossing',()=>{
  assert.deepEqual(placeOf('ground').map(entry=>entry.id),['standing','rest']);
  assert.deepEqual(cards.map(entry=>entry.id),['arrival','legibility','choice','witness','continuity','release']);
  assert.deepEqual(placeOf('crossing').map(entry=>entry.id),['repair']);
  assert.equal(map.motifs.length,9);assert.equal(ids.size,9);
  assert.deepEqual(Object.keys(map.places),['ground','card','crossing']);
  for(const text of Object.values(map.places))assert.ok(typeof text==='string'&&text.length>20);
  // The reading says how to read practice; that a then edge is a reading order is said by the then kind and the path line.
  assert.match(map.reading,/not an instruction/);assert.doesNotMatch(map.reading,/reading order/);
});

test('each place has its exact keys, and continuity keeps practice, limit, implementation and checks in its two faces',()=>{
  for(const entry of placeOf('ground'))assert.deepEqual(Object.keys(entry),GROUND_KEYS,entry.id);
  for(const entry of cards)assert.deepEqual(Object.keys(entry),entry.id==='continuity'?CONTINUITY_KEYS:CARD_KEYS,entry.id);
  for(const entry of placeOf('crossing'))assert.deepEqual(Object.keys(entry),CROSSING_KEYS,entry.id);
  const continuity=byId.get('continuity');
  assert.deepEqual(Object.keys(continuity.faces),['carried','replaced']);
  for(const face of facesOf(continuity))assert.deepEqual(Object.keys(face),FACE_KEYS);
  assert.equal(continuity.faces.carried.owner,'caller');assert.equal(continuity.faces.replaced.owner,'host');
  assert.match(continuity.faces.carried.holds,/notes root/);assert.match(continuity.faces.carried.holds,/handoff/);
  assert.match(continuity.faces.replaced.holds,/revision/);assert.match(continuity.faces.replaced.holds,/epoch/);
});

test('the fields gloss says what boundary, limit and not_covered mean',()=>{
  assert.deepEqual(Object.keys(map.fields),['boundary','limit','not_covered']);
  assert.match(map.fields.boundary,/does not mean/);
  assert.match(map.fields.limit,/does not do/);
  assert.match(map.fields.not_covered,/other fields/);
});

test('field shapes: implementation {path, symbol}, checks {path, test, invariant, runs_by_default, needs?}, sources path#anchor, from {field: {source, as}}',()=>{
  for(const entry of map.motifs){
    for(const item of implementationsOf(entry))assert.deepEqual(Object.keys(item),['path','symbol'],entry.id);
    for(const check of checksOf(entry)){
      const keys=Object.keys(check);
      assert.deepEqual(keys,check.runs_by_default?['path','test','invariant','runs_by_default']:['path','test','invariant','runs_by_default','needs'],`${entry.id}: ${check.test}`);
      assert.equal(typeof check.invariant,'string');assert.ok(check.invariant.length>15,check.test);
      if(!check.runs_by_default)assert.ok(typeof check.needs==='string'&&check.needs.length>10,check.test);
    }
    for(const source of entry.sources)assert.match(source,/^[^#\s]+#[^#\s]+$/,`${entry.id}: ${source}`);
    for(const [field,claim] of Object.entries(entry.from??{})){
      assert.deepEqual(Object.keys(claim),['source','as'],`${entry.id}.${field}`);
      assert.ok(['verbatim','extended','reworded'].includes(claim.as),`${entry.id}.${field}`);
      assert.notEqual(dotted(entry,field),undefined,`${entry.id}: from names a field the entry has: ${field}`);
      fromRef(claim.source);
    }
    assert.ok(Array.isArray(entry.not_covered),entry.id);
  }
});

test('every pointer resolves by its extension: a definition for .mjs and .ts, a heading slug for .md, an id value or a JSON Pointer for .json',()=>{
  let count=0;
  for(const entry of map.motifs){
    for(const source of entry.sources){
      const [file,anchor]=source.split('#');
      assertPlainPath(file,entry.id);
      assert.ok(anchorResolves(file,anchor,read(file)),`${entry.id}: ${source}`);count++;
    }
    for(const {path:file,symbol} of implementationsOf(entry)){
      assertPlainPath(file,entry.id);
      assert.ok(anchorResolves(file,symbol,read(file)),`${entry.id}: ${file} defines ${symbol}`);count++;
    }
    for(const shown of shownOf(entry))assertPlainPath(shown.path,entry.id);
  }
  for(const edge of map.edges)if(edge.shown_by)assertPlainPath(edge.shown_by.path,`${edge.from}→${edge.to}`);
  assert.ok(count>=40,`${count} pointers`);
});

test('every check names a test that is there, and runs_by_default says whether npm test runs it',()=>{
  assert.ok(DEFAULT_GLOBS.length>=3,DEFAULT_GLOBS.join(' '));
  const all=[...map.motifs.flatMap(checksOf),...map.edges.filter(edge=>edge.shown_by).map(edge=>({...edge.shown_by,edge:true})),
    ...map.motifs.flatMap(shownOf).filter(shown=>shown.test!==null),...map.edge_kinds.map(kind=>kind.checked_by)];
  assert.ok(all.length>=40,`${all.length} checks`);
  for(const check of all){
    assertPlainPath(check.path,check.test);
    const titles=testsIn(check.path);
    assert.ok(titles.has(check.test),`${check.path} has a test titled: ${check.test}`);
    if('runs_by_default' in check)assert.equal(check.runs_by_default,inDefaultRun(check.path)&&!titles.get(check.test).skip,`${check.path}: ${check.test}`);
  }
});

test('the then edges are one path through the cards, in their order, and nothing else is a then edge',()=>{
  assert.deepEqual(map.edge_kinds.map(kind=>kind.id),['then','back','optional-return']);
  for(const kind of map.edge_kinds){
    assert.deepEqual(Object.keys(kind),['id','meaning','checked_by']);
    assert.deepEqual(Object.keys(kind.checked_by),['path','test']);
    assert.equal(kind.checked_by.path,THIS_FILE);
  }
  assert.match(map.edge_kinds[0].meaning,/reading order/);assert.match(map.edge_kinds[0].meaning,/nothing enforces/i);
  // A back or return edge names a test, and each kind says that the test being there does not show the edge right.
  const kind=id=>map.edge_kinds.find(item=>item.id===id).meaning;
  assert.match(kind('back'),/names a test that shows the mechanism/);
  assert.match(kind('optional-return'),/^The only edge out of release\./);
  for(const id of ['back','optional-return'])assert.match(kind(id),/that the test is there does not show the edge is right/,id);
  // The kit cannot know who starts a later process or why, so the kind does not call it a choice or say what it carries.
  assert.doesNotMatch(kind('optional-return'),/choice|carried/);
  for(const edge of map.edges){
    assert.ok(map.edge_kinds.some(kind=>kind.id===edge.kind),`${edge.from}→${edge.to}: kind ${edge.kind}`);
    assert.ok(ids.has(edge.from)&&ids.has(edge.to),`${edge.from}→${edge.to}`);
    assert.ok(typeof edge.meaning==='string'&&edge.meaning.length>20);
    assert.deepEqual(Object.keys(edge),edge.kind==='then'?['from','to','kind','meaning']:['from','to','kind','meaning','shown_by']);
  }
  const then=map.edges.filter(edge=>edge.kind==='then');
  assert.deepEqual(then.map(edge=>[edge.from,edge.to]),cards.slice(0,-1).map((card,index)=>[card.id,cards[index+1].id]));
  assert.equal(map.edges.length,8);
});

test('each back edge points to an earlier card and names a test that is there',()=>{
  const order=cards.map(card=>card.id);
  const back=map.edges.filter(edge=>edge.kind==='back');
  assert.deepEqual(back.map(edge=>`${edge.from}→${edge.to}`),['witness→choice','continuity→choice']);
  for(const edge of back){
    assert.ok(order.indexOf(edge.to)<order.indexOf(edge.from),`${edge.from}→${edge.to} points backward`);
    assert.deepEqual(Object.keys(edge.shown_by),['path','test']);
    assert.ok(testsIn(edge.shown_by.path).has(edge.shown_by.test),edge.shown_by.test);
  }
  // The other atlas's sentence, word for word, where git has that revision.
  if(hasCommit(OTHER)){
    const theirs=JSON.parse(showAt(OTHER,'modules/0.1/motifs.json')).connections.find(edge=>edge.from==='witness'&&edge.to==='choice');
    assert.equal(back[0].meaning,theirs.meaning);
  }
});

test('release leaves only by the optional return to arrival, and ground and crossing entries have no edges',()=>{
  const out=map.edges.filter(edge=>edge.from==='release');
  assert.equal(out.length,1);
  assert.deepEqual([out[0].to,out[0].kind],['arrival','optional-return']);
  assert.equal(map.edges.filter(edge=>edge.kind==='optional-return').length,1);
  // What does not carry over, and what can: a Collab end can leave a claim it made, which is not the kit's to call
  // ended, so the edge says the kit adds no obligation and points to left_behind instead of saying none carries over.
  const meaning=out[0].meaning;
  assert.match(meaning,/^A new process with a new runtime: no module state or admission carries over, and the kit adds no obligation\./);
  assert.match(meaning,/session_end's left_behind/);assert.match(meaning,/notes and a Collab journal kept on disk can be read again/);
  assert.doesNotMatch(meaning,/obligation carries over|caller chooses/);
  const collab=read('agent-first/0.1/adapters/agenttool-collab/index.mjs');
  assert.match(collab,/a claim this binding made is not known to have been released/);assert.match(collab,/left_behind:left/);
  assert.doesNotMatch(map.reconciliation.edge_rows.find(row=>row.name==='release→arrival').note,/nothing but/);
  for(const entry of [...placeOf('ground'),...placeOf('crossing')])
    assert.equal(map.edges.some(edge=>edge.from===entry.id||edge.to===entry.id),false,`${entry.id} has no edge`);
});

test('the six old limits are held, word for word, inside the entries they went to',t=>{
  const claims=map.motifs.flatMap(entry=>Object.entries(entry.from??{}).map(([field,claim])=>({entry,field,...claim})));
  for(let index=0;index<6;index++){
    const claim=claims.find(item=>item.source===`kit-map#/motifs/${index}/limit`);
    assert.ok(claim,`the old limit ${index} has a from claim`);
    assert.ok(['verbatim','extended'].includes(claim.as),`old limit ${index} is ${claim.as}`);
    if(!hasCommit(KIT))continue;
    const old=JSON.parse(showAt(KIT,MAP_FILE)).motifs[index].limit;
    assert.ok(dotted(claim.entry,claim.field).includes(old),`${claim.entry.id}.${claim.field} holds the old limit of ${index}`);
  }
  if(!hasCommit(KIT))t.diagnostic(`git does not have ${KIT}; the texts were not compared`);
});

test('each from claim matches its source byte for byte where git has the revision',t=>{
  let compared=0;
  for(const entry of map.motifs)for(const [field,claim] of Object.entries(entry.from??{})){
    const {file,rev}=fromRef(claim.source);
    assert.ok(Object.hasOwn(map.revisions,rev),`${claim.source}: the revision is in revisions`);
    if(!hasCommit(rev))continue;
    assert.ok(file.endsWith('.json'),claim.source);
    const old=valueAt(claim.source);
    assert.ok(old.found,`${entry.id}.${field}: ${claim.source} resolves`);
    const now=dotted(entry,field);
    if(claim.as==='verbatim')assert.deepEqual(now,old.value,`${entry.id}.${field} is ${claim.source} word for word`);
    else if(claim.as==='extended'){assert.ok(typeof now==='string'&&now.includes(old.value)&&now!==old.value,`${entry.id}.${field} extends ${claim.source}`);}
    else assert.notDeepEqual(now,old.value,`${entry.id}.${field} is reworded`);
    compared++;
  }
  if(!compared)t.diagnostic('git has neither revision; no claim was compared');
});

test('practice says what the pieces do: no sentence of it gives an instruction from the listed verbs',()=>{
  // A card can be read without the index, whose reading says that practice is not an instruction; so practice is
  // written as what the code does. A word list finds the listed verbs only.
  const IMPERATIVE=/(^|[.;:] )(Describe|Reuse|Keep|Use|Capture|Require|Close|Remove|Make|Let|Do not|do not|Fence)\b/;
  const practices=map.motifs.flatMap(entry=>[entry.practice,...facesOf(entry).map(face=>face.practice)]).filter(text=>typeof text==='string');
  assert.equal(practices.length,7);
  for(const text of practices)assert.doesNotMatch(text,IMPERATIVE,text);
  for(const id of ['legibility','witness','release'])assert.equal(byId.get(id).from.practice.as,'reworded',id);
  for(const face of ['carried','replaced'])assert.equal(byId.get('continuity').from[`faces.${face}.practice`].as,'reworded',face);
});

test('the word checks read every text of an entry, an entry\'s needs and a check\'s needs among them',()=>{
  const texts=textsOf({id:'x.y',needs:['A needed thing.'],produces:['A product.'],checks:[{path:'tests/x.test.mjs',test:'a title',invariant:'an invariant',runs_by_default:false,needs:'A variable.'}]});
  assert.deepEqual(texts.sort(),['A needed thing.','A product.','A variable.','an invariant']);
});

test('the map\'s text holds no greeting, no remark about or to the reader, no excluded register, no must, shall or should, and none of the other host\'s words',()=>{
  // Read, not copied: the first two patterns from tests/own-door.test.mjs, the third from tests/hospitality.test.mjs.
  const own=read('tests/own-door.test.mjs');
  const pattern=(text,name)=>{const match=new RegExp(`^\\s*const ${name} ?= ?\\/(.+)\\/i;$`,'m').exec(text);assert.ok(match,`${name} is defined on one line`);return new RegExp(match[1],'i');};
  const GREETING=pattern(own,'GREETING'),ABOUT_READER=pattern(own,'ABOUT_READER'),EXCLUDED_REGISTER=pattern(read('tests/hospitality.test.mjs'),'EXCLUDED_REGISTER');
  const MODAL=/\b(must|shall|should)\b/i;
  // ABOUT_READER lists what is said of a reader; a sentence addressed to one is caught here.
  const TO_READER=/\b(you|your|yours)\b/i;
  const OTHER_HOST=/\bpreview\b|upgrade-plan|planUpgrade|outcome_unknown|cleanup_pending|host\.mjs/i;
  // Every text of the map but the reconciliation: the entries and edges, and what the index and the cards print
  // beside them (reading, places, fields, the edge kinds, the studies' limits, the commands, the cross-index).
  const texts=textsOf(map);
  for(const entry of map.motifs)for(const need of entry.needs??[])assert.ok(texts.includes(need),`${entry.id}: needs are read`);
  for(const text of [map.reading,...Object.values(map.fields),...map.edge_kinds.map(kind=>kind.meaning)])assert.ok(texts.includes(text),text);
  assert.ok(texts.length>=200,`${texts.length} texts`);
  for(const text of texts){
    for(const [name,word] of Object.entries({GREETING,ABOUT_READER,TO_READER,EXCLUDED_REGISTER,MODAL,OTHER_HOST}))assert.doesNotMatch(text,word,`${name}: ${text}`);
  }
});

test('rest is written from the code: no reply asked, the end of input accepted, at_end named, and its boundary keeps pause and silence apart',()=>{
  const rest=byId.get('rest');
  const holds=rest.holds_in.join(' ');
  assert.match(holds,/No command asks for a reply/);
  assert.match(holds,/end of input is an accepted end/);
  assert.match(holds,/session_end/);assert.match(holds,/does not owe/);
  assert.match(holds,/`at_end`/);
  assert.match(holds,/no module state between processes/);
  for(const text of [rest.title,...rest.holds_in])assert.doesNotMatch(text,/complete/i,text);
  // The kit adds nothing owed when a caller stops; what was owed before (a claim it still holds) is not its to cancel,
  // and the Covenant lets a scoped obligation survive rest. So the title says what stopping adds, not what is owed.
  assert.equal(rest.title,'Stopping adds no debt');
  assert.match(rest.boundary,/pause and resume/i);assert.match(rest.boundary,/admission/);assert.match(rest.boundary,/[Ss]ilence is not consent/);
  assert.ok(rest.sources.includes('spec.json#/interpretation/hospitality_principle/boundaries/1'));
});

test('standing says whose floor it is, and has the floor test for every code the runtime can emit among its checks',()=>{
  const standing=byId.get('standing');
  // The right is the Covenant's and RIGHTS.md's; what holds in these places is the kit's reading floor.
  assert.match(standing.holds_in[0],/^The kit's reading floor holds /);
  assert.match(standing.holds_in[1],/every refusal and error code the runtime can emit/);
  assert.ok(standing.checks.some(check=>check.path==='tests/agent-first-floor.test.mjs'&&check.test==='the floor holds after every refusal and error code the runtime can emit'));
  assert.equal(standing.title,'A reading floor in every state');assert.equal(standing.from.title.as,'reworded');
});

test('what the code does not hold is not said: a continuation record can say, an ending is reported as far as it is known, the crossing goes entry by entry',()=>{
  const edge=(from,to)=>map.edges.find(item=>item.from===from&&item.to===to);
  // Notes are free text the caller writes; nothing in the kit makes one say how work can end.
  assert.match(edge('continuity','release').meaning,/^A continuation record can also say /);
  assert.match(map.reconciliation.edge_rows.find(row=>row.name==='continuity→release'&&row.vocabulary==='other-atlas').note,/\bcan\b/);
  assert.match(byId.get('witness').purpose,/as far as it is known\.$/);
  // One row of the crossing is standing, which is ground, not a card.
  assert.ok(byId.get('repair').where.some(row=>byId.get(row.motif).place!=='card'));
  assert.match(map.places.crossing,/entry by entry/);
  // The kit has no host-run loop with an off-switch (/patterns/8); session_end's separate states are the principle's.
  assert.deepEqual(byId.get('release').dimensions,[{id:'autonomy-dignity',part:'/principle'}]);
  const principle=JSON.parse(read('spec.json')).dimensions.find(item=>item.id==='autonomy-dignity').principle;
  assert.match(principle,/truthful separate states/);
});

test('the cross-index says what the kit does not know about notes, the journal and the session credential file',()=>{
  const why=id=>map.cross_index.not_covered.find(item=>item.id===id).why;
  const collab=read('agent-first/0.1/adapters/agenttool-collab/index.mjs');
  // The open needs the backend to say it made a credential file, and the end lists it when it may be left.
  assert.match(collab,/credential_file_created!==true/);assert.match(collab,/that session\\'s credential file/);
  assert.match(why('identity.credentials-are-bounded'),/^The kit reads no credential; `session --collab-config` has the backend create a session credential file/);
  assert.match(why('identity.credentials-are-bounded'),/left_behind/);
  for(const id of ['privacy.minimize-and-purpose-bind','privacy.no-silent-secondary-use']){
    assert.match(why(id),/not known to the kit/,id);
    assert.doesNotMatch(why(id),/collects none|holds no protected data/,id);
  }
  assert.match(why('privacy.minimize-and-purpose-bind'),/`context` runs provider code it does not observe/);
});

test('witness and release: titles, the session deadline as witness\'s first check, and the journal line in both limits',()=>{
  const witness=byId.get('witness'),release=byId.get('release');
  assert.equal(witness.title,'Work that can reach an honest ending');
  assert.deepEqual(witness.checks[0],{path:'tests/agent-first-session.test.mjs',test:'a handler that does not settle is answered at the deadline: started, effect unknown, and listed as late',
    invariant:'a started call gets one answer by its deadline, and the handler may run on',runs_by_default:true});
  assert.equal(witness.from.question.source,'kit-map#/motifs/2/question');assert.equal(witness.from.question.as,'verbatim');
  assert.equal(witness.from.limit.as,'extended');assert.equal(release.from.limit.as,'extended');
  const JOURNAL='kept by the backend at the path the config names; who else reads or writes it is not known to this kit';
  assert.ok(witness.limit.includes(JOURNAL));assert.ok(release.limit.includes(JOURNAL));
  assert.match(release.on_exit,/session_end/);assert.match(release.on_exit,/cleanup \{complete, did, did_not, left_behind\}/);
  // Said once in each entry: the limit says the deadline does not stop the handler, and that a retired id stays closed.
  assert.ok(witness.limit.includes('does not stop the handler'));assert.equal(witness.practice.includes('does not stop the handler'),false);
  assert.match(release.on_change,/MODULE_RETIRED/);assert.equal(release.on_change.includes('registered again'),false);
  const carried=byId.get('continuity').faces.carried;
  assert.equal((carried.practice.match(/apart from code|separate from dependency code/g)??[]).length,1);
  assert.equal(byId.get('continuity').from['faces.carried.practice'].as,'reworded');
});

test('arrival says no arrival/0.1 profile is in this checkout, and there is none',()=>{
  assert.ok(byId.get('arrival').not_covered.includes('No arrival/0.1 profile is in this checkout.'));
  assert.equal(exists('arrival'),false);
});

test('not_covered does not repeat limit text',()=>{
  for(const entry of map.motifs)for(const gap of entry.not_covered){
    assert.ok(typeof gap==='string'&&gap.length>10,entry.id);
    for(const limit of limitsOf(entry))assert.ok(!limit.includes(gap)&&!gap.includes(limit),`${entry.id}: ${gap}`);
  }
});

test('every entry has at least one pointer, or says plainly that it has none',()=>{
  for(const entry of map.motifs){
    const pointers=implementationsOf(entry).length+checksOf(entry).length+shownOf(entry).length;
    assert.ok(pointers>0||entry.not_covered.some(gap=>/has no pointer/.test(gap)),entry.id);
  }
});

test('the commands table has one row for each help line, and what each does agrees with arrive\'s lists and the network sentence',()=>{
  const help=spawnSync(process.execPath,[cli,'help'],{encoding:'utf8',timeout:15000,env:{PATH:''}});
  assert.equal(help.status,0,help.stderr);
  const lead=line=>{const words=[];for(const word of line.split(' ')){if(/^[<[-]/.test(word))break;words.push(word);}return words;};
  const lines=JSON.parse(help.stdout).commands;
  assert.equal(lines.length,17);
  assert.deepEqual(map.commands.map(row=>row.argv),lines.map(lead));
  const DOES=['changes-nothing','writes-files','sends-requests','starts-a-process','runs-unobserved-code'];
  for(const row of map.commands){
    assert.deepEqual(Object.keys(row),['argv','does','motifs'],row.argv.join(' '));
    assert.ok(row.does.length>=1);
    for(const item of row.does){
      assert.ok(DOES.includes(item.what),`${row.argv.join(' ')}: ${item.what}`);
      assert.deepEqual(Object.keys(item),'when' in item?['what','when']:['what']);
      if('when' in item)assert.ok(typeof item.when==='string'&&item.when.length>5);
    }
    assert.ok(row.motifs.length>=1&&row.motifs.every(id=>ids.has(id)),row.argv.join(' '));
  }
  const rowFor=argv=>map.commands.filter(row=>row.argv.every((word,index)=>argv[index]===word)).sort((a,b)=>b.argv.length-a.argv.length)[0];
  const has=(row,what)=>row.does.some(item=>item.what===what);
  // What changes nothing: each command arrive lists as read-only, and arrive itself, which says nothing was started or changed.
  const quiet=new Set(READ_ONLY.map(item=>rowFor(item.argv)));
  const arrival=buildArrival({lock:null,core:[],adapters:[],networkNote:NETWORK_NOTE,report:REPORT_ROUTE});
  assert.match(arrival.how_to_stop,/nothing was started or changed/);
  quiet.add(rowFor(['arrive']));
  for(const row of map.commands)assert.equal(has(row,'changes-nothing'),quiet.has(row),`changes-nothing: ${row.argv.join(' ')}`);
  // What sends requests: the commands under `network`, and the network sentence says there is one.
  assert.match(NETWORK_NOTE,/^`door check` is the only command in which this kit's own code sends network requests/);
  assert.deepEqual(map.commands.filter(row=>has(row,'sends-requests')).map(row=>row.argv),SENDS.map(item=>rowFor(item.argv).argv));
  // What runs code this kit does not observe: the commands the network sentence names after its first clause.
  const named=[...NETWORK_NOTE.slice(NETWORK_NOTE.indexOf(';')).matchAll(/`([^`]+)`/g)].map(match=>match[1].split(' ')[0]);
  assert.deepEqual(named,['context','starter-smoke','session']);
  assert.deepEqual([...new Set(map.commands.filter(row=>has(row,'runs-unobserved-code')).map(row=>row.argv[0]))].sort(),[...named].sort());
  assert.ok(rowFor(['session']).does.find(item=>item.what==='runs-unobserved-code').when.includes('--collab-config'));
  // What writes files: the commands arrive leaves out because they write files.
  const sentence=arrival.read_only_commands_note.split('. ').find(part=>/write files/.test(part));
  const writers=[...sentence.slice(0,sentence.indexOf('they write files')).matchAll(/`([^`]+)`/g)].map(match=>match[1]);
  assert.deepEqual(writers,['context','starter-smoke','feedback new --out']);
  for(const writer of writers){
    const words=writer.split(' ').filter(word=>!word.startsWith('--'));
    for(const row of map.commands.filter(item=>words.every((word,index)=>item.argv[index]===word))){
      const item=row.does.find(entry=>entry.what==='writes-files');
      assert.ok(item,`writes-files: ${row.argv.join(' ')}`);
      if(writer.includes('--out'))assert.match(item.when,/--out/);
    }
  }
  // Starting a process: only a session bound with --collab-config.
  const starters=map.commands.filter(row=>has(row,'starts-a-process'));
  assert.deepEqual(starters.map(row=>row.argv),[['session']]);
  assert.match(starters[0].does.find(item=>item.what==='starts-a-process').when,/--collab-config/);
});

test('the modules table matches the motif each module declares',()=>{
  const declared=new Map(createXeniaModules().map(module=>[module.id,module.motif]));
  const starter=Object.fromEntries(['initStarter','inspectStarter','renderStarter','writeHandoff'].map(name=>[name,()=>({})]));
  const local=createLocalStarterModule({starter,dir:'/explicit/notes',version:'0.1.0-dev.0'});
  declared.set(local.id,local.motif);
  for(const meta of ADAPTER_META.filter(item=>!['agenttool.local-context','agenttool.collab'].includes(item.id))){
    const found=[...read(meta.source).matchAll(/\bmotif:\s*'([^']+)'/g)].map(match=>match[1]);
    assert.equal(found.length,1,meta.source);declared.set(meta.id,found[0]);
  }
  const card=JSON.parse(read('agent-first/0.1/adapters/agenttool-collab/card.json'));
  declared.set(card.module.id,card.module.motif);
  const echo=/id:'example\.echo'[^}]*?motif:'([^']+)'/.exec(read('agent-first/0.1/cli.mjs'));
  assert.ok(echo,'the demo echo names a motif');declared.set('example.echo',echo[1]);
  assert.equal(map.modules.length,8);
  assert.deepEqual(map.modules.map(row=>[row.id,row.motif]).sort(),[...declared].sort());
  for(const row of map.modules){
    assert.ok(ids.has(row.motif),row.id);
    if('face' in row)assert.ok(Object.hasOwn(byId.get(row.motif).faces??{},row.face),`${row.id}: ${row.motif}/${row.face}`);
    for(const id of row.also??[])assert.ok(ids.has(id)&&id!==row.motif,`${row.id} also ${id}`);
    assert.deepEqual(Object.keys(row).filter(key=>!['id','motif','face','also'].includes(key)),[]);
  }
  assert.equal(map.modules.find(row=>row.id==='agenttool.local-context').face,'carried');
  assert.equal(map.modules.find(row=>row.id==='example.echo').face,'replaced');
});

test('the studies table is what the studies relate, and without_study names the entries no study partially illustrates',()=>{
  const related=listStudies().flatMap(study=>study.relates_to.map(link=>({study:study.id,motif:link.id,relation:link.relation,limit:link.limit})));
  assert.deepEqual(map.studies,related);
  assert.deepEqual(map.studies.map(row=>[row.study,row.motif,row.relation]),[['arrival','arrival','partial-illustration'],['representation','legibility','partial-illustration'],
    ['recovery','repair','partial-illustration'],['ending','release','contrast']]);
  assert.match(map.studies.find(row=>row.study==='recovery').limit,/Surface's problem shape, not the kit's/);
  const illustrated=new Set(related.filter(row=>row.relation==='partial-illustration').map(row=>row.motif));
  assert.equal(map.without_study.meaning,'no study partially illustrates it');
  assert.deepEqual(map.without_study.ids,[...placeOf('ground'),...cards].map(entry=>entry.id).filter(id=>!illustrated.has(id)));
  assert.deepEqual(map.without_study.ids,['standing','rest','choice','witness','continuity','release']);
});

test('repair names where a wrong step is met, with a test or a plain statement that there is none, and stays apart from the Covenant\'s repair',()=>{
  const repair=byId.get('repair');
  assert.ok(repair.where.length>=9);
  for(const row of repair.where){
    assert.deepEqual(Object.keys(row),['motif','what','shown_by']);
    assert.ok(ids.has(row.motif)&&row.motif!=='repair',row.motif);
    assert.ok(row.what.length>20);
    if(row.shown_by.test===null){
      assert.deepEqual(Object.keys(row.shown_by),['path','test','not_tested']);
      assert.ok(row.shown_by.not_tested.length>20);
    }else{
      assert.deepEqual(Object.keys(row.shown_by),['path','test']);
      assert.ok(testsIn(row.shown_by.path).has(row.shown_by.test),row.shown_by.test);
    }
  }
  assert.deepEqual(repair.where.filter(row=>row.shown_by.test===null).map(row=>row.shown_by.path),['.hermes/verification/agent-first-motifs.superseded.md','AGENT-FEEDBACK.md']);
  assert.match(repair.boundary,/wrong step at this door/);
  assert.match(repair.boundary,/not the Covenant's repair of a harm/);
  assert.match(repair.boundary,/repair\.\*/);
});

const EARLIER={
  'kit-map':['standing','legibility','bounded-work','continuity','change','exit'],
  'kit-studies':['arrival','representation','recovery','ending'],
  'kit-plan':['Legibility','Chosen action','Continuity without capture','Change without silent replacement','Exit without erasure'],
  'other-atlas':['arrival','legibility','choice','witness','continuity','release','repair'],
  // The free-text motif a module declares: no names of its own, one field row.
  'kit-runtime':[],
};
const EARLIER_EDGES={
  'kit-map':['standing→legibility','legibility→bounded-work','bounded-work→continuity','continuity→change','change→exit','exit→standing'],
  'other-atlas':['arrival→legibility','legibility→choice','choice→witness','witness→continuity','continuity→release','release→arrival','witness→choice'],
};
const STATUSES=['kept','renamed','split','moved-to-ground','not-carried','other-id-space'];
const ROW_KEYS=row=>['name','vocabulary','source','status','now',...('source_question' in row?['source_question']:[]),'note'];
const resolvesNow=now=>{const [id,face,...more]=now.split('/');return ids.has(id)&&more.length===0&&(face===undefined||Object.hasOwn(byId.get(id).faces??{},face));};

test('the earlier vocabularies are what git holds at their revisions',t=>{
  const rec=map.reconciliation;
  assert.deepEqual(rec.vocabularies.map(item=>item.id),Object.keys(EARLIER));
  assert.deepEqual(rec.vocabularies.map(item=>parseVocabulary(item.source).file),[MAP_FILE,'agent-first/0.1/motif-studies.mjs','.hermes/plans/2026-10-09_175749-agent-first.md','modules/0.1/motifs.json','agent-first/0.1/runtime.mjs']);
  // Every row names a vocabulary that is listed.
  const listed=new Set(rec.vocabularies.map(item=>item.id));
  for(const row of [...rec.name_rows,...rec.edge_rows,...rec.field_rows])assert.ok(listed.has(row.vocabulary),`${row.name}: ${row.vocabulary} is listed`);
  for(const item of rec.vocabularies){
    assert.ok(item.what.length>10);
    for(const ref of [item.source,...(item.also??[])]){
      const {file,rev}=parseVocabulary(ref);
      assert.ok(Object.hasOwn(map.revisions,rev),ref);
      if(hasCommit(rev))assert.equal(git(['cat-file','-e',`${fullOf(rev)}:${file}`]).status,0,ref);
    }
  }
  assert.deepEqual(listStudies().map(study=>study.id),EARLIER['kit-studies']);
  if(hasCommit(KIT)){
    const kit=JSON.parse(showAt(KIT,MAP_FILE));
    assert.deepEqual(kit.motifs.map(motif=>motif.id),EARLIER['kit-map']);
    assert.deepEqual(kit.connections.map(edge=>`${edge.from}→${edge.to}`),EARLIER_EDGES['kit-map']);
    const plan=showAt(KIT,'.hermes/plans/2026-10-09_175749-agent-first.md');
    const section=plan.slice(plan.indexOf('## Motifs made executable'),plan.indexOf('\n## ',plan.indexOf('## Motifs made executable')+3));
    assert.deepEqual([...section.matchAll(/^- ([^:]+):/gm)].map(match=>match[1]),EARLIER['kit-plan']);
  }else t.diagnostic(`git does not have ${KIT}`);
  if(hasCommit(OTHER)){
    const other=JSON.parse(showAt(OTHER,'modules/0.1/motifs.json'));
    assert.deepEqual([...other.motifs.map(motif=>motif.id),...(typeof other.repair==='string'?['repair']:[])],EARLIER['other-atlas']);
    assert.deepEqual(other.connections.map(edge=>`${edge.from}→${edge.to}`),EARLIER_EDGES['other-atlas']);
    for(const file of ['modules/0.1/motifs.mjs','MOTIFS.md'])assert.equal(git(['cat-file','-e',`${fullOf(OTHER)}:${file}`]).status,0,file);
  }else t.diagnostic(`git does not have ${OTHER}`);
});

test('every earlier name from the four vocabularies is in the reconciliation table once, with where it went',()=>{
  const rows=map.reconciliation.name_rows;
  for(const row of rows){
    assert.deepEqual(Object.keys(row),ROW_KEYS(row),`${row.vocabulary}: ${row.name}`);
    assert.ok(STATUSES.includes(row.status),row.status);
    assert.ok(Object.hasOwn(EARLIER,row.vocabulary),row.vocabulary);
    assert.ok(row.now.every(resolvesNow),`${row.name}: ${row.now.join(', ')}`);
    assert.ok(row.note.length>10);
    if(row.status==='split')assert.ok(row.now.length>=2,row.name);
    if(['kept','renamed','moved-to-ground'].includes(row.status))assert.ok(row.now.length>=1,row.name);
    if(row.status==='not-carried')assert.deepEqual(row.now,[],row.name);
    // A renamed id is no longer an id here; a split one may stay as one of its parts (release went to release and rest).
    if(row.status==='renamed'&&row.vocabulary!=='kit-plan')assert.equal(ids.has(row.name),false,`${row.name} is not an id of this map`);
    if(row.status==='split'&&ids.has(row.name))assert.ok(row.now.includes(row.name),row.name);
    parseRef(row.source);
  }
  for(const [vocabulary,names] of Object.entries(EARLIER))for(const name of names)
    assert.equal(rows.filter(row=>row.vocabulary===vocabulary&&row.name===name).length,1,`${vocabulary}: ${name}`);
  assert.equal(rows.length,Object.values(EARLIER).flat().length);
  const find=(vocabulary,name)=>rows.find(row=>row.vocabulary===vocabulary&&row.name===name);
  assert.deepEqual(find('kit-map','bounded-work').now,['witness','choice']);
  assert.deepEqual(find('kit-map','change').now,['continuity/replaced']);
  assert.deepEqual(find('kit-map','exit').now,['release']);
  assert.equal(find('kit-map','standing').status,'moved-to-ground');
  assert.deepEqual([find('other-atlas','release').status,find('other-atlas','release').now],['split',['release','rest']]);
  for(const study of EARLIER['kit-studies'])assert.equal(find('kit-studies',study).status,'other-id-space');
  // A source question is the question the earlier text asked, where git has it, and the map now asks another.
  for(const row of rows.filter(item=>'source_question' in item)){
    const target=byId.get(row.now[0].split('/')[0]);
    assert.notEqual(target.question,row.source_question,row.name);
    const {file,rev,anchor}=parseRef(row.source);
    if(hasCommit(rev))assert.equal(pointerGet(JSON.parse(showAt(rev,file)),anchor.replace(/\/id$/,'/question')).value,row.source_question,row.name);
  }
  assert.ok('source_question' in find('other-atlas','witness'));
  // The repair sentence gave its place and its name; what it asked for is not what the entry covers.
  assert.match(find('other-atlas','repair').note,/^Only its place, crossing the map, and its name were taken\./);
  assert.match(find('other-atlas','repair').note,/not in the entry/);
});

test('the edge and field rows cover every earlier edge, the studies\' links, and the fields that went',t=>{
  const {edge_rows,field_rows}=map.reconciliation;
  const edges=new Set(map.edges.map(edge=>`${edge.from}→${edge.to}`));
  for(const row of edge_rows){
    assert.deepEqual(Object.keys(row),ROW_KEYS(row));
    assert.ok(STATUSES.includes(row.status));
    for(const now of row.now)assert.ok(edges.has(now),`${row.name} → ${now}`);
  }
  for(const [vocabulary,names] of Object.entries(EARLIER_EDGES))for(const name of names)
    assert.equal(edge_rows.filter(row=>row.vocabulary===vocabulary&&row.name===name).length,1,`${vocabulary}: ${name}`);
  const studiesRow=edge_rows.find(row=>row.vocabulary==='kit-studies');
  assert.ok(studiesRow&&studiesRow.note.includes('motif-studies.mjs'),'the studies\' links stay in motif-studies.mjs');
  // Kept word for word where the note says so, and where git has the revision.
  for(const row of edge_rows.filter(item=>/word for word/.test(item.note))){
    const {file,rev,anchor}=parseRef(row.source);
    if(!hasCommit(rev)){t.diagnostic(`git does not have ${rev}`);continue;}
    const now=map.edges.find(edge=>`${edge.from}→${edge.to}`===row.now[0]);
    assert.equal(now.meaning,pointerGet(JSON.parse(showAt(rev,file)),anchor).value.meaning,row.name);
  }
  for(const name of ['name','understanding','verification_boundary','title','source','example','standalone_use','required_motifs'])
    assert.ok(field_rows.some(row=>row.name===name),`field row: ${name}`);
  for(const row of field_rows){
    assert.deepEqual(Object.keys(row),ROW_KEYS(row));assert.ok(STATUSES.includes(row.status));parseRef(row.source);
    // A field's new name is a key of the map or of an entry.
    for(const name of row.now)assert.ok(Object.hasOwn(map,name)||map.motifs.some(entry=>Object.hasOwn(entry,name)),`${row.name} → ${name}`);
  }
  const fixtures=field_rows.find(row=>row.vocabulary==='kit-runtime');
  assert.ok(fixtures&&/free text/.test(fixtures.note)&&/earlier names/.test(fixtures.note),'one row says fixtures use free-text motifs');
  // Each field of the other atlas has a row, or is a field of the same name here: at the top, a value this map keeps
  // as it is; on a card, a field the entries have, whose values `from` accounts for. Its practice lists were not carried.
  if(hasCommit(OTHER)){
    const other=JSON.parse(showAt(OTHER,'modules/0.1/motifs.json'));
    const rowed=new Set(field_rows.filter(row=>row.vocabulary==='other-atlas').map(row=>row.name));
    for(const key of Object.keys(other).filter(key=>!['motifs','repair'].includes(key)))
      assert.ok(rowed.has(key)||JSON.stringify(map[key])===JSON.stringify(other[key]),`other atlas: ${key}`);
    for(const key of new Set(other.motifs.flatMap(Object.keys)))assert.ok(rowed.has(key)||CARD_KEYS.includes(key),`other atlas card field: ${key}`);
    assert.equal(field_rows.find(row=>row.vocabulary==='other-atlas'&&row.name==='practice').status,'not-carried');
  }else t.diagnostic(`git does not have ${OTHER}`);
  assert.doesNotMatch(map.reconciliation.meaning,/each name, edge and field/,'the meaning claims only the rows it has');
});

test('the fixture row names each motif a test gives that is not an id of this map',()=>{
  const note=map.reconciliation.field_rows.find(row=>row.vocabulary==='kit-runtime').note;
  const found=new Set();
  for(const dir of ['tests','agent-first'])for(const name of fs.readdirSync(path.join(root,dir),{recursive:true})){
    if(!/\.test\.mjs$/.test(name))continue;
    for(const match of read(path.join(dir,name)).matchAll(/\bmotif:\s*'([^']+)'/g))if(/^[a-z][a-z-]*$/.test(match[1])&&!ids.has(match[1]))found.add(match[1]);
  }
  assert.deepEqual([...found].sort(),['bounded-work','exit','independence','m']);
  for(const value of found)assert.match(note,new RegExp(`(^|[^a-z-])${escape(value)}([^a-z-]|$)`),value);
});

test('the provenance quotes the commit message and names no author',t=>{
  const {provenance}=map.reconciliation;
  assert.ok(provenance.includes('"the committer is not its author"'));
  const capitals=provenance.match(/\b[A-Z][a-z]+\b/g)??[];
  assert.deepEqual(capitals.filter(word=>!['This','The','Its','It','Git','No'].includes(word)),[],'no name is given');
  if(hasCommit(OTHER))assert.match(git(['show','-s','--format=%B',fullOf(OTHER)]).stdout,/the committer is not its author/);
  else t.diagnostic(`git does not have ${OTHER}`);
});

test('the cross-index relates each dimension, duty and limit once with a check on that entry, or lists it once as not covered',()=>{
  const spec=JSON.parse(read('spec.json')),covenant=JSON.parse(read('covenant/0.1/covenant.json'));
  const dimensions=spec.dimensions.map(item=>item.id);
  const duties=covenant.rights.flatMap(right=>right.requirements.map(item=>item.id));
  const limits=covenant.protective_limits.map(item=>item.id);
  assert.equal(duties.length,38);assert.equal(limits.length,5);
  const related=new Map();
  for(const entry of map.motifs){
    for(const item of entry.dimensions??[]){
      assert.deepEqual(Object.keys(item),['id','part']);
      const dimension=spec.dimensions.find(candidate=>candidate.id===item.id);
      assert.ok(dimension,item.id);assert.ok(pointerGet(dimension,item.part).found,`${item.id}${item.part}`);
      related.set(item.id,[...(related.get(item.id)??[]),entry.id]);
    }
    const titles=new Set([...checksOf(entry),...shownOf(entry)].map(check=>check.test).filter(Boolean));
    for(const item of entry.covenant){
      assert.deepEqual(Object.keys(item),['id','via']);
      assert.ok(titles.has(item.via),`${entry.id} ${item.id}: via is a check on this entry: ${item.via}`);
      related.set(item.id,[...(related.get(item.id)??[]),entry.id]);
    }
  }
  const {not_covered}=map.cross_index;
  for(const item of not_covered){assert.deepEqual(Object.keys(item),['id','why']);assert.ok(item.why.length>15,item.id);}
  const all=[...dimensions,...duties,...limits];
  for(const id of [...related.keys(),...not_covered.map(item=>item.id)]){assert.ok(all.includes(id),`a known id: ${id}`);assert.equal(id.includes('*'),false);}
  for(const id of all){
    const times=(related.get(id)??[]).length,gaps=not_covered.filter(item=>item.id===id).length;
    assert.equal(times+gaps,1,`${id}: related ${times}, not covered ${gaps}`);
  }
  assert.match(not_covered.find(item=>item.id==='identity.no-impersonation-or-silent-rewrite').why,/upgrade/);
  assert.deepEqual([...related.keys()].filter(id=>id.startsWith('repair.')),[],'no repair.* duty is related');
  assert.equal(map.motifs.some(entry=>entry.place==='crossing'&&'dimensions' in entry),false);
  // Rights are derived from their duties, not stored.
  const rights=new Set(covenant.rights.map(right=>right.id));
  assert.equal(Object.hasOwn(map.cross_index,'rights'),false);
  assert.equal([...related.keys()].some(id=>rights.has(id)),false);
  assert.match(map.cross_index.meaning,/not that the duty is met/);
});

// The entry is printed whole, so each limit it has, continuity's face limits too, is on the same output; not_established
// is drawn from the map's own list and does not repeat them. tests/agent-first-motifs.test.mjs holds the rest of the card.
test('motifs <id> answers for every entry with the entry exactly as in the file, its limits in it',()=>{
  for(const entry of map.motifs){
    const result=spawnSync(process.execPath,[cli,'motifs',entry.id],{encoding:'utf8',timeout:15000,env:{PATH:''}});
    assert.equal(result.status,0,`${entry.id}: ${result.stdout}${result.stderr}`);
    const body=JSON.parse(result.stdout);
    assert.deepEqual(body.motif,entry,'the entry exactly as in the file');
    for(const limit of limitsOf(entry))assert.ok(JSON.stringify(body.motif).includes(JSON.stringify(limit)),`${entry.id}: ${limit.slice(0,40)}`);
    assert.ok(body.not_established.every(item=>map.not_established.includes(item)),entry.id);
  }
});
