// SPDX-License-Identifier: MPL-2.0
// What the door says when it says no. Pure data and functions: no filesystem,
// network or timers. Each error code becomes a kit-local CLI `problem`. It
// borrows the meanings of Surface's problem (terminal with no next actions, or
// not terminal with at least one; retryable) but it is NOT
// xenia.surface.problem/0.1 and does not validate against
// surface/0.1/problem.schema.json: codes are UPPER_SNAKE, and a next action is
// an argv array the caller can run plus a one-line reason (`why`), not a link.
// An action with `needs` is a command prefix: the caller adds the named flags.

// Which rule an unusable input file broke; input-file.mjs sets the `reason` key.
export const INPUT_REASONS=Object.freeze({
  missing:'The input file is missing (no file at that path).',
  not_regular_file:'The input path is not a regular file (a directory or special file).',
  symbolic_link:'The input path is a symbolic link; this reader never follows links.',
  unreadable:'The input file could not be read.',
  too_large:'The input file is over its size limit (1 MiB for invoke and for feedback check, 16 KiB for a handoff, 2,000,000 bytes for door rights).',
  not_utf8:'The input file is not valid UTF-8.',
  byte_order_mark:'The input file starts with a byte-order mark; remove it.',
  not_json:'The input file is not exactly one JSON value.',
  duplicate_key:'An object in the input file repeats a key.',
  beyond_limits:'The input is nested or large beyond the input limits (32 levels deep, 65536 values, 1 MiB).',
  not_an_adoption_record:'The input file is JSON, but it does not say it is a Covenant adoption record: it is not an object whose schema_version begins with xenia.covenant.adoption/.',
});

// Which argument of a known command could not be read. What was typed is never
// copied into the output.
export const ARGUMENT_REASONS=Object.freeze({
  as_of_not_rfc3339:'--as-of must be an RFC 3339 date-time with a real calendar date and Z or an offset, at most 40 characters, for example 2026-11-13T00:00:00Z.',
  origin_not_an_origin:'--origin must be a plain HTTP(S) origin: a scheme and a host, with no user name, password, path, query or fragment.',
});

// Why `feedback new --out` wrote nothing. The path given is never copied into the output.
export const OUTPUT_REASONS=Object.freeze({
  relative_path:'--out must be an absolute path; a relative path would put the file in whatever directory the command runs from.',
  names_a_folder:'The --out path ends with a path separator, so it names a folder; this command writes one file.',
  already_exists:'Something is already at the --out path (a file, a folder or a link), and this command never overwrites.',
  parent_missing:'The folder the --out path is in does not exist; this command creates one file and no folder.',
  parent_not_a_directory:'Part of the --out path is not a directory.',
  not_permitted:'Creating a file at the --out path is not permitted there.',
  could_not_create:'The file at the --out path could not be created.',
});

// Which rule refused a `door` target. `reason` is always one of these keys; the
// text given on the command line is never copied into the output.
export const TARGET_REASONS=Object.freeze({
  not_an_origin:'The target is not a plain HTTP(S) origin: give a scheme and a host, with no user name, password, path, query or fragment.',
  http_not_loopback:'Plain HTTP is accepted only for localhost, 127.x and [::1]; any other target must use HTTPS.',
  refused_by_checker:'The checker refused the target.',
  https_required:'The default target rule accepts HTTPS only.',
  unsafe_port:'The default target rule accepts port 443 only.',
  ip_literal_not_allowed:'The default target rule accepts a DNS name, not an IP address.',
  single_label_host_not_allowed:'The default target rule accepts a host name with at least one dot.',
  local_or_reserved_host_not_allowed:'The default target rule does not accept a local or reserved host name.',
  hostname_too_long:'The host name is longer than DNS allows.',
  refused_by_target_rule:'The default target rule refused the target.',
});

// One sentence, used word for word in arrive, help, catalog, the README and motifs.json.
export const NETWORK_NOTE='`door check` is the only command in which this kit\'s own code sends requests; provider code run by `context` and `starter-smoke` is not observed by this kit.';

