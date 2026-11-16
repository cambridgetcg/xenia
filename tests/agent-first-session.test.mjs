// SPDX-License-Identifier: MPL-2.0
// The `session` door: one process that reads requests as JSON lines and
// answers each with one JSON line, on the kit runtime.
//
// Three ways in, and what each one shows:
// - the exported function, with fixture modules and in-memory streams;
// - the CLI itself, spawned, with the three core modules it registers;
// - a child script written here that hands fixture modules to the same
//   process wiring the CLI uses, for what the core modules cannot do: a
//   handler that is slow, or never settles, behind a real stdin and a real
//   signal.
// Nothing here touches the network, and no provider, adapter or Collab
// server is started, read or written. Every line any session printed in this
// file went through `parseLine`, which fails unless the line is exactly one
// compact JSON object.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {Decline} from '../agent-first/0.1/runtime.mjs';
import {PROBLEM_CODES,REFUSAL_CODES,REQUEST_METHODS,REQUEST_REASONS,SESSION_PROBLEM_CODES,buildProblem,checkArgv,checkRequest} from '../agent-first/0.1/problems.mjs';

const kit=new URL('../agent-first/0.1/',import.meta.url);
const kitDir=fileURLToPath(kit);
const cli=path.join(kitDir,'cli.mjs');
const {runSession,SESSION_LIMITS}=await import(new URL('session.mjs',kit).href);

const work=fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()),'xenia-session-'));
test.after(()=>fs.rmSync(work,{recursive:true,force:true}));

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tick=async(turns=3)=>{for(let i=0;i<turns;i+=1)await new Promise(resolve=>setImmediate(resolve));};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

// One output line is one compact JSON object, and nothing else.
let linesSeen=0;
function parseLine(text){
  linesSeen+=1;
  assert.equal(text.includes('\r'),false,'no carriage return in an output line');
  const value=JSON.parse(text);
  assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value),`an output line is one JSON object: ${text.slice(0,80)}`);
  assert.equal(JSON.stringify(value),text,'an output line is compact JSON, as JSON.stringify writes it');
  return value;
}
const OK_KEYS=['id','line','ok','method','receipt','state','outcome','result','not_established'];
const ERROR_KEYS=['id','line','ok','method','receipt','state','error','problem','not_established'];
function assertOk(response,label=''){
  assert.deepEqual(Object.keys(response),OK_KEYS,label);
  assert.equal(response.ok,true,label);assert.equal(response.outcome,'returned',label);
  assert.ok(Array.isArray(response.not_established)&&response.not_established.length>0,label);
}
// A failed request: the error, a problem that is terminal or names requests for this session, and what stays open.
function assertRefused(response,code,label=code){
  assert.deepEqual(Object.keys(response),ERROR_KEYS,label);
  assert.equal(response.ok,false,label);
  assert.equal(response.error.code,code,`${label}: ${JSON.stringify(response.error)}`);
  const problem=response.problem;
  assert.equal(problem.code,code,label);
  assert.equal(typeof problem.detail,'string',label);assert.ok(problem.detail.length>10&&problem.detail.length<700,label);
  if(problem.terminal)assert.deepEqual(problem.next_actions,[],label);
  else assert.ok(problem.next_actions.length>=1,label);
  for(const action of problem.next_actions){
    assert.equal(action.argv,undefined,`${label}: a session problem never gives an argv`);
    assert.deepEqual(checkRequest(action.request,action.needs).ok,true,`${label}: ${JSON.stringify(action)}`);
    assert.equal(typeof action.why,'string',label);assert.ok(action.why.length>3,label);
  }
  assert.ok(Array.isArray(response.not_established)&&response.not_established.length>0,label);
}

const PUT_SCHEMA={type:'object',additionalProperties:false,required:['title'],properties:{title:{type:'string',minLength:1,maxLength:40}}};
function fixture({calls=[],gates={}}={}){
  return {id:'fixture.tools',version:'1.2.3',contract:'fixture.tools/1',title:'Fixture tools',motif:'bounded-work',description:'Fixture operations for the session tests.',
    operations:{
      echo:{description:'Return the input.',effects:[],input:{summary:'Any JSON value.',example:{say:'hello'}},returns:{summary:'One object: echo, the input.'},run:input=>({echo:input})},
      put:{description:'Pretend to keep one titled thing.',effects:['local-write'],input:{summary:'One object with a title.',schema:PUT_SCHEMA,example:{title:'First'}},returns:{summary:'One object: stored.'},
        run:input=>{calls.push(['put',input]);return {stored:true};}},
      read:{description:'Pretend to read.',effects:['local-read'],run:()=>{calls.push(['read']);return {read:true};}},
      hang:{description:'Never settles.',effects:[],run:()=>new Promise(()=>{})},
      wait:{description:'Settles when the test says so.',effects:[],refusals:[{code:'not_today',meaning:'Declined before any change.',effect:'not_applied'}],
        run:async input=>{
          await gates[input.gate].promise;
          if(input.then==='refuse')throw new Decline('not_today','PLANTED_DETAIL');
          if(input.then==='fail')throw new Error('PLANTED_FAILURE_TEXT');
          return {waited:'PLANTED_LATE_RESULT'};
        }},
      refuse:{description:'Declines.',effects:[],refusals:[{code:'not_today',meaning:'Declined before any change.',effect:'not_applied',next:'Try another day.'}],
        run:()=>{throw new Decline('not_today','a short detail');}},
      fail:{description:'Fails in a way it did not declare.',effects:[],run:()=>{throw new Error('PLANTED_FAILURE_TEXT');}},
      big:{description:'Returns more than the limits allow.',effects:[],run:()=>'x'.repeat(1024*1024+1)},
      odd:{description:'Returns something that is not JSON data.',effects:[],run:()=>({when:new Date(0),act(){}})},
      nothing:{description:'Returns nothing.',effects:[],run:()=>undefined},
    }};
}
const bound=()=>({id:'bound.fixture',version:'0.3.0',contract:'bound.fixture/1',title:'Bound fixture',motif:'exit',description:'A fixture module that comes with a binding.',
  operations:{echo:{description:'Return the input.',effects:[],run:input=>({echo:input})}}});
const M='fixture.tools';
const activate={id:'on',method:'activate',module:M};

// Open a session over two in-memory streams.
function open(options={}){
  const input=new PassThrough(),output=new PassThrough();
  const raw=[],lines=[];let pending='',cursor=0,wake=()=>{};
  output.on('data',chunk=>{
    pending+=chunk.toString('utf8');
    for(let at=pending.indexOf('\n');at>=0;at=pending.indexOf('\n')){
      const text=pending.slice(0,at);pending=pending.slice(at+1);
      raw.push(text);lines.push(parseLine(text));
    }
    wake();
  });
  const session=runSession({input,output,...options});
  const next=async(limit=8000)=>{
    const stop=Date.now()+limit;
    while(lines.length<=cursor){
      const left=stop-Date.now();
      assert.ok(left>0,`no line arrived within ${limit} ms; the last was ${raw.at(-1)?.slice(0,200)}`);
      let timer;
      await Promise.race([new Promise(resolve=>{wake=resolve;}),new Promise(resolve=>{timer=setTimeout(resolve,left);})]);
      clearTimeout(timer);
    }
    return lines[cursor++];
  };
  const text=value=>typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value);
  const send=value=>{input.write(text(value));input.write('\n');};
  const ask=async(value,limit)=>{send(value);return next(limit);};
  // End the input, then read what is left: returns the session_end line and what `done` resolved to.
  const end=async()=>{
    input.end();
    const done=await session.done;
    await tick();
    assert.equal(pending,'','the output ends with a newline');
    return {done,last:lines.at(-1),rest:lines.slice(cursor)};
  };
  return {session,input,raw,lines,next,send,ask,end,pendingText:()=>pending};
}

test('the first line is session_start: bounded, every module registered, nothing activated or run',async()=>{
  const calls=[];
  const s=open({modules:[fixture({calls})]});
  const start=await s.next();
  assert.equal(SESSION_LIMITS.session_start_bytes,8192);
  assert.ok(Buffer.byteLength(s.raw[0])+1<=SESSION_LIMITS.session_start_bytes,`size ${Buffer.byteLength(s.raw[0])+1}`);
  assert.deepEqual(Object.keys(start),['schema','kind','what','modules','gate','requests','request_fields','no_request_for','responses','limits','end','not_established']);
  assert.equal(start.schema,'xenia.agent-first/0.1-development');assert.equal(start.kind,'session_start');
  // Modules: state, whether a build is needed and present, and each operation with its effects and what the gate will do.
  assert.equal(start.modules.length,1);
  const row=start.modules[0];
  assert.deepEqual(Object.keys(row),['id','version','state','build','bound','operations']);
  assert.equal(row.id,M);assert.equal(row.version,'1.2.3');assert.equal(row.state,'registered');assert.equal(row.build,'not_needed');assert.equal(row.bound,false);
  assert.deepEqual(row.operations.map(op=>op.id),['big','echo','fail','hang','nothing','odd','put','read','refuse','wait']);
  for(const op of row.operations)assert.deepEqual(Object.keys(op),['id','effects','allowed']);
  assert.deepEqual(row.operations.find(op=>op.id==='echo'),{id:'echo',effects:[],allowed:true});
  assert.deepEqual(row.operations.find(op=>op.id==='put'),{id:'put',effects:['local-write'],allowed:false});
  assert.deepEqual(row.operations.find(op=>op.id==='read'),{id:'read',effects:['local-read'],allowed:false});
  // The gate: default-deny, an empty list, fixed.
  assert.equal(start.gate.default,'deny');assert.deepEqual(start.gate.allow,[]);assert.equal(start.gate.fixed,true);
  assert.match(start.gate.note,/grants nothing/);
  // Requests: one form per method, with its fields, an example this session accepts, and what it changes.
  assert.deepEqual(Object.keys(start.requests),['inspect','activate','invoke','pause','resume','retire']);
  assert.deepEqual(Object.keys(start.requests),REQUEST_METHODS);
  for(const [method,form] of Object.entries(start.requests)){
    assert.deepEqual(Object.keys(form),['fields','example','changes'],method);
    assert.deepEqual(Object.keys(form.fields),['required','optional'],method);
    assert.deepEqual(form.fields.required.slice(0,2),['id','method'],method);
    assert.equal(form.example.method,method);
    assert.deepEqual(checkRequest(form.example),{ok:true,id:form.example.id,method},method);
    if(form.example.module!==undefined)assert.equal(form.example.module,M,'an example names a module that is in this session');
    assert.equal(typeof form.changes,'string');assert.ok(form.changes.length>10,method);
  }
  assert.deepEqual(start.requests.inspect.fields,{required:['id','method'],optional:['module','operation']});
  assert.deepEqual(start.requests.invoke.fields,{required:['id','method','module','operation'],optional:['input','deadline_ms']});
  assert.deepEqual(start.requests.resume.fields,{required:['id','method','module'],optional:[]});
  assert.deepEqual(start.requests.invoke.example,{id:'3',method:'invoke',module:M,operation:'echo',input:{say:'hello'}},'the example is an operation with no effects and its own card example');
  assert.match(start.requests.inspect.changes,/^Nothing/);
  assert.match(start.requests.resume.changes,/paused/);
  assert.deepEqual(Object.keys(start.request_fields),['id','method','module','operation','input','deadline_ms']);
  // No verb registers or upgrades a module.
  assert.deepEqual(start.no_request_for,['register','upgrade']);
  // Limits.
  assert.equal(start.limits.request_line_bytes,1048576);
  assert.deepEqual(start.limits.input,{maxBytes:1048576,maxDepth:32,maxNodes:65536});
  assert.equal(start.limits.deadline_ms.default,10000);assert.equal(start.limits.deadline_ms.cap,30000);
  assert.equal(start.limits.end_ms,15000);
  assert.equal(start.limits.session_start_bytes,8192);
  assert.equal(start.limits.one_request_at_a_time,true);
  // What it does not establish: no claim about the sender, and a deadline that stops no code.
  assert.ok(start.not_established.length>=4);
  assert.ok(start.not_established.some(line=>/deadline/.test(line)&&/stop/.test(line)));
  assert.ok(start.not_established.some(line=>/who is sending/.test(line)));
  assert.doesNotMatch(JSON.stringify(start),/welcome|hello,|your human|"you":/i);
  assert.deepEqual(calls,[],'nothing ran');
  const {done,last}=await s.end();
  assert.equal(last.kind,'session_end');assert.equal(done.started,true);
  assert.deepEqual(last.modules,[{id:M,state:'retired',in_flight:0}]);
});

