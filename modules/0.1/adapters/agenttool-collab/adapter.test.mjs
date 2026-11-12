// SPDX-License-Identifier: MPL-2.0
// Real runtime gate: opt in with an exact local bundle. Never opens a personal store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const bundlePath=process.env.XENIA_COLLAB_BUNDLE;
const owned=new WeakMap();
function track(options,connection){owned.get(options).push(connection);return connection;}
async function setup(t){const dir=await mkdtemp(path.join(tmpdir(),'xenia-collab-'));const connections=[];t.after(async()=>{for(const c of connections){await c.retire().catch(()=>{});await c.disconnect();}await rm(dir,{recursive:true,force:true});});const homeDir=path.join(dir,'home'),workspace=path.join(dir,'work');await mkdir(homeDir);await mkdir(workspace);const options={bundlePath,bundleSha256:createHash('sha256').update(await readFile(bundlePath)).digest('hex'),databasePath:path.join(dir,'state','journal.sqlite'),homeDir,workspace,actor:'xenia-disposable-test',serverVersion:'0.5.0',timeoutMs:3000};owned.set(options,connections);return options;}
async function load(){assert.ok(existsSync(new URL('./adapter.mjs',import.meta.url)),'The optional Collab connector is missing');return import('./adapter.mjs');}
test('private verified snapshot executes despite original-path replacement',async t=>{
 const {createCollabConnector}=await load();
 const dir=await mkdtemp(path.join(tmpdir(),'xenia-byte-binding-'));
 const connections=[];const previousPath=process.env.PATH;
 t.after(async()=>{process.env.PATH=previousPath;for(const c of connections){await c.retire();await c.disconnect();}await rm(dir,{recursive:true,force:true});});
 const homeDir=path.join(dir,'home'),workspace=path.join(dir,'work'),bin=path.join(dir,'bin');
 await Promise.all([mkdir(homeDir),mkdir(workspace),mkdir(bin)]);
 const original=path.join(dir,'original.mjs'),marker=path.join(dir,'executed.json');
 const schemas=[['collab_session_start',['root_path','actor']],['collab_workspace_status',['workspace_id']],['collab_session_end',[]],['collab_next',['workspace_id']],['collab_cursor_ack',['workspace_id']],['collab_report_append',['workspace_id','idempotency_key','body']],['collab_task_create',['workspace_id','idempotency_key','title']],['collab_task_get',['workspace_id','task_id']],['collab_task_claim',['workspace_id','task_id']],['collab_task_release',['workspace_id','task_id','lease_id']]];
 const verified=`import {writeFileSync} from 'node:fs';import readline from 'node:readline';
 writeFileSync(${JSON.stringify(marker)},JSON.stringify({label:'VERIFIED',url:import.meta.url}));
 const tools=${JSON.stringify(schemas)}.map(([name,keys])=>({name,inputSchema:{type:'object',properties:Object.fromEntries(keys.map(k=>[k,{type:'string'}]))}}));
 readline.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);if(!q.id)return;
 const result=q.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'agenttool-collab',version:'fixture'},capabilities:{tools:{}}}:q.method==='tools/list'?{tools}:{structuredContent:q.params.name==='collab_session_start'?{workspace:{id:'workspace'},session:{id:'session'},credential_file_created:true}:{session:{id:'session',status:'ended'},credential_file_removed:true}};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');});`;
 const replacement=verified.replace("label:'VERIFIED'","label:'REPLACEMENT'");
 await writeFile(original,verified);
 // The ordinary executable boundary deterministically replaces the original AFTER
 // verification, BEFORE opening the selected source. No production test hook.
 await writeFile(path.join(bin,'bun'),`#!${process.execPath}\nimport {writeFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
 if(!process.argv.includes('--no-env-file')||!process.argv.includes('--no-install')||!process.argv.some(a=>a.startsWith('--config=')))process.exit(2);
 writeFileSync(${JSON.stringify(original)},${JSON.stringify(replacement)});await import(pathToFileURL(process.argv.at(-1)).href);`,{mode:0o700});
 process.env.PATH=bin+path.delimiter+previousPath;
 const digest=createHash('sha256').update(verified).digest('hex');
 const connect=createCollabConnector({bundlePath:original,bundleSha256:digest,databasePath:path.join(dir,'state','journal.sqlite'),homeDir,workspace,actor:'fixture',serverVersion:'fixture',timeoutMs:1000});
 assert.deepEqual(await readdir(homeDir),[],'Factory construction must not create snapshots');
 const snapshots=[];
 for(let i=0;i<2;i++){
  await writeFile(original,verified);
  const connection=await connect();connections.push(connection);
  assert.equal(await readFile(original,'utf8'),replacement,'The replacement actually happened');
  const executed=JSON.parse(await readFile(marker,'utf8'));
  assert.equal(executed.label,'VERIFIED','Only digest-verified bytes may execute');
  const snapshot=fileURLToPath(executed.url);snapshots.push(snapshot);
  assert.notEqual(snapshot,original);assert.equal(path.dirname(path.dirname(snapshot)),await realpath(homeDir));
  const directory=await lstat(path.dirname(snapshot)),file=await lstat(snapshot);
  assert.ok(directory.isDirectory()&&!directory.isSymbolicLink());assert.equal(directory.mode&0o777,0o700);
  assert.ok(file.isFile()&&!file.isSymbolicLink());assert.equal(file.mode&0o777,0o400);
  assert.equal(createHash('sha256').update(await readFile(snapshot)).digest('hex'),digest);
  assert.deepEqual(await connection.retire(),{complete:true});await connection.disconnect();
  assert.equal(await readFile(snapshot,'utf8'),verified,'Retirement retains source evidence');
 }
 assert.notEqual(path.dirname(snapshots[0]),path.dirname(snapshots[1]),'Each connection gets a fresh private directory');
});
test('two real sessions exchange reports and acknowledge only their processed page',{skip:!bundlePath},async t=>{
 const {createCollabConnector}=await load();const options=await setup(t);
 const a=track(options,await createCollabConnector(options)());
 const b=track(options,await createCollabConnector({...options,actor:'xenia-second-test-session'})());
 const sent=await a.invoke('report',{idempotency_key:'fixture-report',kind:'observation',body:'Synthetic fixture: discovery is not activation',limits:'Local interoperability test only'});
 assert.ok(sent.report_id);
 let page=await b.invoke('next',{event_limit:1});
 const repeated=await b.invoke('next',{event_limit:1});
 assert.deepEqual(repeated.events.next_anchor,page.events.next_anchor,'Reading is not acknowledgement');
 await assert.rejects(b.invoke('acknowledge',{anchor:{...page.events.next_anchor,sequence:page.events.next_anchor.sequence+10},expected_cursor_version:page.cursor_version}),e=>e.code==='unobserved_anchor'&&!e.uncertain);
 let found=false;
 for(let i=0;i<20;i++){
  found ||= page.reports.some(report=>report.id===sent.report_id);
  const ack=await b.invoke('acknowledge',{anchor:page.events.next_anchor,expected_cursor_version:page.cursor_version});
  assert.ok(ack.cursor_version>page.cursor_version);
  if(!page.events.has_more)break;
  page=await b.invoke('next',{event_limit:1});
 }
 assert.equal(found,true,'The other session actually read the report');
 assert.equal((await a.retire()).complete,true);
 const remaining=await b.invoke('status',{});assert.ok(remaining.active_session_ids.includes(remaining.session_id));
});
test('retiring one real module releases only its known leases and leaves its peer working',{skip:!bundlePath},async t=>{
 const {createCollabConnector}=await load();const options=await setup(t);
 const a=track(options,await createCollabConnector(options)());
 const b=track(options,await createCollabConnector({...options,actor:'xenia-peer-with-work'})());
 const first=await a.invoke('createTask',{idempotency_key:'first-create',title:'Synthetic first module task'});
 const second=await b.invoke('createTask',{idempotency_key:'second-create',title:'Synthetic peer task'});
 const ownedA=await a.invoke('claimTask',{task_id:first.id,expected_version:first.version,idempotency_key:'first-claim'});
 const ownedB=await b.invoke('claimTask',{task_id:second.id,expected_version:second.version,idempotency_key:'second-claim'});
 assert.ok(ownedA.lease_id&&ownedB.lease_id);
 const retired=await a.retire();assert.equal(retired.complete,true);assert.deepEqual(await a.retire(),retired);
 await assert.rejects(a.invoke('status',{}),e=>e.code==='module_not_active');
 const released=await b.invoke('getTask',{task_id:first.id});
 const held=await b.invoke('getTask',{task_id:second.id});
 assert.equal(released.status,'open');assert.equal(held.lease_id,ownedB.lease_id);
 assert.equal((await b.invoke('status',{})).counts.completed,0,'Retirement is not fabricated task completion');
 const explicit=await b.invoke('releaseTask',{task_id:second.id,expected_version:held.version,idempotency_key:'second-release'});
 assert.equal(explicit.status,'open');assert.equal((await b.retire()).complete,true);
 assert.ok(existsSync(options.databasePath));
});
test('explicit activation binds a real local session and retirement preserves its journal',{skip:!bundlePath},async t=>{
 const {createCollabConnector}=await load();const options=await setup(t);const connect=createCollabConnector(options);
 assert.equal(typeof connect,'function');assert.equal(existsSync(options.databasePath),false,'Construction must remain inert');
 const connection=track(options,await connect());
 const status=await connection.invoke('status',{});
 assert.ok(status.workspace_id&&status.session_id);assert.ok(status.active_session_ids.includes(status.session_id));
 assert.ok(!JSON.stringify(status).includes('session_token'));
 const retired=await connection.retire();assert.equal(retired.complete,true);
 assert.equal(existsSync(options.databasePath),true,'Retirement must preserve journal data');
 const sessions=await readdir(path.join(path.dirname(options.databasePath),'collab-sessions'));
 assert.ok(!sessions.includes(status.session_id+'.json'),'Only the ended session credential is removed');
 await connection.disconnect();
});
