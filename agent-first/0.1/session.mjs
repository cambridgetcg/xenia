// SPDX-License-Identifier: MPL-2.0
// `session`: one process, many requests. It reads requests as JSON lines on
// its input and answers each with one compact JSON line on its output. The
// modules run on the kit runtime (runtime.mjs) as it is: this file adds no
// hook, hold or deadline to the runtime, and calls only what it exports.
//
// What this file owns:
// - the lines. session_start is first and bounded; then one response for each
//   request line, in input order; session_end is last. A session that cannot
//   start prints one line, session_not_started, and reads nothing.
// - the request loop: one request at a time. The forms a request can take are
//   in problems.mjs (REQUEST_SCHEMAS, checkRequest), checked by schema.mjs.
// - the gate: default-deny. An operation that declares effects runs only when
//   the allow list, fixed at the start, names it as <module>:<operation>.
// - a deadline for each call. It ends the wait for an answer and stops no
//   code: a call that outlives it is listed as late, and its result is not
//   kept. The session holds nothing for a late call.
// - the end: every module is retired, each binding's close() is called once,
//   calls still running are waited for within one limit, and the last line
//   says what was and was not cleaned up.
//
// A binding is {module, look, close, deadlines, at_end, bound_to}, all but
// `module` optional:
//   module     a module definition, registered like any other
//   look()     returns, from memory only, what the binding holds; `inspect`
//              of the module shows it when it is bounded JSON data of at most
//              SESSION_LIMITS.look_bytes
//   close()    called once when a session that started ends; may be async;
//              gives {complete, did, did_not, left_behind}, each list at most
//              64 strings of at most 512 characters
//   deadlines  {operation-id: milliseconds}, the default deadline for a call
//              to that operation, from 1 to SESSION_LIMITS.deadline_cap_ms
//   at_end     what close() may write without the gate being asked: at most
//              SESSION_LIMITS.at_end_lines lines of 1 to 512 characters. The
//              module's row in session_start repeats them, so a caller reads
//              them before it sends anything. The session does not check that
//              close() does only this.
//   bound_to   what the binding was made with (paths, a label, a digest): a
//              JSON object of at most SESSION_LIMITS.bound_to_bytes, copied
//              once at the start; `inspect` of the module shows the copy
// A session that did not start calls nothing on a binding.
//
// The framing (a bounded line buffer split on the newline byte, a stop on a
// signal, one end record) follows the JSON Lines session of this kit's other
// lineage, modules/0.1/cli.mjs at origin/hermes/agent-first-modules (beed37a).
// No code was copied from it; the request forms, the gate, the deadline, the
// receipts and the end are written here.
import {createHash} from 'node:crypto';
import {createModuleRuntime,ModuleError,MODULE_INPUT_LIMITS,snapshotInput} from './runtime.mjs';
import {createXeniaModules} from './modules.mjs';
import {parseStrictJson} from './input-file.mjs';
import {NEEDS_BUILD} from './invoke.mjs';
import {errorProjection,failureNotEstablished} from './command-state.mjs';
import {REQUEST_METHODS,REQUEST_REASONS,REQUEST_SCHEMAS,SESSION_FLAGS,USAGE_CODES,asWritten,buildProblem,checkRequest,parseFlags,withExit} from './problems.mjs';

export const SESSION_LIMITS=Object.freeze({
  request_line_bytes:1024*1024,   // a longer line is discarded unread
  read_ahead_lines:256,           // lines read and not yet started: at this many the input is paused
  read_ahead_bytes:4*1024*1024,   // the bytes of those lines: at this many the input is paused too
  session_start_bytes:8192,       // the first line, newline included; a session that cannot fit it does not start
  module_inspect_bytes:8192,      // the answer to `inspect` of one module, newline included
  look_bytes:2048,                // what a binding's look() may add to that answer
  bound_to_bytes:2560,            // what a binding's bound_to may add to it
  at_end_lines:8,                 // the lines of a binding's at_end, each of 1 to 512 characters
  deadline_default_ms:10000,
  deadline_cap_ms:30000,
  end_ms:15000,                   // retiring, closing and waiting at the end, in all; a host may give less
  late_rows:32,                   // calls past their deadline that `inspect` and session_end list; the rest are counted
});
const L=SESSION_LIMITS;
const SCHEMA='xenia.agent-first/0.1-development';
const SIGNALS=Object.freeze(['SIGINT','SIGTERM','SIGHUP']);
// Lines read ahead of the one being answered. At read_ahead_lines lines, or read_ahead_bytes bytes, of them the input
// is paused; it is resumed when fewer than these two are held.
const QUEUE_LOW=32,BYTES_LOW=1024*1024;
// While ending, an output that takes no line for this long after the limits have run out is given up on.
const OUTPUT_GRACE_MS=2000;
const NAME='[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*';
const ALLOW_ENTRY=new RegExp(`^${NAME}:${NAME}$`,'u');
const LATE=Symbol('late');
const BINDING_KEYS=Object.freeze(['module','look','close','deadlines','at_end','bound_to']);