test('each verb answers with one line and the module state: inspect, activate, invoke, pause, resume, retire',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  // inspect: the session.
  const whole=await s.ask({id:'a',method:'inspect'});
  assertOk(whole);
  assert.equal(whole.id,'a');assert.equal(whole.line,1);assert.equal(whole.method,'inspect');assert.equal(whole.state,null);
  assert.deepEqual(Object.keys(whole.result),['kind','modules','allow','late','lines','requests','limits']);
  assert.equal(whole.result.kind,'session');
  assert.deepEqual(whole.result.modules,[{id:M,state:'registered',revision:1,in_flight:0,build:'not_needed'}]);
  assert.deepEqual(whole.result.allow,[]);
  assert.deepEqual(whole.result.late,{count:0,pending:0,rows:[],not_listed:0});
  assert.deepEqual(whole.result.lines,{read:1,answered:0,blank:0});
  assert.deepEqual(whole.result.requests.invoke,{required:['id','method','module','operation'],optional:['input','deadline_ms']});
  // inspect: one module.
  const module=await s.ask({id:'b',method:'inspect',module:M});
  assertOk(module);assert.equal(module.state,'registered');
  assert.deepEqual(Object.keys(module.result),['kind','module','operations']);
  assert.equal(module.result.kind,'module');
  assert.deepEqual(module.result.module,{id:M,version:'1.2.3',contract:'fixture.tools/1',title:'Fixture tools',motif:'bounded-work',
    description:'Fixture operations for the session tests.',state:'registered',revision:1,in_flight:0,build:'not_needed',bound:false});
  assert.deepEqual(module.result.operations.find(op=>op.id==='put'),{id:'put',description:'Pretend to keep one titled thing.',effects:['local-write'],allowed:false,input_checked_by:'runtime'});
  assert.equal(module.result.look,undefined,'a module with no binding has nothing to look at');
  assert.equal(SESSION_LIMITS.module_inspect_bytes,8192);
  assert.ok(Buffer.byteLength(s.raw.at(-1))+1<=SESSION_LIMITS.module_inspect_bytes,'a module inspect line is bounded');
  // inspect: one operation's card.
  const card=await s.ask({id:'c',method:'inspect',module:M,operation:'put'});
  assertOk(card);
  assert.deepEqual(Object.keys(card.result),['kind','module','operation','allowed','deadline_ms']);
  assert.equal(card.result.kind,'operation');
  assert.deepEqual(card.result.module,{id:M,version:'1.2.3',revision:1,state:'registered'});
  assert.deepEqual(card.result.operation.input,{summary:'One object with a title.',example:{title:'First'},schema:PUT_SCHEMA});
  assert.deepEqual(card.result.operation.returns,{summary:'One object: stored.'});
  assert.equal(card.result.operation.input_checked_by,'runtime');
  assert.equal(card.result.allowed,false);
  assert.deepEqual(card.result.deadline_ms,{default:10000,cap:30000});
  // invoke before activate: not admitted, and the next action is the request that opens the module.
  const early=await s.ask({id:'d',method:'invoke',module:M,operation:'echo',input:{say:'hi'}});
  assertRefused(early,'MODULE_INACTIVE');
  assert.equal(early.error.operation_started,false);assert.equal(early.error.effect_outcome,'not_attempted');assert.equal(early.state,'registered');
  assert.deepEqual(early.problem.next_actions[0].request,{method:'activate',module:M});
  assert.deepEqual(early.problem.next_actions[0].needs,['id']);
  // activate.
  const on=await s.ask({id:'e',method:'activate',module:M});
  assertOk(on);assert.equal(on.state,'active');assert.deepEqual(on.result,{from:'registered',to:'active'});
  assert.deepEqual((await s.ask({id:'e2',method:'activate',module:M})).result,{from:'active',to:'active'},'activating an active module changes nothing and says so');
  // invoke.
  const got=await s.ask({id:'f',method:'invoke',module:M,operation:'echo',input:{say:'hi'}});
  assertOk(got);assert.equal(got.state,'active');assert.deepEqual(got.result,{echo:{say:'hi'}});
  assert.deepEqual((await s.ask({id:'f2',method:'invoke',module:M,operation:'echo'})).result,{echo:null},'no input is null');
  // pause, and a call while paused.
  const paused=await s.ask({id:'g',method:'pause',module:M});
  assertOk(paused);assert.equal(paused.state,'paused');assert.deepEqual(paused.result,{from:'active',to:'paused'});
  const held=await s.ask({id:'h',method:'invoke',module:M,operation:'echo',input:1});
  assertRefused(held,'MODULE_INACTIVE');assert.equal(held.state,'paused');
  assert.deepEqual(held.problem.next_actions[0].request,{method:'resume',module:M});
  // resume: only from paused.
  const resumed=await s.ask({id:'i',method:'resume',module:M});
  assertOk(resumed);assert.equal(resumed.state,'active');assert.deepEqual(resumed.result,{from:'paused',to:'active'});
  const again=await s.ask({id:'j',method:'resume',module:M});
  assertRefused(again,'INVALID_REQUEST');
  assert.equal(again.error.reason,'resume_needs_paused');assert.equal(again.state,'active');
  assert.equal(again.error.operation_started,false);assert.equal(again.error.effect_outcome,'not_attempted');
  assert.deepEqual(again.problem.next_actions[0].request,{method:'inspect',module:M});
  // retire.
  const retired=await s.ask({id:'k',method:'retire',module:M});
  assertOk(retired);assert.equal(retired.state,'retired');assert.deepEqual(retired.result,{from:'active',to:'retired',in_flight:0});
  const {last}=await s.end();
  assert.deepEqual(last.lines,{read:13,answered:13,blank:0});
});

test('every response carries a receipt: which module answered, the operation, its effects, the deadline and the request line',async()=>{
  const s=open({modules:[fixture()],allow:[`${M}:put`]});await s.next();
  const first=JSON.stringify(activate);
  const on=await s.ask(first);
  assert.deepEqual(on.receipt,{module:{id:M,version:'1.2.3',contract:'fixture.tools/1',revision:1},request_line:{bytes:Buffer.byteLength(first),sha256:sha(first)}});
  // The digest is of the line as it was sent, byte for byte.
  const text=`{"deadline_ms":1234, "input":{"say":"hé"},"operation":"echo","module":"${M}","method":"invoke","id":"r-1"}`;
  const r=await s.ask(text);
  assertOk(r);
  assert.equal(r.id,'r-1');assert.equal(r.line,2);
  assert.deepEqual(r.receipt,{module:{id:M,version:'1.2.3',contract:'fixture.tools/1',revision:1},operation:'echo',effects:[],deadline_ms:1234,
    request_line:{bytes:Buffer.byteLength(text),sha256:sha(text)}});
  assert.deepEqual(r.result,{echo:{say:'hé'}});
  // Without deadline_ms the default applies and is written down.
  const plain=await s.ask({id:'r-2',method:'invoke',module:M,operation:'put',input:{title:'First'}});
  assert.equal(plain.receipt.deadline_ms,10000);assert.deepEqual(plain.receipt.effects,['local-write']);assert.equal(plain.receipt.operation,'put');
  // A refusal keeps the same receipt.
  const refused=await s.ask({id:'r-3',method:'invoke',module:M,operation:'refuse'});
  assertRefused(refused,'DECLINED');
  assert.deepEqual(Object.keys(refused.receipt),['module','operation','effects','deadline_ms','request_line']);
  assert.equal(refused.error.effect_outcome,'not_applied');assert.equal(refused.error.operation_started,true);
  assert.deepEqual(refused.error.refusal,{code:'not_today',meaning:'Declined before any change.',next:'Try another day.',detail:'a short detail'});
  assert.deepEqual(refused.problem.next_actions[0].request,{method:'inspect',module:M,operation:'refuse'});
  assert.ok(refused.not_established.some(line=>/declaration/.test(line)&&/did not observe/.test(line)));
  // An undeclared failure: started, effect unknown, and none of the handler's own words.
  const failed=await s.ask({id:'r-4',method:'invoke',module:M,operation:'fail'});
  assertRefused(failed,'OPERATION_FAILED');
  assert.equal(failed.error.operation_started,true);assert.equal(failed.error.effect_outcome,'unknown');
  assert.equal(failed.receipt.operation,'fail');
  assert.ok(failed.not_established.includes('whether the failed operation changed anything'));
  // A request that names no module has only its line in the receipt.
  const whole=JSON.stringify({id:'r-5',method:'inspect'});
  assert.deepEqual((await s.ask(whole)).receipt,{request_line:{bytes:Buffer.byteLength(whole),sha256:sha(whole)}});
  await s.end();
  assert.equal(s.raw.join('\n').includes('PLANTED'),false);
});

