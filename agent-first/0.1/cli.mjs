// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createModuleRuntime,ModuleError,MODULE_INPUT_LIMITS} from './runtime.mjs';
import {createXeniaModules} from './modules.mjs';
import {commandFailure,finishProvider} from './command-state.mjs';
import {adapterRows,describeAdapter,ADAPTER_IDS} from './adapter-catalog.mjs';
import {buildArrival} from './arrive.mjs';
import {COMMANDS,EXIT_CODES,USAGE_CODES,buildProblem,usageHelp} from './problems.mjs';

export const EXAMPLES={
  'xenia.surface':{service:{name:'Local example',canonicalUrl:'https://example.com/',description:'An unserved reference example.'},resources:[{id:'about',href:'https://example.com/about'}]},
  'xenia.covenant':{hostName:'Local example',canonicalUrl:'https://example.com/',speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z'},
  'xenia.work':{reference:'work/0.1/examples/declined.json',input:'a complete parsed Work 0.1 record, not this explanatory object'},
};
const makeRuntime=()=>{const runtime=createModuleRuntime();for(const module of createXeniaModules())runtime.register(module);return runtime;};
const envelope=(fields)=>({schema:'xenia.agent-first/0.1-development',...fields});

const digest=value=>{const text=JSON.stringify(value)??'';return {bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};};

async function demo(full){
  // The reference tools import the root build and the Work checker's dev dependencies.
  const root=new URL('../../',import.meta.url);
  if(!fs.existsSync(new URL('dist/surface-0.1.js',root))||!fs.existsSync(new URL('node_modules/ajv/package.json',root)))throw new ModuleError('BUILD_REQUIRED');
  const runtime=makeRuntime();
  const steps=[];
  const effectsOf=(described,operation)=>described.operations.filter(op=>operation===undefined||op.id===operation).flatMap(op=>op.effects);
  // A lifecycle step returns a module description; an invoke step a result.
  const lifecycle=(call,described)=>{steps.push({call,module_version:described.version,revision:described.revision,effects:[],outcome:'returned',result:digest(described)});return described;};
  const invoke=async(id,operation,input)=>{
    const described=runtime.describe(id);
    const result=await runtime.invoke(id,operation,input);
    steps.push({call:`invoke ${id} ${operation}`,module_version:result.module.version,revision:result.module.revision,effects:effectsOf(described,operation),outcome:result.outcome,result:digest(result.value)});
    return result;
  };
  // Synthetic implementation versions demonstrate the lifecycle; no Xenia
  // profile or published AgentTool package is claimed to have been upgraded.
  const echo=(version,label)=>({id:'example.echo',version,contract:'example.echo/1',title:'Lifecycle fixture',motif:'change',description:'A synthetic local upgrade example.',
    operations:{echo:{description:'Return chosen input with an implementation label.',effects:[],run:input=>({input,implementation:label})}}});
  lifecycle('register example.echo (synthetic)',runtime.register(echo('1.0.0','first')));
  lifecycle('activate example.echo',runtime.activate('example.echo'));
  const before=await invoke('example.echo','echo','same input');
  lifecycle('upgrade example.echo to 1.1.0 (expectedRevision 1)',runtime.upgrade('example.echo',echo('1.1.0','second'),{expectedRevision:1}));
  const after=await invoke('example.echo','echo','same input');
  const retired=lifecycle('retire example.echo',runtime.retire('example.echo'));
  let blocked=false;
  try{await runtime.invoke('example.echo','echo','not admitted');}catch(error){
    blocked=error.code==='MODULE_RETIRED';
    steps.push({call:'invoke example.echo echo (after retire)',module_version:error.module_version,revision:error.module_revision,effects:[],outcome:'blocked',error_code:error.code,effect_outcome:error.effect_outcome});
  }
  for(const {id}of runtime.catalog())if(id.startsWith('xenia.'))runtime.activate(id);
  const surface=(await invoke('xenia.surface','manifest',EXAMPLES['xenia.surface'])).value;
  const covenant=(await invoke('xenia.covenant','draft',EXAMPLES['xenia.covenant'])).value;
  const fixture=JSON.parse(fs.readFileSync(new URL('../../work/0.1/examples/declined.json',import.meta.url),'utf8'));
  const work=(await invoke('xenia.work','check',fixture)).value;
  const not_established=['hosted-service conformance','actor authority','consent','external effects','persistent runtime state'];
  if(!full)return envelope({kind:'local-reference-demo-steps',steps,new_invocation_blocked:blocked,agenttool_required:false,
    full_output:'run: demo --full',digest:'bytes and sha256 are of the JSON text of each returned value; this list does not include the values.',not_established});
  return envelope({kind:'local-reference-tools-and-synthetic-lifecycle',surface,covenant,work,
    lifecycle:{before,after,retired,new_invocation_blocked:blocked},agenttool_required:false,not_established});
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

const isHelp=arg=>arg==='-h'||arg==='--help';
const GENERAL_HELP=['arrive','help [command]','motifs [motif-id]','motifs study [list|show <study-id|motif-id>|run <study-id>|journey]','catalog','explain <module-id>','demo [--full]',
  'context <init|status|render> --package <reviewed-package-dir> --dir <notes-dir>',
  'context handoff --package <reviewed-package-dir> --dir <notes-dir> --input <chosen-file> --expect <current-sha256>',
  'starter-smoke --package <reviewed-package-dir> --dir <new-notes-dir>'];

function unknownCommand(word){return Object.assign(new ModuleError('UNKNOWN_COMMAND'),{word});}

export async function main(args){
  const [command,...rest]=args;
  if(command==='motifs'&&rest[0]==='study'){
    const {studyCommand}=await import('./motif-studies.mjs');
    try{
      const sub=rest.slice(1);
      return envelope(await studyCommand(sub.length>1&&sub.some(isHelp)?['help']:sub));
    }catch(error){
      const known=['STUDY_NOT_FOUND','MOTIF_INVALID_ARGUMENTS','BUILD_REQUIRED','MOTIF_NATIVE_CONTRACT_CHANGED','MOTIF_STUDY_UNAVAILABLE'];
      const code=known.includes(error?.code)?error.code:'MOTIF_STUDY_FAILED';
      const failure=new ModuleError(code,['MOTIF_NATIVE_CONTRACT_CHANGED','MOTIF_STUDY_FAILED'].includes(code));
      if(code==='STUDY_NOT_FOUND'&&Array.isArray(error.valid))failure.valid=[...error.valid];
      throw failure;
    }
  }
  const wantsHelp=args.some(isHelp);
  if(!command||command==='help'||wantsHelp){
    const words=args.filter(arg=>!isHelp(arg));
    if(words[0]==='help')words.shift();
    if(!wantsHelp&&command==='help'&&words.length>1)throw new ModuleError('INVALID_ARGUMENTS');
    if(!wantsHelp&&command==='help'&&words.length===1&&!COMMANDS[words[0]])throw unknownCommand(words[0]);
    if(words.length&&COMMANDS[words[0]]&&(wantsHelp||command==='help'))return envelope(usageHelp(words[0]));
    return envelope({title:'Xenia agent-first module kit',status:'repository-only development',commands:GENERAL_HELP,
      start_here:'Run: arrive. It is one read-only orientation document and expects no reply.',
      principle:'Inspect → activate deliberately → invoke through the host gate → pause, upgrade or retire.',
      exit_codes:EXIT_CODES,output:'stdout is one JSON document; stderr is silent. A failure has error (what happened) and problem (what you may do next).',
      limits:MODULE_INPUT_LIMITS,notes:['No automatic installs, services, host hooks, accounts, publication or model calls.','Runtime state is in-process; the caller owns persistence.','Trusted module code is not an OS sandbox.'],
      not_established:['that any listed command will succeed here','that this list is every capability of the host']});
  }
  if(command==='motifs'&&!rest.length)return {...JSON.parse(fs.readFileSync(new URL('./motifs.json',import.meta.url),'utf8')),next:[
    {argv:['motifs','standing'],why:'Read one motif card.'},
    {argv:['motifs','study','list'],why:'List the small studies that examine a motif.'},
    {argv:['motifs','study','journey'],why:'Follow the six motifs in order through their studies. Needs the Xenia build.'},
    {argv:['arrive'],why:'Read the one-page orientation to this door.'}]};
  if(command==='motifs'&&rest.length===1&&!rest[0].startsWith('-')){
    const {motifs}=JSON.parse(fs.readFileSync(new URL('./motifs.json',import.meta.url),'utf8'));
    const card=motifs.find(item=>item.id===rest[0]);
    if(!card)throw Object.assign(new ModuleError('MOTIF_NOT_FOUND'),{valid:motifs.map(item=>item.id)});
    return envelope({kind:'motif-card',motif:card,not_established:['that this card describes a running service',card.limit]});
  }
  if(command==='starter-smoke')return starterSmoke(rest);
  if(command==='context'){
    const {runContextCommand}=await import('./context.mjs');
    return envelope(await runContextCommand(rest));
  }
  const runtime=makeRuntime();
  if(command==='arrive'&&!rest.length){
    const lock=JSON.parse(fs.readFileSync(new URL('./agenttool.lock.json',import.meta.url),'utf8')).local_starter;
    const core=runtime.catalog().map(({id,title,operations})=>({id,title,effects:[...new Set(operations.flatMap(op=>op.effects))]}));
    return buildArrival({lock,core,adapters:adapterRows()});
  }
  if(command==='catalog'&&!rest.length)return envelope({modules:runtime.catalog(),adapters:adapterRows(),
    adapters_note:'Adapters are present in this checkout but not bound: no provider was imported and none is registered here. Each lists what must be supplied.',limits:MODULE_INPUT_LIMITS});
  if(command==='explain'&&rest.length===1){
    const adapter=describeAdapter(rest[0]);
    if(adapter)return envelope(adapter);
    return envelope({module:runtime.describe(rest[0]),example:EXAMPLES[rest[0]],
      interpretation:'Descriptions and examples are informative. Native profile functions validate their own inputs; reading does not activate anything.'});
  }
  if(command==='demo'&&!rest.length)return demo(false);
  if(command==='demo'&&rest.length===1&&rest[0]==='--full')return demo(true);
  if(!COMMANDS[command])throw unknownCommand(command);
  throw new ModuleError('INVALID_ARGUMENTS');
}

function failureEnvelope(error,argv){
  const safe=error instanceof ModuleError?error:new ModuleError('CLI_FAILED');
  const ctx={argv,word:safe.word};
  if(safe.code==='PROVIDER_PIN_MISMATCH'){
    try{const {name,version,source}=JSON.parse(fs.readFileSync(new URL('./agenttool.lock.json',import.meta.url),'utf8')).local_starter;ctx.lock={name,version,source};}catch{}
  }
  if(safe.code==='MODULE_NOT_FOUND'||safe.module!==undefined){
    try{ctx.moduleIds=[...makeRuntime().catalog().map(module=>module.id),...ADAPTER_IDS];}catch{}
  }
  const problem=buildProblem(safe,ctx);
  const not_established=['that a suggested next action will succeed'];
  if(safe.effect_outcome==='unknown')not_established.push('whether the failed operation changed anything');
  if(safe.effect_outcome==='not_applied')not_established.push('anything about state beyond this one declined operation');
  return {exit:USAGE_CODES.includes(safe.code)?2:1,
    body:envelope({error:{code:safe.code,operation_started:safe.operation_started,effect_outcome:safe.effect_outcome,retryable:problem.retryable,module:safe.module,operation:safe.operation,
      module_version:safe.module_version,module_revision:safe.module_revision,refusal:safe.refusal,
      phase:safe.phase,returned_operations:safe.returned_operations,verification:safe.verification,snapshot_cleanup:safe.snapshot_cleanup},
      problem,not_established})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const argv=process.argv.slice(2);
  try{console.log(JSON.stringify(await main(argv),null,2));}
  catch(error){
    const {exit,body}=failureEnvelope(error,argv);
    console.log(JSON.stringify(body,null,2));
    process.exitCode=exit;
  }
}
