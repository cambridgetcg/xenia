// SPDX-License-Identifier: MPL-2.0
// `feedback new` and `feedback check`: a blank entry in the form
// AGENT-FEEDBACK.md describes, and a line-by-line reading of a written one.
//
// Every entry here is made at run time, with one exception: the 2026-07-11
// entry is cut out of AGENT-FEEDBACK.md when the test runs. It is not changed,
// and only its field labels and section headings are named in this file, to
// say why each `not_found_by_label` it gets is true.
//
// Nothing here touches the network: in this process the real fetch is replaced
// by one that counts and throws, and every CLI child runs with fetch, sockets
// and name lookups made to fail. A last test checks that neither was tripped.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';

const kit=new URL('../agent-first/0.1/',import.meta.url);
const kitDir=fileURLToPath(kit),repo=fileURLToPath(new URL('../',import.meta.url));
const cli=path.join(kitDir,'cli.mjs');
const {feedbackNew,feedbackCheck,runFeedbackCommand,blankEntry,PARTS,WARNING_KINDS,INPUT_LIMIT_BYTES,SCAN_LINE_LIMIT,ROW_LIMIT}=await import(new URL('feedback.mjs',kit).href);
const {EXIT_CODES,REPORT_ROUTE,REPOSITORY,PROBLEM_CODES,USAGE_CODES,buildProblem,checkArgv,exitOf}=await import(new URL('problems.mjs',kit).href);

let realFetchCalls=0;
globalThis.fetch=()=>{realFetchCalls+=1;throw new Error('the real fetch must not be used in this test file');};

const work=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-feedback-'));
test.after(()=>fs.rmSync(work,{recursive:true,force:true}));
// A preload that turns the network off, and writes one line for each attempt
// (the same switch-off as tests/agent-first-door.test.mjs).
const offMarker=path.join(work,'off-attempts.txt');
const noNetwork=(()=>{
  const file=path.join(work,'no-network.mjs');
  fs.writeFileSync(file,`import fs from 'node:fs';import net from 'node:net';import dns from 'node:dns';import http from 'node:http';import https from 'node:https';import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
const stop=what=>()=>{fs.appendFileSync(${JSON.stringify(offMarker)},what+'\\n');throw new Error('network is off in this test: '+what);};
net.Socket.prototype.connect=stop('connect');globalThis.fetch=stop('fetch');
for(const name of ['lookup','resolve','resolve4','resolve6','resolveAny']){dns[name]=stop('dns');dns.promises[name]=stop('dns');}
http.request=http.get=https.request=https.get=stop('http');dgram.createSocket=stop('udp');
syncBuiltinESMExports();`);
  return pathToFileURL(file).href;
})();
// A preload that writes one line each time the clock is read through the
// global Date, process.hrtime or performance.now.
const clockMarker=path.join(work,'clock-reads.txt');
const watchClock=(()=>{
  const file=path.join(work,'watch-clock.mjs');
  fs.writeFileSync(file,`import fs from 'node:fs';
const note=what=>fs.appendFileSync(${JSON.stringify(clockMarker)},what+'\\n');
const Real=Date;
globalThis.Date=new Proxy(Real,{
  construct(target,args,newTarget){if(args.length===0)note('new Date()');return Reflect.construct(target,args,newTarget);},
  apply(target,self,args){note('Date()');return Reflect.apply(target,self,args);},
  get(target,key,receiver){if(key==='now')return()=>{note('Date.now');return target.now();};return Reflect.get(target,key,receiver);},
});
const hrtime=process.hrtime;
process.hrtime=Object.assign((...args)=>{note('hrtime');return hrtime(...args);},{bigint:()=>{note('hrtime.bigint');return hrtime.bigint();}});
const now=performance.now.bind(performance);
performance.now=()=>{note('performance.now');return now();};`);
  return pathToFileURL(file).href;
})();

const NEW_KEYS=['schema','kind','scope','not_established','notebook_requires_this_form','written_to_file','entry','parts_note','parts','next','delivered','route',
  'exit_code','exit_reason','exit_meaning'];
const CHECK_KEYS=['schema','kind','scope','not_established','notebook_requires_this_form','input','entry','finding','parts','bullets','warnings','entry_id_in_notebook',
  'delivered','route','exit_code','exit_reason','exit_meaning'];
const NEEDED=['dated_heading','entry_id','observed_at','speaker','status','filled_section'];
const FIELDS=['Entry ID','Observed at','Speaker','Identity proof','Source snapshots','Network vantage','Reply path','Status'];
const SECTIONS=['How I arrived and what I could inspect','Actions taken','What reduced friction','What increased friction','Observed','Inferred','Declared by the subject','Unknown',
  'What I would keep','What I would change'];
const ID='xenia-feedback-20261113-fixture-001';
// What a test plants in each field and section. None of it may come back out.
const FIELD_TEXT=Object.fromEntries(FIELDS.map((label,i)=>[label,`PLANT-field-${i} says something`]));
Object.assign(FIELD_TEXT,{'Entry ID':`\`${ID}\``,'Observed at':'2026-11-13, PLANT-place','Status':'open'});
const SECTION_TEXT=Object.fromEntries(SECTIONS.map((title,i)=>[title,`PLANT-section-${i} says something.`]));

// A written entry, made from the blank one: the template and the reader are tested against each other.
function fill({heading='## 2026-11-13: PLANT-writer',fields={},sections={},drop=[]}={}){
  const out=[];
  let section;
  for(const line of blankEntry().split('\n')){
    const field=/^- \*\*(.+?):\*\* /.exec(line),head=/^### (.+)$/.exec(line);
    if(line.startsWith('## ')){if(heading!==null)out.push(heading);}
    else if(field){if(!drop.includes(field[1]))out.push(`- **${field[1]}:** ${fields[field[1]]??FIELD_TEXT[field[1]]}`);}
    else if(head){section=head[1];out.push(line);}
    else if(section&&line.startsWith('<!--'))out.push(sections[section]??SECTION_TEXT[section]);
    else out.push(line);
  }
  return out.join('\n');
}
const put=(name,value)=>{const file=path.join(work,name);fs.writeFileSync(file,value);return file;};
function runCli(args,options={}){
  const {preload=[],...rest}=options;
  const r=spawnSync(process.execPath,['--import',noNetwork,...preload.flatMap(url=>['--import',url]),cli,...args],{cwd:work,encoding:'utf8',timeout:30000,env:{PATH:process.env.PATH},...rest});
  assert.equal(r.error,undefined);assert.equal(r.stderr,'',r.stderr);
  return {status:r.status,stdout:r.stdout,value:JSON.parse(r.stdout)};
}
const check=file=>runCli(['feedback','check','--input',file]);
// The same reading without a child process. The CLI prints this body and exits with exitOf(body); two tests below compare the two.
function read(file){
  const body=feedbackCheck({file});
  const stdout=JSON.stringify(body,null,2);
  return {status:exitOf(body),stdout,value:JSON.parse(stdout)};
}
const labelStates=body=>Object.fromEntries(body.bullets.rows.map(row=>[row.bullet,Object.fromEntries(row.labels.map(item=>[item.label,item.state]))]));
const sha=value=>createHash('sha256').update(value).digest('hex');
// A copy of the kit alone, with no node_modules above it; optionally with a notebook beside it.
function kitCopy({notebook}={}){
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'xenia-feedback-copy-')));
  fs.cpSync(kitDir,path.join(home,'agent-first','0.1'),{recursive:true});
  if(notebook!==undefined)fs.writeFileSync(path.join(home,'AGENT-FEEDBACK.md'),notebook);
  const run=argv=>{
    const r=spawnSync(process.execPath,['--import',noNetwork,path.join(home,'agent-first','0.1','cli.mjs'),...argv],{cwd:home,encoding:'utf8',timeout:20000,env:{PATH:'',HOME:home,TMPDIR:home}});
    assert.equal(r.stderr,'',r.stderr);assert.equal(r.stdout.includes(home),false,'no local path in the output');
    return {status:r.status,value:JSON.parse(r.stdout)};
  };
  return {home,run,remove:()=>fs.rmSync(home,{recursive:true,force:true})};
}