test('the gate is default-deny: an operation that declares effects runs only when the allow list names it',async()=>{
  const calls=[];
  const s=open({modules:[fixture({calls})]});await s.next();
  await s.ask(activate);
  for(const operation of ['put','read']){
    const blocked=await s.ask({id:'b',method:'invoke',module:M,operation,input:operation==='put'?{title:'First'}:null});
    assertRefused(blocked,'POLICY_BLOCKED',operation);
    assert.equal(blocked.error.operation_started,false);assert.equal(blocked.error.effect_outcome,'not_attempted');
    assert.match(blocked.problem.detail,/allow list/);assert.match(blocked.problem.detail,/not a person/);
    assert.deepEqual(blocked.problem.next_actions[0].request,{method:'inspect',module:M});
  }
  assert.deepEqual(calls,[],'neither handler ran');
  await s.end();
  // With the operation named, it runs; the other one still does not.
  const t=open({modules:[fixture({calls})],allow:[`${M}:put`,`${M}:put`]});
  const start=await t.next();
  assert.deepEqual(start.gate.allow,[`${M}:put`]);
  assert.equal(start.modules[0].operations.find(op=>op.id==='put').allowed,true);
  assert.equal(start.modules[0].operations.find(op=>op.id==='read').allowed,false);
  await t.ask(activate);
  const stored=await t.ask({id:'p',method:'invoke',module:M,operation:'put',input:{title:'First'}});
  assertOk(stored);assert.deepEqual(stored.result,{stored:true});assert.deepEqual(stored.receipt.effects,['local-write']);
  assertRefused(await t.ask({id:'q',method:'invoke',module:M,operation:'read'}),'POLICY_BLOCKED');
  assert.deepEqual(calls,[['put',{title:'First'}]]);
  // An input that misses the card is refused before the gate and the handler, with a pointer and a request to read the card.
  const miss=await t.ask({id:'m',method:'invoke',module:M,operation:'put',input:{title:7}});
  assertRefused(miss,'INVALID_INPUT');
  assert.equal(miss.error.reason,'does_not_match_card');
  assert.equal(miss.error.pointer,'/title');assert.equal(miss.error.keyword,'type');assert.equal(miss.error.expected,'string');
  assert.equal(miss.error.operation_started,false);
  assert.deepEqual(miss.problem.next_actions[0].request,{method:'inspect',module:M,operation:'put'});
  assert.equal(calls.length,1);
  const view=await t.ask({id:'v',method:'inspect'});
  assert.deepEqual(view.result.allow,[`${M}:put`]);
  await t.end();
});

test('an allow entry that names no operation declaring effects refuses the start, in one line',async()=>{
  const cases=[[`${M}:echo`],[`${M}:nope`],['nobody.here:put'],['PLANTED not an entry'],[`${M}:put`,`${M}:PLANTED`],[''],[7]];
  for(const allow of cases){
    const s=open({modules:[fixture()],allow});
    const line=await s.next();
    const label=JSON.stringify(allow);
    assert.deepEqual(Object.keys(line),['schema','kind','error','problem','not_established'],label);
    assert.equal(line.kind,'session_not_started',label);
    assert.equal(line.error.code,'INVALID_ARGUMENTS',label);
    assert.equal(line.error.operation_started,false,label);assert.equal(line.error.effect_outcome,'not_attempted',label);
    assert.ok(['allow_entry_not_readable','allow_names_no_effect_declaring_operation'].includes(line.error.reason),label);
    assert.equal(line.problem.terminal,false,label);
    for(const action of line.problem.next_actions)assert.deepEqual(checkArgv(action.argv,action.needs),{ok:true},label);
    assert.ok(line.problem.next_actions.some(action=>JSON.stringify(action.argv)==='["help","session"]'),label);
    const done=await s.session.done;
    assert.deepEqual(done,{started:false,exit_code:2},label);
    await tick();
    assert.equal(s.raw.length,1,label);assert.equal(s.pendingText(),'',label);
    assert.equal(s.raw[0].includes('PLANTED'),false,label);
  }
  // The refusal says which operations could be named.
  const named=open({modules:[fixture()],allow:[`${M}:echo`]});
  const line=await named.next();
  assert.equal(line.error.reason,'allow_names_no_effect_declaring_operation');
  assert.deepEqual(line.problem.valid,[`${M}:put`,`${M}:read`]);
  await named.session.done;
});

test('an unusable line is answered INVALID_REQUEST with a reason or a pointer, and is never repeated',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  const PLANT='PLANTED_SECRET_TEXT';
  const J=JSON.stringify;
  const cases=[
    ['{"id":"x","method":"inspect"',{reason:'not_json'},null],
    [`${PLANT} is not json`,{reason:'not_json'},null],
    [Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]),{reason:'not_utf8'},null],
    ['﻿{"id":"x","method":"inspect"}',{reason:'byte_order_mark'},null],
    [`{"id":"x","method":"inspect","id":"${PLANT}"}`,{reason:'duplicate_key'},null],
    ['[1,2]',{pointer:'',keyword:'type',expected:'object'},null],
    [`"${PLANT}"`,{pointer:'',keyword:'type',expected:'object'},null],
    ['null',{pointer:'',keyword:'type',expected:'object'},null],
    [J({method:'inspect'}),{pointer:'',keyword:'required',expected:'id'},null],
    [J({id:'x'}),{pointer:'',keyword:'required',expected:'method'},'x'],
    // An id that cannot be used is not repeated; the method, when it is one of the six, still is.
    [J({id:7,method:'inspect'}),{pointer:'/id',keyword:'type',expected:'string'},null,'inspect'],
    [J({id:`${PLANT} with spaces`,method:'inspect'}),{pointer:'/id',keyword:'pattern'},null,'inspect'],
    [J({id:'x'.repeat(129),method:'inspect'}),{pointer:'/id',keyword:'maxLength',expected:128},null,'inspect'],
    [J({id:'x',method:PLANT}),{pointer:'/method',keyword:'enum',expected:REQUEST_METHODS},'x'],
    [J({id:'x',method:'upgrade',module:M}),{pointer:'/method',keyword:'enum',expected:REQUEST_METHODS},'x'],
    [J({id:'x',method:7}),{pointer:'/method',keyword:'type',expected:'string'},'x'],
    [J({id:'x',method:'inspect',[PLANT]:1}),{pointer:'',keyword:'additionalProperties',expected:['id','method','module','operation']},'x','inspect'],
    [J({id:'x',method:'activate'}),{pointer:'',keyword:'required',expected:'module'},'x','activate'],
    [J({id:'x',method:'activate',module:M,input:{}}),{pointer:'',keyword:'additionalProperties',expected:['id','method','module']},'x','activate'],
    [J({id:'x',method:'retire',module:M,operation:'echo'}),{pointer:'',keyword:'additionalProperties',expected:['id','method','module']},'x','retire'],
    [J({id:'x',method:'invoke',module:M}),{pointer:'',keyword:'required',expected:'operation'},'x','invoke'],
    [J({id:'x',method:'invoke',module:M,operation:'echo',[PLANT]:1}),{pointer:'',keyword:'additionalProperties',expected:['id','method','module','operation','deadline_ms','input']},'x','invoke'],
    [J({id:'x',method:'invoke',module:M,operation:'echo',deadline_ms:30001}),{pointer:'/deadline_ms',keyword:'maximum',expected:30000},'x','invoke'],
    [J({id:'x',method:'invoke',module:M,operation:'echo',deadline_ms:0}),{pointer:'/deadline_ms',keyword:'minimum',expected:1},'x','invoke'],
    [J({id:'x',method:'invoke',module:M,operation:'echo',deadline_ms:'100'}),{pointer:'/deadline_ms',keyword:'type',expected:'integer'},'x','invoke'],
    [J({id:'x',method:'invoke',module:PLANT,operation:'echo'}),{pointer:'/module',keyword:'pattern'},'x','invoke'],
    [J({id:'x',method:'invoke',module:M,operation:`${PLANT} op`}),{pointer:'/operation',keyword:'pattern'},'x','invoke'],
    [J({id:'x',method:'inspect',operation:'echo'}),{reason:'operation_needs_module'},'x','inspect'],
  ];
  let line=0;
  for(const [text,expected,id,method=null] of cases){
    line+=1;
    const label=`case ${line}: ${JSON.stringify(expected)}`;
    const r=await s.ask(text);
    assertRefused(r,'INVALID_REQUEST',label);
    assert.equal(r.line,line,label);assert.equal(r.id,id,label);assert.equal(r.method,method,label);assert.equal(r.state,null,label);
    assert.equal(r.error.operation_started,false,label);assert.equal(r.error.effect_outcome,'not_attempted',label);
    if(expected.reason){
      assert.equal(r.error.reason,expected.reason,label);assert.equal(r.error.pointer,undefined,label);
    }else{
      assert.equal(r.error.reason,'does_not_match_request',label);
      assert.equal(r.error.pointer,expected.pointer,label);assert.equal(r.error.keyword,expected.keyword,label);
      if(expected.expected!==undefined)assert.deepEqual(r.error.expected,expected.expected,label);
    }
    assert.ok(Object.hasOwn(REQUEST_REASONS,r.error.reason),label);
    const bytes=Buffer.isBuffer(text)?text:Buffer.from(text);
    assert.deepEqual(r.receipt,{request_line:{bytes:bytes.length,sha256:sha(bytes)}},label);
    assert.equal(r.problem.terminal,false,label);
    assert.deepEqual(r.problem.next_actions[0].request,{method:'inspect'},label);
  }
  // Blank lines are counted and not answered; a line ending in a carriage return is read.
  s.send('');s.send('   \t');
  const after=await s.ask('{"id":"ok","method":"inspect"}\r');
  assertOk(after);assert.equal(after.id,'ok');assert.equal(after.line,line+3);
  assert.deepEqual(after.result.lines,{read:line+3,answered:line,blank:2});
  const {last}=await s.end();
  assert.deepEqual(last.lines,{read:line+3,answered:line+1,blank:2});
  assert.equal(s.raw.join('\n').includes('PLANTED'),false,'nothing a line held came back out');
});

test('a line over 1 MiB is discarded and answered, a line of exactly 1 MiB is read, and the session goes on',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  const limit=SESSION_LIMITS.request_line_bytes;
  assert.equal(limit,1024*1024);
  const big=`{"id":"big","method":"invoke","module":"${M}","operation":"echo","input":"${'x'.repeat(limit)}"}`;
  const r=await s.ask(big);
  assertRefused(r,'INVALID_REQUEST');
  assert.equal(r.id,null);assert.equal(r.line,1);assert.equal(r.method,null);
  assert.equal(r.error.reason,'line_too_long');
  assert.deepEqual(r.receipt,{request_line:{bytes:Buffer.byteLength(big),sha256:null,discarded:true}});
  assert.ok(Buffer.byteLength(s.raw.at(-1))<2000,'the answer does not carry the line');
  // Exactly at the limit: read, and answered as the request it is.
  const head='{"id":"edge","method":"inspect"}';
  const exact=head+' '.repeat(limit-head.length);
  assert.equal(Buffer.byteLength(exact),limit);
  const edge=await s.ask(exact);
  assertOk(edge);assert.equal(edge.id,'edge');assert.equal(edge.line,2);
  assert.equal(edge.receipt.request_line.bytes,limit);assert.equal(edge.receipt.request_line.sha256,sha(exact));
  // An over-long line that arrives in pieces is still one line.
  s.input.write('{"id":"p","pad":"');
  for(let i=0;i<5;i+=1)s.input.write('y'.repeat(300000));
  s.input.write('"}\n');
  const pieces=await s.next();
  assert.equal(pieces.error.reason,'line_too_long');assert.equal(pieces.line,3);
  const on=await s.ask(activate);
  assertOk(on);assert.equal(on.line,4);
  await s.end();
});

