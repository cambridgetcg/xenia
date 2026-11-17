// SPDX-License-Identifier: MPL-2.0
// One door. Two module hosts were written from the same base; this branch
// keeps one. These tests hold what that leaves to the checkout:
// - one npm script runs the kit, and no kit file imports the other host;
// - what the door prints first stays within its stated sizes;
// - the note about the other lineage names where it is kept and what was and
//   was not carried, and its links lead somewhere;
// - every command the kit README shows is a command the door has;
// - the record for this step holds no local path.
// Nothing here starts a backend, reads a real Collab bundle or journal, or
// touches the network. The session that is opened with --collab-config binds
// the adapter to paths in a temporary folder and invokes nothing.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {COMMANDS} from '../agent-first/0.1/problems.mjs';
import {ARRIVE_LIMIT_BYTES} from '../agent-first/0.1/arrive.mjs';
import {SESSION_LIMITS} from '../agent-first/0.1/session.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const kitDir=path.join(root,'agent-first','0.1');
const cli=path.join(kitDir,'cli.mjs');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const LOCAL=/\/Users\/|\/home\/|\/private\/|\/tmp\/|\/var\/folders\/|[A-Za-z]:\\\\/;
const COLLAB='agenttool.collab';
// What `catalog` may grow to. It is not one of the documents an arriving caller has to read whole, so its bound is
// looser than the others: 16 KiB, pretty-printed as the command prints it.
const CATALOG_LIMIT_BYTES=16384;

function runCli(args,{input=''}={}){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:20000,input,env:{PATH:process.env.PATH,HOME:process.env.HOME}});
  assert.equal(result.error,undefined);assert.equal(result.stderr,'');
  return result;
}
const lineBytes=text=>Buffer.byteLength(text)+1;
const request=(id,more)=>`${JSON.stringify({id:String(id),...more})}\n`;

