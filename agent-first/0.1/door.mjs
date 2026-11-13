// SPDX-License-Identifier: MPL-2.0
// `door plan` and `door check`: looking at one HTTP(S) origin from outside.
// (`door rights`, which reads a local file and sends nothing, is in
// door-rights.mjs and is loaded from here for that operation only.)
//
// The checking itself is the unchanged Surface 0.1 checker (checkSurface in
// surface/0.1/check.mjs). This file adds four things around it: a plan that
// sends nothing, a request budget, a fence around what may be sent, and a
// short report that keeps the checker's own lines apart from what the service
// wrote. The default target rule is normalizeTarget from the vendored
// Telescope source (adapters/telescope/provider/dist/target.js); it reads the
// text of the target and resolves nothing.
//
// `door check` is the one place in this kit whose own code sends requests.
// Nothing here reads or writes a file other than loading those two modules.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {ModuleError} from './runtime.mjs';
import {DOOR_FLAGS,TARGET_REASONS,exitFields,missingFlags,parseFlags,withExit} from './problems.mjs';

const SCHEMA='xenia.agent-first/0.1-development';
const CHECKER=new URL('../../surface/0.1/check.mjs',import.meta.url);
const TARGET_RULE=new URL('./adapters/telescope/provider/dist/target.js',import.meta.url);
const TARGET_RULE_PATH='agent-first/0.1/adapters/telescope/provider/dist/target.js';

// What the caller may ask for. The checker accepts a total time of 100 to
// 120000 ms. 66 is the most requests one run of it can make: 1 for the
// manifest, 8 for each of at most 8 resources that also offer HTML (7 Accept
// cases and 1 unsupported type; a JSON-only resource takes 7), and 1 for a
// path that should not exist.
export const REQUEST_LIMITS=Object.freeze({min:1,max:66});
export const TOTAL_TIMEOUT_LIMITS=Object.freeze({min:100,max:120000});
const MAX_RESOURCES=8,REQUESTS_PER_RESOURCE=8,RESOURCE_SIZED_REQUESTS=7;
const FIRST_LOOK_TIMEOUT_MS=5000;
const ROW_LIMIT=20,OBSERVED_LIMIT=160,ID_LIMIT=80,LINE_LIMIT=20,LINE_LENGTH=300;

const BUDGET_MESSAGE='request budget reached; not sent';
const FENCE_PREFIX='refused by the kit fence';
const ALLOWED_HEADERS=['user-agent','accept'];
const REDIRECT_STATUSES=[301,302,303,307,308];

async function load(){
  if(!fs.existsSync(CHECKER)||!fs.existsSync(TARGET_RULE))throw new ModuleError('CHECKOUT_REQUIRED');
  const [{checkSurface,CHECKER_USER_AGENT},{normalizeTarget,isGloballyReachableAddress}]=await Promise.all([import(CHECKER.href),import(TARGET_RULE.href)]);
  return {checkSurface,CHECKER_USER_AGENT,normalizeTarget,isGloballyReachableAddress};
}
const refusal=(reason,extra={})=>Object.assign(new ModuleError('INVALID_TARGET'),{reason,...extra});
// A usage error that says which argument it is about. The reason is a fixed word; what was typed is not kept.
const usage=(reason,extra={})=>Object.assign(new ModuleError('INVALID_ARGUMENTS'),{reason,...extra});

// Runs the checker once with a fetch that refuses every call, so nothing is
// sent. The checker reads the target before anything else, so a throw here is
// its refusal of the target. What comes back is the checker's own account of
// what a check would do: target, manifest URL, scope, limits, and the lines it
// never tests. Then the default target rule is applied to the target the
// checker would contact, unless the caller lifted it.
async function admit(lib,origin,allowLocalTarget){
  if(typeof origin!=='string')throw refusal('not_an_origin');
  let result;
  try{result=await lib.checkSurface(origin,{fetchImpl:()=>{throw new Error('door plan: not sent');}});}
  catch(error){
    const message=String(error?.message??'');
    throw refusal(message.startsWith('target must be')?'not_an_origin':message.startsWith('public targets must use HTTPS')?'http_not_loopback':'refused_by_checker');
  }
  let ruled='accepted_by_rule',refusedAs=null;
  try{lib.normalizeTarget(result.target);}
  catch(error){
    refusedAs=typeof error?.code==='string'&&Object.hasOwn(TARGET_REASONS,error.code)?error.code:'refused_by_target_rule';
    if(!allowLocalTarget)throw refusal(refusedAs,{liftable:true,target:result.target});
    ruled='accepted_only_with_flag';
  }
  // For an IP address, whether it is in a range the vendored list holds as not globally reachable. The
  // literal is read; nothing is resolved. For a name this is null: the address it resolves to is not looked at.
  const host=new URL(result.target).hostname.replace(/^\[|\]$/g,'');
  const literal=isIP(host)===0?null:lib.isGloballyReachableAddress(host)?'globally_reachable':'not_globally_reachable';
  return {result,ruled,refusedAs,literal};
}
const LITERAL_MEANS={
  not_globally_reachable:'The address is in a range that function lists as not globally reachable: loopback, private, link-local, shared, documentation, multicast or reserved.',
  globally_reachable:'The address is outside the ranges that function lists (loopback, private, link-local, shared, documentation, multicast, reserved). That says nothing about what answers there.',
};