test('an unknown module or operation is typed, lists what exists and points at a request',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  for(const request of [{id:'1',method:'inspect',module:'nobody.here'},{id:'2',method:'activate',module:'nobody.here'},{id:'3',method:'invoke',module:'nobody.here',operation:'echo'},{id:'4',method:'retire',module:'nobody.here'}]){
    const r=await s.ask(request);
    assertRefused(r,'MODULE_NOT_FOUND',request.method);
    assert.equal(r.state,null);assert.equal(r.receipt.module,undefined);assert.equal(r.method,request.method);
    assert.equal(r.error.operation_started,false);assert.equal(r.error.effect_outcome,'not_attempted');
    assert.deepEqual(r.problem.valid,[M]);
    assert.deepEqual(r.problem.next_actions[0].request,{method:'inspect'});
  }
  await s.ask(activate);
  for(const request of [{id:'5',method:'invoke',module:M,operation:'nope'},{id:'6',method:'inspect',module:M,operation:'nope'}]){
    const r=await s.ask(request);
    assertRefused(r,'OPERATION_NOT_FOUND',request.method);
    assert.equal(r.state,'active');
    assert.equal(r.receipt.module.id,M);assert.equal(r.receipt.operation,undefined,'the receipt names only an operation the module has');
    assert.equal(r.error.operation_started,false);
    assert.deepEqual(r.problem.valid,['big','echo','fail','hang','nothing','odd','put','read','refuse','wait']);
    assert.deepEqual(r.problem.next_actions[0].request,{method:'inspect',module:M});
  }
  await s.end();
});

test('a handler that does not settle is answered at the deadline: started, effect unknown, and listed as late',{timeout:20000},async()=>{
  const gates={a:deferred(),b:deferred(),c:deferred()};
  const s=open({modules:[fixture({gates})],endMs:150});await s.next();
  await s.ask(activate);
  const before=Date.now();
  const r=await s.ask({id:'h',method:'invoke',module:M,operation:'hang',deadline_ms:60});
  const took=Date.now()-before;
  assert.ok(took>=50&&took<5000,`answered after ${took} ms`);
  assertRefused(r,'DEADLINE_EXCEEDED');
  assert.equal(r.error.operation_started,true);assert.equal(r.error.effect_outcome,'unknown');assert.equal(r.error.retryable,false);
  assert.equal(r.error.module,M);assert.equal(r.error.operation,'hang');assert.equal(r.error.module_version,'1.2.3');assert.equal(r.error.module_revision,1);
  assert.equal(r.receipt.deadline_ms,60);assert.equal(r.state,'active');
  assert.match(r.problem.detail,/does not stop/);assert.match(r.problem.detail,/not known/);
  assert.equal(r.problem.terminal,false);
  assert.deepEqual(r.problem.next_actions[0].request,{method:'inspect'});
  assert.ok(r.not_established.includes('whether the failed operation changed anything'));
  // The session goes on. inspect lists the call under `late`, still pending, and the module shows it in flight.
  const look=await s.ask({id:'i',method:'inspect'});
  assert.deepEqual(look.result.late,{count:1,pending:1,rows:[{line:2,id:'h',module:M,operation:'hang',settled:'pending'}],not_listed:0});
  assert.equal(look.result.modules[0].in_flight,1);
  // Three calls that settle after their deadline: returned, declined (with its code) and failed. No late result is kept.
  for(const [gate,then] of [['a','return'],['b','refuse'],['c','fail']]){
    const late=await s.ask({id:`w-${gate}`,method:'invoke',module:M,operation:'wait',input:{gate,then},deadline_ms:20});
    assertRefused(late,'DEADLINE_EXCEEDED',gate);
  }
  assert.equal((await s.ask({id:'i2',method:'inspect'})).result.late.pending,4);
  for(const gate of Object.values(gates))gate.resolve();
  await tick();
  const settled=await s.ask({id:'i3',method:'inspect'});
  assert.deepEqual(settled.result.late,{count:4,pending:1,not_listed:0,rows:[
    {line:2,id:'h',module:M,operation:'hang',settled:'pending'},
    {line:4,id:'w-a',module:M,operation:'wait',settled:'returned'},
    {line:5,id:'w-b',module:M,operation:'wait',settled:'declined',refusal_code:'not_today'},
    {line:6,id:'w-c',module:M,operation:'wait',settled:'failed'}]});
  assert.equal(settled.result.modules[0].in_flight,1);
  // A call that answers in time is not late, and the deadline's timer is gone with it.
  assertOk(await s.ask({id:'e',method:'invoke',module:M,operation:'echo',input:1,deadline_ms:5}));
  // Retiring with a call still running: retiring, not retired.
  const retired=await s.ask({id:'k',method:'retire',module:M});
  assertOk(retired);assert.equal(retired.state,'retiring');assert.deepEqual(retired.result,{from:'active',to:'retiring',in_flight:1});
  // The end waits its limit (150 ms here) for the call, then says it was still running. Not complete; exit 1.
  const ended=Date.now();
  const {done,last}=await s.end();
  assert.ok(Date.now()-ended<5000);
  assert.equal(last.kind,'session_end');
  assert.deepEqual(last.modules,[{id:M,state:'retiring',in_flight:1}]);
  assert.equal(last.late.pending,1);
  assert.equal(last.cleanup.complete,false);
  assert.deepEqual(last.cleanup.did_not,[`wait for the call from line 2 (${M} hang): it was still running after 150 ms`]);
  assert.equal(last.exit_code,1);assert.equal(done.exit_code,1);
  assert.equal(s.raw.join('\n').includes('PLANTED'),false,'no late result, detail or failure text was kept or printed');
});

test('more late calls than the list holds are counted, with those still pending shown first',{timeout:20000},async()=>{
  const gates={g:deferred()};
  const s=open({modules:[fixture({gates})],endMs:100});await s.next();
  await s.ask(activate);
  assert.equal(SESSION_LIMITS.late_rows,32);
  for(let i=0;i<SESSION_LIMITS.late_rows+3;i+=1)assertRefused(await s.ask({id:`w${i}`,method:'invoke',module:M,operation:'wait',input:{gate:'g',then:'return'},deadline_ms:1}),'DEADLINE_EXCEEDED');
  assertRefused(await s.ask({id:'h',method:'invoke',module:M,operation:'hang',deadline_ms:1}),'DEADLINE_EXCEEDED');
  gates.g.resolve();await tick();
  const view=await s.ask({id:'i',method:'inspect'});
  const late=view.result.late;
  assert.equal(late.count,36);assert.equal(late.pending,1);assert.equal(late.rows.length,32);assert.equal(late.not_listed,4);
  assert.ok(late.rows.some(row=>row.id==='h'&&row.settled==='pending'),'the pending call is listed');
  assert.ok(Buffer.byteLength(s.raw.at(-1))+1<=8192,`with these names a session inspect line is ${Buffer.byteLength(s.raw.at(-1))+1} bytes`);
  await s.end();
});

test('a result that is too large or is not JSON data is still "returned", and is not put on the line',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  await s.ask(activate);
  for(const operation of ['big','odd','nothing']){
    const r=await s.ask({id:operation,method:'invoke',module:M,operation});
    assertOk(r,operation);
    assert.deepEqual(r.result,{included:false,reason:'not_bounded_json_data'},operation);
    assert.ok(Buffer.byteLength(s.raw.at(-1))<2000,operation);
  }
  const {last}=await s.end();
  assert.equal(last.cleanup.complete,true);
});

test('end of input answers the lines already received, retires what is active and closes each binding once',async()=>{
  let closes=0,looks=0;
  const binding={module:bound(),look:()=>{looks+=1;return {step:'opened',held:['a']};},deadlines:{echo:20000},
    close:async()=>{closes+=1;return {complete:true,did:['ended the fixture session'],did_not:[],left_behind:['one fixture file']};}};
  const s=open({modules:[fixture()],bindings:[binding]});
  const start=await s.next();
  assert.deepEqual(start.modules.map(row=>[row.id,row.bound,row.state]),[['bound.fixture',true,'registered'],[M,false,'registered']]);
  assert.equal(looks,0);assert.equal(closes,0,'starting calls nothing on a binding');
  // Everything is written, and the input is closed, before the first answer is read.
  s.send(activate);
  s.send({id:'1',method:'activate',module:'bound.fixture'});
  s.send({id:'2',method:'invoke',module:'bound.fixture',operation:'echo',input:{n:1}});
  s.send({id:'3',method:'inspect',module:'bound.fixture'});
  s.input.write('{"id":"4","method":"invoke","module":"fixture.tools","operation":"echo","input":"no newline at the end"}');
  const {done,last,rest}=await s.end();
  assert.deepEqual(rest.map(line=>line.id??line.kind),['on','1','2','3','4','session_end']);
  for(const line of rest.slice(0,5))assertOk(line);
  // A binding may state a longer default deadline for an operation.
  assert.equal(rest[2].receipt.deadline_ms,20000);
  // inspect of a bound module shows what its binding holds in memory.
  assert.equal(rest[3].result.module.bound,true);
  assert.deepEqual(rest[3].result.look,{step:'opened',held:['a']});assert.equal(looks,1);
  assert.deepEqual(rest[4].result,{echo:'no newline at the end'},'a last line with no newline is a line');
  // The end.
  assert.deepEqual(Object.keys(last),['schema','kind','ended_by','lines','modules','late','cleanup','exit_code','exit_reason','not_established']);
  assert.equal(last.kind,'session_end');assert.equal(last.ended_by,'end_of_input');
  assert.deepEqual(last.lines,{read:5,answered:5,blank:0});
  assert.deepEqual(last.modules,[{id:'bound.fixture',state:'retired',in_flight:0},{id:M,state:'retired',in_flight:0}]);
  assert.deepEqual(last.late,{count:0,pending:0,rows:[],not_listed:0});
  assert.deepEqual(last.cleanup,{complete:true,
    did:['closed bound.fixture to new calls',`closed ${M} to new calls`,'bound.fixture: ended the fixture session'],
    did_not:[],left_behind:['bound.fixture: one fixture file']});
  assert.equal(last.exit_code,0);assert.equal(last.exit_reason,'end_complete');
  assert.deepEqual(done,{started:true,exit_code:0,end:last});
  assert.equal(closes,1,'close() ran once');
  assert.ok(last.not_established.some(line=>/left behind/.test(line)));
});

