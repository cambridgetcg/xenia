// SPDX-License-Identifier: MPL-2.0
// The Collab adapter: a binding for the `session` door (session.mjs) that
// puts one AgentTool Collab journal behind nine operations of the kit runtime.
// The backend is a separate program this kit does not contain; `open` starts
// it as a child process and talks to it over stdio (stdio.mjs).
//
// Origin: ported from modules/0.1/adapters/agenttool-collab/adapter.mjs of
// this project's other lineage, kept at origin/hermes/agent-first-modules
// (beed37a) and, with the same bytes, at origin/hermes/agent-first-modules-compose
// (4119d4d). Same project and the same licence (MPL-2.0).
// Carried over: the digest check before use; the private read-only copy of
// the checked bytes, which is what runs; the Bun flags and the short
// environment; the initialize and tools/list handshake; the task view; the
// rule that only an observed anchor is acknowledged; the remembered leases;
// release-then-end when the binding closes.
// Changed here:
// - It runs on the kit runtime as a module definition. The input checks that
//   file did by hand are the schemas on card.json, which the runtime holds
//   every input to before the gate is asked.
// - The bundle's digest and the server version come from the kit's lock
//   (agenttool.lock.json, `collab`), not from the caller's config.
// - Refusals. That file passed three backend codes on and called every other
//   failure uncertain, which ended the whole module. Here a refusal is
//   declared (DECLINED, not_applied) only when nothing was sent, or when the
//   card lists the backend's code, the answer has the plain refusal shape and
//   no success key is in it. Any other failed write is thrown as it is, which
//   the runtime answers OPERATION_FAILED with an unknown effect; the binding
//   then sends no more writes, never sends that one again, and keeps reads
//   and `look` available. A failed read latches nothing.
// - Nothing the backend wrote in a refusal or an error is passed on.
// - The copy of the bundle is removed when the binding closes.
// - A backend that was started by an `open` that then failed is stopped at
//   once, not when the binding closes.
// - The workspace check also looks above the workspace for a `.git` entry,
//   because the backend works at the top level of the repository that holds
//   the workspace (read in the pinned bundle; see repositoryTop below).
// - The path guards compare folders by device and inode as well as by
//   spelling, with identity and lineage from ../../provider.mjs.
// - Once close() has begun, every operation is declined before anything is
//   sent; an open that began to write and failed is never run again.
//
// Not established by anything in this file: that it works with the real
// bundle (the tests run a stand-in written in this repository), that Bun or
// git is a particular program or version, or anything about the caller.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {devNull,homedir} from 'node:os';
import {ModuleError,Decline} from '../../runtime.mjs';
import {compileSchema} from '../../schema.mjs';
import {readBoundedBytes,parseStrictJson} from '../../input-file.mjs';
import {identity,lineage} from '../../provider.mjs';
import {spawnStdioEndpoint,EndpointError} from './stdio.mjs';

export const COLLAB_ID='agenttool.collab';
export const COLLAB_LIMITS=Object.freeze({
  config_bytes:16384,          // the config file
  path_chars:512,              // each path in it
  bundle_bytes:16*1024*1024,   // the bundle file that is read and copied
  timeout_min_ms:100,timeout_max_ms:9000,timeout_default_ms:8000,   // one request to the backend
  request_bytes:65536,         // one frame sent
  response_bytes:1024*1024,    // one frame received
  leases:4,                    // claims one binding holds at once
  close_budget_ms:12000,       // what close() gives its own requests to the backend, in all
  look_bytes:2000,             // what look() returns, as JSON
  shown_bytes:2048,            // the five paths and the actor of a config, written as one JSON list
  bound_to_bytes:2560,         // bound_to, as JSON: what a session shows of the binding (its limit in session.mjs is the same)
  tasks_remembered:8,unknown_listed:8,active_sessions_listed:64,
});
const L=COLLAB_LIMITS;
const SAFE=Number.MAX_SAFE_INTEGER;

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// The backend's own rule for an id (read in the pinned bundle). An id that does not match is not kept or shown.
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const isId=value=>typeof value==='string'&&value.length<=200&&ID.test(value);
const wholeNumber=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const isAnchor=value=>record(value)&&typeof value.epoch_id==='string'&&value.epoch_id.length>0&&value.epoch_id.length<=200&&
  wholeNumber(value.sequence)&&typeof value.hash==='string'&&/^[a-f0-9]{64}$/.test(value.hash);
const sameAnchor=(a,b)=>a.epoch_id===b.epoch_id&&a.sequence===b.sequence&&a.hash===b.hash;
const anchorOf=value=>({epoch_id:value.epoch_id,sequence:value.sequence,hash:value.hash});
const unusable=()=>Object.assign(new ModuleError('INVALID_MODULE'),{reason:'collab_card_not_usable'});

// ---- the card and the pin ----
// Both files are this kit's own. One that cannot be read or parsed is refused the same way as one that does not fit the code.
function readJson(url){
  try{return JSON.parse(fs.readFileSync(url,'utf8'));}catch{throw unusable();}
}
export function loadCollabCard(){
  return readJson(new URL('./card.json',import.meta.url));
}
// The kit's own pin: which bytes the bundle must be, and which server it must say it is.
export function collabPin(){
  return checkPin(readJson(new URL('../../agenttool.lock.json',import.meta.url))?.collab);
}
function checkPin(pin){
  if(!record(pin)||typeof pin.bundle_sha256!=='string'||!/^[a-f0-9]{64}$/.test(pin.bundle_sha256)||
    ['server_name','server_version','mcp_protocol'].some(name=>typeof pin[name]!=='string'||!pin[name]||pin[name].length>80))throw unusable();
  return Object.freeze({bundle_sha256:pin.bundle_sha256,server_name:pin.server_name,server_version:pin.server_version,mcp_protocol:pin.mcp_protocol});
}