const checkArgvFor=(target,requests,totalMs,allowLocalTarget)=>
  ['door','check','--origin',target,'--max-requests',String(requests),'--total-timeout-ms',String(totalMs),...(allowLocalTarget?['--allow-local-target']:[])];

export async function doorPlan({origin,allowLocalTarget=false}={}){
  const lib=await load();
  const {result,ruled,refusedAs,literal:literalAddress}=await admit(lib,origin,Boolean(allowLocalTarget));
  const {limits,target}=result;
  const url=new URL(target);
  const bytesUpperBound=limits.manifest_problem_max_bytes*2+MAX_RESOURCES*(RESOURCE_SIZED_REQUESTS*limits.resource_max_bytes+limits.manifest_problem_max_bytes);
  const requestsUpperBound=2+MAX_RESOURCES*REQUESTS_PER_RESOURCE;
  const literal=isIP(url.hostname.replace(/^\[|\]$/g,''))!==0;
  const allow=Boolean(allowLocalTarget);
  return withExit({
    schema:SCHEMA,kind:'door-plan',sent_by_this_command:0,
    scope:result.scope,not_tested:[...result.not_tested],target,manifest_url:result.manifest_url,verifier:{...result.verifier},limits:{...limits},
    target_rule:{
      rule:'By default the target must use HTTPS, a DNS name and port 443, and must not be a local or reserved name.',
      checked_with:`normalizeTarget in ${TARGET_RULE_PATH}; it reads the text of the target and resolves nothing`,
      allow_local_target:allow,
      with_flag:'--allow-local-target accepts whatever else the checker accepts: any HTTPS origin, and plain HTTP on localhost, 127.x or [::1].',
      this_target:ruled,
      refused_by_default_as:refusedAs,
      literal_address:literalAddress===null?null:{word:literalAddress,checked_with:`isGloballyReachableAddress in ${TARGET_RULE_PATH}; it reads the literal and resolves nothing`,means:LITERAL_MEANS[literalAddress]},
    },
    requests:{floor:1,upper_bound:requestsUpperBound,
      rule:'One request for the manifest. Only if the manifest passes its four checks: 7 requests for each resource it lists that offers JSON only, 8 for each that also offers HTML (1 to 8 resources), then 1 for a path that should not exist. So 1 when the manifest is missing or not valid, otherwise 9 to 66. The number is not known until the manifest has been read.',
      on_the_wire:'These numbers, and --max-requests, count calls this kit hands to the runtime\'s fetch. The runtime sends each call once, with one exception seen on Node: after an answer with status 421 it sends that request a second time by itself. A service that answers 421 can therefore receive up to twice the number counted.'},
    bytes:{upper_bound:bytesUpperBound,
      rule:`Decoded response body bytes the checker accepts: up to ${limits.manifest_problem_max_bytes} for the manifest and for each problem response, up to ${limits.resource_max_bytes} for each resource representation. The upper bound is the sum at 8 resources that also offer HTML.`,
      not_counted:['response headers','request bytes','connection and TLS overhead','the part of a response chunk that arrives past a limit before the read is cancelled']},
    time:{request_timeout_ms:limits.request_timeout_ms,total_timeout_ms:{...TOTAL_TIMEOUT_LIMITS,set_by:'--total-timeout-ms'},
      rule:'No request starts after the total has passed. Each request, with the reading of its body, is cut off at the smaller of the request timeout and the time left. `door check` has no default total: limits.total_timeout_ms is the checker\'s own default and is not used. These bound the checker\'s waiting; starting the runtime and printing are extra.'},
    would_contact:{origins:[url.origin],
      name_resolver:literal?'none: the target is an IP address':`the system resolver, asked by the runtime for the address of ${url.hostname}; this kit neither chooses nor inspects it`,
      method:'GET',headers_set_by_checker:[...ALLOWED_HEADERS],user_agent:lib.CHECKER_USER_AGENT,
      headers_added_by_runtime:'The runtime\'s fetch adds headers of its own, which this kit neither sets nor removes; on Node these have been host, connection, accept-encoding, accept-language and sec-fetch-mode.',
      credentials:'none',request_body:'none'},
    will_not_do:[
      'follow a redirect',
      'use any method but GET, or send a request body',
      'send a cookie, a credential, or any header of its own besides User-Agent and Accept',
      'contact any origin but the target: links in the manifest, in problems and in evidence are not fetched',
      'retry a request or send two at once (requests.on_the_wire names the one case in which the runtime repeats a request by itself)',
      'hand more than --max-requests requests to the runtime, or start one after --total-timeout-ms has passed',
      'write a file, or keep anything after the process ends',
    ],
    does_not_guard:[
      'The address the name resolves to is not inspected. A name that passes the target rule can still resolve to a private, loopback or link-local address, and the requests would go there.',
      'The service at the target, and anything on the network path, can log the sender\'s address, the User-Agent and the times of the requests.',
      'No host gate is consulted. This command asks no one before sending; whether to send is decided outside this kit.',
      'Runtime settings are not examined. If the runtime is set to send through a proxy, the requests go to the proxy first.',
    ],
    host_may_add:{who:'the environment that runs this command (not the service at the target)',
      can_add:['an approval step before `door check` is run','an allow-list of origins or of resolved addresses at the network boundary','its own name resolution or address checks',
        'request, byte and time limits below the ones given here','a record of what was sent']},
    check:{
      first_look:{argv:checkArgvFor(target,1,FIRST_LOOK_TIMEOUT_MS,allow),requests_upper_bound:1,bytes_upper_bound:limits.manifest_problem_max_bytes,
        time_upper_bound_ms:Math.min(FIRST_LOOK_TIMEOUT_MS,limits.request_timeout_ms),
        what:'Sends one request, for the manifest. Shows whether one is served and, when it is valid, how many requests a full check needs. It cannot exit 0, because the remaining checks are not sent.'},
      full:{argv:checkArgvFor(target,requestsUpperBound,TOTAL_TIMEOUT_LIMITS.max,allow),requests_upper_bound:requestsUpperBound,bytes_upper_bound:bytesUpperBound,
        time_upper_bound_ms:TOTAL_TIMEOUT_LIMITS.max,
        what:'Sends every request the checker defines for the manifest it reads, up to the upper bound. The total time is the largest the checker accepts.'},
      note:'Both numbers are the caller\'s to lower; a smaller budget or total can leave checks not determined (exit 4). --full adds the checker\'s whole result to the output. Each run is a new observation and sends its requests again.',
    },
    not_established:[
      'that the target exists, answers or serves a manifest: nothing was sent',
      'how many requests a check will need: that depends on the manifest, which was not read',
      'that the host name resolves to a public address',
      'that sending these requests is permitted where this runs, or wanted by the service at the target',
      'anything about whoever runs this command',
    ],
    ...exitFields(0,'A plan was printed. Nothing was sent, and nothing about the target was observed.'),
  },0);
}