const WHAT='One process that reads requests as JSON lines on its input and answers each with one JSON line on its output, in input order, one request at a time. This is the first line. Starting activated nothing, called nothing and changed nothing.';
const GATE_NOTE='`allowed` says what this session\'s gate will do with an operation, and grants nothing. An operation that declares no effects is not gated. One that declares effects runs only when the allow list names it. The list was set when the session started, and no request changes it.';
// Added to the gate note only when a module of the session states an `at_end`.
const AT_END_NOTE=' `at_end` on a module is what its binding says it may write when the session ends. The gate is not asked for those writes, and the session does not check them.';
const CHANGES=Object.freeze({
  inspect:'Nothing. With no module: this session (module states, the allow list, calls still running past their deadline, the request forms). With a module: its description, state and operations and, for a bound module, what its binding holds in memory and what it was bound to. With a module and an operation: that operation\'s card.',
  activate:'A registered or paused module becomes active and takes calls.',
  invoke:'Runs one operation of an active module, once. What it changes is what the operation declares as effects, which this session does not observe. One that declares effects runs only if the allow list names it.',
  pause:'The module stops taking new calls until it is resumed. A call already running goes on.',
  resume:'A paused module becomes active again. Refused in any other state.',
  retire:'The module takes no new calls for the rest of this session and cannot be activated again in it. A call already running goes on.',
});
const REQUEST_FIELDS=Object.freeze({
  id:'A string of 1 to 128 of A-Z a-z 0-9 . _ : - chosen by the sender. It is repeated on the response.',
  method:`One of: ${REQUEST_METHODS.join(', ')}.`,
  module:'A module id from `modules`.',
  operation:'An operation id of that module.',
  input:'Any JSON value; the operation\'s card says what to send. Left out, it is null.',
  deadline_ms:'A whole number of milliseconds from 1 to 30000: how long to wait for this call\'s answer.',
});
const RESPONSES='One line for each request line that is not blank, in input order: {id, line, ok, method, receipt, state}, then {outcome, result} or {error, problem}, then not_established. `line` counts input lines from 1; `state` is the named module\'s state afterwards, or null. A problem is terminal, or its next_actions are requests for this session: {request, needs, why}, where needs names what the sender adds.';
const END='The session ends when its input ends, after the lines already read are answered. SIGINT, SIGTERM or SIGHUP ends it too: the call in flight is answered, lines read but not started are answered SESSION_ENDING, and nothing more is read. An output that stops taking lines ends it at once, and nothing more is started. Then every module is retired, each binding is closed once, and the last line, session_end, says what was and was not cleaned up. The exit is 0 only when that was complete.';
const RESULT_LIMIT='A returned value is held to the input limits. One beyond them, or one that is not JSON data, is not put on the line: the response still says returned, with result {included: false, reason}.';
const START_NOT_ESTABLISHED=Object.freeze([
  'that an operation listed here will be admitted, or will succeed',
  'anything about who is sending requests, or whether they may: the gate reads the allow list and nothing else',
  'that a deadline stops code, or that it always answers on time: it ends the wait for an answer, the handler runs on, and a handler that keeps this process busy delays it',
  'any effect outside this process: effects are what a module declares, and this session does not observe them',
  'the state of any other process, or of a later session',
]);
const NOT_ESTABLISHED=Object.freeze({
  invoke:Object.freeze(['any effect outside this process: the effects in the receipt are what the operation declares, not something observed',
    'that the result conforms to anything beyond the handler’s own checks','that anyone has authority or has consented to act on the result']),
  lifecycle:Object.freeze(['that a later call will be admitted or will succeed','anything about a runtime in another process or a later session']),
  inspect:Object.freeze(['that an operation described here will be admitted or will succeed','anything about a runtime in another process or a later session']),
});

const usage=(reason,fields={})=>Object.assign(new ModuleError('INVALID_ARGUMENTS'),{reason,...fields});
const unusable=reason=>Object.assign(new ModuleError('INVALID_MODULE'),{reason});
const known=error=>error instanceof ModuleError?error:new ModuleError('CLI_FAILED',true);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sizeOf=value=>Buffer.byteLength(JSON.stringify(value));
const identity=described=>({id:described.id,version:described.version,contract:described.contract,revision:described.revision});
const buildOf=id=>!Object.hasOwn(NEEDS_BUILD,id)?'not_needed':NEEDS_BUILD[id]()?'present':'missing';
// The fields of one request form, as the form itself declares them. `input` is not in the invoke form (see problems.mjs).
function fieldsOf(method){
  const form=REQUEST_SCHEMAS[method];
  const rest=Object.keys(form.properties).filter(name=>!form.required.includes(name));
  return {required:[...form.required],optional:method==='invoke'?['input',...rest]:rest};
}
const words=value=>Array.isArray(value)&&value.length<=64&&value.every(item=>typeof item==='string'&&item.length>0&&item.length<=512);
// What a binding's close() said, when it is the report this file asks for.
const reportOf=value=>plain(value)&&typeof value.complete==='boolean'&&words(value.did)&&words(value.did_not)&&words(value.left_behind)?
  {complete:value.complete,did:[...value.did],did_not:[...value.did_not],left_behind:[...value.left_behind]}:undefined;