// Where a report can go. One constant: `arrive` and both `feedback` commands
// print it as it is. It names routes; it promises none of them.
export const REPOSITORY='https://github.com/cambridgetcg/xenia';
const frozen=value=>{for(const item of Object.values(value))if(item!==null&&typeof item==='object')frozen(item);return Object.freeze(value);};
export const REPORT_ROUTE=frozen({
  protocol:'AGENT-FEEDBACK.md',
  endpoint:'none',
  note:'There is no endpoint to post to, and no command in this kit sends a report.',
  routes:[
    {id:'pull_request',what:`A pull request to ${REPOSITORY} that adds the entry to AGENT-FEEDBACK.md.`,
      needs:'a GitHub account, and a fork or push access',decided_by:'a maintainer, who may decline or not answer'},
    {id:'issue',what:`An issue at ${REPOSITORY}/issues.`,needs:'a GitHub account',note:'An issue is not a notebook entry.'},
    {id:'hand_over',what:'Giving the note to whoever the writer answers to, if anyone.',needs:'nothing from this repository'},
    {id:'stays',what:'Otherwise the note stays where it was written.'},
  ],
  reply:'None is asked for, and none is promised.',
});

// The flags each `door` operation takes; checkArgv and door.mjs both read this.
export const DOOR_FLAGS=Object.freeze({
  plan:{required:['--origin'],switches:['--allow-local-target']},
  check:{required:['--origin','--max-requests','--total-timeout-ms'],switches:['--allow-local-target','--full']},
  rights:{required:['--input'],optional:['--as-of','--origin'],switches:['--full']},
});

// The flags each `feedback` operation takes; checkArgv and feedback.mjs both read this.
export const FEEDBACK_FLAGS=Object.freeze({
  new:{optional:['--out']},
  check:{required:['--input']},
});

