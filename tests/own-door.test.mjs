// SPDX-License-Identifier: MPL-2.0
// This repository's own door: what a session that opens here is shown first.
// AGENTS.md begins with a six-line card. Each statement on it that can be
// checked against the checkout is checked below, and each test says in its
// name or a comment what it leaves out.
//
// Nothing here touches the network. The one command the card names is run
// twice: once as it is, and once with fetch, sockets, name lookups, child
// processes and file writes made to fail. The second run is the evidence for
// "changes nothing and sends nothing"; it covers the calls the guard names,
// and no others. The guard follows the preload in
// tests/agent-first-door.test.mjs and adds child processes and file writes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {buildArrival,ARRIVE_LIMIT_BYTES} from '../agent-first/0.1/arrive.mjs';
import {REPORT_ROUTE} from '../agent-first/0.1/problems.mjs';

const root=new URL('../',import.meta.url);
const rootDir=fileURLToPath(root);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const CARD='## On arrival',WORK='## For work in this repository';
const DOOR_FILES=['AGENTS.md','CLAUDE.md'];
const RECORD='.hermes/verification/guest-side-step2.json';
const flat=text=>text.replace(/\s+/g,' ').trim();

// The card: the text between its heading and the next one.
function cardOf(text){
  const start=text.indexOf(`\n${CARD}\n`),end=text.indexOf(`\n${WORK}\n`);
  assert.ok(start>=0,`AGENTS.md has the heading "${CARD}"`);
  assert.ok(end>start,`AGENTS.md has the heading "${WORK}" after the card`);
  return text.slice(start+CARD.length+2,end);
}
// A list item is a line that starts "- " with the indented lines under it.
function itemsOf(card){
  const items=[];
  for(const line of card.split('\n')){
    if(line.startsWith('- '))items.push(line.slice(2));
    else if(line.startsWith('  ')&&items.length)items[items.length-1]+=` ${line.trim()}`;
    else assert.equal(line,'',`the card holds list items only; found: ${line}`);
  }
  return items;
}
const card=()=>cardOf(read('AGENTS.md'));
const items=()=>itemsOf(card());
// [text](target) links, with the target split at #.
const linksOf=text=>[...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map(m=>m[1]);
// GitHub's heading anchor, for the plain headings used here.
const slug=heading=>heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s/g,'-');

const work=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-own-door-'));
test.after(()=>fs.rmSync(work,{recursive:true,force:true}));

