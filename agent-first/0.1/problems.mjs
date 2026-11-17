// SPDX-License-Identifier: MPL-2.0
// What the door says when it says no. Pure data and functions: no filesystem,
// network or timers. Each error code becomes a kit-local CLI `problem`. It
// borrows the meanings of Surface's problem (terminal with no next actions, or
// not terminal with at least one; retryable) but it is NOT
// xenia.surface.problem/0.1 and does not validate against
// surface/0.1/problem.schema.json: codes are UPPER_SNAKE, and a next action is
// an argv array the caller can run plus a one-line reason (`why`), not a link.
// An action with `needs` is a command prefix: the caller adds the named flags.
// Inside a `session` a problem is terminal or its next actions are requests for
// that session ({request, needs, why}), never an argv; the forms a request can
// take, and checkRequest beside checkArgv, are below.
import {compileSchema} from './schema.mjs';

// Which rule an unusable input file broke; input-file.mjs sets the `reason` key.
// does_not_match_card is about the value and not the file: the runtime sets
// it when an input does not match the schema on an operation's card. The
// collab_config_ reasons are about the config file `session --collab-config`
// names; the Collab adapter sets them, with `pointer` naming the key at fault.
export const INPUT_REASONS=Object.freeze({
  missing:'The input file is missing (no file at that path).',
  not_regular_file:'The input path is not a regular file (a directory or special file).',
  symbolic_link:'The input path is a symbolic link; this reader never follows links.',
  unreadable:'The input file could not be read.',
  too_large:'The input file is over its size limit (1 MiB for invoke and for feedback check, 16 KiB for a handoff, 2,000,000 bytes for door rights, 16384 bytes for a Collab config).',
  not_utf8:'The input file is not valid UTF-8.',
  byte_order_mark:'The input file starts with a byte-order mark; remove it.',
  not_json:'The input file is not exactly one JSON value.',
  duplicate_key:'An object in the input file repeats a key.',
  beyond_limits:'The input is nested or large beyond the input limits (32 levels deep, 65536 values, 1 MiB).',
  not_an_adoption_record:'The input file is JSON, but it does not say it is a Covenant adoption record: it is not an object whose schema_version begins with xenia.covenant.adoption/.',
  does_not_match_card:'The input is JSON data, but it does not match the schema on the operation\'s card.',
  collab_config_does_not_match:'The Collab config is JSON, but it is not the config form: one object with the keys bundlePath, bunPath, databasePath, homeDir, workspace, actor and journal, optionally timeoutMs, and no others.',
  collab_config_path_not_absolute:'A path in the Collab config is not an absolute path in its plain form: no `.` or `..` part, no doubled or trailing separator, no control character.',
  collab_config_home_is_user_home:'homeDir in the Collab config is this user\'s home directory, or a folder that holds it, compared as folders (device and inode) as well as by spelling. It becomes the backend\'s HOME, so it has to be a folder of its own.',
  collab_config_workspace_not_apart:'The workspace in the Collab config is not apart from homeDir and from the folder of databasePath: one of them is the other, inside it or around it, compared as folders (device and inode) as well as by spelling.',
  collab_config_too_long:'The paths and the actor in the Collab config are too long together: written as JSON, what a session shows of a binding must fit in 2560 bytes.',
});
// The keys a Collab config has. A refusal names one of these and nothing the config held.
const COLLAB_CONFIG_KEYS=Object.freeze(['bundlePath','bunPath','databasePath','homeDir','workspace','actor','journal','timeoutMs']);

// Why a module definition was refused for its card; the runtime sets the `reason` key.
export const MODULE_REASONS=Object.freeze({
  input_schema_not_usable:'An operation\'s input schema is not usable: it is not bounded JSON data, or it holds something this kit\'s checker does not read. When the checker refused it, error.schema_refusal says why and where in the schema.',
  input_example_does_not_match_schema:'An operation\'s input example does not match its own input schema; error.pointer, error.keyword and error.expected say where.',
  binding_not_usable:'A binding handed to a session is not usable. It is {module, look, close, deadlines, at_end, bound_to} and nothing else: look and close are functions when given; deadlines gives a whole number of milliseconds from 1 to 30000 for operations the module has; at_end is at most 8 lines of 1 to 512 characters; bound_to is a JSON object of at most 2560 bytes.',
  collab_card_not_usable:'The Collab adapter\'s card or pin does not match the adapter\'s code: card.json and index.mjs in agent-first/0.1/adapters/agenttool-collab, or the `collab` entry of agent-first/0.1/agenttool.lock.json. The module was not made.',
  module_view_over_limit:'A module is too large for the session to describe in one inspect line of 8192 bytes: its title, description, contract, source, version or operation descriptions are too long, or what its binding says it is bound to is.',
  session_start_over_limit:'The modules of this session cannot be listed within the 8192 bytes of its first line.',
  session_has_no_module:'A session needs at least one module.',
});

// Which argument of a known command could not be read. What was typed is never
// copied into the output.
export const ARGUMENT_REASONS=Object.freeze({
  as_of_not_rfc3339:'--as-of must be an RFC 3339 date-time with a real calendar date and Z or an offset, at most 40 characters, for example 2026-11-13T00:00:00Z.',
  origin_not_an_origin:'--origin must be a plain HTTP(S) origin: a scheme and a host, with no user name, password, path, query or fragment.',
  max_requests_out_of_range:'--max-requests must be a whole number from 1 to 66, written in digits only, for example 1.',
  total_timeout_ms_out_of_range:'--total-timeout-ms must be a whole number of milliseconds from 100 to 120000, written in digits only, for example 5000.',
  required_flag_missing:'A flag this command requires was not given.',
  allow_entry_not_readable:'Each --allow entry must be <module-id>:<operation-id>, in the lower-case form module and operation ids have, with entries separated by commas.',
  allow_names_no_effect_declaring_operation:'An --allow entry names no operation in this session that declares effects. Only such an operation is gated, so only such an operation can be named.',
  end_ms_out_of_range:'The end limit a host gives a session must be a whole number of milliseconds from 1 to 15000.',
  collab_config_not_absolute:'--collab-config must be the absolute path of the config file; a relative path would be read from whatever directory the command runs from.',
});