// ---- the notebook itself ----
const notebook=fs.readFileSync(path.join(repo,'AGENT-FEEDBACK.md'),'utf8');
// The list under "When adding an entry, say:", one string for each bullet.
function notebookBullets(){
  const lines=notebook.slice(notebook.indexOf('When adding an entry, say:')).split('\n').slice(1);
  const bullets=[];
  for(const line of lines){
    if(line.startsWith('- '))bullets.push(line.slice(2).trim());
    else if(/^\s+\S/.test(line)&&bullets.length)bullets[bullets.length-1]+=` ${line.trim()}`;
    else if(bullets.length)break;
  }
  return bullets.map(text=>text.replace(/[;.]$/,''));
}
// The 2026-07-11 entry: from its heading to the next level-two heading, or the end of the file.
function existingEntry(){
  const lines=notebook.split('\n'),start=lines.findIndex(line=>line.startsWith('## 2026-07-11: '));
  assert.ok(start>=0,'the 2026-07-11 entry is in the notebook');
  let end=lines.findIndex((line,i)=>i>start&&/^#{1,2} /.test(line));
  if(end<0)end=lines.length;
  return lines.slice(start,end).join('\n');
}

test('feedback new prints a blank entry: every field and section, no date, no clock, nothing written',()=>{
  const before=fs.readdirSync(work).sort();
  const r=runCli(['feedback','new']);
  assert.equal(r.status,0,r.stdout);
  const body=r.value;
  assert.deepEqual(Object.keys(body),NEW_KEYS);
  assert.equal(body.schema,'xenia.agent-first/0.1-development');assert.equal(body.kind,'feedback-blank-entry');
  assert.equal(body.notebook_requires_this_form,false);assert.equal(body.written_to_file,false);assert.equal(body.delivered,false);
  assert.match(body.scope,/wrote nothing/);assert.match(body.scope,/sent nothing/);assert.match(body.scope,/no clock/);
  assert.ok(body.not_established.some(line=>/does not/.test(line)&&/require/.test(line)));
  assert.ok(body.not_established.some(line=>/read, merged or answered/.test(line)));
  assert.ok(body.not_established.some(line=>/whoever ran this command/.test(line)));
  const text=body.entry.text;
  assert.equal(text,blankEntry());
  assert.deepEqual(Object.keys(body.entry),['media_type','bytes','sha256','text']);
  assert.equal(body.entry.bytes,Buffer.byteLength(text));assert.equal(body.entry.sha256,sha(text));
  assert.ok(text.endsWith('\n'));assert.equal(text.includes('\r'),false);
  // The heading, the eight fields and the ten sections, in the order the design gives.
  const lines=text.split('\n');
  assert.deepEqual(lines.filter(line=>line.startsWith('## ')).map(line=>line.slice(0,17)),['## YYYY-MM-DD: <!']);
  assert.deepEqual(lines.filter(line=>line.startsWith('- **')).map(line=>/^- \*\*(.+?):\*\*/.exec(line)[1]),FIELDS);
  assert.deepEqual(lines.filter(line=>line.startsWith('### ')).map(line=>line.slice(4)),SECTIONS);
  // No clock was read, so no date is filled in.
  assert.doesNotMatch(text,/\b\d{4}-\d{2}-\d{2}\b/);assert.doesNotMatch(text,/\b20\d{6}\b/);
  assert.equal(runCli(['feedback','new']).stdout,r.stdout,'two runs print the same bytes');
  // Every part is listed with what it asks for, and which notebook bullet it answers.
  assert.deepEqual(body.parts,PARTS.map(part=>({...part})));
  assert.deepEqual(body.parts.filter(part=>part.kind==='field').map(part=>part.label),FIELDS);
  assert.deepEqual(body.parts.filter(part=>part.kind==='section').map(part=>part.label),SECTIONS);
  assert.deepEqual(body.parts.filter(part=>part.needed_for_exit_0).map(part=>part.label).slice(1),['Entry ID','Observed at','Speaker','Status']);
  assert.equal(body.parts[0].kind,'heading');assert.equal(body.parts[0].needed_for_exit_0,true);
  for(const part of body.parts)assert.ok(text.includes(part.asks)||part.label==='Status',`${part.label}: its hint is in the entry`);
  assert.match(body.parts_note,/one section/);
  assert.deepEqual(body.next.map(item=>[item.argv,item.needs]),[[['feedback','check'],['--input <file>']]]);
  for(const item of body.next)assert.deepEqual(checkArgv(item.argv,item.needs),{ok:true});
  assert.deepEqual(body.route,JSON.parse(JSON.stringify(REPORT_ROUTE)));
  assert.equal(body.exit_code,0);assert.equal(body.exit_meaning,EXIT_CODES[0]);assert.match(body.exit_reason,/[Nn]othing was written or sent/);
  assert.equal(r.stdout.includes(work),false);assert.equal(r.stdout.includes(repo),false);
  assert.deepEqual(fs.readdirSync(work).sort(),before,'nothing was created');
  // In process: the same body, and it carries its own exit.
  const direct=feedbackNew();
  assert.deepEqual(JSON.parse(JSON.stringify(direct)),body);assert.equal(exitOf(direct),0);
});

test('neither command reads a clock; the same watch catches a command that does',()=>{
  const entry=put('clock-entry.md',fill());
  const source=fs.readFileSync(new URL('feedback.mjs',kit),'utf8');
  assert.doesNotMatch(source,/\bDate\b|performance|hrtime|setTimeout|setInterval/);
  for(const args of [['feedback','new'],['feedback','new','--out',path.join(work,'clock-out.md')],['feedback','check','--input',entry],['help','feedback']]){
    const r=runCli(args,{preload:[watchClock]});
    assert.equal(r.status,0,r.stdout);
    assert.equal(fs.existsSync(clockMarker),false,`${args.slice(0,2).join(' ')} read the clock: ${fs.existsSync(clockMarker)?fs.readFileSync(clockMarker,'utf8'):''}`);
  }
  // `door rights` without --as-of reads the clock, so the watch can fail.
  const draft=put('clock-record.json','{"schema_version":"xenia.covenant.adoption/0.1"}');
  runCli(['door','rights','--input',draft],{preload:[watchClock]});
  assert.match(fs.readFileSync(clockMarker,'utf8'),/new Date\(\)/);
});

test('the blank entry itself is not a written one: exit 3, every label there and empty',()=>{
  const file=put('blank.md',blankEntry());
  const r=check(file);
  assert.equal(r.status,3,r.stdout);
  const body=r.value;
  assert.deepEqual(Object.keys(body),CHECK_KEYS);
  assert.equal(body.finding.word,'parts_missing');
  assert.deepEqual(body.finding.missing,['dated_heading','entry_id','observed_at','speaker','filled_section']);
  assert.deepEqual(Object.keys(body.parts),NEEDED);
  assert.equal(body.parts.dated_heading.state,'not_found');
  assert.equal(body.parts.entry_id.state,'empty');assert.equal(body.parts.observed_at.state,'empty');assert.equal(body.parts.speaker.state,'empty');
  assert.deepEqual({state:body.parts.status.state,word:body.parts.status.word},{state:'found',word:'open'});
  assert.deepEqual({state:body.parts.filled_section.state,sections:body.parts.filled_section.sections,with_text:body.parts.filled_section.with_text},{state:'not_found',sections:10,with_text:0});
  for(const row of body.bullets.rows)for(const item of row.labels)assert.equal(item.state,'empty',item.label);
  assert.ok(body.entry.comments_ignored>=18);
  assert.equal(body.warnings.count,0);
  assert.equal(body.exit_code,3);assert.equal(body.exit_meaning,EXIT_CODES[3]);
  assert.match(body.exit_reason,/dated_heading/);assert.match(body.exit_reason,/does not require/);
});

test('a written entry in this form exits 0, and the body says what that 0 covers',()=>{
  const text=fill(),file=put('filled.md',text);
  assert.equal(text.split('\n').filter(line=>line.includes('<!--')).length,1,'only the opening comment is left');
  assert.ok(text.endsWith('\n'));
  const lineCount=text.split('\n').length-1;
  const before=fs.readdirSync(work).sort();
  const r=check(file);
  assert.equal(r.status,0,r.stdout);
  const body=r.value;
  assert.deepEqual(Object.keys(body),CHECK_KEYS);
  assert.equal(body.schema,'xenia.agent-first/0.1-development');assert.equal(body.kind,'feedback-check');
  assert.match(body.scope,/five labelled parts/);assert.match(body.scope,/[Nn]othing was sent or delivered/);assert.match(body.scope,/nothing the entry says was checked/);
  assert.match(body.not_established[0],/true/);
  for(const pattern of [/delivered/,/does not/,/who wrote/,/warnings/,/Markdown/,/whoever ran this command/])assert.ok(body.not_established.some(line=>pattern.test(line)),String(pattern));
  assert.equal(body.notebook_requires_this_form,false);assert.equal(body.delivered,false);
  assert.deepEqual(body.input,{bytes:Buffer.byteLength(text),sha256:sha(text)});
  assert.deepEqual(body.entry,{lines:lineCount,dated_headings:1,first_line:3,last_line:lineCount,comments_ignored:1});
  assert.deepEqual({word:body.finding.word,missing:body.finding.missing},{word:'parts_found',missing:[]});
  assert.match(body.finding.covers,/[Nn]ot whether/);
  assert.deepEqual(body.parts.dated_heading,{state:'found',line:3,date:'2026-11-13'});
  assert.deepEqual(body.parts.entry_id,{state:'found',line:5,value:ID});
  assert.deepEqual(body.parts.observed_at,{state:'found',line:6,date:'2026-11-13'});
  assert.deepEqual(body.parts.speaker,{state:'found',line:7});
  assert.deepEqual(body.parts.status,{state:'found',line:12,word:'open'});
  assert.deepEqual(body.parts.filled_section,{state:'found',sections:10,with_text:10});
  // The eight bullets, by the labels that answer them.
  assert.equal(body.bullets.source,'AGENT-FEEDBACK.md');
  assert.match(body.bullets.note,/never change the exit/);assert.match(body.bullets.note,/does not mean/);
  assert.deepEqual(body.bullets.rows.map(row=>row.bullet),[1,2,3,4,5,6,7,8]);
  for(const row of body.bullets.rows)for(const item of row.labels){
    assert.deepEqual(Object.keys(item),['label','kind','state']);assert.equal(item.state,'found',item.label);
  }
  assert.deepEqual(body.bullets.rows.flatMap(row=>row.labels.map(item=>item.label)).sort(),
    PARTS.filter(part=>part.bullet!==null).map(part=>part.label).sort());
  assert.deepEqual(Object.keys(body.warnings),['note','looked_for','count','by_kind','rows','more']);
  assert.deepEqual(body.warnings.looked_for,[...WARNING_KINDS]);
  assert.deepEqual({count:body.warnings.count,by_kind:body.warnings.by_kind,rows:body.warnings.rows,more:body.warnings.more},{count:0,by_kind:{},rows:[],more:0});
  assert.match(body.warnings.note,/never the text/);assert.match(body.warnings.note,/not a finding that there are none/);
  assert.equal(body.entry_id_in_notebook.state,'not_found');assert.match(body.entry_id_in_notebook.means,/this checkout/);
  assert.deepEqual(body.route,JSON.parse(JSON.stringify(REPORT_ROUTE)));
  assert.equal(body.exit_code,0);assert.equal(body.exit_meaning,EXIT_CODES[0]);
  assert.match(body.exit_reason,/A 0 covers that and nothing else/);
  assert.deepEqual(fs.readdirSync(work).sort(),before,'nothing was created');
  assert.equal(fs.readFileSync(file,'utf8'),text,'the file was not changed');
  const direct=feedbackCheck({file});
  assert.deepEqual(JSON.parse(JSON.stringify(direct)),body);assert.equal(exitOf(direct),0);
});

test('nothing the entry says comes back out: only its ID, its dates and its status word',()=>{
  const r=check(put('planted.md',fill()));
  assert.equal(r.status,0);
  assert.equal(r.stdout.includes('PLANT'),false,'planted text in the output');
  assert.equal(r.stdout.includes('says something'),false);
  // A status outside the four words the notebook uses is found, and shown only as `other`.
  const odd=read(put('odd-status.md',fill({fields:{Status:'PLANT-status under review'}})));
  assert.equal(odd.status,0);assert.deepEqual({state:odd.value.parts.status.state,word:odd.value.parts.status.word},{state:'found',word:'other'});
  assert.equal(odd.stdout.includes('PLANT'),false);
  for(const word of ['open','resolved','declined','superseded'])
    assert.equal(read(put(`status-${word}.md`,fill({fields:{Status:word[0].toUpperCase()+word.slice(1)}}))).value.parts.status.word,word);
  // An Entry ID that is not in the form is not shown at all.
  const bad=check(put('odd-id.md',fill({fields:{'Entry ID':'PLANT-id-7'}})));
  assert.equal(bad.status,3);assert.equal(bad.stdout.includes('PLANT'),false);assert.deepEqual(Object.keys(bad.value.parts.entry_id),['state','line']);
});

test('the 2026-07-11 entry, cut from the notebook at run time, exits 0 with no warning; what is not found by label is said, and is true',()=>{
  const text=existingEntry(),file=put('existing-entry.md',text);
  // What the entry holds, read here without the command.
  const lines=text.split('\n');
  assert.deepEqual(lines.filter(line=>line.startsWith('- **')).map(line=>/^- \*\*(.+?):\*\*/.exec(line)[1]),
    ['Entry ID','Observed at','Speaker','Source snapshots','Identity proof','Status']);
  const headings=lines.filter(line=>line.startsWith('### ')).map(line=>line.slice(4));
  assert.deepEqual(headings.slice(0,6),['Context','What felt good','What gave me friction','What I do not know','What I would change first','In one breath']);
  const r=check(file);
  assert.equal(r.status,0,r.stdout);
  const body=r.value;
  assert.deepEqual(Object.keys(body),CHECK_KEYS);
  assert.deepEqual({word:body.finding.word,missing:body.finding.missing},{word:'parts_found',missing:[]});
  assert.deepEqual(body.parts.dated_heading,{state:'found',line:1,date:'2026-07-11'});
  assert.deepEqual(body.parts.entry_id,{state:'found',line:3,value:'xenia-feedback-20260711-zizi-codex-001'});
  assert.deepEqual(body.parts.observed_at,{state:'found',line:4,date:'2026-07-11'});
  assert.equal(body.parts.speaker.state,'found');
  assert.deepEqual({state:body.parts.status.state,word:body.parts.status.word},{state:'found',word:'open'});
  assert.equal(body.parts.filled_section.state,'found');
  assert.equal(body.parts.filled_section.sections,headings.length);assert.equal(body.parts.filled_section.with_text,headings.length);
  // No warning: the entry has none of the fixed patterns.
  assert.deepEqual({count:body.warnings.count,rows:body.warnings.rows,more:body.warnings.more},{count:0,rows:[],more:0});
  // By label. Each `not_found_by_label` below is true of this entry, and none of them is a failure:
  // - it has no `Network vantage` and no `Reply path` field;
  // - it says how it arrived under `Context`, what reduced friction under `What felt good`, what increased it
  //   under `What gave me friction`, and what it does not know under `What I do not know`: headings of its own;
  // - it has no section named for actions taken, observed, inferred, declared, or what to keep;
  // - `What I would change` is found because its heading `What I would change first` begins with that label.
  const missing='not_found_by_label';
  assert.deepEqual(labelStates(body),{
    1:{Speaker:'found','Identity proof':'found'},
    2:{'How I arrived and what I could inspect':missing},
    3:{'Source snapshots':'found','Network vantage':missing},
    4:{'Actions taken':missing},
    5:{'What reduced friction':missing,'What increased friction':missing},
    6:{Observed:missing,Inferred:missing,'Declared by the subject':missing,Unknown:missing},
    7:{'Reply path':missing},
    8:{'What I would keep':missing,'What I would change':'found'},
  });
  assert.equal(body.notebook_requires_this_form,false);
  // The ID is already in this checkout's notebook, which is where the entry came from.
  assert.equal(body.entry_id_in_notebook.state,'found');assert.match(body.entry_id_in_notebook.means,/already/);
  assert.equal(body.delivered,false);
  // None of the entry's own words are repeated. The words are taken from the entry when the test runs, not written here: every run of
  // five or more letters or digits in it, and what follows `Speaker:` up to the first comma. A word may be in the output only when the
  // command also prints it for an entry made here that has the same ID and date; that is how the output's own fixed text is set aside.
  const same=check(put('same-id-and-date.md',fill({heading:'## 2026-07-11: PLANT-writer',fields:{'Entry ID':`\`${body.parts.entry_id.value}\``,'Observed at':'2026-07-11'}})));
  assert.equal(same.status,0);assert.equal(same.value.entry_id_in_notebook.state,'found');
  const speaker=/^- \*\*Speaker:\*\* ([^,\n]+)/m.exec(text)[1];
  const words=new Set([speaker,...text.match(/[\p{L}\p{N}]{5,}/gu)]);
  assert.ok(words.size>400,`${words.size} words taken from the entry`);
  const printed=r.stdout.replace(body.input.sha256,'');
  assert.equal(printed.includes(speaker),false,'the speaker is not repeated');
  assert.deepEqual([...words].filter(word=>printed.includes(word)&&!same.stdout.includes(word)),[],'words of the entry in the output');
  assert.equal(fs.readFileSync(path.join(repo,'AGENT-FEEDBACK.md'),'utf8'),notebook,'the notebook was not changed');
});

test('each part that exit 0 needs: when it is not there, or not in the form, the exit is 3 and the part is named',()=>{
  const cases={
    no_heading:[fill({heading:null}),'dated_heading','not_found'],
    heading_without_date:[fill({heading:'## PLANT-writer, some day'}),'dated_heading','not_found'],
    heading_impossible_date:[fill({heading:'## 2026-02-30: PLANT-writer'}),'dated_heading','not_well_formed'],
    heading_level_three:[fill({heading:'### 2026-11-13: PLANT-writer'}),'dated_heading','not_found'],
    no_entry_id:[fill({drop:['Entry ID']}),'entry_id','not_found_by_label'],
    entry_id_blank:[fill({fields:{'Entry ID':''}}),'entry_id','empty'],
    entry_id_other_form:[fill({fields:{'Entry ID':'feedback-1'}}),'entry_id','not_well_formed'],
    entry_id_uppercase:[fill({fields:{'Entry ID':'xenia-feedback-20261113-Fixture-001'}}),'entry_id','not_well_formed'],
    entry_id_impossible_date:[fill({fields:{'Entry ID':'xenia-feedback-20261340-fixture-001'}}),'entry_id','not_well_formed'],
    entry_id_two_digits:[fill({fields:{'Entry ID':'xenia-feedback-20261113-fixture-01'}}),'entry_id','not_well_formed'],
    entry_id_too_long:[fill({fields:{'Entry ID':`xenia-feedback-20261113-${'a'.repeat(120)}-001`}}),'entry_id','not_well_formed'],
    no_observed_at:[fill({drop:['Observed at']}),'observed_at','not_found_by_label'],
    observed_at_in_words:[fill({fields:{'Observed at':'yesterday afternoon'}}),'observed_at','not_well_formed'],
    observed_at_date_last:[fill({fields:{'Observed at':'Zurich, 2026-11-13'}}),'observed_at','not_well_formed'],
    observed_at_impossible:[fill({fields:{'Observed at':'2025-02-29'}}),'observed_at','not_well_formed'],
    no_speaker:[fill({drop:['Speaker']}),'speaker','not_found_by_label'],
    speaker_only_a_comment:[fill({fields:{Speaker:'<!-- who is speaking -->'}}),'speaker','empty'],
    no_status:[fill({drop:['Status']}),'status','not_found_by_label'],
    status_blank:[fill({fields:{Status:''}}),'status','empty'],
    no_section_with_text:[fill({sections:Object.fromEntries(SECTIONS.map(title=>[title,'<!-- nothing yet -->']))}),'filled_section','not_found'],
  };
  for(const [name,[text,part,state]] of Object.entries(cases)){
    const r=read(put(`missing-${name}.md`,text));
    assert.equal(r.status,3,`${name}: ${r.stdout}`);
    assert.deepEqual(Object.keys(r.value),CHECK_KEYS,name);
    assert.equal(r.value.finding.word,'parts_missing',name);assert.deepEqual(r.value.finding.missing,[part],name);
    assert.equal(r.value.parts[part].state,state,name);
    assert.match(r.value.exit_reason,new RegExp(part),name);assert.equal(r.value.exit_code,3,name);
    assert.equal(r.stdout.includes('PLANT'),false,name);
  }
  // Through the CLI the body and the exit are the same as in process.
  const viaCli=check(path.join(work,'missing-entry_id_other_form.md'));
  assert.equal(viaCli.status,3);assert.deepEqual(viaCli.value,read(path.join(work,'missing-entry_id_other_form.md')).value);
  // A leap day that exists is a date.
  assert.equal(read(put('leap.md',fill({heading:'## 2028-02-29: someone',fields:{'Observed at':'2028-02-29',"Entry ID":'xenia-feedback-20280229-leap-001'}}))).status,0);
  // An empty file, and a file that is not an entry at all, are read and found to hold none of the parts.
  for(const text of ['','just a line of prose\n','{"schema_version":"xenia.covenant.adoption/0.1"}']){
    const r=read(put('not-an-entry.md',text));
    assert.equal(r.status,3);assert.deepEqual(r.value.finding.missing,NEEDED);
    assert.deepEqual(r.value.entry,{lines:text?1:0,dated_headings:0,first_line:text?1:null,last_line:text?1:null,comments_ignored:0});
  }
  assert.equal(check(put('empty.md','')).status,3);
});

test('a file with more than one dated heading is not read as an entry: exit 4, and no part is reported',()=>{
  const two=`${fill()}\n${fill({heading:'## 2026-11-14: another'})}`;
  const r=check(put('two-entries.md',two));
  assert.equal(r.status,4,r.stdout);
  const body=r.value;
  assert.deepEqual(Object.keys(body),CHECK_KEYS);
  assert.deepEqual({word:body.finding.word,reason:body.finding.reason,missing:body.finding.missing},{word:'undetermined',reason:'more_than_one_dated_heading',missing:[]});
  assert.equal(body.entry.dated_headings,2);assert.equal(body.entry.first_line,null);assert.equal(body.entry.last_line,null);
  for(const key of NEEDED)assert.deepEqual(body.parts[key],{state:'not_read'},key);
  for(const row of body.bullets.rows)for(const item of row.labels)assert.equal(item.state,'not_read');
  assert.deepEqual({state:body.entry_id_in_notebook.state,reason:body.entry_id_in_notebook.reason},{state:'not_checked',reason:'entry_not_read'});
  assert.equal(body.exit_code,4);assert.equal(body.exit_meaning,EXIT_CODES[4]);assert.match(body.exit_reason,/2 dated headings/);
  assert.equal(r.stdout.includes('PLANT'),false);
});

test('reasonable variations are read: other bullets and bold forms, label case, three line endings, wrapped values, a list under a label, text around the entry, code fences',()=>{
  const entry=[
    '# A title above the entry','','Some prose before it.','',
    '## 2026-11-13: someone',
    '',
    '* **entry id**: xenia-feedback-20261113-variation-002',
    '+ **OBSERVED AT:**   2026-11-13T09:00:00Z',
    '- **Speaker:**',
    '  a wrapped value on the next line',
    '- **Source snapshots:**',
    '  - one snapshot',
    '  * another',
    '- **Network vantage:**',
    '- an item beside it, not under it',
    '-   **Status**: Resolved',
    '',
    '### What I would change first',
    '',
    '```sh',
    '# a shell comment, not a heading',
    '## 2026-01-01: not a second entry',
    '### Observed',
    '- **Reply path:** not a field',
    '```',
    '',
    '### observed, live',
    '',
    'Something.',
    '',
    '### Unknowns',
    '',
    'Not the Unknown label: the heading goes on with a letter.',
    '',
    '## Another section at level two',
    '',
    '### Inferred',
    '',
    'After the entry ended, so not part of it.',
    '',
  ];
  for(const eol of ['\n','\r\n','\r']){
    const r=(eol==='\n'?check:read)(put('variations.md',entry.join(eol)));
    assert.equal(r.status,0,r.stdout);
    const body=r.value;
    assert.deepEqual(body.entry,{lines:entry.length-1,dated_headings:1,first_line:5,last_line:34,comments_ignored:0});
    assert.deepEqual(body.parts.entry_id,{state:'found',line:7,value:'xenia-feedback-20261113-variation-002'});
    assert.deepEqual(body.parts.observed_at,{state:'found',line:8,date:'2026-11-13'});
    assert.deepEqual(body.parts.speaker,{state:'found',line:9});
    assert.deepEqual(body.parts.status,{state:'found',line:16,word:'resolved'});
    assert.deepEqual(body.parts.filled_section,{state:'found',sections:3,with_text:3});
    const states=labelStates(body);
    assert.equal(states[3]['Source snapshots'],'found','a list under a label, indented further than it, is its value');
    assert.equal(states[3]['Network vantage'],'empty','a list item beside a label is not its value');
    assert.equal(states[8]['What I would change'],'found','a heading that begins with the label');
    assert.equal(states[6].Observed,'found','case does not matter, and the heading may go on after the label');
    assert.equal(states[6].Unknown,'not_found_by_label','a longer word is not the label');
    assert.equal(states[6].Inferred,'not_found_by_label','a section after the entry ended is not read');
    assert.equal(states[7]['Reply path'],'not_found_by_label','a field inside a code fence is not read');
    assert.equal(body.warnings.count,0);
  }
});

test('warnings give a kind and a line, never the text, and never change the exit',()=>{
  // Built at run time, so that no line of this file has the shape of a credential.
  const samples={
    private_key_block:'-----BEGIN '+'OPENSSH PRIVATE KEY-----',
    aws_access_key_id:'key AKIA'+'ABCDEFGHIJKLMNOP was shown',
    github_token:'gh'+'p_'+'a1B2'.repeat(9),
    bearer_value:'Authorization: Bea'+'rer '+'abcDEF1234567890abcdef',
    prefixed_api_key:'s'+'k-'+'abcdefghij0123456789ABCD',
    json_web_token:'ey'+'J'+'hbGciOiJIUzI1NiJ9'+'.'+'eyJzdWIiOiIxMjM0NTY3ODkwIn0'+'.'+'c2lnbmF0dXJlLWJ5dGVz',
    assigned_secret:'pass'+'word = '+'hunter2hunter2',
    unix_home_or_temp:'see /'+'Users/someone/project/file.txt',
    tilde_home:'at ~'+'/notes/x.md',
    windows_drive:'C:'+'\\Users\\x\\y',
    file_url:'file:'+'///srv/data/x',
  };
  assert.deepEqual(Object.keys(samples),WARNING_KINDS.slice(0,11),'one sample for each pattern, in the order they are listed');
  assert.deepEqual(WARNING_KINDS.slice(11),['line_not_fully_scanned','unclosed_comment','comment_over_several_lines','repeated_label']);
  const base=fill().split('\n');
  const at=base.length;
  const text=[...base,...Object.values(samples)].join('\n');
  const r=check(put('warned.md',text));
  assert.equal(r.status,0,'warnings do not change the exit');
  const w=r.value.warnings;
  assert.deepEqual(w.rows,Object.keys(samples).map((kind,i)=>({kind,line:at+1+i})));
  assert.equal(w.count,11);assert.equal(w.more,0);assert.deepEqual(w.by_kind,Object.fromEntries(Object.keys(samples).map(kind=>[kind,1])));
  for(const sample of Object.values(samples))assert.equal(r.stdout.includes(sample),false,'a warned line is not echoed');
  for(const piece of ['hunter2','someone','OPENSSH','a1B2a1B2','abcDEF1234567890'])assert.equal(r.stdout.includes(piece),false,piece);
  // Ordinary lines stay quiet.
  const quiet=['sha256 5144237d22adad3ffa97c68c50093d06e9d5ed1ff3410cd22ea037b2227ef110','GET /.well-known/agent.json and /tmp is a word',
    'The token was server-stored; a bearer claim token.','https://example.org/home/page and https://example.org/tmp/x','password: none was used',
    'Authorization: none; no credentials were sent','risk-assessment and task-skipping-is-fine are not keys','commit ff4c981 and tag surface-v0.1.0-rc.1'];
  assert.equal(read(put('quiet.md',[...base,...quiet].join('\n'))).value.warnings.count,0);
  // More than the row limit: the first rows, and the rest counted.
  const many=read(put('many.md',[...base,...Array.from({length:ROW_LIMIT+5},()=>samples.tilde_home)].join('\n'))).value.warnings;
  assert.equal(ROW_LIMIT,20);
  assert.deepEqual({count:many.count,rows:many.rows.length,more:many.more,by_kind:many.by_kind},{count:25,rows:20,more:5,by_kind:{tilde_home:25}});
  // A line longer than the scan limit is scanned only that far, and the output says which line.
  assert.equal(SCAN_LINE_LIMIT,2000);
  const long=read(put('long-line.md',[...base,'x'.repeat(SCAN_LINE_LIMIT)+' '+samples.tilde_home,'x'.repeat(SCAN_LINE_LIMIT-20)+' '+samples.tilde_home+' '+'y'.repeat(100)].join('\n'))).value.warnings;
  assert.deepEqual(long.rows,[{kind:'line_not_fully_scanned',line:at+1},{kind:'tilde_home',line:at+2},{kind:'line_not_fully_scanned',line:at+2}]);
  // A comment that is opened and never closed is left as text, and warned about.
  const open=read(put('unclosed.md',[...base,'<!-- started and not finished'].join('\n')));
  assert.equal(open.status,0);assert.deepEqual(open.value.warnings.rows,[{kind:'unclosed_comment',line:at+1}]);
  // A field label given twice: the first is read, the second is warned about.
  const twice=fill().split('\n');
  twice.splice(5,0,'- **Entry ID:** `xenia-feedback-20261113-second-002`');
  const repeated=read(put('repeated.md',twice.join('\n')));
  assert.equal(repeated.value.parts.entry_id.value,ID);
  assert.deepEqual(repeated.value.warnings.rows,[{kind:'repeated_label',line:6}]);
});

test('a secret inside a comment is still warned about, and a comment is never content',()=>{
  const hidden=`<!-- ${'pass'+'word = '+'hunter2hunter2'} -->`;
  const text=fill({sections:Object.fromEntries(SECTIONS.map(title=>[title,hidden]))});
  const r=read(put('hidden.md',text));
  assert.equal(r.status,3);assert.deepEqual(r.value.finding.missing,['filled_section']);
  assert.equal(r.value.warnings.count,10);assert.deepEqual(r.value.warnings.by_kind,{assigned_secret:10});
  assert.equal(r.stdout.includes('hunter2'),false);
  // A comment over several lines keeps the line numbers after it, whatever the line ending, and its first line is given.
  const lines=fill().split('\n');
  lines.splice(2,0,'<!-- a note','over three lines','-->');
  for(const eol of ['\n','\r\n','\r']){
    const multi=read(put('multi-comment.md',lines.join(eol)));
    assert.equal(multi.status,0);assert.equal(multi.value.parts.dated_heading.line,6);assert.equal(multi.value.entry.comments_ignored,2);
    assert.deepEqual(multi.value.warnings.rows,[{kind:'comment_over_several_lines',line:3}]);
    const unclosed=read(put('multi-unclosed.md',[...lines,'<!-- never closed'].join(eol)));
    assert.deepEqual(unclosed.value.warnings.rows,[{kind:'comment_over_several_lines',line:3},{kind:'unclosed_comment',line:lines.length+1}]);
  }
  // A line separator inside a title or a value does not hide the line from the reader.
  const odd=read(put('separator.md',fill({heading:'## 2026-11-13: some\u2028one',fields:{Speaker:'a\u2029b'}})));
  assert.equal(odd.status,0);
});

test('a `<!--` quoted in a sentence or in a code fence hides nothing after it; a comment over several lines is said, with its line',()=>{
  const entry=[
    '## 2026-11-13: someone','',
    `- **Entry ID:** \`${ID}\``,
    '- **Observed at:** 2026-11-13',
    '- **Speaker:** a session that saw <!-- in a page',                               // line 5: the next list item comes before any `-->`
    '- **Identity proof:** <!-- notebook bullet 1: what identity proof (if any)',    // line 6: closed on the next line, with text after it
    '  supports that exact claim --> none',
    '- **Reply path:** <!-- notebook bullet 7: where a reply or challenge can be',   // line 8: closed on the next line, with nothing after it
    '  made, when such a path exists -->',
    '- **Status:** open','',
    '### Observed','','The page began with `<!--` and had no JSON.','',               // line 14: a blank line comes before any `-->`
    '### Inferred','Something, and a <!-- with no blank line under it.',              // line 17: a heading comes before any `-->`
    '### Declared by the subject','Text, and a --> here.','',
    '```html','<!-- served to a browser','<p>PLANT-html</p>','```','',                // lines 21 to 24: inside a code fence
    '### Unknown','','<!-- notebook bullet 6: what you still do not know -->','',     // line 28: closed on its line
    '### What I would keep','',
    '<!-- a note','','### What I would change','over four lines --> and text after it', // lines 32 to 35: opened at the start of a line
    '',
  ];
  const r=check(put('comment-starts.md',entry.join('\n')));
  assert.equal(r.status,0,r.stdout);
  const body=r.value,states=labelStates(body);
  // Read as one comment from the first `<!--` in the file to the first `-->` after it, lines 5 to 7 would vanish; read so from
  // line 14, the sections Inferred and Declared by the subject would.
  assert.deepEqual(body.parts.speaker,{state:'found',line:5});
  assert.deepEqual(body.parts.status,{state:'found',line:10,word:'open'});
  assert.deepEqual(states[1],{Speaker:'found','Identity proof':'found'},'text after the end of a comment is the value');
  assert.equal(states[7]['Reply path'],'empty','a hint that was wrapped onto a second line is still a comment');
  assert.deepEqual(states[6],{Observed:'found',Inferred:'found','Declared by the subject':'found',Unknown:'empty'});
  assert.equal(states[8]['What I would keep'],'found','text after the end of a comment is read');
  assert.equal(states[8]['What I would change'],'not_found_by_label','a heading inside a comment is not read');
  assert.deepEqual(body.parts.filled_section,{state:'found',sections:5,with_text:4});
  assert.equal(body.entry.comments_ignored,4);
  assert.deepEqual(body.warnings.rows,[{kind:'unclosed_comment',line:5},{kind:'comment_over_several_lines',line:6},{kind:'comment_over_several_lines',line:8},
    {kind:'unclosed_comment',line:14},{kind:'unclosed_comment',line:17},{kind:'comment_over_several_lines',line:32}]);
  assert.match(body.warnings.note,/read as text/);assert.match(body.warnings.note,/more than one line/);
  assert.equal(r.stdout.includes('PLANT'),false);
  // A `<!--` at the start of a line with no `-->` anywhere after it is read as text, and so is everything after it.
  const open=read(put('comment-open.md',[...entry.slice(0,31),'<!-- a note','### What I would change','','never closed',''].join('\n')));
  assert.equal(labelStates(open.value)[8]['What I would change'],'found');
  assert.deepEqual(open.value.warnings.rows.filter(row=>row.line>17),[{kind:'unclosed_comment',line:32}]);
  // A line that starts a fence is a fence whatever follows its marks, and a `-->` inside the fence ends nothing.
  const fenced=read(put('comment-fence.md',[...entry.slice(0,20),'``` <!--','### Observed','-->','```','','### Unknown','','Text.',''].join('\n')));
  assert.equal(labelStates(fenced.value)[6].Unknown,'found');
  assert.deepEqual(fenced.value.warnings.rows.filter(row=>row.line>17),[]);
  assert.equal(fenced.value.entry.comments_ignored,2);
  // A value that begins after a comment of three lines or more is still the value.
  const long=read(put('comment-long.md',[...entry.slice(0,4),'- **Speaker:** <!-- who is speaking,','  as a voluntary','  self-description --> a session','- **Status:** open','','### Observed','','Text.',''].join('\n')));
  assert.equal(long.status,0);assert.deepEqual(long.value.parts.speaker,{state:'found',line:5});
  assert.deepEqual(long.value.warnings.rows,[{kind:'comment_over_several_lines',line:5}]);
});

test('large and hostile input costs little: each 1 MiB file below is read in a few seconds of processor time at most',()=>{
  const cases={
    one_long_token_line:'ey'+'J'.repeat(INPUT_LIMIT_BYTES-2),
    repeated_token_starts:'eyJ'.repeat(Math.floor(INPUT_LIMIT_BYTES/3)),
    many_unclosed_comments:'<!--'.repeat(Math.floor(INPUT_LIMIT_BYTES/4)),
    many_closed_comments:'<!---->'.repeat(Math.floor(INPUT_LIMIT_BYTES/7)),
    comment_starts_on_every_line:'<!-- x\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/7)),
    comment_starts_and_one_late_end:`${'<!-- x\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/7)-1)}-->\n`,
    many_comments_over_two_lines:'<!--\n-->\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/9)),
    comment_starts_inside_lines:'a <!-- b\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/9)),
    one_long_list_under_a_label:`- **Speaker:** x\n${'  - y\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/6)-10)}`,
    many_short_lines:'~/x\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/4)),
    only_carriage_returns:'\r'.repeat(INPUT_LIMIT_BYTES),
    many_bold_starts:'- **'.repeat(Math.floor(INPUT_LIMIT_BYTES/4)),
    many_headings:'## 2026-11-13: x\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/17)),
    many_sections:'### a\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/6)),
    many_fences:'```\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/4)),
    keyword_and_spaces:('token'+' '.repeat(1990)+'\n').repeat(Math.floor(INPUT_LIMIT_BYTES/1996)),
    full_lines_of_starts:['eyJ','sk-','ghp_','Bearer ','secret=','-----BEGIN ','file://','C:\\','~/','/Users/','AKIA','xoxb-','github_pat_']
      .map(piece=>(piece.repeat(Math.floor(1999/piece.length))+'\n').repeat(40)).join(''),
    many_repeated_labels:'- **Speaker:** x\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/17)),
    one_long_wrapped_value:`- **Speaker:** x\n${' y\n'.repeat(Math.floor(INPUT_LIMIT_BYTES/3)-10)}`,
    backticks_in_the_id:`- **Entry ID:** ${'`'.repeat(INPUT_LIMIT_BYTES-100)}x\n`,
    spaces_after_a_heading:`### ${' '.repeat(INPUT_LIMIT_BYTES-100)}\n`,
  };
  // Processor time, not time on the clock, so that a busy machine does not fail this. Measured at 0.5 s or less for each case;
  // a reader whose cost grew with the square of the input would need minutes.
  for(const [name,text] of Object.entries(cases)){
    assert.ok(Buffer.byteLength(text)<=INPUT_LIMIT_BYTES,name);
    const file=put(`big-${name}.md`,text);
    const before=process.cpuUsage();
    const body=feedbackCheck({file});
    const used=process.cpuUsage(before),ms=(used.user+used.system)/1000;
    fs.rmSync(file);
    assert.ok(ms<5000,`${name} used ${ms.toFixed(0)} ms of processor time`);
    assert.ok([3,4].includes(body.exit_code),name);
    assert.ok(body.warnings.rows.length<=ROW_LIMIT,name);
    assert.equal(body.warnings.count,body.warnings.rows.length+body.warnings.more,name);
    assert.ok(JSON.stringify(body).length<20000,`${name}: the output stays small`);
  }
});

test('a file the reader refuses is INVALID_INPUT with the rule it broke, and nothing is checked',()=>{
  const cases={
    missing:[path.join(work,'absent.md'),'missing',/missing/],
    directory:[work,'not_regular_file',/regular file/],
    over_the_limit:[put('over-limit.md','a'.repeat(INPUT_LIMIT_BYTES+1)),'too_large',/1 MiB/],
    byte_order_mark:[put('bom.md',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(fill())])),'byte_order_mark',/byte-order mark/],
    not_utf8:[put('bad-utf8.md',Buffer.from([0x23,0x23,0x20,0xff,0xfe])),'not_utf8',/UTF-8/],
  };
  const link=path.join(work,'link.md');fs.symlinkSync(put('real-entry.md',fill()),link);cases.symbolic_link=[link,'symbolic_link',/symbolic link/];
  for(const [name,[file,reason,pattern]] of Object.entries(cases)){
    const r=check(file);
    assert.equal(r.status,1,`${name}: ${r.stdout}`);
    assert.equal(r.value.error.code,'INVALID_INPUT',name);assert.equal(r.value.error.reason,reason,name);
    assert.equal(r.value.error.operation_started,false);assert.equal(r.value.error.effect_outcome,'not_attempted');
    assert.match(r.value.problem.detail,pattern,name);assert.match(r.value.problem.detail,/Nothing was checked/,name);assert.match(r.value.problem.detail,/help feedback/,name);
    assert.deepEqual(r.value.problem.next_actions.map(action=>action.argv),[['help','feedback']],name);
    assert.equal(r.stdout.includes(work),false,`${name}: a local path in the output`);
  }
  // At the limit exactly, the file is read.
  assert.equal(INPUT_LIMIT_BYTES,1024*1024);
  assert.equal(check(put('at-limit.md','a'.repeat(INPUT_LIMIT_BYTES))).status,3);
});