// The one line of a session that did not start. The problem's next actions are command lines: there is no session to send a request to.
function startRefusal(error){
  const safe=error instanceof ModuleError?error:new ModuleError('CLI_FAILED');
  const problem=buildProblem(safe,{argv:['session']});
  return {exit_code:USAGE_CODES.includes(safe.code)?2:1,
    body:{schema:SCHEMA,kind:'session_not_started',error:errorProjection(safe,problem.retryable),problem,
      not_established:[...failureNotEstablished(safe),'anything about a session: none was started, and nothing was read from the input']}};
}
async function refuseStart(output,error){
  const {exit_code,body}=startRefusal(error);
  await new Promise(resolve=>{
    try{output.write(`${JSON.stringify(body)}\n`,()=>resolve());}catch{resolve();}
  });
  return {started:false,exit_code};
}

// Returns {done, close}. `done` resolves to {started: false, exit_code} when the session did not start, and to
// {started: true, exit_code, end} once session_end was written, where `end` is that line. `close(name)` ends the
// session from outside, the way a signal does; `name` is a signal name, `uncaught_error` (the exit is then 1), or nothing.
export function runSession({modules=[],bindings=[],allow=[],input,output,endMs=L.end_ms}={}){
  if(typeof input?.on!=='function'||typeof output?.write!=='function')throw new TypeError('runSession needs an input stream and an output stream');
  let settle;
  const done=new Promise(resolve=>{settle=resolve;});
  // open, closing (admission closed while a call was in flight), finishing, ended. `live` once the session has started:
  // before that, and in a session that did not start, a failing output has nothing to close.
  let phase='open',live=false;
  // An output that fails (a reader that went away) must not become an uncaught error. Nothing more can be answered,
  // so nothing more is started: admission closes as it does for a signal, the end runs, and the exit is 1.
  let outputOpen=true,waiting;
  const outputLost=()=>{
    outputOpen=false;waiting?.(false);
    if(live&&phase==='open')close('output_error');
  };
  output.on('error',outputLost);
  input.on('error',()=>{});

  const allowed=new Set();
  const bound=new Map();
  let runtime,ids,start;
  const allowedOf=(id,op)=>op.effects.length===0||allowed.has(`${id}:${op.id}`);
  const deadlineOf=(id,operation)=>{
    const stated=bound.get(id)?.deadlines;
    return stated&&Object.hasOwn(stated,operation)?stated[operation]:L.deadline_default_ms;
  };
  const limitsView=()=>({request_line_bytes:L.request_line_bytes,input:{...MODULE_INPUT_LIMITS},result:RESULT_LIMIT,
    read_ahead:{lines:L.read_ahead_lines,bytes:L.read_ahead_bytes},deadline_ms:{default:L.deadline_default_ms,cap:L.deadline_cap_ms},end_ms:endMs,
    session_start_bytes:L.session_start_bytes,module_inspect_bytes:L.module_inspect_bytes,one_request_at_a_time:true});
  const moduleView=described=>({kind:'module',
    module:{id:described.id,version:described.version,contract:described.contract,title:described.title,motif:described.motif,description:described.description,
      ...(described.source===undefined?{}:{source:described.source}),state:described.state,revision:described.revision,in_flight:described.in_flight,
      build:buildOf(described.id),bound:bound.has(described.id)},
    operations:described.operations.map(op=>({id:op.id,description:op.description,effects:op.effects,allowed:allowedOf(described.id,op),input_checked_by:op.input_checked_by}))});

  try{
    if(!Number.isInteger(endMs)||endMs<1||endMs>L.end_ms)throw usage('end_ms_out_of_range');
    if(!Array.isArray(modules)||!Array.isArray(bindings))throw new ModuleError('INVALID_MODULE');
    runtime=createModuleRuntime({authorize:request=>allowed.has(`${request.module.id}:${request.operation}`)});
    for(const definition of modules)runtime.register(definition);
    for(const binding of bindings){
      if(!plain(binding)||Object.keys(binding).some(key=>!BINDING_KEYS.includes(key))||
        (binding.look!==undefined&&typeof binding.look!=='function')||(binding.close!==undefined&&typeof binding.close!=='function'))throw unusable('binding_not_usable');
      const stated=binding.deadlines??{};
      if(!plain(stated)||Object.values(stated).some(ms=>!Number.isInteger(ms)||ms<1||ms>L.deadline_cap_ms))throw unusable('binding_not_usable');
      // at_end and bound_to are read once, here, as plain data: what the first line and `inspect` show is this copy.
      let atEnd,boundTo;
      if(binding.at_end!==undefined){
        if(!words(binding.at_end)||binding.at_end.length>L.at_end_lines)throw unusable('binding_not_usable');
        atEnd=Object.freeze([...binding.at_end]);
      }
      if(binding.bound_to!==undefined){
        try{boundTo=snapshotInput(binding.bound_to);}catch{throw unusable('binding_not_usable');}
        if(!plain(boundTo)||sizeOf(boundTo)>L.bound_to_bytes)throw unusable('binding_not_usable');
      }
      const described=runtime.register(binding.module);
      if(Object.keys(stated).some(name=>!described.operations.some(op=>op.id===name)))throw unusable('binding_not_usable');
      bound.set(described.id,{look:binding.look,close:binding.close,deadlines:{...stated},atEnd,boundTo,owner:binding});
    }
    const catalog=runtime.catalog();
    if(!catalog.length)throw unusable('session_has_no_module');
    ids=catalog.map(described=>described.id);
    // The allow list: every entry is read before any is looked up, and each must name an operation that declares effects.
    const gated=catalog.flatMap(described=>described.operations.filter(op=>op.effects.length).map(op=>`${described.id}:${op.id}`));
    if(!Array.isArray(allow))throw usage('allow_entry_not_readable');
    for(const [index,entry] of allow.entries())if(typeof entry!=='string'||entry.length>161||!ALLOW_ENTRY.test(entry))throw usage('allow_entry_not_readable',{entry:index+1});
    for(const [index,entry] of allow.entries())if(!gated.includes(entry))throw usage('allow_names_no_effect_declaring_operation',{entry:index+1,valid:gated});
    for(const entry of allow)allowed.add(entry);
    // Bounds that hold by construction: the longest line `inspect` of one module can produce, and the first line.
    for(const described of catalog){
      const longest={id:'x'.repeat(128),line:Number.MAX_SAFE_INTEGER,ok:true,method:'inspect',
        receipt:{module:identity(described),request_line:{bytes:L.request_line_bytes,sha256:'0'.repeat(64)}},state:'registered',outcome:'returned',
        result:{...moduleView({...described,in_flight:Number.MAX_SAFE_INTEGER,state:'registered'})},not_established:NOT_ESTABLISHED.inspect};
      // A bound module's line also holds `look` (at most look_bytes) and `bound_to` (its size is known here), each with its key.
      const binding=bound.get(described.id);
      const more=binding?L.look_bytes+8+(binding.boundTo===undefined?0:sizeOf(binding.boundTo)+12):0;
      if(sizeOf(longest)+1+more>L.module_inspect_bytes)throw unusable('module_view_over_limit');
    }
    start=startLine(catalog);
    if(sizeOf(start)+1>L.session_start_bytes)throw unusable('session_start_over_limit');
  }catch(error){
    refuseStart(output,error).then(settle);
    return {done,close(){}};
  }

  function startLine(catalog){
    // The examples name a module of this session: the first operation that declares no effects and carries a short example of its own.
    // When there is none, the first operation, with its example only if that is short.
    const short=op=>op.input?.example!==undefined&&sizeOf(op.input.example)<=512;
    const candidates=catalog.flatMap(described=>described.operations.map(op=>({module:described.id,op})));
    const chosen=candidates.find(({op})=>op.effects.length===0&&short(op))??candidates[0];
    const examples={
      inspect:{id:'1',method:'inspect'},
      activate:{id:'2',method:'activate',module:chosen.module},
      invoke:{id:'3',method:'invoke',module:chosen.module,operation:chosen.op.id,...(short(chosen.op)?{input:chosen.op.input.example}:{})},
      pause:{id:'4',method:'pause',module:chosen.module},
      resume:{id:'5',method:'resume',module:chosen.module},
      retire:{id:'6',method:'retire',module:chosen.module},
    };
    return {schema:SCHEMA,kind:'session_start',what:WHAT,
      modules:catalog.map(described=>({id:described.id,version:described.version,state:described.state,build:buildOf(described.id),bound:bound.has(described.id),
        operations:described.operations.map(op=>({id:op.id,effects:op.effects,allowed:allowedOf(described.id,op)})),
        ...(bound.get(described.id)?.atEnd?{at_end:[...bound.get(described.id).atEnd]}:{})})),
      gate:{default:'deny',allow:[...allowed].sort(),fixed:true,note:GATE_NOTE+([...bound.values()].some(binding=>binding.atEnd)?AT_END_NOTE:'')},
      requests:Object.fromEntries(REQUEST_METHODS.map(method=>[method,{fields:fieldsOf(method),example:examples[method],changes:CHANGES[method]}])),
      request_fields:{...REQUEST_FIELDS},no_request_for:['register','upgrade'],responses:RESPONSES,limits:limitsView(),end:END,
      not_established:[...START_NOT_ESTABLISHED]};
  }

  // ---- lines out ----
  const counts={read:0,answered:0,blank:0};
  // One line out: one compact JSON object. Resolves true once the stream has taken it, false when it did not.
  const write=body=>new Promise(resolve=>{
    if(!outputOpen)return resolve(false);
    let text;
    try{text=`${JSON.stringify(body)}\n`;}catch{return resolve(false);}
    waiting=resolve;
    try{output.write(text,error=>{if(error)outputLost();resolve(!error);});}
    catch{outputLost();resolve(false);}
  });
  async function answer({line,id,method,receipt},state,body){
    if(await write({id,line,ok:body.error===undefined,method,receipt,state,...body}))counts.answered+=1;
  }
  const accept=(request,state,result,notEstablished)=>answer(request,state,{outcome:'returned',result,not_established:[...notEstablished]});
  function refuse(request,error,state=null){
    const problem=buildProblem(error,{session:true,moduleIds:ids,state});
    return answer(request,state,{error:errorProjection(error,problem.retryable),problem,not_established:failureNotEstablished(error)});
  }

  // ---- calls past their deadline ----
  const late=[];
  const running=new Map();
  function lateView(){
    const pending=late.filter(row=>row.settled==='pending'),settled=late.filter(row=>row.settled!=='pending');
    const shown=[...pending.slice(0,L.late_rows),...(pending.length<L.late_rows?settled.slice(pending.length-L.late_rows):[])].sort((a,b)=>a.line-b.line);
    return {count:late.length,pending:pending.length,rows:shown.map(row=>({...row})),not_listed:late.length-shown.length};
  }
  const sessionView=()=>({kind:'session',
    modules:runtime.catalog().map(described=>({id:described.id,state:described.state,revision:described.revision,in_flight:described.in_flight,build:buildOf(described.id)})),
    allow:[...allowed].sort(),late:lateView(),lines:{...counts},requests:Object.fromEntries(REQUEST_METHODS.map(method=>[method,fieldsOf(method)])),limits:limitsView()});
  // What a binding holds in memory, when it can be shown: bounded JSON data, within the size one inspect line leaves for it.
  function lookOf(binding){
    let value,copy;
    try{value=binding.look.call(binding.owner);}catch{return {included:false,reason:'look_failed'};}
    try{copy=snapshotInput(value);}catch{return {included:false,reason:'not_bounded_json_data'};}
    return sizeOf(copy)>L.look_bytes?{included:false,reason:'over_limit'}:copy;
  }
  // What a handler returned, when it can be put on a line: bounded JSON data, by the rule the runtime holds an input to.
  function resultOf(value){
    try{return snapshotInput(value);}catch{return {included:false,reason:'not_bounded_json_data'};}
  }
  const describe=id=>{try{return {described:runtime.describe(id)};}catch(error){return {error:known(error)};}};
  const stateOf=id=>runtime.describe(id).state;
  const noSuchOperation=(described,operation)=>Object.assign(new ModuleError('OPERATION_NOT_FOUND',false,
    {module:described.id,operation,module_version:described.version,module_revision:described.revision}),{valid:described.operations.map(op=>op.id)});

  // ---- the six methods ----
  function inspect(request){
    const {module:id,operation}=request.value;
    if(id===undefined)return accept(request,null,sessionView(),NOT_ESTABLISHED.inspect);
    const {described,error}=describe(id);
    if(error)return refuse(request,error);
    request.receipt={module:identity(described),...request.receipt};
    if(operation===undefined){
      const binding=bound.get(id);
      return accept(request,described.state,{...moduleView(described),...(typeof binding?.look==='function'?{look:lookOf(binding)}:{}),
        ...(binding?.boundTo===undefined?{}:{bound_to:structuredClone(binding.boundTo)})},NOT_ESTABLISHED.inspect);
    }
    const op=described.operations.find(item=>item.id===operation);
    if(!op)return refuse(request,noSuchOperation(described,operation),described.state);
    return accept(request,described.state,{kind:'operation',module:{id,version:described.version,revision:described.revision,state:described.state},operation:op,
      allowed:allowedOf(id,op),deadline_ms:{default:deadlineOf(id,operation),cap:L.deadline_cap_ms}},NOT_ESTABLISHED.inspect);
  }
  function lifecycle(request){
    const {method}=request,id=request.value.module;
    const {described:before,error}=describe(id);
    if(error)return refuse(request,error);
    request.receipt={module:identity(before),...request.receipt};
    try{
      // resume is the runtime's activate, held to one starting state. A retired module is left to the runtime, which says MODULE_RETIRED.
      if(method==='resume'&&!['paused','retiring','retired'].includes(before.state)){
        throw Object.assign(new ModuleError('INVALID_REQUEST',false,{module:id,module_version:before.version,module_revision:before.revision}),{reason:'resume_needs_paused'});
      }
      const after=method==='pause'?runtime.pause(id):method==='retire'?runtime.retire(id):runtime.activate(id);
      return accept(request,after.state,{from:before.state,to:after.state,...(method==='retire'?{in_flight:after.in_flight}:{})},NOT_ESTABLISHED.lifecycle);
    }catch(failure){return refuse(request,known(failure),stateOf(id));}
  }
  async function invoke(request){
    const {module:id,operation}=request.value;
    const input=Object.hasOwn(request.value,'input')?request.value.input:null;
    const {described,error}=describe(id);
    if(error)return refuse(request,error);
    const context={module:id,operation,module_version:described.version,module_revision:described.revision};
    const op=described.operations.find(item=>item.id===operation);
    const deadline=request.value.deadline_ms??deadlineOf(id,operation);
    // The receipt names an operation only when the module has it, so every name in a receipt is the module's own.
    request.receipt={module:identity(described),...(op?{operation,effects:[...op.effects],deadline_ms:deadline}:{}),request_line:request.receipt.request_line};
    // The runtime's own refusals (retired, inactive, no such operation) come first: they are left to it. Only a call it would start is held for the build.
    if(op&&described.state==='active'&&buildOf(id)==='missing')return refuse(request,new ModuleError('BUILD_REQUIRED',false,context),described.state);
    const settled=runtime.invoke(id,operation,input).then(result=>({result}),failure=>({failure:known(failure)}));
    let timer;
    const first=await Promise.race([settled,new Promise(resolve=>{timer=setTimeout(()=>resolve(LATE),deadline);})]);
    clearTimeout(timer);
    if(first===LATE){
      // The runtime starts a handler before any timer can fire, so a call still open here has started. It is not stopped: only the wait ends.
      const row={line:request.line,id:request.id,module:id,operation,settled:'pending'};
      late.push(row);
      running.set(row,settled.then(({failure})=>{
        if(!failure)row.settled='returned';
        else if(failure.code==='DECLINED'){row.settled='declined';row.refusal_code=failure.refusal?.code;}
        else row.settled='failed';
        running.delete(row);
      }));
      return refuse(request,new ModuleError('DEADLINE_EXCEEDED',true,context),stateOf(id));
    }
    if(first.failure){
      const {failure}=first;
      if(failure.code==='OPERATION_NOT_FOUND')failure.valid=described.operations.map(item=>item.id);
      if(failure.code==='INVALID_INPUT'&&failure.reason===undefined)failure.reason='beyond_limits';
      return refuse(request,failure,stateOf(id));
    }
    return accept(request,stateOf(id),resultOf(first.result.value),NOT_ESTABLISHED.invoke);
  }
  const METHODS={inspect,activate:lifecycle,invoke,pause:lifecycle,resume:lifecycle,retire:lifecycle};

  // ---- lines in ----
  let closing,inputFailed=false,inputEnded=false,paused=false,pumping=false,guard;
  // Lines read and not yet started. Taken from the front by moving an index, so that many short lines cost no more each than a few.
  const queue=[];
  let front=0,queuedBytes=0;
  const queued=()=>queue.length-front;
  function take(){
    const entry=queue[front];
    queue[front]=undefined;front+=1;
    queuedBytes-=entry.bytes?.length??0;
    if(front>=1024&&front*2>=queue.length){queue.splice(0,front);front=0;}
    return entry;
  }
  let parts=[],held=0,over=false,skipped=0;
  function endLine(){
    counts.read+=1;
    queue.push(over?{line:counts.read,discarded:skipped}:{line:counts.read,bytes:parts.length===1?parts[0]:Buffer.concat(parts,held)});
    if(!over)queuedBytes+=held;
    parts=[];held=0;over=false;skipped=0;
  }
  // Split on the newline byte. A line is kept only while it fits; past the limit its bytes are counted and dropped.
  function onData(chunk){
    const data=typeof chunk==='string'?Buffer.from(chunk,'utf8'):chunk;
    for(let offset=0;offset<data.length;){
      const newline=data.indexOf(10,offset);
      const stop=newline<0?data.length:newline;
      const size=stop-offset;
      if(over)skipped+=size;
      else if(held+size>L.request_line_bytes){over=true;skipped=held+size;parts=[];held=0;}
      else if(size){parts.push(data.subarray(offset,stop));held+=size;}
      if(newline<0)break;
      endLine();
      offset=newline+1;
    }
    if(!paused&&(queued()>=L.read_ahead_lines||queuedBytes>=L.read_ahead_bytes)){paused=true;input.pause();}
    pump();
  }
  function onEnd(){
    if(inputEnded)return;
    inputEnded=true;
    // Text after the last newline is a line too.
    if(held>0||over)endLine();
    pump();
  }
  const onInputError=()=>{inputFailed=true;onEnd();};
  function stopReading(){
    input.off('data',onData);input.off('end',onEnd);input.off('error',onInputError);
    try{input.pause?.();}catch{}
  }
  const blank=bytes=>bytes.every(byte=>byte===0x20||byte===0x09||byte===0x0d);
  // One line: unusable, blank, not started because the session is ending, or a request that is run.
  async function handle(entry){
    const request={line:entry.line,id:null,method:null,receipt:{request_line:{bytes:entry.discarded??entry.bytes.length,sha256:null}}};
    try{
      if(entry.discarded!==undefined){
        request.receipt.request_line.discarded=true;
        return await refuse(request,Object.assign(new ModuleError('INVALID_REQUEST'),{reason:'line_too_long'}));
      }
      if(blank(entry.bytes)){counts.blank+=1;return undefined;}
      request.receipt.request_line.sha256=createHash('sha256').update(entry.bytes).digest('hex');
      let value;
      try{value=parseStrictJson(entry.bytes);}
      catch(error){
        const reason=error instanceof ModuleError&&Object.hasOwn(REQUEST_REASONS,error.reason??'')?error.reason:'not_json';
        return await refuse(request,Object.assign(new ModuleError('INVALID_REQUEST'),{reason}));
      }
      const checked=checkRequest(value);
      request.id=checked.id??null;request.method=checked.method??null;
      if(!checked.ok){
        const {reason='does_not_match_request',pointer,keyword,expected}=checked;
        return await refuse(request,Object.assign(new ModuleError('INVALID_REQUEST'),{reason,pointer,keyword,expected}));
      }
      if(phase!=='open')return await refuse(request,new ModuleError('SESSION_ENDING'));
      request.value=value;
      return await METHODS[checked.method](request);
    }catch{
      // Nothing above is expected to throw. If something does, the line still gets one answer, and it claims nothing about what happened.
      return refuse(request,new ModuleError('CLI_FAILED',true));
    }
  }
  async function pump(){
    if(pumping||phase!=='open')return;
    pumping=true;
    while(queued()&&phase==='open'){
      await handle(take());
      if(paused&&queued()<QUEUE_LOW&&queuedBytes<BYTES_LOW&&phase==='open'&&!inputEnded){paused=false;input.resume();}
    }
    pumping=false;
    if(phase==='closing'||(inputEnded&&!queued()))finish();
  }
  // From outside: a signal, or a host that ends the session; from inside, an output that stopped taking lines.
  // Admission closes now; the call in flight is answered first, when the output still takes lines.
  function close(name){
    if(phase!=='open')return;
    closing=SIGNALS.includes(name)?{ended_by:'signal',signal:name}:name==='uncaught_error'?{ended_by:'uncaught_error'}:
      name==='output_error'?{ended_by:'output_error'}:{ended_by:'closed_by_host'};
    phase='closing';
    stopReading();
    // The call in flight is answered by its deadline at the latest. An output that still has not taken that answer a moment later is given up on.
    guard=setTimeout(()=>{outputOpen=false;waiting?.(false);},L.deadline_cap_ms+OUTPUT_GRACE_MS);
    if(!pumping)finish();
  }

  // ---- the end ----
  async function finish(){
    if(phase==='finishing'||phase==='ended')return;
    const ending=closing??{ended_by:inputFailed?'input_error':'end_of_input'};
    phase='finishing';
    stopReading();
    clearTimeout(guard);
    guard=setTimeout(()=>{outputOpen=false;waiting?.(false);},endMs+OUTPUT_GRACE_MS);
    // Lines that were read and not started are still answered, each as what it is: unusable, or not run because the session is ending.
    while(queued())await handle(take());
    let budget,expired=false;
    const limit=new Promise(resolve=>{budget=setTimeout(()=>{expired=true;resolve();},endMs);});
    const did=[],didNot=[],leftBehind=[];
    let complete=true;
    for(const id of ids){
      try{runtime.retire(id);did.push(`closed ${id} to new calls`);}
      catch{didNot.push(`close ${id} to new calls`);}
    }
    // Every close() is called before any is waited for, so one that never finishes does not keep another from running.
    const closes=[...bound].filter(([,binding])=>typeof binding.close==='function').map(([id,binding])=>{
      const entry={id,state:'pending'};
      let outcome;
      try{outcome=Promise.resolve(binding.close.call(binding.owner));}catch{outcome=Promise.reject(new Error('close'));}
      entry.settled=outcome.then(value=>{entry.state='returned';entry.report=reportOf(value);},()=>{entry.state='failed';});
      return entry;
    });
    await Promise.race([Promise.all(closes.map(entry=>entry.settled)),limit]);
    for(const {id,state,report} of closes){
      if(state==='pending')didNot.push(`${id}: close() did not finish within ${endMs} ms`);
      else if(state==='failed')didNot.push(`${id}: close() failed`);
      else if(!report)didNot.push(`${id}: close() gave no usable report`);
      else{
        if(!report.complete)complete=false;
        did.push(...report.did.map(item=>`${id}: ${item}`));
        didNot.push(...report.did_not.map(item=>`${id}: ${item}`));
        leftBehind.push(...report.left_behind.map(item=>`${id}: ${item}`));
      }
    }
    // Calls still running past their deadline get what is left of the limit. None is stopped.
    if(running.size&&!expired)await Promise.race([Promise.all([...running.values()]),limit]);
    clearTimeout(budget);
    for(const row of late)if(row.settled==='pending')didNot.push(`wait for the call from line ${row.line} (${row.module} ${row.operation}): it was still running after ${endMs} ms`);
    const states=runtime.catalog().map(described=>({id:described.id,state:described.state,in_flight:described.in_flight}));
    complete=complete&&didNot.length===0&&states.every(row=>row.state==='retired');
    const faulted=ending.ended_by==='uncaught_error';
    const exit=complete&&!faulted?0:1;
    const body={schema:SCHEMA,kind:'session_end',...ending,lines:{...counts},modules:states,late:lateView(),
      cleanup:{complete,did,did_not:didNot,left_behind:leftBehind},exit_code:exit,exit_reason:faulted?'uncaught_error':complete?'end_complete':'end_not_complete',
      not_established:['that nothing else was left behind: left_behind lists only what this session and its bindings know of',
        'any effect outside this process: effects are what a module declares, and this session did not observe them',
        'that a module stays retired: a later session starts with every module registered',
        ...(ending.ended_by==='signal'?['that every line written to this session was read: reading stopped at the signal']:
          ending.ended_by==='closed_by_host'?['that every line written to this session was read: reading stopped when the host closed the session']:
          ending.ended_by==='input_error'?['that every line written to this session was read: the input failed']:
          ending.ended_by==='output_error'?['that every line written to this session was read: reading stopped when the output stopped taking lines, and lines read by then were not run']:
          faulted?['what the error changed or left behind: it was thrown outside any call, nothing about it is recorded here, and reading stopped when it came']:[])]};
    const written=await write(body);
    clearTimeout(guard);
    phase='ended';
    // A last line the output did not take, or an output that stopped taking lines before it: the caller of `done` is still told, and the exit is 1.
    if(!written&&exit===0){body.exit_code=1;body.exit_reason='output_not_accepted';}
    settle({started:true,exit_code:body.exit_code,end:body});
  }

  // The first line, then the input.
  live=true;
  write(start).then(()=>{
    if(phase!=='open')return;
    input.on('data',onData);input.on('end',onEnd);input.on('error',onInputError);
    if(input.readableEnded)onEnd();
    else input.resume?.();
  });
  return {done,close};
}