// Why a line sent to a session was not run; the session sets the `reason` key.
// The line itself is never copied into the output. With does_not_match_request
// the error also carries pointer, keyword and expected, read from the request
// form; none of the three repeats anything the line held.
export const REQUEST_REASONS=Object.freeze({
  line_too_long:'The line is longer than 1 MiB (1048576 bytes) and was discarded unread.',
  not_utf8:'The line is not valid UTF-8.',
  byte_order_mark:'The line starts with a byte-order mark; remove it.',
  not_json:'The line is not exactly one JSON value.',
  duplicate_key:'An object in the line repeats a key.',
  does_not_match_request:'The line is JSON, but it does not match the request form of its method.',
  operation_needs_module:'An inspect request that names an operation must name its module too.',
  resume_needs_paused:'resume reopens a paused module only, and this module is not paused.',
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

// Which rule refused a `door` target. `reason` is always one of these keys. A
// user name, password, path, query or fragment given on the command line is
// never copied into the output. When the default rule refused the target, its
// origin (scheme, host and port, as the checker normalised them) appears in
// the suggested `door plan` command, and nowhere else.
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
export const NETWORK_NOTE='`door check` is the only command in which this kit\'s own code sends network requests; provider code run by `context` and `starter-smoke`, and the backend process `session --collab-config` can start, are not observed by this kit, which speaks to that backend over stdio only.';

// What an operation's card is and who checks an input. Used word for word in
// catalog, explain, help and the README.
export const CARD_NOTE='An operation\'s card is its `input` (a summary; an example or the path of one; and a schema, when the module declares one), its `returns` (a summary) and its `refusals`. `input_checked_by` says who checks the input: `runtime` means the runtime holds the input to `input.schema` before the host gate is asked and before the handler runs; `handler` means the runtime checks only that the input is bounded JSON data, and the handler checks the rest. Nothing checks a returned value against `returns`.';

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

// The flags `session` takes; checkArgv and session.mjs both read this.
export const SESSION_FLAGS=Object.freeze({optional:['--allow','--collab-config']});

// The request forms of a session: one closed schema per method, in the small
// reading of JSON Schema that schema.mjs checks. `input` is not in the invoke
// form: it is any JSON value, taken out before the form is checked and left
// to the operation's card. An id is repeated on the response, so it is held
// to a short plain alphabet; a module or operation name is held to the form
// the runtime gives ids.
const REQUEST_ID={type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9._:-]+$'};
const REQUEST_NAME={type:'string',minLength:1,maxLength:80,pattern:'^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'};
const requestForm=(method,required,more={})=>({type:'object',additionalProperties:false,required:['id','method',...required],
  properties:{id:REQUEST_ID,method:{type:'string',enum:[method]},...more}});
export const REQUEST_SCHEMAS=frozen({
  inspect:requestForm('inspect',[],{module:REQUEST_NAME,operation:REQUEST_NAME}),
  activate:requestForm('activate',['module'],{module:REQUEST_NAME}),
  invoke:requestForm('invoke',['module','operation'],{module:REQUEST_NAME,operation:REQUEST_NAME,deadline_ms:{type:'integer',minimum:1,maximum:30000}}),
  pause:requestForm('pause',['module'],{module:REQUEST_NAME}),
  resume:requestForm('resume',['module'],{module:REQUEST_NAME}),
  retire:requestForm('retire',['module'],{module:REQUEST_NAME}),
});
export const REQUEST_METHODS=Object.freeze(Object.keys(REQUEST_SCHEMAS));
const REQUEST_CHECKS=Object.fromEntries(REQUEST_METHODS.map(method=>[method,compileSchema(REQUEST_SCHEMAS[method]).check]));
const idMiss=compileSchema(REQUEST_ID).check,nameMiss=compileSchema(REQUEST_NAME).check,methodMiss=compileSchema({type:'string',enum:[...REQUEST_METHODS]}).check;
const REQUEST_FILL={id:'id',module:'module',operation:'operation',input:null,deadline_ms:1};
// Does a session accept this request? `needs` names the fields the sender
// still adds (a suggested request leaves out `id`). Returns {ok: true, id,
// method}, or {ok: false, id, method} with a `reason` or with the first miss
// {pointer, keyword, expected}. `id` is the request's own id when that is
// usable, and null when it is not; nothing else of the request is returned.
export function checkRequest(request,needs=[]){
  if(request===null||typeof request!=='object'||Array.isArray(request))return {ok:false,id:null,pointer:'',keyword:'type',expected:'object'};
  const full={...request};
  for(const need of needs??[])if(Object.hasOwn(REQUEST_FILL,need)&&!Object.hasOwn(full,need))full[need]=REQUEST_FILL[need];
  if(!Object.hasOwn(full,'id'))return {ok:false,id:null,pointer:'',keyword:'required',expected:'id'};
  const id=idMiss(full.id)?null:full.id;
  if(!Object.hasOwn(full,'method'))return {ok:false,id,pointer:'',keyword:'required',expected:'method'};
  const unknown=methodMiss(full.method);
  if(unknown)return {ok:false,id,pointer:'/method',keyword:unknown.keyword,expected:unknown.expected};
  const method=full.method;
  const form={...full};
  if(method==='invoke')delete form.input;
  const miss=REQUEST_CHECKS[method](form);
  if(miss){
    // The invoke form is checked without `input`, so the names it accepts are the form's own and `input`.
    const expected=method==='invoke'&&miss.pointer===''&&miss.keyword==='additionalProperties'?[...miss.expected,'input']:miss.expected;
    return {ok:false,id,method,pointer:miss.pointer,keyword:miss.keyword,expected};
  }
  if(method==='inspect'&&Object.hasOwn(full,'operation')&&!Object.hasOwn(full,'module'))return {ok:false,id,method,reason:'operation_needs_module'};
  return {ok:true,id,method};
}

export const COMMANDS={
  arrive:{usage:'arrive',summary:'Read one bounded orientation document. Expects no reply; activates nothing.',probe:['arrive']},
  help:{usage:'help [command]',summary:'Show this help, or the usage of one command. Words after the command name are not read: `help door plan` gives the usage of `door`, which covers each of its operations.',probe:['help']},
  motifs:{usage:'motifs [motif-id]',summary:'Read the motif map, or one motif card.',probe:['motifs']},
  catalog:{usage:'catalog',summary:'List the registered modules, each operation with its card (what to send, what comes back, who checks the input), and the adapters. Activates nothing.',probe:['catalog']},
  explain:{usage:'explain <module-id>',summary:'Describe one module: each operation\'s card (what to send, an example, what comes back, who checks the input) and the refusals it declares.',probe:['explain','xenia.surface']},
  demo:{usage:'demo [--full]',summary:'Run the local reference tools; a step list by default, complete bodies with --full. Needs the Xenia build.',probe:['demo']},
  invoke:{usage:'invoke <module-id> <operation-id> --input <file>',
    summary:'Register, activate, invoke once and retire a core module in this process, with your JSON file as input; prints a receipt. Only operations that declare no effects run here.',probe:['help','invoke'],
    rules:['The input file must be a regular file, not a symbolic link, at most 1 MiB.','It must be valid UTF-8 with no byte-order mark, exactly one JSON value, with no repeated object key.','Nesting is limited to 32 levels and 65536 values.','`explain <module-id>` shows an input example for each module; a path in example_ref is relative to the repository root.',
      'When an operation\'s card carries a schema, the runtime holds the input to it before anything runs. A miss is INVALID_INPUT with reason does_not_match_card, a JSON pointer to the place in the input, the schema keyword that missed and what the card expected; nothing from the input is repeated. The three core operations carry no schema: their native functions check the input. The Surface and Covenant functions answer an input they do not accept with DECLINED invalid_input, and the Work checker returns a report with valid false.']},
  session:{usage:'session [--allow <module:operation,...>] [--collab-config <absolute-file>]',
    summary:'Open one process that reads requests as JSON lines on standard input and answers each with one JSON line: inspect, activate, invoke, pause, resume and retire, on the modules this kit registers and, with --collab-config, on the Collab adapter. Nothing is activated at the start.',probe:['help','session'],
    rules:['Every line this command prints is one compact JSON object, and stderr is silent. The first line is session_start (at most 8192 bytes): the modules and their states, each operation with its declared effects and whether the gate will let it run, one request form per method with an example, the limits, and what the line does not establish. The last line is session_end. A session that could not start prints one line, session_not_started, with error and problem, and reads nothing. `session --help` is answered as `help session`, which is a help document and not a session line.',
      'A request is one line: {id, method, module, operation, input, deadline_ms}. id is a string of 1 to 128 of A-Z a-z 0-9 . _ : - and is repeated on the response. The methods are inspect, activate, invoke, pause, resume (from paused only) and retire; each has one closed form, and a field the form does not name is refused. `input` is any JSON value: the operation\'s card says what, and the runtime or the handler checks it. No request registers or upgrades a module.',
      'Requests are run one at a time, in input order. Each line that is not blank gets one response: {id, line, ok, method, receipt, state}, then {outcome: "returned", result} or {error, problem}, then not_established. `line` counts input lines from 1. The receipt names the module (id, version, contract, revision), the operation, its declared effects, the deadline, and the bytes and sha256 of the request line. A returned value that is not JSON data, or is beyond the input limits, is still `returned`, with result {included: false, reason}.',
      'A line that is not a usable request is answered INVALID_REQUEST with a reason, or with a pointer, a keyword and what the form expects there; the line itself is never repeated. A line over 1 MiB (1048576 bytes) is discarded unread and answered the same way. A blank line is counted and not answered.',
      'The gate is default-deny. An operation that declares no effects is not gated; one that declares effects runs only when --allow names it, as <module-id>:<operation-id>, with entries separated by commas. The list is fixed at the start, and an entry that names no operation declaring effects refuses the start. The three core operations declare no effects, so without --collab-config --allow has nothing to name.',
      '--collab-config <absolute-file> binds one more module, agenttool.collab: tasks, claims, reports and an event page in one AgentTool Collab journal on this device, through a backend process that its `open` operation starts. The file is a regular file of at most 16384 bytes, valid UTF-8, one JSON object with no repeated key, and it names every path; `explain agenttool.collab` lists its keys. Which bundle may run is not the caller\'s to state: the pin in agent-first/0.1/agenttool.lock.json names it by sha256, and `open` compares the file with the pin before anything is copied or started. Binding starts nothing and writes nothing. Every operation of the module declares effects, so each runs only when --allow names it.',
      'A bound module shows more. Its row in session_start has `at_end`: the writes its end makes without asking the gate. For agenttool.collab these are the release of each claim the binding still holds and the end of its native session, and only when the backend is still running and no call has an outcome that is unknown or still pending. `inspect` of the module adds `look`, what the binding holds in memory (the step open reached, whether the backend process was running when last asked, calls whose outcome is unknown, claims, the last page read), and `bound_to`: the paths and the actor from the config, and the sha256 of the config file.',
      'What agenttool.collab answers when the backend refuses: DECLINED, with the effect not_applied, only for the codes the operation\'s card lists. Which codes those are was read in the text of the pinned bundle, place by place, and never observed; `explain agenttool.collab` shows the places under backend_refusals and backend_reading. Any other failed write is OPERATION_FAILED with an unknown effect. A write whose outcome is not known is never sent again, and the binding then sends no more writes; status, task-get and inspect stay available while the backend runs.',
      'A call has a deadline: 10 seconds, unless the request sets deadline_ms (1 to 30000) or a bound module states another default for the operation. At the deadline the call is answered DEADLINE_EXCEEDED: it had started, and whether it changed anything is not known. The deadline ends the wait; it does not stop the handler, which runs on. `inspect` lists such calls under `late` with how each settled (pending, returned, declined, failed), and no late result is kept. The deadline is a timer in the same process: a handler that keeps the process busy without yielding is answered only when it lets go.',
      'Inside a session a problem is terminal, or its next_actions are requests for the same session ({request, needs, why}) and never a command line. `needs: ["id"]` means the sender adds an id.',
      'Without the Xenia build, a call to xenia.surface or xenia.work is answered BUILD_REQUIRED before anything starts; session_start shows `build` for each module.',
      'The session ends when its input ends: the lines already read are answered first. SIGINT, SIGTERM or SIGHUP ends it too: the call in flight is answered, lines read but not started are answered SESSION_ENDING, and nothing more is read. An output that stops taking lines ends it at once, and nothing more is started. Then every module is retired, each binding is closed once, and calls still running are waited for, within 15 seconds in all. session_end gives each module\'s state, the calls still running, and cleanup {complete, did, did_not, left_behind}. An error thrown outside any call ends the session the same way, with ended_by uncaught_error and exit 1.',
      'The exit is 0 only when that end was complete; 1 when it was not, when the output stopped taking lines, when a module could not be registered, or when the file --collab-config names could not be used; 2 when the command line was not understood, an --allow entry could not be used, or --collab-config was not an absolute path. A request that failed does not change the exit: its own line says how it went.']},
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
      'The origin is a scheme and a host only. By default it must use HTTPS, a DNS name and port 443, and not a local or reserved name. --allow-local-target accepts whatever else the checker accepts, and the output records that it was used, which default rule it set aside, and, for an IP address, whether the address is in a loopback, private, link-local or reserved range.',
      'A refused target is sent nothing. A user name, password, path, query or fragment is never copied into the output; when the default rule refused the target, its origin (scheme, host and port) appears in the suggested `door plan` command.',
      '--full adds the checker\'s whole result. Without it the output gives only that result\'s size and sha256.',
      'Exit 0, 3 or 4 follows the checker\'s own word; the output says what each covers. A check reports what one User-Agent was served on these requests, and nothing wider.',
      'A check whose request was not sent because the budget was used up is counted and not listed. When a valid manifest was read and the budget was smaller than a full check needs, `next` gives the `door check` command with that number.',
      '`door rights` reads one local file as a Covenant 0.1 adoption record and sends nothing. It reports which release the record pins, whether it raises issues under the rules installed in this checkout, and which of its evidence had expired at --as-of (an RFC 3339 time; without it, the clock). It verifies nothing the record says: a record that agrees with itself is not evidence of practice.',
      'The file for `door rights` must be a regular file, not a symbolic link, at most 2,000,000 bytes, valid UTF-8 with no byte-order mark, one JSON value with no repeated key, and an object whose schema_version begins with xenia.covenant.adoption/. Values from the record are shown only as a listed word, a timestamp or an origin.',
      '`door rights` exits 0 when the record pins the installed bytes, raises no issue, and no row it gives as pass rests on evidence expired at --as-of; 3 when it pins the installed bytes and raises an issue, or such a row rests on expired evidence; 4 when it pins other bytes, when the JSON Schema check was not run and the other check raised nothing, or when neither check finished. Each of the two checks keeps at most 256 issues, and --full lists them. --origin only compares the origin the record names with the one given.',
      'The JSON Schema check is not run on a record that holds an array longer than the installed schema allows for any array. Observe\'s inspection (the JSON Schema check, then the other check) and the other check run by itself have the same time limit: each is stopped after 5 seconds and reported as not_run with a reason. `finding.also` and the exit reason carry what the exit does not: a status other than active, an --as-of earlier than the review, another origin, passes on expired evidence.',
      'The file `invoke xenia.covenant draft` prints is a receipt, not a record: the record is its `result`, saved to a file of its own.']},
  feedback:{usage:'feedback new [--out <absolute-new-file>]',
    also:['feedback check --input <file>'],
    summary:'Write a report in the form AGENT-FEEDBACK.md describes, offline. `new` prints a blank entry, or writes it to one new file; `check` reads an entry from a local file and says which labelled parts it found. Neither sends or delivers anything.',probe:['help','feedback'],
    rules:['Both commands send nothing and deliver nothing, and read no clock. `feedback new` takes no input file; `feedback check` reads the one file named and, when it is there, AGENT-FEEDBACK.md in this checkout, to see whether the Entry ID is already in it.',
      '`feedback new` prints the blank entry inside its JSON document, as entry.text. With --out it writes the entry to that path instead. The path must be absolute, must not end with a path separator, and nothing may be there yet: the file is created only when nothing is at the path, and an existing file is never overwritten.',
      '`feedback check` exits 0 when it finds a dated heading (`## YYYY-MM-DD: ...`), an Entry ID in the form xenia-feedback-YYYYMMDD-label-NNN, Observed at starting with a date, Speaker (any text; the notebook allows anonymous reports), Status, and at least one `###` section with text; 3 when one of these is not found; 4 when the file has more than one dated heading, or a dated heading beside a level-two heading that begins with a date that does not exist. A 0 says those parts are there, and nothing about what they say.',
      'The notebook does not require this form. The labels that answer its eight bullets are reported as found, empty or not_found_by_label, and never change the exit.',
      'The file for `feedback check` must be a regular file, not a symbolic link, at most 1 MiB, valid UTF-8 with no byte-order mark. It is read line by line, not parsed as Markdown. An HTML comment is not read as content. A `<!--` begins one when it closes on its own line; when it is at the start of a line and closes on a later one; or when it closes on a later line before any blank line, heading, list item or code fence. Any other `<!--` is read as text, and nothing in a fenced code block is a comment.',
      'Warnings give a kind and a line number, never the text: a few fixed patterns that look like a credential or a local path, on the first 2,000 characters of each line, and five kinds about how the file was read. They do not change the exit, and finding none is not a finding that there are none.',
      'Where a report can go is printed as `route` by both commands and as `report` by `arrive`: a pull request, an issue, handing the note over, or nowhere. There is no endpoint, and no reply is promised.']},
  'starter-smoke':{usage:'starter-smoke --package <reviewed-package-dir> --dir <new-notes-dir>',
    summary:'Run the pinned provider smoke check on a new notes root.',probe:['help','starter-smoke']},
};
export const COMMAND_NAMES=Object.keys(COMMANDS);
export const EXIT_CODES={0:'ran; no finding (a `door` or `feedback` body says what its 0 covers)',1:'operation failure or refusal: see error and problem',2:'usage error: the command line was not understood',
  3:'ran, reports a finding',4:'ran, could not determine'};