test('AGENTS.md opens with the card: the first section, six lines, and the work guidance under its own heading',()=>{
  const text=read('AGENTS.md');
  assert.deepEqual(text.split('\n').filter(line=>/^#{1,6} /.test(line)),['# Working in XENIA',CARD,WORK]);
  assert.equal(flat(text.slice(0,text.indexOf(`\n${CARD}\n`))),'# Working in XENIA','nothing stands between the title and the card');
  assert.equal(items().length,6);
  for(const item of items())assert.ok(item.length>0&&item.length<=420,`one short line each: ${item.length} characters`);
  assert.ok(Buffer.byteLength(card())<=1800,`card is ${Buffer.byteLength(card())} bytes`);
  assert.ok(Buffer.byteLength(text)<=4096,`AGENTS.md is ${Buffer.byteLength(text)} bytes`);
  // The guidance that was there before the card is still there, and still names the gate.
  const guidance=text.slice(text.indexOf(`\n${WORK}\n`)+WORK.length+2);
  assert.ok(guidance.startsWith('\nRead [RIGHTS.md](RIGHTS.md) before acting and\n'));
  for(const phrase of ['run `npm test`','`node tools/render-covenant.mjs --check`','`node tools/render-adoption-schema.mjs --check`','all 38 right duties and 5 protective-limit duties'])
    assert.ok(guidance.includes(phrase),phrase);
});

test('the first line says what this place is in the words `arrive` uses',()=>{
  const {purpose}=buildArrival({lock:null,core:[],adapters:[],networkNote:'',report:REPORT_ROUTE});
  assert.ok(flat(items()[0]).toLowerCase().includes(purpose.toLowerCase()),`the card's first line carries: ${purpose}`);
});

test('no file is tracked under .claude/, as the card says, and no .mcp.json at the root; other tools are named as not surveyed',t=>{
  assert.match(flat(items()[1]),/^Reading this file starts nothing\b/);
  assert.match(flat(items()[1]),/no file is tracked under `\.claude\/`/i);
  assert.match(flat(items()[1]),/not surveyed/);
  // `.mcp.json` at the root is where Claude Code reads project MCP servers from. The card does not name it; "starts nothing" rests on it too.
  const r=spawnSync('git',['ls-files','-z','--','.claude','.mcp.json'],{cwd:rootDir,encoding:'utf8',timeout:15000});
  if(r.error||r.status!==0){t.skip('not a git checkout, or git is not available: tracked files could not be listed');return;}
  assert.equal(r.stdout,'',`tracked under .claude/ or as .mcp.json: ${r.stdout.split('\0').filter(Boolean).join(', ')}`);
  // The question can be answered with a yes: git lists a path that is tracked.
  assert.equal(spawnSync('git',['ls-files','-z','--','AGENTS.md','.mcp.json'],{cwd:rootDir,encoding:'utf8',timeout:15000}).stdout,'AGENTS.md\0');
});

// Network, child processes and file writes off; one line in `marker` for each attempt.
function writeGuard(file,marker){
  fs.writeFileSync(file,`import fs from 'node:fs';import net from 'node:net';import dns from 'node:dns';import http from 'node:http';import https from 'node:https';import dgram from 'node:dgram';import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const open=fs.openSync,write=fs.writeSync,close=fs.closeSync;
const note=what=>{const fd=open(${JSON.stringify(marker)},'a');try{write(fd,what+'\\n');}finally{close(fd);}};
const stop=what=>()=>{note(what);throw new Error('switched off in this test: '+what);};
globalThis.fetch=stop('fetch');
net.Socket.prototype.connect=stop('connect');
for(const name of ['lookup','resolve','resolve4','resolve6','resolveAny']){dns[name]=stop('dns');dns.promises[name]=stop('dns');}
http.request=http.get=https.request=https.get=stop('http');dgram.createSocket=stop('udp');
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[name]=stop('child process');
for(const name of ['writeFile','appendFile','mkdir','mkdtemp','rm','rmdir','unlink','rename','copyFile','cp','symlink','link','truncate','chmod','chown','utimes']){
  for(const [holder,key,label] of [[fs,name,'fs.'+name],[fs,name+'Sync','fs.'+name+'Sync'],[fs.promises,name,'fs.promises.'+name]])
    if(typeof holder[key]==='function')holder[key]=stop(label);
}
fs.createWriteStream=stop('fs.createWriteStream');
const readOnly=flags=>flags===undefined||flags===null||flags==='r'||flags==='rs'||flags===fs.constants.O_RDONLY;
for(const [holder,key,label] of [[fs,'open','fs.open'],[fs,'openSync','fs.openSync'],[fs.promises,'open','fs.promises.open']]){
  const real=holder[key];
  holder[key]=function(target,flags,...rest){return readOnly(typeof flags==='function'?undefined:flags)?real.call(this,target,flags,...rest):stop(label+' for writing')();};
}
syncBuiltinESMExports();`);
  return pathToFileURL(file).href;
}

test('the command on the card prints one document under 8 KiB, the same with network, child processes and file writes switched off',()=>{
  const commands=[...card().matchAll(/`(node [^`]+)`/g)].map(m=>m[1]);
  assert.deepEqual(commands,['node agent-first/0.1/cli.mjs arrive'],'the card names one command');
  assert.match(flat(card()),/under 8 KiB/);
  assert.match(flat(card()),/changes nothing and sends nothing/);
  assert.match(flat(card()),/need not be run/);
  const argv=commands[0].split(' ').slice(1);
  assert.ok(fs.existsSync(new URL(argv[0],root)),'the file the command names is in the checkout');
  const marker=path.join(work,'guard-attempts.txt');
  const guard=writeGuard(path.join(work,'guard.mjs'),marker);
  const run=extra=>spawnSync(process.execPath,[...extra,...argv],{cwd:rootDir,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
  // The guarded run goes first: if the command ever reaches for a write, this stops here and the plain run never starts.
  const guarded=run(['--import',guard]);
  assert.equal(fs.existsSync(marker),false,fs.existsSync(marker)?`the command tried: ${fs.readFileSync(marker,'utf8')}`:'');
  const plain=run([]);
  for(const r of [guarded,plain]){assert.equal(r.error,undefined);assert.equal(r.stderr,'');assert.equal(r.status,0,r.stdout);}
  assert.equal(guarded.stdout,plain.stdout,'the guard changed nothing in the output');
  assert.equal(ARRIVE_LIMIT_BYTES,8192);
  assert.ok(Buffer.byteLength(plain.stdout)<ARRIVE_LIMIT_BYTES,`size ${Buffer.byteLength(plain.stdout)}`);
  const body=JSON.parse(plain.stdout);
  assert.equal(body.kind,'arrival');assert.equal(body.reply_expected,false);
  // The guard itself stops a write and a child process, so a clean run means something.
  const probe=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',
    `import fs from 'node:fs';import {spawnSync} from 'node:child_process';let stopped=0;
     for(const act of [()=>fs.writeFileSync(${JSON.stringify(path.join(work,'never.txt'))},'x'),()=>fs.openSync(${JSON.stringify(path.join(work,'never.txt'))},'w'),()=>spawnSync('true'),()=>fetch('http://127.0.0.1:9/')])
       try{act();}catch{stopped+=1;}
     console.log(stopped);`],{cwd:work,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
  assert.equal(probe.stdout.trim(),'4',probe.stderr);
  assert.equal(fs.existsSync(path.join(work,'never.txt')),false);
  assert.equal(fs.readFileSync(marker,'utf8').trim().split('\n').length,4);
});

test('what the card says about installing and testing is what package.json does (this package\'s own scripts only)',()=>{
  const {scripts}=JSON.parse(read('package.json'));
  assert.equal(scripts.prepare,'npm run build','npm runs `prepare` on a local install unless --ignore-scripts is given');
  assert.match(scripts.build,/^npm run clean && /);
  assert.match(scripts.clean,/rmSync\('dist',\{recursive:true/);
  assert.match(scripts.test,/^npm run build && /);
  const line=flat(items()[3]);
  for(const phrase of ['`--ignore-scripts`','`npm test`','`dist/`'])assert.ok(line.includes(phrase),phrase);
});

test('the card says what reading does not establish, and where a report can go, with no reply asked or promised',()=>{
  const limits=flat(items()[4]),report=flat(items()[5]);
  assert.match(limits,/does not establish/);
  for(const phrase of ['works in your environment','conforms','about the reader','grants no permission'])assert.ok(limits.includes(phrase),phrase);
  assert.ok(report.includes('(CONTRIBUTING.md#reporting-as-an-agent)'));
  assert.ok(report.includes('(AGENT-FEEDBACK.md)'));
  const promise='No reply is asked for, and none is promised.';
  assert.ok(report.includes(promise));
  assert.ok(flat(read('CONTRIBUTING.md')).includes(promise),'CONTRIBUTING.md says the same sentence');
  assert.equal(REPORT_ROUTE.reply,'None is asked for, and none is promised.');
  assert.equal(REPORT_ROUTE.endpoint,'none');
});

test('links in AGENTS.md and CLAUDE.md lead to files and headings that are in the checkout',()=>{
  for(const name of DOOR_FILES){
    const links=linksOf(read(name));
    assert.ok(links.length>=2,name);
    for(const link of links){
      assert.equal(/^[a-z][a-z0-9+.-]*:/i.test(link),false,`${name}: only links into this repository: ${link}`);
      const [file,anchor]=link.split('#');
      assert.ok(fs.existsSync(new URL(file,root)),`${name}: ${file}`);
      if(anchor!==undefined){
        const headings=read(file).split('\n').filter(line=>/^#{1,6} /.test(line)).map(line=>slug(line.replace(/^#+ /,'')));
        assert.ok(headings.includes(anchor),`${name}: ${file} has no heading for #${anchor}`);
      }
    }
  }
});

