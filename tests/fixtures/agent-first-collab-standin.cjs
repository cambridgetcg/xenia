// SPDX-License-Identifier: MPL-2.0
// A stand-in for the AgentTool Collab MCP backend, for tests only. It is not
// that backend and holds none of its code. It was written by reading the
// pinned bundle (sha256 fdfd99b2..., server 0.5.0, the `collab` pin in
// agent-first/0.1/agenttool.lock.json): the ten tools the kit's adapter
// calls, their input rules, the shape of an answer and of a refusal. The
// bundle itself was never run to write or to check this file, so nothing here
// shows how the real backend behaves.
//
// What it copies from that reading:
// - the wire: JSON-RPC 2.0, one message per line, on stdin and stdout;
//   `initialize`, `tools/list`, `tools/call`;
// - the input rules of each tool: the bounds the tool's schema states (text
//   lengths counted in UTF-16 units, whole numbers, listed words), then the
//   store's own (text is trimmed and must not be empty or hold a NUL; an id
//   or an idempotency key is 1 to 200 of A-Z a-z 0-9 . _ : - and starts with
//   a letter or digit; a version is a positive whole number);
// - an answer: {content, structuredContent}; a refusal: the same with
//   isError true and structuredContent {error, message, ...details}; an input
//   the tool's schema does not accept: {content, isError: true} with no
//   structuredContent;
// - the refusal codes on the paths the adapter uses, and the order the
//   pinned store checks them in.
// What it does not copy: SQLite (the journal here is one JSON file at
// AGENTOOL_COLLAB_DB), git (the real backend runs git in the workspace when
// a session starts and when a task is claimed; this file runs nothing),
// handoffs, reviews, checkpoints, legacy actor mode, cursor recovery.
//
// Test controls, which the real backend does not have:
// - $HOME/standin-control.json is read before every request. `init` changes
//   what `initialize` and `tools/list` say; `on.<tool>` makes one tool
//   misbehave (see `misbehave` below); `clock_ms` moves the clock forward.
// - $HOME/standin-started.json is written once at startup: the arguments, the
//   names of the environment variables, the working directory, this file's
//   own path and the process id.
// - $HOME/standin-calls.log gets one line, the tool's name, for every
//   tools/call request received.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const readline=require('node:readline');

const HOME=process.env.HOME;
const DB=process.env.AGENTOOL_COLLAB_DB;
const GENESIS='0'.repeat(64);
const PLANTED='PLANTED_BACKEND_TEXT';
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const uuid=()=>crypto.randomUUID();
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function control(){
  try{return JSON.parse(fs.readFileSync(path.join(HOME,'standin-control.json'),'utf8'));}catch{return {};}
}
const now=()=>new Date(Date.now()+(control().clock_ms??0)).toISOString();

class CollabError extends Error{
  constructor(code,message,details={}){super(message);this.code=code;this.details=details;}
}
class InputError extends Error{}

// ---- the journal: one JSON file ----
function openStore(){
  fs.mkdirSync(path.dirname(DB),{recursive:true,mode:0o700});
  if(!fs.existsSync(DB))fs.closeSync(fs.openSync(DB,'wx',0o600));
  const text=fs.readFileSync(DB,'utf8');
  return text?JSON.parse(text):{workspaces:{},sessions:{},tasks:{},reports:{},events:{},mutations:{}};
}
let store;
const load=()=>{store=openStore();};
const save=()=>{fs.writeFileSync(DB,JSON.stringify(store));};

// ---- the store's own input rules (read in the pinned bundle) ----
function cleanText(value,field,max){
  const text=value.trim();
  if(!text)throw new CollabError(`invalid_${field}`,`${field} must not be empty ${PLANTED}`);
  if(text.length>max)throw new CollabError(`invalid_${field}`,`${field} exceeds ${max} characters ${PLANTED}`);
  if(text.includes('\x00'))throw new CollabError(`invalid_${field}`,`${field} must not contain NUL bytes ${PLANTED}`);
  return text;
}
const optionalText=(value,field,max)=>value===undefined||value.trim()===''?null:cleanText(value,field,max);
function validateId(value,field){
  const id=cleanText(value,field,200);
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))throw new CollabError(`invalid_${field}`,`${field} contains unsupported characters ${PLANTED}`);
  return id;
}
const validateKey=value=>validateId(value,'idempotency_key');
function validateVersion(value){
  if(!Number.isInteger(value)||value<1)throw new CollabError('invalid_expected_version',`expected_version must be a positive integer ${PLANTED}`);
  return value;
}