test('what was not cleaned up is said, and the exit is 0 only when the end was complete',{timeout:20000},async()=>{
  // A binding that says it could not finish.
  const partial={module:bound(),close:()=>({complete:false,did:[],did_not:['release claim t-1'],left_behind:['claim t-1','the rest: not surveyed']})};
  const a=open({bindings:[partial]});await a.next();
  const first=await a.end();
  assert.deepEqual(first.last.cleanup,{complete:false,did:['closed bound.fixture to new calls'],did_not:['bound.fixture: release claim t-1'],
    left_behind:['bound.fixture: claim t-1','bound.fixture: the rest: not surveyed']});
  assert.equal(first.last.exit_code,1);assert.equal(first.last.exit_reason,'end_not_complete');assert.equal(first.done.exit_code,1);
  // A close() that never finishes is given the end limit, and no longer.
  let closes=0;
  const stuck={module:bound(),close:()=>{closes+=1;return new Promise(()=>{});}};
  const b=open({bindings:[stuck],endMs:120});
  assert.equal((await b.next()).limits.end_ms,120);
  const before=Date.now();
  const second=await b.end();
  const took=Date.now()-before;
  assert.ok(took>=100&&took<5000,`ended after ${took} ms`);
  assert.deepEqual(second.last.cleanup.did_not,['bound.fixture: close() did not finish within 120 ms']);
  assert.equal(second.last.cleanup.complete,false);assert.equal(second.done.exit_code,1);assert.equal(closes,1);
  // A close() that throws, and one whose report is not usable: neither is passed off as complete, and no text of theirs is printed.
  for(const [close,line] of [
    [()=>{throw new Error('PLANTED_CLOSE_TEXT');},'bound.fixture: close() failed'],
    [async()=>{throw new Error('PLANTED_CLOSE_TEXT');},'bound.fixture: close() failed'],
    [()=>'PLANTED_CLOSE_TEXT','bound.fixture: close() gave no usable report'],
    [()=>({complete:true,did:[7],did_not:[],left_behind:[]}),'bound.fixture: close() gave no usable report'],
    [()=>({complete:true,did:['x'.repeat(513)],did_not:[],left_behind:[]}),'bound.fixture: close() gave no usable report'],
  ]){
    const c=open({bindings:[{module:bound(),close}]});await c.next();
    const third=await c.end();
    assert.deepEqual(third.last.cleanup.did_not,[line]);
    assert.equal(third.last.cleanup.complete,false);assert.equal(third.done.exit_code,1);
    assert.equal(c.raw.join('\n').includes('PLANTED'),false);
  }
  // Two bindings: each close() runs once, even when the first never finishes.
  let other=0;
  const fine={module:{...bound(),id:'bound.other'},close:()=>{other+=1;return {complete:true,did:['ended'],did_not:[],left_behind:[]};}};
  const d=open({bindings:[stuck,fine],endMs:100});await d.next();
  const fourth=await d.end();
  assert.equal(other,1);assert.equal(closes,2);
  assert.ok(fourth.last.cleanup.did.includes('bound.other: ended'));
  assert.deepEqual(fourth.last.cleanup.did_not,['bound.fixture: close() did not finish within 100 ms']);
});

test('a binding the session cannot use, or a module view too large to describe, refuses the start',async()=>{
  const cases=[
    [{bindings:[{module:bound(),look:'not a function'}]},'INVALID_MODULE','binding_not_usable'],
    [{bindings:[{module:bound(),close:7}]},'INVALID_MODULE','binding_not_usable'],
    [{bindings:[{module:bound(),deadlines:{echo:SESSION_LIMITS.deadline_cap_ms+1}}]},'INVALID_MODULE','binding_not_usable'],
    [{bindings:[{module:bound(),deadlines:{nope:100}}]},'INVALID_MODULE','binding_not_usable'],
    [{bindings:[{module:bound(),extra:1}]},'INVALID_MODULE','binding_not_usable'],
    [{bindings:['PLANTED']},'INVALID_MODULE','binding_not_usable'],
    [{modules:[fixture(),fixture()]},'MODULE_EXISTS',undefined],
    [{modules:[{id:'bad'}]},'INVALID_MODULE',undefined],
    [{},'INVALID_MODULE','session_has_no_module'],
    // Ten operations with long descriptions: the module cannot be described in one inspect line of 8192 bytes.
    [{modules:[{...bound(),operations:Object.fromEntries(Array.from({length:10},(_,i)=>[`op${i}`,{description:'d'.repeat(900),effects:[],run:()=>1}]))}]},'INVALID_MODULE','module_view_over_limit'],
    // Sixty small modules: each can be described, and the first line cannot hold them all.
    [{modules:Array.from({length:60},(_,i)=>({...bound(),id:`many.m${i}`}))},'INVALID_MODULE','session_start_over_limit'],
    [{modules:[fixture()],endMs:SESSION_LIMITS.end_ms+1},'INVALID_ARGUMENTS','end_ms_out_of_range'],
    [{modules:[fixture()],endMs:0},'INVALID_ARGUMENTS','end_ms_out_of_range'],
  ];
  for(const [options,code,reason] of cases){
    const s=open(options);
    const line=await s.next();
    const label=`${code}/${reason}`;
    assert.equal(line.kind,'session_not_started',label);
    assert.equal(line.error.code,code,label);assert.equal(line.error.reason,reason,label);
    assert.equal(line.error.operation_started,false,label);
    for(const action of line.problem.next_actions)assert.deepEqual(checkArgv(action.argv,action.needs),{ok:true},label);
    const done=await s.session.done;
    assert.equal(done.started,false,label);assert.equal(done.exit_code,code==='INVALID_ARGUMENTS'?2:1,label);
    await tick();
    assert.equal(s.raw.length,1,label);
    assert.equal(s.raw[0].includes('PLANTED'),false,label);
  }
  // A look() that throws, or returns too much, is said in the module view and stops nothing.
  for(const [look,reason] of [[()=>{throw new Error('PLANTED_LOOK_TEXT');},'look_failed'],[()=>({text:'x'.repeat(SESSION_LIMITS.look_bytes)}),'over_limit'],[()=>({when:new Date(0)}),'not_bounded_json_data']]){
    const s=open({bindings:[{module:bound(),look}]});await s.next();
    const view=await s.ask({id:'v',method:'inspect',module:'bound.fixture'});
    assertOk(view);
    assert.deepEqual(view.result.look,{included:false,reason});
    assert.ok(Buffer.byteLength(s.raw.at(-1))+1<=8192);
    await s.end();
    assert.equal(s.raw.join('\n').includes('PLANTED'),false);
  }
});

test('a request after retire is refused: the module takes no new calls and cannot be opened again, and reading still works',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  await s.ask(activate);
  assert.equal((await s.ask({id:'r',method:'retire',module:M})).state,'retired');
  for(const request of [{id:'1',method:'invoke',module:M,operation:'echo',input:1},{id:'2',method:'activate',module:M},{id:'3',method:'pause',module:M},{id:'4',method:'resume',module:M}]){
    const r=await s.ask(request);
    assertRefused(r,'MODULE_RETIRED',request.method);
    assert.equal(r.state,'retired');
    assert.equal(r.error.operation_started,false);assert.equal(r.error.effect_outcome,'not_attempted');
    assert.equal(r.problem.terminal,true);assert.deepEqual(r.problem.next_actions,[]);
    assert.match(r.problem.detail,/new session/);
  }
  // Retiring again changes nothing, and says so.
  assert.deepEqual((await s.ask({id:'5',method:'retire',module:M})).result,{from:'retired',to:'retired',in_flight:0});
  // The floor: what the module is stays readable.
  const view=await s.ask({id:'6',method:'inspect',module:M});
  assertOk(view);assert.equal(view.result.module.state,'retired');
  assertOk(await s.ask({id:'7',method:'inspect',module:M,operation:'echo'}));
  const {last}=await s.end();
  assert.equal(last.cleanup.complete,true);assert.equal(last.exit_code,0);
});

test('a signal closes admission: the call in flight is answered, lines not yet started are answered SESSION_ENDING, then the end',{timeout:20000},async()=>{
  const gates={g:deferred()};
  const s=open({modules:[fixture({gates})]});await s.next();
  await s.ask(activate);
  s.send({id:'w',method:'invoke',module:M,operation:'wait',input:{gate:'g',then:'return'}});
  s.send({id:'x',method:'invoke',module:M,operation:'echo',input:1});
  s.send('PLANTED is not json');
  s.send('');
  s.send({id:'y',method:'inspect'});
  await tick();
  s.session.close('SIGTERM');
  s.session.close('SIGINT');
  s.send({id:'never',method:'inspect'});
  await tick();
  assert.equal(s.lines.length,2,'nothing is answered while the call in flight is running');
  gates.g.resolve();
  const w=await s.next();
  assertOk(w);assert.equal(w.id,'w');assert.deepEqual(w.result,{waited:'PLANTED_LATE_RESULT'});
  const x=await s.next();
  assertRefused(x,'SESSION_ENDING');
  assert.equal(x.id,'x');assert.equal(x.line,3);assert.equal(x.method,'invoke');
  assert.equal(x.error.operation_started,false);assert.equal(x.error.effect_outcome,'not_attempted');
  assert.equal(x.problem.terminal,true);
  const bad=await s.next();
  assertRefused(bad,'INVALID_REQUEST');assert.equal(bad.line,4);assert.equal(bad.error.reason,'not_json');
  const y=await s.next();
  assertRefused(y,'SESSION_ENDING');assert.equal(y.id,'y');assert.equal(y.line,6);
  const last=await s.next();
  assert.deepEqual(Object.keys(last),['schema','kind','ended_by','signal','lines','modules','late','cleanup','exit_code','exit_reason','not_established']);
  assert.equal(last.ended_by,'signal');assert.equal(last.signal,'SIGTERM','the first signal is the one recorded');
  assert.deepEqual(last.lines,{read:6,answered:5,blank:1});
  assert.equal(last.cleanup.complete,true);
  assert.ok(last.not_established.some(line=>/read/.test(line)&&/signal/.test(line)));
  const done=await s.session.done;
  assert.equal(done.exit_code,0);
  await tick();
  assert.equal(s.lines.length,7);
  assert.equal(s.raw.join('\n').includes('never'),false,'a line written after the signal was not read');
  // A host that closes the session without naming a signal is recorded as that.
  const t=open({modules:[fixture()]});await t.next();
  t.session.close();
  const end=await t.next();
  assert.equal(end.ended_by,'closed_by_host');assert.equal(end.signal,undefined);
  assert.equal((await t.session.done).exit_code,0);
});

test('a thousand lines written at once are answered in order, one at a time',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  const count=1000;
  let text='';
  for(let i=1;i<=count;i+=1)text+=`${JSON.stringify(i===1?activate:{id:`n${i}`,method:'invoke',module:M,operation:'echo',input:i})}\n`;
  s.input.write(text);
  const {done,last,rest}=await s.end();
  assert.equal(rest.length,count+1);
  rest.slice(0,-1).forEach((line,index)=>{
    assert.equal(line.line,index+1);assert.equal(line.ok,true);
    if(index>0){assert.equal(line.id,`n${index+1}`);assert.deepEqual(line.result,{echo:index+1});}
  });
  assert.deepEqual(last.lines,{read:count,answered:count,blank:0});
  assert.equal(done.exit_code,0);
});

test('many short lines cost no more each than a few: two hundred thousand blank lines, then a request',{timeout:60000},async()=>{
  const s=open({modules:[fixture()]});await s.next();
  const blanks=200000;
  const before=Date.now();
  s.input.write('\n'.repeat(blanks));
  const r=await s.ask({id:'after',method:'inspect'},30000);
  const took=Date.now()-before;
  // A queue emptied from the front by shifting took over ten seconds here for this many lines; this one takes well under one.
  assert.ok(took<10000,`took ${took} ms`);
  assertOk(r);assert.equal(r.line,blanks+1);
  const {last}=await s.end();
  assert.deepEqual(last.lines,{read:blanks+1,answered:1,blank:blanks});
});