// The budget and the fence, as the fetch the checker is given. A call is first
// held to the fence (a plain GET to the target origin, redirects not followed,
// no header but User-Agent and Accept); a call that fails it is not sent and
// is counted apart, without using the budget. Then the budget: once `budget`
// calls have gone to the inner fetch, later calls are not sent and are counted.
// `sent` counts calls handed to the inner fetch, not requests seen on a wire:
// Node's fetch sends a request a second time by itself after a 421 answer.
export function createFencedFetch({target,budget,fetchImpl}){
  const origin=new URL(target).origin;
  const counts={budget,sent:0,stopped_by_budget:0,refused_by_kit_fence:0,redirects_not_followed:0,responses_by_status:{},transport_errors:0};
  const fenceReason=(input,init)=>{
    if(typeof input!=='string'&&!(input instanceof URL))return 'the request is not a plain URL';
    let url;
    try{url=new URL(String(input));}catch{return 'the URL could not be read';}
    if(url.origin!==origin||url.username||url.password)return 'the URL is not at the target origin';
    if((init?.method??'GET')!=='GET')return 'the method is not GET';
    if(init?.redirect!=='manual')return 'redirects are not set to manual';
    let names;
    try{names=[...new Headers(init?.headers??{}).keys()];}catch{return 'the headers could not be read';}
    if(names.some(name=>!ALLOWED_HEADERS.includes(name)))return 'a header other than User-Agent and Accept is set';
    return undefined;
  };
  const fetch=async(input,init)=>{
    const why=fenceReason(input,init);
    if(why){counts.refused_by_kit_fence+=1;throw new Error(`${FENCE_PREFIX} (${why}); not sent`);}
    if(counts.sent>=budget){counts.stopped_by_budget+=1;throw new Error(BUDGET_MESSAGE);}
    counts.sent+=1;
    let response;
    try{response=await fetchImpl(input,init);}catch(error){counts.transport_errors+=1;throw error;}
    const status=response?.status;
    if(Number.isInteger(status)){
      counts.responses_by_status[status]=(counts.responses_by_status[status]??0)+1;
      if(REDIRECT_STATUSES.includes(status))counts.redirects_not_followed+=1;
    }
    return response;
  };
  return {fetch,counts};
}