export const COMMANDS={
  arrive:{usage:'arrive',summary:'Read one bounded orientation document. Expects no reply; activates nothing.',probe:['arrive']},
  help:{usage:'help [command]',summary:'Show this help, or the usage of one command.',probe:['help']},
  motifs:{usage:'motifs [motif-id]',summary:'Read the motif map, or one motif card.',probe:['motifs']},
  catalog:{usage:'catalog',summary:'List the registered modules. Activates nothing.',probe:['catalog']},
  explain:{usage:'explain <module-id>',summary:'Describe one module and give an input example.',probe:['explain','xenia.surface']},
  demo:{usage:'demo [--full]',summary:'Run the local reference tools; a step list by default, complete bodies with --full. Needs the Xenia build.',probe:['demo']},
  invoke:{usage:'invoke <module-id> <operation-id> --input <file>',
    summary:'Register, activate, invoke once and retire a core module in this process, with your JSON file as input; prints a receipt. Only operations that declare no effects run here.',probe:['help','invoke'],
    rules:['The input file must be a regular file, not a symbolic link, at most 1 MiB.','It must be valid UTF-8 with no byte-order mark, exactly one JSON value, with no repeated object key.','Nesting is limited to 32 levels and 65536 values.','`explain <module-id>` shows an input example for each module; a path in example_ref is relative to the repository root.']},
  context:{usage:'context <init|status|render> --package <reviewed-package-dir> --dir <notes-dir>',
    also:['context handoff --package <reviewed-package-dir> --dir <notes-dir> --input <chosen-file> --expect <current-sha256>'],
    summary:'Run one explicit command on chosen local notes.',probe:['help','context'],
    rules:['--dir must be an absolute path to the notes root, and must be outside the --package directory.','init needs an existing parent and refuses a destination that exists.','handoff replaces only the handoff file; read its current sha256 with status and pass it as --expect.']},
  door:{usage:'door plan --origin <origin> [--allow-local-target]',
    also:['door check --origin <origin> --max-requests <1..66> --total-timeout-ms <100..120000> [--allow-local-target] [--full]',
      'door rights --input <file> [--as-of <rfc3339>] [--origin <origin>] [--full]'],
    summary:'Look at one HTTP(S) origin from outside. `plan` sends nothing and says what a check would send; `check` sends bounded GET requests and reports what it was served. `rights` reads an adoption record from a local file and sends nothing.',probe:['help','door'],
    rules:[NETWORK_NOTE,
      '`door plan` sends nothing: read it before `door check`. It gives the request, byte and time bounds, what is not guarded, and two `door check` commands to run.',
      '`door check` hands at most --max-requests GET requests (1 to 66) for the one origin to the runtime and starts none after --total-timeout-ms (100 to 120000). Both must be given; neither has a default. The plan names the one case in which the runtime sends a request twice.',
      'The origin is a scheme and a host only. By default it must use HTTPS, a DNS name and port 443, and not a local or reserved name. --allow-local-target accepts whatever else the checker accepts, and the output records that it was used.',
      '--full adds the checker\'s whole result. Without it the output gives only that result\'s size and sha256.',
      'Exit 0, 3 or 4 follows the checker\'s own word; the output says what each covers. A check reports what one User-Agent was served on these requests, and nothing wider.',
      '`door rights` reads one local file as a Covenant 0.1 adoption record and sends nothing. It reports which release the record pins, whether it raises issues under the rules installed in this checkout, and which of its evidence had expired at --as-of (an RFC 3339 time; without it, the clock). It verifies nothing the record says: a record that agrees with itself is not evidence of practice.',
      'The file for `door rights` must be a regular file, not a symbolic link, at most 2,000,000 bytes, valid UTF-8 with no byte-order mark, one JSON value with no repeated key, and an object whose schema_version begins with xenia.covenant.adoption/. Values from the record are shown only as a listed word, a timestamp or an origin.',
      '`door rights` exits 0 when the record pins the installed bytes, raises no issue, and no row it gives as pass rests on evidence expired at --as-of; 3 when it pins the installed bytes and raises an issue, or such a row rests on expired evidence; 4 when it pins other bytes, or the JSON Schema check could not be run here. Each of the two checks keeps at most 256 issues, and --full lists them. --origin only compares the origin the record names with the one given.']},
  feedback:{usage:'feedback new [--out <absolute-new-file>]',
    also:['feedback check --input <file>'],
    summary:'Write a report in the form AGENT-FEEDBACK.md describes, offline. `new` prints a blank entry, or writes it to one new file; `check` reads an entry from a local file and says which labelled parts it found. Neither sends or delivers anything.',probe:['help','feedback'],
    rules:['Both commands send nothing and deliver nothing, and read no clock. `feedback new` takes no input file; `feedback check` reads the one file named and, when it is there, AGENT-FEEDBACK.md in this checkout, to see whether the Entry ID is already in it.',
      '`feedback new` prints the blank entry inside its JSON document, as entry.text. With --out it writes the entry to that path instead. The path must be absolute, must not end with a path separator, and nothing may be there yet: the file is created only when nothing is at the path, and an existing file is never overwritten.',
      '`feedback check` exits 0 when it finds a dated heading (`## YYYY-MM-DD: ...`), an Entry ID in the form xenia-feedback-YYYYMMDD-label-NNN, Observed at starting with a date, Speaker (any text; the notebook allows anonymous reports), Status, and at least one `###` section with text; 3 when one of these is not found; 4 when the file has more than one dated heading. A 0 says those parts are there, and nothing about what they say.',
      'The notebook does not require this form. The labels that answer its eight bullets are reported as found, empty or not_found_by_label, and never change the exit.',
      'The file for `feedback check` must be a regular file, not a symbolic link, at most 1 MiB, valid UTF-8 with no byte-order mark. It is read line by line, not parsed as Markdown. An HTML comment is not read as content. A `<!--` begins one when it closes on its own line; when it is at the start of a line and closes on a later one; or when it closes on a later line before any blank line, heading, list item or code fence. Any other `<!--` is read as text, and nothing in a fenced code block is a comment.',
      'Warnings give a kind and a line number, never the text: a few fixed patterns that look like a credential or a local path, on the first 2,000 characters of each line, and four kinds about how the file was read. They do not change the exit, and finding none is not a finding that there are none.',
      'Where a report can go is printed as `route` by both commands and as `report` by `arrive`: a pull request, an issue, handing the note over, or nowhere. There is no endpoint, and no reply is promised.']},
  'starter-smoke':{usage:'starter-smoke --package <reviewed-package-dir> --dir <new-notes-dir>',
    summary:'Run the pinned provider smoke check on a new notes root.',probe:['help','starter-smoke']},
};
export const COMMAND_NAMES=Object.keys(COMMANDS);
export const EXIT_CODES={0:'ran; no finding; the body says what a 0 covers',1:'operation failure or refusal: see error and problem',2:'usage error: the command line was not understood',
  3:'ran, reports a finding',4:'ran, could not determine'};
export const USAGE_CODES=['UNKNOWN_COMMAND','INVALID_ARGUMENTS','MOTIF_INVALID_ARGUMENTS','STUDY_NOT_FOUND','MOTIF_NOT_FOUND','MODULE_NOT_FOUND','INVALID_TARGET'];

// A command body may carry its own process exit (3 or 4, or a stated 0). The
// exit is kept beside the body, not in it, so a body that never asked for one
// (every command but `door` and `feedback`) leaves the exit to the CLI.
const EXITS=new WeakMap();
export function withExit(body,code){EXITS.set(body,code);return body;}
export const exitOf=body=>body!==null&&typeof body==='object'?EXITS.get(body):undefined;
export const exitFields=(code,reason)=>({exit_code:code,exit_reason:reason,exit_meaning:EXIT_CODES[code]});