// What each operation is in code: whether it writes, which tool it calls, which key a success carries, and which
// refusals the adapter itself raises for it. bindCollab holds the card to this table, so the two cannot drift apart.
const READ_OWN=['backend_not_running','busy','not_open'];
const WRITE_OWN=[...READ_OWN,'earlier_outcome_unknown'];
const OPERATIONS=Object.freeze({
  open:{write:true,tool:'collab_session_start',success:'session',
    own:['already_open','bun_unavailable','bundle_unavailable','busy','home_dir_unavailable','journal_exists','journal_missing','pin_mismatch','workspace_unavailable']},
  status:{write:false,tool:'collab_workspace_status',success:'counts',own:READ_OWN},
  next:{write:true,tool:'collab_next',success:'events',own:WRITE_OWN},
  acknowledge:{write:true,tool:'collab_cursor_ack',success:'session',own:[...WRITE_OWN,'unobserved_anchor']},
  report:{write:true,tool:'collab_report_append',success:'report',own:[...WRITE_OWN,'request_too_large','text_too_long']},
  'task-create':{write:true,tool:'collab_task_create',success:'task',own:[...WRITE_OWN,'request_too_large','text_too_long']},
  'task-get':{write:false,tool:'collab_task_get',success:'task',own:READ_OWN},
  'task-claim':{write:true,tool:'collab_task_claim',success:'task',own:[...WRITE_OWN,'lease_limit']},
  'task-release':{write:true,tool:'collab_task_release',success:'task',own:[...WRITE_OWN,'lease_not_held_by_module']},
});
const sorted=list=>[...list].sort();
const sameList=(a,b)=>a.length===b.length&&a.every((item,index)=>item===b[index]);
const words=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
// A refusal of the backend's is on the card only together with the places it was read at in the pinned bundle
// (card.backend_reading says how). One place: the line that raises the code, and where that is relative to the
// journal change. Here the shape is checked, so that a code cannot be listed without its places; whether the places
// are right is the reading's to answer for, and nothing in this file can check it. There is no stage for a place
// after a commit: a code with such a place is not listed.
const SITE_STAGES=Object.freeze(['no_transaction','before_transaction','in_transaction_before_write','in_transaction_after_write']);
const isSite=site=>record(site)&&Object.keys(site).length===2&&Number.isSafeInteger(site.line)&&site.line>=1&&SITE_STAGES.includes(site.stage);
// The module definition the runtime registers: the card without its card-only parts (`does`, a refusal's `sites`),
// with the adapter's own refusals worded from the card's table and each operation's handler attached.
function definitionFrom(card,handlers){
  if(!record(card)||!record(card.module)||!record(card.operations)||!record(card.refusals)||
    !Array.isArray(card.at_end)||card.at_end.length>8||card.at_end.some(line=>!words(line,512)))throw unusable();
  if(!sameList(sorted(Object.keys(card.operations)),sorted(Object.keys(OPERATIONS))))throw unusable();
  const operations={};
  for(const [id,spec] of Object.entries(OPERATIONS)){
    const op=card.operations[id];
    if(!record(op)||!record(op.input)||!record(op.returns)||!Array.isArray(op.effects)||!Array.isArray(op.refusals)||!Array.isArray(op.backend_refusals))throw unusable();
    if(!sameList(sorted(op.effects),spec.write?['local-read','local-write']:['local-read']))throw unusable();
    if(op.refusals.some(code=>typeof code!=='string')||!sameList(sorted(op.refusals),sorted(spec.own)))throw unusable();
    const refusals=[];
    for(const code of sorted(spec.own)){
      const entry=card.refusals[code];
      if(!record(entry)||!words(entry.meaning,512)||!words(entry.next,512))throw unusable();
      refusals.push({code,meaning:entry.meaning,effect:'not_applied',next:entry.next});
    }
    // A refusal of the backend's: listed per operation, with a meaning of its own and the places it was read at.
    // Its code is never one of the adapter's. Only code, meaning and next go on to the runtime.
    const seen=new Set(spec.own);
    for(const entry of op.backend_refusals){
      if(!record(entry)||Object.keys(entry).some(key=>!['code','meaning','next','sites'].includes(key))||
        typeof entry.code!=='string'||!/^[a-z][a-z0-9_]*$/.test(entry.code)||entry.code.length>64||seen.has(entry.code)||
        !words(entry.meaning,512)||(entry.next!==undefined&&!words(entry.next,512))||
        !Array.isArray(entry.sites)||entry.sites.length<1||entry.sites.length>16||!entry.sites.every(isSite))throw unusable();
      seen.add(entry.code);
      refusals.push({code:entry.code,meaning:entry.meaning,effect:'not_applied',...(entry.next===undefined?{}:{next:entry.next})});
    }
    operations[id]={description:op.description,effects:[...op.effects],refusals,
      input:{summary:op.input.summary,schema:op.input.schema,example:op.input.example},returns:{summary:op.returns.summary},run:handlers[id]};
  }
  const {id,version,contract,title,motif,description,source}=card.module;
  if(id!==COLLAB_ID)throw unusable();
  return {id,version,contract,title,motif,description,...(source===undefined?{}:{source}),operations};
}