// The size and sha256 of the JSON text of a value (JSON.stringify, no spacing),
// as `demo` reports its step results in cli.mjs.
const digest=value=>{const text=JSON.stringify(value)??'';return {bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};};
// Text the service wrote, made printable and cut to a length. A control, format or line-separator character
// (Unicode Cc, Cf, Zl, Zp: an escape, a right-to-left override, a zero-width space) is shown as \u{HEX} and never
// printed as itself, so it cannot move or hide what a terminal shows. The length is counted after that.
const HIDDEN=/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const visible=value=>String(value).replace(HIDDEN,ch=>`\\u{${ch.codePointAt(0).toString(16).toUpperCase()}}`);
const cut=(value,limit)=>{const chars=[...visible(value)];return chars.length>limit?{text:chars.slice(0,limit).join(''),cut:true}:{text:chars.join(''),cut:false};};

// What each manifest state covers, and no more. `not_found` is any status but 200.
export const MANIFEST_MEANS=Object.freeze({
  found_valid:'The manifest URL answered 200 with a body that passed the checker\'s content-type, JSON and schema checks.',
  found_invalid:'The manifest URL answered 200 with a body that did not pass the checker\'s content-type, JSON or schema check.',
  not_found:'The manifest URL answered with this status, not 200. The word says no more than that: a redirect, a refusal and a server error are all reported this way.',
  not_observed:'No response arrived, or a 200 came whose body could not be read.',
});
function manifestState(checks){
  const outcome=id=>checks.find(check=>check.id===id)?.outcome;
  const status=checks.find(check=>check.id==='M.STATUS')?.observation?.response?.status??null;
  let state;
  if(outcome('M.STATUS')!=='pass')state=outcome('M.STATUS')==='fail'?'not_found':'not_observed';
  else if(['M.CONTENT_TYPE','M.JSON','M.SCHEMA'].every(id=>outcome(id)==='pass'))state='found_valid';
  else state=outcome('M.JSON')==='unknown'?'not_observed':'found_invalid';
  return {state,status,means:MANIFEST_MEANS[state]};
}

// Why a check is unknown or was not run, as one of a fixed set of words. The
// text the checker recorded is matched, never copied.
const UNKNOWN_REASONS=[
  ['budget_reached','not sent: --max-requests had been used up'],
  ['total_timeout','not sent, or cut off, because --total-timeout-ms ran out'],
  ['request_timeout','sent, and no complete answer came within the request timeout'],
  ['refused_by_kit_fence','not sent: the kit fence refused the request'],
  ['transport_error','sent, and no response arrived'],
  ['body_not_read','a response arrived, but its body was over the size limit or could not be read in full'],
  ['depends_on_manifest','not run: these checks need a manifest that was read and passed its own checks'],
];
function unknownReason(check,limits){
  if(check.outcome==='not_run')return 'depends_on_manifest';
  const error=check.observation?.error;
  if(typeof error==='string'){
    if(error===BUDGET_MESSAGE)return 'budget_reached';
    if(error.startsWith(FENCE_PREFIX))return 'refused_by_kit_fence';
    if(/^total timeout after \d+ms$/.test(error))return 'total_timeout';
    const timed=/^timeout after (\d+)ms$/.exec(error);
    // A request cut off before the request timeout was cut off by the total.
    if(timed)return Number(timed[1])<limits.request_timeout_ms?'total_timeout':'request_timeout';
  }
  return check.observation?.response?'body_not_read':'transport_error';
}