test('feedback new --out writes the blank entry to one new file and never overwrites',()=>{
  const dir=fs.mkdtempSync(path.join(work,'out-'));
  const file=path.join(dir,'entry.md');
  const r=runCli(['feedback','new','--out',file]);
  assert.equal(r.status,0,r.stdout);
  const body=r.value;
  assert.deepEqual(Object.keys(body),NEW_KEYS);
  assert.equal(body.written_to_file,true);assert.equal(body.delivered,false);
  assert.deepEqual(body.entry,{media_type:'text/markdown; charset=utf-8',bytes:Buffer.byteLength(blankEntry()),sha256:sha(blankEntry())});
  assert.match(body.scope,/one new file/);assert.match(body.scope,/sent nothing/);assert.match(body.exit_reason,/one new file/);
  assert.equal(r.stdout.includes(dir),false,'the path is not echoed');
  assert.equal(fs.readFileSync(file,'utf8'),blankEntry());
  assert.deepEqual(fs.readdirSync(dir),['entry.md'],'one file, and nothing else');
  // The file it wrote is one it reads: a blank entry.
  assert.equal(check(file).status,3);
  // Asked again for the same path, it refuses and leaves the file as it is.
  fs.writeFileSync(file,'my own words\n');
  const refusals={
    already_exists:[file,/already/],
    relative_path:['relative-entry.md',/absolute/],
    parent_missing:[path.join(dir,'no-such-folder','entry.md'),/does not exist/],
    parent_not_a_directory:[path.join(file,'entry.md'),/not a directory/],
    // Nothing is at this path and its folder exists; the path itself names a folder.
    names_a_folder:[path.join(dir,'new-folder')+path.sep,/path separator/],
  };
  const dangling=path.join(dir,'dangling.md');fs.symlinkSync(path.join(dir,'target-never-made.md'),dangling);
  for(const [reason,[out,pattern]] of [...Object.entries(refusals),['already_exists',[dir,/already/]],['already_exists',[dangling,/already/]]]){
    const refused=runCli(['feedback','new','--out',out]);
    assert.equal(refused.status,1,`${reason}: ${refused.stdout}`);
    assert.equal(refused.value.error.code,'INVALID_OUTPUT');assert.equal(refused.value.error.reason,reason);
    assert.equal(refused.value.error.operation_started,false);assert.equal(refused.value.error.effect_outcome,'not_attempted');
    assert.match(refused.value.problem.detail,pattern,reason);assert.match(refused.value.problem.detail,/Nothing was written/,reason);
    assert.deepEqual(refused.value.problem.next_actions.map(action=>action.argv),[['feedback','new'],['help','feedback']]);
    assert.equal(refused.stdout.includes(dir),false,`${reason}: a local path in the output`);
  }
  assert.equal(fs.readFileSync(file,'utf8'),'my own words\n','the existing file was not touched');
  assert.equal(fs.existsSync(path.join(dir,'target-never-made.md')),false,'a link was not written through');
  assert.equal(fs.existsSync(path.join(work,'relative-entry.md')),false,'nothing was written beside the working directory');
  assert.deepEqual(fs.readdirSync(dir).sort(),['dangling.md','entry.md']);
  assert.ok(PROBLEM_CODES.includes('INVALID_OUTPUT'));assert.equal(USAGE_CODES.includes('INVALID_OUTPUT'),false);
});