test('under a session every code is terminal or gives a request and a reason, never an argv',()=>{
  const synthetic=(code,extra={})=>({code,operation_started:false,effect_outcome:'not_attempted',retryable:false,...extra});
  const cases=[];
  for(const code of PROBLEM_CODES)for(const started of [false,true])for(const module of [M,'nobody.here',undefined]){
    cases.push(synthetic(code,{operation_started:started,effect_outcome:started?'unknown':'not_attempted',module,operation:'echo',valid:['a','b'],
      reason:code==='INVALID_REQUEST'?'not_json':code==='INVALID_INPUT'?'does_not_match_card':undefined,pointer:'/title',keyword:'type',expected:'string'}));
  }
  for(const reason of Object.keys(REQUEST_REASONS))cases.push(synthetic('INVALID_REQUEST',{reason,module:M}));
  for(const code of [...REFUSAL_CODES,'something_new'])cases.push(synthetic('DECLINED',{operation_started:true,effect_outcome:'not_applied',module:M,operation:'echo',refusal:{code,meaning:'m',detail:'d'}}));
  let requests=0;
  for(const error of cases)for(const state of ['registered','paused','active','retired',undefined]){
    const p=buildProblem(error,{session:true,moduleIds:[M],state});
    const label=`${error.code}/${error.reason??''}/${error.refusal?.code??''}/${state}`;
    assert.equal(p.code,error.code,label);
    assert.equal(typeof p.detail,'string',label);assert.ok(p.detail.length>10&&p.detail.length<700,label);
    assert.equal(typeof p.terminal,'boolean',label);assert.equal(typeof p.retryable,'boolean',label);
    if(p.terminal)assert.deepEqual(p.next_actions,[],label);else assert.ok(p.next_actions.length>=1,label);
    for(const action of p.next_actions){
      requests+=1;
      assert.deepEqual(Object.keys(action),['request','needs','why'],label);
      assert.deepEqual(action.needs,['id'],label);
      assert.equal(checkRequest(action.request,action.needs).ok,true,`${label}: ${JSON.stringify(action)}`);
      assert.equal(checkRequest(action.request).ok,false,`${label}: a suggested request leaves the id to the sender`);
      if(action.request.module!==undefined)assert.equal(action.request.module,M,`${label}: a suggested request names only a module of this session`);
      assert.equal(typeof action.why,'string',label);assert.ok(action.why.length>3,label);
    }
    assert.doesNotMatch(JSON.stringify(p),/"argv"/,label);
    assert.doesNotMatch(p.detail,/--(?:allow|input|expect|package|dir|out|origin|full)\b/,`${label}: no flag of this kit's command line is named inside a session`);
  }
  assert.ok(requests>20);
  // The three codes a session adds.
  for(const code of ['INVALID_REQUEST','DEADLINE_EXCEEDED','SESSION_ENDING'])assert.ok(PROBLEM_CODES.includes(code),code);
  assert.equal(buildProblem(synthetic('SESSION_ENDING'),{session:true}).terminal,true);
  assert.equal(buildProblem(synthetic('MODULE_RETIRED',{module:M}),{session:true,moduleIds:[M]}).terminal,true);
  // Outside a session the same codes still give an argv, as every other code does.
  for(const code of ['INVALID_REQUEST','DEADLINE_EXCEEDED','SESSION_ENDING']){
    const p=buildProblem(synthetic(code),{argv:['session']});
    for(const action of p.next_actions)assert.deepEqual(checkArgv(action.argv,action.needs),{ok:true},code);
  }
});

test('every code a response line can carry has words of its own inside a session',()=>{
  // The codes come from the two sources, so a new one without session words fails here.
  const read=name=>fs.readFileSync(new URL(name,kit),'utf8');
  const emitted=new Set([...read('runtime.mjs').matchAll(/(?:ModuleError|fail)\('([A-Z_]+)'/g),...read('session.mjs').matchAll(/ModuleError\('([A-Z_]+)'/g)].map(match=>match[1]));
  // Not reachable from a request: a module that does not register, a second one with the same id, a replacement (no request upgrades a module), a command line.
  const notFromARequest=['CONTRACT_MISMATCH','INVALID_ARGUMENTS','INVALID_MODULE','MODULE_BUSY','MODULE_EXISTS','STALE_REVISION'];
  assert.deepEqual([...emitted].filter(code=>!SESSION_PROBLEM_CODES.includes(code)).sort(),notFromARequest);
  for(const code of SESSION_PROBLEM_CODES)assert.ok(PROBLEM_CODES.includes(code),code);
});

test('an input that fails ends the session as an input that ends does, and the last line says which',async()=>{
  const s=open({modules:[fixture()]});await s.next();
  await s.ask(activate);
  s.input.write('{"id":"cut","method":"insp');
  await tick();
  s.input.destroy(new Error('PLANTED_INPUT_ERROR'));
  const done=await s.session.done;
  await tick();
  const [cut,last]=s.lines.slice(-2);
  assertRefused(cut,'INVALID_REQUEST');assert.equal(cut.error.reason,'not_json');assert.equal(cut.line,2);
  assert.equal(last.kind,'session_end');assert.equal(last.ended_by,'input_error');
  assert.deepEqual(last.lines,{read:2,answered:2,blank:0});
  assert.equal(last.cleanup.complete,true);assert.equal(done.exit_code,0);
  assert.ok(last.not_established.some(line=>/the input failed/.test(line)));
  assert.equal(s.raw.join('\n').includes('PLANTED'),false);
});

test('checkRequest reads one closed form per method and leaves `input` to the card',()=>{
  const good=[
    {id:'1',method:'inspect'},{id:'1',method:'inspect',module:'a.b'},{id:'1',method:'inspect',module:'a.b',operation:'c-d'},
    {id:'1',method:'activate',module:'a'},{id:'1',method:'pause',module:'a'},{id:'1',method:'resume',module:'a'},{id:'1',method:'retire',module:'a'},
    {id:'A-1.b:c_d',method:'invoke',module:'a',operation:'b'},{id:'1',method:'invoke',module:'a',operation:'b',input:null},
    {id:'1',method:'invoke',module:'a',operation:'b',input:{any:['thing',{at:'all'}]},deadline_ms:30000},
    {id:'x'.repeat(128),method:'invoke',module:'a',operation:'b',input:'text',deadline_ms:1},
  ];
  for(const request of good)assert.deepEqual(checkRequest(request),{ok:true,id:request.id,method:request.method},JSON.stringify(request).slice(0,80));
  const bad=[
    [undefined,{pointer:'',keyword:'type',expected:'object'}],[null,{pointer:'',keyword:'type',expected:'object'}],[[],{pointer:'',keyword:'type',expected:'object'}],['text',{pointer:'',keyword:'type',expected:'object'}],
    [{},{pointer:'',keyword:'required',expected:'id'}],
    [{id:''},{pointer:'',keyword:'required',expected:'method'}],
    [{id:'',method:'inspect'},{pointer:'/id',keyword:'minLength',expected:1}],
    [{id:'1',method:'toString'},{pointer:'/method',keyword:'enum',expected:REQUEST_METHODS}],
    [{id:'1',method:'inspect',input:1},{pointer:'',keyword:'additionalProperties',expected:['id','method','module','operation']}],
    [{id:'1',method:'invoke',module:'a',operation:'b',deadline_ms:1.5},{pointer:'/deadline_ms',keyword:'type',expected:'integer'}],
    [{id:'1',method:'invoke',module:'A',operation:'b'},{pointer:'/module',keyword:'pattern'}],
    [{id:'1',method:'pause',module:'a'.repeat(81)},{pointer:'/module',keyword:'maxLength',expected:80}],
    [{id:'1',method:'inspect',operation:'b'},{reason:'operation_needs_module'}],
  ];
  for(const [request,expected] of bad){
    const result=checkRequest(request);
    const label=JSON.stringify(request)?.slice(0,80);
    assert.equal(result.ok,false,label);
    for(const [key,value] of Object.entries(expected))assert.deepEqual(result[key],value,`${label}: ${key}`);
  }
  // An own __proto__ name, as JSON.parse makes it, is an undeclared name like any other.
  assert.equal(checkRequest(JSON.parse('{"id":"1","method":"inspect","__proto__":{"module":"a"}}')).keyword,'additionalProperties');
  // `needs` names the fields the sender still adds.
  assert.equal(checkRequest({method:'inspect'}).ok,false);
  assert.equal(checkRequest({method:'inspect'},['id']).ok,true);
});

// ---- the CLI ----

function runCli(args,inputText='',extra={}){
  const r=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:30000,input:inputText,env:{PATH:process.env.PATH},...extra});
  assert.equal(r.error,undefined);assert.equal(r.stderr,'','stderr stays silent');
  const raw=r.stdout.split('\n');
  assert.equal(raw.pop(),'','the output ends with a newline');
  return {status:r.status,raw,lines:raw.map(parseLine),stdout:r.stdout};
}
const feed=requests=>requests.map(request=>JSON.stringify(request)).join('\n')+'\n';
const covenantInput={hostName:'Local example',canonicalUrl:'https://example.com/',speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z'};

test('at the door: session reads JSON lines on stdin and answers each with one compact line',()=>{
  const requests=[
    {id:'1',method:'inspect'},
    {id:'2',method:'inspect',module:'xenia.covenant'},
    {id:'3',method:'inspect',module:'xenia.covenant',operation:'draft'},
    {id:'4',method:'activate',module:'xenia.covenant'},
    {id:'5',method:'invoke',module:'xenia.covenant',operation:'draft',input:covenantInput},
    {id:'6',method:'invoke',module:'xenia.covenant',operation:'draft',input:{}},
    {id:'7',method:'pause',module:'xenia.covenant'},
    {id:'8',method:'resume',module:'xenia.covenant'},
    {id:'9',method:'retire',module:'xenia.covenant'},
    {id:'10',method:'invoke',module:'xenia.covenant',operation:'draft',input:covenantInput},
  ];
  // stdin is closed as soon as the lines are written: the calls are answered all the same.
  const r=runCli(['session'],feed(requests));
  assert.equal(r.status,0,r.stdout.slice(0,2000));
  assert.equal(r.lines.length,requests.length+2);
  const start=r.lines[0];
  assert.equal(start.kind,'session_start');
  assert.ok(Buffer.byteLength(r.raw[0])+1<=8192,`size ${Buffer.byteLength(r.raw[0])+1}`);
  assert.deepEqual(start.modules.map(row=>[row.id,row.state,row.build,row.bound]),
    [['xenia.covenant','registered','not_needed',false],['xenia.surface','registered','present',false],['xenia.work','registered','present',false]]);
  assert.ok(start.modules.every(row=>row.operations.every(op=>op.effects.length===0&&op.allowed===true)),'the core operations declare no effects');
  assert.deepEqual(start.gate.allow,[]);
  assert.deepEqual(start.requests.invoke.example,{id:'3',method:'invoke',module:'xenia.covenant',operation:'draft',input:covenantInput});
  const [whole,module,card,on,drafted,declined,paused,resumed,retired,late]=r.lines.slice(1);
  assert.deepEqual(r.lines.slice(1,-1).map(line=>[line.id,line.line]),requests.map((request,index)=>[request.id,index+1]));
  assert.equal(whole.result.kind,'session');assert.equal(whole.result.modules.length,3);
  assert.equal(module.result.module.title,'Standing before permission');
  assert.equal(card.result.operation.input_checked_by,'handler');assert.ok(card.result.operation.returns.summary.length>10);
  assert.deepEqual(on.result,{from:'registered',to:'active'});
  assertOk(drafted);
  assert.equal(drafted.result.declaration.status,'draft');
  assert.deepEqual(drafted.receipt.module,{id:'xenia.covenant',version:'0.1.0-dev.0',contract:'xenia.module.covenant/0.1-development',revision:1});
  assert.equal(drafted.receipt.operation,'draft');assert.deepEqual(drafted.receipt.effects,[]);assert.equal(drafted.receipt.deadline_ms,10000);
  assert.equal(drafted.receipt.request_line.sha256,sha(JSON.stringify(requests[4])));
  assertRefused(declined,'DECLINED');assert.equal(declined.error.refusal.code,'invalid_input');assert.equal(declined.error.effect_outcome,'not_applied');
  assert.equal(paused.state,'paused');assert.equal(resumed.state,'active');assert.equal(retired.state,'retired');
  assertRefused(late,'MODULE_RETIRED');
  const end=r.lines.at(-1);
  assert.equal(end.kind,'session_end');assert.equal(end.ended_by,'end_of_input');
  assert.deepEqual(end.lines,{read:10,answered:10,blank:0});
  assert.deepEqual(end.modules.map(row=>[row.id,row.state,row.in_flight]),[['xenia.covenant','retired',0],['xenia.surface','retired',0],['xenia.work','retired',0]]);
  assert.deepEqual(end.cleanup,{complete:true,did:['closed xenia.covenant to new calls','closed xenia.surface to new calls','closed xenia.work to new calls'],did_not:[],left_behind:[]});
  assert.equal(end.exit_code,0);
  assert.equal(r.stdout.includes('/Users/'),false);assert.equal(r.stdout.includes(tmpdir()),false,'no local path in the output');
  // The example the first line gives is a request that runs.
  const example=runCli(['session'],feed([{id:'a',method:'activate',module:start.requests.invoke.example.module},start.requests.invoke.example]));
  assertOk(example.lines[2]);assert.equal(example.lines[2].id,'3');
  // The other two core operations run here too, given the build.
  const surface={service:{name:'Local example',canonicalUrl:'https://example.com/',description:'An unserved reference example.'},resources:[{id:'about',href:'https://example.com/about'}]};
  const work=JSON.parse(fs.readFileSync(new URL('../work/0.1/examples/declined.json',import.meta.url),'utf8'));
  const both=runCli(['session'],feed([{id:'a',method:'activate',module:'xenia.surface'},{id:'b',method:'invoke',module:'xenia.surface',operation:'manifest',input:surface},
    {id:'c',method:'activate',module:'xenia.work'},{id:'d',method:'invoke',module:'xenia.work',operation:'check',input:work}]));
  assert.equal(both.status,0);
  assert.equal(both.lines[2].result.profile,'xenia-surface/0.1');assert.equal(both.lines[4].result.valid,true);
  // No input at all: the first line, then the end.
  const empty=runCli(['session'],'');
  assert.deepEqual(empty.lines.map(line=>line.kind),['session_start','session_end']);assert.equal(empty.status,0);
});

test('at the door: a start failure is one compact line, kind session_not_started, and nothing is read',()=>{
  const cases=[
    [['session','--allow','xenia.surface:manifest'],'allow_names_no_effect_declaring_operation'],
    [['session','--allow','PLANTED_ENTRY'],'allow_entry_not_readable'],
    [['session','--allow','xenia.surface:manifest,PLANTED:ENTRY'],'allow_entry_not_readable'],
    [['session','PLANTED_WORD'],undefined],
    [['session','--allow'],undefined],
    [['session','--allow','a:b','--allow','c:d'],undefined],
    [['session','--PLANTED','x'],undefined],
  ];
  for(const [args,reason] of cases){
    const r=runCli(args,feed([{id:'1',method:'inspect'}]));
    const label=args.join(' ');
    assert.equal(r.status,2,label);
    assert.equal(r.lines.length,1,label);
    const line=r.lines[0];
    assert.deepEqual(Object.keys(line),['schema','kind','error','problem','not_established'],label);
    assert.equal(line.kind,'session_not_started',label);
    assert.equal(line.error.code,'INVALID_ARGUMENTS',label);assert.equal(line.error.reason,reason,label);
    assert.equal(line.error.operation_started,false,label);assert.equal(line.error.effect_outcome,'not_attempted',label);
    assert.deepEqual(line.problem.next_actions.map(action=>action.argv),[['help','session']],label);
    assert.equal(r.stdout.includes('PLANTED'),false,label);
  }
  // No core operation declares effects, so there is nothing for --allow to name, and the refusal says so.
  const none=runCli(['session','--allow','xenia.surface:manifest']).lines[0];
  assert.deepEqual(none.problem.valid,[]);
  assert.match(none.problem.detail,/No operation in this session declares effects/);
});

test('help, arrive and the README describe session; arrive stays under its limit',()=>{
  const usage='session [--allow <module:operation,...>] [--collab-config <absolute-file>]';
  const pretty=args=>{const r=spawnSync(process.execPath,[cli,...args],{cwd:tmpdir(),encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH}});assert.equal(r.stderr,'');return {status:r.status,stdout:r.stdout,value:JSON.parse(r.stdout)};};
  const general=pretty(['help']).value;
  assert.ok(general.commands.includes(usage));
  assert.match(general.output,/session/);assert.match(general.output,/one JSON object per line/);
  const help=pretty(['help','session']);
  assert.equal(help.status,0);assert.equal(help.value.command,'session');assert.equal(help.value.usage,usage);
  const rules=help.value.rules.join(' ');
  for(const pattern of [/one compact JSON object/,/session_start/,/session_end/,/default-deny|only when --allow names it/,/1 MiB/,/does not stop/,/SESSION_ENDING/,/exit is 0 only/i,/session_not_started/])assert.match(rules,pattern);
  // `session --help` is answered as `help session`, and starts nothing.
  assert.deepEqual(pretty(['session','--help']).value,help.value);
  assert.deepEqual(checkArgv(['session']),{ok:true});
  assert.deepEqual(checkArgv(['session','--allow','a.b:c']),{ok:true});
  assert.equal(checkArgv(['session','extra']).ok,false);assert.equal(checkArgv(['session','--allow']).ok,false);
  assert.deepEqual(checkArgv(['help','session']),{ok:true});
  // arrive lists it among the commands that contact nothing, and stays under its limit.
  const arrive=pretty(['arrive']);
  assert.ok(Buffer.byteLength(arrive.stdout)<=8192,`size ${Buffer.byteLength(arrive.stdout)}`);
  const row=arrive.value.read_only_commands.find(item=>item.argv[0]==='session');
  assert.deepEqual(row.argv,['session']);assert.equal(row.needs,undefined);
  assert.match(row.what,/JSON lines/);assert.match(row.what,/no operation that declares effects runs/);assert.match(row.what,/[Ee]nds when its input ends/);
  // The README says the same things.
  const readme=fs.readFileSync(new URL('README.md',kit),'utf8');
  assert.ok(readme.includes('## A session: many requests, one process'));
  assert.ok(readme.includes('[session.mjs](session.mjs)'));
  for(const word of ['session_start','session_end','session_not_started','DEADLINE_EXCEEDED','SESSION_ENDING','INVALID_REQUEST','BUILD_REQUIRED','does not stop'])assert.ok(readme.includes(word),word);
  assert.ok(readme.includes('tests/agent-first-session.test.mjs'));
});