const STUDY_SUBS=['list','help','--help','-h','journey'];
function flagsOk(rest,required){
  if(rest.length!==required.length*2)return false;
  const seen=new Map();
  for(let i=0;i<rest.length;i+=2){
    if(!required.includes(rest[i])||seen.has(rest[i])||!rest[i+1])return false;
    seen.set(rest[i],rest[i+1]);
  }
  return true;
}
// Flags given as `--name value` pairs and bare switches, in any order. Returns
// {values, switches}, or undefined when the list does not match: a flag that
// was not named, a repeat, a missing value or a missing required flag.
export function parseFlags(rest,{required=[],optional=[],switches=[]}={}){
  const values={},on=[];
  const known=[...required,...optional,...switches];
  for(let i=0;i<rest.length;i+=1){
    const flag=rest[i];
    if(switches.includes(flag)){if(on.includes(flag))return undefined;on.push(flag);continue;}
    if(!required.includes(flag)&&!optional.includes(flag))return undefined;
    const value=rest[i+=1];
    if(Object.hasOwn(values,flag)||typeof value!=='string'||!value||known.includes(value))return undefined;
    values[flag]=value;
  }
  return required.every(flag=>Object.hasOwn(values,flag))?{values,switches:on}:undefined;
}
// Does this CLI accept this argv? `needs` names flags the caller still adds.
export function checkArgv(argv,needs=[]){
  if(!Array.isArray(argv)||!argv.length)return {ok:false,reason:'empty'};
  const full=[...argv];
  for(const need of needs??[])full.push(...String(need).split(' ').slice(0,1),'value');
  const [command,...rest]=full;
  const bad=reason=>({ok:false,reason});
  if(!COMMAND_NAMES.includes(command))return bad('unknown command');
  if(command==='help')return rest.length===0||(rest.length===1&&COMMAND_NAMES.includes(rest[0]))?{ok:true}:bad('help usage');
  if(command==='catalog'||command==='arrive')return rest.length?bad('takes no arguments'):{ok:true};
  if(command==='demo')return rest.length===0||(rest.length===1&&rest[0]==='--full')?{ok:true}:bad('demo usage');
  if(command==='explain')return rest.length===1?{ok:true}:bad('needs one module id');
  if(command==='motifs'){
    if(rest.length===0)return {ok:true};
    if(rest[0]==='study'){
      const [,sub,id]=rest;
      if(rest.length===1||(rest.length===2&&STUDY_SUBS.includes(sub)))return {ok:true};
      return rest.length===3&&['show','run'].includes(sub)&&id?{ok:true}:bad('study usage');
    }
    return rest.length===1&&!rest[0].startsWith('-')?{ok:true}:bad('motifs usage');
  }
  if(command==='invoke'){
    const [moduleId,operation,...flags]=rest;
    if(!moduleId||!operation||moduleId.startsWith('-')||operation.startsWith('-'))return bad('invoke needs a module id and an operation id');
    return flagsOk(flags,['--input'])?{ok:true}:bad('invoke flags');
  }
  if(command==='door'){
    const [op,...flags]=rest;
    if(!Object.hasOwn(DOOR_FLAGS,op??''))return bad('unknown door operation');
    return parseFlags(flags,DOOR_FLAGS[op])?{ok:true}:bad('door flags');
  }
  if(command==='feedback'){
    const [op,...flags]=rest;
    if(!Object.hasOwn(FEEDBACK_FLAGS,op??''))return bad('unknown feedback operation');
    return parseFlags(flags,FEEDBACK_FLAGS[op])?{ok:true}:bad('feedback flags');
  }
  if(command==='context'){
    const [op,...flags]=rest;
    if(!['init','status','render','handoff'].includes(op))return bad('unknown context operation');
    return flagsOk(flags,op==='handoff'?['--package','--dir','--input','--expect']:['--package','--dir'])?{ok:true}:bad('context flags');
  }
  return flagsOk(rest,['--package','--dir'])?{ok:true}:bad('starter-smoke flags');
}