test('a folder that cannot be written to is refused as not_permitted',{skip:process.platform==='win32'||process.getuid?.()===0},()=>{
  const dir=fs.mkdtempSync(path.join(work,'locked-'));
  fs.chmodSync(dir,0o500);
  try{
    const r=runCli(['feedback','new','--out',path.join(dir,'entry.md')]);
    assert.equal(r.status,1,r.stdout);assert.equal(r.value.error.code,'INVALID_OUTPUT');assert.equal(r.value.error.reason,'not_permitted');
    assert.deepEqual(fs.readdirSync(dir),[]);
  }finally{fs.chmodSync(dir,0o700);}
});

test('when the write stops after the file was made, the failure says a partial file may be there',()=>{
  const dir=fs.mkdtempSync(path.join(work,'partial-'));
  const file=path.join(dir,'entry.md');
  let caught;
  try{feedbackNew({out:file},{write(){throw new Error('no space left');}});}catch(error){caught=error;}
  assert.equal(caught?.code,'OPERATION_FAILED');assert.equal(caught.reason,'output_write_incomplete');
  assert.equal(caught.operation_started,true);assert.equal(caught.effect_outcome,'unknown');
  assert.equal(fs.readFileSync(file,'utf8'),'','the file was made and is empty');
  const problem=buildProblem(caught,{argv:['feedback','new','--out',file]});
  assert.match(problem.detail,/created/);assert.match(problem.detail,/did not finish/);assert.match(problem.detail,/did not remove/);
  assert.equal(problem.detail.includes(dir),false);
  assert.deepEqual(problem.next_actions.map(action=>action.argv),[['feedback','new']]);
});