// A date-time the checker has already accepted, as milliseconds. A leap second
// is read as the second after 23:59:59.
function instant(text){
  if(typeof text!=='string')return NaN;
  const leap=text.includes('T23:59:60');
  const ms=Date.parse(leap?text.replace('T23:59:60','T23:59:59'):text);
  return leap?ms+1000:ms;
}

const EXIT_BY_WORD={conformant:0,nonconformant:3,indeterminate:4};
const EXIT_REASONS={
  0:'Every check the checker ran passed, and none was left unknown or not run. checker_result.covers says what that covers.',
  3:'At least one check failed. not_passed lists up to 20 of the checks that did not pass, leaving out any that were not sent for want of budget.',
  4:'No check failed, and at least one was unknown or not run. unknown_reasons says why.',
};

function report({result,own,counts,allowLocalTarget,rule,full,userAgent}){
  const {checks}=result;
  const manifest=manifestState(checks);
  const valid=manifest.state==='found_valid';
  const notPassed=checks.filter(check=>check.outcome!=='pass');
  // A check whose request was not sent for want of budget is counted, not listed: each such row would say the same thing.
  const listed=notPassed.filter(check=>check.observation?.error!==BUDGET_MESSAGE);
  const rows=listed.slice(0,ROW_LIMIT).map(check=>{
    const id=cut(check.id,ID_LIMIT),observed=cut(check.observed,OBSERVED_LIMIT);
    return {id:id.text,outcome:check.outcome,expected:check.expected,observed:observed.text,...(id.cut?{id_cut:true}:{}),...(observed.cut?{observed_cut:true}:{})};
  });
  const tally=new Map();
  for(const check of notPassed)if(check.outcome!=='fail'){const reason=unknownReason(check,result.limits);tally.set(reason,(tally.get(reason)??0)+1);}
  const hostLines=valid?result.not_tested.filter(line=>!own.includes(line)):[];
  const observedAt=instant(result.observed_at);
  const expired=valid?result.declared_claims.filter(claim=>Array.isArray(claim?.evidence)&&claim.evidence.some(item=>instant(item?.expires_at)<=observedAt)).length:null;
  const known=Object.hasOwn(EXIT_BY_WORD,result.result);
  const code=known?EXIT_BY_WORD[result.result]:4;
  const {budget,sent,stopped_by_budget,refused_by_kit_fence,redirects_not_followed,responses_by_status,transport_errors}=counts;
  // Each request the checker makes is one observation object, shared by the checks that read it.
  const needed=valid?new Set(checks.map(check=>check.observation)).size:null;
  const next=needed!==null&&needed>budget?[{argv:checkArgvFor(result.target,needed,TOTAL_TIMEOUT_LIMITS.max,allowLocalTarget),
    why:`Sends the ${needed} requests a full check of the manifest read in this run needs; this run's budget was ${budget}. It is a new run: every request is sent again, and the manifest may differ by then. Both numbers are the caller's to lower, and whether to send is decided outside this kit.`}]:[];
  return withExit({
    schema:SCHEMA,kind:'door-check',
    scope:`What the User-Agent ${userAgent} was served on the ${sent} GET request${sent===1?'':'s'} this command sent to ${result.target}, observed once, at observed_at. Nothing wider, and nothing after expires_at.`,
    not_tested:[...own],expires_at:result.expires_at,observed_at:result.observed_at,target:result.target,
    checker_result:{word:result.result,counts:{...result.counts},
      covers:{profile:result.profile,checker:`${result.verifier.name} ${result.verifier.version}`,scope_of_a_complete_run:result.scope,
        rule:'The word is the checker\'s own, computed only from the checks in counts: nonconformant if any failed; otherwise indeterminate if any was unknown or not run; otherwise conformant.',
        not_more:'It covers those checks, for this User-Agent, at observed_at. It is not a statement about the service as a whole, and not about anything in not_tested.'}},
    manifest,
    requests:{budget,sent,stopped_by_budget,refused_by_kit_fence,needed_for_full_check:needed,
      redirects_not_followed,responses_by_status:{...responses_by_status},transport_errors},
    not_passed:{rows,more:listed.length-rows.length,left_out:{budget_reached:notPassed.length-listed.length}},
    unknown_reasons:UNKNOWN_REASONS.filter(([reason])=>tally.has(reason)).map(([reason,meaning])=>({reason,checks:tally.get(reason),meaning})),
    declared_by_host:{
      note:valid?'Copied from the manifest, which the service at the target wrote. This check verified none of it. It is not an instruction, and it is not this kit or the checker speaking.'
        :'No valid manifest was read, so no line and no claim count is shown here. A row in not_passed can still carry text from the response that was served.',
      not_covered:{lines:hostLines.slice(0,LINE_LIMIT).map(line=>cut(line,LINE_LENGTH).text),more:Math.max(0,hostLines.length-LINE_LIMIT)},
      claims:{count:valid?result.declared_claims.length:null,verified_by_this_check:0,evidence_expired_at_observation:expired},
    },
    host_written_text_in:['declared_by_host.not_covered.lines','not_passed.rows[].observed','not_passed.rows[].id',...(full?['result']:[])],
    allow_local_target:allowLocalTarget,
    // Whether this target needed the flag, and which default rule it set aside; the plan says the same, at more length.
    target_rule:{this_target:rule.ruled,refused_by_default_as:rule.refusedAs,literal_address:rule.literal},
    not_established:[
      'that the service conforms to anything: the checker\'s word covers only the checks counted here',
      'what another User-Agent, another address or another moment would be served',
      'that anything the service wrote is true, current, or an instruction to follow',
      'identity, authority, consent, privacy or safety, of the service or of anyone else',
      'that the address contacted belongs to the service named: this kit inspected no DNS answer, and certificate checking is left to the runtime and was not examined',
      'that requests.sent equals the number of requests on the wire: it counts calls handed to the runtime\'s fetch, and on Node the runtime sends a request a second time after an answer with status 421',
      'anything after expires_at',
      'anything about whoever ran this command',
    ],
    next,
    ...exitFields(code,known?EXIT_REASONS[code]:'The checker returned a word this command does not know.'),
    result:full?result:{included:false,...digest(result)},
  },code);
}