// ---- the tools' schemas, as tools/list would give them ----
// Written from the tool definitions in the pinned bundle and from how its
// schema library writes JSON Schema for an input: no additionalProperties,
// `required` for what is not optional, a positive whole number as
// exclusiveMinimum 0, and the safe-integer limits on every whole number.
const SAFE=9007199254740991;
const str=(min,max)=>({type:'string',...(min===undefined?{}:{minLength:min}),...(max===undefined?{}:{maxLength:max})});
const int=(min,max=SAFE)=>({type:'integer',minimum:min,maximum:max});
const positive={type:'integer',exclusiveMinimum:0,maximum:SAFE};
const words=list=>({type:'string',enum:list});
const optional=schema=>({...schema,optional:true});
const workspaceId=str(1),key=str(1,200),taskId=str(1),leaseId=str(1),actorLabel=str(1,200);
const anchor={type:'object',properties:{epoch_id:str(1),sequence:int(0),hash:str(64,64)},required:['epoch_id','sequence','hash']};
const KINDS=['observation','inference','proposal','decision'];
const CONFIDENCE=['high','medium','low','unknown'];
const RELATIONS=['informs','supports','challenges','corrects','withdraws','supersedes','resolves'];
const WORK_MODES=['coordination','read_only','edit'];
const TOOLS={
  collab_session_start:{root_path:str(1),actor:actorLabel,role:optional(str(undefined,200)),parent_session_id:optional(str(1)),repository_key:optional(str(1,1000))},
  collab_session_end:{reason:optional(str(undefined,2000))},
  collab_workspace_status:{workspace_id:workspaceId},
  collab_next:{workspace_id:workspaceId,actor:optional(actorLabel),after_sequence:optional(int(0)),known_cursor:optional(anchor),event_limit:optional(int(1,50))},
  collab_cursor_ack:{workspace_id:workspaceId,anchor,expected_cursor_version:int(0)},
  collab_report_append:{workspace_id:workspaceId,idempotency_key:key,task_id:optional(str(1)),to_session_id:optional(str(1)),kind:words(KINDS),body:str(1,8000),
    evidence_refs:optional({type:'array',items:str(1,2000),maxItems:128}),confidence:optional(words(CONFIDENCE)),confidence_basis:optional(str(undefined,2000)),
    limits:optional(str(undefined,2000)),relation:optional(words(RELATIONS)),target_report_id:optional(str(1)),authority_scope:optional(str(undefined,1000)),authority_basis:optional(str(undefined,2000))},
  collab_task_create:{workspace_id:workspaceId,actor:optional(actorLabel),idempotency_key:key,task_id:optional(str(1,200)),title:str(1,300),description:optional(str(undefined,8000)),
    dependencies:optional({type:'array',items:str(1,200),maxItems:128}),path_scopes:optional({type:'array',items:str(1,500),maxItems:128}),
    work_mode:optional(words(WORK_MODES)),completion_policy:optional(words(['reported','accepted'])),expected_base_sha:optional({type:'string',pattern:'^[a-fA-F0-9]{40,64}$'})},
  collab_task_get:{workspace_id:workspaceId,task_id:taskId},
  collab_task_claim:{workspace_id:workspaceId,task_id:taskId,actor:optional(actorLabel),idempotency_key:key,expected_version:positive,ttl_seconds:optional(int(30,3600))},
  collab_task_release:{workspace_id:workspaceId,task_id:taskId,lease_id:leaseId,actor:optional(actorLabel),idempotency_key:key,expected_version:positive,summary:optional(str(undefined,2000))},
};
function listed(name,shape,patch={}){
  const properties={},required=[];
  for(const [field,schema] of Object.entries(shape)){
    const {optional:isOptional,...rest}=schema;
    properties[field]=rest;
    if(!isOptional)required.push(field);
  }
  // A test can change one property, or take one away, to see what the adapter does with a backend that states other bounds.
  for(const [field,change] of Object.entries(patch)){
    if(field==='$required'){required.push(...change);continue;}
    if(change===null){delete properties[field];continue;}
    properties[field]={...properties[field],...change};
    for(const [keyword,value] of Object.entries(change))if(value===null)delete properties[field][keyword];
  }
  return {name,title:name,description:'A stand-in tool.',inputSchema:{type:'object',properties,...(required.length?{required}:{})}};
}
// What the schema library checks before the tool runs. A miss is not a store refusal: it has no structuredContent.
function checkInput(schema,value,at){
  const bad=what=>{throw new InputError(`Input validation error: ${at} ${what} ${PLANTED}`);};
  if(schema.type==='string'){
    if(typeof value!=='string')bad('must be a string');
    if(schema.minLength!==undefined&&value.length<schema.minLength)bad('is too short');
    if(schema.maxLength!==undefined&&value.length>schema.maxLength)bad('is too long');
    if(schema.enum&&!schema.enum.includes(value))bad('is not a listed word');
    if(schema.pattern&&!new RegExp(schema.pattern).test(value))bad('does not match');
  }else if(schema.type==='integer'){
    if(typeof value!=='number'||!Number.isSafeInteger(value))bad('must be a whole number');
    if(schema.minimum!==undefined&&value<schema.minimum)bad('is too small');
    if(schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum)bad('is too small');
    if(schema.maximum!==undefined&&value>schema.maximum)bad('is too large');
  }else if(schema.type==='array'){
    if(!Array.isArray(value))bad('must be a list');
    if(schema.maxItems!==undefined&&value.length>schema.maxItems)bad('is too long');
    value.forEach((item,index)=>checkInput(schema.items,item,`${at}[${index}]`));
  }else{
    if(!record(value))bad('must be an object');
    for(const name of schema.required??[])if(!Object.hasOwn(value,name))bad(`needs ${name}`);
    for(const [name,child] of Object.entries(schema.properties))if(Object.hasOwn(value,name))checkInput(child,value[name],`${at}.${name}`);
  }
}
function parseArgs(name,args){
  const shape=TOOLS[name],properties={},required=[];
  for(const [field,schema] of Object.entries(shape)){
    const {optional:isOptional,...rest}=schema;
    properties[field]=rest;
    if(!isOptional)required.push(field);
  }
  checkInput({type:'object',properties,required},args??{},'arguments');
  // The schema library drops names the tool does not declare.
  return Object.fromEntries(Object.keys(shape).filter(field=>Object.hasOwn(args??{},field)).map(field=>[field,args[field]]));
}

