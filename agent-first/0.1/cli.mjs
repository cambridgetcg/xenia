// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createModuleRuntime,ModuleError,MODULE_INPUT_LIMITS} from './runtime.mjs';
import {createXeniaModules} from './modules.mjs';
import {commandFailure,errorProjection,failureNotEstablished,finishProvider} from './command-state.mjs';
import {adapterRows,describeAdapter,ADAPTER_IDS,ADAPTERS_NOT_LISTED} from './adapter-catalog.mjs';
import {buildArrival} from './arrive.mjs';
import {runInvoke} from './invoke.mjs';
import {CARD_NOTE,COMMANDS,EXIT_CODES,NETWORK_NOTE,REPORT_ROUTE,USAGE_CODES,buildProblem,exitOf,usageHelp,wasWritten} from './problems.mjs';

const makeRuntime=()=>{const runtime=createModuleRuntime();for(const module of createXeniaModules())runtime.register(module);return runtime;};
const exampleOf=(runtime,id)=>runtime.describe(id).operations[0].input.example;
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
  const echo=(version,label)=>({id:'example.echo',version,contract:'example.echo/1',title:'Lifecycle fixture',motif:'continuity',description:'A synthetic local upgrade example.',
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
  const surface=(await invoke('xenia.surface','manifest',exampleOf(runtime,'xenia.surface'))).value;
  const covenant=(await invoke('xenia.covenant','draft',exampleOf(runtime,'xenia.covenant'))).value;
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
  if(!path.isAbsolute(args[3]))throw Object.assign(new ModuleError('INVALID_CONTEXT_ROOT'),{reason:'relative_path'});
  const {loadReviewedStarter,separateContextRoots}=await import('./provider.mjs');
  const {packageDir,dir}=separateContextRoots(path.resolve(args[1]),path.resolve(args[3]));
  const {createLocalStarterModule}=await import('./adapters/local-starter.mjs');
  const provider=await loadReviewedStarter(packageDir,{notesDir:dir});
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
const GENERAL_HELP=['arrive','help [command]','motifs [motif-id]','motifs study [list|show <study-id|motif-id>|run <study-id>|journey]','catalog','explain <module-id>','invoke <module-id> <operation-id> --input <file>','session [--allow <module:operation,...>] [--collab-config <absolute-file>]','demo [--full]',
  'door plan --origin <origin> [--allow-local-target]',
  'door check --origin <origin> --max-requests <1..66> --total-timeout-ms <100..120000> [--allow-local-target] [--full]',
  'door rights --input <file> [--as-of <rfc3339>] [--origin <origin>] [--full]',
  'feedback new [--out <absolute-new-file>]',
  'feedback check --input <file>',
  'context <init|status|render> --package <reviewed-package-dir> --dir <notes-dir>',
  'context handoff --package <reviewed-package-dir> --dir <notes-dir> --input <chosen-file> --expect <current-sha256>',
  'starter-smoke --package <reviewed-package-dir> --dir <new-notes-dir>'];

function unknownCommand(word){return Object.assign(new ModuleError('UNKNOWN_COMMAND'),{word});}
// A command is a name in the table itself; a word such as `toString`, which every object answers to, is not one.
const isCommand=word=>typeof word==='string'&&Object.hasOwn(COMMANDS,word);

export async function main(args){
  const [command,...rest]=args;
  if(command==='motifs'&&rest[0]==='study'){
    const {studyCommand}=await import('./motif-studies.mjs');
    const sub=rest.slice(1);
    try{
      return envelope(await studyCommand(sub.length>1&&sub.some(isHelp)?['help']:sub));
    }catch(error){
      const known=['STUDY_NOT_FOUND','STUDY_INVALID_ARGUMENTS','BUILD_REQUIRED','STUDY_NATIVE_CONTRACT_CHANGED','STUDY_UNAVAILABLE'];
      const code=known.includes(error?.code)?error.code:'STUDY_FAILED';
      const failure=new ModuleError(code,['STUDY_NATIVE_CONTRACT_CHANGED','STUDY_FAILED'].includes(code));
      if(code==='STUDY_NOT_FOUND'&&Array.isArray(error.valid))failure.valid=[...error.valid];
      // `show` with an earlier motif name says where it went, as `motifs <name>` does. Without the map helpers or the
      // map, the answer is the plain one.
      if(code==='STUDY_NOT_FOUND'&&sub[0]==='show'){
        try{
          const {earlierName}=await import('./motif-map.mjs');
          const found=earlierName(JSON.parse(fs.readFileSync(new URL('./motifs.json',import.meta.url),'utf8')),sub[1]);
          if(Array.isArray(found?.now_at))failure.now_at=[...found.now_at];
        }catch{}
      }
      throw failure;
    }
  }
  const wantsHelp=args.some(isHelp);
  if(!command||command==='help'||wantsHelp){
    const words=args.filter(arg=>!isHelp(arg));
    if(words[0]==='help')words.shift();
    // `help door plan` is answered as `help door`: the words after a command name are not read.
    if(!wantsHelp&&command==='help'&&words.length>=1&&!isCommand(words[0]))throw unknownCommand(words[0]);
    if(words.length&&isCommand(words[0])&&(wantsHelp||command==='help'))return envelope(usageHelp(words[0]));
    return envelope({title:'Xenia agent-first module kit',status:'repository-only development',commands:GENERAL_HELP,
      start_here:'Run: arrive. It is one read-only orientation document and expects no reply.',
      principle:'Inspect → activate deliberately → invoke through the host gate → pause, upgrade or retire.',
      exit_codes:EXIT_CODES,output:'stdout is one JSON document; stderr is silent. A failure has error (what happened) and problem (what you may do next). A `door` or `feedback` document states its own exit as exit_code, exit_reason and exit_meaning. `session` is the one exception: its stdout is JSON Lines, one JSON object per line, and its exit is 0 only when its end was complete; see `help session`.',
      network:NETWORK_NOTE,cards:CARD_NOTE,limits:MODULE_INPUT_LIMITS,notes:['No automatic installs, services, host hooks, accounts, publication or model calls.','Runtime state is in-process; the caller owns persistence.','Trusted module code is not an OS sandbox.'],
      not_established:['that any listed command will succeed here','that this list is every capability of the host']});
  }
  if(command==='motifs'&&(!rest.length||(rest.length===1&&!rest[0].startsWith('-')))){
    // Loaded only for this command, so the other commands work without the map helpers.
    const {motifIndex,motifCard,earlierName}=await import('./motif-map.mjs');
    const map=JSON.parse(fs.readFileSync(new URL('./motifs.json',import.meta.url),'utf8'));
    if(!rest.length)return motifIndex(map);
    const card=motifCard(map,rest[0]);
    // An earlier name or a study id is answered with the map's own words; the word given is not kept.
    if(!card)throw Object.assign(new ModuleError('MOTIF_NOT_FOUND'),{valid:map.motifs.map(item=>item.id),...earlierName(map,rest[0])});
    return card;
  }
  if(command==='starter-smoke')return starterSmoke(rest);
  if(command==='door'){
    // Loaded only for this command: the other commands never import the checker, the target rule or the covenant checks.
    const {runDoorCommand}=await import('./door.mjs');
    return runDoorCommand(rest);
  }
  if(command==='feedback'){
    // Loaded only for this command. It imports the bounded reader and the problem table, and nothing that sends.
    const {runFeedbackCommand}=await import('./feedback.mjs');
    return runFeedbackCommand(rest);
  }
  if(command==='context'){
    const {runContextCommand}=await import('./context.mjs');
    return envelope(await runContextCommand(rest));
  }
  if(command==='session'){
    // Loaded only for this command. It reads standard input and writes its own lines, one compact JSON object each, as it goes;
    // it does not throw, and what it returns is marked as already written.
    const {runSessionCommand}=await import('./session.mjs');
    return runSessionCommand(rest);
  }
  const runtime=makeRuntime();
  if(command==='arrive'&&!rest.length){
    const lock=JSON.parse(fs.readFileSync(new URL('./agenttool.lock.json',import.meta.url),'utf8')).local_starter;
    const core=runtime.catalog().map(({id,title,operations})=>({id,title,effects:[...new Set(operations.flatMap(op=>op.effects))]}));
    return buildArrival({lock,core,adapters:adapterRows(),notListed:ADAPTERS_NOT_LISTED,networkNote:NETWORK_NOTE,report:REPORT_ROUTE});
  }
  if(command==='catalog'&&!rest.length)return envelope({modules:runtime.catalog(),adapters:adapterRows(),...(ADAPTERS_NOT_LISTED.length?{adapters_not_listed:ADAPTERS_NOT_LISTED}:{}),
    runtime:{scope:'this process only',note:'state, revision and in_flight describe a runtime this command just created; they are not live shared state. Every module here starts as registered, revision 1, nothing in flight.',
      not_established:['the state of any runtime in another process or host']},
    adapters_note:'Adapters are present in this checkout but not bound: no provider was imported and none is registered here. Each lists what must be supplied, and `bound_by` says which command, if any, binds it.',
    cards:CARD_NOTE,network:NETWORK_NOTE,limits:MODULE_INPUT_LIMITS});
  if(command==='explain'&&rest.length===1){
    const adapter=describeAdapter(rest[0]);
    if(adapter)return envelope(adapter);
    const module=runtime.describe(rest[0]);
    const first=module.operations[0]?.input;
    const runnable=module.operations.find(op=>!op.effects.length&&op.input);
    return envelope({module,example:first?.example??(first?.example_ref?{reference:first.example_ref,note:'A path relative to the repository root; it is a file you can pass as --input.'}:undefined),
      ...(runnable?{next:[{argv:['invoke',module.id,runnable.id],needs:['--input <file>'],why:'Run this operation once on your own JSON file; prints a receipt.'}]}:{}),
      runtime_note:'state, revision and in_flight describe a runtime this command just created, not live shared state.',
      cards:CARD_NOTE,
      interpretation:'Descriptions, summaries and examples are informative; a schema on a card is enforced. Where input_checked_by is handler, the native profile function validates its own input. Reading does not activate anything. A refusal an operation lists is the module’s own declaration that it applied nothing; the runtime does not observe that.'});
  }
  if(command==='invoke')return envelope(await runInvoke(rest,{runtime,adapters:adapterRows()}));
  if(command==='demo'&&!rest.length)return demo(false);
  if(command==='demo'&&rest.length===1&&rest[0]==='--full')return demo(true);
  if(!isCommand(command))throw unknownCommand(command);
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
  // The projection of the error and what it leaves open are in command-state.mjs.
  return {exit:USAGE_CODES.includes(safe.code)?2:1,
    body:envelope({error:errorProjection(safe,problem.retryable),problem,...(safe.receipt?{receipt:safe.receipt}:{}),not_established:failureNotEstablished(safe)})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const argv=process.argv.slice(2);
  try{
    const body=await main(argv);
    // `session` wrote its own lines. The process is ended here, so that a handler still running past its deadline cannot keep it open.
    if(wasWritten(body))process.exit(exitOf(body)??0);
    console.log(JSON.stringify(body,null,2));
    // Only a body that set its own exit (door, feedback) changes it; every other success stays 0.
    const exit=exitOf(body);
    if(exit!==undefined)process.exitCode=exit;
  }
  catch(error){
    const {exit,body}=failureEnvelope(error,argv);
    console.log(JSON.stringify(body,null,2));
    process.exitCode=exit;
  }
}