test('wrong arguments are usage errors; nothing is read or written',()=>{
  const file=put('for-args.md',fill());
  const before=fs.readdirSync(work).sort();
  for(const args of [[],['nope'],['new','extra'],['new','--out'],['new','--out','a','--out','b'],['new','--input',file],['new','--full'],
    ['check'],['check',file],['check','--input'],['check','--input',file,'--input',file],['check','--input',file,'--out','x'],['check','--input',file,'--full']]){
    assert.throws(()=>runFeedbackCommand(args),error=>error.code==='INVALID_ARGUMENTS'&&error.operation_started===false,args.join(' '));
    assert.equal(checkArgv(['feedback',...args]).ok,false,args.join(' '));
  }
  for(const args of [[],['nope'],['new','--out'],['check',file],['check','--input',file,'--full']]){
    const r=runCli(['feedback',...args]);
    assert.equal(r.status,2,`${args.join(' ')}: ${r.stdout}`);
    assert.equal(r.value.error.code,'INVALID_ARGUMENTS',args.join(' '));assert.equal(r.value.error.effect_outcome,'not_attempted');
    assert.match(r.value.problem.detail,/Nothing was run/);
    assert.ok(r.value.problem.next_actions.some(action=>JSON.stringify(action.argv)==='["help","feedback"]'),args.join(' '));
  }
  assert.deepEqual(fs.readdirSync(work).sort(),before);
  for(const args of [['new'],['new','--out','/somewhere/new.md'],['check','--input','f']])assert.deepEqual(checkArgv(['feedback',...args]),{ok:true});
  assert.deepEqual(checkArgv(['feedback','check'],['--input <file>']),{ok:true});
  assert.equal(runCli(['feedbak']).value.problem.next_actions.some(action=>JSON.stringify(action.argv)==='["help","feedback"]'),true,'a near miss points at feedback');
});