// ---- journal helpers ----
const eventsOf=workspaceId_=>store.events[workspaceId_]??(store.events[workspaceId_]=[]);
function appendEvent(workspace,type,entityId,actor,payload,sessionId_){
  const list=eventsOf(workspace.id),prev=list.at(-1)?.hash??GENESIS,sequence=list.length+1;
  const body={epoch_id:workspace.epoch_id,sequence,id:`event_${uuid()}`,type,entity_id:entityId,actor,session_id:sessionId_??null,occurred_at:now(),payload};
  const event={protocol:'agenttool.collab/0.2',workspace_id:workspace.id,...body,prev_hash:prev,hash:sha(prev+JSON.stringify(body))};
  list.push(event);
  workspace.event_head_sequence=sequence;workspace.event_head_hash=event.hash;
  return event;
}
function requireWorkspace(id){
  const workspace=store.workspaces[id];
  if(!workspace)throw new CollabError('workspace_not_found',`Workspace was not found ${PLANTED}`,{workspace_id:id});
  return workspace;
}
function validateAnchor(workspace,input){
  if(input.epoch_id!==workspace.epoch_id)throw new CollabError('cursor_epoch_mismatch',`The cursor belongs to another journal epoch ${PLANTED}`);
  if(input.sequence>workspace.event_head_sequence)throw new CollabError('cursor_ahead',`The cursor is ahead of the journal ${PLANTED}`);
  const hash=input.sequence===0?GENESIS:eventsOf(workspace.id)[input.sequence-1]?.hash;
  if(hash!==input.hash)throw new CollabError('cursor_mismatch',`The cursor does not resolve to an event in this journal ${PLANTED}`);
  return {epoch_id:input.epoch_id,sequence:input.sequence,hash:input.hash};
}
const expired=task=>task.status==='claimed'&&task.lease_expires_at!==null&&now()>=task.lease_expires_at;
function taskView(task){
  let effective=task.status;
  if(expired(task))effective=task.assignee_session_id?'recovery_required':'lease_expired';
  return {...task,effective_status:effective};
}
function requireTaskRow(workspaceId_,id){
  const task=store.tasks[id];
  if(!task||task.workspace_id!==workspaceId_)throw new CollabError('task_not_found',`Task '${id}' was not found ${PLANTED}`,{task_id:id});
  return task;
}
function requireVersion(task,expected){
  if(task.version!==expected)throw new CollabError('version_conflict',`Task changed since it was read ${PLANTED}`,{expected_version:expected,current_version:task.version});
}
const sessionView=session=>{const {token_hash,...rest}=session;return {...rest,cursor:{...session.cursor}};};
const credentialPath=id=>path.join(path.dirname(DB),'collab-sessions',`${id}.json`);
function writeCredential(session,token){
  const file=credentialPath(session.id);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.writeFileSync(file,`${JSON.stringify({format:'agenttool.collab/session-file/1',session_id:session.id,session_token:token,generation:session.generation,last_cursor:session.cursor})}\n`,{mode:0o600});
}

