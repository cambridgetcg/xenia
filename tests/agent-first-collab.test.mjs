// SPDX-License-Identifier: MPL-2.0
// The Collab adapter: a fourth adapter on the kit runtime, bound through the
// `session` door.
//
// What stands behind every test here: a stand-in backend this repository
// wrote (tests/fixtures/agent-first-collab-standin.cjs), run as a child
// process over stdio, with a journal that is one JSON file in a temporary
// directory. No AgentTool Collab server, bundle or journal on this device is
// started, read or written, no MCP tool is called, and nothing touches the
// network. So these tests show what the adapter does with a backend that
// behaves as the stand-in does. They do not show that the adapter works with
// the real bundle.
//
// Ways in:
// - the adapter's inner function, which takes a transport, on the kit runtime;
// - the same binding handed to runSession, over in-memory streams;
// - the CLI, spawned: the door with and without --collab-config, and a child
//   script written here that hands the binding to the process wiring the CLI
//   uses.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs';
import {devNull,tmpdir} from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import Ajv from 'ajv';
import {createModuleRuntime} from '../agent-first/0.1/runtime.mjs';
import {compileSchema} from '../agent-first/0.1/schema.mjs';
import {errorProjection} from '../agent-first/0.1/command-state.mjs';
import {ARGUMENT_REASONS,INPUT_REASONS,NETWORK_NOTE,buildProblem,checkArgv,checkRequest} from '../agent-first/0.1/problems.mjs';

const kit=new URL('../agent-first/0.1/',import.meta.url);
const kitDir=fileURLToPath(kit);
const cli=path.join(kitDir,'cli.mjs');
const adapterUrl=new URL('adapters/agenttool-collab/index.mjs',kit);
const {COLLAB_ID,COLLAB_LIMITS,bindCollab,checkCollabConfig,createCollabBinding,loadCollabCard}=await import(adapterUrl.href);
const {spawnStdioEndpoint}=await import(new URL('adapters/agenttool-collab/stdio.mjs',kit).href);
const {runSession,SESSION_LIMITS}=await import(new URL('session.mjs',kit).href);
const {ADAPTER_META,ADAPTERS_NOT_LISTED,adapterRows,cardMeta,describeAdapter}=await import(new URL('adapter-catalog.mjs',kit).href);

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const standin=fileURLToPath(new URL('./fixtures/agent-first-collab-standin.cjs',import.meta.url));
const standinBytes=fs.readFileSync(standin);
// The pin the tests bind with names the stand-in's bytes. The kit's own pin (agenttool.lock.json) names the real bundle.
const PIN=Object.freeze({name:'@agenttool/collab',server_name:'agenttool-collab',server_version:'0.5.0',mcp_protocol:'2025-11-25',bundle_sha256:sha(standinBytes)});
const lock=JSON.parse(fs.readFileSync(new URL('agenttool.lock.json',kit),'utf8'));
const card=loadCollabCard();
const OPS=['acknowledge','next','open','report','status','task-claim','task-create','task-get','task-release'];
const WRITES=['acknowledge','next','open','report','task-claim','task-create','task-release'];
const READS=['status','task-get'];
const ALLOW_ALL=OPS.map(operation=>`${COLLAB_ID}:${operation}`);
const PLANTED='PLANTED_BACKEND_TEXT';

const scratch=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-collab-'));
test.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
let serial=0;
// One set of chosen places: a private home, a workspace, a journal path that does not exist yet, and a copy of the stand-in as "the bundle".
function place({home=true}={}){
  const root=path.join(scratch,`place-${serial+=1}`);
  fs.mkdirSync(root);
  const dirs={root,homeDir:path.join(root,'home'),workspace:path.join(root,'work'),databasePath:path.join(root,'state','journal.json'),bundlePath:path.join(root,'chosen-bundle.js'),bunPath:process.execPath};
  if(home)fs.mkdirSync(dirs.homeDir,{mode:0o700});
  fs.mkdirSync(dirs.workspace);
  fs.writeFileSync(dirs.bundlePath,standinBytes);
  return dirs;
}
const configOf=(dirs,more={})=>({bundlePath:dirs.bundlePath,bunPath:dirs.bunPath,databasePath:dirs.databasePath,homeDir:dirs.homeDir,workspace:dirs.workspace,
  actor:'xenia-test-actor',journal:'new',timeoutMs:3000,...more});
const setControl=(dirs,value)=>fs.writeFileSync(path.join(dirs.homeDir,'standin-control.json'),JSON.stringify(value));
const clearControl=dirs=>{try{fs.rmSync(path.join(dirs.homeDir,'standin-control.json'),{force:true});}catch{}};
const journalOf=dirs=>JSON.parse(fs.readFileSync(dirs.databasePath,'utf8'));
const callsOf=dirs=>{try{return fs.readFileSync(path.join(dirs.homeDir,'standin-calls.log'),'utf8').trim().split('\n').filter(Boolean);}catch{return [];}};
const startedOf=dirs=>JSON.parse(fs.readFileSync(path.join(dirs.homeDir,'standin-started.json'),'utf8'));
const copiesOf=dirs=>{try{return fs.readdirSync(dirs.homeDir).filter(name=>name.startsWith('xenia-collab-bundle-'));}catch{return [];}};
// Is the stand-in this place started still a process? Signal 0 sends nothing; it only asks.
const running=dirs=>{try{process.kill(startedOf(dirs).pid,0);return true;}catch{return false;}};
// The stand-in is a Node script, and Node does not take the flags the adapter gives Bun. The transport the tests
// hand over keeps what it was asked to run and starts the copy the adapter made, with Node.
function transport(seen){
  return options=>{seen.push(options);return spawnStdioEndpoint({...options,args:[options.args.at(-1)]});};
}
function rig(t,{config:more={},card:chosenCard,control,requestBytes,dirs=place(),connect}={}){
  const seen=[],gate=[];
  if(control)setControl(dirs,control);
  const config=checkCollabConfig(configOf(dirs,more));
  const binding=bindCollab({config,configSha256:'c'.repeat(64),pin:PIN,connect:connect??transport(seen),...(chosenCard?{card:chosenCard}:{}),...(requestBytes?{requestBytes}:{})});
  const runtime=createModuleRuntime({authorize:request=>{gate.push(request.operation);return true;}});
  runtime.register(binding.module);runtime.activate(COLLAB_ID);
  t.after(async()=>{clearControl(dirs);await binding.close();});
  const call=(operation,input={})=>runtime.invoke(COLLAB_ID,operation,input).then(result=>result.value);
  return {dirs,binding,runtime,call,seen,gate,config};
}
const clean=error=>{
  const text=JSON.stringify({error:errorProjection(error),message:error.message});
  assert.equal(text.includes(PLANTED),false,`backend text reached an error: ${text.slice(0,300)}`);
};
// A declared refusal: DECLINED, not_applied, the card's own words, nothing the backend wrote.
async function declined(promise,code,label=code){
  const error=await promise.then(value=>assert.fail(`${label}: expected DECLINED ${code}, got ${JSON.stringify(value).slice(0,200)}`),failure=>failure);
  assert.equal(error.code,'DECLINED',`${label}: ${error.code} ${error.reason??''} ${error.stack??''}`);
  assert.equal(error.refusal.code,code,label);
  assert.equal(error.effect_outcome,'not_applied',label);
  assert.equal(error.refusal.detail,undefined,`${label}: a refusal carries no detail`);
  assert.equal(typeof error.refusal.meaning,'string',label);
  clean(error);
  return error;
}
// Everything else that fails after a call started: the effect is unknown.
async function unknown(promise,label='unknown'){
  const error=await promise.then(value=>assert.fail(`${label}: expected a failure, got ${JSON.stringify(value).slice(0,200)}`),failure=>failure);
  assert.equal(error.code,'OPERATION_FAILED',`${label}: ${error.code} ${error.refusal?.code??''}`);
  assert.equal(error.operation_started,true,label);
  assert.equal(error.effect_outcome,'unknown',label);
  assert.equal(error.refusal,undefined,label);
  clean(error);
  return error;
}
const KEY=(()=>{let n=0;return (label='k')=>`${label}-${n+=1}`;})();
async function opened(t,options){
  const r=rig(t,options);
  r.session=await r.call('open');
  return r;
}

// ---------------------------------------------------------------- the card

test('the card is MPL-2.0 like the file it was ported from, says where it came from, and the runtime accepts the module built from it',t=>{
  // module.json was runtime configuration under the other lineage's map, so MPL-2.0; the card is a modification of it, and the runtime enforces its schemas.
  assert.equal(card.license,'MPL-2.0');
  assert.match(card.origin,/modules\/0\.1\/adapters\/agenttool-collab\/module\.json/);
  assert.match(card.origin,/beed37a/);
  assert.match(card.origin,/MPL-2\.0/,'the origin says what licence the ported file was under');
  assert.equal(card.module.id,'agenttool.collab');assert.equal(COLLAB_ID,'agenttool.collab');
  const motifIds=JSON.parse(fs.readFileSync(new URL('motifs.json',kit),'utf8')).motifs.map(motif=>motif.id);
  assert.ok(motifIds.includes(card.module.motif),`the card names a motif that is in the map: ${card.module.motif}`);
  assert.deepEqual(Object.keys(card.operations).sort(),OPS);
  for(const [id,op] of Object.entries(card.operations)){
    assert.deepEqual(op.effects,READS.includes(id)?['local-read']:['local-read','local-write'],id);
    assert.equal(op.input.schema.type,'object',id);assert.equal(op.input.schema.additionalProperties,false,id);
    const check=compileSchema(op.input.schema).check;
    assert.equal(check(op.input.example),undefined,`${id}: the example matches its schema`);
    assert.ok(op.input.summary.length>10&&op.returns.summary.length>10,id);
    assert.ok(Array.isArray(op.does)&&op.does.length>=1&&op.does.every(line=>typeof line==='string'&&line.length>10&&line.length<=400),`${id}: a does list`);
    // The adapter's own refusals are named by code and worded once, in the card's table. The backend's are a list of their own.
    for(const code of op.refusals){
      assert.deepEqual(Object.keys(card.refusals[code]).sort(),['meaning','next'],`${id} ${code}`);
      assert.ok(card.refusals[code].meaning.length>20&&card.refusals[code].next.length>5,`${id} ${code}`);
    }
    assert.ok(Array.isArray(op.backend_refusals),id);
  }
  assert.deepEqual(Object.keys(card.refusals).sort(),[...new Set(Object.values(card.operations).flatMap(op=>op.refusals))].sort(),'every worded code is used, and every used code is worded');
  const {dirs,runtime}=rig(t);
  const described=runtime.describe(COLLAB_ID);
  assert.equal(described.version,card.module.version);assert.equal(described.contract,card.module.contract);
  assert.deepEqual(described.operations.map(op=>op.id),OPS);
  for(const op of described.operations){
    assert.equal(op.input_checked_by,'runtime',op.id);
    assert.deepEqual(op.input.schema,card.operations[op.id].input.schema,op.id);
    const own=card.operations[op.id].refusals,theirs=card.operations[op.id].backend_refusals;
    assert.deepEqual(op.refusals.map(r=>r.code),[...own,...theirs.map(entry=>entry.code)].sort(),op.id);
    for(const refusal of op.refusals){
      // The adapter's own are worded in the card's table; the backend's carry their own words. Neither carries the
      // places a refusal was read at: `sites` stay on the card.
      const worded=own.includes(refusal.code)?card.refusals[refusal.code]:theirs.find(entry=>entry.code===refusal.code);
      assert.deepEqual(refusal,{code:refusal.code,meaning:worded.meaning,effect:'not_applied',next:worded.next},`${op.id} ${refusal.code}`);
    }
    // What the runtime holds is the card without its card-only parts.
    assert.equal(op.does,undefined);assert.equal(op.backend_refusals,undefined);assert.equal(JSON.stringify(op).includes('"sites"'),false,op.id);
  }
  assert.deepEqual(fs.readdirSync(dirs.homeDir),[],'binding and registering wrote nothing');
  assert.equal(fs.existsSync(dirs.databasePath),false);
});

test('every card schema is also a strict JSON Schema, and Ajv agrees about each example',()=>{
  const ajv=new Ajv({strict:true,allErrors:false,ownProperties:true});
  for(const [id,op] of Object.entries(card.operations)){
    const validate=ajv.compile(op.input.schema);
    assert.equal(validate(op.input.example),true,`${id}: ${JSON.stringify(validate.errors)}`);
    assert.equal(validate({...op.input.example,not_declared:1}),false,`${id}: closed`);
  }
});

test('each operation declares the refusals the adapter itself raises',()=>{
  const base=['backend_not_running','busy','not_open'];
  const expected={
    open:['already_open','bun_unavailable','bundle_unavailable','busy','home_dir_unavailable','journal_exists','journal_missing','pin_mismatch','workspace_unavailable'],
    status:base,'task-get':base,
    next:[...base,'earlier_outcome_unknown'].sort(),
    acknowledge:[...base,'earlier_outcome_unknown','unobserved_anchor'].sort(),
    report:[...base,'earlier_outcome_unknown','request_too_large','text_too_long'].sort(),
    'task-create':[...base,'earlier_outcome_unknown','request_too_large','text_too_long'].sort(),
    'task-claim':[...base,'earlier_outcome_unknown','lease_limit'].sort(),
    'task-release':[...base,'earlier_outcome_unknown','lease_not_held_by_module'].sort(),
  };
  for(const id of OPS)assert.deepEqual([...card.operations[id].refusals].sort(),expected[id],id);
});

// Which of the backend's own refusals the card passes on, for each operation. This is the outcome of a reading of the
// pinned bundle, site by site (the table is in .hermes/verification/guest-side-step5.json). The bundle is not in
// this repository and no test reads it: what is held here is that the card, the record and the adapter agree.
const LISTED=Object.freeze({
  open:[],status:[],next:[],
  acknowledge:['cursor_version_conflict','session_auth_failed'],
  report:['idempotency_conflict','session_auth_failed','task_not_found'],
  'task-create':['idempotency_conflict','session_auth_failed'],
  'task-get':['task_not_found'],
  'task-claim':['idempotency_conflict','recovery_required','session_auth_failed','task_blocked','task_claimed','task_completed','task_not_found','version_conflict'],
  'task-release':['idempotency_conflict','lease_expired','lease_not_active','lease_not_holder','session_auth_failed','task_not_found','version_conflict'],
});
const CANDIDATES=['cursor_version_conflict','idempotency_conflict','lease_expired','lease_not_active','lease_not_holder','recovery_required','session_auth_failed',
  'task_blocked','task_claimed','task_completed','task_not_found','version_conflict'];
const STAGES=['before_transaction','in_transaction_after_write','in_transaction_before_write','no_transaction'];
const TOOL_OF={open:'collab_session_start',status:'collab_workspace_status',next:'collab_next',acknowledge:'collab_cursor_ack',report:'collab_report_append',
  'task-create':'collab_task_create','task-get':'collab_task_get','task-claim':'collab_task_claim','task-release':'collab_task_release'};
const recordFile=new URL('../.hermes/verification/guest-side-step5.json',import.meta.url);