// ---- the config ----
const PATH_KEYS=Object.freeze(['bundlePath','bunPath','databasePath','homeDir','workspace']);
const pathText={type:'string',minLength:1,maxLength:L.path_chars};
const CONFIG_SCHEMA={type:'object',additionalProperties:false,required:[...PATH_KEYS,'actor','journal'],properties:{
  bundlePath:pathText,bunPath:pathText,databasePath:pathText,homeDir:pathText,workspace:pathText,
  // A display label: no control character, and no space at either end, because the backend would trim it.
  actor:{type:'string',minLength:1,maxLength:200,pattern:'^(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u001f\\u007f]+$'},
  journal:{type:'string',enum:['new','existing']},
  timeoutMs:{type:'integer',minimum:L.timeout_min_ms,maximum:L.timeout_max_ms},
}};
const configMiss=compileSchema(CONFIG_SCHEMA).check;
const configError=(reason,fields={})=>Object.assign(new ModuleError('INVALID_INPUT'),{reason,...fields});
const realOf=target=>{try{return fs.realpathSync(target);}catch{return undefined;}};
// The real path of the deepest part that exists, with the rest as written.
function settled(target){
  for(let current=target,rest=[];;){
    const real=realOf(current);
    if(real!==undefined)return path.join(real,...rest);
    const up=path.dirname(current);
    if(up===current)return target;
    rest.unshift(path.basename(current));
    current=up;
  }
}
const plainAbsolute=target=>path.isAbsolute(target)&&path.resolve(target)===target&&!/[\x00-\x1f\x7f]/.test(target);
// Is `inner` the folder `outer`, or somewhere inside it? By spelling only.
const holds=(outer,inner)=>inner===outer||inner.startsWith(outer.endsWith(path.sep)?outer:outer+path.sep);
// By folder. Two spellings can reach one folder (another case on a volume that ignores case, a firmlink, a second
// mount), so the folders are compared by device and inode as well, with the two functions the context commands use
// for the same question (identity and lineage, in ../../provider.mjs). A path is taken as the deepest part of it that
// exists, followed through links to a folder with an identity, and the names below it that do not exist yet; those
// names are compared without regard to case or Unicode form, which can refuse two paths that a volume telling case
// apart would keep apart, and never accepts two that it would not.
const identityOf=target=>{try{return identity(target);}catch{return undefined;}};
function located(target){
  for(let current=target,rest=[];;){
    const id=identityOf(current);
    if(id!==undefined)return {real:realOf(current)??current,id,rest};
    const up=path.dirname(current);
    if(up===current)return {real:current,id:undefined,rest};
    rest.unshift(path.basename(current));
    current=up;
  }
}
const fold=name=>name.normalize('NFC').toLowerCase();
function contains(outer,inner){
  const o=located(outer),i=located(inner);
  if(o.id===undefined||i.id===undefined)return false;
  // outer exists: inner is in it when outer is the existing part of inner or a folder above it. A folder above it
  // that cannot be looked at is taken as a reason to keep them together, not apart.
  if(!o.rest.length){try{return lineage(i.real).has(o.id);}catch{return true;}}
  // outer does not exist yet: inner can be in it only below the same existing folder, through the same names.
  return i.id===o.id&&i.rest.length>=o.rest.length&&o.rest.every((name,index)=>fold(name)===fold(i.rest[index]));
}
// Either test finds it: by the spellings given, by their real paths, or by folder.
const nested=(outer,inner)=>holds(outer,inner)||holds(settled(outer),settled(inner))||contains(outer,inner);
const apart=(a,b)=>!nested(a,b)&&!nested(b,a);
function userHomes(){
  const homes=new Set();
  let fromSystem;
  try{fromSystem=homedir();}catch{}
  for(const home of [process.env.HOME,process.env.USERPROFILE,fromSystem])if(typeof home==='string'&&path.isAbsolute(home)){
    homes.add(path.resolve(home));
    const real=realOf(home);
    if(real!==undefined)homes.add(real);
  }
  return [...homes];
}
// homeDir becomes the backend's HOME. It must not be the user's own home, or a folder that holds it.
const isUserHome=dir=>userHomes().some(home=>nested(dir,home));

// Returns the config, frozen, with the default filled in; or throws INVALID_INPUT with a `reason`, and with
// `pointer` naming the key at fault. Nothing the config held is repeated. It reads paths and writes nothing.
export function checkCollabConfig(value){
  const miss=configMiss(value);
  if(miss)throw configError('collab_config_does_not_match',miss);
  // The schema counts characters; the backend counts UTF-16 units.
  if(value.actor.length>200)throw configError('collab_config_does_not_match',{pointer:'/actor',keyword:'maxLength',expected:200});
  for(const name of PATH_KEYS)if(!plainAbsolute(value[name]))throw configError('collab_config_path_not_absolute',{pointer:`/${name}`});
  if(isUserHome(value.homeDir))throw configError('collab_config_home_is_user_home',{pointer:'/homeDir'});
  if(!apart(value.workspace,value.homeDir)||!apart(value.workspace,path.dirname(value.databasePath)))throw configError('collab_config_workspace_not_apart',{pointer:'/workspace'});
  // A session shows what a binding is bound to in one bounded line, so the paths and the actor have a limit together too.
  if(Buffer.byteLength(JSON.stringify([...PATH_KEYS.map(name=>value[name]),value.actor]))>L.shown_bytes)throw configError('collab_config_too_long');
  return Object.freeze({bundlePath:value.bundlePath,bunPath:value.bunPath,databasePath:value.databasePath,homeDir:value.homeDir,workspace:value.workspace,
    actor:value.actor,journal:value.journal,timeoutMs:value.timeoutMs??L.timeout_default_ms});
}
// The config file: an absolute path, read with the bounded reader and the strict decoder `invoke` uses for its input
// (../../input-file.mjs). Returns {config, sha256}, the digest being of the file's bytes.
export function readCollabConfig(configPath){
  if(typeof configPath!=='string'||!path.isAbsolute(configPath))throw Object.assign(new ModuleError('INVALID_ARGUMENTS'),{reason:'collab_config_not_absolute'});
  const bytes=readBoundedBytes(configPath,L.config_bytes);
  return {config:checkCollabConfig(parseStrictJson(bytes)),sha256:sha(bytes)};
}