// Network, child processes and file writes off; one line in `marker` for each attempt. After the guard in tests/own-door.test.mjs.
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

test('at the door: a session with the core modules prints the same lines with network, child processes and file writes switched off',()=>{
  const marker=path.join(work,'guard-attempts.txt');
  const guard=writeGuard(path.join(work,'guard.mjs'),marker);
  const text=feed([{id:'1',method:'activate',module:'xenia.covenant'},{id:'2',method:'invoke',module:'xenia.covenant',operation:'draft',input:covenantInput},
    {id:'3',method:'activate',module:'xenia.surface'},{id:'4',method:'inspect'}]);
  const run=extra=>spawnSync(process.execPath,[...extra,cli,'session'],{cwd:work,encoding:'utf8',timeout:30000,input:text,env:{PATH:process.env.PATH}});
  const guarded=run(['--import',guard]);
  assert.equal(fs.existsSync(marker),false,fs.existsSync(marker)?`the session tried: ${fs.readFileSync(marker,'utf8')}`:'');
  const plain=run([]);
  for(const r of [guarded,plain]){assert.equal(r.error,undefined);assert.equal(r.stderr,'');assert.equal(r.status,0,r.stdout.slice(0,500));}
  assert.equal(guarded.stdout,plain.stdout,'the guard changed nothing in the output');
  assert.equal(plain.stdout.trimEnd().split('\n').map(parseLine).at(-1).kind,'session_end');
  assert.deepEqual(fs.readdirSync(work).filter(name=>!name.startsWith('guard')&&!name.startsWith('fixture-session')&&!name.startsWith('marker-')),[],'the session created nothing where it ran');
  // The guard itself stops a write and a child process, so a clean run means something.
  const probe=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',
    `import fs from 'node:fs';import {spawnSync} from 'node:child_process';let stopped=0;
     for(const act of [()=>fs.writeFileSync(${JSON.stringify(path.join(work,'never.txt'))},'x'),()=>spawnSync('true'),()=>fetch('http://127.0.0.1:9/')])
       try{act();}catch{stopped+=1;}
     console.log(stopped);`],{cwd:work,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH}});
  assert.equal(probe.stdout.trim(),'3',probe.stderr);
  fs.rmSync(marker,{force:true});
});

test('without its build a core operation answers BUILD_REQUIRED, and the session goes on',()=>{
  // A copy of the kit alone: no dist/, no node_modules.
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(),'xenia-session-kit-only-')));
  try{
    const bare=path.join(home,'agent-first','0.1');
    fs.cpSync(kitDir,bare,{recursive:true});
    const text=feed([{id:'1',method:'activate',module:'xenia.surface'},{id:'2',method:'invoke',module:'xenia.surface',operation:'manifest',input:{}},
      {id:'3',method:'activate',module:'xenia.work'},{id:'4',method:'invoke',module:'xenia.work',operation:'check',input:{}},{id:'5',method:'inspect',module:'xenia.surface'},
      {id:'6',method:'invoke',module:'xenia.surface',operation:'nope'}]);
    const r=spawnSync(process.execPath,[path.join(bare,'cli.mjs'),'session'],{cwd:home,encoding:'utf8',timeout:30000,input:text,env:{PATH:'',HOME:home,TMPDIR:home}});
    assert.equal(r.stderr,'');assert.equal(r.status,0,r.stdout.slice(0,500));
    const lines=r.stdout.trimEnd().split('\n').map(parseLine);
    assert.deepEqual(lines[0].modules.map(row=>[row.id,row.build]),[['xenia.covenant','not_needed'],['xenia.surface','missing'],['xenia.work','missing']]);
    for(const index of [2,4]){
      const refused=lines[index];
      assertRefused(refused,'BUILD_REQUIRED');
      assert.equal(refused.error.operation_started,false);assert.equal(refused.error.effect_outcome,'not_attempted');
      assert.equal(refused.state,'active');
      assert.match(refused.problem.detail,/npm ci --ignore-scripts/);assert.match(refused.problem.detail,/npm run build/);
      assert.equal(refused.problem.terminal,true,'no request in this session supplies the build');
    }
    assertOk(lines[5]);assert.equal(lines[5].result.module.build,'missing');
    assertRefused(lines[6],'OPERATION_NOT_FOUND','an operation that does not exist is said first');
    assert.equal(lines.at(-1).kind,'session_end');assert.equal(lines.at(-1).cleanup.complete,true);
    assert.equal(r.stdout.includes(home),false,'no local path in the output');
    assert.deepEqual(fs.readdirSync(home).sort(),['agent-first'],'nothing was created');
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});