test('the card lists a refusal of the backend only with the places it was read at, and says the reading was not an observation',()=>{
  const reading=card.backend_reading;
  assert.equal(reading.bundle_sha256,lock.collab.bundle_sha256,'the reading names the pinned bytes');
  assert.ok(Number.isSafeInteger(reading.bundle_lines)&&reading.bundle_lines>30000);
  assert.deepEqual(Object.keys(reading.stages).sort(),STAGES);
  assert.match(reading.what,/never run/);
  assert.ok(reading.not_established.some(line=>/rollback|rolls back|undo/i.test(line)&&/Bun/.test(line)),'the rollback is the Bun program\'s, and is named as not established');
  assert.equal(reading.record,'.hermes/verification/guest-side-step5.json');
  for(const id of OPS){
    const op=card.operations[id];
    assert.deepEqual(op.backend_refusals.map(entry=>entry.code),LISTED[id],`${id}: the codes, in order`);
    assert.equal(reading.tools[id].tool,TOOL_OF[id],id);
    for(const entry of op.backend_refusals){
      const at=`${id} ${entry.code}`;
      assert.deepEqual(Object.keys(entry).sort(),['code','meaning','next','sites'],at);
      assert.ok(CANDIDATES.includes(entry.code),at);
      assert.equal(op.refusals.includes(entry.code),false,`${at}: not one of the adapter's own codes`);
      assert.ok(entry.meaning.length<=512&&entry.next.length<=512,`${at}: ${entry.meaning.length} and ${entry.next.length} characters`);
      assert.ok(entry.meaning.startsWith(`The backend answered ${entry.code}: `),at);
      // What a problem's detail keeps of a meaning is its first 200 characters: the code and what it means are in them.
      assert.ok(entry.meaning.indexOf('. ')>0&&entry.meaning.indexOf('. ')<200,`${at}: the first sentence fits in 200 characters`);
      assert.match(entry.meaning,/[Rr]ead in the pinned bundle, not observed/,at);
      assert.doesNotMatch(entry.meaning,/guarantee|certain|always|never fails|safe\b/i,at);
      if(id==='task-claim')assert.match(entry.meaning,/git/,`${at}: says the backend ran git, or may have`);
      else assert.doesNotMatch(entry.meaning,/\bgit\b/,at);
      assert.ok(Array.isArray(entry.sites)&&entry.sites.length>=1&&entry.sites.length<=16,at);
      for(const site of entry.sites){
        assert.deepEqual(Object.keys(site).sort(),['line','stage'],at);
        assert.ok(Number.isSafeInteger(site.line)&&site.line>=1&&site.line<=reading.bundle_lines,`${at}: line ${site.line}`);
        assert.ok(STAGES.includes(site.stage),`${at}: ${site.stage}`);
        // Every place is before the commit the card names for the tool. A tool that opens no transaction has no commit line.
        const commit=reading.tools[id].commit_line;
        if(site.stage==='no_transaction')assert.equal(commit,null,at);
        else assert.ok(Number.isSafeInteger(commit),at);
      }
      assert.equal(new Set(entry.sites.map(site=>JSON.stringify(site))).size,entry.sites.length,`${at}: no place twice`);
    }
  }
  // A read opens no transaction; a write is refused inside or before one.
  assert.deepEqual(card.operations['task-get'].backend_refusals[0].sites.map(site=>site.stage),['no_transaction']);
  for(const id of WRITES)for(const entry of card.operations[id].backend_refusals)assert.ok(entry.sites.every(site=>site.stage!=='no_transaction'),`${id} ${entry.code}`);
  // What is left unknown is said on the card too, for the three operations that pass nothing on.
  for(const id of ['open','status','next'])assert.ok(reading.left_unknown.some(line=>line.startsWith(`${id}: `)),id);
  assert.ok(reading.left_unknown.some(line=>line.startsWith('next: ')&&/session_auth_failed/.test(line)&&/after/.test(line)));
  assert.doesNotMatch(JSON.stringify(card),/\/Users\/|\/private\/|\/home\//,'no local path on the card');
});

test('the record of the reading and the card agree, row by row',()=>{
  const record=JSON.parse(fs.readFileSync(recordFile,'utf8'));
  const reading=record.refusal_reading;
  assert.equal(reading.bundle.sha256,lock.collab.bundle_sha256);
  assert.equal(reading.bundle.lines,card.backend_reading.bundle_lines);
  assert.match(reading.method,/never run/);
  const rows=reading.table;
  const key=row=>`${row.operation} ${row.code}`;
  assert.equal(new Set(rows.map(key)).size,rows.length,'one row for each operation and code');
  for(const row of rows){
    assert.equal(row.tool,TOOL_OF[row.operation],key(row));
    assert.ok(CANDIDATES.includes(row.code),key(row));
    assert.equal(typeof row.listed,'boolean',key(row));
    const onCard=card.operations[row.operation].backend_refusals.find(entry=>entry.code===row.code);
    if(row.listed){
      assert.ok(onCard,`${key(row)}: listed in the record, so on the card`);
      // The record keeps every way a place is reached; the card keeps each raising line once for each stage.
      for(const site of row.sites){
        assert.deepEqual(Object.keys(site).sort(),['line','stage','through'],key(row));
        assert.ok(Array.isArray(site.through)&&site.through.length>=1&&site.through.every(line=>Number.isSafeInteger(line)&&line>=1&&line<=reading.bundle.lines),key(row));
      }
      const pairs=list=>[...new Set(list.map(site=>`${site.line} ${site.stage}`))].sort();
      assert.deepEqual(pairs(row.sites),pairs(onCard.sites),`${key(row)}: the same places`);
      assert.equal(row.commit_line,card.backend_reading.tools[row.operation].commit_line,`${key(row)}: the same commit line`);
    }else{
      assert.equal(onCard,undefined,`${key(row)}: not listed in the record, so not on the card`);
      assert.ok(typeof row.why_not==='string'&&row.why_not.length>20,key(row));
    }
  }
  // Every refusal on the card has its row, and every candidate code has at least one row.
  for(const id of OPS)for(const entry of card.operations[id].backend_refusals)assert.ok(rows.some(row=>row.operation===id&&row.code===entry.code&&row.listed),`${id} ${entry.code}`);
  for(const code of CANDIDATES)assert.ok(rows.some(row=>row.code===code),code);
  assert.ok(rows.some(row=>row.operation==='next'&&row.code==='session_auth_failed'&&row.listed===false));
  assert.ok(Array.isArray(reading.stays_unknown)&&reading.stays_unknown.length>=4);
});

test('a card that lists a refusal the adapter does not raise, or leaves one out, is refused when it is bound',()=>{
  const dirs=place();
  const bind=chosen=>bindCollab({config:checkCollabConfig(configOf(dirs)),configSha256:'c'.repeat(64),pin:PIN,card:chosen,connect:()=>assert.fail('nothing is started by binding')});
  const refused=(label,change)=>{
    const chosen=structuredClone(card);
    change(chosen);
    assert.throws(()=>bind(chosen),error=>error.code==='INVALID_MODULE'&&error.reason==='collab_card_not_usable',label);
  };
  refused('a refusal status does not raise',chosen=>chosen.operations.status.refusals.push('lease_limit'));
  refused('a refusal status raises, left out',chosen=>{chosen.operations.status.refusals=chosen.operations.status.refusals.filter(code=>code!=='busy');});
  refused('a code with no words in the table',chosen=>{delete chosen.refusals.busy;});
  const sites=[{line:1,stage:'no_transaction'}];
  const usable={code:'workspace_gone',meaning:'A meaning for a test.',next:'None.',sites};
  refused('a backend refusal under one of the adapter\'s own codes',chosen=>chosen.operations.status.backend_refusals.push({...usable,code:'busy'}));
  refused('a backend refusal with no meaning',chosen=>chosen.operations.status.backend_refusals.push({code:'workspace_gone',sites}));
  // A refusal of the backend is listed with the places it was read at, or not at all.
  refused('a backend refusal with no sites',chosen=>chosen.operations.status.backend_refusals.push({code:'workspace_gone',meaning:usable.meaning,next:usable.next}));
  refused('a backend refusal with an empty list of sites',chosen=>chosen.operations.status.backend_refusals.push({...usable,sites:[]}));
  refused('a site with no line',chosen=>chosen.operations.status.backend_refusals.push({...usable,sites:[{stage:'no_transaction'}]}));
  // A place after a commit has no stage word: a code with such a place cannot be put on the card.
  refused('a site after a commit',chosen=>chosen.operations.status.backend_refusals.push({...usable,sites:[{line:1,stage:'after_commit'}]}));
  refused('a site with a key that is not read',chosen=>chosen.operations.status.backend_refusals.push({...usable,sites:[{line:1,stage:'no_transaction',note:'x'}]}));
  refused('a backend refusal with a key that is not read',chosen=>chosen.operations.status.backend_refusals.push({...usable,effect:'applied'}));
  refused('the same backend code twice on one operation',chosen=>chosen.operations['task-get'].backend_refusals.push({...usable,code:'task_not_found'}));
  {
    const chosen=structuredClone(card);
    chosen.operations.status.backend_refusals.push(usable);
    assert.equal(bind(chosen).module.operations.status.refusals.some(entry=>entry.code==='workspace_gone'&&entry.sites===undefined),true,'a usable one binds, and its sites are not handed to the runtime');
  }
  refused('an operation the adapter does not have',chosen=>{chosen.operations['task-complete']=structuredClone(chosen.operations['task-get']);});
  assert.equal(bind(structuredClone(card)).module.id,COLLAB_ID,'the card as shipped binds');
});

// ---------------------------------------------------------------- the pin and the config

test('the lock names the bundle by its bytes and says what that does not show',()=>{
  const pin=lock.collab;
  assert.equal(pin.bundle_sha256,'fdfd99b20fa21a69c368a8027bb972fd1a3509c8e5f90882c5742cd9ebe053cd');
  assert.equal(pin.server_name,'agenttool-collab');assert.equal(pin.server_version,'0.5.0');
  assert.match(pin.scope,/[Rr]elease-candidate/);assert.match(pin.scope,/[Nn]o download/);assert.match(pin.scope,/never downloads/);
  assert.equal(JSON.stringify(lock).includes('/Users/'),false,'no local path in the lock');
});

test('a config is closed, absolute and apart; what it refuses is named by key and never repeated',()=>{
  const dirs=place();
  const good=configOf(dirs);
  const checked=checkCollabConfig(good);
  assert.deepEqual(Object.keys(checked).sort(),['actor','bunPath','bundlePath','databasePath','homeDir','journal','timeoutMs','workspace']);
  const {timeoutMs,...withoutTimeout}=good;
  assert.equal(checkCollabConfig(withoutTimeout).timeoutMs,8000,'the default request timeout');
  const refused=(value,reason,pointer,label)=>{
    let error;
    try{checkCollabConfig(value);}catch(caught){error=caught;}
    assert.ok(error,`${label}: expected a refusal`);
    assert.equal(error.code,'INVALID_INPUT',label);assert.equal(error.reason,reason,label);
    if(pointer!==undefined)assert.equal(error.pointer,pointer,label);
    assert.equal(error.operation_started,false,label);
    assert.ok(Object.hasOwn(INPUT_REASONS,reason),`${label}: the door has words for ${reason}`);
    assert.equal(JSON.stringify(errorProjection(error)).includes('SENTINEL'),false,`${label}: the value is not repeated`);
    return error;
  };
  refused(null,'collab_config_does_not_match','','not an object');
  refused({...good,extraSENTINEL:1},'collab_config_does_not_match','','an undeclared key');
  for(const name of ['bundlePath','bunPath','databasePath','homeDir','workspace','actor','journal']){
    const {[name]:dropped,...rest}=good;
    const error=refused(rest,'collab_config_does_not_match','',`${name} missing`);
    assert.equal(error.keyword,'required');assert.equal(error.expected,name);
  }
  for(const name of ['bundlePath','bunPath','databasePath','homeDir','workspace']){
    refused({...good,[name]:'relative/SENTINEL'},'collab_config_path_not_absolute',`/${name}`,`${name} relative`);
    refused({...good,[name]:`${good[name]}/../SENTINEL`},'collab_config_path_not_absolute',`/${name}`,`${name} with ..`);
    refused({...good,[name]:`${good[name]}/`},'collab_config_path_not_absolute',`/${name}`,`${name} with a trailing separator`);
    refused({...good,[name]:`${good[name]}\nSENTINEL`},'collab_config_path_not_absolute',`/${name}`,`${name} with a control character`);
    refused({...good,[name]:7},'collab_config_does_not_match',`/${name}`,`${name} not a string`);
  }
  refused({...good,journal:'SENTINEL'},'collab_config_does_not_match','/journal','journal word');
  for(const value of [99,9001,1.5,'8000'])refused({...good,timeoutMs:value},'collab_config_does_not_match','/timeoutMs',`timeoutMs ${value}`);
  for(const value of ['',' padded SENTINEL ','line\nSENTINEL','x'.repeat(201),'\u{1F600}'.repeat(150)])refused({...good,actor:value},'collab_config_does_not_match','/actor',`actor ${JSON.stringify(value).slice(0,20)}`);
  // The backend's HOME is homeDir. It must not be the user's own home, or a folder that holds it.
  for(const home of new Set([process.env.HOME,fs.realpathSync(process.env.HOME),path.dirname(fs.realpathSync(process.env.HOME))]))if(home&&home!==path.parse(home).root){
    refused({...good,homeDir:home},'collab_config_home_is_user_home','/homeDir','the user home');
  }
  // The workspace is apart from homeDir and from the journal's folder: neither is the other, inside it or around it.
  refused({...good,workspace:good.homeDir},'collab_config_workspace_not_apart','/workspace','workspace is homeDir');
  refused({...good,workspace:path.join(good.homeDir,'inside')},'collab_config_workspace_not_apart','/workspace','workspace inside homeDir');
  refused({...good,workspace:dirs.root},'collab_config_workspace_not_apart','/workspace','workspace around homeDir');
  refused({...good,workspace:path.dirname(good.databasePath)},'collab_config_workspace_not_apart','/workspace','workspace is the journal folder');
  refused({...good,databasePath:path.join(good.workspace,'journal.json')},'collab_config_workspace_not_apart','/workspace','journal inside the workspace');
  // Each path may be 512 characters; all five and the actor together must still fit what a session shows of a binding.
  const long=(base,count)=>path.join(base,'p'.repeat(count));
  const longest=Object.fromEntries(['bundlePath','bunPath','databasePath','homeDir','workspace'].map(name=>[name,long(good[name],500-good[name].length-1)]));
  for(const name of Object.keys(longest))assert.equal(longest[name].length,500);
  assert.equal(refused({...good,...longest},'collab_config_too_long',undefined,'five long paths').pointer,undefined);
  refused({...good,[`bundlePath`]:long(good.bundlePath,513)},'collab_config_does_not_match','/bundlePath','one path over 512 characters');
  // Just inside the limit, the binding's bound_to still fits the session's limit for it.
  assert.equal(COLLAB_LIMITS.bound_to_bytes,SESSION_LIMITS.bound_to_bytes);
  const fit=(count)=>({...good,actor:'\u00e9'.repeat(200),...Object.fromEntries(Object.keys(longest).map(name=>[name,long(good[name],count-good[name].length-1)]))});
  let count=500;
  while(count>0){try{checkCollabConfig(fit(count));break;}catch{count-=1;}}
  assert.ok(count>200&&count<500,`the longest five equal paths beside a 200-character actor: ${count} characters each`);
  const widest=bindCollab({config:checkCollabConfig(fit(count)),configSha256:'c'.repeat(64),pin:{...PIN,server_version:'9'.repeat(80)},connect:()=>assert.fail('nothing is started by binding')});
  assert.ok(Buffer.byteLength(JSON.stringify(widest.bound_to))<=SESSION_LIMITS.bound_to_bytes,`bound_to is ${Buffer.byteLength(JSON.stringify(widest.bound_to))} bytes`);
});

test('a config file is read strictly from an absolute path, and reading it starts nothing',()=>{
  const dirs=place({home:false});
  const file=path.join(dirs.root,'collab.json');
  const write=value=>fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));
  const refused=(configPath,code,reason,label)=>{
    assert.throws(()=>createCollabBinding({configPath}),error=>{
      assert.equal(error.code,code,label);assert.equal(error.reason,reason,label);
      assert.ok(Object.hasOwn(code==='INVALID_ARGUMENTS'?ARGUMENT_REASONS:INPUT_REASONS,reason),label);
      return true;
    },label);
  };
  refused('collab.json','INVALID_ARGUMENTS','collab_config_not_absolute','a relative path');
  refused(undefined,'INVALID_ARGUMENTS','collab_config_not_absolute','no path');
  refused(path.join(dirs.root,'absent.json'),'INVALID_INPUT','missing','no file');
  write('{not json');refused(file,'INVALID_INPUT','not_json','not JSON');
  write('{"actor":"a","actor":"b"}');refused(file,'INVALID_INPUT','duplicate_key','a repeated key');
  write(`{"pad":"${'x'.repeat(COLLAB_LIMITS.config_bytes)}"}`);refused(file,'INVALID_INPUT','too_large','over the size limit');
  const link=path.join(dirs.root,'link.json');
  write(configOf(dirs));fs.symlinkSync(file,link);
  refused(link,'INVALID_INPUT','symbolic_link','a symbolic link');
  write({...configOf(dirs),bundlePath:'relative.js'});refused(file,'INVALID_INPUT','collab_config_path_not_absolute','a relative bundle path');
  write(configOf(dirs));
  const binding=createCollabBinding({configPath:file});
  assert.deepEqual(Object.keys(binding).sort(),['at_end','bound_to','close','deadlines','look','module']);
  assert.equal(binding.module.id,COLLAB_ID);
  assert.equal(binding.bound_to.config_sha256,sha(fs.readFileSync(file)));
  assert.equal(binding.bound_to.pin.bundle_sha256,lock.collab.bundle_sha256,'the pin is the kit\'s own, read from the lock, not the caller\'s');
  assert.equal(binding.look().step,'not_opened');
  assert.equal(fs.existsSync(dirs.homeDir),false,'nothing was created');assert.equal(fs.existsSync(dirs.databasePath),false);
});