// ---- what the adapter sends to each tool, as bounds, to hold against what tools/list states ----
const WORKSPACE_ID={type:'string',minLength:1,maxLength:200};
function sendsOf(card){
  const node=(operation,field)=>card.operations[operation].input.schema.properties[field];
  return {
    collab_session_start:{always:['root_path','actor'],args:{root_path:pathText,actor:{type:'string',minLength:1,maxLength:200}}},
    collab_session_end:{always:['reason'],args:{reason:{type:'string',minLength:1,maxLength:64}}},
    collab_workspace_status:{always:['workspace_id'],args:{workspace_id:WORKSPACE_ID}},
    collab_next:{always:['workspace_id','event_limit'],args:{workspace_id:WORKSPACE_ID,event_limit:node('next','event_limit')}},
    collab_cursor_ack:{always:['workspace_id','anchor','expected_cursor_version'],
      args:{workspace_id:WORKSPACE_ID,anchor:node('acknowledge','anchor'),expected_cursor_version:node('acknowledge','expected_cursor_version')}},
    collab_report_append:{always:['workspace_id','idempotency_key','kind','body','confidence','evidence_refs','relation'],
      args:{workspace_id:WORKSPACE_ID,idempotency_key:node('report','idempotency_key'),kind:node('report','kind'),body:node('report','body'),limits:node('report','limits'),
        task_id:node('report','task_id'),confidence:{type:'string',enum:['unknown']},evidence_refs:{type:'array'},relation:{type:'string',enum:['informs']}}},
    collab_task_create:{always:['workspace_id','idempotency_key','title','work_mode'],
      args:{workspace_id:WORKSPACE_ID,idempotency_key:node('task-create','idempotency_key'),title:node('task-create','title'),work_mode:{type:'string',enum:['coordination']}}},
    collab_task_get:{always:['workspace_id','task_id'],args:{workspace_id:WORKSPACE_ID,task_id:node('task-get','task_id')}},
    collab_task_claim:{always:['workspace_id','task_id','idempotency_key','expected_version'],
      args:{workspace_id:WORKSPACE_ID,task_id:node('task-claim','task_id'),idempotency_key:node('task-claim','idempotency_key'),expected_version:node('task-claim','expected_version')}},
    collab_task_release:{always:['workspace_id','task_id','lease_id','idempotency_key','expected_version'],
      args:{workspace_id:WORKSPACE_ID,task_id:node('task-release','task_id'),lease_id:{type:'string',minLength:1,maxLength:200},
        idempotency_key:node('task-release','idempotency_key'),expected_version:node('task-release','expected_version'),summary:{type:'string',minLength:1,maxLength:200}}},
  };
}
const numberOr=(value,fallback)=>typeof value==='number'?value:fallback;
// Is everything `ours` allows also allowed by `theirs`, as far as `theirs` states a bound? A bound the backend does
// not state is not compared. A pattern is not compared. Lengths are compared as numbers: the card counts characters
// and the backend UTF-16 units, which is what the text_too_long refusal is for.
function within(ours,theirs){
  if(!record(ours)||!record(theirs)||theirs.type!==ours.type)return false;
  if(ours.type==='string'){
    if(typeof theirs.minLength==='number'&&numberOr(ours.minLength,0)<theirs.minLength)return false;
    if(typeof theirs.maxLength==='number'&&numberOr(ours.maxLength,Infinity)>theirs.maxLength)return false;
    if(theirs.enum!==undefined&&(!Array.isArray(theirs.enum)||!Array.isArray(ours.enum)||ours.enum.some(word=>!theirs.enum.includes(word))))return false;
    return true;
  }
  if(ours.type==='integer'){
    const least=Math.max(numberOr(theirs.minimum,-Infinity),typeof theirs.exclusiveMinimum==='number'?theirs.exclusiveMinimum+1:-Infinity);
    const most=Math.min(numberOr(theirs.maximum,Infinity),typeof theirs.exclusiveMaximum==='number'?theirs.exclusiveMaximum-1:Infinity);
    return numberOr(ours.minimum,-Infinity)>=least&&numberOr(ours.maximum,Infinity)<=most;
  }
  if(ours.type==='object'){
    if(!record(theirs.properties))return false;
    const required=theirs.required??[];
    if(!Array.isArray(required)||required.some(name=>!(ours.required??[]).includes(name)))return false;
    return Object.entries(ours.properties??{}).every(([name,child])=>within(child,theirs.properties[name]));
  }
  return ours.type==='array';
}
function toolsMatch(listed,sends){
  if(!record(listed)||!Array.isArray(listed.tools))return false;
  const stated=new Map();
  for(const tool of listed.tools)if(record(tool)&&typeof tool.name==='string'&&record(tool.inputSchema))stated.set(tool.name,tool.inputSchema);
  for(const [name,{always,args}] of Object.entries(sends)){
    const schema=stated.get(name);
    if(!schema||schema.type!=='object'||!record(schema.properties))return false;
    const required=schema.required??[];
    if(!Array.isArray(required)||required.some(field=>!always.includes(field)))return false;
    for(const [field,ours] of Object.entries(args))if(!within(ours,schema.properties[field]))return false;
  }
  return true;
}

// A failure that is not a declared refusal. The runtime answers any such throw OPERATION_FAILED with an unknown
// effect and reads nothing from it; `why` is this file's own word, kept for look().
class CollabFailure extends Error{
  constructor(why,unknown){super(why);this.name='CollabFailure';this.why=why;this.unknown=unknown;}
}
// Codes of stdio.mjs after which the child is no longer there to answer.
const TRANSPORT_ENDS=new Set(['request_timeout','response_too_large','invalid_response','transport_error','transport_closed','spawn_failed']);
const STEPS=Object.freeze(['not_opened','home_ready','bundle_copied','spawned','initialized','tools_checked','open','closed']);

// `createCollabBinding({configPath})` is what the door calls: it reads the config file and the kit's own pin.
export function createCollabBinding({configPath}={}){
  const {config,sha256}=readCollabConfig(configPath);
  return bindCollab({config,configSha256:sha256,pin:collabPin()});
}