export const USAGE_CODES=['UNKNOWN_COMMAND','INVALID_ARGUMENTS','MOTIF_INVALID_ARGUMENTS','STUDY_NOT_FOUND','MOTIF_NOT_FOUND','MODULE_NOT_FOUND','INVALID_TARGET'];

// A command body may carry its own process exit (3 or 4, or a stated 0). The
// exit is kept beside the body, not in it, so a body that never asked for one
// (every command but `door` and `feedback`) leaves the exit to the CLI.
const EXITS=new WeakMap();
export function withExit(body,code){EXITS.set(body,code);return body;}
export const exitOf=body=>body!==null&&typeof body==='object'?EXITS.get(body):undefined;
export const exitFields=(code,reason)=>({exit_code:code,exit_reason:reason,exit_meaning:EXIT_CODES[code]});
// A command that wrote its own output (`session` writes JSON lines as it goes)
// marks what it returns, so the CLI prints nothing more for it.
const WRITTEN=new WeakSet();
export function asWritten(body){WRITTEN.add(body);return body;}
export const wasWritten=body=>body!==null&&typeof body==='object'&&WRITTEN.has(body);

// Every flag a `door` or `feedback` operation requires. A missing one is named in the refusal.
const REQUIRED_FLAGS=[...new Set([...Object.values(DOOR_FLAGS),...Object.values(FEEDBACK_FLAGS)].flatMap(spec=>spec.required??[]))];
// The required flags of `spec` that `rest` does not hold at all, or undefined when none is missing.
export function missingFlags(rest,spec){
  const missing=(spec.required??[]).filter(flag=>!rest.includes(flag));
  return missing.length?missing:undefined;
}
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
  // Words after a command name are not read: `help door plan` is `help door`.
  if(command==='help')return rest.length===0||COMMAND_NAMES.includes(rest[0])?{ok:true}:bad('help usage');
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
  if(command==='session')return parseFlags(rest,SESSION_FLAGS)?{ok:true}:bad('session flags');
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
const helpSession={argv:['help','session'],why:'Read how a session works and what its lines mean.'};
// The one adapter the `session` command can bind (with --collab-config). A refusal about it points there.
const SESSION_BOUND='agenttool.collab';
const explainCollab={argv:['explain',SESSION_BOUND],why:'Read the keys of the config file, and what each operation of the module does and refuses.'};
const moduleAction=(error,ctx)=>ctx.moduleIds?.includes(error.module)?
  {argv:['explain',error.module],why:'Read what this module declares it does and refuses.'}:
  {argv:['catalog'],why:'List the registered modules and their states.'};
