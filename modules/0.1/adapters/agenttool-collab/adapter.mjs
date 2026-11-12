// SPDX-License-Identifier: MPL-2.0
// Optional Node/Bun adapter. The Xenia core does not import this file.
import {readFile,stat,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {devNull} from 'node:os';
import {spawnStdioEndpoint,EndpointError} from './stdio.mjs';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=200)=>typeof value==='string'&&value.length>0&&value.length<=max;
const fail=(code,uncertain=false)=>{throw new EndpointError(code,uncertain)};
const fields=(input,allowed,required=[])=>{if(!record(input)||Object.keys(input).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(input,k)))fail('invalid_input');};
const anchor=value=>record(value)&&Object.keys(value).length===3&&text(value.epoch_id)&&Number.isSafeInteger(value.sequence)&&value.sequence>=0&&/^[a-f0-9]{64}$/.test(value.hash??'');
const sameAnchor=(a,b)=>anchor(a)&&anchor(b)&&a.epoch_id===b.epoch_id&&a.sequence===b.sequence&&a.hash===b.hash;
const taskView=task=>{if(!record(task)||!text(task.id)||!Number.isSafeInteger(task.version)||task.version<1||!['open','claimed','blocked','completed'].includes(task.status))fail('invalid_task_result',true);return {id:task.id,title:task.title,status:task.status,effective_status:task.effective_status,version:task.version,lease_id:task.lease_id??null,lease_expires_at:task.lease_expires_at??null};};