test('bound to the kit\'s pin, a bundle with other bytes is refused before anything is written or started',async t=>{
  const dirs=place({home:false});
  const file=path.join(dirs.root,'collab.json');
  fs.writeFileSync(file,JSON.stringify(configOf(dirs)));
  const binding=createCollabBinding({configPath:file});
  const runtime=createModuleRuntime({authorize:()=>true});
  runtime.register(binding.module);runtime.activate(COLLAB_ID);
  const error=await declined(runtime.invoke(COLLAB_ID,'open',{}),'pin_mismatch');
  assert.match(error.refusal.meaning,/sha256/);
  assert.equal(fs.existsSync(dirs.homeDir),false,'no home was created');assert.equal(fs.existsSync(dirs.databasePath),false,'no journal was created');
  assert.equal(binding.look().step,'not_opened');assert.equal(binding.look().transport,'not_started');
  assert.deepEqual(await binding.close(),{complete:true,did:[],did_not:[],left_behind:[]});
});

// ---------------------------------------------------------------- open

test('open checks, copies the checked bytes, starts the copy with a short environment and no shell, and starts a native session',async t=>{
  const {dirs,binding,call,seen,gate,config}=rig(t);
  assert.deepEqual(binding.look(),{step:'not_opened',transport:'not_started',in_flight:null,writes_latched:false,unknown_calls:[],native:null,claims:[],tasks:[],last_page:null,last_call:null});
  const result=await call('open');
  assert.deepEqual(Object.keys(result).sort(),['journal','server','session_id','workspace_id']);
  assert.deepEqual(result.server,{name:'agenttool-collab',version:'0.5.0'});assert.equal(result.journal,'new');
  assert.match(result.session_id,/^session_/);assert.match(result.workspace_id,/^ws_/);
  assert.deepEqual(gate,['open'],'the gate was asked once, for open');
  // What was started.
  assert.equal(seen.length,1);
  const [asked]=seen;
  assert.equal(asked.command,dirs.bunPath);assert.equal(asked.cwd,dirs.homeDir);
  assert.deepEqual(asked.args.slice(0,3),['--no-env-file','--no-install',`--config=${devNull}`]);assert.equal(asked.args.length,4);
  assert.deepEqual(Object.keys(asked.env).sort(),['AGENTOOL_COLLAB_DB','GIT_OPTIONAL_LOCKS','HOME','PATH']);
  assert.equal(asked.env.HOME,dirs.homeDir);assert.equal(asked.env.AGENTOOL_COLLAB_DB,dirs.databasePath);assert.equal(asked.env.GIT_OPTIONAL_LOCKS,'0');
  assert.equal(asked.timeoutMs,config.timeoutMs);
  // The copy: one private folder under homeDir, one read-only file with the pinned bytes, and it is the copy that ran.
  const [folder]=copiesOf(dirs);
  const copy=path.join(dirs.homeDir,folder,'bundle.js');
  assert.equal(asked.args[3],copy);
  assert.equal(fs.statSync(path.dirname(copy)).mode&0o777,0o700);assert.equal(fs.statSync(copy).mode&0o777,0o400);
  assert.equal(sha(fs.readFileSync(copy)),PIN.bundle_sha256);
  const started=startedOf(dirs);
  assert.equal(fs.realpathSync(started.script),fs.realpathSync(copy),'the copy ran, not the file the config names');
  assert.equal(fs.realpathSync(started.cwd),fs.realpathSync(dirs.homeDir));
  for(const name of started.env)assert.ok(['AGENTOOL_COLLAB_DB','GIT_OPTIONAL_LOCKS','HOME','PATH','__CF_USER_TEXT_ENCODING'].includes(name),`the child had ${name}`);
  // What the backend did, and what the binding remembers.
  assert.deepEqual(callsOf(dirs),['collab_session_start']);
  assert.equal(fs.existsSync(dirs.databasePath),true,'the backend made the journal');
  const look=binding.look();
  assert.equal(look.step,'open');assert.equal(look.transport,'running');assert.equal(look.in_flight,null);
  assert.deepEqual(look.native,{workspace_id:result.workspace_id,session_id:result.session_id});
  assert.deepEqual(look.last_call,{operation:'open',outcome:'returned'});
  assert.equal(JSON.stringify(result).includes(PLANTED),false);
  await declined(call('open'),'already_open');
  assert.equal(seen.length,1,'a second open starts nothing');
});

test('the bytes that run are the bytes that were checked, even when the chosen file changes afterwards',async t=>{
  const dirs=place();
  const seen=[];
  const swap=options=>{
    // The file the config names is replaced after the check and before the start.
    fs.writeFileSync(dirs.bundlePath,'process.exit(7)\n');
    return transport(seen)(options);
  };
  const {call}=rig(t,{dirs,connect:swap});
  await call('open');
  assert.equal(sha(fs.readFileSync(seen[0].args[3])),PIN.bundle_sha256);
  assert.equal(fs.readFileSync(dirs.bundlePath,'utf8'),'process.exit(7)\n');
});

test('each thing open declares is refused before any write, and open can then be asked again',async t=>{
  const cases={
    pin_mismatch:dirs=>fs.appendFileSync(dirs.bundlePath,'\n// one more line\n'),
    bundle_unavailable:dirs=>fs.rmSync(dirs.bundlePath),
    bun_unavailable:()=>({bunPath:path.join(scratch,'no-such-bun')}),
    workspace_unavailable:dirs=>fs.rmSync(dirs.workspace,{recursive:true}),
    journal_exists:dirs=>{fs.mkdirSync(path.dirname(dirs.databasePath));fs.writeFileSync(dirs.databasePath,'');},
    journal_missing:()=>({journal:'existing'}),
    home_dir_unavailable:dirs=>{fs.rmSync(dirs.homeDir,{recursive:true});fs.writeFileSync(dirs.homeDir,'a file');},
  };
  for(const [code,arrange] of Object.entries(cases)){
    const dirs=place();
    const more=arrange(dirs)??{};
    const before=fs.readdirSync(dirs.root).sort();
    const seen=[];
    const {call,binding}=rig(t,{dirs,config:more,connect:options=>{seen.push(options);assert.fail(`${code}: nothing may be started`);}});
    const error=await declined(call('open'),code);
    assert.ok(error.refusal.next.length>5,code);
    assert.equal(seen.length,0,code);
    assert.deepEqual(fs.readdirSync(dirs.root).sort(),before,`${code}: nothing was created`);
    assert.deepEqual(copiesOf(dirs),[],code);
    assert.equal(binding.look().step,'not_opened',code);
    await declined(call('open'),code,`${code} again`);
  }
  // More ways to the same words.
  const more={
    bundle_unavailable:[dirs=>{fs.rmSync(dirs.bundlePath);fs.mkdirSync(dirs.bundlePath);},dirs=>{fs.renameSync(dirs.bundlePath,`${dirs.bundlePath}.real`);fs.symlinkSync(`${dirs.bundlePath}.real`,dirs.bundlePath);}],
    bun_unavailable:[()=>({bunPath:scratch}),dirs=>{const file=path.join(dirs.root,'not-executable');fs.writeFileSync(file,'x',{mode:0o600});return {bunPath:file};}],
    workspace_unavailable:[dirs=>{fs.rmSync(dirs.workspace,{recursive:true});fs.writeFileSync(dirs.workspace,'a file');}],
    journal_missing:[dirs=>{fs.mkdirSync(dirs.databasePath,{recursive:true});return {journal:'existing'};}],
    journal_exists:[dirs=>{fs.mkdirSync(path.dirname(dirs.databasePath));fs.symlinkSync(path.join(dirs.root,'nowhere'),dirs.databasePath);}],
  };
  for(const [code,list] of Object.entries(more))for(const [index,arrange] of list.entries()){
    const dirs=place();
    const {call}=rig(t,{dirs,config:arrange(dirs)??{},connect:()=>assert.fail(`${code} ${index}: nothing may be started`)});
    await declined(call('open'),code,`${code} ${index}`);
    assert.deepEqual(copiesOf(dirs),[],`${code} ${index}`);
  }
  // By its name the workspace is apart from homeDir; by its real path it is inside it. The link is made after the
  // binding, so that open's own check is the one that meets it: the config check meets it too (see the next test).
  {
    const dirs=place();
    const {call}=rig(t,{dirs,connect:()=>assert.fail('a linked workspace: nothing may be started')});
    fs.rmSync(dirs.workspace,{recursive:true});fs.mkdirSync(path.join(dirs.homeDir,'inner'));fs.symlinkSync(path.join(dirs.homeDir,'inner'),dirs.workspace);
    await declined(call('open'),'workspace_unavailable','a workspace linked into homeDir');
    assert.deepEqual(copiesOf(dirs),[]);
  }
  // A homeDir that cannot be created is refused as unavailable, with nothing created, and open can then be asked again.
  if(process.getuid?.()!==0){
    const dirs=place({home:false});
    const parent=path.join(dirs.root,'locked');
    fs.mkdirSync(parent,{mode:0o500});
    const homeDir=path.join(parent,'home');
    const {call,binding}=rig(t,{dirs,config:{homeDir},connect:transport([])});
    try{
      const error=await declined(call('open'),'home_dir_unavailable','a homeDir that cannot be created');
      assert.match(error.refusal.meaning,/could not be created/);
      assert.deepEqual(fs.readdirSync(parent),[],'nothing was created');
      assert.equal(binding.look().step,'not_opened');assert.equal(binding.look().open_failed_before,undefined);
      assert.equal(binding.look().writes_latched,false);
    }finally{fs.chmodSync(parent,0o700);}
    await call('open');
    assert.equal(binding.look().step,'open');
  }
  // After a declared refusal the same binding can open once the cause is gone.
  const dirs=place();
  const {call,binding}=rig(t,{dirs});
  fs.renameSync(dirs.bundlePath,`${dirs.bundlePath}.away`);
  await declined(call('open'),'bundle_unavailable');
  fs.renameSync(`${dirs.bundlePath}.away`,dirs.bundlePath);
  await call('open');
  assert.equal(binding.look().step,'open');
});

test('where the workspace is inside a git repository, that repository\'s top folder must be apart from homeDir and the journal too',async t=>{
  // Read in the pinned bundle: the backend asks git for the top level of the repository that holds the workspace, and
  // works there. The adapter looks for a `.git` entry by name, at the workspace and above it; it does not run git.
  const nothing=()=>assert.fail('nothing may be started');
  const inside=place();
  fs.mkdirSync(path.join(inside.root,'.git'));   // the folder that holds the workspace, homeDir and the journal's folder
  const before=fs.readdirSync(inside.root).sort();
  const error=await declined(rig(t,{dirs:inside,connect:nothing}).call('open'),'workspace_unavailable','a repository around all three');
  assert.match(error.refusal.meaning,/\.git/);
  assert.deepEqual(fs.readdirSync(inside.root).sort(),before);assert.deepEqual(copiesOf(inside),[]);
  // A `.git` that is a file counts too: a linked worktree has one.
  const linked=place();
  fs.writeFileSync(path.join(linked.root,'.git'),'gitdir: elsewhere\n');
  await declined(rig(t,{dirs:linked,connect:nothing}).call('open'),'workspace_unavailable','a .git file');
  // The workspace is itself the top of a repository: nothing above it is taken in, and open goes on.
  const top=place();
  fs.mkdirSync(path.join(top.workspace,'.git'));
  const own=rig(t,{dirs:top});
  await own.call('open');
  assert.equal(own.binding.look().step,'open');
  // The nearest one counts, as it does for git: a repository at the workspace, inside another.
  const nested=place();
  fs.mkdirSync(path.join(nested.root,'.git'));fs.mkdirSync(path.join(nested.workspace,'.git'));
  const near=rig(t,{dirs:nested});
  await near.call('open');
  assert.equal(near.binding.look().step,'open');
});

// Two spellings of one folder. On a volume that ignores case, the same folder in another case; on macOS, a folder
// of the data volume reached through /System/Volumes/Data. Each test is left out where its second spelling is not there.
const sameFolder=(a,b)=>{try{const x=fs.statSync(a),y=fs.statSync(b);return x.dev===y.dev&&x.ino===y.ino;}catch{return false;}};
const caseless=(()=>{
  const probe=path.join(scratch,'Case-Probe');
  fs.mkdirSync(probe);
  try{return sameFolder(probe,path.join(scratch,'case-probe'));}finally{fs.rmSync(probe,{recursive:true,force:true});}
})();
const shout=target=>path.join(path.dirname(target),path.basename(target).toUpperCase());
const secondPath=target=>{const other=path.join('/System/Volumes/Data',target);return other!==target&&sameFolder(other,target)?other:undefined;};
async function withHome(home,act){
  const saved=process.env.HOME;
  process.env.HOME=home;
  try{return await act();}finally{if(saved===undefined)delete process.env.HOME;else process.env.HOME=saved;}
}
function refusedConfig(value,reason,label){
  let error;
  try{checkCollabConfig(value);}catch(caught){error=caught;}
  assert.ok(error,`${label}: expected a refusal`);
  assert.equal(error.code,'INVALID_INPUT',label);assert.equal(error.reason,reason,label);
}
for(const [kind,other,skip] of [['another case',shout,caseless?false:'this volume tells case apart'],
  ['a second path',target=>secondPath(target),secondPath(scratch)?false:'no second path to the temporary folder was found']]){
  test(`the config compares folders, not spellings: ${kind} to the same folder is refused`,{skip},async()=>{
    const dirs=place();
    const good=configOf(dirs);
    // As the user's home: a folder made here, set as HOME for the length of the check.
    const home=path.join(dirs.root,'user-home');
    fs.mkdirSync(home);
    assert.ok(sameFolder(other(home),home));
    await withHome(home,()=>{
      refusedConfig({...good,homeDir:other(home)},'collab_config_home_is_user_home',`${kind}: the user home`);
      refusedConfig({...good,homeDir:other(dirs.root)},'collab_config_home_is_user_home',`${kind}: a folder that holds the user home`);
      checkCollabConfig(good);
    });
    refusedConfig({...good,workspace:path.join(other(dirs.homeDir),'inner')},'collab_config_workspace_not_apart',`${kind}: the workspace inside homeDir`);
    refusedConfig({...good,homeDir:path.join(other(dirs.workspace),'home')},'collab_config_workspace_not_apart',`${kind}: homeDir inside the workspace`);
    refusedConfig({...good,databasePath:path.join(other(dirs.workspace),'state','journal.json')},'collab_config_workspace_not_apart',`${kind}: the journal's folder inside the workspace`);
    const journalRoot=path.join(dirs.root,'journal-root');
    fs.mkdirSync(journalRoot);
    refusedConfig({...good,databasePath:path.join(journalRoot,'state','journal.json'),workspace:other(journalRoot)},'collab_config_workspace_not_apart',`${kind}: the workspace around the journal's folder`);
    // A link is followed: a workspace linked into homeDir is not apart from it.
    const linked=path.join(dirs.root,'linked-work');
    fs.mkdirSync(path.join(dirs.homeDir,'inner'));fs.symlinkSync(path.join(dirs.homeDir,'inner'),linked);
    refusedConfig({...good,workspace:linked},'collab_config_workspace_not_apart',`${kind}: a workspace linked into homeDir`);
  });
  test(`at open the guards compare folders too: ${kind} to homeDir is met`,{skip},async t=>{
    const nothing=()=>assert.fail('nothing may be started');
    // The repository around the workspace holds homeDir, which the config names by its other spelling. The journal is
    // kept outside that repository, so that homeDir is the one thing the repository holds.
    const dirs=place(),away=place();
    fs.mkdirSync(path.join(dirs.root,'.git'));
    const before=fs.readdirSync(dirs.root).sort();
    const r=rig(t,{dirs,config:{homeDir:path.join(other(dirs.root),'home'),databasePath:away.databasePath},connect:nothing});
    await declined(r.call('open'),'workspace_unavailable',`${kind}: a repository around homeDir`);
    assert.deepEqual(fs.readdirSync(dirs.root).sort(),before);
    // homeDir becomes the user's home after the binding was made: open looks again, by folder.
    const late=place();
    const bound=rig(t,{dirs:late,config:{homeDir:other(late.homeDir)},connect:nothing});
    await withHome(late.homeDir,()=>declined(bound.call('open'),'home_dir_unavailable',`${kind}: homeDir is now the user home`));
    assert.deepEqual(copiesOf(late),[]);
  });
}