const cardAction=(error,ctx)=>ctx.moduleIds?.includes(error.module)?
  {argv:['explain',error.module],why:'Read the operation\'s card: what to send, an example, and the schema the input is held to.'}:
  {argv:['catalog'],why:'List the registered modules, each operation with its card.'};

// What a problem's detail keeps of a refusal's meaning, which is the card's own text and can be 512 characters long:
// its whole sentences, as many as fit in 200 characters, and never half of one. When the first sentence alone does
// not fit, its first 199 characters and a mark. Whenever something is left out the detail says where the whole is;
// the meaning itself is always on the same output, as error.refusal.meaning. A full stop inside a name
// (agenttool.lock.json) is not the end of a sentence: only one that is followed by a space is.
// The lead is a declaration, not an observation: that nothing was applied is what the module declares (effect
// not_applied), and the runtime did not observe it.
function declinedWords(meaning){
  if(typeof meaning!=='string'||!meaning)return 'The operation declined, and its module declares that nothing was applied.';
  const lead='The operation declined, and its module declares that nothing was applied: ';
  if(meaning.length<=200)return `${lead}${meaning.replace(/\.$/,'')}.`;
  const ends=[...meaning.slice(0,200).matchAll(/[.!?](?= )/g)].map(match=>match.index+1);
  const kept=ends.length?meaning.slice(0,ends.at(-1)):`${meaning.slice(0,199)}…`;
  return `${lead}${kept} The whole meaning is in error.refusal.meaning.`;
}
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
    // Only a flag one of these commands defines is named; anything else in `missing` is dropped, so nothing typed is repeated.
    const missing=e.reason==='required_flag_missing'&&Array.isArray(e.missing)?e.missing.filter(flag=>REQUIRED_FLAGS.includes(flag)):[];
    const why=typeof e.reason==='string'&&Object.hasOwn(ARGUMENT_REASONS,e.reason)?`${ARGUMENT_REASONS[e.reason]} `:'';
    // An --allow entry is named by its place in the list, never by its text; the operations it could name are the session's own words.
    const entry=Number.isInteger(e.entry)?`It is entry ${e.entry} of the list. `:'';
    const nameable=e.reason==='allow_names_no_effect_declaring_operation'&&Array.isArray(e.valid)?e.valid.filter(name=>typeof name==='string'):undefined;
    const names=!nameable?'':nameable.length?`Operations that declare effects here: ${nameable.slice(0,8).join(', ')}${nameable.length>8?`, and ${nameable.length-8} more (all are in valid)`:''}. `:
      'No operation in this session declares effects, so --allow has nothing to name. ';
    return {detail:`${why}${entry}${names}${missing.length?`Missing: ${missing.join(', ')}. `:''}The command is known but its arguments do not match its usage. Nothing was run.`,
      ...(missing.length?{missing}:{}),...(nameable?{valid:nameable}:{}),
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
    return {detail:`${why} Nothing was sent.${lift?' --allow-local-target lifts the default rule and accepts whatever else the checker accepts; the output then records that it was used. Whether to lift it is not decided by this kit. The second next action repeats the target\'s origin (scheme, host and port); nothing else that was typed is copied here.':''}`,
      next:[{argv:['door','plan'],needs:['--origin <origin>'],why:'Read the plan for another origin. A plan sends nothing.'},
        ...(lift?[{argv:['door','plan','--origin',e.target,'--allow-local-target'],why:'Read the plan for this target with the default target rule lifted. A plan sends nothing; it says which rule was set aside and, for an IP address, what kind of address it is.'}]:[])]};
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
    if(e.reason==='does_not_match_card'){
      // The pointer holds only names the card declares, and the keyword is the card's; neither is the caller's text.
      const at=typeof e.pointer!=='string'?'a place that was not recorded':e.pointer===''?'the top of the input':e.pointer.slice(0,200);
      const keyword=typeof e.keyword==='string'?`, keyword ${e.keyword.slice(0,40)}`:'';
      return {detail:`${INPUT_REASONS.does_not_match_card} The first miss is at ${at}${keyword}; error.expected is the card's own word for it. Nothing was run, and the host gate was not asked.`,
        next:[cardAction(e,c)]};
    }
    const why=INPUT_REASONS[e.reason];
    if((c.argv??[])[0]==='session'){
      // The file --collab-config names. A key is named only when it is one the config form has; nothing the file held is repeated.
      const key=typeof e.pointer==='string'&&COLLAB_CONFIG_KEYS.includes(e.pointer.slice(1))?e.pointer.slice(1):undefined;
      const where=e.reason==='collab_config_does_not_match'?` ${key?`The miss is at the key ${key}`:'The miss is at the top of the config'}${typeof e.keyword==='string'?`, keyword ${e.keyword.slice(0,40)}`:''}; error.expected is what the form allows there.`:key?` The key is ${key}.`:'';
      return {detail:`${why??'The config file is not usable.'}${where} This is about the file --collab-config names. No session was started, and nothing was copied, started or written.`,next:[helpSession,explainCollab]};
    }
    if((c.argv??[])[0]==='door')return {detail:`${why??'The input file is not usable.'}${e.reason==='not_an_adoption_record'&&e.holds==='record_in_receipt_result'?
      ' This file is a receipt printed by `invoke`, and its `result` says it is an adoption record: save that `result` to a file of its own and give that file.':''} Nothing was checked. The input rules are in help door.`,
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
    const dedicated=e.module==='agenttool.local-context',door=e.module===SESSION_BOUND;
    return {detail:`This operation declares effects${effects}. The invoke command has no host gate to consult, so it never runs an operation that has effects. Nothing was run.${dedicated?' The dedicated command for this module is `context`, which takes an explicit reviewed package and notes directory.':
      door?' The `session` command has a gate, and binds this module when it is given --collab-config <absolute-file>.':' A host that supplies its own gate can run it programmatically.'}`,
      next:[...(dedicated?[helpContext]:[]),...(door?[helpSession]:[]),moduleAction(e,c)]};
  },
  MODULE_NOT_BOUND:(e,c)=>e.module===SESSION_BOUND?
    {detail:'This module is described by the catalog but is not bound by this command line. The `session` command binds it when it is given --collab-config <absolute-file>. Nothing was run.',next:[helpSession,moduleAction(e,c)]}:
    {detail:'This module is described by the catalog but is not bound by this command line: it needs a provider that a programmatic host supplies. Nothing was run.',next:[moduleAction(e,c)]},
  MODULE_EXISTS:retiredOrBusy('A module with that id is already registered. Nothing was changed.'),
  INVALID_MODULE:(e,c)=>({detail:`${typeof e.reason==='string'&&Object.hasOwn(MODULE_REASONS,e.reason)?MODULE_REASONS[e.reason]:'The module definition is not valid.'} ${(c.argv??[])[0]==='session'?'No session was started.':'Nothing was registered.'}`,
    next:[...((c.argv??[])[0]==='session'?[helpSession]:[]),catalogAction]}),
  MODULE_INACTIVE:retiredOrBusy('The module is registered but not active, so the call was not admitted. Nothing ran.'),
  OPERATION_NOT_FOUND:(e,c)=>({valid:e.valid,detail:`The module has no such operation.${e.valid?` Valid operations: ${e.valid.join(', ')}.`:''} Nothing ran.`,next:[moduleAction(e,c)]}),
  POLICY_BLOCKED:retiredOrBusy('The host gate did not allow this operation. This is an admission result, not a person’s refusal. Nothing ran.'),
  MODULE_RETIRED:()=>({detail:'This module is retired in this runtime and takes no new calls. That is complete; a later command starts a fresh runtime.',terminal:true}),
  MODULE_BUSY:retiredOrBusy('The module has calls in flight, so replacement was refused. Nothing changed. Retry after they drain.',true),
  STALE_REVISION:retiredOrBusy('The revision you named is not the current one. Nothing changed. Read the current revision and repeat.',true),
  ADMISSION_CHANGED:retiredOrBusy('The module changed state while the call was waiting for admission. Nothing ran. Read its state and repeat.',true),
  CONTRACT_MISMATCH:retiredOrBusy('The replacement does not match the declared contract or its operations, effects, refusals and cards (input summary, input schema, what each returns). Nothing changed.'),
  DECLINED:(e,c)=>{
    const r=e.refusal??{},known=REFUSALS[r.code];
    const prior=e.effect_outcome==='unknown';
    const base=known?(typeof known.text==='function'?known.text(e,c):known.text):declinedWords(r.meaning);
    const lead=prior?'Earlier operations in this command had already returned, so the overall effect is unknown; the refusal itself applied no change. ':'';
    const extra=typeof r.detail==='string'&&r.detail?` Reported: ${r.detail.slice(0,200)}`:'';
    const out={detail:lead+base+extra,retryable:Boolean(known?.retryable)};
    if(known?.terminal)out.terminal=true;
    else out.next=[known?.next?known.next(e,c):moduleAction(e,c)];
    if(prior&&!known?.terminal&&usesContext(c))out.next=[contextAction(c,'status','Read the current notes state.')];
    return out;
  },
  // The three codes only a session produces. Outside one they point at its help; inside one, SESSION_TABLE below answers.
  INVALID_REQUEST:()=>({detail:'A line sent to a session was not a usable request, and was not run. Inside the session the response says which rule the line broke.',next:[helpSession]}),
  DEADLINE_EXCEEDED:()=>({detail:'A call in a session did not answer within its deadline. It had started, and its handler was not stopped; whether anything changed is not known.',next:[helpSession]}),
  SESSION_ENDING:()=>({detail:'A session was closed to new requests before a line was started, so the line was not run.',next:[helpSession]}),
};
export const PROBLEM_CODES=Object.keys(TABLE).sort();