test('entry_id_in_notebook compares the ID with the notebook beside the kit, and says when it could not',()=>{
  const entry=fill();
  const other=fill({fields:{'Entry ID':'`xenia-feedback-20261001-someone-else-004`'}});
  const withIt=kitCopy({notebook:`# Agent feedback\n\nA preamble.\n\n---\n\n${other}\n${entry}`});
  const without=kitCopy({notebook:`# Agent feedback\n\n${other}`});
  const none=kitCopy();
  const big=kitCopy({notebook:`${entry}\n${'x'.repeat(4*1024*1024)}`});
  try{
    const file=put('for-notebook.md',entry);
    const found=withIt.run(['feedback','check','--input',file]);
    assert.equal(found.status,0);assert.equal(found.value.entry_id_in_notebook.state,'found');
    assert.match(found.value.entry_id_in_notebook.means,/does not compare/);
    const absent=without.run(['feedback','check','--input',file]);
    assert.equal(absent.status,0);assert.equal(absent.value.entry_id_in_notebook.state,'not_found');
    assert.match(absent.value.entry_id_in_notebook.means,/was not looked at/);
    // A copy of the kit alone has no notebook beside it; both commands still run, and create nothing.
    const alone=none.run(['feedback','check','--input',file]);
    assert.equal(alone.status,0,JSON.stringify(alone.value));
    assert.deepEqual({state:alone.value.entry_id_in_notebook.state,reason:alone.value.entry_id_in_notebook.reason},{state:'not_checked',reason:'notebook_not_present'});
    assert.equal(none.run(['feedback','new']).status,0);assert.equal(none.run(['help','feedback']).status,0);
    assert.deepEqual(fs.readdirSync(none.home).sort(),['agent-first'],'nothing was created');
    const large=big.run(['feedback','check','--input',file]);
    assert.deepEqual({state:large.value.entry_id_in_notebook.state,reason:large.value.entry_id_in_notebook.reason},{state:'not_checked',reason:'notebook_unreadable'});
    // An ID that is not well formed is not looked for.
    const odd=withIt.run(['feedback','check','--input',put('odd-for-notebook.md',fill({fields:{'Entry ID':'something else'}}))]);
    assert.deepEqual({state:odd.value.entry_id_in_notebook.state,reason:odd.value.entry_id_in_notebook.reason},{state:'not_checked',reason:'entry_id_not_well_formed'});
    // The states never change the exit.
    for(const result of [found,absent,alone,large])assert.equal(result.value.exit_code,0);
  }finally{for(const copy of [withIt,without,none,big])copy.remove();}
});