// A child process: collect its output lines as they come, and wait for a line or for the exit.
function start(command,args,options={}){
  const child=spawn(command,args,{cwd:work,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe'],...options});
  const raw=[],lines=[];let pending='',stderr='',wake=()=>{};
  child.stdout.on('data',chunk=>{
    pending+=chunk.toString('utf8');
    for(let at=pending.indexOf('\n');at>=0;at=pending.indexOf('\n')){
      const text=pending.slice(0,at);pending=pending.slice(at+1);
      raw.push(text);lines.push(parseLine(text));
    }
    wake();
  });
  child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');});
  const exited=once(child,'exit');
  const until=async(count,limit=10000)=>{
    const stop=Date.now()+limit;
    while(lines.length<count){
      const left=stop-Date.now();
      assert.ok(left>0,`only ${lines.length} of ${count} lines within ${limit} ms; stderr: ${stderr}`);
      let timer;
      await Promise.race([new Promise(resolve=>{wake=resolve;}),new Promise(resolve=>{timer=setTimeout(resolve,Math.min(left,200));})]);
      clearTimeout(timer);
    }
  };
  const finish=async()=>{
    const [code,signal]=await exited;
    await tick();
    assert.equal(stderr,'','stderr stays silent');
    assert.equal(pending,'','the output ends with a newline');
    return {code,signal};
  };
  const write=requests=>child.stdin.write(feed(requests));
  return {child,raw,lines,until,finish,write};
}
const waitForFile=async(file,limit=10000)=>{
  const stop=Date.now()+limit;
  while(!fs.existsSync(file)){assert.ok(Date.now()<stop,`${file} did not appear`);await sleep(20);}
};

test('at the door: a signal ends the session with session_end and exit 0',{timeout:30000},async()=>{
  for(const signal of ['SIGTERM','SIGINT']){
    const s=start(process.execPath,[cli,'session']);
    await s.until(1);
    assert.equal(s.lines[0].kind,'session_start');
    s.write([{id:'1',method:'activate',module:'xenia.covenant'}]);
    await s.until(2);
    s.child.kill(signal);
    const {code,signal:killedBy}=await s.finish();
    assert.equal(killedBy,null,`${signal}: the process ended by itself`);assert.equal(code,0,signal);
    assert.equal(s.lines.length,3,signal);
    const end=s.lines[2];
    assert.equal(end.kind,'session_end');assert.equal(end.ended_by,'signal');assert.equal(end.signal,signal);
    assert.deepEqual(end.modules.map(row=>row.state),['retired','retired','retired']);
    assert.equal(end.cleanup.complete,true);assert.equal(end.exit_code,0);
  }
});

// Fixture modules behind the same process wiring the CLI uses: a real stdin, real signals, a real exit.
const childScript=path.join(work,'fixture-session.mjs');
fs.writeFileSync(childScript,`import fs from 'node:fs';
import {runSessionProcess} from ${JSON.stringify(new URL('session.mjs',kit).href)};
const [marker,endMs]=process.argv.slice(2);
const modules=[{id:'child.fixture',version:'1.0.0',contract:'child.fixture/1',title:'Child fixture',motif:'bounded-work',description:'Fixture operations run in a child process.',
  operations:{
    slow:{description:'Answers after 400 ms.',effects:[],run:()=>new Promise(resolve=>{fs.writeFileSync(marker,'started');setTimeout(()=>resolve({slow:'done'}),400);})},
    hang:{description:'Never settles, and keeps a timer alive.',effects:[],run:()=>new Promise(()=>{fs.writeFileSync(marker,'started');setInterval(()=>{},1000);})},
    echo:{description:'Return the input.',effects:[],run:input=>({echo:input})},
    bulk:{description:'Returns 900,000 bytes of text.',effects:[],run:()=>'y'.repeat(900000)},
    boom:{description:'Throws from a timer, outside the call, and never settles.',effects:[],run:()=>new Promise(()=>{setTimeout(()=>{throw new Error('PLANTED_ASYNC_TEXT');},20);})},
  }}];
const result=await runSessionProcess({modules,endMs:Number(endMs)});
process.exit(result.exit_code);
`);
const C='child.fixture';
let markers=0;
const childSession=(endMs=15000)=>{
  const marker=path.join(work,`marker-${markers+=1}.txt`);
  return {marker,...start(process.execPath,[childScript,marker,String(endMs)])};
};

test('stdin closing while a call is in flight: the call is answered, then the end',{timeout:30000},async()=>{
  const s=childSession();
  await s.until(1);
  s.write([{id:'1',method:'activate',module:C},{id:'2',method:'invoke',module:C,operation:'slow'},{id:'3',method:'invoke',module:C,operation:'echo',input:'after'}]);
  await waitForFile(s.marker);
  s.child.stdin.end();
  const {code}=await s.finish();
  assert.equal(code,0);
  assert.deepEqual(s.lines.map(line=>line.id??line.kind),['session_start','1','2','3','session_end']);
  assertOk(s.lines[2]);assert.deepEqual(s.lines[2].result,{slow:'done'});
  assertOk(s.lines[3]);assert.deepEqual(s.lines[3].result,{echo:'after'},'a line received before the end of input is still run');
  const end=s.lines[4];
  assert.equal(end.ended_by,'end_of_input');assert.deepEqual(end.lines,{read:3,answered:3,blank:0});
  assert.deepEqual(end.modules,[{id:C,state:'retired',in_flight:0}]);
  assert.equal(end.cleanup.complete,true);assert.equal(end.exit_code,0);
});

test('a large result is written whole before the process exits',{timeout:30000},async()=>{
  const s=childSession();
  await s.until(1);
  s.write([{id:'1',method:'activate',module:C},{id:'2',method:'invoke',module:C,operation:'bulk'}]);
  s.child.stdin.end();
  const {code}=await s.finish();
  assert.equal(code,0);
  assert.deepEqual(s.lines.map(line=>line.id??line.kind),['session_start','1','2','session_end']);
  assert.equal(s.lines[2].result.length,900000);
  assert.equal(s.lines[3].cleanup.complete,true);
});

test('a handler that never settles: answered at the deadline, reported still running at the end, and the process still exits, with 1',{timeout:30000},async()=>{
  const s=childSession(300);
  await s.until(1);
  assert.equal(s.lines[0].limits.end_ms,300);
  s.write([{id:'1',method:'activate',module:C},{id:'2',method:'invoke',module:C,operation:'hang',deadline_ms:100},{id:'3',method:'inspect'}]);
  s.child.stdin.end();
  const before=Date.now();
  const {code,signal}=await s.finish();
  assert.ok(Date.now()-before<10000);
  assert.equal(signal,null);assert.equal(code,1,'the end was not complete');
  assert.deepEqual(s.lines.map(line=>line.id??line.kind),['session_start','1','2','3','session_end']);
  assertRefused(s.lines[2],'DEADLINE_EXCEEDED');
  assert.equal(s.lines[2].error.operation_started,true);assert.equal(s.lines[2].error.effect_outcome,'unknown');
  assert.deepEqual(s.lines[3].result.late.rows,[{line:2,id:'2',module:C,operation:'hang',settled:'pending'}]);
  const end=s.lines[4];
  assert.deepEqual(end.modules,[{id:C,state:'retiring',in_flight:1}]);
  assert.equal(end.late.pending,1);
  assert.equal(end.cleanup.complete,false);
  assert.deepEqual(end.cleanup.did_not,[`wait for the call from line 2 (${C} hang): it was still running after 300 ms`]);
  assert.equal(end.exit_code,1);assert.equal(end.exit_reason,'end_not_complete');
});

test('a signal while a call is in flight: that call is answered, the lines behind it are answered SESSION_ENDING, exit 0',{timeout:30000},async()=>{
  const s=childSession();
  await s.until(1);
  s.write([{id:'1',method:'activate',module:C},{id:'2',method:'invoke',module:C,operation:'slow'},{id:'3',method:'invoke',module:C,operation:'echo',input:'behind'},{id:'4',method:'inspect'}]);
  await waitForFile(s.marker);
  await sleep(100);
  s.child.kill('SIGTERM');
  const {code,signal}=await s.finish();
  assert.equal(signal,null);assert.equal(code,0);
  assert.deepEqual(s.lines.map(line=>line.id??line.kind),['session_start','1','2','3','4','session_end']);
  assertOk(s.lines[2]);assert.deepEqual(s.lines[2].result,{slow:'done'});
  for(const line of [s.lines[3],s.lines[4]]){
    assertRefused(line,'SESSION_ENDING');
    assert.equal(line.error.operation_started,false);assert.equal(line.error.effect_outcome,'not_attempted');
  }
  const end=s.lines[5];
  assert.equal(end.ended_by,'signal');assert.equal(end.signal,'SIGTERM');
  assert.deepEqual(end.lines,{read:4,answered:4,blank:0});
  assert.equal(end.cleanup.complete,true);
});

test('an error thrown outside any call ends the session with its usual end, nothing of the error printed, and exit 1',{timeout:30000},async()=>{
  const s=childSession(300);
  await s.until(1);
  s.write([{id:'1',method:'activate',module:C},{id:'2',method:'invoke',module:C,operation:'boom',deadline_ms:200},{id:'3',method:'inspect'}]);
  const {code,signal}=await s.finish();
  assert.equal(signal,null);assert.equal(code,1);
  assert.deepEqual(s.lines.map(line=>line.id??line.kind),['session_start','1','2','3','session_end']);
  assertRefused(s.lines[2],'DEADLINE_EXCEEDED');
  assertRefused(s.lines[3],'SESSION_ENDING');
  const end=s.lines[4];
  assert.equal(end.ended_by,'uncaught_error');assert.equal(end.exit_code,1);assert.equal(end.exit_reason,'uncaught_error');
  assert.ok(end.cleanup.did.includes(`closed ${C} to new calls`),'the end still ran');
  assert.ok(end.not_established.some(line=>/thrown outside any call/.test(line)));
  assert.equal(s.raw.join('\n').includes('PLANTED'),false);
});

test('a reader that goes away does not crash the session: it ends, silent on stderr, with exit 1',{timeout:30000},async()=>{
  const s=childSession(500);
  await s.until(1);
  s.child.stdout.destroy();
  // Give the pipe a moment to close on this side, so that the child's next write finds no reader.
  await sleep(100);
  s.write([{id:'1',method:'activate',module:C},{id:'2',method:'inspect'},{id:'3',method:'inspect'}]);
  s.child.stdin.end();
  let stderr='';s.child.stderr.on('data',chunk=>{stderr+=chunk;});
  const [code,signal]=await once(s.child,'exit');
  assert.equal(signal,null);assert.equal(code,1);assert.equal(stderr,'');
});

test('every line any session printed in this file was one compact JSON object',()=>{
  assert.ok(linesSeen>200,`lines seen: ${linesSeen}`);
});