// Every .mjs file of the kit, the vendored provider source left out: it is another project's distribution.
function kitFiles(dir=kitDir,found=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){
      if(path.relative(kitDir,full)===path.join('adapters','telescope','provider'))continue;
      kitFiles(full,found);
    }else if(entry.name.endsWith('.mjs'))found.push(full);
  }
  return found;
}
// The strings a file imports or loads by path: `from '...'`, `import('...')`, `new URL('...', import.meta.url)`.
function loadedBy(text){
  const found=[];
  for(const pattern of [/\bfrom\s*['"]([^'"]+)['"]/g,/\bimport\s*\(\s*['"]([^'"]+)['"]/g,/\bimport\s*['"]([^'"]+)['"]/g,/new URL\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*import\.meta\.url/g]){
    for(const match of text.matchAll(pattern))found.push(match[1]);
  }
  return found;
}

test('one npm script runs the kit, and no kit file imports another module host',()=>{
  const scripts=JSON.parse(read('package.json')).scripts;
  const forKit=Object.entries(scripts).filter(([,command])=>command.includes('agent-first/'));
  assert.deepEqual(forKit,[['xenia','node agent-first/0.1/cli.mjs']],'the one script that runs the kit');
  for(const [name,command] of Object.entries(scripts)){
    assert.equal(/modules\/0\.1/.test(command),false,`${name} runs nothing under modules/0.1`);
    assert.equal(/^(xenia:modules|test:modules)$/.test(name),false,name);
  }
  // The library tests are one glob, so a test of the kit needs no script of its own.
  assert.equal(scripts['test:library'],'node --test tests/*.test.mjs');
  assert.equal(fs.existsSync(path.join(root,'modules')),false,'no modules/ folder in this checkout');
  const files=kitFiles();
  assert.ok(files.length>=20,`${files.length} kit files read`);
  const other=/(^|\/)modules\/(0\.1\/)?|host\.mjs$/;
  for(const file of files){
    for(const specifier of loadedBy(fs.readFileSync(file,'utf8'))){
      assert.equal(other.test(specifier),false,`${path.relative(root,file)} loads ${specifier}`);
    }
  }
  for(const name of fs.readdirSync(path.join(root,'tests')).filter(item=>item.endsWith('.mjs'))){
    for(const specifier of loadedBy(read(path.join('tests',name))))assert.equal(other.test(specifier),false,`tests/${name} loads ${specifier}`);
  }
  // One file of the kit is a program; the rest are loaded by it.
  const programs=files.filter(file=>/process\.argv\[1\]/.test(fs.readFileSync(file,'utf8'))).map(file=>path.relative(kitDir,file));
  assert.deepEqual(programs,['cli.mjs']);
  // The other host's verbs are not commands here.
  for(const word of ['upgrade-plan','compose','compose-demo','list','describe'])assert.equal(Object.hasOwn(COMMANDS,word),false,word);
});

test('arrive, catalog, a session\'s first line and its answer to inspect of each module stay within their sizes',t=>{
  const arrive=runCli(['arrive']);
  assert.equal(ARRIVE_LIMIT_BYTES,8192);
  assert.ok(Buffer.byteLength(arrive.stdout)<ARRIVE_LIMIT_BYTES,`arrive is ${Buffer.byteLength(arrive.stdout)} bytes`);
  const catalog=runCli(['catalog']);
  assert.ok(Buffer.byteLength(catalog.stdout)<=CATALOG_LIMIT_BYTES,`catalog is ${Buffer.byteLength(catalog.stdout)} bytes`);
  assert.equal(JSON.parse(catalog.stdout).adapters.length,4);
  assert.equal(SESSION_LIMITS.session_start_bytes,8192);assert.equal(SESSION_LIMITS.module_inspect_bytes,8192);

  // Without the adapter: three modules.
  const core=['xenia.covenant','xenia.surface','xenia.work'];
  const plain=runCli(['session'],{input:core.map((id,index)=>request(index+1,{method:'inspect',module:id})).join('')}).stdout.split('\n').filter(Boolean);
  assert.equal(plain.length,core.length+2);
  assert.ok(lineBytes(plain[0])<=SESSION_LIMITS.session_start_bytes,`session_start is ${lineBytes(plain[0])} bytes`);
  for(const [index,id] of core.entries()){
    const line=JSON.parse(plain[index+1]);
    assert.equal(line.result.module.id,id);
    assert.ok(lineBytes(plain[index+1])<=SESSION_LIMITS.module_inspect_bytes,`inspect of ${id} is ${lineBytes(plain[index+1])} bytes`);
  }

  // With the adapter bound: four modules. Binding reads the config and starts nothing; none of these paths is used.
  const scratch=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-one-door-'));
  t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
  const config={bundlePath:path.join(scratch,'bundle.js'),bunPath:path.join(scratch,'bun'),databasePath:path.join(scratch,'state','journal.sqlite'),
    homeDir:path.join(scratch,'home'),workspace:path.join(scratch,'work'),actor:'one-door-test',journal:'new'};
  const file=path.join(scratch,'collab.json');
  fs.writeFileSync(file,JSON.stringify(config));
  const all=[COLLAB,...core];
  const bound=runCli(['session','--collab-config',file],{input:all.map((id,index)=>request(index+1,{method:'inspect',module:id})).join('')});
  const lines=bound.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length,all.length+2);
  const start=JSON.parse(lines[0]);
  assert.deepEqual(start.modules.map(item=>item.id),all);
  assert.ok(lineBytes(lines[0])<=SESSION_LIMITS.session_start_bytes,`session_start with the adapter is ${lineBytes(lines[0])} bytes`);
  for(const [index,id] of all.entries()){
    const line=JSON.parse(lines[index+1]);
    assert.equal(line.result.module.id,id);
    assert.ok(lineBytes(lines[index+1])<=SESSION_LIMITS.module_inspect_bytes,`inspect of ${id} is ${lineBytes(lines[index+1])} bytes`);
  }
  // The places the backend's refusals were read at are on the card (`explain`), not on a session line.
  assert.equal(bound.stdout.includes('"sites"'),false);
  assert.equal(bound.status,0);
  assert.deepEqual(fs.readdirSync(scratch).sort(),['collab.json'],'the session made nothing in the chosen places');
});