// ---- one process binds one session, as the real server does ----
let binding=null;
function bound(){
  if(!binding)throw new CollabError('session_not_bound',`Start a credential-bound session first ${PLANTED}`);
  const session=store.sessions[binding.session_id];
  if(!session||session.status!=='active'||session.token_hash!==sha(binding.token)||session.generation!==binding.generation){
    throw new CollabError('session_auth_failed',`Session credentials are invalid ${PLANTED}`);
  }
  return session;
}
function sameWorkspace(id){
  if(binding&&binding.workspace_id!==id)throw new CollabError('session_workspace_mismatch',`The bound session belongs to another workspace ${PLANTED}`);
}
// The pinned store keeps one receipt for each (session, idempotency key): the same request is answered again from
// the receipt, and another request under the same key is refused. Both are decided before anything is changed.
function receipt(session,idempotencyKey,operation,request){
  const mutationKey=`${session.workspace_id}\x00session:${session.id}\x00${idempotencyKey}`;
  const existing=store.mutations[mutationKey],hash=sha(JSON.stringify({operation,request}));
  if(existing&&(existing.operation!==operation||existing.request_hash!==hash)){
    throw new CollabError('idempotency_conflict',`Idempotency key was already used for a different session mutation ${PLANTED}`,{operation:existing.operation});
  }
  return {found:Boolean(existing),value:existing?.response,keep(response){store.mutations[mutationKey]={operation,request_hash:hash,response};return response;}};
}
function mutate(idempotencyKeyInput,operation,request,apply){
  const idempotencyKey=validateKey(idempotencyKeyInput);
  const session=bound();
  const held=receipt(session,idempotencyKey,operation,request);
  session.last_seen_at=now();
  if(held.found)return held.value;
  return held.keep(apply(session));
}

