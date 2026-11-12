// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
async function load(){assert.ok(existsSync(new URL('./stdio.mjs',import.meta.url)),'The optional stdio port is missing');return import('./stdio.mjs');}
async function fixture(t,body){const dir=await mkdtemp(path.join(tmpdir(),'xenia-stdio-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'peer.mjs');await writeFile(file,body);return {dir,file};}
test('malformed reply envelopes fail without returning peer content',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,wrong:'SENSITIVE_TEST_SENTINEL'})+'\\n')});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:500});t.after(()=>endpoint.close());
 await assert.rejects(endpoint.request('tools/call',{}),e=>e.code==='invalid_response'&&e.uncertain===true&&!e.message.includes('SENSITIVE_TEST_SENTINEL'));
});
test('present malformed JSON-RPC errors reject as uncertain invalid_response',async t=>{
 const {spawnStdioEndpoint}=await load();
 const cases=[['null',null],['string','SENSITIVE_TEST_SENTINEL'],['empty object',{}],['array',[]],['false',false],['zero',0],['fractional code',{code:1.5,message:'SENSITIVE_TEST_SENTINEL'}],['string code',{code:'-1',message:'SENSITIVE_TEST_SENTINEL'}],['missing message',{code:-1}],['non-string message',{code:-1,message:null}]];
 for(const [name,error] of cases)await t.test(name,async t=>{
  const f=await fixture(t,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,error:${JSON.stringify(error)}})+'\\n');});`);
  const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:1000});t.after(()=>endpoint.close());
  await assert.rejects(endpoint.request('mutation',{}),e=>e.code==='invalid_response'&&e.uncertain===true&&e.message==='invalid_response');
 });
});
test('valid JSON-RPC error is rejected without echoing peer error content',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,error:{code:-32001,message:'SENSITIVE_TEST_SENTINEL',data:{secret:'SENSITIVE_TEST_SENTINEL'}}})+'\\n');});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:1000});t.after(()=>endpoint.close());
 await assert.rejects(endpoint.request('mutation',{}),e=>e.code==='rpc_error'&&e.uncertain===true&&e.message==='rpc_error'&&!JSON.stringify(e).includes('SENSITIVE_TEST_SENTINEL'));
});
test('oversized replies stop the endpoint instead of entering the agent context',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'x'.repeat(2048)})+'\\n')});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:500,maxResponseBytes:128});t.after(()=>endpoint.close());
 await assert.rejects(endpoint.request('tools/call',{}),e=>e.code==='response_too_large'&&e.uncertain===true);
});
test('coalesced replies are bounded per frame, not per stdout chunk',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';const replies=[];readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);replies.push(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'x'.repeat(40)})+'\\n');if(replies.length===2)process.stdout.write(replies.join(''));});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:1000,maxResponseBytes:128});t.after(()=>endpoint.close());
 assert.deepEqual(await Promise.all([endpoint.request('first',{}),endpoint.request('second',{})]),['x'.repeat(40),'x'.repeat(40)]);
});
test('split UTF-8 response frames are reassembled within the frame cap',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);const frame=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'€'.repeat(20)})+'\\n');const split=frame.indexOf(Buffer.from('€'))+1;process.stdout.write(frame.subarray(0,split));setTimeout(()=>process.stdout.write(frame.subarray(split)),10);});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:1000,maxResponseBytes:128});t.after(()=>endpoint.close());
 assert.equal(await endpoint.request('split',{}),'€'.repeat(20));
});
test('oversized leftover partial frame does not discard an earlier valid reply',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';const queries=[];readline.createInterface({input:process.stdin}).on('line',s=>{queries.push(JSON.parse(s));if(queries.length===2)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:queries[0].id,result:'accepted'})+'\\n'+'x'.repeat(129));});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:1000,maxResponseBytes:128});t.after(()=>endpoint.close());
 const [first,second]=await Promise.allSettled([endpoint.request('first',{}),endpoint.request('second',{})]);
 assert.deepEqual(first,{status:'fulfilled',value:'accepted'});
 assert.equal(second.status,'rejected');assert.equal(second.reason.code,'response_too_large');assert.equal(second.reason.uncertain,true);
 await assert.rejects(endpoint.request('closed',{}),e=>e.code==='transport_closed'&&!e.uncertain);
});
test('invalid limits and oversized requests are refused before dispatch',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';let count=0;readline.createInterface({input:process.stdin}).on('line',s=>{const q=JSON.parse(s);if(q.id)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{count:++count}})+'\\n')});`);
 const options={command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:500,maxRequestBytes:256};
 await assert.rejects(spawnStdioEndpoint({...options,timeoutMs:NaN}).then(async e=>{await e.close();return e}),e=>e.code==='invalid_configuration'&&!e.uncertain);
 const endpoint=await spawnStdioEndpoint(options);t.after(()=>endpoint.close());
 await assert.rejects(endpoint.request('tools/call',{body:'x'.repeat(2048)}),e=>e.code==='request_too_large'&&!e.uncertain);
 assert.deepEqual(await endpoint.request('tools/list',{}),{count:1});
});
test('an explicitly spawned synthetic peer exchanges bounded JSON-RPC and closes',async t=>{
 const {spawnStdioEndpoint}=await load();
 const f=await fixture(t,`import readline from 'node:readline';const r=readline.createInterface({input:process.stdin});r.on('line',s=>{const q=JSON.parse(s);if(q.id)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result:{echo:q.params}})+'\\n');});`);
 const endpoint=await spawnStdioEndpoint({command:process.execPath,args:[f.file],cwd:f.dir,env:{PATH:process.env.PATH,HOME:f.dir},timeoutMs:1000});
 t.after(()=>endpoint.close());
 assert.deepEqual(await endpoint.request('initialize',{message:'hello · 你好'}),{echo:{message:'hello · 你好'}});
 endpoint.notifyInitialized();
 const closed=await endpoint.close();assert.equal(closed.closed,true);
 await assert.rejects(endpoint.request('tools/list',{}),e=>e.code==='transport_closed'&&e.uncertain===false);
});
