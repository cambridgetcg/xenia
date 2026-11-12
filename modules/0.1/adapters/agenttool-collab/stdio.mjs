// SPDX-License-Identifier: MPL-2.0
// Minimal local JSON-RPC stdio port, not a general MCP client or permission grant.
import {spawn} from 'node:child_process';

export class EndpointError extends Error {
  constructor(code, uncertain=false){super(code);this.name='EndpointError';this.code=code;this.uncertain=uncertain;}
}

export async function spawnStdioEndpoint({command,args,cwd,env,timeoutMs=10000,maxResponseBytes=1048576,maxRequestBytes=65536}) {
  if(typeof command!=='string'||!command||!Array.isArray(args)||args.some(x=>typeof x!=='string')||typeof cwd!=='string'||!cwd||!env||typeof env!=='object'||Object.values(env).some(v=>typeof v!=='string')||!Number.isSafeInteger(timeoutMs)||timeoutMs<20||timeoutMs>30000||![maxResponseBytes,maxRequestBytes].every(n=>Number.isSafeInteger(n)&&n>=64&&n<=8388608))throw new EndpointError('invalid_configuration');
  const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:false});
  let serial=0,buffer='',closed=false,exited=false,closing=null;
  const pending=new Map();
  let finishExit;const exit=new Promise(resolve=>{finishExit=resolve});
  const rejectAll=code=>{buffer='';for(const p of pending.values()){clearTimeout(p.timer);p.reject(new EndpointError(code,true));}pending.clear();};
  child.stderr.resume();
  child.on('error',()=>{closed=true;rejectAll('transport_error');});
  child.once('exit',()=>{exited=true;closed=true;rejectAll('transport_closed');finishExit();});
  child.stdin.on('error',()=>{closed=true;rejectAll('transport_error');});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    if(closed)return;
    buffer+=chunk;
    for(let i;(i=buffer.indexOf('\n'))>=0;){
      const line=buffer.slice(0,i);buffer=buffer.slice(i+1);
      if(Buffer.byteLength(line,'utf8')>maxResponseBytes){closed=true;rejectAll('response_too_large');child.kill('SIGTERM');return;}
      if(!line.trim())continue;
      let message;try{message=JSON.parse(line);}catch{closed=true;rejectAll('invalid_response');child.kill('SIGTERM');return;}
      if(!message || Array.isArray(message) || message.jsonrpc!=='2.0') {closed=true;rejectAll('invalid_response');child.kill('SIGTERM');return;}
      const p=pending.get(message.id);if(!p)continue;
      const hasError=Object.hasOwn(message,'error');
      if(Object.hasOwn(message,'result')===hasError || (hasError && (!message.error || typeof message.error!=='object' || Array.isArray(message.error) || !Object.hasOwn(message.error,'code') || !Number.isInteger(message.error.code) || !Object.hasOwn(message.error,'message') || typeof message.error.message!=='string'))) {closed=true;rejectAll('invalid_response');child.kill('SIGTERM');return;}
      pending.delete(message.id);clearTimeout(p.timer);
      if(hasError)p.reject(new EndpointError('rpc_error',true));else p.resolve(message.result);
    }
    if(Buffer.byteLength(buffer,'utf8')>maxResponseBytes){closed=true;rejectAll('response_too_large');child.kill('SIGTERM');}
  });
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(new EndpointError('spawn_failed',false)));});
  const endpoint={
    request(method,params){
      if(closed)return Promise.reject(new EndpointError('transport_closed',false));
      return new Promise((resolve,reject)=>{
        const id=++serial;
        let line;
        try{if(typeof method!=='string'||!method||method.length>100)throw new Error();line=JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n';}
        catch{reject(new EndpointError('invalid_request',false));return;}
        if(Buffer.byteLength(line,'utf8')>maxRequestBytes){reject(new EndpointError('request_too_large',false));return;}
        const timer=setTimeout(()=>{closed=true;rejectAll('request_timeout');child.kill('SIGTERM');},timeoutMs);
        pending.set(id,{resolve,reject,timer});
        try{child.stdin.write(line);}catch{pending.delete(id);clearTimeout(timer);reject(new EndpointError('transport_error',true));}
      });
    },
    notifyInitialized(){if(!closed)child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');},
    close(){
      if(closing)return closing;
      closing=(async()=>{
        closed=true;rejectAll('transport_closed');
        if(!exited){child.stdin.end();const terminate=setTimeout(()=>child.kill('SIGTERM'),500);const force=setTimeout(()=>child.kill('SIGKILL'),1000);await exit;clearTimeout(terminate);clearTimeout(force);}
        return {closed:exited};
      })();return closing;
    }
  };
  return endpoint;
}