const HANDLERS={
  collab_session_start(input){
    if(binding)throw new CollabError('session_already_bound',`This MCP process already has a bound session ${PLANTED}`,{session_id:binding.session_id});
    const actor=cleanText(input.actor,'actor',200);
    const role=optionalText(input.role,'role',200);
    const requested=path.resolve(input.root_path);
    if(!fs.existsSync(requested)||!fs.statSync(requested).isDirectory())throw new CollabError('workspace_not_directory',`Workspace root must be an existing directory ${PLANTED}`,{root_path:requested});
    const root=fs.realpathSync(requested);
    const id=`ws_${sha(root).slice(0,24)}`;
    const workspace=store.workspaces[id]??(store.workspaces[id]={id,root_path:root,name:path.basename(root),epoch_id:`epoch_${uuid()}`,event_head_sequence:0,event_head_hash:GENESIS,created_at:now()});
    const token=crypto.randomBytes(32).toString('base64url');
    const session={id:`session_${uuid()}`,workspace_id:id,worktree_id:`wt_${sha(root).slice(0,24)}`,actor,role,parent_session_id:null,status:'active',generation:1,
      token_hash:sha(token),joined_at:now(),last_seen_at:now(),ended_at:null,cursor:{epoch_id:workspace.epoch_id,sequence:0,hash:GENESIS},cursor_version:0,reset_generation:0,cursor_recovery_required:false};
    store.sessions[session.id]=session;
    appendEvent(workspace,'session.joined',session.id,actor,{worktree_id:session.worktree_id,role},session.id);
    writeCredential(session,token);
    binding={session_id:session.id,workspace_id:id,token,generation:1};
    return {workspace:{...workspace},worktree:{id:session.worktree_id,workspace_id:id,root_path:root},session:sessionView(session),credential_file_created:true,
      resume_environment_variable:'AGENTOOL_COLLAB_SESSION_FILE',session_file_name:`${session.id}.json`,
      identity_boundary:'session_credentials_fence_cooperating_local_clients_but_do_not_authenticate_a_person_or_model',
      credential_boundary:'credential_file_is_a_local_bearer_secret_never_return_its_contents_to_a_model_or_commit_it'};
  },
  collab_session_end(input){
    if(!binding)throw new CollabError('session_not_bound',`No session is bound ${PLANTED}`);
    const reason=optionalText(input.reason,'reason',2000);
    const session=bound();
    const active=Object.values(store.tasks).filter(task=>task.workspace_id===session.workspace_id&&task.assignee_session_id===session.id&&task.status==='claimed'&&task.lease_expires_at>now());
    if(active.length)throw new CollabError('session_has_active_leases',`Release, complete, or hand off active task leases before ending the session ${PLANTED}`,
      {task_ids:active.map(task=>task.id),required_action:'resolve_active_task_leases'});
    session.status='ended';session.ended_at=now();session.last_seen_at=now();session.generation+=1;session.token_hash=sha(uuid());
    appendEvent(requireWorkspace(session.workspace_id),'session.ended',session.id,session.actor,{reason},session.id);
    binding=null;
    fs.rmSync(credentialPath(session.id),{force:true});
    return {session:sessionView(session),credential_file_removed:true,session_file_name:`${session.id}.json`};
  },
  collab_workspace_status(input){
    const workspace=requireWorkspace(input.workspace_id);
    const tasks=Object.values(store.tasks).filter(task=>task.workspace_id===workspace.id).map(taskView);
    const counts={open:0,claimed:0,blocked:0,completed:0};
    let expiredClaims=0;
    for(const task of tasks){
      if(task.effective_status==='lease_expired'){counts.open+=1;expiredClaims+=1;}
      else if(task.effective_status==='recovery_required'){counts.claimed+=1;expiredClaims+=1;}
      else counts[task.status]+=1;
    }
    return {workspace:{...workspace},counts,expired_claims:expiredClaims,active_claims:tasks.filter(task=>task.effective_status==='claimed'),
      blocked_tasks:[],pending_reviews:[],active_sessions:Object.values(store.sessions).filter(session=>session.workspace_id===workspace.id&&session.status==='active').map(sessionView),
      recent_decisions:[],recent_reports:Object.values(store.reports).filter(report=>report.workspace_id===workspace.id).slice(-20)};
  },
  collab_next(input){
    sameWorkspace(input.workspace_id);
    const session=bound();
    const limit=input.event_limit??10;
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new CollabError('invalid_event_limit',`event_limit must be an integer between 1 and 50 ${PLANTED}`);
    // The pinned store writes here too: it stamps the session as seen before it reads the page.
    session.last_seen_at=now();
    const workspace=requireWorkspace(session.workspace_id);
    const all=eventsOf(workspace.id),after=session.cursor.sequence;
    const events=all.slice(after,after+limit);
    const cursor={epoch_id:workspace.epoch_id,sequence:after,hash:after===0?GENESIS:all[after-1].hash};
    const last=events.at(-1);
    const nextAnchor=last?{epoch_id:last.epoch_id,sequence:last.sequence,hash:last.hash}:cursor;
    const tasks=Object.values(store.tasks).filter(task=>task.workspace_id===workspace.id).map(taskView);
    return {actor:session.actor,session:sessionView(session),
      own_claims:tasks.filter(task=>task.effective_status==='claimed'&&task.assignee_session_id===session.id),
      ready_tasks:tasks.filter(task=>task.status==='open'),claimable_tasks:tasks.filter(task=>task.status==='open'),conflicted_tasks:[],handoff_offers:[],
      reports:Object.values(store.reports).filter(report=>report.workspace_id===workspace.id&&report.event_sequence>after&&report.event_sequence<=nextAnchor.sequence&&
        (report.to_session_id===null||report.to_session_id===session.id)),
      events:{events,next_cursor:nextAnchor.sequence,cursor,next_anchor:nextAnchor,head_sequence:workspace.event_head_sequence,head_hash:workspace.event_head_hash,
        has_more:nextAnchor.sequence<workspace.event_head_sequence,chain_valid:true,verification_scope:'returned_page'},
      projection_scope:'snapshot_head',reports_scope:'event_page'};
  },
  collab_cursor_ack(input){
    sameWorkspace(input.workspace_id);
    const session=bound();
    const workspace=requireWorkspace(session.workspace_id);
    const anchor_=validateAnchor(workspace,input.anchor);
    if(anchor_.sequence<session.cursor.sequence)throw new CollabError('cursor_regression',`A session cursor cannot move backwards ${PLANTED}`,{current_sequence:session.cursor.sequence});
    // An anchor at the cursor the session already has changes nothing, and the version stays as it was.
    if(anchor_.sequence===session.cursor.sequence){
      if(anchor_.hash!==session.cursor.hash)throw new CollabError('cursor_fork_detected',`The cursor sequence now resolves to a different journal hash ${PLANTED}`);
      return {session:sessionView(session)};
    }
    if(session.cursor_version!==input.expected_cursor_version)throw new CollabError('cursor_version_conflict',`The session cursor changed ${PLANTED}`,
      {expected_cursor_version:input.expected_cursor_version,current_cursor_version:session.cursor_version});
    session.cursor=anchor_;session.cursor_version+=1;session.last_seen_at=now();
    writeCredential(session,binding.token);
    return {session:sessionView(session)};
  },
  collab_report_append(input){
    sameWorkspace(input.workspace_id);
    const normalized={task_id:input.task_id?validateId(input.task_id,'task_id'):null,to_session_id:input.to_session_id?validateId(input.to_session_id,'to_session_id'):null,
      kind:input.kind,body:cleanText(input.body,'body',9000),evidence_refs:input.evidence_refs??[],confidence:input.confidence??'unknown',
      limits:optionalText(input.limits,'limits',2000),relation:input.relation??'informs'};
    return {report:mutate(input.idempotency_key,'report.append.v2',normalized,session=>{
      if(normalized.task_id)requireTaskRow(session.workspace_id,normalized.task_id);
      if(normalized.kind==='decision')throw new CollabError('decision_authority_required',`Decision reports require an explicit authority scope and basis ${PLANTED}`);
      const report={id:`report_${uuid()}`,workspace_id:session.workspace_id,session_id:session.id,actor:session.actor,...normalized,created_at:now()};
      report.event_sequence=appendEvent(requireWorkspace(session.workspace_id),'report.posted',report.id,session.actor,{kind:report.kind,task_id:report.task_id},session.id).sequence;
      store.reports[report.id]=report;
      return report;
    })};
  },
  collab_task_create(input){
    sameWorkspace(input.workspace_id);
    const normalized={id:input.task_id?validateId(input.task_id,'task_id'):undefined,title:cleanText(input.title,'title',300),description:optionalText(input.description,'description',8000),
      dependencies:input.dependencies??[],path_scopes:input.path_scopes??[],work_mode:input.work_mode??'edit'};
    validateKey(input.idempotency_key);
    if(normalized.work_mode==='edit'&&normalized.path_scopes.length===0)throw new CollabError('edit_scope_required',`Edit tasks require at least one repository-relative path scope ${PLANTED}`);
    const completion=input.completion_policy??(normalized.work_mode==='edit'?'accepted':'reported');
    return {task:mutate(input.idempotency_key,'task.create.v2',{...normalized,completion_policy:completion},session=>{
      const id=normalized.id??`task_${uuid()}`;
      if(store.tasks[id])throw new CollabError('task_exists',`Task '${id}' already exists ${PLANTED}`,{task_id:id});
      const task={id,workspace_id:session.workspace_id,title:normalized.title,description:normalized.description,status:'open',dependencies:[],path_scopes:normalized.path_scopes,
        work_mode:normalized.work_mode,completion_policy:completion,review_status:'not_required',assignee:null,assignee_session_id:null,lease_id:null,lease_expires_at:null,
        blocker:null,version:1,created_at:now(),updated_at:now(),completed_at:null};
      store.tasks[id]=task;
      appendEvent(requireWorkspace(session.workspace_id),'task.created',id,session.actor,{title:task.title,version:1},session.id);
      return taskView(task);
    })};
  },
  collab_task_get(input){
    requireWorkspace(input.workspace_id);
    return {task:{...taskView(requireTaskRow(input.workspace_id,input.task_id)),artifacts:[]}};
  },
  collab_task_claim(input){
    sameWorkspace(input.workspace_id);
    const id=validateId(input.task_id,'task_id'),expected=validateVersion(input.expected_version),ttl=input.ttl_seconds??900;
    return {task:mutate(input.idempotency_key,'task.claim.v2',{task_id:id,expected_version:expected,ttl_seconds:ttl},session=>{
      const task=requireTaskRow(session.workspace_id,id);
      requireVersion(task,expected);
      if(expired(task)&&task.assignee_session_id)throw new CollabError('recovery_required',`An expired session lease requires an explicit recovery note ${PLANTED}`,{task_id:id});
      if(task.status==='completed')throw new CollabError('task_completed',`Completed tasks cannot be claimed ${PLANTED}`,{review_status:task.review_status});
      if(task.status==='blocked')throw new CollabError('task_blocked',`Blocked tasks must be unblocked before claiming ${PLANTED}`,{blocker:task.blocker});
      if(task.status==='claimed')throw new CollabError('task_claimed',`Task already has an active claim ${PLANTED}`,
        {assignee:task.assignee,assignee_session_id:task.assignee_session_id,lease_expires_at:task.lease_expires_at});
      Object.assign(task,{status:'claimed',assignee:session.actor,assignee_session_id:session.id,lease_id:`lease_${uuid()}`,
        lease_expires_at:new Date(new Date(now()).getTime()+ttl*1000).toISOString(),version:task.version+1,updated_at:now()});
      appendEvent(requireWorkspace(session.workspace_id),'task.claimed',id,session.actor,{lease_id:task.lease_id,version:task.version},session.id);
      return taskView(task);
    })};
  },
  collab_task_release(input){
    sameWorkspace(input.workspace_id);
    const id=validateId(input.task_id,'task_id'),lease=validateId(input.lease_id,'lease_id'),expected=validateVersion(input.expected_version);
    const summary=optionalText(input.summary,'summary',2000);
    return {task:mutate(input.idempotency_key,'task.release.v2',{task_id:id,lease_id:lease,expected_version:expected,summary},session=>{
      const task=requireTaskRow(session.workspace_id,id);
      requireVersion(task,expected);
      if(task.status!=='claimed'||!task.lease_id||!task.lease_expires_at)throw new CollabError('lease_not_active',`Task does not have an active lease ${PLANTED}`);
      if(expired(task))throw new CollabError('lease_expired',`Task lease has expired ${PLANTED}`,{lease_expires_at:task.lease_expires_at});
      if(task.assignee_session_id!==session.id||task.lease_id!==lease)throw new CollabError('lease_not_holder',`Mutation requires the current session lease ${PLANTED}`,
        {assignee:task.assignee,assignee_session_id:task.assignee_session_id});
      Object.assign(task,{status:'open',assignee:null,assignee_session_id:null,lease_id:null,lease_expires_at:null,version:task.version+1,updated_at:now()});
      appendEvent(requireWorkspace(session.workspace_id),'task.released',id,session.actor,{summary,version:task.version},session.id);
      return taskView(task);
    })};
  },
};

