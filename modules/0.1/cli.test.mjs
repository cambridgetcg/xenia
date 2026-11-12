// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const cli=new URL('./cli.mjs',import.meta.url);
const bundle=process.env.XENIA_COLLAB_BUNDLE;
const digest='fdfd99b20fa21a69c368a8027bb972fd1a3509c8e5f90882c5742cd9ebe053cd';
const children=new WeakMap();
async function temporary(t){
 const dir=await mkdtemp(path.join(tmpdir(),'xenia-cli-test-'));
 children.set(t,[]);
 t.after(async()=>{
  for(const client of children.get(t)){
   client.child.stdin.end();
   const timer=setTimeout(()=>client.child.kill('SIGKILL'),15000);
   await client.closed;clearTimeout(timer);
  }
  await rm(dir,{recursive:true,force:true});
 });return dir;
}
async function configuration(dir,extra={}){
 const config={bundlePath:bundle??'/absent-reviewed-bundle',bundleSha256:digest,
  databasePath:path.join(dir,'journal.sqlite'),homeDir:path.join(dir,'home'),
  workspace:path.join(dir,'workspace'),actor:'synthetic-jsonl-client',serverVersion:'0.5.0',timeoutMs:5000,...extra};
 const filename=path.join(dir,'config.json');await writeFile(filename,JSON.stringify(config));
 return {filename,config};
}
function sessionClient(t,filename,allow=false,env={PATH:'',HOME:'/nonexistent-xenia-test-home'}){
 const child=spawn(process.execPath,[cli.pathname,'session','--config',filename,...(allow?['--allow-local-state']:[])],{env,stdio:['pipe','pipe','pipe']});
 const rows=[],waiting=new Map();let stderr='',ended=false;
 child.stderr.on('data',chunk=>{stderr+=chunk;});child.stdin.on('error',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{
  const row=JSON.parse(line);rows.push(row);
  const waiter=waiting.get(row.id);if(waiter){waiting.delete(row.id);waiter.resolve(row);}
 });
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>{
  ended=true;for(const waiter of waiting.values())waiter.reject(new Error('Session exited before its response'));
  waiting.clear();resolve({code,signal,stderr,rows});
 }));
 function response(id){
  const known=rows.find(row=>row.id===id);if(known)return Promise.resolve(known);
  if(ended)return Promise.reject(new Error('Session already exited'));
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{waiting.delete(id);reject(new Error('Response deadline'));},12000);
   waiting.set(id,{resolve:row=>{clearTimeout(timer);resolve(row);},reject:error=>{clearTimeout(timer);reject(error);}});
  });
 }
 const client={child,closed,rows,response,filename,request(id,method,extra={}){
  const promise=response(id);child.stdin.write(JSON.stringify({id,method,...extra})+'\n');return promise;
 }};
 children.get(t).push(client);return client;
}
const demoArgs=(state,bundlePath=bundle??'/missing-bundle')=>['demo','--bundle',bundlePath,'--sha256',digest,'--state-dir',state];
function run(args,env={PATH:'',HOME:'/nonexistent-xenia-test-home'}){
 assert.ok(existsSync(cli),'The agent-first command is missing');
 const result=spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8',env,timeout:45000});
 return {status:result.status,data:JSON.parse(result.stdout),stderr:result.stderr};
}
function backendPid(client){
 const result=spawnSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'});
 assert.equal(result.status,0);
 const config=JSON.parse(readFileSync(client.filename,'utf8'));
 const home=realpathSync(config.homeDir);
 const prefixes=[config.homeDir,home].map(dir=>dir+path.sep+'xenia-collab-source-');
 const rows=result.stdout.split('\n').map(line=>line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
  .filter(row=>{
   if(Number(row[2])!==client.child.pid)return false;
   const prefix=prefixes.find(value=>row[3].includes(value));if(!prefix)return false;
   try{
    const executable=realpathSync(row[3].slice(row[3].lastIndexOf(prefix)));
    return path.basename(executable)==='bundle.js'&&path.dirname(path.dirname(executable))===home&&path.basename(path.dirname(executable)).startsWith('xenia-collab-source-');
   }catch{return false;}
  });
 assert.equal(rows.length,1,'This synthetic controller must own exactly one verified-snapshot backend process');return Number(rows[0][1]);
}
function gone(pid){try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}}
test('JSONL pending limit reserves retirement; partial EOF input remains bounded',async t=>{
 const dir=await temporary(t),{filename}=await configuration(dir);
 const client=sessionClient(t,filename,true);await client.request('ready','inspect');
 const burst=Array.from({length:20},(_,id)=>({id,method:'activate'}));
 burst.splice(1,0,{id:0,method:'activate'});
 burst.push({id:'stop',method:'retire'});
 const stop=client.response('stop');
 client.child.stdin.write(burst.map(x=>JSON.stringify(x)+'\n').join(''));
 assert.equal((await stop).value.complete,true);
 assert.ok(client.rows.some(row=>row.error?.code==='too_many_pending'));
 assert.ok(client.rows.some(row=>row.id===null&&row.error?.code==='duplicate_id'));
 client.child.stdin.end('{"id":"last","method":"inspect"}');
 const end=await client.closed;assert.equal(end.code,0);assert.equal(end.stderr,'');
 assert.equal(end.rows.find(row=>row.id==='last').value.state,'retired');
 for(let id=0;id<20;id++)assert.equal(end.rows.filter(row=>row.id===id).length,1);
 assert.deepEqual(await readdir(dir),['config.json']);
});
test('native EOF and Stop signals retire owned leases and processes without claiming completion',{skip:!bundle},async t=>{
 const root=await temporary(t);
 for(const signal of ['eof','SIGINT','SIGTERM']){
  const dir=path.join(root,signal);await mkdir(dir);await mkdir(path.join(dir,'workspace'));
  const {filename}=await configuration(dir);const client=sessionClient(t,filename,true,{PATH:process.env.PATH});
  assert.equal((await client.request('start','activate')).ok,true);
  const created=await client.request('create','invoke',{operation:'createTask',input:{idempotency_key:'create',title:'Synthetic signal test'}});
  assert.equal((await client.request('claim','invoke',{operation:'claimTask',input:{task_id:created.value.id,expected_version:created.value.version,idempotency_key:'claim'}})).ok,true);
  const pid=backendPid(client);
  try{
   if(signal==='eof')client.child.stdin.end();else client.child.kill(signal);
   const end=await client.closed;
   assert.equal(end.code,0,'Stop must run bounded retirement, not default signal exit');
   assert.equal(end.stderr,'');assert.equal(end.rows.at(-1).reason,signal);
   assert.equal(end.rows.at(-1).complete,true);assert.equal(gone(pid),true);
   assert.deepEqual(await readdir(path.join(dir,'collab-sessions')),[]);
   const observer=sessionClient(t,filename,true,{PATH:process.env.PATH});
   assert.equal((await observer.request('start','activate')).ok,true);
   const task=await observer.request('task','invoke',{operation:'getTask',input:{task_id:created.value.id}});
   assert.equal(task.value.status,'open');assert.equal(task.value.lease_id,null);
   observer.child.stdin.end();assert.equal((await observer.closed).rows.at(-1).complete,true);
  }finally{if(!gone(pid))process.kill(pid,'SIGKILL');}
 }
});
test('native EOF cancels in-flight admission and closes the owned process',{skip:!bundle},async t=>{
 const dir=await temporary(t),{filename}=await configuration(dir);await mkdir(path.join(dir,'workspace'));
 const client=sessionClient(t,filename,true,{PATH:process.env.PATH});await client.request('ready','inspect');
 client.child.stdin.end('{"id":"start","method":"activate"}\n');
 const end=await client.closed;assert.equal(end.code,0);assert.equal(end.stderr,'');
 assert.equal(end.rows.filter(row=>row.id==='start').length,1);
 assert.equal(end.rows.at(-1).complete,true);assert.equal(end.rows.at(-1).reason,'eof');
 const credentials=path.join(dir,'collab-sessions');
 if(existsSync(credentials))assert.deepEqual(await readdir(credentials),[]);
});
test('native uncertain outcomes retain recovery evidence and honestly report cleanup_pending',{skip:!bundle},async t=>{
 const dir=await temporary(t),{filename}=await configuration(dir,{timeoutMs:500});await mkdir(path.join(dir,'workspace'));
 const client=sessionClient(t,filename,true,{PATH:process.env.PATH});assert.equal((await client.request('start','activate')).ok,true);
 const pid=backendPid(client);
 try{
  process.kill(pid,'SIGSTOP');
  const status=await client.request('status','invoke',{operation:'status',input:{}});
  assert.equal(status.error.code,'outcome-unknown');
  client.child.stdin.end();const end=await client.closed;
  assert.equal(end.code,1);assert.equal(end.stderr,'');
  assert.equal(end.rows.at(-1).cleanup_pending,true);assert.equal(end.rows.at(-1).complete,false);
  assert.equal(end.rows.at(-1).state,'cleanup_pending');assert.equal(gone(pid),true);
  assert.ok(existsSync(path.join(dir,'journal.sqlite')));
  assert.equal((await readdir(path.join(dir,'collab-sessions'))).length,1,'Unknown native session end is not claimed as cleanup');
  assert.ok(!JSON.stringify(end.rows).match(/session_token|credential_file|\.json|\/Users\//));
 }finally{if(!gone(pid))process.kill(pid,'SIGKILL');}
});
test('JSONL inspection and denied activation are inert and errors never echo input',async t=>{
 const dir=await temporary(t),{filename,config}=await configuration(dir);
 const client=sessionClient(t,filename);
 assert.equal((await client.request('inspect','inspect')).value.state,'disabled');
 const denied=await client.request(1,'activate');assert.equal(denied.error.code,'unauthorized');
 assert.equal((await client.request(2,'invoke',{operation:'status',input:{}})).error.code,'disabled');
 const bad=await client.request(3,'eval',{input:'secret-input-code'});
 assert.equal(bad.error.code,'invalid_request');assert.ok(!JSON.stringify(bad).includes('secret'));
 client.child.stdin.write('{"id":4,broken-secret-input}\n');
 assert.equal((await client.response(null)).error.code,'invalid_json');
 const retired=await client.request(5,'retire');assert.equal(retired.value.complete,true);
 assert.equal((await client.request(6,'activate')).error.code,'not-active');
 client.child.stdin.end();const end=await client.closed;
 assert.equal(end.code,0);assert.equal(end.stderr,'');
 assert.equal(end.rows.at(-1).event,'session_end');assert.equal(end.rows.at(-1).cleanup_pending,false);
 assert.equal(existsSync(config.homeDir),false);assert.equal(existsSync(config.workspace),false);
 assert.equal(existsSync(config.databasePath),false);assert.deepEqual(await readdir(dir),['config.json']);
 for(const id of ['inspect',1,2,3,5,6])assert.equal(end.rows.filter(row=>row.id===id).length,1);
 assert.ok(!JSON.stringify(end.rows).includes(filename));
});
test('JSONL rejects config and line overflow without creating selected state',async t=>{
 const dir=await temporary(t),{filename,config}=await configuration(dir);
 for(const args of [['session'],['session','--config','relative'],['session','--config',filename,'--unknown'],
  ['session','--config',filename,'--allow-local-state','--allow-local-state']]){
  const result=run(args);assert.equal(result.status,1);assert.equal(result.data.error.code,'invalid_arguments');
 }
 await writeFile(filename,JSON.stringify({...config,execute:'secret code'}));
 assert.equal(run(['session','--config',filename]).data.error.code,'invalid_configuration');
 await writeFile(filename,'x'.repeat(65537));
 assert.equal(run(['session','--config',filename]).data.error.code,'invalid_configuration');
 await writeFile(filename,JSON.stringify(config));
 const client=sessionClient(t,filename);await client.request('ready','inspect');
 client.child.stdin.write('x'.repeat(65537));
 const overflow=await client.response(null);assert.equal(overflow.error.code,'line_too_large');
 const end=await client.closed;assert.equal(end.code,1);assert.equal(end.stderr,'');
 assert.equal(end.rows.at(-1).cleanup_pending,false);assert.equal(existsSync(config.homeDir),false);
});
test('native JSONL is stateful, does not queue mutations, and retirement fences promptly',{skip:!bundle},async t=>{
 const dir=await temporary(t),{filename}=await configuration(dir);await mkdir(path.join(dir,'workspace'));
 const client=sessionClient(t,filename,true,{PATH:process.env.PATH});
 assert.equal((await client.request('activate','activate')).ok,true);
 const status=await client.request('status','invoke',{operation:'status',input:{}});assert.ok(status.value.session_id);
 const first=client.response('first'),second=client.response('second');
 client.child.stdin.write([
  {id:'first',method:'invoke',operation:'createTask',input:{title:'Synthetic JSONL task',idempotency_key:'one'}},
  {id:'second',method:'invoke',operation:'createTask',input:{title:'Not silently queued',idempotency_key:'two'}},
 ].map(x=>JSON.stringify(x)+'\n').join(''));
 const created=await first;assert.equal(created.ok,true);assert.equal((await second).error.code,'busy');
 const claim=await client.request('claim','invoke',{operation:'claimTask',input:{task_id:created.value.id,expected_version:created.value.version,idempotency_key:'claim'}});
 assert.equal(claim.value.status,'claimed');
 const retired=client.response('retired'),late=client.response('late');
 client.child.stdin.write('{"id":"retired","method":"retire"}\n{"id":"late","method":"invoke","operation":"status","input":{}}\n');
 assert.equal((await late).error.code,'not-active');assert.equal((await retired).value.complete,true);
 client.child.stdin.end();const end=await client.closed;assert.equal(end.code,0);assert.equal(end.stderr,'');
 assert.deepEqual(await readdir(path.join(dir,'collab-sessions')),[]);
 assert.ok(existsSync(path.join(dir,'journal.sqlite')));
 // Reopen only this synthetic journal to observe release; never duplicate native SQL/lifecycle.
 const observer=sessionClient(t,filename,true,{PATH:process.env.PATH});
 assert.equal((await observer.request('start','activate')).ok,true);
 const task=await observer.request('task','invoke',{operation:'getTask',input:{task_id:created.value.id}});
 assert.equal(task.value.status,'open');assert.equal(task.value.lease_id,null);
 observer.child.stdin.end();assert.equal((await observer.closed).rows.at(-1).complete,true);
});
test('demo refuses existing paths and invalid flags before mutation',async t=>{
 const dir=await temporary(t),fresh=path.join(dir,'fresh');
 await mkdir(path.join(dir,'existing'));await writeFile(path.join(dir,'file'),'untouched');
 await symlink(path.join(dir,'absent'),path.join(dir,'link'));
 for(const name of ['existing','file','link']){
  const result=run(demoArgs(path.join(dir,name)));
  assert.equal(result.data.error.code,'state_exists');assert.equal(result.status,1);
 }
 for(const args of [demoArgs(fresh).slice(0,-1),[...demoArgs(fresh),'--unknown','x'],
  [...demoArgs(fresh),'--bundle','/other'],demoArgs('relative'),demoArgs(fresh,'relative'),
  ['demo','--bundle','/missing','--sha256','bad','--state-dir',fresh]]){
  const result=run(args);assert.equal(result.status,1);assert.equal(result.data.error.code,'invalid_arguments');
  assert.equal(existsSync(fresh),false);assert.equal(result.stderr,'');
 }
 assert.equal(await readFile(path.join(dir,'file'),'utf8'),'untouched');
 assert.deepEqual(await readdir(path.join(dir,'existing')),[]);
});
test('native demo processes and acknowledges a report, releases its lease and retains evidence',{skip:!bundle},async t=>{
 const dir=await temporary(t),state=path.join(dir,'demo');
 const result=run(demoArgs(state),{PATH:process.env.PATH,HOME:path.join(dir,'unused-home')});
 assert.equal(result.status,0,JSON.stringify(result));assert.equal(result.stderr,'');
 const data=result.data;assert.equal(data.mode,'synthetic_two_sessions_one_controller');
 assert.notEqual(data.sessions.a.session_id,data.sessions.b.session_id);
 assert.equal(data.sessions.a.workspace_id,data.sessions.b.workspace_id);
 assert.equal(data.task.claimed.status,'claimed');assert.ok(data.task.claimed.lease_id);
 assert.equal(data.report.observed,true);assert.ok(data.report.report_id);
 assert.equal(data.acknowledged.cursor_version,data.page.cursor_version+1);
 assert.equal(data.task.after_a_retire.status,'open');assert.equal(data.task.after_a_retire.lease_id,null);
 assert.equal(data.peer_after_a_retire.state,'active');
 assert.deepEqual(data.peer_after_a_retire.active_session_ids,[data.sessions.b.session_id]);
 for(const retired of Object.values(data.retirement))assert.deepEqual(retired,{complete:true,state:'retired',cleanup_pending:false});
 assert.equal(data.cleanup_pending,false);assert.equal(data.state_retained,true);
 assert.equal((await stat(state)).mode&0o777,0o700);
 assert.ok(existsSync(path.join(state,'journal.sqlite')));
 assert.deepEqual(await readdir(path.join(state,'collab-sessions')),[]);
 assert.equal(existsSync(path.join(dir,'unused-home')),false);
 assert.ok(!JSON.stringify(data).match(/session_token|credential_file|\/Users\/|\.json/));
 const failed=run(demoArgs(path.join(dir,'bad-digest')).map(x=>x===digest?'0'.repeat(64):x),{PATH:process.env.PATH});
 assert.equal(failed.status,1);assert.equal(failed.data.error.code,'demo_failed');
 assert.equal(failed.data.cleanup_pending,false);
 assert.equal(existsSync(path.join(dir,'bad-digest','journal.sqlite')),false);
});
test('upgrade preview preserves unknown state and never grants authority or mutates',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xenia-cli-upgrade-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const card=JSON.parse(await readFile(new URL('./adapters/agenttool-collab/module.json',import.meta.url),'utf8'));
 const candidate=path.join(dir,'candidate.json');
 await writeFile(candidate,JSON.stringify(card));
 const unknown=run(['upgrade-plan',candidate]);assert.equal(unknown.status,0);
 assert.equal(unknown.data.state,'unknown');assert.equal(unknown.data.blocked,true);
 assert.equal(unknown.data.compatible,true);
 assert.equal(unknown.data.state_source,'caller_supplied_not_runtime_observation');
 assert.ok(unknown.data.not_established.includes('authority'));
 assert.ok(unknown.data.required_actions.includes('retire-current-module'));
 await writeFile(candidate,JSON.stringify(card.descriptor));
 const disabled=run(['upgrade-plan',candidate,'disabled']);assert.equal(disabled.status,0);
 assert.equal(disabled.data.blocked,false);assert.equal(disabled.data.state,'disabled');
 assert.equal(run(['upgrade-plan',candidate,'active']).data.blocked,true);
 await writeFile(candidate,JSON.stringify({...card.descriptor,state_schema_version:2}));
 assert.equal(run(['upgrade-plan',candidate,'retired']).data.compatible,false);
 await writeFile(candidate,'secret input is not JSON');
 for(const args of [['upgrade-plan',candidate],['upgrade-plan'],['upgrade-plan',candidate,'disabled','extra']]){
  const result=run(args);assert.equal(result.status,1);assert.equal(result.stderr,'');
  assert.equal(result.data.ok,false);assert.ok(!JSON.stringify(result.data).includes('secret'));
 }
 assert.deepEqual(await readdir(dir),['candidate.json']);
});
test('metadata commands are offline declarations with structured failures',async()=>{
 const {dispatch}=await import('./cli.mjs');
 assert.deepEqual(await dispatch(),run(['list']).data);
 const described=run(['describe','agenttool-collab']);
 assert.equal(described.status,0,described.stderr);
 assert.equal(described.data.descriptor.id,'agenttool-collab');
 assert.equal(described.data.runtime.server_version,'0.5.0');
 assert.equal(run(['describe','xenia-core']).data.id,'xenia-core');
 const help=run(['help']);assert.equal(help.status,0);
 for(const command of ['list','describe','upgrade-plan','demo','session'])assert.ok(help.data.commands[command]);
 for(const args of [['describe','not-a-module'],['describe'],['list','extra'],['help','extra'],['bogus']]){
  const result=run(args);assert.equal(result.status,1);assert.equal(result.data.ok,false);
  assert.equal(result.data.error.retryable,false);assert.equal(result.stderr,'');
 }
});
test('one offline JSON entry maps existing profiles without activating a provider',()=>{
 const {status,data,stderr}=run(['list']);assert.equal(status,0,stderr);
 assert.equal(data.status,'source-only-development');
 assert.equal(data.observation,'declarations_not_runtime_state');
 assert.ok(data.components.some(x=>x.id==='xenia-core'&&x.kind==='library'));
 assert.ok(data.components.some(x=>x.id==='xenia-surface'&&x.kind==='profile'));
 assert.ok(data.components.some(x=>x.id==='agenttool-collab'&&x.kind==='optional-adapter'));
 assert.ok(!JSON.stringify(data).includes('/Users/'));
});