test('an existing journal is opened only when the config says existing, and a second session joins the same workspace',async t=>{
  const first=await opened(t);
  const created=await first.call('task-create',{idempotency_key:KEY(),title:'Left for the next session'});
  await first.binding.close();
  const again=await opened(t,{dirs:first.dirs,config:{journal:'existing'}});
  assert.equal(again.session.journal,'existing');
  assert.equal(again.session.workspace_id,first.session.workspace_id);assert.notEqual(again.session.session_id,first.session.session_id);
  assert.equal((await again.call('task-get',{task_id:created.id})).title,'Left for the next session');
});

test('a failure of open after its first write is unknown, the step reached is kept, and open is not run twice',async t=>{
  const cases=[
    {label:'the backend does not start',control:{startup:'exit'},step:'spawned',before:'initialized'},
    {label:'another server version',control:{init:{server_version:'0.5.1'}},step:'spawned',before:'initialized'},
    {label:'another server name',control:{init:{server_name:'something-else'}},step:'spawned',before:'initialized'},
    {label:'another protocol',control:{init:{protocol:'2024-11-05'}},step:'spawned',before:'initialized'},
    {label:'no answer to initialize',control:{init:{hang:true}},config:{timeoutMs:200},step:'spawned',before:'initialized'},
    {label:'a tool is missing',control:{init:{tools:{collab_task_release:null}}},step:'initialized',before:'tools_checked'},
    {label:'the backend allows a shorter title than the card',control:{init:{tools:{collab_task_create:{title:{maxLength:100}}}}},step:'initialized',before:'tools_checked'},
    {label:'the backend allows fewer events than the card',control:{init:{tools:{collab_next:{event_limit:{maximum:20}}}}},step:'initialized',before:'tools_checked'},
    {label:'the backend does not list a word the adapter sends',control:{init:{tools:{collab_report_append:{kind:{enum:['observation','inference']}}}}},step:'initialized',before:'tools_checked'},
    {label:'the backend wants a version as text',control:{init:{tools:{collab_task_claim:{expected_version:{type:'string',exclusiveMinimum:null,maximum:null}}}}},step:'initialized',before:'tools_checked'},
    {label:'the backend needs an argument the adapter never sends',control:{init:{tools:{collab_task_get:{etag:{type:'string'},$required:['etag']}}}},step:'initialized',before:'tools_checked'},
    {label:'the session start is refused',control:{on:{collab_session_start:{refuse:{error:'repository_partitioned'}}}},step:'tools_checked',before:'open'},
    {label:'the session start answer is not understood',control:{on:{collab_session_start:'empty_result'}},step:'tools_checked',before:'open'},
    {label:'the backend ends during the session start',control:{on:{collab_session_start:'exit_after'}},step:'tools_checked',before:'open'},
  ];
  for(const item of cases){
    const {dirs,call,binding,seen}=rig(t,{control:item.control,config:item.config});
    await unknown(call('open'),item.label);
    const look=binding.look();
    assert.equal(look.step,item.step,item.label);assert.equal(look.open_failed_before,item.before,item.label);
    assert.deepEqual(look.last_call,{operation:'open',outcome:'unknown'},item.label);
    assert.equal(seen.length,1,item.label);
    // The backend open started is stopped when open fails, not left running until the session ends.
    assert.equal(look.transport,'closed',item.label);
    assert.ok(['open_failed','transport_closed','request_timeout'].includes(look.transport_closed_by),`${item.label}: ${look.transport_closed_by}`);
    assert.equal(running(dirs),false,`${item.label}: the backend process is gone`);
    await declined(call('open'),'already_open',`${item.label}: open again`);
    await declined(call('status'),'not_open',`${item.label}: status`);
    await declined(call('task-create',{idempotency_key:KEY(),title:'x'}),'not_open',`${item.label}: a write`);
    assert.equal(seen.length,1,`${item.label}: nothing more was started`);
    // The end: no write, the process is closed, the copy is removed, and the end is not called complete.
    const calls=callsOf(dirs).length;
    const report=await binding.close();
    assert.equal(report.complete,false,item.label);
    assert.ok(report.did_not.some(line=>/open/.test(line)),`${item.label}: ${JSON.stringify(report)}`);
    assert.ok(report.left_behind.some(line=>/not surveyed/.test(line)),item.label);
    assert.deepEqual(copiesOf(dirs),[],`${item.label}: the copy was removed`);
    assert.equal(callsOf(dirs).length,calls,`${item.label}: the end sent nothing`);
    assert.equal(JSON.stringify(report).includes(PLANTED),false);
  }
});

test('a program at bunPath that cannot be started leaves open unknown, and look says the start failed',async t=>{
  // The file passes the check before any write (it is a file this process may execute) and is not a program.
  const dirs=place();
  const notProgram=path.join(dirs.root,'not-a-program');
  fs.writeFileSync(notProgram,'\u0000\u0001 this is not a program\n',{mode:0o755});
  const {call,binding}=rig(t,{dirs,config:{bunPath:notProgram},connect:options=>spawnStdioEndpoint(options)});
  await unknown(call('open'),'a start that fails');
  const look=binding.look();
  assert.equal(look.step,'bundle_copied');assert.equal(look.open_failed_before,'spawned');assert.equal(look.transport,'not_started');
  assert.deepEqual(look.unknown_calls,[{operation:'open',why:'spawn_failed'}]);
  assert.equal(fs.existsSync(dirs.databasePath),false,'no backend ran, so no journal was made');
  const report=await binding.close();
  assert.equal(report.complete,false);
  assert.ok(report.did.some(line=>/removed the copy/.test(line)));
  assert.deepEqual(copiesOf(dirs),[]);
});

test('a backend whose stated bounds are wider than the card, or that states none, is accepted',async t=>{
  const {call}=await opened(t,{control:{init:{tools:{
    collab_task_create:{title:{maxLength:1000}},collab_next:{event_limit:{maximum:500}},collab_report_append:{body:{maxLength:null},kind:{enum:['observation','inference','proposal','decision','note']}},
    collab_task_claim:{expected_version:{exclusiveMinimum:null,minimum:1}}}}}});
  assert.equal((await call('status')).counts.open,0);
});

// ---------------------------------------------------------------- the operations

test('tasks, claims, reports and pages go through the stand-in as the cards say',async t=>{
  const {dirs,call,binding,session,gate}=await opened(t);
  const status=await call('status');
  assert.deepEqual(Object.keys(status).sort(),['active_session_ids','active_sessions_not_listed','counts','expired_claims','session_id','workspace_id']);
  assert.deepEqual(status.counts,{open:0,claimed:0,blocked:0,completed:0});
  assert.deepEqual(status.active_session_ids,[session.session_id]);
  const task=await call('task-create',{idempotency_key:'create-1',title:'  Compare two readings  '});
  assert.deepEqual(Object.keys(task).sort(),['effective_status','id','lease_expires_at','lease_id','status','title','version']);
  assert.equal(task.status,'open');assert.equal(task.version,1);assert.equal(task.lease_id,null);
  assert.equal(task.title,'Compare two readings','the backend keeps text trimmed, as the card says');
  assert.deepEqual(await call('task-get',{task_id:task.id}),task);
  assert.equal(journalOf(dirs).tasks[task.id].work_mode,'coordination','only a coordination task is made');
  const claimed=await call('task-claim',{task_id:task.id,idempotency_key:'claim-1',expected_version:task.version});
  assert.equal(claimed.status,'claimed');assert.equal(claimed.version,2);assert.match(claimed.lease_id,/^lease_/);assert.ok(Date.parse(claimed.lease_expires_at)>Date.now());
  assert.deepEqual(binding.look().claims,[task.id]);
  const report=await call('report',{idempotency_key:'report-1',kind:'observation',body:'The two readings differ at line 4.',limits:'One file was read.',task_id:task.id});
  assert.deepEqual(Object.keys(report),['report_id']);
  const stored=journalOf(dirs).reports[report.report_id];
  assert.equal(stored.confidence,'unknown');assert.equal(stored.relation,'informs');assert.deepEqual(stored.evidence_refs,[]);
  const released=await call('task-release',{task_id:task.id,idempotency_key:'release-1',expected_version:claimed.version});
  assert.equal(released.status,'open');assert.equal(released.version,3);assert.equal(released.lease_id,null);
  assert.deepEqual(binding.look().claims,[]);
  // A page is read without being acknowledged; the acknowledgement names exactly the page that was read.
  const page=await call('next',{event_limit:3});
  assert.deepEqual(Object.keys(page).sort(),['cursor_version','events','reports','session_id','workspace_id']);
  assert.equal(page.events.events.length,3);assert.equal(page.events.has_more,true);assert.equal(page.cursor_version,0);
  assert.deepEqual((await call('next',{event_limit:3})).events.next_anchor,page.events.next_anchor,'reading twice moves nothing');
  assert.deepEqual(binding.look().last_page,{anchor:page.events.next_anchor,cursor_version:0});
  assert.deepEqual(await call('acknowledge',{anchor:page.events.next_anchor,expected_cursor_version:page.cursor_version}),{cursor_version:1,moved:true});
  assert.equal(binding.look().last_page,null);
  const rest=await call('next',{event_limit:50});
  assert.equal(rest.events.has_more,false);assert.ok(rest.reports.some(item=>item.id===report.report_id));
  assert.deepEqual(await call('acknowledge',{anchor:rest.events.next_anchor,expected_cursor_version:rest.cursor_version}),{cursor_version:2,moved:true});
  // An empty page: its anchor is where the cursor already is. Acknowledging it moves nothing, and that is not a failure.
  const empty=await call('next');
  assert.equal(empty.events.events.length,0);
  assert.deepEqual(await call('acknowledge',{anchor:empty.events.next_anchor,expected_cursor_version:empty.cursor_version}),{cursor_version:2,moved:false});
  assert.equal(binding.look().writes_latched,false);
  // What was sent: one call for each request, and nothing the caller did not ask for.
  assert.deepEqual(callsOf(dirs),['collab_session_start','collab_workspace_status','collab_task_create','collab_task_get','collab_task_claim','collab_report_append','collab_task_release',
    'collab_next','collab_next','collab_cursor_ack','collab_next','collab_cursor_ack','collab_next','collab_cursor_ack']);
  assert.equal(gate.length,14,'the gate was asked for every call');
  const look=binding.look();
  assert.deepEqual(look.tasks,[{id:task.id,version:3,status:'open'}]);
  assert.ok(Buffer.byteLength(JSON.stringify(look))<=SESSION_LIMITS.look_bytes);
});

test('an input the card does not allow is refused by the runtime before the gate and before the backend',async t=>{
  const {dirs,call,gate}=await opened(t);
  const calls=callsOf(dirs).length,asked=gate.length;
  const anchor={epoch_id:'e',sequence:0,hash:'0'.repeat(64)};
  const cases=[
    ['task-create',{idempotency_key:'has space',title:'t'},'/idempotency_key','pattern'],
    ['task-create',{idempotency_key:'-starts-wrong',title:'t'},'/idempotency_key','pattern'],
    ['task-create',{idempotency_key:'k'.repeat(201),title:'t'},'/idempotency_key','maxLength'],
    ['task-create',{idempotency_key:'k',title:''},'/title','minLength'],
    ['task-create',{idempotency_key:'k',title:'   '},'/title','pattern'],
    ['task-create',{idempotency_key:'k',title:'a\u0000b'},'/title','pattern'],
    ['task-create',{idempotency_key:'k',title:'t'.repeat(301)},'/title','maxLength'],
    ['task-create',{idempotency_key:'k',title:'t',work_mode:'edit'},'','additionalProperties'],
    ['task-create',{title:'t'},'','required'],
    ['task-get',{task_id:'no/slash'},'/task_id','pattern'],
    ['task-claim',{task_id:'t',idempotency_key:'k',expected_version:0},'/expected_version','minimum'],
    ['task-claim',{task_id:'t',idempotency_key:'k',expected_version:'1'},'/expected_version','type'],
    ['task-claim',{task_id:'t',idempotency_key:'k',expected_version:1,ttl_seconds:60},'','additionalProperties'],
    ['task-release',{task_id:'t',idempotency_key:'k',expected_version:1,lease_id:'x'},'','additionalProperties'],
    ['report',{idempotency_key:'k',kind:'decision',body:'b'},'/kind','enum'],
    ['report',{idempotency_key:'k',kind:'observation',body:'b'.repeat(8001)},'/body','maxLength'],
    ['report',{idempotency_key:'k',kind:'observation',body:'b',limits:'l'.repeat(2001)},'/limits','maxLength'],
    ['report',{idempotency_key:'k',kind:'observation',body:'\n\t '},'/body','pattern'],
    ['next',{event_limit:51},'/event_limit','maximum'],
    ['next',{event_limit:0},'/event_limit','minimum'],
    ['acknowledge',{anchor:{...anchor,hash:'abc'},expected_cursor_version:0},'/anchor/hash','minLength'],
    ['acknowledge',{anchor:{...anchor,hash:'A'.repeat(64)},expected_cursor_version:0},'/anchor/hash','pattern'],
    ['acknowledge',{anchor:{...anchor,sequence:-1},expected_cursor_version:0},'/anchor/sequence','minimum'],
    ['acknowledge',{anchor},'','required'],
    ['status',{workspace_id:'ws_other'},'','additionalProperties'],
    ['open',{bundlePath:'/elsewhere'},'','additionalProperties'],
    ['status',null,'','type'],
  ];
  for(const [operation,input,pointer,keyword] of cases){
    await assert.rejects(call(operation,input),error=>{
      assert.equal(error.code,'INVALID_INPUT',`${operation} ${JSON.stringify(input).slice(0,60)}: ${error.code} ${error.refusal?.code??''}`);
      assert.equal(error.reason,'does_not_match_card');assert.equal(error.pointer,pointer);assert.equal(error.keyword,keyword);
      assert.equal(error.operation_started,false);assert.equal(error.effect_outcome,'not_attempted');
      return true;
    });
  }
  assert.equal(gate.length,asked,'the gate was not asked');
  assert.equal(callsOf(dirs).length,calls,'the backend was not asked');
});

// ---------------------------------------------------------------- the adapter's own refusals

test('before open, every other operation is declined as not_open and nothing is started',async t=>{
  const {dirs,call,seen,binding}=rig(t);
  const anchor={epoch_id:'e',sequence:0,hash:'0'.repeat(64)};
  const inputs={status:{},'task-get':{task_id:'t'},next:{},acknowledge:{anchor,expected_cursor_version:0},report:{idempotency_key:'k',kind:'observation',body:'b'},
    'task-create':{idempotency_key:'k',title:'t'},'task-claim':{task_id:'t',idempotency_key:'k',expected_version:1},'task-release':{task_id:'t',idempotency_key:'k',expected_version:1}};
  for(const [operation,input] of Object.entries(inputs))await declined(call(operation,input),'not_open',operation);
  assert.equal(seen.length,0);assert.deepEqual(fs.readdirSync(dirs.homeDir),[]);
  assert.deepEqual(binding.look().last_call,{operation:'task-release',outcome:'declined'});
});

test('while one call is in flight every other call is declined as busy, and the first still answers',async t=>{
  const {dirs,call,binding}=await opened(t);
  setControl(dirs,{on:{collab_task_create:{delay_ms:250}}});
  const first=call('task-create',{idempotency_key:KEY(),title:'Slow to answer'});
  await sleep(40);
  assert.equal(binding.look().in_flight,'task-create');
  await declined(call('status'),'busy','a read');
  await declined(call('task-create',{idempotency_key:KEY(),title:'Second'}),'busy','a write');
  await declined(call('open'),'busy','open');
  const task=await first;
  assert.equal(task.title,'Slow to answer');
  assert.equal(binding.look().in_flight,null);
  clearControl(dirs);
  assert.equal((await call('status')).counts.open,1,'only the first was made');
  // open in flight is busy too.
  const other=rig(t,{control:{on:{collab_session_start:{delay_ms:250}}}});
  const opening=other.call('open');
  await sleep(120);
  await declined(other.call('status'),'busy','status while open is in flight');
  await declined(other.call('open'),'busy','open while open is in flight');
  await opening;
});

