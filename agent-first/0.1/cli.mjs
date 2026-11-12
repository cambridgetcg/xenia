// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createModuleRuntime,ModuleError,MODULE_INPUT_LIMITS} from './runtime.mjs';
import {createXeniaModules} from './modules.mjs';
import {commandFailure,finishProvider} from './command-state.mjs';

export const EXAMPLES={
  'xenia.surface':{service:{name:'Local example',canonicalUrl:'https://example.com/',description:'An unserved reference example.'},resources:[{id:'about',href:'https://example.com/about'}]},
  'xenia.covenant':{hostName:'Local example',canonicalUrl:'https://example.com/',speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z'},
  'xenia.work':{reference:'work/0.1/examples/declined.json',input:'a complete parsed Work 0.1 record, not this explanatory object'},
};
const makeRuntime=()=>{const runtime=createModuleRuntime();for(const module of createXeniaModules())runtime.register(module);return runtime;};
const envelope=(fields)=>({schema:'xenia.agent-first/0.1-development',...fields});

async function demo(){
  const runtime=makeRuntime();for(const {id}of runtime.catalog())runtime.activate(id);
  const surface=(await runtime.invoke('xenia.surface','manifest',EXAMPLES['xenia.surface'])).value;
  const covenant=(await runtime.invoke('xenia.covenant','draft',EXAMPLES['xenia.covenant'])).value;
  const fixture=JSON.parse(fs.readFileSync(new URL('../../work/0.1/examples/declined.json',import.meta.url),'utf8'));
  const work=(await runtime.invoke('xenia.work','check',fixture)).value;
  // Synthetic implementation versions demonstrate the lifecycle; no Xenia
  // profile or published AgentTool package is claimed to have been upgraded.
  const echo=(version,label)=>({id:'example.echo',version,contract:'example.echo/1',title:'Lifecycle fixture',motif:'change',description:'A synthetic local upgrade example.',
    operations:{echo:{description:'Return chosen input with an implementation label.',effects:[],run:input=>({input,implementation:label})}}});
  runtime.register(echo('1.0.0','first'));runtime.activate('example.echo');
  const before=await runtime.invoke('example.echo','echo','same input');
  runtime.upgrade('example.echo',echo('1.1.0','second'),{expectedRevision:1});
  const after=await runtime.invoke('example.echo','echo','same input');
  const retired=runtime.retire('example.echo');let blocked=false;
  try{await runtime.invoke('example.echo','echo','not admitted');}catch(error){blocked=error.code==='MODULE_RETIRED';}
  return envelope({kind:'local-reference-tools-and-synthetic-lifecycle',surface,covenant,work,
    lifecycle:{before,after,retired,new_invocation_blocked:blocked},agenttool_required:false,
    not_established:['hosted-service conformance','actor authority','consent','external effects','persistent runtime state']});
}

async function starterSmoke(args){
  if(args.length!==4||args[0]!=='--package'||args[2]!=='--dir')throw new ModuleError('INVALID_ARGUMENTS');
  const {loadReviewedStarter,separateContextRoots}=await import('./provider.mjs');
  const {packageDir,dir}=separateContextRoots(path.resolve(args[1]),path.resolve(args[3]));
  const {createLocalStarterModule}=await import('./adapters/local-starter.mjs');
  const provider=await loadReviewedStarter(packageDir);
  const state={phase:'register',returned:[],verification:'not_run'};
  const id='agenttool.local-context';
  const runtime=createModuleRuntime({authorize:request=>request.module.id===id&&['init','status','render','handoff'].includes(request.operation)});
  let output,failure,registered=false;
  try{
    runtime.register(createLocalStarterModule({starter:provider.starter,dir,version:provider.release.version,source:provider.release.source}));
    registered=true;
    runtime.activate(id);
    const invoke=async(operation,input)=>{
      state.phase=operation;
      const result=await runtime.invoke(id,operation,input);
      state.returned.push(operation);
      return result;
    };
    const initialized=await invoke('init',{});
    const status=(await invoke('status',{})).value;
    const previous=status.sources.find(source=>source.id==='handoff').sha256;
    const text='# Chosen context\n\nXenia integration fixture: these notes remain after the module retires.\n';
    const written=(await invoke('handoff',{text,expectedSha256:previous})).value;
    const rendered=(await invoke('render',{})).value;
    state.phase='verification';
    const handoff=rendered.sources.find(source=>source.id==='handoff');
    if(handoff?.content!==text||written.previous_sha256!==previous)throw new ModuleError('VERIFICATION_FAILED');
    runtime.retire(id);let blocked=false;
    try{await runtime.invoke(id,'render',{});}catch(error){blocked=error.code==='MODULE_RETIRED';}
    const retained=fs.readFileSync(path.join(dir,'handoff.md'),'utf8')===text;
    if(!blocked||!retained)throw new ModuleError('VERIFICATION_FAILED');
    state.verification='passed';
    output=envelope({kind:'real-pinned-agenttool-local-starter-smoke',provider:{name:provider.release.name,version:provider.release.version,archive_sha256:provider.release.archive_sha256},
      notes_root:dir,initialized:initialized.value,write_receipt:written,context_format:rendered.format,
      retirement:runtime.describe(id),new_invocation_blocked:blocked,notes_preserved:retained,
      provider_effects:'local synthetic fixture only',not_established:['host-session delivery','identity or subjective continuity','hosted account integration','whole-framework conformance']});
  }catch(error){
    if(state.phase==='verification')state.verification='failed';
    failure=commandFailure(error,state);
  }
  try{if(registered)runtime.retire(id);}catch(error){failure??=commandFailure(error,state,'retirement');}
  finishProvider(provider,state,failure);
  return output;
}

export async function main(args){
  const [command,...rest]=args;
  if(command==='motifs'&&!rest.length)return JSON.parse(fs.readFileSync(new URL('./motifs.json',import.meta.url),'utf8'));
  if(command==='motifs'&&rest[0]==='study'){
    const {studyCommand}=await import('./motif-studies.mjs');
    try{return envelope(await studyCommand(rest.slice(1)));}
    catch(error){
      const known=['MOTIF_NOT_FOUND','MOTIF_INVALID_ARGUMENTS','MOTIF_BUILD_REQUIRED','MOTIF_NATIVE_CONTRACT_CHANGED','MOTIF_STUDY_UNAVAILABLE'];
      const code=known.includes(error?.code)?error.code:'MOTIF_STUDY_FAILED';
      throw new ModuleError(code,!['MOTIF_NOT_FOUND','MOTIF_INVALID_ARGUMENTS'].includes(code));
    }
  }
  if(command==='starter-smoke')return starterSmoke(rest);
  if(command==='context'){
    const {runContextCommand}=await import('./context.mjs');
    return envelope(await runContextCommand(rest));
  }
  const runtime=makeRuntime();
  if(!command||command==='help'||command==='--help')return envelope({title:'Xenia agent-first module kit',status:'repository-only development',
    commands:['motifs','motifs study [list|show <id>|run <id>|journey]','catalog','explain <module-id>','demo','context <init|status|render> --package <reviewed-package-dir> --dir <notes-dir>',
      'context handoff --package <reviewed-package-dir> --dir <notes-dir> --input <chosen-file> --expect <current-sha256>',
      'starter-smoke --package <reviewed-package-dir> --dir <new-notes-dir>'],
    principle:'Inspect → activate deliberately → invoke through the host gate → pause, upgrade or retire.',
    limits:MODULE_INPUT_LIMITS,notes:['No automatic installs, services, host hooks, accounts, publication or model calls.','Runtime state is in-process; the caller owns persistence.','Trusted module code is not an OS sandbox.']});
  if(command==='catalog'&&!rest.length)return envelope({modules:runtime.catalog(),limits:MODULE_INPUT_LIMITS});
  if(command==='explain'&&rest.length===1)return envelope({module:runtime.describe(rest[0]),example:EXAMPLES[rest[0]],
    interpretation:'Descriptions and examples are informative. Native profile functions validate their own inputs; reading does not activate anything.'});
  if(command==='demo'&&!rest.length)return demo();
  throw new ModuleError('INVALID_ARGUMENTS');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await main(process.argv.slice(2)),null,2));}
  catch(error){
    const safe=error instanceof ModuleError?error:new ModuleError('CLI_FAILED');
    console.log(JSON.stringify(envelope({error:{code:safe.code,operation_started:safe.operation_started,effect_outcome:safe.effect_outcome,retryable:false,
      phase:safe.phase,returned_operations:safe.returned_operations,verification:safe.verification,snapshot_cleanup:safe.snapshot_cleanup},
      guidance:'Inspect the selected module, paths and current provider state. For the local demo, prepare the root dependencies/build. No mutation is retried automatically.'}),null,2));
    process.exitCode=1;
  }
}