function distance(a,b){
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let prev=row[0];row[0]=i;
    for(let j=1;j<=b.length;j++){
      const keep=row[j];
      row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
      prev=keep;
    }
  }
  return row[b.length];
}
export function nearestCommand(word){
  if(typeof word!=='string'||!word||COMMAND_NAMES.includes(word))return undefined;
  let best,score=Infinity;
  for(const name of COMMAND_NAMES){
    const d=name.startsWith(word)||word.startsWith(name)?1:distance(word,name);
    if(d<score){score=d;best=name;}
  }
  return score<=Math.max(2,Math.floor(word.length/3))?best:undefined;
}

const flagValue=(argv,flag)=>{const i=(argv??[]).indexOf(flag);return i>=0&&typeof argv[i+1]==='string'?argv[i+1]:undefined;};
const NEEDS=['--package <reviewed-package-dir>','--dir <notes-dir>'];
function contextAction(ctx,operation,why){
  const pkg=flagValue(ctx.argv,'--package'),dir=flagValue(ctx.argv,'--dir');
  return pkg&&dir?{argv:['context',operation,'--package',pkg,'--dir',dir],why}:{argv:['context',operation],why,needs:NEEDS};
}
const usesContext=ctx=>['context','starter-smoke'].includes((ctx.argv??[])[0]);
const helpInvoke={argv:['help','invoke'],why:'Read the usage of the invoke command.'};
const helpContext={argv:['help','context'],why:'Read the usage of the context command.'};
const helpFeedback={argv:['help','feedback'],why:'Read the usage of the feedback command and its input rules.'};
const printBlank={argv:['feedback','new'],why:'Print the blank entry instead; that writes nothing.'};
const moduleAction=(error,ctx)=>ctx.moduleIds?.includes(error.module)?
  {argv:['explain',error.module],why:'Read what this module declares it does and refuses.'}:
  {argv:['catalog'],why:'List the registered modules and their states.'};

const REFUSALS={
  write_conflict:{text:'The handoff file changed since the hash you gave, so it was not replaced. Read the current hash, then repeat with it as --expect.',
    next:(e,c)=>contextAction(c,'status','Read the current handoff hash.')},
  already_exists:{text:'The notes root already exists and init never overwrites, so nothing was changed. Read what is there instead.',
    next:(e,c)=>contextAction(c,'status','Read the existing notes root.')},
  missing_root:{text:'The notes root does not exist, so nothing was read or written. Create it with init, or point --dir at an existing root.',
    next:(e,c)=>contextAction(c,'init','Create the notes root (never overwrites).')},
  write_locked:{text:'Another writer holds the handoff lock, so the file was not replaced. Read the current state, then try again.',retryable:true,
    next:(e,c)=>contextAction(c,'status','Read the current state before trying again.')},
  invalid_expected_hash:{text:'The --expect value is not a 64-character lowercase hex sha256, so nothing was written. Read the current hash.',
    next:(e,c)=>contextAction(c,'status','Read the current handoff hash.')},
  invalid_handoff:{text:'The text is too large for the handoff slot or has disallowed characters, so nothing was written. Shorten or clean the file and repeat.',
    next:()=>helpContext},
  unsafe_handoff:{text:'The existing handoff file is not a safe regular file, so nothing was written. This door cannot repair it; the file has to be fixed by hand.',terminal:true},
  unsafe_root:{text:(e,c)=>(c.argv??[])[1]==='handoff'?
    'The provider refused this notes root as unsafe. The handoff file was not replaced, but a lock or temporary file may remain in the notes root. Choose another root, or read the state of this one first.':
    'The provider refused this notes root as unsafe, so nothing was read or written. Choose another root.',next:()=>helpContext},
  parent_unavailable:{text:'The parent of the notes root is not usable, so no root was created. Choose a root whose parent exists.',next:()=>helpContext},
  invalid_input:{text:'The input does not match this operation’s shape, so nothing was read, written or produced.',next:moduleAction},
};
export const REFUSAL_CODES=Object.keys(REFUSALS);

const catalogAction={argv:['catalog'],why:'List the registered modules and their states.'};
const retiredOrBusy=(text,retryable=false)=>(e,c)=>({detail:text,next:[moduleAction(e,c)],retryable});
const pinWhere=m=>m?.file?`file ${m.file}${m.aspect?` (${m.aspect})`:''}`:m?.field?`field ${m.field}`:'an unrecorded point';