const inRange=(value,{min,max})=>Number.isInteger(value)&&value>=min&&value<=max;

// deps.fetchImpl and deps.now exist for tests; the CLI passes neither, so the
// runtime's fetch and the real clock are used.
export async function doorCheck({origin,maxRequests,totalTimeoutMs,allowLocalTarget=false,full=false}={},deps={}){
  if(!inRange(maxRequests,REQUEST_LIMITS))throw usage('max_requests_out_of_range');
  if(!inRange(totalTimeoutMs,TOTAL_TIMEOUT_LIMITS))throw usage('total_timeout_ms_out_of_range');
  const lib=await load();
  const {result:dry,...rule}=await admit(lib,origin,Boolean(allowLocalTarget));
  const send=deps.fetchImpl??((input,init)=>globalThis.fetch(input,init));
  const fenced=createFencedFetch({target:dry.target,budget:maxRequests,fetchImpl:send});
  const result=await lib.checkSurface(dry.target,{fetchImpl:fenced.fetch,totalTimeoutMs,...(deps.now===undefined?{}:{now:deps.now})});
  return report({result,own:dry.not_tested,counts:fenced.counts,allowLocalTarget:Boolean(allowLocalTarget),rule,full:Boolean(full),userAgent:lib.CHECKER_USER_AGENT});
}

const wholeNumber=text=>/^[1-9][0-9]{0,6}$/.test(text)?Number(text):NaN;

export async function runDoorCommand(args,deps={}){
  const [operation,...rest]=args;
  if(!Object.hasOwn(DOOR_FLAGS,operation??''))throw new ModuleError('INVALID_ARGUMENTS');
  const flags=parseFlags(rest,DOOR_FLAGS[operation]);
  if(!flags){
    const missing=missingFlags(rest,DOOR_FLAGS[operation]);
    throw missing?usage('required_flag_missing',{missing}):new ModuleError('INVALID_ARGUMENTS');
  }
  const origin=flags.values['--origin'],allowLocalTarget=flags.switches.includes('--allow-local-target');
  if(operation==='rights'){
    // Loaded only for this operation, so plan and check never import the covenant checks.
    const {doorRights}=await import('./door-rights.mjs');
    return doorRights({file:flags.values['--input'],asOf:flags.values['--as-of'],origin,full:flags.switches.includes('--full')},deps);
  }
  if(operation==='plan')return doorPlan({origin,allowLocalTarget});
  if(operation==='check')return doorCheck({origin,maxRequests:wholeNumber(flags.values['--max-requests']),totalTimeoutMs:wholeNumber(flags.values['--total-timeout-ms']),
    allowLocalTarget,full:flags.switches.includes('--full')},deps);
  throw new ModuleError('INVALID_ARGUMENTS');
}