// ---- answers ----
const text=payload=>[{type:'text',text:JSON.stringify(payload,null,2)}];
const success=payload=>({content:text(payload),structuredContent:payload});
function failure(error){
  const payload=error instanceof CollabError?{error:error.code,message:error.message,...error.details}:{error:'internal_error',message:`${PLANTED} ${String(error?.message)}`};
  return {content:text(payload),structuredContent:payload,isError:true};
}
function callTool(name,args){
  if(!Object.hasOwn(HANDLERS,name))return {rpc:{code:-32602,message:`Tool ${PLANTED} not found`}};
  let input;
  try{input=parseArgs(name,args);}
  catch(error){
    if(error instanceof InputError)return {result:{content:[{type:'text',text:error.message}],isError:true}};
    throw error;
  }
  load();
  try{
    const payload=HANDLERS[name](input);
    save();
    return {result:success(payload)};
  }catch(error){
    // A refusal leaves the journal as it was read: nothing is saved.
    return {result:failure(error)};
  }
}

const out=message=>process.stdout.write(`${JSON.stringify(message)}\n`);
const reply=(id,answer)=>out(answer.rpc?{jsonrpc:'2.0',id,error:answer.rpc}:{jsonrpc:'2.0',id,result:answer.result});
// How one tool misbehaves when $HOME/standin-control.json says so under `on.<tool>`:
//   "exit_before"    end the process before the tool runs; no answer
//   "exit_after"     run the tool, keep what it changed, end the process; no answer
//   "hang_before"    never run the tool, never answer
//   "hang_after"     run the tool, keep what it changed, never answer
//   {delay_ms}       run the tool, answer after that many milliseconds
//   "oversize"       run the tool, answer with one frame over 1 MiB
//   "rpc_error"      a JSON-RPC error instead of a result
//   "garbage"        one line that is not JSON
//   "no_structured"  isError true with text only, as for an input the tool's schema refuses
//   "empty_result"   run the tool, answer {} as its structuredContent
//   {refuse}         do not run the tool; answer isError true with this object, plus a message, as structuredContent
//   {patch}          run the tool, then lay these keys over its structuredContent
function misbehave(rule,id,name,args){
  if(rule==='exit_before')process.exit(1);
  if(rule==='hang_before')return true;
  if(rule==='rpc_error'){out({jsonrpc:'2.0',id,error:{code:-32603,message:PLANTED,data:{secret:PLANTED}}});return true;}
  if(rule==='garbage'){process.stdout.write(`${PLANTED} this line is not JSON\n`);return true;}
  if(rule==='no_structured'){out({jsonrpc:'2.0',id,result:{content:[{type:'text',text:`Input validation error: ${PLANTED}`}],isError:true}});return true;}
  if(record(rule)&&record(rule.refuse)){
    const payload={message:PLANTED,...rule.refuse};
    out({jsonrpc:'2.0',id,result:{content:text(payload),structuredContent:payload,isError:true}});return true;
  }
  const answer=callTool(name,args);
  if(rule==='exit_after')process.exit(1);
  if(rule==='hang_after')return true;
  if(rule==='oversize'){out({jsonrpc:'2.0',id,result:{...answer.result,padding:'x'.repeat(1024*1024+64)}});return true;}
  if(rule==='empty_result'){out({jsonrpc:'2.0',id,result:{content:text({}),structuredContent:{}}});return true;}
  if(record(rule)&&record(rule.patch)&&answer.result?.structuredContent){
    const payload={...answer.result.structuredContent,...rule.patch};
    out({jsonrpc:'2.0',id,result:{...answer.result,content:text(payload),structuredContent:payload}});return true;
  }
  if(record(rule)&&Number.isInteger(rule.delay_ms)){setTimeout(()=>reply(id,answer),rule.delay_ms);return true;}
  reply(id,answer);
  return true;
}