test('through the command line, an input that misses a card of the bound adapter is refused before the gate, and the card is where explain says',t=>{
  const scratch=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-one-door-'));
  t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
  const file=path.join(scratch,'collab.json');
  fs.writeFileSync(file,JSON.stringify({bundlePath:path.join(scratch,'bundle.js'),bunPath:path.join(scratch,'bun'),databasePath:path.join(scratch,'state','journal.sqlite'),
    homeDir:path.join(scratch,'home'),workspace:path.join(scratch,'work'),actor:'one-door-test',journal:'new'}));
  // No --allow: the gate would block every operation of the module. The card is consulted first.
  const lines=runCli(['session','--collab-config',file],{input:request(1,{method:'activate',module:COLLAB})+
    request(2,{method:'invoke',module:COLLAB,operation:'task-get',input:{}})+
    request(3,{method:'invoke',module:COLLAB,operation:'task-get',input:{task_id:'PLANTED not an id'}})+
    request(4,{method:'invoke',module:COLLAB,operation:'task-get',input:{task_id:'task_1'}})}).stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const [,,missing,shaped,blocked,end]=lines;
  assert.equal(missing.error.code,'INVALID_INPUT');assert.equal(missing.error.reason,'does_not_match_card');
  assert.equal(missing.error.operation_started,false);assert.equal(missing.error.effect_outcome,'not_attempted');
  assert.equal(missing.error.pointer,'');assert.equal(missing.error.keyword,'required');assert.equal(missing.error.expected,'task_id');
  assert.equal(shaped.error.code,'INVALID_INPUT');assert.equal(shaped.error.pointer,'/task_id');assert.equal(shaped.error.keyword,'pattern');
  assert.equal(JSON.stringify(shaped).includes('PLANTED'),false,'nothing that was sent is repeated');
  // An input that matches goes on to the gate, which was given no entry.
  assert.equal(blocked.error.code,'POLICY_BLOCKED');
  assert.equal(end.kind,'session_end');assert.equal(end.cleanup.complete,true);
  assert.deepEqual(fs.readdirSync(scratch).sort(),['collab.json']);
  // The schema the session held the input to is the one `explain` prints for the adapter.
  const explainText=runCli(['explain',COLLAB]).stdout;
  const explained=JSON.parse(explainText);
  const card=explained.module.operations.find(op=>op.id==='task-get');
  assert.deepEqual(card.input.schema.required,['task_id']);
  assert.equal(explained.bound,false);
  // The document is long. What a caller has to supply before anything else (the config keys, the pin, the limits,
  // what the end writes) comes before the nine cards, within the first 8192 bytes.
  const keys=Object.keys(explained);
  for(const early of ['requires','bound_by','config','pin','limits','at_end'])assert.ok(keys.indexOf(early)<keys.indexOf('module'),`${early} comes before the cards`);
  assert.ok(Buffer.byteLength(explainText.slice(0,explainText.indexOf('"module"')))<=8192,`the cards start at byte ${Buffer.byteLength(explainText.slice(0,explainText.indexOf('"module"')))}`);
  // Its length is said before it is asked for: on the adapter's row in arrive, and in the README. Each number is
  // held to within a tenth of what the command prints.
  const actual=Buffer.byteLength(explainText)/1000;
  const row=JSON.parse(runCli(['arrive']).stdout).here.adapters.find(item=>item.id===COLLAB);
  for(const [where,text] of [['arrive',row.requires.config],['the README',read('agent-first/0.1/README.md')]]){
    const said=/`explain agenttool\.collab`[^.]*?about (\d+) KB/.exec(text);
    assert.ok(said,`${where} says how long the document is`);
    assert.ok(Math.abs(Number(said[1])-actual)<=actual/10,`${where} says about ${said[1]} KB; the command prints ${actual.toFixed(1)}`);
  }
});