// ---- Inside a session ----
// A session answers on a line, so what it suggests next is a request for the
// same session, never a command line: {request, needs, why}. A suggested
// request leaves out `id`; `needs` says the sender adds one. A request names
// a module only when that module is in the session (ctx.moduleIds), so a name
// that was sent is not handed back as advice.
const ask=(request,why)=>({request,needs:['id'],why});
const askSession=why=>ask({method:'inspect'},why);
const inSession=(e,c)=>typeof e.module==='string'&&Array.isArray(c.moduleIds)&&c.moduleIds.includes(e.module);
const askModule=(e,c,why)=>inSession(e,c)?ask({method:'inspect',module:e.module},why):askSession('List the modules in this session and their states.');
const askCard=(e,c,why)=>inSession(e,c)&&typeof e.operation==='string'&&!nameMiss(e.operation)?ask({method:'inspect',module:e.module,operation:e.operation},why):
  askModule(e,c,'Read the module and its operations.');
const SESSION_TABLE={
  INVALID_REQUEST:(e,c)=>{
    const why=typeof e.reason==='string'&&Object.hasOwn(REQUEST_REASONS,e.reason)?REQUEST_REASONS[e.reason]:'The line is not a usable request.';
    let where='';
    if(e.reason==='does_not_match_request'){
      // The pointer holds only names the request form declares, and the keyword is the form's; neither is the sender's text.
      const at=typeof e.pointer!=='string'?'a place that was not recorded':e.pointer===''?'the top of the request':e.pointer.slice(0,200);
      where=` The first miss is at ${at}${typeof e.keyword==='string'?`, keyword ${e.keyword.slice(0,40)}`:''}; error.expected is what the form allows there.`;
    }
    const repeated=e.reason==='resume_needs_paused'?'Of the line, only its id, method and module are repeated.':'Of the line, only its id and method are repeated, each only when it matches its form.';
    const next=e.reason!=='resume_needs_paused'?askSession('Read the request forms this session accepts, and its modules.'):
      inSession(e,c)&&c.state==='registered'?ask({method:'activate',module:e.module},'The module was never activated: activate opens it to calls.'):askModule(e,c,'Read the module\'s state.');
    return {detail:`${why}${where} The line was not run and nothing changed. ${repeated}`,next:[next]};
  },
  SESSION_ENDING:()=>({detail:'This session was closed to new requests before this line was started, so the line was not run. Nothing changed.',terminal:true}),
  DEADLINE_EXCEEDED:()=>({detail:'The call had started and did not answer within its deadline. The deadline ends the wait; it does not stop the handler, which is still running. Whether anything changed is not known. Read the current state before repeating a write. A session that ends while the call is still running can leave a bound module\'s end writes unsent: its at_end says when.',
    next:[askSession('Read `late`: how this call settled, once it has.')]}),
  MODULE_NOT_FOUND:(e,c)=>({valid:c.moduleIds,detail:`No module with that id is in this session.${Array.isArray(c.moduleIds)?` Its modules: ${c.moduleIds.slice(0,16).join(', ')}.`:''} Nothing changed.`,
    next:[askSession('List the modules in this session and their states.')]}),
  MODULE_INACTIVE:(e,c)=>({detail:`The module is ${c.state==='paused'?'paused':c.state==='registered'?'registered and has not been activated':'not active'}, so the call was not admitted. Nothing ran.`,
    next:[inSession(e,c)&&c.state==='registered'?ask({method:'activate',module:e.module},'Open the module to calls.'):
      inSession(e,c)&&c.state==='paused'?ask({method:'resume',module:e.module},'Reopen the paused module.'):askModule(e,c,'Read the module\'s state.')]}),
  OPERATION_NOT_FOUND:(e,c)=>({valid:e.valid,detail:`The module has no such operation.${Array.isArray(e.valid)?` Its operations: ${e.valid.slice(0,32).join(', ')}.`:''} Nothing ran.`,
    next:[askModule(e,c,'Read the module and its operations.')]}),
  INVALID_INPUT:(e,c)=>{
    if(e.reason==='does_not_match_card'){
      const at=typeof e.pointer!=='string'?'a place that was not recorded':e.pointer===''?'the top of the input':e.pointer.slice(0,200);
      return {detail:`${INPUT_REASONS.does_not_match_card} The first miss is at ${at}${typeof e.keyword==='string'?`, keyword ${e.keyword.slice(0,40)}`:''}; error.expected is the card's own word for it. Nothing was run, and the gate was not asked.`,
        next:[askCard(e,c,'Read the operation\'s card: what to send, an example, and the schema the input is held to.')]};
    }
    return {detail:`${INPUT_REASONS.beyond_limits} Nothing was run.`,next:[askCard(e,c,'Read the operation\'s card: what to send.')]};
  },
  POLICY_BLOCKED:()=>({detail:'This operation declares effects, and the allow list this session was started with does not name it. The list is fixed for the whole session, so no request here changes this. Only a session started with this operation on its allow list runs it. This is an admission result, not a person’s refusal. Nothing ran.',
    terminal:true}),
  ADMISSION_CHANGED:(e,c)=>({detail:'The module changed state while the call was waiting for admission. Nothing ran. Read its state and repeat.',retryable:true,next:[askModule(e,c,'Read the module\'s state.')]}),
  MODULE_RETIRED:()=>({detail:'This module is retired in this session and takes no new calls; it cannot be activated again here. That is complete. A new session starts with every module registered.',terminal:true}),
  OPERATION_FAILED:(e,c)=>({detail:'The operation started and failed in a way the module did not declare. Whether it changed anything is not known. Read the current state before repeating a write.',
    next:[askModule(e,c,'Read the module\'s state and, for a bound module, what its binding holds in memory.')]}),
  DECLINED:(e,c)=>{
    const r=e.refusal??{};
    const extra=typeof r.detail==='string'&&r.detail?` Reported: ${r.detail.slice(0,200)}`:'';
    // The Collab binding opens once, with its own operation: before it has, that is the step that moves a caller on.
    const first=r.code==='not_open'&&e.module===SESSION_BOUND&&inSession(e,c)&&e.operation!=='open'?
      // open's card takes an empty object, so the request carries it: sent with only an id added, it is a request the card accepts.
      [ask({method:'invoke',module:SESSION_BOUND,operation:'open',input:{}},'Open the binding first. open declares effects, so it runs only if the allow list names it.')]:[];
    return {detail:`${declinedWords(r.meaning)}${extra}`,
      next:[...first,askCard(e,c,'Read the operation\'s card and the refusals it declares.')]};
  },
  BUILD_REQUIRED:()=>({detail:'This operation needs the compiled Xenia library and its development dependencies, which are not present. Nothing was started, and no request in this session supplies them. Outside the session, from the Xenia checkout: `npm ci --ignore-scripts`, then `npm run build`.',terminal:true}),
  CLI_FAILED:()=>({detail:'An unexpected failure that this session has no specific code for. Whether anything changed is not known; read the current state before repeating a write.',terminal:true}),
};
export const SESSION_PROBLEM_CODES=Object.keys(SESSION_TABLE).sort();