// The inner function. It takes the transport (`connect`, by default the stdio port), so that a test can hand over
// one that starts a stand-in. `pin` and `card` default to the kit's own for the door and are given by tests.
// Returns a binding for runSession: {module, look, close, deadlines, at_end, bound_to}. Binding reads the card and
// writes nothing; nothing is started until `open` is invoked.
export function bindCollab({config:given,configSha256,pin:givenPin,card=loadCollabCard(),connect=spawnStdioEndpoint,requestBytes=L.request_bytes}={}){
  const config=checkCollabConfig(given);
  const pin=checkPin(givenPin);
  if(typeof configSha256!=='string'||!/^[a-f0-9]{64}$/.test(configSha256)||typeof connect!=='function'||!Number.isSafeInteger(requestBytes))throw unusable();
  const {bundlePath,bunPath,databasePath,homeDir,workspace,actor,journal,timeoutMs}=config;
  const declared=Object.fromEntries(Object.keys(OPERATIONS).map(id=>[id,new Set()]));
  const state={step:'not_opened',openFailedBefore:undefined,transport:'not_started',closedBy:undefined,inFlight:null,flight:undefined,closing:false,
    unknown:[],unknownCount:0,native:null,claims:new Map(),tasks:new Map(),lastPage:null,lastCall:null,report:undefined,sessionEnded:false};
  let endpoint,copyDir;

  // ---- one request to the backend ----
  async function request(method,params){
    try{return await endpoint.request(method,params);}
    catch(error){
      const known=error instanceof EndpointError;
      const why=known?error.code:'transport_error';
      if(TRANSPORT_ENDS.has(why)&&state.transport==='running'){state.transport='closed';state.closedBy=why;}
      throw Object.assign(new CollabFailure(why,true),{sent:!known||error.uncertain===true});
    }
  }
  // A write whose outcome is not known latches: no more writes from this binding, and this one is never sent again.
  function notKnown(operation,why){
    const write=OPERATIONS[operation].write;
    if(write){
      state.unknownCount+=1;
      if(state.unknown.length<L.unknown_listed)state.unknown.push({operation,why});
    }
    return new CollabFailure(why,write);
  }
  // One tools/call. Returns the structuredContent of a success. A refusal is passed on only when the card lists its
  // code for this operation, the answer has the plain refusal shape, and the key a success carries is not in it.
  async function callTool(operation,args,{tool=OPERATIONS[operation].tool,success=OPERATIONS[operation].success,passOn=declared[operation]}={}){
    let result;
    try{result=await request('tools/call',{name:tool,arguments:args});}
    catch(error){
      if(error.sent)throw notKnown(operation,error.why);
      // Not sent: nothing can have been written.
      if(error.why==='request_too_large'&&OPERATIONS[operation].own.includes('request_too_large'))throw new Decline('request_too_large');
      if(error.why==='transport_closed'&&OPERATIONS[operation].own.includes('backend_not_running'))throw new Decline('backend_not_running');
      throw new CollabFailure(error.why,false);
    }
    if(record(result)&&result.isError===true){
      const body=result.structuredContent;
      if(record(body)&&typeof body.error==='string'&&typeof body.message==='string'&&!Object.hasOwn(body,success)&&passOn.has(body.error))throw new Decline(body.error);
      throw notKnown(operation,'backend_refusal_not_on_card');
    }
    if(!record(result)||!record(result.structuredContent))throw notKnown(operation,'answer_not_understood');
    return result.structuredContent;
  }
  const notUnderstood=operation=>notKnown(operation,'answer_not_understood');

  // ---- what the binding remembers ----
  function taskView(operation,task){
    if(!record(task)||!isId(task.id)||!wholeNumber(task.version,1)||!['open','claimed','blocked','completed'].includes(task.status)||
      (task.lease_id!=null&&!isId(task.lease_id)))throw notUnderstood(operation);
    const view={id:task.id,title:typeof task.title==='string'?task.title:null,status:task.status,
      effective_status:typeof task.effective_status==='string'&&task.effective_status.length<=64?task.effective_status:null,version:task.version,
      lease_id:task.lease_id??null,lease_expires_at:typeof task.lease_expires_at==='string'&&task.lease_expires_at.length<=64?task.lease_expires_at:null};
    state.tasks.delete(view.id);
    state.tasks.set(view.id,{id:view.id,version:view.version,status:view.status});
    while(state.tasks.size>L.tasks_remembered)state.tasks.delete(state.tasks.keys().next().value);
    return view;
  }
  // Memory only: no file is read and the backend is not asked. Held to L.look_bytes by leaving rows out, oldest first.
  function look(){
    const tasks=[...state.tasks.values()].map(row=>({...row}));
    const view={step:state.step,...(state.openFailedBefore===undefined?{}:{open_failed_before:state.openFailedBefore}),transport:state.transport,
      ...(state.closedBy===undefined?{}:{transport_closed_by:state.closedBy}),in_flight:state.inFlight,writes_latched:state.unknownCount>0,
      unknown_calls:state.unknown.map(row=>({...row})),...(state.unknownCount>state.unknown.length?{unknown_calls_not_listed:state.unknownCount-state.unknown.length}:{}),
      native:state.native?{...state.native}:null,claims:[...state.claims.keys()],tasks,
      last_page:state.lastPage?{anchor:{...state.lastPage.anchor},cursor_version:state.lastPage.version}:null,last_call:state.lastCall?{...state.lastCall}:null};
    const over=()=>Buffer.byteLength(JSON.stringify(view))>L.look_bytes;
    while(over()&&tasks.length){tasks.shift();view.tasks_not_listed=state.tasks.size-tasks.length;}
    if(over()){view.unknown_calls_not_listed=state.unknownCount;view.unknown_calls=[];}
    if(over()&&view.last_page){view.last_page={cursor_version:state.lastPage.version,anchor_not_listed:true};}
    if(over()){view.claims_not_listed=view.claims.length;view.claims=[];}
    return view;
  }

  // ---- open ----
  const lstatOf=target=>{try{return fs.lstatSync(target);}catch{return undefined;}};
  // The first folder of a path that is not there: the one a mkdir of the whole path would make first.
  function firstMissing(target){
    let missing=target;
    for(let current=path.dirname(target);current!==missing&&!lstatOf(current);current=path.dirname(current))missing=current;
    return missing;
  }
  // Read in the pinned bundle (inspectRepository): the backend asks git for the top level of the repository that
  // holds the workspace and, when there is one, works there and not in the workspace. So the folder to keep apart
  // from homeDir and the journal is that one. Git is not run here: the nearest folder, at the workspace or above
  // it, that holds an entry named `.git` is taken to be it. That can name a folder git itself would not use.
  function repositoryTop(start){
    for(let current=start;;){
      if(lstatOf(path.join(current,'.git')))return current;
      const up=path.dirname(current);
      if(up===current)return start;
      current=up;
    }
  }
  function executable(target){
    try{
      if(!fs.statSync(target).isFile())return false;
      fs.accessSync(target,fs.constants.X_OK);
      return true;
    }catch{return false;}
  }
  async function open(){
    // Checks first. Each reads and none writes, so each thing found wrong is a refusal that changed nothing.
    let bytes;
    try{bytes=Buffer.from(readBoundedBytes(bundlePath,L.bundle_bytes));}catch{throw new Decline('bundle_unavailable');}
    if(sha(bytes)!==pin.bundle_sha256)throw new Decline('pin_mismatch');
    if(!executable(bunPath))throw new Decline('bun_unavailable');
    const home=lstatOf(homeDir);
    if((home&&(!home.isDirectory()||home.isSymbolicLink()))||isUserHome(homeDir))throw new Decline('home_dir_unavailable');
    const place=lstatOf(workspace);
    const realWorkspace=realOf(workspace);
    if(!place||!place.isDirectory()||place.isSymbolicLink()||realWorkspace===undefined)throw new Decline('workspace_unavailable');
    for(const folder of new Set([realWorkspace,repositoryTop(realWorkspace)])){
      if(!apart(folder,homeDir)||!apart(folder,path.dirname(databasePath)))throw new Decline('workspace_unavailable');
    }
    const there=lstatOf(databasePath);
    if(journal==='new'&&there)throw new Decline('journal_exists');
    if(journal==='existing'&&!(there&&there.isFile()))throw new Decline('journal_missing');
    // homeDir is made when it is missing. A first attempt that fails and leaves nothing behind is still a refusal: the
    // first folder that was missing is looked at again afterwards, and it is still not there.
    if(!home){
      const missing=firstMissing(homeDir);
      try{fs.mkdirSync(homeDir,{recursive:true,mode:0o700});}
      catch{
        if(!lstatOf(missing))throw new Decline('home_dir_unavailable');
        state.openFailedBefore='home_ready';state.unknownCount+=1;state.unknown.push({operation:'open',why:'could_not_write'});
        throw new CollabFailure('could_not_write',true);
      }
    }
    // From here on something is written. A failure is no longer a refusal: the step reached is kept, and open is not run again.
    let before='home_ready';
    const reach=step=>{state.step=step;before=STEPS[STEPS.indexOf(step)+1];};
    try{
      reach('home_ready');
      // Run these checked bytes, not a second reading of bundlePath: a private folder, one read-only file.
      copyDir=fs.mkdtempSync(path.join(homeDir,'xenia-collab-bundle-'));
      const copy=path.join(copyDir,'bundle.js');
      fs.writeFileSync(copy,bytes,{flag:'wx',mode:0o400});
      reach('bundle_copied');
      // A start that fails is named as that. The port rejects with a code of its own, or with the runtime's error when
      // the file at bunPath is not a program; nothing of either is kept but the port's code.
      try{
        endpoint=await connect({command:bunPath,args:['--no-env-file','--no-install',`--config=${devNull}`,copy],cwd:homeDir,
          env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:homeDir,AGENTOOL_COLLAB_DB:databasePath,GIT_OPTIONAL_LOCKS:'0'},
          timeoutMs,maxResponseBytes:L.response_bytes,maxRequestBytes:requestBytes});
      }catch(error){throw new CollabFailure(error instanceof EndpointError?error.code:'spawn_failed',true);}
      state.transport='running';
      reach('spawned');
      if(state.closing)throw new CollabFailure('closed_during_open',true);
      const hello=await request('initialize',{protocolVersion:pin.mcp_protocol,capabilities:{},clientInfo:{name:'xenia-agent-first-collab',version:card.module.version}});
      if(!record(hello)||hello.protocolVersion!==pin.mcp_protocol||!record(hello.serverInfo)||hello.serverInfo.name!==pin.server_name||
        hello.serverInfo.version!==pin.server_version||!record(hello.capabilities)||!record(hello.capabilities.tools))throw new CollabFailure('server_is_not_the_pinned_one',true);
      endpoint.notifyInitialized();
      reach('initialized');
      if(!toolsMatch(await request('tools/list',{}),sendsOf(card)))throw new CollabFailure('tools_do_not_match_card',true);
      reach('tools_checked');
      // No refusal of the session start is passed on: by now the backend has opened the journal.
      const started=await callTool('open',{root_path:workspace,actor},{passOn:new Set()});
      if(!record(started.workspace)||!isId(started.workspace.id)||!record(started.session)||!isId(started.session.id)||started.credential_file_created!==true)throw notUnderstood('open');
      state.native={workspace_id:started.workspace.id,session_id:started.session.id};
      reach('open');
      return {workspace_id:state.native.workspace_id,session_id:state.native.session_id,server:{name:pin.server_name,version:pin.server_version},journal};
    }catch(error){
      state.openFailedBefore=before;
      const why=error instanceof CollabFailure?error.why:error instanceof Decline?'backend_refusal_not_on_card':'could_not_write';
      // callTool has already recorded a session start whose outcome is not known; every other failure is recorded here.
      if(!state.unknown.some(row=>row.operation==='open')){state.unknownCount+=1;state.unknown.push({operation:'open',why});}
      // A backend that was started and is of no more use to this binding is stopped now, not left running until the
      // session ends. Nothing is sent to it first. The copy of the bundle stays until close().
      if(endpoint){
        try{await endpoint.close();}catch{}
        if(state.transport==='running'){state.transport='closed';state.closedBy='open_failed';}
      }
      throw new CollabFailure(why,true);
    }
  }

  // ---- the other eight ----
  const ids=()=>state.native;
  const bodies={
    open,
    async status(){
      const result=await callTool('status',{workspace_id:ids().workspace_id});
      const counts=result.counts,sessions=result.active_sessions;
      if(!record(counts)||['open','claimed','blocked','completed'].some(name=>!wholeNumber(counts[name]))||!Array.isArray(sessions))throw notUnderstood('status');
      const active=sessions.filter(row=>record(row)&&isId(row.id)).map(row=>row.id);
      return {workspace_id:ids().workspace_id,session_id:ids().session_id,counts:{open:counts.open,claimed:counts.claimed,blocked:counts.blocked,completed:counts.completed},
        expired_claims:wholeNumber(result.expired_claims)?result.expired_claims:null,
        active_session_ids:active.slice(0,L.active_sessions_listed),active_sessions_not_listed:sessions.length-Math.min(active.length,L.active_sessions_listed)};
    },
    async next(input){
      const result=await callTool('next',{workspace_id:ids().workspace_id,event_limit:input.event_limit??10});
      if(!record(result.events)||!isAnchor(result.events.next_anchor)||!record(result.session)||!wholeNumber(result.session.cursor_version)||!Array.isArray(result.reports))throw notUnderstood('next');
      state.lastPage={anchor:anchorOf(result.events.next_anchor),version:result.session.cursor_version,
        from:isAnchor(result.events.cursor)?anchorOf(result.events.cursor):undefined};
      return {workspace_id:ids().workspace_id,session_id:ids().session_id,cursor_version:state.lastPage.version,events:result.events,reports:result.reports};
    },
    async acknowledge(input){
      const page=state.lastPage;
      if(!page||!sameAnchor(input.anchor,page.anchor)||input.expected_cursor_version!==page.version)throw new Decline('unobserved_anchor');
      const result=await callTool('acknowledge',{workspace_id:ids().workspace_id,anchor:anchorOf(page.anchor),expected_cursor_version:page.version});
      const session=result.session;
      // As read in the pinned bundle: an anchor at the cursor the session already has (an empty page) changes nothing and
      // keeps the version; any other moves the cursor and adds one.
      const moves=page.from===undefined?undefined:!sameAnchor(page.from,page.anchor);
      if(!record(session)||session.id!==ids().session_id||!isAnchor(session.cursor)||!sameAnchor(session.cursor,page.anchor)||
        ![page.version,page.version+1].includes(session.cursor_version)||(moves!==undefined&&(session.cursor_version===page.version+1)!==moves))throw notUnderstood('acknowledge');
      state.lastPage=null;
      return {cursor_version:session.cursor_version,moved:session.cursor_version===page.version+1};
    },
    async report(input){
      // The card counts characters; the backend counts UTF-16 units.
      if(input.body.length>8000||(input.limits!==undefined&&input.limits.length>2000))throw new Decline('text_too_long');
      const result=await callTool('report',{workspace_id:ids().workspace_id,idempotency_key:input.idempotency_key,kind:input.kind,body:input.body,
        ...(input.limits===undefined?{}:{limits:input.limits}),...(input.task_id===undefined?{}:{task_id:input.task_id}),confidence:'unknown',evidence_refs:[],relation:'informs'});
      if(!record(result.report)||!isId(result.report.id))throw notUnderstood('report');
      return {report_id:result.report.id};
    },
    async 'task-create'(input){
      if(input.title.length>300)throw new Decline('text_too_long');
      const result=await callTool('task-create',{workspace_id:ids().workspace_id,idempotency_key:input.idempotency_key,title:input.title,work_mode:'coordination'});
      return taskView('task-create',result.task);
    },
    async 'task-get'(input){
      const result=await callTool('task-get',{workspace_id:ids().workspace_id,task_id:input.task_id});
      return taskView('task-get',result.task);
    },
    async 'task-claim'(input){
      if(!state.claims.has(input.task_id)&&state.claims.size>=L.leases)throw new Decline('lease_limit');
      const result=await callTool('task-claim',{workspace_id:ids().workspace_id,task_id:input.task_id,idempotency_key:input.idempotency_key,expected_version:input.expected_version});
      const view=taskView('task-claim',result.task);
      if(view.id!==input.task_id||view.status!=='claimed'||view.lease_id===null)throw notUnderstood('task-claim');
      state.claims.set(view.id,view.lease_id);
      return view;
    },
    async 'task-release'(input){
      const lease=state.claims.get(input.task_id);
      if(lease===undefined)throw new Decline('lease_not_held_by_module');
      const result=await callTool('task-release',{workspace_id:ids().workspace_id,task_id:input.task_id,lease_id:lease,idempotency_key:input.idempotency_key,expected_version:input.expected_version});
      const view=taskView('task-release',result.task);
      if(view.id!==input.task_id)throw notUnderstood('task-release');
      state.claims.delete(view.id);
      return view;
    },
  };
  // What every call passes first, in this order: one call at a time; open once; open before anything else; no write
  // after an unknown outcome; a backend that is there. Each is a refusal raised before anything is sent.
  const handlers=Object.fromEntries(Object.keys(OPERATIONS).map(id=>[id,async input=>{
    const write=OPERATIONS[id].write;
    try{
      if(state.inFlight)throw new Decline('busy');
      if(id==='open'){
        // An open that began to write and failed is not run again, whatever step it reached.
        if(state.step!=='not_opened'||state.openFailedBefore!==undefined||state.closing)throw new Decline('already_open');
      }else{
        // Once close() has begun, nothing more is sent: the end is the only thing that talks to the backend then.
        if(state.step!=='open'||state.closing)throw new Decline('not_open');
        if(write&&state.unknownCount>0)throw new Decline('earlier_outcome_unknown');
        if(state.transport!=='running')throw new Decline('backend_not_running');
      }
      state.inFlight=id;
      let settle;
      state.flight=new Promise(resolve=>{settle=resolve;});
      let value;
      try{value=await bodies[id](input);}
      finally{state.inFlight=null;settle();}
      state.lastCall={operation:id,outcome:'returned'};
      return value;
    }catch(error){
      state.lastCall={operation:id,outcome:error instanceof Decline?'declined':error instanceof CollabFailure&&!error.unknown?'failed':write?'unknown':'failed'};
      throw error;
    }
  }]));
  const module=definitionFrom(card,handlers);
  for(const [id,op] of Object.entries(card.operations))for(const entry of op.backend_refusals)declared[id].add(entry.code);

  // ---- the end ----
  // One request at the end, within what is left of the close budget. Returns the structuredContent of a success, or
  // undefined: for a refusal, a failure, or no answer in time. Nothing is passed on from a refusal.
  async function endCall(tool,args,until){
    const left=until-Date.now();
    if(left<=0||state.transport!=='running')return undefined;
    let timer;
    const late=new Promise(resolve=>{timer=setTimeout(()=>resolve(late),left);});
    try{
      const result=await Promise.race([request('tools/call',{name:tool,arguments:args}),late]);
      if(result===late||!record(result)||result.isError===true||!record(result.structuredContent))return undefined;
      return result.structuredContent;
    }catch{return undefined;}
    finally{clearTimeout(timer);}
  }
  async function finish(){
    const did=[],didNot=[],left=[];
    state.closing=true;
    const pending=state.inFlight;
    if(state.step==='not_opened'&&!pending)return Object.freeze({complete:true,did,did_not:didNot,left_behind:left});
    const until=Date.now()+L.close_budget_ms;
    if(state.step==='open'&&!pending&&state.unknownCount===0&&state.transport==='running'){
      // Nothing is unknown and nothing is pending: release what this binding claimed, then end its native session.
      let stopped=false;
      for(const [taskId,leaseId] of [...state.claims]){
        const read=await endCall('collab_task_get',{workspace_id:ids().workspace_id,task_id:taskId},until);
        const task=read?.task;
        if(!record(task)||task.id!==taskId||!wholeNumber(task.version,1)){
          didNot.push(`release the claim on task ${taskId}: the task could not be read first, so no release was sent`);
          stopped=true;break;
        }
        if(task.status!=='claimed'||task.lease_id!==leaseId){
          did.push(`task ${taskId}: the journal no longer shows this binding's claim, so no release was sent`);
          state.claims.delete(taskId);
          continue;
        }
        // The key is made from what is being released, so the same release always carries the same key.
        const key=`xenia-end-${sha(JSON.stringify([ids().session_id,taskId,leaseId,task.version])).slice(0,40)}`;
        const released=await endCall('collab_task_release',{workspace_id:ids().workspace_id,task_id:taskId,lease_id:leaseId,expected_version:task.version,idempotency_key:key,
          summary:'Released at the end of the session that held it. The task is not completed.'},until);
        if(!record(released?.task)||released.task.id!==taskId||released.task.status!=='open'){
          didNot.push(`release the claim on task ${taskId}: the backend did not confirm it, and whether it was released is not known`);
          stopped=true;break;
        }
        did.push(`released the claim on task ${taskId}`);
        state.claims.delete(taskId);
      }
      if(stopped)didNot.push('end the native session: not sent, because a release before it was not confirmed');
      else{
        const ended=await endCall('collab_session_end',{reason:'xenia-session-ended'},until);
        if(record(ended?.session)&&ended.session.id===ids().session_id&&ended.session.status==='ended'&&ended.credential_file_removed===true){
          state.sessionEnded=true;
          did.push('ended the native session; the backend says it removed that session\'s credential file');
        }else didNot.push('end the native session: the backend did not confirm it, and whether it ended is not known');
      }
    }else if(state.step==='open'){
      const why=pending?`a call (${pending}) was still pending`:state.unknownCount>0?'the outcome of an earlier call is unknown':'the backend was not running';
      didNot.push(`release ${state.claims.size} claim${state.claims.size===1?'':'s'} and end the native session: nothing was sent, because ${why}`);
    }else{
      didNot.push(pending==='open'?'finish open: it was still pending, and what the backend had written by then is not known':
        `finish open: it stopped before the step ${state.openFailedBefore??'home_ready'}, and what the backend had written by then is not known`);
    }
    // In every case: the process, then the copy.
    if(endpoint){
      let closed=false;
      try{closed=(await endpoint.close()).closed===true;}catch{}
      if(state.transport==='running'){state.transport='closed';state.closedBy='closed_at_the_end';}
      if(closed)did.push('closed the backend process');
      else didNot.push('close the backend process: it had not ended when this was written');
    }
    // A call that was pending is answered once the process is gone; it is given a moment, so that it can no longer write.
    if(pending&&state.flight){let timer;await Promise.race([state.flight,new Promise(resolve=>{timer=setTimeout(resolve,1000);})]);clearTimeout(timer);}
    if(endpoint&&state.transport==='running'){try{await endpoint.close();}catch{}state.transport='closed';state.closedBy='closed_at_the_end';}
    if(copyDir){
      try{fs.rmSync(copyDir,{recursive:true,force:true});did.push('removed the copy of the bundle from homeDir');}
      catch{didNot.push('remove the copy of the bundle from homeDir');}
    }
    // What is known to be left. The ids are the backend's, each held to its id form before it was kept.
    if(state.native&&!state.sessionEnded){
      left.push(`native session ${state.native.session_id} in workspace ${state.native.workspace_id}: not known to have ended`);
      left.push('that session\'s credential file, in the folder collab-sessions beside the journal');
    }else if(state.step!=='open'&&state.openFailedBefore==='open')left.push('a native session and its credential file, if the backend started one before open failed: not surveyed');
    for(const taskId of state.claims.keys())left.push(`task ${taskId}: a claim this binding made is not known to have been released`);
    left.push(STEPS.indexOf(state.step)>=STEPS.indexOf('spawned')||endpoint?
      'the journal at databasePath, and anything else the backend wrote beside it, in homeDir or in the workspace: not surveyed':
      'homeDir, if open created it: not removed');
    state.step='closed';
    return Object.freeze({complete:didNot.length===0,did,did_not:didNot,left_behind:left});
  }
  function close(){
    if(state.report===undefined)state.report=finish();
    return state.report;
  }

  const boundTo={config_sha256:configSha256,actor,journal,timeout_ms:timeoutMs,bundle_path:bundlePath,bun_path:bunPath,database_path:databasePath,home_dir:homeDir,workspace,
    pin:{bundle_sha256:pin.bundle_sha256,server_version:pin.server_version}};
  // checkCollabConfig holds the paths and the actor to shown_bytes, which leaves room for the rest; this is the check that it did.
  if(Buffer.byteLength(JSON.stringify(boundTo))>L.bound_to_bytes)throw unusable();
  return {
    module,look,close,
    // open talks to the backend three times (initialize, tools/list, the session start), so it states a longer deadline.
    deadlines:{open:Math.min(30000,Math.max(10000,3*timeoutMs+3000))},
    at_end:[...card.at_end],
    bound_to:boundTo,
  };
}