test('an anchor is acknowledged only when it is the one this binding last read',async t=>{
  const {dirs,call}=await opened(t);
  const ack=(anchor,version)=>call('acknowledge',{anchor,expected_cursor_version:version});
  const made={epoch_id:'epoch_made_up',sequence:1,hash:'a'.repeat(64)};
  await declined(ack(made,0),'unobserved_anchor','before any page');
  const page=await call('next',{event_limit:1});
  await declined(ack({...page.events.next_anchor,sequence:page.events.next_anchor.sequence+1},page.cursor_version),'unobserved_anchor','another sequence');
  await declined(ack({...page.events.next_anchor,hash:'b'.repeat(64)},page.cursor_version),'unobserved_anchor','another hash');
  await declined(ack(page.events.next_anchor,page.cursor_version+1),'unobserved_anchor','another version');
  const calls=callsOf(dirs).length;
  await ack(page.events.next_anchor,page.cursor_version);
  await declined(ack(page.events.next_anchor,page.cursor_version),'unobserved_anchor','the same page twice');
  assert.equal(callsOf(dirs).length,calls+1,'only the true acknowledgement reached the backend');
});

test('a release is sent only for a claim this binding made, and a fifth claim is not sent',async t=>{
  const {dirs,call,binding}=await opened(t);
  const tasks=[];
  for(let i=0;i<5;i+=1)tasks.push(await call('task-create',{idempotency_key:KEY(),title:`Task ${i}`}));
  await declined(call('task-release',{task_id:tasks[0].id,idempotency_key:KEY(),expected_version:1}),'lease_not_held_by_module');
  const claims=[];
  for(const task of tasks.slice(0,4))claims.push(await call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1}));
  assert.equal(COLLAB_LIMITS.leases,4);
  const calls=callsOf(dirs).length;
  const error=await declined(call('task-claim',{task_id:tasks[4].id,idempotency_key:KEY(),expected_version:1}),'lease_limit');
  assert.match(error.refusal.meaning,/4/);
  assert.equal(callsOf(dirs).length,calls,'the fifth claim was not sent');
  assert.equal(journalOf(dirs).tasks[tasks[4].id].status,'open');
  await call('task-release',{task_id:tasks[0].id,idempotency_key:KEY(),expected_version:claims[0].version});
  await call('task-claim',{task_id:tasks[4].id,idempotency_key:KEY(),expected_version:1});
  assert.deepEqual(binding.look().claims.sort(),[tasks[1].id,tasks[2].id,tasks[3].id,tasks[4].id].sort());
});

test('text within the card\'s count and over the backend\'s is declined as text_too_long, not sent',async t=>{
  const {dirs,call}=await opened(t);
  const calls=callsOf(dirs).length;
  // The card counts characters; the backend counts UTF-16 units, and each of these characters is two.
  const wide=count=>'\u{1F600}'.repeat(count);
  await declined(call('task-create',{idempotency_key:KEY(),title:wide(151)}),'text_too_long','title');
  await declined(call('report',{idempotency_key:KEY(),kind:'observation',body:wide(4001)}),'text_too_long','body');
  await declined(call('report',{idempotency_key:KEY(),kind:'observation',body:'b',limits:wide(1001)}),'text_too_long','limits');
  assert.equal(callsOf(dirs).length,calls,'nothing was sent');
  assert.equal((await call('task-create',{idempotency_key:KEY(),title:wide(150)})).title,wide(150),'at the backend\'s limit it is sent');
});

test('a request frame over the transport\'s limit is declined as request_too_large, not sent',async t=>{
  const {dirs,call,binding}=await opened(t,{requestBytes:1024});
  const calls=callsOf(dirs).length;
  await declined(call('report',{idempotency_key:KEY(),kind:'observation',body:'b'.repeat(4000)}),'request_too_large','report');
  await declined(call('task-create',{idempotency_key:KEY(),title:'\u0001'.repeat(300)}),'request_too_large','task-create');
  assert.equal(callsOf(dirs).length,calls);
  assert.equal(binding.look().writes_latched,false,'a frame that was not sent leaves nothing unknown');
  assert.equal((await call('task-create',{idempotency_key:KEY(),title:'Short'})).status,'open');
});

test('under the card\'s own limits the largest request frame stays under the transport\'s limit',async t=>{
  // Every character here is written as six bytes in a JSON frame: the worst the card allows.
  const worst='\u0001'.repeat(7999)+'x';
  const {call}=await opened(t);
  const report=await call('report',{idempotency_key:'k'.repeat(200),kind:'observation',body:worst,limits:'\u0001'.repeat(1999)+'x'});
  assert.match(report.report_id,/^report_/);
});

// ---------------------------------------------------------------- what the backend refuses

// A card for a test: the shipped card with no refusal of the backend on it, then the ones the test names.
function cardWith(additions){
  const chosen=structuredClone(card);
  for(const op of Object.values(chosen.operations))op.backend_refusals=[];
  for(const [operation,codes] of Object.entries(additions))for(const code of codes){
    chosen.operations[operation].backend_refusals.push({code,meaning:`TEST CARD: the backend refused with ${code} before changing anything.`,next:'Read the current state.',
      sites:[{line:1,stage:'in_transaction_before_write'}]});
  }
  return chosen;
}

test('a refusal by the backend that the card does not list is unknown for a write and latches writes; reads go on',async t=>{
  const {dirs,call,binding}=await opened(t);
  const task=await call('task-create',{idempotency_key:KEY(),title:'Contested'});
  const calls=callsOf(dirs).length;
  // A plain refusal with a code the shipped card does not list for task-claim: one of the backend's that was not read for listing.
  setControl(dirs,{on:{collab_task_claim:{refuse:{error:'path_scope_conflict'}}}});
  await unknown(call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1}),'path_scope_conflict');
  clearControl(dirs);
  assert.equal(callsOf(dirs).length,calls+1,'sent once, not sent again');
  const look=binding.look();
  assert.equal(look.writes_latched,true);assert.equal(look.transport,'running');
  assert.deepEqual(look.unknown_calls,[{operation:'task-claim',why:'backend_refusal_not_on_card'}]);
  assert.deepEqual(look.last_call,{operation:'task-claim',outcome:'unknown'});
  assert.equal(JSON.stringify(look).includes(PLANTED),false);
  // Every write is now declined, and none reaches the backend.
  const anchor={epoch_id:'e',sequence:0,hash:'0'.repeat(64)};
  const writes={next:{},acknowledge:{anchor,expected_cursor_version:0},report:{idempotency_key:KEY(),kind:'observation',body:'b'},'task-create':{idempotency_key:KEY(),title:'t'},
    'task-claim':{task_id:task.id,idempotency_key:KEY(),expected_version:1},'task-release':{task_id:task.id,idempotency_key:KEY(),expected_version:1}};
  for(const [operation,input] of Object.entries(writes)){
    const error=await declined(call(operation,input),'earlier_outcome_unknown',operation);
    assert.match(error.refusal.next,/status|task-get|inspect/);
  }
  assert.equal(callsOf(dirs).length,calls+1);
  // The read-only look: status and task-get still answer, and say what the journal holds.
  assert.equal((await call('task-get',{task_id:task.id})).status,'open');
  assert.equal((await call('status')).counts.open,1);
});

test('a refusal by the backend is passed on only when the card lists the code, the answer is a plain refusal, and no success key is in it',async t=>{
  const chosen=cardWith({'task-claim':['version_conflict','task_claimed'],'task-get':['task_not_found'],'task-release':['lease_expired']});
  const {dirs,call,binding}=await opened(t,{card:chosen});
  const task=await call('task-create',{idempotency_key:KEY(),title:'Contested'});
  // Listed, plain, nothing written: declined, with the card's words and none of the backend's.
  const stale=await declined(call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:9}),'version_conflict');
  assert.match(stale.refusal.meaning,/^TEST CARD/);
  await declined(call('task-get',{task_id:'task_absent'}),'task_not_found');
  assert.equal(binding.look().writes_latched,false,'a declared refusal leaves nothing unknown');
  const claimed=await call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
  // The backend's own second refusal on the same operation, also listed.
  const second=rig(t,{dirs,card:chosen,config:{journal:'existing',actor:'xenia-second-actor'}});
  await second.call('open');
  await declined(second.call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version}),'task_claimed');
  assert.equal(second.binding.look().writes_latched,false);
  // The lease runs out on the stand-in's clock: the release is refused with a listed code.
  setControl(dirs,{clock_ms:3600*1000});
  await declined(call('task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version}),'lease_expired');
  clearControl(dirs);
  // The same code where the card does not list it stays unknown.
  await unknown(second.call('task-create',{idempotency_key:'same-key',title:'One'}).then(()=>second.call('task-claim',{task_id:'task_absent',idempotency_key:KEY(),expected_version:1})),'task_not_found on task-claim');
  assert.deepEqual(second.binding.look().unknown_calls,[{operation:'task-claim',why:'backend_refusal_not_on_card'}]);
});

test('a listed code is not passed on when the answer is not a plain refusal',async t=>{
  const chosen=cardWith({'task-create':['idempotency_conflict']});
  const shapes=[
    ['with the success key beside the error',{refuse:{error:'idempotency_conflict',task:{id:'task_x',version:1,status:'open'}}},'backend_refusal_not_on_card'],
    ['with no message',{refuse:{error:'idempotency_conflict',message:null}},'backend_refusal_not_on_card'],
    ['with a code that is not text',{refuse:{error:{code:'idempotency_conflict'}}},'backend_refusal_not_on_card'],
    ['with another code',{refuse:{error:'internal_error'}},'backend_refusal_not_on_card'],
    ['with text only, as for an input the tool refuses','no_structured','backend_refusal_not_on_card'],
    ['as a JSON-RPC error','rpc_error','rpc_error'],
    ['as a success with nothing in it','empty_result','answer_not_understood'],
  ];
  for(const [label,rule,why] of shapes){
    const {dirs,call,binding}=await opened(t,{card:chosen});
    const calls=callsOf(dirs).length;
    setControl(dirs,{on:{collab_task_create:rule}});
    await unknown(call('task-create',{idempotency_key:KEY(),title:'t'}),label);
    assert.deepEqual(binding.look().unknown_calls,[{operation:'task-create',why}],label);
    assert.equal(binding.look().transport,'running',label);
    assert.equal(callsOf(dirs).length,calls+1,`${label}: sent once`);
    clearControl(dirs);
    await declined(call('task-create',{idempotency_key:KEY(),title:'t'}),'earlier_outcome_unknown',label);
    assert.equal((await call('status')).counts.open>=0,true,`${label}: reads go on`);
  }
  // The plain refusal with the listed code is passed on by the same card.
  const {dirs,call,binding}=await opened(t,{card:chosen});
  setControl(dirs,{on:{collab_task_create:{refuse:{error:'idempotency_conflict',operation:'task.create.v2'}}}});
  await declined(call('task-create',{idempotency_key:KEY(),title:'t'}),'idempotency_conflict');
  assert.equal(binding.look().writes_latched,false);
});

test('each refusal the shipped card lists comes back declined from the stand-in, in the card\'s words, with the stand-in\'s journal as it was',async t=>{
  // What this shows: what the adapter does when a backend answers these codes the way the stand-in does, which leaves
  // its journal file untouched on a refusal. It does not show that the real backend leaves its journal untouched.
  const a=await opened(t);
  const done=new Set();
  const edit=(dirs,change)=>{const journal=journalOf(dirs);change(journal);fs.writeFileSync(dirs.databasePath,JSON.stringify(journal));};
  async function refusedBy(r,operation,input,code){
    const at=`${operation} ${code}`;
    const before=fs.readFileSync(r.dirs.databasePath),sent=callsOf(r.dirs).length;
    const error=await declined(r.call(operation,input),code,at);
    const entry=card.operations[operation].backend_refusals.find(item=>item.code===code);
    assert.ok(entry,`${at}: on the shipped card`);
    assert.deepEqual(error.refusal,{code,meaning:entry.meaning,next:entry.next},at);
    assert.equal(callsOf(r.dirs).length,sent+1,`${at}: sent once`);
    assert.ok(fs.readFileSync(r.dirs.databasePath).equals(before),`${at}: the stand-in's journal file is byte for byte as it was`);
    const look=r.binding.look();
    assert.equal(look.writes_latched,false,at);assert.deepEqual(look.unknown_calls,[],at);assert.equal(look.transport,'running',at);
    assert.deepEqual(look.last_call,{operation,outcome:'declined'},at);
    done.add(at);
  }
  await refusedBy(a,'task-get',{task_id:'task_absent'},'task_not_found');
  const task=await a.call('task-create',{idempotency_key:'used-key-1',title:'Contested'});
  await refusedBy(a,'task-create',{idempotency_key:'used-key-1',title:'Another title under the same key'},'idempotency_conflict');
  await a.call('report',{idempotency_key:'used-key-2',kind:'observation',body:'first'});
  await refusedBy(a,'report',{idempotency_key:'used-key-2',kind:'observation',body:'second'},'idempotency_conflict');
  await refusedBy(a,'report',{idempotency_key:KEY(),kind:'observation',body:'about a task that is not there',task_id:'task_absent'},'task_not_found');
  await refusedBy(a,'task-claim',{task_id:'task_absent',idempotency_key:KEY(),expected_version:1},'task_not_found');
  await refusedBy(a,'task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:9},'version_conflict');
  await refusedBy(a,'task-claim',{task_id:task.id,idempotency_key:'used-key-1',expected_version:1},'idempotency_conflict');
  // Another hand changes the journal: the task is completed, then blocked, then open again.
  edit(a.dirs,journal=>{journal.tasks[task.id].status='completed';});
  await refusedBy(a,'task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1},'task_completed');
  edit(a.dirs,journal=>{journal.tasks[task.id].status='blocked';});
  await refusedBy(a,'task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1},'task_blocked');
  edit(a.dirs,journal=>{journal.tasks[task.id].status='open';});
  const claimed=await a.call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
  assert.deepEqual(a.binding.look().claims,[task.id]);
  // A second binding on the same journal meets the first one's claim, live and then run out.
  const b=rig(t,{dirs:a.dirs,config:{journal:'existing',actor:'xenia-second-actor'}});
  await b.call('open');
  await refusedBy(b,'task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version},'task_claimed');
  setControl(a.dirs,{clock_ms:3600*1000});
  await refusedBy(b,'task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version},'recovery_required');
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version},'lease_expired');
  clearControl(a.dirs);
  assert.deepEqual(b.binding.look().claims,[],'a refused claim is not remembered');
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:9},'version_conflict');
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:'used-key-1',expected_version:claimed.version},'idempotency_conflict');
  edit(a.dirs,journal=>{journal.tasks[task.id].lease_id='lease_of_someone_else';});
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version},'lease_not_holder');
  edit(a.dirs,journal=>{Object.assign(journal.tasks[task.id],{status:'open',assignee:null,assignee_session_id:null,lease_id:null,lease_expires_at:null});});
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version},'lease_not_active');
  edit(a.dirs,journal=>{delete journal.tasks[task.id];});
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:claimed.version},'task_not_found');
  // A refused release leaves what the binding remembers as it was: the claim is still listed.
  assert.deepEqual(a.binding.look().claims,[task.id]);
  // The cursor: the session's cursor version moves under a page the binding has read.
  const page=await a.call('next');
  assert.ok(page.events.next_anchor.sequence>0,'the page holds events, so the acknowledgement would move the cursor');
  edit(a.dirs,journal=>{journal.sessions[a.session.session_id].cursor_version+=1;});
  const ack={anchor:page.events.next_anchor,expected_cursor_version:page.cursor_version};
  await refusedBy(a,'acknowledge',ack,'cursor_version_conflict');
  // The native session stops being accepted: its generation moves on, as after a resume elsewhere.
  edit(a.dirs,journal=>{journal.sessions[a.session.session_id].generation+=1;});
  await refusedBy(a,'acknowledge',ack,'session_auth_failed');
  await refusedBy(a,'report',{idempotency_key:KEY(),kind:'observation',body:'b'},'session_auth_failed');
  await refusedBy(a,'task-create',{idempotency_key:KEY(),title:'t'},'session_auth_failed');
  await refusedBy(a,'task-claim',{task_id:'task_x',idempotency_key:KEY(),expected_version:1},'session_auth_failed');
  await refusedBy(a,'task-release',{task_id:task.id,idempotency_key:KEY(),expected_version:1},'session_auth_failed');
  // Every pair the card lists was met here, and no other.
  assert.deepEqual([...done].sort(),Object.entries(LISTED).flatMap(([operation,codes])=>codes.map(code=>`${operation} ${code}`)).sort());
  // The same answer on `next` is not passed on: in the pinned bundle one of the places that raise it for that tool
  // comes after a commit. It is unknown, and the binding then sends no more writes. Reads go on.
  const sent=callsOf(a.dirs).length;
  await unknown(a.call('next'),'session_auth_failed on next');
  assert.equal(callsOf(a.dirs).length,sent+1);
  assert.deepEqual(a.binding.look().unknown_calls,[{operation:'next',why:'backend_refusal_not_on_card'}]);
  await declined(a.call('report',{idempotency_key:KEY(),kind:'observation',body:'b'}),'earlier_outcome_unknown');
  assert.equal((await a.call('status')).counts.open>=0,true);
});