test('the template answers the notebook: eight bullets there, each with a part here, in the notebook’s own words',()=>{
  const bullets=notebookBullets();
  assert.equal(bullets.length,8,JSON.stringify(bullets));
  const flat=text=>text.replace(/\s+/g,' ').trim();
  for(const part of PARTS){
    assert.ok(['heading','field','section'].includes(part.kind));
    if(part.bullet===null)continue;
    assert.ok(Number.isInteger(part.bullet)&&part.bullet>=1&&part.bullet<=8,part.label);
    assert.ok(flat(bullets[part.bullet-1]).includes(flat(part.asks)),`${part.label}: "${part.asks}" is in bullet ${part.bullet}`);
  }
  for(let n=1;n<=8;n+=1)assert.ok(PARTS.some(part=>part.bullet===n),`bullet ${n} has a part`);
  assert.deepEqual(PARTS.filter(part=>part.bullet===null).map(part=>part.label).slice(1),['Entry ID','Observed at','Status'],'three fields come from the form of the existing entry, not from a bullet');
  // The notebook points at the helpers in one sentence, after the bullets and before the paragraph that was already there.
  const after=notebook.slice(notebook.indexOf('- what you would keep or change.')+'- what you would keep or change.'.length,notebook.indexOf('Preserve each writer\'s words.'));
  const paragraphs=after.split(/\n\s*\n/).map(flat).filter(Boolean);
  assert.equal(paragraphs.length,1,'one paragraph was added');
  const [pointer]=paragraphs;
  for(const pattern of [/source checkout/,/optional/,/`feedback new`/,/`feedback check`/,/\(CONTRIBUTING\.md#reporting-as-an-agent\)/,/still an entry/])assert.match(pointer,pattern);
  assert.equal(pointer.split(/\.(?:\s|$)/).filter(Boolean).length,1,'it is one sentence');
  assert.ok(pointer.length<400);
});

test('the route is one constant: the same in arrive and in both feedback outputs, and it promises nothing',()=>{
  const route=JSON.parse(JSON.stringify(REPORT_ROUTE));
  const arrive=runCli(['arrive']);
  assert.ok(Buffer.byteLength(arrive.stdout)<=8192,`size ${Buffer.byteLength(arrive.stdout)}`);
  assert.deepEqual(arrive.value.report,route);
  assert.deepEqual(runCli(['feedback','new']).value.route,route);
  assert.deepEqual(check(put('for-route.md',fill())).value.route,route);
  assert.equal(route.protocol,'AGENT-FEEDBACK.md');assert.equal(route.endpoint,'none');
  assert.deepEqual(route.routes.map(item=>item.id),['pull_request','issue','hand_over','stays']);
  const [pull,issue,hand,stays]=route.routes;
  assert.match(pull.needs,/GitHub account/);assert.match(pull.needs,/fork/);assert.match(pull.decided_by,/maintainer/);
  assert.match(issue.needs,/GitHub account/);assert.match(issue.note,/not a notebook entry/);
  assert.match(hand.what,/whoever the writer answers to, if anyone/);
  assert.match(stays.what,/stays where it was written/);
  assert.match(route.note,/no endpoint/);assert.match(route.reply,/none is promised/);
  // The repository named is the one package.json names.
  const pkg=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
  assert.equal(`${REPOSITORY}/issues`,pkg.bugs.url);assert.equal(`git+${REPOSITORY}.git`,pkg.repository.url);
  assert.ok(pull.what.includes(REPOSITORY));assert.ok(issue.what.includes(pkg.bugs.url));
  assert.doesNotMatch(JSON.stringify(route),/\byou\b|\byour\b/i,'the route does not address the reader');
});

test('help, arrive, the kit README and CONTRIBUTING describe the two commands the same way',()=>{
  const usages=['feedback new [--out <absolute-new-file>]','feedback check --input <file>'];
  const general=runCli(['help']).value;
  for(const usage of usages)assert.ok(general.commands.includes(usage),usage);
  assert.match(general.output,/`feedback`/);
  for(const args of [['help','feedback'],['feedback','--help'],['feedback','check','-h'],['feedback','new','--out','x','--help']]){
    const help=runCli(args);
    assert.equal(help.status,0);assert.equal(help.value.command,'feedback');
    assert.equal(help.value.usage,usages[0]);assert.deepEqual(help.value.also,[usages[1]]);
    const rules=help.value.rules.join(' ');
    for(const pattern of [/send nothing/,/deliver nothing/,/no clock/,/absolute/,/never overwritten/,/exits 0/,/3 when/,/4 when/,/does not require this form/,/1 MiB/,/line by line/,
      /never the text/,/no endpoint/])assert.match(rules,pattern);
    assert.deepEqual(Object.keys(help.value.exit_codes),['0','1','2','3','4']);
  }
  const arrive=runCli(['arrive']).value;
  const rows=arrive.read_only_commands.filter(item=>item.argv[0]==='feedback');
  assert.deepEqual(rows.map(item=>[item.argv,item.needs]),[[['feedback','new'],undefined],[['feedback','check'],['--input <file>']]]);
  for(const row of rows)assert.deepEqual(checkArgv(row.argv,row.needs),{ok:true});
  assert.match(rows[0].what,/blank/);assert.match(rows[0].what,/--out/);
  assert.match(rows[1].what,/[Ss]ends nothing/);assert.match(rows[1].what,/checks nothing the entry says/);
  assert.match(arrive.read_only_commands_note,/feedback new --out/);
  assert.equal(arrive.network.sends.length,1,'door check is still the one command that sends');
  const readme=fs.readFileSync(new URL('README.md',kit),'utf8');
  for(const pattern of [/## Writing a report/,/feedback new/,/feedback check --input/,/\[feedback\.mjs\]\(feedback\.mjs\)/,/does not require/,/not_found_by_label/,/never the text/,/no endpoint/i])assert.match(readme,pattern);
  assert.equal(readme.includes(repo),false);
  const contributing=fs.readFileSync(path.join(repo,'CONTRIBUTING.md'),'utf8');
  const start=contributing.indexOf('\n## Reporting as an agent\n');
  assert.ok(start>0,'CONTRIBUTING has the section');
  const section=contributing.slice(start+1,contributing.indexOf('\n## ',start+1)).replace(/\s+/g,' ');
  for(const pattern of [/AGENT-FEEDBACK\.md/,/pull request/,/GitHub account/,/fork/,/maintainer/,/not a notebook entry/,/whoever you answer to, if anyone/,/stays where it was written/,
    /no endpoint/,/none is promised/,/source checkout/,/not in the published npm package/,/feedback new/,/feedback check --input/,/optional/,/does not require/])assert.match(section,pattern);
  assert.ok(section.includes(`${REPOSITORY}/issues`));
});

test('feedback loads its own file, the bounded reader and the problem table: no checker, no covenant rules, no adapter, no door',()=>{
  const dir=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-feedback-imports-'));
  try{
    const seen=path.join(dir,'seen.txt');
    fs.writeFileSync(path.join(dir,'hooks.mjs'),`import fs from 'node:fs';
      export async function resolve(s,c,n){const r=await n(s,c);fs.appendFileSync(${JSON.stringify(seen)},r.url+'\\n');return r;}`);
    fs.writeFileSync(path.join(dir,'reg.mjs'),`import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(path.join(dir,'hooks.mjs')).href)},import.meta.url);`);
    const entry=put('imports.md',fill());
    const loaded=new Set();
    for(const args of [['feedback','new'],['feedback','check','--input',entry]]){
      const r=spawnSync(process.execPath,['--import',noNetwork,'--import',pathToFileURL(path.join(dir,'reg.mjs')).href,cli,...args],{cwd:dir,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
      assert.equal(r.status,0,r.stderr+r.stdout);
      for(const url of fs.readFileSync(seen,'utf8').split('\n'))if(url.startsWith('file:')&&url.includes('/agent-first/0.1/'))loaded.add(url.split('/agent-first/0.1/')[1]);
      const urls=fs.readFileSync(seen,'utf8');
      for(const unwanted of ['/surface/','/covenant/','/observe/','/adapters/','/dist/','door.mjs','door-rights.mjs','provider.mjs'])assert.equal(urls.includes(unwanted),false,`${args.join(' ')} loaded ${unwanted}`);
    }
    for(const wanted of ['feedback.mjs','problems.mjs','input-file.mjs','runtime.mjs'])assert.ok(loaded.has(wanted),wanted);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('no test in this file reached for the network',()=>{
  assert.equal(realFetchCalls,0,'the real fetch was used in this process');
  assert.equal(fs.existsSync(offMarker)?fs.readFileSync(offMarker,'utf8'):'','','a CLI child tried the network');
});