// ctx.session: the problem is for a response line of a session. Every code is
// then terminal or gives requests; a code no session request produces is terminal.
export function buildProblem(error,ctx={}){
  const code=typeof error?.code==='string'&&Object.hasOwn(TABLE,error.code)?error.code:undefined;
  const made=!code?{detail:'An unrecognised failure code. Whether anything changed is not known.',terminal:true}:
    !ctx.session?TABLE[code](error,ctx):
    Object.hasOwn(SESSION_TABLE,code)?SESSION_TABLE[code](error,ctx):
    {detail:'A failure that a request in a session is not expected to produce. Whether anything changed is not known.',terminal:true};
  const next=made.terminal?[]:made.next??[];
  const problem={code:code??'CLI_FAILED',detail:made.detail,terminal:next.length===0,next_actions:next,
    retryable:Boolean(made.retryable||error?.retryable)};
  if(made.valid)problem.valid=[...made.valid];
  if(made.missing)problem.missing=[...made.missing];
  return problem;
}

export function usageHelp(command){
  const entry=typeof command==='string'&&Object.hasOwn(COMMANDS,command)?COMMANDS[command]:undefined;
  if(!entry)return undefined;
  return {command,usage:entry.usage,...(entry.also?{also:[...entry.also]}:{}),summary:entry.summary,...(entry.rules?{rules:[...entry.rules]}:{}),exit_codes:EXIT_CODES,
    not_established:['that the command will succeed','that other commands are described here']};
}