test('a read that fails does not latch writes while the backend still answers',async t=>{
  const {dirs,call,binding}=await opened(t);
  // A refusal of a read with a code the card does not list for it.
  setControl(dirs,{on:{collab_task_get:{refuse:{error:'workspace_not_found'}}}});
  await unknown(call('task-get',{task_id:'task_absent'}),'an unlisted refusal of a read');
  setControl(dirs,{on:{collab_workspace_status:'rpc_error'}});
  await unknown(call('status'),'a JSON-RPC error on a read');
  clearControl(dirs);
  const look=binding.look();
  assert.equal(look.writes_latched,false);assert.deepEqual(look.unknown_calls,[]);assert.equal(look.transport,'running');
  assert.deepEqual(look.last_call,{operation:'status',outcome:'failed'});
  assert.equal((await call('task-create',{idempotency_key:KEY(),title:'Still writable'})).status,'open');
});

// ---------------------------------------------------------------- the transport

test('a backend that ends in the middle of a write leaves the outcome unknown, whichever side of the write it ended on',async t=>{
  for(const rule of ['exit_before','exit_after']){
    const {dirs,call,binding}=await opened(t);
    const calls=callsOf(dirs).length;
    setControl(dirs,{on:{collab_task_create:rule}});
    await unknown(call('task-create',{idempotency_key:KEY(),title:'Was it made'}),rule);
    clearControl(dirs);
    const look=binding.look();
    assert.equal(look.transport,'closed',rule);assert.equal(look.transport_closed_by,'transport_closed',rule);
    assert.equal(look.writes_latched,true,rule);
    assert.deepEqual(look.unknown_calls,[{operation:'task-create',why:'transport_closed'}],rule);
    // The adapter's answer is the same either way; only the journal knows which it was.
    assert.equal(Object.keys(journalOf(dirs).tasks).length,rule==='exit_after'?1:0,rule);
    assert.equal(callsOf(dirs).length,calls+1,`${rule}: sent once`);
    await declined(call('task-create',{idempotency_key:KEY(),title:'Again'}),'earlier_outcome_unknown',rule);
    await declined(call('status'),'backend_not_running',`${rule}: a read`);
    await declined(call('task-get',{task_id:'t'}),'backend_not_running',`${rule}: another read`);
    assert.equal(callsOf(dirs).length,calls+1,`${rule}: nothing more was sent`);
  }
});

test('an answer over the frame limit, or one that is not JSON, stops the backend and says nothing it held',async t=>{
  for(const [rule,by] of [['oversize','response_too_large'],['garbage','invalid_response']]){
    // On a read: no write is in doubt, so nothing latches; the backend is gone, so reads and writes say so.
    const read=await opened(t);
    setControl(read.dirs,{on:{collab_workspace_status:rule}});
    await unknown(read.call('status'),`${rule} on a read`);
    clearControl(read.dirs);
    let look=read.binding.look();
    assert.equal(look.transport,'closed');assert.equal(look.transport_closed_by,by);assert.equal(look.writes_latched,false);
    await declined(read.call('status'),'backend_not_running',`${rule}: after a read`);
    await declined(read.call('task-create',{idempotency_key:KEY(),title:'t'}),'backend_not_running',`${rule}: a write after a read`);
    // On a write: the write was applied before the answer was lost.
    const write=await opened(t);
    setControl(write.dirs,{on:{collab_task_create:rule}});
    await unknown(write.call('task-create',{idempotency_key:KEY(),title:'Applied, answer lost'}),`${rule} on a write`);
    clearControl(write.dirs);
    look=write.binding.look();
    assert.equal(look.transport_closed_by,by);assert.equal(look.writes_latched,true);
    assert.deepEqual(look.unknown_calls,[{operation:'task-create',why:by}]);
    if(rule==='oversize')assert.equal(Object.keys(journalOf(write.dirs).tasks).length,1,'the write had happened');
    await declined(write.call('task-create',{idempotency_key:KEY(),title:'t'}),'earlier_outcome_unknown',`${rule}: after a write`);
  }
});

test('a backend that does not answer is given up on at the request timeout, and the call is not sent again',async t=>{
  for(const rule of ['hang_before','hang_after']){
    const {dirs,call,binding}=await opened(t,{config:{timeoutMs:300}});
    const calls=callsOf(dirs).length;
    setControl(dirs,{on:{collab_task_claim:rule,collab_task_create:undefined}});
    const task=await call('task-create',{idempotency_key:KEY(),title:'To claim'});
    const started=Date.now();
    await unknown(call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1}),rule);
    const took=Date.now()-started;
    assert.ok(took>=250&&took<3000,`${rule}: answered after ${took} ms`);
    clearControl(dirs);
    const look=binding.look();
    assert.equal(look.transport,'closed');assert.equal(look.transport_closed_by,'request_timeout');
    assert.deepEqual(look.unknown_calls,[{operation:'task-claim',why:'request_timeout'}]);
    assert.deepEqual(look.claims,[],'a claim that was not confirmed is not counted as held');
    assert.equal(journalOf(dirs).tasks[task.id].status,rule==='hang_after'?'claimed':'open',rule);
    assert.equal(callsOf(dirs).length,calls+2,`${rule}: one create and one claim`);
  }
});

// ---------------------------------------------------------------- the end

test('close does nothing when open was never started, and says so once',async t=>{
  const {binding,seen}=rig(t);
  const report=await binding.close();
  assert.deepEqual(report,{complete:true,did:[],did_not:[],left_behind:[]});
  assert.equal(await binding.close(),report,'the same report, not a second run');
  assert.equal(seen.length,0);
  assert.equal(binding.look().step,'not_opened');
});

test('close releases the claims this binding holds and only those, ends its native session, stops the process and removes the copy',async t=>{
  const first=await opened(t);
  const second=rig(t,{dirs:first.dirs,config:{journal:'existing',actor:'xenia-second-actor'}});
  second.session=await second.call('open');
  const mine=[],theirs=await second.call('task-create',{idempotency_key:KEY(),title:'The other session\'s'});
  for(let i=0;i<2;i+=1)mine.push(await first.call('task-create',{idempotency_key:KEY(),title:`Mine ${i}`}));
  for(const task of mine)await first.call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
  const held=await second.call('task-claim',{task_id:theirs.id,idempotency_key:KEY(),expected_version:1});
  const calls=callsOf(first.dirs).length;
  const report=await first.binding.close();
  assert.equal(report.complete,true,JSON.stringify(report));
  assert.deepEqual(report.did_not,[]);
  assert.equal(report.did.filter(line=>/^released the claim on task /.test(line)).length,2);
  assert.ok(report.did.some(line=>/ended the native session/.test(line)));
  assert.ok(report.did.some(line=>/closed the backend process/.test(line)));
  assert.ok(report.did.some(line=>/removed the copy of the bundle/.test(line)));
  assert.ok(report.left_behind.some(line=>/journal/.test(line)&&/not surveyed/.test(line)),'the journal stays, and the end says it did not look at it');
  for(const line of [...report.did,...report.did_not,...report.left_behind]){assert.ok(line.length<=512);assert.equal(line.includes(first.dirs.root),false,'no path in a line of the report');}
  // What reached the backend at the end: one read and one release for each claim, then the end of the session.
  assert.deepEqual(callsOf(first.dirs).slice(calls),['collab_task_get','collab_task_release','collab_task_get','collab_task_release','collab_session_end']);
  const journal=journalOf(first.dirs);
  for(const task of mine){assert.equal(journal.tasks[task.id].status,'open');assert.equal(journal.tasks[task.id].completed_at,null,'released, not completed');}
  assert.equal(journal.tasks[theirs.id].lease_id,held.lease_id,'the other session\'s claim is untouched');
  assert.equal(journal.sessions[first.session.session_id].status,'ended');assert.equal(journal.sessions[second.session.session_id].status,'active');
  const credentials=fs.readdirSync(path.join(path.dirname(first.dirs.databasePath),'collab-sessions'));
  assert.deepEqual(credentials,[`${second.session.session_id}.json`],'only the ended session\'s credential file is gone');
  assert.equal(copiesOf(first.dirs).length,1,'the other binding\'s copy is still there');
  assert.equal(first.binding.look().step,'closed');
  assert.equal(await first.binding.close(),report);
  await declined(first.call('status'),'not_open','after close');
  // The peer goes on working.
  assert.equal((await second.call('status')).counts.claimed,1);
  assert.equal((await second.binding.close()).complete,true);
  assert.deepEqual(copiesOf(first.dirs),[]);
  assert.equal(fs.existsSync(first.dirs.databasePath),true,'the journal is kept');
});

test('after an unknown outcome close writes nothing more, and names what it knows it left',async t=>{
  const {dirs,call,binding,session}=await opened(t);
  const task=await call('task-create',{idempotency_key:KEY(),title:'Held'});
  await call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
  setControl(dirs,{on:{collab_report_append:'rpc_error'}});
  await unknown(call('report',{idempotency_key:KEY(),kind:'observation',body:'b'}));
  clearControl(dirs);
  const calls=callsOf(dirs).length;
  const report=await binding.close();
  assert.equal(report.complete,false);
  assert.equal(callsOf(dirs).length,calls,'nothing was sent at the end');
  assert.ok(report.did_not.some(line=>/release/.test(line)&&/unknown/.test(line)),JSON.stringify(report.did_not));
  assert.ok(report.did.some(line=>/closed the backend process/.test(line)));assert.ok(report.did.some(line=>/removed the copy/.test(line)));
  const left=report.left_behind.join('\n');
  assert.ok(left.includes(session.session_id),'the native session id');assert.ok(left.includes(session.workspace_id),'the workspace id');
  assert.ok(left.includes(task.id),'the task whose claim was not released');
  assert.match(left,/collab-sessions/);assert.match(left,/not surveyed/);
  assert.equal(left.includes(dirs.root),false);
  assert.equal(journalOf(dirs).tasks[task.id].status,'claimed','the claim is still in the journal');
  assert.equal(journalOf(dirs).sessions[session.session_id].status,'active');
  assert.deepEqual(copiesOf(dirs),[]);
});

test('with a call still pending close writes nothing, stops the process, and does not wait for the call',async t=>{
  const {dirs,call,binding}=await opened(t,{config:{timeoutMs:5000}});
  setControl(dirs,{on:{collab_task_create:'hang_after'}});
  const pending=call('task-create',{idempotency_key:KEY(),title:'Never answered'}).then(()=>'returned',error=>error.code);
  await sleep(150);
  const calls=callsOf(dirs).length,started=Date.now();
  const report=await binding.close();
  assert.ok(Date.now()-started<3000,'close did not wait for the request timeout');
  assert.equal(report.complete,false);
  assert.ok(report.did_not.some(line=>/pending|still running/.test(line)),JSON.stringify(report.did_not));
  assert.equal(callsOf(dirs).length,calls);
  assert.equal(await pending,'OPERATION_FAILED','the pending call is answered as unknown when the process is stopped');
  assert.deepEqual(copiesOf(dirs),[]);
});

test('once close() has begun, every call is declined before anything is sent, and the end goes on as it would',async t=>{
  const {dirs,call,binding}=await opened(t);
  const closing=binding.close();
  const sent=callsOf(dirs).length;
  await declined(call('task-create',{idempotency_key:KEY(),title:'made while closing'}),'not_open','a write while closing');
  await declined(call('status'),'not_open','a read while closing');
  await declined(call('open'),'already_open','open while closing');
  const report=await closing;
  assert.equal(report.complete,true,JSON.stringify(report));
  assert.deepEqual(Object.keys(journalOf(dirs).tasks),[],'no task was made');
  assert.ok(callsOf(dirs).length>=sent);
  assert.equal(callsOf(dirs).slice(sent).some(line=>/collab_task_create|collab_workspace_status/.test(line)),false,'neither call reached the backend');
});

test('a release the backend refuses at the end stops the end there: the session is not ended and the task is named',async t=>{
  const {dirs,call,binding,session}=await opened(t);
  const tasks=[];
  for(let i=0;i<2;i+=1){
    const task=await call('task-create',{idempotency_key:KEY(),title:`Held ${i}`});
    await call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
    tasks.push(task);
  }
  setControl(dirs,{on:{collab_task_release:{refuse:{error:'lease_not_holder'}}}});
  const calls=callsOf(dirs).length;
  const report=await binding.close();
  assert.equal(report.complete,false);
  assert.deepEqual(callsOf(dirs).slice(calls),['collab_task_get','collab_task_release'],'the first refused release was the last thing sent');
  assert.ok(report.did_not.some(line=>/native session/.test(line)));
  const left=report.left_behind.join('\n');
  for(const task of tasks)assert.ok(left.includes(task.id));
  assert.ok(left.includes(session.session_id));
  assert.equal(JSON.stringify(report).includes(PLANTED),false);
});

test('a claim the journal no longer shows as this binding\'s is not released at the end',async t=>{
  const {dirs,call,binding}=await opened(t);
  const task=await call('task-create',{idempotency_key:KEY(),title:'Lease will run out'});
  await call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
  // Another hand changes the journal: the lease now belongs to someone else.
  const journal=journalOf(dirs);
  journal.tasks[task.id].lease_id='lease_of_someone_else';journal.tasks[task.id].assignee_session_id='session_of_someone_else';
  fs.writeFileSync(dirs.databasePath,JSON.stringify(journal));
  const calls=callsOf(dirs).length;
  const report=await binding.close();
  assert.deepEqual(callsOf(dirs).slice(calls),['collab_task_get','collab_session_end']);
  assert.ok(report.did.some(line=>/no longer/.test(line)&&line.includes(task.id)),JSON.stringify(report.did));
  assert.equal(report.complete,true);
});