const TABLE={
  UNKNOWN_COMMAND:(e,c)=>{
    const word=c.word;
    const valid=[...COMMAND_NAMES];
    if(word==='wake')return {valid,detail:'That command is unknown, and this kit has no wake command: nothing here starts, resumes or rouses anything. The nearest things are reading what this door offers, and reading notes you chose to keep, if you have any. Neither is a wake.',
      next:[{argv:['arrive'],why:'Read what this door offers, in one bounded document.'},contextAction({argv:[]},'status','Read your chosen notes, if you keep any.')]};
    const near=nearestCommand(word);
    const next=[{argv:['help'],why:'List the valid commands.'}];
    if(near)next.push({argv:[...COMMANDS[near].probe],why:`Closest command: ${near}.`});
    return {valid,detail:`That command is unknown. Valid commands: ${valid.join(', ')}.${near?` The nearest is ${near}.`:''} Nothing was run.`,next};
  },
  INVALID_ARGUMENTS:(e,c)=>{
    const known=COMMAND_NAMES.includes((c.argv??[])[0])?c.argv[0]:undefined;
    const why=typeof e.reason==='string'&&Object.hasOwn(ARGUMENT_REASONS,e.reason)?`${ARGUMENT_REASONS[e.reason]} `:'';
    return {detail:`${why}The command is known but its arguments do not match its usage. Nothing was run.`,
      next:[known?{argv:['help',known],why:`Read the usage of ${known}.`}:{argv:['help'],why:'List the commands and their usage.'}]};
  },
  MOTIF_INVALID_ARGUMENTS:()=>({detail:'The motifs study arguments do not match its usage. Nothing was run.',
    next:[{argv:['motifs','study','help'],why:'Read the study commands.'}]}),
  STUDY_NOT_FOUND:(e)=>({valid:e.valid,detail:`That is not a study id.${e.valid?` Valid study ids: ${e.valid.join(', ')}.`:''} A motif id works with "motifs study show <motif-id>", which lists the studies that relate to it. Nothing was run.`,
    next:[{argv:['motifs','study'],why:'List the studies.'}]}),
  MOTIF_NOT_FOUND:(e)=>({valid:e.valid,detail:`That is not a motif id.${e.valid?` Valid motif ids: ${e.valid.join(', ')}.`:''} Nothing was run.`,
    next:[{argv:['motifs'],why:'Read the motif map.'}]}),
  MODULE_NOT_FOUND:(e,c)=>({valid:c.moduleIds,detail:`That is not a registered module id.${c.moduleIds?` Valid module ids: ${c.moduleIds.join(', ')}.`:''} Nothing was activated.`,
    next:[catalogAction]}),
  INVALID_TARGET:(e)=>{
    const why=typeof e.reason==='string'&&Object.hasOwn(TARGET_REASONS,e.reason)?TARGET_REASONS[e.reason]:TARGET_REASONS.refused_by_target_rule;
    const lift=e.liftable&&typeof e.target==='string';
    return {detail:`${why} Nothing was sent.${lift?' --allow-local-target lifts the default rule and accepts whatever else the checker accepts; the output then records that it was used. Whether to lift it is not decided by this kit.':''}`,
      next:[...(lift?[{argv:['door','plan','--origin',e.target,'--allow-local-target'],why:'Read the plan for this target with the default target rule lifted. A plan sends nothing.'}]:[]),
        {argv:['door','plan'],needs:['--origin <origin>'],why:'Read the plan for another origin. A plan sends nothing.'}]};
  },
  CHECKOUT_REQUIRED:(e)=>({detail:e.reason==='covenant_files'?
    'This command needs the covenant/0.1 directory of a full Xenia source checkout beside the kit (validate-adoption.mjs, rfc3339.mjs and the three JSON files they read), and at least one of those files is not present or could not be loaded. Nothing was read or checked.':
    'This command needs two files of a full Xenia source checkout, and at least one is not present: surface/0.1/check.mjs beside the kit, or adapters/telescope/provider/dist/target.js inside it. Nothing was sent or run.',
    next:[{argv:['help','door'],why:'Read what the door command does; reading needs only the kit.'}]}),
  BUILD_REQUIRED:(e,c)=>({detail:'This needs the compiled Xenia library and its development dependencies, which are not present. Nothing was started. From the Xenia checkout run `npm ci --ignore-scripts`, then `npm run build`, then repeat the command.',
    next:[(c.argv??[])[0]==='demo'?{argv:['catalog'],why:'Listing modules needs no build; use it while you prepare.'}:{argv:['motifs','study'],why:'Listing studies needs no build; use it while you prepare.'}]}),
  MOTIF_STUDY_UNAVAILABLE:()=>({detail:'This study is described but has no runner yet. Nothing was run.',next:[{argv:['motifs','study'],why:'List the studies.'}]}),
  MOTIF_NATIVE_CONTRACT_CHANGED:()=>({detail:'The compiled library no longer matches what this study expects, so the study stopped. It runs on synthetic input only and contacted nothing. Rebuild with `npm run build`; if it persists the study is out of date.',terminal:true}),
  MOTIF_STUDY_FAILED:()=>({detail:'The study failed unexpectedly. It runs on synthetic input only and contacted nothing outside this process.',terminal:true}),
  CLI_FAILED:(e,c)=>({detail:'An unexpected failure that this CLI has no specific code for. Whether anything changed is not known; do not repeat a write before reading the current state.',
    ...(usesContext(c)?{next:[contextAction(c,'status','Read the current notes state.')]}:{terminal:true})}),
  OPERATION_FAILED:(e,c)=>e.reason==='output_write_incomplete'?
    {detail:'The new file was created, and writing the entry to it did not finish. A partial or empty file may be at the --out path; this command did not remove it. Nothing was sent.',next:[printBlank]}:
    {detail:'The operation started and failed in a way the module did not declare. Whether it changed anything is not known. Read the current state before repeating a write.',
    ...(usesContext(c)?{next:[contextAction(c,'status','Read the current notes state.')]}:{terminal:true})},
  VERIFICATION_FAILED:(e,c)=>({detail:'The command’s operations returned, but the check afterwards did not hold. The notes may have changed; read them before trusting or repeating anything.',
    ...(usesContext(c)?{next:[contextAction(c,'status','Read the current notes state.')]}:{terminal:true})}),
  CLEANUP_FAILED:(e,c)=>({detail:'The operations returned, but removing the temporary copy of the reviewed package failed. A temporary copy may remain in the system temp directory. The notes are separate and unaffected by this step.',
    ...(usesContext(c)?{next:[contextAction(c,'status','Read the current notes state.')]}:{terminal:true})}),
  CONTEXT_ROOT_OVERLAP:()=>({detail:'The notes root is inside the provider package, or the package is inside the notes. Nothing was read, written or loaded. Choose a notes directory outside the package.',next:[helpContext]}),
  SNAPSHOT_LOCATION_OVERLAP:()=>({detail:'The system temp directory (TMPDIR) is inside the provider package or the notes root, so the checked copy of the package would be written there. Nothing was loaded, read or written. Set TMPDIR to a directory outside both and repeat.',next:[helpContext]}),
  INVALID_CONTEXT_ROOT:(e)=>({detail:e.reason==='relative_path'?
    'The notes root (--dir) must be an absolute path; a relative path would put the notes in whatever directory the command runs from. Nothing was read or written.':
    'The notes root is not a usable directory path (it must be an absolute path to a regular directory, or a new name in an existing parent). Nothing was read or written.',next:[helpContext]}),
  INVALID_INPUT:(e,c)=>{
    const why=INPUT_REASONS[e.reason];
    if((c.argv??[])[0]==='door')return {detail:`${why??'The input file is not usable.'} Nothing was checked. The input rules are in help door.`,
      next:[{argv:['help','door'],why:'Read the usage of the door command and its input rules.'}]};
    if((c.argv??[])[0]==='feedback')return {detail:`${why??'The input file is not usable.'} Nothing was checked. The input rules are in help feedback.`,next:[helpFeedback]};
    return (c.argv??[])[0]==='invoke'?
    {detail:`${why??'The input file is not usable, or is nested or large beyond the input limits.'} Nothing was run. The input rules are in help invoke.`,next:[helpInvoke]}:
    {detail:`${why??'The chosen input file or value is not usable: a missing or unsafe file, text over the size limit, not valid UTF-8, or a hash that is not 64 lowercase hex characters.'} Nothing was written.`,next:[helpContext]};
  },
  INVALID_OUTPUT:(e)=>({detail:`${typeof e.reason==='string'&&Object.hasOwn(OUTPUT_REASONS,e.reason)?OUTPUT_REASONS[e.reason]:OUTPUT_REASONS.could_not_create} Nothing was written.`,
    next:[printBlank,helpFeedback]}),
  INVALID_PROVIDER:()=>({detail:'The provider package path was not usable as given. No provider code was run.',next:[helpContext]}),
  PROVIDER_UNAVAILABLE:()=>({detail:'The provider package directory could not be read or loaded. No notes were read or changed. Check the --package path and try again.',next:[helpContext]}),
  PROVIDER_PIN_MISMATCH:(e,c)=>({detail:`The package given as --package is not the reviewed one.${c.lock?` Expected ${c.lock.name} ${c.lock.version} from ${c.lock.source}.`:''} It differed at ${pinWhere(e.mismatch)}. No provider code was run and no notes were read or changed. Supply the reviewed package.`,
    next:[helpContext]}),
  HOST_GATE_REQUIRED:(e,c)=>{
    const effects=Array.isArray(e.effects)&&e.effects.length?` (${e.effects.join(', ')})`:'';
    const dedicated=e.module==='agenttool.local-context';
    return {detail:`This operation declares effects${effects}. The invoke command has no host gate to consult, so it never runs an operation that has effects. Nothing was run.${dedicated?' The dedicated command for this module is `context`, which takes an explicit reviewed package and notes directory.':' A host that supplies its own gate can run it programmatically.'}`,
      next:[...(dedicated?[helpContext]:[]),moduleAction(e,c)]};
  },
  MODULE_NOT_BOUND:(e,c)=>({detail:'This module is described by the catalog but is not bound by this command line: it needs a provider that a programmatic host supplies. Nothing was run.',next:[moduleAction(e,c)]}),
  MODULE_EXISTS:retiredOrBusy('A module with that id is already registered. Nothing was changed.'),
  INVALID_MODULE:()=>({detail:'The module definition is not valid. Nothing was registered.',next:[catalogAction]}),
  MODULE_INACTIVE:retiredOrBusy('The module is registered but not active, so the call was not admitted. Nothing ran.'),
  OPERATION_NOT_FOUND:(e,c)=>({valid:e.valid,detail:`The module has no such operation.${e.valid?` Valid operations: ${e.valid.join(', ')}.`:''} Nothing ran.`,next:[moduleAction(e,c)]}),
  POLICY_BLOCKED:retiredOrBusy('The host gate did not allow this operation. This is an admission result, not a person’s refusal. Nothing ran.'),
  MODULE_RETIRED:()=>({detail:'This module is retired in this runtime and takes no new calls. That is complete; a later command starts a fresh runtime.',terminal:true}),
  MODULE_BUSY:retiredOrBusy('The module has calls in flight, so replacement was refused. Nothing changed. Retry after they drain.',true),
  STALE_REVISION:retiredOrBusy('The revision you named is not the current one. Nothing changed. Read the current revision and repeat.',true),
  ADMISSION_CHANGED:retiredOrBusy('The module changed state while the call was waiting for admission. Nothing ran. Read its state and repeat.',true),
  CONTRACT_MISMATCH:retiredOrBusy('The replacement does not match the declared contract or its operations, effects and refusals. Nothing changed.'),
  DECLINED:(e,c)=>{
    const r=e.refusal??{},known=REFUSALS[r.code];
    const prior=e.effect_outcome==='unknown';
    const base=known?(typeof known.text==='function'?known.text(e,c):known.text):`The operation declined before any change${r.meaning?`: ${String(r.meaning).slice(0,200)}`:''}.`;
    const lead=prior?'Earlier operations in this command had already returned, so the overall effect is unknown; the refusal itself applied no change. ':'';
    const extra=typeof r.detail==='string'&&r.detail?` Reported: ${r.detail.slice(0,200)}`:'';
    const out={detail:lead+base+extra,retryable:Boolean(known?.retryable)};
    if(known?.terminal)out.terminal=true;
    else out.next=[known?.next?known.next(e,c):moduleAction(e,c)];
    if(prior&&!known?.terminal&&usesContext(c))out.next=[contextAction(c,'status','Read the current notes state.')];
    return out;
  },
};
export const PROBLEM_CODES=Object.keys(TABLE).sort();

export function buildProblem(error,ctx={}){
  const code=typeof error?.code==='string'&&TABLE[error.code]?error.code:undefined;
  const made=code?TABLE[code](error,ctx):{detail:'An unrecognised failure code. Whether anything changed is not known.',terminal:true};
  const next=made.terminal?[]:made.next??[];
  const problem={code:code??'CLI_FAILED',detail:made.detail,terminal:next.length===0,next_actions:next,
    retryable:Boolean(made.retryable||error?.retryable)};
  if(made.valid)problem.valid=[...made.valid];
  return problem;
}

export function usageHelp(command){
  const entry=COMMANDS[command];
  if(!entry)return undefined;
  return {command,usage:entry.usage,...(entry.also?{also:[...entry.also]}:{}),summary:entry.summary,...(entry.rules?{rules:[...entry.rules]}:{}),exit_codes:EXIT_CODES,
    not_established:['that the command will succeed','that other commands are described here']};
}