// The session on this process: its standard input and output, and its signals. Resolves to what `done` resolves to.
// It does not end the process; the caller does, so that a handler still running cannot keep it open.
export async function runSessionProcess({modules,bindings,allow,endMs}={}){
  // The handlers are in place before the first line is written, so a signal sent as soon as it is read is a signal
  // this session answers, not one that ends the process by its default action. One that comes before the session
  // exists is kept and given to it once it does.
  let session,early;
  const toSession=name=>{if(session)session.close(name);else early??=name;};
  // An error thrown outside any call (from a handler's timer, or a rejection nobody handles) would end the process at
  // once, with a stack on stderr and nothing closed. Here it ends the session instead: the usual end runs, the last
  // line says uncaught_error, and the exit is 1. A second one, or an end that then takes too long, ends the process.
  let faults=0;
  const onFault=()=>{
    faults+=1;
    if(faults>1)process.exit(1);
    setTimeout(()=>process.exit(1),L.deadline_cap_ms+L.end_ms+2*OUTPUT_GRACE_MS).unref();
    toSession('uncaught_error');
  };
  const handlers=[...SIGNALS.map(name=>[name,()=>toSession(name)]),['uncaughtException',onFault]];
  for(const [name,handler] of handlers)process.on(name,handler);
  try{
    session=runSession({modules,bindings,allow,endMs,input:process.stdin,output:process.stdout});
    if(early)session.close(early);
    const result=await session.done;
    // An error that came once the end had begun is not in session_end; the exit still says so.
    return faults?{...result,exit_code:1}:result;
  }finally{for(const [name,handler] of handlers)process.off(name,handler);}
}