export function createCollabConnector(input) {
  const allowed=['bundlePath','bundleSha256','databasePath','homeDir','workspace','actor','serverVersion','timeoutMs'];
  if(!record(input)||Object.keys(input).some(k=>!allowed.includes(k)))fail('invalid_configuration');
  for(const key of ['bundlePath','databasePath','homeDir','workspace'])if(!text(input[key],4096)||!path.isAbsolute(input[key]))fail('explicit_absolute_paths_required');
  if(!/^[a-f0-9]{64}$/.test(input.bundleSha256??'')||!text(input.actor)||!text(input.serverVersion,80))fail('invalid_configuration');
  const options={...input,timeoutMs:input.timeoutMs??10000};
  if(!Number.isInteger(options.timeoutMs)||options.timeoutMs<20||options.timeoutMs>30000)fail('invalid_timeout');
  // The returned factory does not inspect paths, read credentials, or spawn until called.
  return async function connect() {
    let endpoint;
    try {
      let bytes;
      try{bytes=await readFile(options.bundlePath);if(!(await stat(options.workspace)).isDirectory())fail('invalid_workspace');}
      catch{fail('bundle_or_workspace_unavailable');}
      if(createHash('sha256').update(bytes).digest('hex')!==options.bundleSha256)fail('bundle_digest_mismatch');
      await mkdir(options.homeDir,{recursive:true,mode:0o700});
      // Bind execution to these verified bytes, not a second open of bundlePath.
      // Retain this private source evidence; it is not publisher authentication.
      const sourceDir=await mkdtemp(path.join(options.homeDir,'xenia-collab-source-'));
      const sourcePath=path.join(sourceDir,'bundle.js');
      await writeFile(sourcePath,bytes,{flag:'wx',mode:0o400});
      endpoint=await spawnStdioEndpoint({command:'bun',args:['--no-env-file','--no-install','--config='+devNull,sourcePath],cwd:options.homeDir,env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:options.homeDir,AGENTOOL_COLLAB_DB:options.databasePath},timeoutMs:options.timeoutMs});
      const hello=await endpoint.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'xenia-optional-collab',version:'0.1.0-dev'}});
      if(hello?.protocolVersion!=='2025-11-25'||hello.serverInfo?.name!=='agenttool-collab'||hello.serverInfo?.version!==options.serverVersion||!record(hello.capabilities?.tools))fail('incompatible_backend');
      endpoint.notifyInitialized();
      const discovery=await endpoint.request('tools/list',{});
      if(!Array.isArray(discovery?.tools))fail('invalid_discovery');
      const tools=new Map(discovery.tools.map(tool=>[tool.name,tool]));
      for(const [name,keys] of [['collab_session_start',['root_path','actor']],['collab_workspace_status',['workspace_id']],['collab_session_end',[]],['collab_next',['workspace_id']],['collab_cursor_ack',['workspace_id']],['collab_report_append',['workspace_id','idempotency_key','body']],['collab_task_create',['workspace_id','idempotency_key','title']],['collab_task_get',['workspace_id','task_id']],['collab_task_claim',['workspace_id','task_id']],['collab_task_release',['workspace_id','task_id','lease_id']]]) {
        const schema=tools.get(name)?.inputSchema;
        if(schema?.type!=='object'||!record(schema.properties)||keys.some(key=>schema.properties[key]?.type!=='string'))fail('incompatible_tool_schema');
      }
      let active=true,uncertain=false,retirement=null,lastPage=null;
      const leases=new Map();
      const call=async(name,args)=>{
        try {
          const schema=tools.get(name)?.inputSchema;
          if(!schema||(schema.required??[]).some(key=>!Object.hasOwn(args,key)))fail('incompatible_tool_schema');
          const result=await endpoint.request('tools/call',{name,arguments:args});
          if(result?.isError){const known=['version_conflict','cursor_version_conflict','session_has_active_leases'];const code=result.structuredContent?.error;fail(known.includes(code)?code:'backend_refused',!known.includes(code));}
          if(!record(result?.structuredContent))fail('invalid_tool_result',true);
          return result.structuredContent;
        } catch(error){if(error.uncertain)uncertain=true;throw error;}
      };
      const started=await call('collab_session_start',{root_path:options.workspace,actor:options.actor});
      if(!text(started.workspace?.id)||!text(started.session?.id)||started.credential_file_created!==true)fail('invalid_session_result',true);
      const workspaceId=started.workspace.id,sessionId=started.session.id;
      return {
        async invoke(operation,args={}) {
          try {
          if(!active||uncertain)fail('module_not_active');
          if(operation==='status') {
            fields(args,[]);
            const result=await call('collab_workspace_status',{workspace_id:workspaceId});
            return {workspace_id:workspaceId,session_id:sessionId,counts:result.counts,active_session_ids:(result.active_sessions??[]).map(s=>s.id)};
          }
          if(operation==='report') {
            fields(args,['idempotency_key','kind','body','limits','task_id'],['idempotency_key','kind','body']);
            if(!text(args.idempotency_key)||!['observation','inference','proposal'].includes(args.kind)||!text(args.body,8000)||(args.limits!==undefined&&!text(args.limits,2000))||(args.task_id!==undefined&&!text(args.task_id)))fail('invalid_input');
            const result=await call('collab_report_append',{...args,workspace_id:workspaceId,confidence:'unknown',evidence_refs:[],relation:'informs'});
            if(!text(result.report?.id))fail('invalid_report_result',true);
            return {report_id:result.report.id};
          }
          if(operation==='next') {
            fields(args,['event_limit']);
            const limit=args.event_limit??10;if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('invalid_input');
            const result=await call('collab_next',{workspace_id:workspaceId,event_limit:limit});
            if(!anchor(result.events?.next_anchor)||!Number.isSafeInteger(result.session?.cursor_version)||!Array.isArray(result.reports))fail('invalid_page',true);
            lastPage={anchor:{...result.events.next_anchor},version:result.session.cursor_version};
            return {workspace_id:workspaceId,session_id:sessionId,cursor_version:lastPage.version,events:result.events,reports:result.reports};
          }
          if(operation==='acknowledge') {
            fields(args,['anchor','expected_cursor_version'],['anchor','expected_cursor_version']);
            if(!lastPage||!sameAnchor(args.anchor,lastPage.anchor)||args.expected_cursor_version!==lastPage.version)fail('unobserved_anchor');
            const result=await call('collab_cursor_ack',{workspace_id:workspaceId,...args});
            if(result.session?.id!==sessionId||!sameAnchor(result.session.cursor,lastPage.anchor)||result.session.cursor_version!==lastPage.version+1)fail('invalid_acknowledgement',true);
            lastPage=null;return {cursor_version:result.session.cursor_version};
          }
          if(operation==='createTask') {
            fields(args,['idempotency_key','title'],['idempotency_key','title']);
            if(!text(args.idempotency_key)||!text(args.title,300))fail('invalid_input');
            return taskView((await call('collab_task_create',{workspace_id:workspaceId,...args,work_mode:'coordination'})).task);
          }
          if(operation==='getTask') {
            fields(args,['task_id'],['task_id']);if(!text(args.task_id))fail('invalid_input');
            return taskView((await call('collab_task_get',{workspace_id:workspaceId,...args})).task);
          }
          if(operation==='claimTask'||operation==='releaseTask') {
            fields(args,['task_id','idempotency_key','expected_version'],['task_id','idempotency_key','expected_version']);
            if(!text(args.task_id)||!text(args.idempotency_key)||!Number.isSafeInteger(args.expected_version)||args.expected_version<1)fail('invalid_input');
            if(operation==='releaseTask'&&!leases.has(args.task_id))fail('lease_not_owned_by_module');
            const input={workspace_id:workspaceId,...args};
            if(operation==='releaseTask')input.lease_id=leases.get(args.task_id);
            const result=taskView((await call(operation==='claimTask'?'collab_task_claim':'collab_task_release',input)).task);
            if(operation==='claimTask') {if(!text(result.lease_id))fail('invalid_claim_result',true);leases.set(result.id,result.lease_id);}
            else leases.delete(result.id);
            return result;
          }
          fail('unknown_operation');
          } catch(error){if(error.uncertain)uncertain=true;throw error;}
        },
        retire() {
          if(retirement)return retirement;
          active=false;
          retirement=(async()=>{
            if(uncertain)return {complete:false,reason:'outcome_unknown'};
            try {
              for(const [taskId,leaseId] of leases) {
                const current=taskView((await call('collab_task_get',{workspace_id:workspaceId,task_id:taskId})).task);
                if(current.lease_id===leaseId) {
                  const key='xenia-retire-'+createHash('sha256').update(JSON.stringify([sessionId,taskId,leaseId,current.version])).digest('hex');
                  await call('collab_task_release',{workspace_id:workspaceId,task_id:taskId,lease_id:leaseId,expected_version:current.version,idempotency_key:key,summary:'Module retired; work remains open, not completed.'});
                }
                leases.delete(taskId);
              }
              const result=await call('collab_session_end',{reason:'xenia-module-retired'});
              return {complete:result.session?.id===sessionId&&result.session?.status==='ended'&&result.credential_file_removed===true};
            } catch{return {complete:false,reason:'native_cleanup_required'};}
          })();return retirement;
        },
        async disconnect(){active=false;return endpoint.close();}
      };
    } catch(error) {if(endpoint)await endpoint.close();if(error instanceof EndpointError)throw error;throw new EndpointError('connector_start_failed',true);}
  };
}