test('the note about the other lineage says where it is kept, that it is superseded, and what was and was not carried',()=>{
  const note=read('agent-first/0.1/LINEAGE.md');
  assert.ok(note.startsWith('<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->'));
  assert.ok(Buffer.byteLength(note)<=8192,`the note is ${Buffer.byteLength(note)} bytes`);
  for(const phrase of ['modules/0.1','origin/hermes/agent-first-modules','beed37a','origin/hermes/agent-first-modules-compose','4119d4d','superseded'])assert.ok(note.includes(phrase),phrase);
  assert.match(note,/## What was carried over/);assert.match(note,/## What was not carried over/);assert.match(note,/## Not established/);
  for(const word of ['composition','upgrade-plan','demo','host.mjs','xenia:modules'])assert.ok(note.includes(word),`not carried: ${word}`);
  assert.doesNotMatch(note,LOCAL);
  // Every relative link leads to a file in this checkout, and every file it says was carried is here.
  const links=[...note.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map(match=>match[1]).filter(target=>!/^[a-z]+:/.test(target));
  assert.ok(links.length>=6,`${links.length} links`);
  for(const target of links)assert.ok(fs.existsSync(path.resolve(kitDir,target)),`LINEAGE.md links to ${target}`);
  for(const carried of ['adapters/agenttool-collab/stdio.mjs','adapters/agenttool-collab/index.mjs','adapters/agenttool-collab/card.json','session.mjs','schema.mjs'])assert.ok(links.includes(carried),carried);
  // The kit README and the adapter's own guide point to the note.
  assert.match(read('agent-first/0.1/README.md'),/\]\(LINEAGE\.md\)/);
  assert.match(read('agent-first/0.1/adapters/agenttool-collab/README.md'),/\]\(\.\.\/\.\.\/LINEAGE\.md\)/);
  // Where git has the two commits the note names, they hold what it says they hold. The commits are asked for by
  // their full names, not through the branches, so that a branch that has moved on does not fail this test; whether
  // the branches are still at those commits is not checked. A checkout without the commits cannot say, and this
  // part is then left out.
  const git=args=>spawnSync('git',['-C',root,...args],{encoding:'utf8'});
  for(const [revision,holds] of [['beed37ac9b1d8282c8566aa657572578d953ffc6',['modules/0.1/host.mjs','modules/0.1/cli.mjs','modules/0.1/adapters/agenttool-collab/adapter.mjs']],
    ['4119d4dec7f6b198f5538bef75912e8fb511c842',['modules/0.1/host.mjs','modules/0.1/composition.mjs','modules/0.1/composition-cli.mjs']]]){
    assert.ok(note.includes(revision),`the note gives ${revision.slice(0,7)} in full`);
    if(git(['cat-file','-e',`${revision}^{commit}`]).status!==0)continue;
    for(const name of holds)assert.equal(git(['cat-file','-e',`${revision}:${name}`]).status,0,`${revision.slice(0,7)} holds ${name}`);
    // The fork dropped the motif atlas and declares one effect fewer on its card; the note says so.
    if(revision.startsWith('4119d4d')){
      for(const name of ['modules/0.1/motifs.json','MOTIFS.md'])assert.notEqual(git(['cat-file','-e',`${revision}:${name}`]).status,0,`the fork has no ${name}`);
      const effects=rev=>JSON.parse(git(['show',`${rev}:modules/0.1/adapters/agenttool-collab/module.json`]).stdout).descriptor.effects.length;
      assert.equal(effects(revision),effects('beed37ac9b1d8282c8566aa657572578d953ffc6')-1);
      assert.match(note,/without `motifs\.json` and `MOTIFS\.md`/);assert.match(note,/one effect fewer/);
    }
    const scripts=JSON.parse(git(['show',`${revision}:package.json`]).stdout).scripts;
    assert.equal(scripts['xenia:modules'],'node modules/0.1/cli.mjs');assert.ok(Object.hasOwn(scripts,'test:modules'));
    // The stdio port: below its header comment, this branch's file is that commit's file.
    const theirs=git(['show',`${revision}:modules/0.1/adapters/agenttool-collab/stdio.mjs`]);
    assert.equal(theirs.status,0,revision);
    const code=text=>{const lines=text.split('\n');while(lines.length&&lines[0].startsWith('//'))lines.shift();return lines.join('\n');};
    assert.ok(code(theirs.stdout).length>3000);
    assert.equal(code(read('agent-first/0.1/adapters/agenttool-collab/stdio.mjs')),code(theirs.stdout),`the stdio port is unchanged from ${revision.slice(0,7)} below its header`);
  }
});

// The line about the motif atlas stays as it was written, and a dated line under it says what step 6 took. Where git
// has 0f73c10, the line is compared with that revision of the note.
test('the note keeps its line about the motif atlas, with a dated line under it that says what step 6 took',()=>{
  const ATLAS_LINE='- **The motif atlas** (`motifs.json`, `motifs.mjs`, and the `MOTIFS.md` rendered from it). The kit has its own [motifs.json](motifs.json).';
  const lines=read('agent-first/0.1/LINEAGE.md').split('\n');
  const at=lines.indexOf(ATLAS_LINE);
  assert.equal(at,37,'the line about the motif atlas is line 38, as it was');
  const git=args=>spawnSync('git',['-C',root,...args],{encoding:'utf8'});
  const base='0f73c108b28608103b27693ccaa37c303c523c81';
  if(git(['cat-file','-e',`${base}^{commit}`]).status===0)assert.equal(git(['show',`${base}:agent-first/0.1/LINEAGE.md`]).stdout.split('\n')[37],ATLAS_LINE);
  const dated=lines[at+1];
  assert.match(dated,/^  - 2026-\d\d-\d\d, step 6: /,'a dated line under it');
  for(const phrase of ['[MOTIFS.md](MOTIFS.md)','[motifs.json](motifs.json)','tools/render-motifs.mjs','tests/agent-first-motif-page.test.mjs','no file of it','reconciliation'])
    assert.ok(dated.includes(phrase),phrase);
  for(const id of ['arrival','choice','witness','release','repair'])assert.ok(dated.includes(id),id);
});