function handle(message){
  if(!record(message)||message.id===undefined)return;   // a notification gets no answer
  const {id,method,params}=message,settings=control(),init=settings.init??{};
  if(method==='initialize'){
    if(init.hang)return;
    out({jsonrpc:'2.0',id,result:{protocolVersion:init.protocol??'2025-11-25',capabilities:{tools:{listChanged:true}},
      serverInfo:{name:init.server_name??'agenttool-collab',version:init.server_version??'0.5.0'},instructions:`${PLANTED} instructions a client must not act on`}});
    return;
  }
  if(method==='tools/list'){
    const patches=init.tools??{};
    out({jsonrpc:'2.0',id,result:{tools:Object.entries(TOOLS).filter(([name])=>patches[name]!==null).map(([name,shape])=>listed(name,shape,patches[name]))}});
    return;
  }
  if(method==='tools/call'){
    const name=params?.name,rule=settings.on?.[name];
    try{fs.appendFileSync(path.join(HOME,'standin-calls.log'),`${String(name)}\n`);}catch{}
    if(rule!==undefined&&misbehave(rule,id,name,params?.arguments))return;
    reply(id,callTool(name,params?.arguments));
    return;
  }
  out({jsonrpc:'2.0',id,error:{code:-32601,message:`Method ${PLANTED} not found`}});
}

// Startup, as the real entry point does it: the journal is opened (and created) before the first request.
try{
  fs.writeFileSync(path.join(HOME,'standin-started.json'),JSON.stringify({argv:process.argv.slice(2),env:Object.keys(process.env).sort(),cwd:process.cwd(),script:__filename,pid:process.pid}));
}catch{}
if(control().startup==='exit')process.exit(1);
load();save();
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{
  if(!line.trim())return;
  let message;
  try{message=JSON.parse(line);}catch{return;}
  handle(message);
});
lines.on('close',()=>process.exit(0));
process.stderr.write('stand-in backend ready\n');