// `session [--allow <module:operation,...>] [--collab-config <absolute-file>]`: the three core modules on this
// process and, when --collab-config is given, the Collab adapter bound from that file. It writes its own lines and
// never throws: a command line it does not understand, or a config file it cannot use, is one session_not_started
// line too.
export async function runSessionCommand(args){
  const flags=parseFlags(args,SESSION_FLAGS);
  const refuse=error=>{process.stdout.on('error',()=>{});return refuseStart(process.stdout,error);};
  let result;
  if(!flags)result=await refuse(new ModuleError('INVALID_ARGUMENTS'));
  else{
    const list=flags.values['--allow'],configPath=flags.values['--collab-config'];
    const bindings=[];
    let failure;
    if(configPath!==undefined){
      // Loaded only when the flag is given: a session without it imports no adapter code, and nothing that can start a
      // process. Binding reads the config file, the card and the pin; it starts nothing and writes nothing.
      try{
        const {createCollabBinding}=await import('./adapters/agenttool-collab/index.mjs');
        bindings.push(createCollabBinding({configPath}));
      }catch(error){failure=error instanceof ModuleError?error:new ModuleError('CLI_FAILED');}
    }
    result=failure?await refuse(failure):await runSessionProcess({modules:createXeniaModules(),bindings,allow:list===undefined?[]:list.split(',')});
  }
  return asWritten(withExit({kind:'session',started:result.started,exit_code:result.exit_code},result.exit_code));
}