test('every command the kit README shows is a command the door has',()=>{
  const text=read('agent-first/0.1/README.md');
  const shown=[...text.matchAll(/^(?:[A-Z_]+="[^"]*" )?npm run --silent xenia -- (.+)$/gm)].map(match=>match[1].trim().split(/\s+/));
  assert.ok(shown.length>=15,`${shown.length} commands shown`);
  for(const argv of shown)assert.ok(Object.hasOwn(COMMANDS,argv[0]),`README shows a command the door does not have: ${argv.join(' ')}`);
  // The session door and the adapter are among them.
  assert.ok(shown.some(argv=>argv[0]==='session'&&argv.length===1));
  assert.ok(shown.some(argv=>argv[0]==='session'&&argv.includes('--collab-config')));
  assert.ok(shown.some(argv=>argv[0]==='explain'&&argv[1]===COLLAB));
  // What `help` lists is the same set of command words.
  const listed=new Set(JSON.parse(runCli(['help']).stdout).commands.map(line=>line.split(' ')[0]));
  assert.deepEqual([...listed].sort(),Object.keys(COMMANDS).sort());
});

test('the record for this step holds no local path, names the gate and says what it does not establish',()=>{
  const name='.hermes/verification/guest-side-step5.json';
  const text=read(name);
  assert.doesNotMatch(text,LOCAL,name);
  const record=JSON.parse(text);
  assert.match(record.observed_at,/^2026-\d\d-\d\d$/);
  assert.match(record.base_revision,/^[0-9a-f]{40}$/);
  assert.equal(record.gate.default_run.command,'npm test');assert.equal(record.gate.default_run.exit_code,0);
  assert.equal(record.gate.with_real_starter.env_var,'XENIA_STARTER_TEST_PACKAGE');
  assert.doesNotMatch(record.gate.with_real_starter.command,/=\//,'the package path is not written down');
  for(const run of [record.gate.default_run,record.gate.with_real_starter]){
    assert.equal(run.groups.length,3);
    for(const group of run.groups){
      assert.equal(group.fail,0);assert.equal(group.tests,group.pass+group.skipped);
    }
  }
  // The files changed in this step, each by a relative path to a file that is here.
  const names=Object.keys(record.sha256);
  assert.ok(names.length>=20,`${names.length} files`);
  for(const [file,digest] of Object.entries(record.sha256)){
    assert.equal(path.isAbsolute(file),false,file);assert.match(digest,/^[0-9a-f]{64}$/,file);
    assert.ok(fs.existsSync(path.join(root,file)),file);
  }
  assert.equal(Object.hasOwn(record.sha256,name),false,'the record is not in its own map');
  for(const expected of ['agent-first/0.1/schema.mjs','agent-first/0.1/session.mjs','agent-first/0.1/adapters/agenttool-collab/card.json','agent-first/0.1/LINEAGE.md','tests/agent-first-one-door.test.mjs']){
    assert.ok(names.includes(expected),expected);
  }
  assert.ok(Array.isArray(record.not_established)&&record.not_established.length>=8);
  for(const about of [/real bundle/,/not_applied|observed/,/Bun/,/deadline/,/caller|who/])assert.ok(record.not_established.some(line=>about.test(line)),String(about));
  // The sizes it gives for the door are within the bounds the test above holds.
  assert.ok(record.sizes.arrive_bytes<ARRIVE_LIMIT_BYTES);assert.ok(record.sizes.catalog_bytes<=CATALOG_LIMIT_BYTES);
  assert.ok(record.sizes.session_start_bytes_with_adapter<=SESSION_LIMITS.session_start_bytes);
});