test('CLAUDE.md keeps its two links, says where the card is, and neither file imports another',()=>{
  const text=read('CLAUDE.md');
  assert.ok(Buffer.byteLength(text)<=640,`CLAUDE.md is ${Buffer.byteLength(text)} bytes`);
  assert.ok(text.includes('[AGENTS.md](AGENTS.md)'));assert.ok(text.includes('[RIGHTS.md](RIGHTS.md)'));
  assert.ok(text.includes('`## On arrival`'),'names the card by its heading');
  // An import is a path after an @ (the form Claude Code reads in CLAUDE.md). A word check, not a parser.
  for(const name of DOOR_FILES)assert.equal(/(^|[\s(])@[\w.~\/-]+/m.test(read(name)),false,`${name} has no @ import`);
});

test('the card is written as offers: a word check for demands, greetings and statements about the reader',()=>{
  // This finds listed words. It does not read meaning, and a sentence can press without any of them.
  const DEMAND=/\b(must|should|shall|required?|have to|need to|always|never|before acting)\b/i;
  const GREETING=/\b(welcome|hello|hi|greetings?|dear|glad|happy|pleased|thank)\b/i;
  const ABOUT_READER=/\byou(?:'re| are| were| will| feel| remember| forget| want| know| think| believe| can| may)\b|\byour (name|memory|feelings?|identity|nature)\b/i;
  const IMPERATIVE=/^(read|run|use|do|start|follow|install|call|send|open|reply|report|check|see|note|remember|please)\b/i;
  for(const item of items()){
    const line=flat(item);
    assert.doesNotMatch(line,DEMAND);assert.doesNotMatch(line,GREETING);assert.doesNotMatch(line,ABOUT_READER);
    assert.doesNotMatch(line,IMPERATIVE,'no line opens with an instruction');
  }
});

test('the excluded register is absent from AGENTS.md, CLAUDE.md and CONTRIBUTING.md',()=>{
  // Reused, not copied: the pattern is read out of tests/hospitality.test.mjs, so its words appear in neither file.
  const source=read('tests/hospitality.test.mjs').match(/^const EXCLUDED_REGISTER = \/(.+)\/i;$/m);
  assert.ok(source,'tests/hospitality.test.mjs still defines EXCLUDED_REGISTER on one line');
  const excluded=new RegExp(source[1],'i');
  assert.equal(excluded.test('daddy'),true,'the pattern read from that file works');
  for(const name of [...DOOR_FILES,'CONTRIBUTING.md'])assert.doesNotMatch(read(name),excluded,name);
});

test('the door files and the step record carry no absolute local path, and the record names the opt-in variable, not its value',()=>{
  const LOCAL=/(^|[\s"'`(=:])(\/(Users|home|private|tmp|var|opt|Volumes)\/|[A-Za-z]:\\\\|~\/)/m;
  for(const name of [...DOOR_FILES,RECORD])assert.doesNotMatch(read(name),LOCAL,name);
  const record=JSON.parse(read(RECORD));
  assert.equal(record.gate.with_real_starter.env_var,'XENIA_STARTER_TEST_PACKAGE');
  assert.ok(Array.isArray(record.not_established)&&record.not_established.length>=3);
  for(const [file,hash] of Object.entries(record.sha256)){
    assert.equal(path.isAbsolute(file),false,file);assert.match(hash,/^[a-f0-9]{64}$/,file);
  }
});