test('close keeps to its own time limit when the backend stops answering at the end',async t=>{
  const {dirs,call,binding}=await opened(t,{config:{timeoutMs:400}});
  const task=await call('task-create',{idempotency_key:KEY(),title:'Held'});
  await call('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1});
  setControl(dirs,{on:{collab_task_release:'hang_after'}});
  const started=Date.now();
  const report=await binding.close();
  assert.ok(Date.now()-started<COLLAB_LIMITS.close_budget_ms,`took ${Date.now()-started} ms`);
  assert.equal(report.complete,false);
  assert.ok(report.did_not.some(line=>/release/.test(line)&&/not known/.test(line)),JSON.stringify(report.did_not));
  assert.ok(report.left_behind.join('\n').includes(task.id));
  assert.deepEqual(copiesOf(dirs),[]);
});

// ---------------------------------------------------------------- the door

function parseLine(text){
  const value=JSON.parse(text);
  assert.equal(JSON.stringify(value),text,'an output line is compact JSON');
  return value;
}
function openSession(options){
  const input=new PassThrough(),output=new PassThrough();
  const lines=[];let pending='',cursor=0,wake=()=>{};
  output.on('data',chunk=>{
    pending+=chunk.toString('utf8');
    for(let at=pending.indexOf('\n');at>=0;at=pending.indexOf('\n')){lines.push({text:pending.slice(0,at),value:parseLine(pending.slice(0,at))});pending=pending.slice(at+1);}
    wake();
  });
  const session=runSession({input,output,...options});
  const next=async(limit=15000)=>{
    const stop=Date.now()+limit;
    while(lines.length<=cursor){
      assert.ok(Date.now()<stop,`no line within ${limit} ms`);
      let timer;
      await Promise.race([new Promise(resolve=>{wake=resolve;}),new Promise(resolve=>{timer=setTimeout(resolve,100);})]);
      clearTimeout(timer);
    }
    return lines[cursor++];
  };
  let n=0;
  const ask=async(request,limit)=>{input.write(`${JSON.stringify({id:`r${n+=1}`,...request})}\n`);return (await next(limit)).value;};
  const invoke=(operation,value={},more={})=>ask({method:'invoke',module:COLLAB_ID,operation,input:value,...more});
  const end=async()=>{input.end();const done=await session.done;return {done,last:lines.at(-1).value};};
  return {session,next,ask,invoke,end,lines};
}
function boundSession(t,{allow=ALLOW_ALL,config:more={},card:chosenCard,control,dirs=place()}={}){
  if(control)setControl(dirs,control);
  const seen=[];
  const binding=bindCollab({config:checkCollabConfig(configOf(dirs,more)),configSha256:'c'.repeat(64),pin:PIN,connect:transport(seen),...(chosenCard?{card:chosenCard}:{})});
  t.after(async()=>{clearControl(dirs);await binding.close();});
  return {...openSession({bindings:[binding],allow}),dirs,binding,seen};
}

test('the door lists the bound module, what its end writes without the gate, and what it is bound to',async t=>{
  const s=boundSession(t);
  const first=await s.next();
  assert.ok(Buffer.byteLength(first.text)+1<=SESSION_LIMITS.session_start_bytes,`session_start is ${Buffer.byteLength(first.text)+1} bytes`);
  const start=first.value;
  assert.equal(start.kind,'session_start');
  const row=start.modules.find(item=>item.id===COLLAB_ID);
  assert.equal(row.bound,true);assert.equal(row.state,'registered');
  assert.deepEqual(row.operations.map(op=>op.id),OPS);
  assert.ok(row.operations.every(op=>op.allowed===true&&op.effects.length>=1));
  assert.ok(Array.isArray(row.at_end)&&row.at_end.length>=2);
  assert.match(row.at_end.join(' '),/releases/);assert.match(row.at_end.join(' '),/gate is not asked/);
  assert.deepEqual(row.at_end,s.binding.at_end);
  assert.deepEqual(start.gate.allow,[...ALLOW_ALL].sort());
  // inspect: the module, what it holds in memory, and what it was bound to.
  const inspected=await s.ask({method:'inspect',module:COLLAB_ID});
  assert.ok(Buffer.byteLength(JSON.stringify(inspected))+1<=SESSION_LIMITS.module_inspect_bytes);
  assert.equal(inspected.result.look.step,'not_opened');
  const boundTo=inspected.result.bound_to;
  assert.deepEqual(Object.keys(boundTo).sort(),['actor','bun_path','bundle_path','config_sha256','database_path','home_dir','journal','pin','timeout_ms','workspace']);
  assert.equal(boundTo.config_sha256,'c'.repeat(64));assert.equal(boundTo.actor,'xenia-test-actor');
  assert.equal(boundTo.home_dir,s.dirs.homeDir);assert.equal(boundTo.workspace,s.dirs.workspace);assert.equal(boundTo.database_path,s.dirs.databasePath);
  assert.deepEqual(boundTo.pin,{bundle_sha256:PIN.bundle_sha256,server_version:'0.5.0'});
  // inspect of one operation: its card, enforced by the runtime, and its deadline.
  const opened=await s.ask({method:'inspect',module:COLLAB_ID,operation:'open'});
  assert.equal(opened.result.operation.input_checked_by,'runtime');
  assert.deepEqual(opened.result.deadline_ms,{default:s.binding.deadlines.open,cap:30000});
  assert.ok(s.binding.deadlines.open>10000&&s.binding.deadlines.open<=30000,'open talks to the backend three times, so it states a longer deadline');
  assert.deepEqual(Object.keys(s.binding.deadlines),['open']);
  const claim=await s.ask({method:'inspect',module:COLLAB_ID,operation:'task-claim'});
  // The adapter's own five, and the backend's that the card lists for a claim, in one list sorted by code.
  assert.deepEqual(claim.result.operation.refusals.map(r=>r.code),[...['backend_not_running','busy','earlier_outcome_unknown','lease_limit','not_open'],...LISTED['task-claim']].sort());
  assert.equal(claim.result.deadline_ms.default,10000);
  const {done,last}=await s.end();
  assert.equal(done.exit_code,0);assert.deepEqual(last.cleanup,{complete:true,did:[`closed ${COLLAB_ID} to new calls`],did_not:[],left_behind:[]});
  assert.equal(s.seen.length,0,'a session that only looked started nothing');
});

test('at the door the gate decides, a whole exchange runs, and the end releases, ends and removes',async t=>{
  const blocked=boundSession(t,{allow:[`${COLLAB_ID}:status`]});
  await blocked.next();
  await blocked.ask({method:'activate',module:COLLAB_ID});
  const refused=await blocked.invoke('open');
  assert.equal(refused.error.code,'POLICY_BLOCKED');assert.equal(blocked.seen.length,0);
  assert.equal((await blocked.end()).done.exit_code,0);

  const s=boundSession(t);
  await s.next();
  await s.ask({method:'activate',module:COLLAB_ID});
  const open=await s.invoke('open');
  assert.equal(open.ok,true,JSON.stringify(open));
  assert.deepEqual(open.receipt.effects,['local-read','local-write']);assert.equal(open.receipt.deadline_ms,s.binding.deadlines.open);
  const task=(await s.invoke('task-create',{idempotency_key:KEY(),title:'Through the door'})).result;
  const claimed=(await s.invoke('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:1})).result;
  assert.equal(claimed.status,'claimed');
  const miss=await s.invoke('task-create',{idempotency_key:'not valid',title:'t'});
  assert.equal(miss.error.code,'INVALID_INPUT');assert.equal(miss.error.pointer,'/idempotency_key');
  const no=await s.invoke('task-release',{task_id:'task_never_claimed',idempotency_key:KEY(),expected_version:1});
  assert.equal(no.error.code,'DECLINED');assert.equal(no.error.refusal.code,'lease_not_held_by_module');
  assert.deepEqual(checkRequest(no.problem.next_actions[0].request,no.problem.next_actions[0].needs).ok,true);
  // A refusal of the backend that the card lists: one line, declined, with the card's words and what that does not establish.
  const stale=await s.invoke('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:9});
  const listed=card.operations['task-claim'].backend_refusals.find(entry=>entry.code==='version_conflict');
  assert.equal(stale.ok,false);assert.equal(stale.error.code,'DECLINED');assert.equal(stale.error.effect_outcome,'not_applied');
  assert.deepEqual(stale.error.refusal,{code:'version_conflict',meaning:listed.meaning,next:listed.next});
  assert.ok(stale.not_established.some(line=>/not_applied is the module’s own declaration/.test(line)),JSON.stringify(stale.not_established));
  assert.deepEqual(checkRequest(stale.problem.next_actions[0].request,stale.problem.next_actions[0].needs).ok,true);
  assert.equal(JSON.stringify(stale).includes(PLANTED),false);
  // The card a session shows for the operation has the refusal and not the places it was read at; `explain` has those.
  const shown=(await s.ask({method:'inspect',module:COLLAB_ID,operation:'task-claim'})).result.operation;
  assert.ok(shown.refusals.some(entry=>entry.code==='version_conflict'&&entry.meaning===listed.meaning));
  assert.equal(JSON.stringify(shown).includes('"sites"'),false);
  const look=(await s.ask({method:'inspect',module:COLLAB_ID})).result.look;
  assert.deepEqual(look.claims,[task.id]);assert.equal(look.step,'open');assert.equal(look.writes_latched,false,'a declared refusal latches nothing');
  const {done,last}=await s.end();
  assert.equal(done.exit_code,0,JSON.stringify(last.cleanup));
  assert.equal(last.cleanup.complete,true);
  assert.ok(last.cleanup.did.includes(`${COLLAB_ID}: released the claim on task ${task.id}`));
  assert.ok(last.cleanup.did.some(line=>line.startsWith(`${COLLAB_ID}: ended the native session`)));
  assert.ok(last.cleanup.left_behind.some(line=>line.startsWith(`${COLLAB_ID}: `)&&/journal/.test(line)));
  assert.equal(journalOf(s.dirs).tasks[task.id].status,'open');
  assert.deepEqual(copiesOf(s.dirs),[]);
});

test('at the door, a backend refusal is worded as the module\'s declaration, not as something observed',async t=>{
  const s=boundSession(t);
  await s.next();
  await s.ask({method:'activate',module:COLLAB_ID});
  await s.invoke('open');
  const task=(await s.invoke('task-create',{idempotency_key:KEY(),title:'Stale'})).result;
  const refused=await s.invoke('task-claim',{task_id:task.id,idempotency_key:KEY(),expected_version:task.version+5});
  assert.equal(refused.error.code,'DECLINED');assert.equal(refused.error.refusal.code,'version_conflict');
  assert.equal(refused.problem.detail.includes('before any change'),false,refused.problem.detail);
  assert.ok(refused.problem.detail.startsWith('The operation declined, and its module declares that nothing was applied: '),refused.problem.detail);
  assert.ok(refused.not_established.some(line=>/not_applied is the module’s own declaration/.test(line)));
  await s.end();
});

test('timeout order one: the request timeout comes before the session deadline, and the call is answered as failed, effect unknown',async t=>{
  const s=boundSession(t,{config:{timeoutMs:300}});
  await s.next();
  await s.ask({method:'activate',module:COLLAB_ID});
  await s.invoke('open');
  setControl(s.dirs,{on:{collab_task_create:'hang_after'}});
  const started=Date.now();
  const answer=await s.invoke('task-create',{idempotency_key:KEY(),title:'Applied, never answered'});
  assert.ok(Date.now()-started<5000);
  assert.equal(answer.error.code,'OPERATION_FAILED');assert.equal(answer.error.effect_outcome,'unknown');assert.equal(answer.receipt.deadline_ms,10000);
  assert.equal(answer.problem.next_actions[0].request.method,'inspect');
  const inspected=await s.ask({method:'inspect',module:COLLAB_ID});
  assert.deepEqual(inspected.result.look.unknown_calls,[{operation:'task-create',why:'request_timeout'}]);
  assert.equal(inspected.result.look.transport,'closed');
  assert.equal((await s.ask({method:'inspect'})).result.late.count,0,'nothing ran past its deadline');
  const again=await s.invoke('task-create',{idempotency_key:KEY(),title:'Again'});
  assert.equal(again.error.refusal.code,'earlier_outcome_unknown');
  const read=await s.invoke('status');
  assert.equal(read.error.refusal.code,'backend_not_running');
  const {done,last}=await s.end();
  assert.equal(done.exit_code,1);assert.equal(last.cleanup.complete,false);
  assert.equal(Object.keys(journalOf(s.dirs).tasks).length,1,'the task the caller was told nothing certain about is in the journal');
});

// Ask the session until no call is still running past its deadline; gives what `late` then shows.
async function settledLate(s,limit=10000){
  for(const stop=Date.now()+limit;;){
    const late=(await s.ask({method:'inspect'})).result.late;
    if(late.pending===0)return late;
    assert.ok(Date.now()<stop,`a late call had not settled after ${limit} ms`);
    await sleep(50);
  }
}

test('timeout order two: the session deadline comes first, the call runs on, and the binding shows how it ended',async t=>{
  // Late and returned: the session answered DEADLINE_EXCEEDED, then the backend answered.
  const s=boundSession(t,{config:{timeoutMs:5000}});
  await s.next();
  await s.ask({method:'activate',module:COLLAB_ID});
  await s.invoke('open');
  setControl(s.dirs,{on:{collab_task_create:{delay_ms:500}}});
  const answer=await s.invoke('task-create',{idempotency_key:KEY(),title:'Answered late'},{deadline_ms:100});
  assert.equal(answer.error.code,'DEADLINE_EXCEEDED');assert.equal(answer.error.effect_outcome,'unknown');
  const busy=await s.invoke('status');
  assert.equal(busy.error.code,'DECLINED');assert.equal(busy.error.refusal.code,'busy');
  assert.equal((await s.ask({method:'inspect',module:COLLAB_ID})).result.look.in_flight,'task-create');
  const late=await settledLate(s);
  clearControl(s.dirs);
  assert.deepEqual(late.rows.map(row=>[row.operation,row.settled]),[['task-create','returned']]);
  const look=(await s.ask({method:'inspect',module:COLLAB_ID})).result.look;
  assert.equal(look.in_flight,null);assert.equal(look.writes_latched,false);
  assert.deepEqual(look.last_call,{operation:'task-create',outcome:'returned'});
  assert.equal(look.tasks.length,1,'the binding remembers the task the late answer named');
  const read=await s.invoke('task-get',{task_id:look.tasks[0].id});
  assert.equal(read.result.title,'Answered late');
  assert.equal((await s.end()).done.exit_code,0);

  // Late and never answered: the request timeout ends it after the deadline did.
  const h=boundSession(t,{config:{timeoutMs:600}});
  await h.next();
  await h.ask({method:'activate',module:COLLAB_ID});
  await h.invoke('open');
  setControl(h.dirs,{on:{collab_task_create:'hang_before'}});
  const first=await h.invoke('task-create',{idempotency_key:KEY(),title:'Never answered'},{deadline_ms:100});
  assert.equal(first.error.code,'DEADLINE_EXCEEDED');
  assert.deepEqual((await settledLate(h)).rows.map(row=>row.settled),['failed']);
  clearControl(h.dirs);
  const after=(await h.ask({method:'inspect',module:COLLAB_ID})).result.look;
  assert.deepEqual(after.unknown_calls,[{operation:'task-create',why:'request_timeout'}]);assert.equal(after.transport,'closed');
  const {done,last}=await h.end();
  assert.equal(done.exit_code,1);assert.equal(last.cleanup.complete,false);
});

test('a binding states what its end writes and what it is bound to within limits, or the session does not start',async t=>{
  const module={id:'bound.fixture',version:'0.1.0',contract:'bound.fixture/1',title:'Bound fixture',motif:'exit',description:'A fixture.',operations:{echo:{description:'Echo.',effects:[],run:input=>input}}};
  const start=async binding=>{
    const s=openSession({bindings:[binding]});
    const first=(await s.next()).value;
    if(first.kind==='session_start')await s.end();
    return first;
  };
  const ok=await start({module,at_end:['Writes one line to a file of its own.'],bound_to:{place:'somewhere'}});
  assert.equal(ok.kind,'session_start');
  assert.deepEqual(ok.modules[0].at_end,['Writes one line to a file of its own.']);
  for(const [label,more] of Object.entries({
    'at_end is not a list of short strings':{at_end:'one string'},
    'an at_end line is too long':{at_end:['x'.repeat(513)]},
    'too many at_end lines':{at_end:Array.from({length:9},()=>'a line')},
    'bound_to is not JSON data':{bound_to:{when:new Date(0)}},
    'bound_to is over its limit':{bound_to:{text:'x'.repeat(SESSION_LIMITS.bound_to_bytes)}},
    'a key the binding form does not have':{also:1},
  })){
    const first=await start({module,...more});
    assert.equal(first.kind,'session_not_started',label);
    assert.equal(first.error.code,'INVALID_MODULE',label);assert.equal(first.error.reason,'binding_not_usable',label);
  }
});

// ---------------------------------------------------------------- the command line

function runCli(args,{input='',timeout=20000}={}){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout,input,env:{PATH:process.env.PATH,HOME:process.env.HOME}});
  assert.equal(result.error,undefined);assert.equal(result.stderr,'');
  return result;
}
const linesOf=stdout=>stdout.split('\n').filter(Boolean).map(parseLine);
const request=(id,more)=>`${JSON.stringify({id:String(id),...more})}\n`;

test('the adapter is listed as not bound by arrive, catalog and explain, and a session without the flag does not have it',async()=>{
  const arrive=JSON.parse(runCli(['arrive']).stdout);
  const row=arrive.here.adapters.find(item=>item.id===COLLAB_ID);
  assert.equal(row.bound,false);assert.deepEqual(row.effects,['local-read','local-write']);assert.ok(Object.keys(row.requires).length>=1);
  assert.match(row.requires.config,/session --collab-config/);
  assert.match(arrive.read_only_commands.find(item=>item.argv[0]==='explain').what,/adapter id/);
  const catalog=JSON.parse(runCli(['catalog']).stdout);
  assert.equal(catalog.modules.some(item=>item.id===COLLAB_ID),false,'not among the registered modules');
  const listed=catalog.adapters.find(item=>item.id===COLLAB_ID);
  assert.equal(listed.bound,false);assert.deepEqual(listed.operations.map(op=>op.id).sort(),OPS);
  assert.match(listed.bound_by,/session --collab-config/);
  const explained=JSON.parse(runCli(['explain',COLLAB_ID]).stdout);
  assert.equal(explained.bound,false);assert.equal(explained.module.id,COLLAB_ID);assert.equal(explained.module.state,undefined);
  // explain shows the whole card: the schema, the refusals of both kinds, and the does list.
  const claim=explained.module.operations.find(op=>op.id==='task-claim');
  assert.deepEqual(claim.input.schema,card.operations['task-claim'].input.schema);
  assert.deepEqual(claim.does,card.operations['task-claim'].does);
  assert.deepEqual(claim.refusals,card.operations['task-claim'].refusals);
  // The backend's refusals are shown with the places each was read at, and with the reading they come from.
  assert.deepEqual(claim.backend_refusals,card.operations['task-claim'].backend_refusals);
  assert.ok(claim.backend_refusals.length>=1&&claim.backend_refusals.every(entry=>entry.sites.length>=1));
  assert.deepEqual(explained.backend_reading,card.backend_reading);
  assert.deepEqual(explained.refusals,card.refusals,'each code is worded once, in one table');
  assert.equal(explained.module.operations.length,9);
  assert.equal(explained.card_file,'agent-first/0.1/adapters/agenttool-collab/card.json');
  assert.ok(explained.not_established.length>=2);
  // The static row is what the real factory declares.
  const meta=ADAPTER_META.find(item=>item.id===COLLAB_ID);
  const dirs=place();
  const real=bindCollab({config:checkCollabConfig(configOf(dirs)),configSha256:'c'.repeat(64),pin:PIN}).module;
  assert.equal(meta.version,real.version);assert.equal(meta.contract,real.contract);assert.equal(meta.title,real.title);
  assert.deepEqual(meta.operations.map(op=>[op.id,op.effects]).sort(),Object.entries(real.operations).map(([id,op])=>[id,[...op.effects]]).sort());
  assert.equal(adapterRows().length,4);assert.equal(describeAdapter(COLLAB_ID).bound,false);
  // The row is read from the card. A card that is not one gives no row: it is named as not listed, never made up.
  assert.deepEqual(ADAPTERS_NOT_LISTED,[]);
  assert.equal(cardMeta(card,'x').id,COLLAB_ID);
  for(const broken of [null,{},{...card,module:{...card.module,title:''}},{...card,operations:{open:{description:'d',effects:'local-read'}}},{...card,bound_by:undefined}]){
    assert.throws(()=>cardMeta(broken,'x'),TypeError);
  }
  // arrive names an adapter that has no row, so a shorter list is not read as the whole.
  const {buildArrival}=await import(new URL('arrive.mjs',kit).href);
  const missing=[{id:COLLAB_ID,card_file:'agent-first/0.1/adapters/agenttool-collab/card.json',why:'The card could not be read as an adapter card.'}];
  assert.deepEqual(buildArrival({lock:null,core:[],adapters:[],notListed:missing,networkNote:'',report:{}}).here.adapters_not_listed,missing);
  assert.equal(Object.hasOwn(buildArrival({lock:null,core:[],adapters:[],networkNote:'',report:{}}).here,'adapters_not_listed'),false);
  // A session without the flag: three modules, none of them this one.
  const [start,end]=linesOf(runCli(['session']).stdout);
  assert.deepEqual(start.modules.map(item=>item.id),['xenia.covenant','xenia.surface','xenia.work']);
  assert.equal(end.kind,'session_end');
});

test('a session without --collab-config loads no adapter code',()=>{
  const dir=fs.mkdtempSync(path.join(scratch,'hooks-'));
  fs.writeFileSync(path.join(dir,'hooks.mjs'),`import fs from 'node:fs';
    export async function resolve(s,c,n){const r=await n(s,c);fs.appendFileSync(${JSON.stringify(path.join(dir,'seen.txt'))},r.url+'\\n');return r;}`);
  fs.writeFileSync(path.join(dir,'reg.mjs'),`import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(path.join(dir,'hooks.mjs')).href)},import.meta.url);`);
  const result=spawnSync(process.execPath,['--import',pathToFileURL(path.join(dir,'reg.mjs')).href,cli,'session'],{cwd:dir,encoding:'utf8',timeout:20000,input:'',env:{PATH:process.env.PATH}});
  assert.equal(result.status,0,result.stderr+result.stdout);
  const seen=fs.readFileSync(path.join(dir,'seen.txt'),'utf8');
  assert.match(seen,/session\.mjs/);
  assert.equal(/adapters\//.test(seen),false,'no adapter file was resolved');
  assert.equal(/child_process/.test(seen),false,'nothing that starts a process was loaded');
});

test('session --collab-config binds the adapter; the gate and the kit\'s own pin still stand between the caller and a backend',()=>{
  const dirs=place({home:false});
  const file=path.join(dirs.root,'collab.json');
  fs.writeFileSync(file,JSON.stringify(configOf(dirs)));
  const before=fs.readdirSync(dirs.root).sort();
  // Without --allow: listed, bound, inspectable, and every operation is blocked by the gate.
  const lines=linesOf(runCli(['session','--collab-config',file],{input:request(1,{method:'inspect',module:COLLAB_ID})+request(2,{method:'activate',module:COLLAB_ID})+
    request(3,{method:'invoke',module:COLLAB_ID,operation:'open',input:{}})+request(4,{method:'invoke',module:COLLAB_ID,operation:'status',input:{}})}).stdout);
  const [start,inspected,,open,status,end]=lines;
  assert.deepEqual(start.modules.map(item=>item.id),[COLLAB_ID,'xenia.covenant','xenia.surface','xenia.work']);
  const row=start.modules[0];
  assert.equal(row.bound,true);assert.ok(row.at_end.length>=2);assert.ok(row.operations.every(op=>op.allowed===false));
  assert.equal(inspected.result.bound_to.config_sha256,sha(fs.readFileSync(file)));
  assert.equal(inspected.result.bound_to.pin.bundle_sha256,lock.collab.bundle_sha256);
  assert.equal(inspected.result.bound_to.workspace,dirs.workspace);
  assert.equal(open.error.code,'POLICY_BLOCKED');assert.equal(status.error.code,'POLICY_BLOCKED');
  assert.equal(end.exit_code,0);
  // With --allow: open is admitted, and the bundle the config names is not the pinned one.
  const allowed=runCli(['session','--allow',`${COLLAB_ID}:open,${COLLAB_ID}:status`,'--collab-config',file],{input:request(1,{method:'activate',module:COLLAB_ID})+
    request(2,{method:'invoke',module:COLLAB_ID,operation:'open',input:{}})+request(3,{method:'invoke',module:COLLAB_ID,operation:'status',input:{}})+request(4,{method:'inspect',module:COLLAB_ID})});
  const [start2,,open2,status2,look,end2]=linesOf(allowed.stdout);
  assert.deepEqual(start2.gate.allow,[`${COLLAB_ID}:open`,`${COLLAB_ID}:status`]);
  assert.equal(open2.error.code,'DECLINED');assert.equal(open2.error.refusal.code,'pin_mismatch');assert.equal(open2.error.effect_outcome,'not_applied');
  assert.equal(open2.problem.terminal,false);assert.equal(open2.problem.next_actions[0].request.operation,'open');
  assert.equal(status2.error.refusal.code,'not_open');
  assert.equal(look.result.look.step,'not_opened');
  assert.equal(allowed.status,0);assert.equal(end2.cleanup.complete,true);
  assert.deepEqual(fs.readdirSync(dirs.root).sort(),before,'nothing was created: no home, no journal, no copy');
  // An --allow entry is checked against the modules of this session, the bound one among them.
  const wrong=runCli(['session','--allow',`${COLLAB_ID}:nope`,'--collab-config',file]);
  assert.equal(wrong.status,2);
  const [refusal]=linesOf(wrong.stdout);
  assert.equal(refusal.error.reason,'allow_names_no_effect_declaring_operation');
  assert.deepEqual(refusal.problem.valid,ALLOW_ALL);
});

test('a config the door cannot use is one session_not_started line that says which rule, and starts nothing',()=>{
  const dirs=place({home:false});
  const file=path.join(dirs.root,'collab.json');
  const start=(args,expectedExit,code,reason)=>{
    const result=runCli(['session',...args]);
    const lines=linesOf(result.stdout);
    assert.equal(lines.length,1);assert.equal(lines[0].kind,'session_not_started');
    assert.equal(lines[0].error.code,code,result.stdout);assert.equal(lines[0].error.reason,reason);
    assert.equal(result.status,expectedExit);
    assert.equal(lines[0].problem.terminal,false);
    assert.ok(lines[0].problem.next_actions.some(action=>JSON.stringify(action.argv)==='["help","session"]'));
    for(const action of lines[0].problem.next_actions)assert.deepEqual(checkArgv(action.argv,action.needs),{ok:true});
    assert.equal(result.stdout.includes('SENTINEL'),false,'nothing that was typed or read is repeated');
    return lines[0];
  };
  start(['--collab-config','relative-SENTINEL.json'],2,'INVALID_ARGUMENTS','collab_config_not_absolute');
  start(['--collab-config',path.join(dirs.root,'absent-SENTINEL.json')],1,'INVALID_INPUT','missing');
  fs.writeFileSync(file,'{"SENTINEL":');
  start(['--collab-config',file],1,'INVALID_INPUT','not_json');
  fs.writeFileSync(file,JSON.stringify({...configOf(dirs),bundlePath:'SENTINEL/relative.js'}));
  const relative=start(['--collab-config',file],1,'INVALID_INPUT','collab_config_path_not_absolute');
  assert.equal(relative.error.pointer,'/bundlePath');
  assert.match(relative.problem.detail,/bundlePath/);
  fs.writeFileSync(file,JSON.stringify({...configOf(dirs),bundleSha256:'SENTINEL'}));
  const extra=start(['--collab-config',file],1,'INVALID_INPUT','collab_config_does_not_match');
  assert.equal(extra.error.keyword,'additionalProperties');
  assert.equal(extra.error.expected.includes('bundleSha256'),false,'the digest is not the caller\'s to state');
  fs.writeFileSync(file,JSON.stringify({...configOf(dirs),homeDir:process.env.HOME}));
  start(['--collab-config',file],1,'INVALID_INPUT','collab_config_home_is_user_home');
  assert.equal(fs.existsSync(dirs.homeDir),false);
  const twice=runCli(['session','--collab-config',file,'--collab-config',file]);
  assert.equal(twice.status,2);assert.equal(linesOf(twice.stdout)[0].error.code,'INVALID_ARGUMENTS');
});

test('help, arrive and the one-shot invoke say where the adapter is reached',()=>{
  const help=JSON.parse(runCli(['help','session']).stdout);
  assert.match(help.usage,/--collab-config <absolute-file>/);
  assert.ok(help.rules.some(rule=>/--collab-config/.test(rule)&&/pin/.test(rule)));
  assert.ok(help.rules.some(rule=>/at_end/.test(rule)));
  assert.ok(JSON.parse(runCli(['help']).stdout).commands.some(line=>/^session .*--collab-config/.test(line)));
  assert.deepEqual(checkArgv(['session','--collab-config','/somewhere/collab.json']),{ok:true});
  assert.deepEqual(checkArgv(['session','--allow','a.b:c','--collab-config','/somewhere/collab.json']),{ok:true});
  assert.equal(checkArgv(['session','--collab-config']).ok,false);
  // The one sentence about the network now names the session too.
  assert.match(NETWORK_NOTE,/`session --collab-config`/);
  assert.match(NETWORK_NOTE,/`door check` is the only command in which this kit's own code sends requests/);
  // invoke has no gate: it points to the door that has one.
  const file=path.join(scratch,'empty-input.json');
  fs.writeFileSync(file,'{}');
  const result=runCli(['invoke',COLLAB_ID,'status','--input',file]);
  assert.equal(result.status,1);
  const out=JSON.parse(result.stdout);
  assert.equal(out.error.code,'HOST_GATE_REQUIRED');assert.equal(out.error.operation_started,false);
  assert.deepEqual(out.problem.next_actions[0].argv,['help','session']);
  assert.match(out.problem.detail,/session/);assert.match(out.problem.detail,/--collab-config/);
  const notBound=buildProblem({code:'MODULE_NOT_BOUND',module:COLLAB_ID},{argv:['invoke'],moduleIds:[COLLAB_ID]});
  assert.deepEqual(notBound.next_actions[0].argv,['help','session']);
  const other=buildProblem({code:'MODULE_NOT_BOUND',module:'agenttool.telescope-surface'},{argv:['invoke'],moduleIds:['agenttool.telescope-surface']});
  assert.equal(other.next_actions.some(action=>action.argv[1]==='session'),false,'only the module the session can bind points there');
});

test('through the process wiring the CLI uses: a whole exchange over real pipes, and an end that leaves the journal and nothing else of its own',async t=>{
  const dirs=place();
  const child=path.join(dirs.root,'door-child.mjs');
  fs.writeFileSync(child,`
    import {runSessionProcess} from ${JSON.stringify(new URL('session.mjs',kit).href)};
    import {createXeniaModules} from ${JSON.stringify(new URL('modules.mjs',kit).href)};
    import {bindCollab,checkCollabConfig} from ${JSON.stringify(adapterUrl.href)};
    import {spawnStdioEndpoint} from ${JSON.stringify(new URL('adapters/agenttool-collab/stdio.mjs',kit).href)};
    const config=checkCollabConfig(JSON.parse(process.argv[2]));
    const binding=bindCollab({config,configSha256:'c'.repeat(64),pin:JSON.parse(process.argv[3]),connect:options=>spawnStdioEndpoint({...options,args:[options.args.at(-1)]})});
    const result=await runSessionProcess({modules:createXeniaModules(),bindings:[binding],allow:JSON.parse(process.argv[4])});
    process.exit(result.exit_code);
  `);
  const proc=spawn(process.execPath,[child,JSON.stringify(configOf(dirs)),JSON.stringify(PIN),JSON.stringify(ALLOW_ALL)],{cwd:dirs.root,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  proc.stdout.on('data',chunk=>{stdout+=chunk;});proc.stderr.on('data',chunk=>{stderr+=chunk;});
  const answered=async count=>{
    const stop=Date.now()+15000;
    while(stdout.split('\n').length-1<count){assert.ok(Date.now()<stop,`fewer than ${count} lines: ${stdout.slice(-300)} ${stderr}`);await sleep(20);}
    return linesOf(stdout);
  };
  await answered(1);
  proc.stdin.write(request(1,{method:'activate',module:COLLAB_ID})+request(2,{method:'invoke',module:COLLAB_ID,operation:'open',input:{}}));
  const open=(await answered(3))[2];
  assert.equal(open.ok,true,JSON.stringify(open));
  proc.stdin.write(request(3,{method:'invoke',module:COLLAB_ID,operation:'task-create',input:{idempotency_key:'door-1',title:'Over a real pipe'}}));
  const task=(await answered(4))[3].result;
  proc.stdin.write(request(4,{method:'invoke',module:COLLAB_ID,operation:'task-claim',input:{task_id:task.id,idempotency_key:'door-2',expected_version:1}}));
  assert.equal((await answered(5))[4].result.status,'claimed');
  proc.stdin.end();
  const [exit]=await once(proc,'exit');
  assert.equal(stderr,'');assert.equal(exit,0,stdout.slice(-600));
  const end=linesOf(stdout).at(-1);
  assert.equal(end.kind,'session_end');assert.equal(end.cleanup.complete,true);
  assert.ok(end.cleanup.did.includes(`${COLLAB_ID}: released the claim on task ${task.id}`));
  const journal=journalOf(dirs);
  assert.equal(journal.tasks[task.id].status,'open');assert.equal(journal.sessions[open.result.session_id].status,'ended');
  assert.deepEqual(copiesOf(dirs),[]);
  assert.deepEqual(fs.readdirSync(path.join(path.dirname(dirs.databasePath),'collab-sessions')),[]);
  assert.equal(stdout.includes(PLANTED),false,'no backend text on any line');
});
