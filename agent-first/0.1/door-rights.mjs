// SPDX-License-Identifier: MPL-2.0
// `door rights`: reading one local file as a Covenant 0.1 adoption record.
//
// The two checks of a record are the installed ones, unchanged:
// inspectCovenantAdoption in observe/0.1/observe.mjs (the JSON Schema, then
// validateCovenantAdoption), and, when Observe cannot be loaded,
// validateCovenantAdoption in covenant/0.1/validate-adoption.mjs alone. Times
// are compared with covenant/0.1/rfc3339.mjs. The file is read with the kit's
// bounded, no-follow reader and strict JSON decoder (input-file.mjs).
//
// This file adds four things around them: which release the record pins, a
// clock (--as-of) for evidence expiry, a short report in which the record's
// own words sit only under `record_says`, and a list of what was not checked.
// It sends nothing, fetches nothing and writes nothing.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ModuleError} from './runtime.mjs';
import {readBoundedBytes,parseStrictJson} from './input-file.mjs';
import {exitFields,withExit} from './problems.mjs';

const SCHEMA='xenia.agent-first/0.1-development';
const COVENANT=new URL('../../covenant/0.1/',import.meta.url);
const COVENANT_FILES=['validate-adoption.mjs','rfc3339.mjs','covenant.json','covenant.schema.json','adoption.schema.json'];
const OBSERVE=new URL('../../observe/0.1/observe.mjs',import.meta.url);

// The limit Observe puts on an adoption file (ADOPTION_MAX_BYTES in observe/0.1/observe.mjs).
export const INPUT_LIMIT_BYTES=2_000_000;
// Observe keeps at most this many issues from each check; the fallback keeps the same number.
export const ISSUE_LIMIT=256;
const RECORD_PREFIX='xenia.covenant.adoption/';
const TIME_LENGTH=40,ORIGIN_LENGTH=300,MESSAGE_LENGTH=300;

// One earlier snapshot of covenant/0.1 whose two digests this command knows:
// those of covenant.json and adoption.schema.json at that tag. They are
// written down here, not observed at run time; the test file derives them
// again from git when the tag is in the repository. This checkout does not
// carry that snapshot's rules, so a record that pins it is not checked under them.
export const EARLIER_SNAPSHOTS=Object.freeze([Object.freeze({tag:'npm-xenia-v0.1.0-beta.4',commit:'6419d37',
  covenant_sha256:'sha256:19ba96d473fc029a69bfbafb0a1b4cf52188417453d88faf2c44632e6162d1c7',
  adoption_schema_sha256:'sha256:bbcea5af81adc78f9887bf0019f8ae1c19528885db7a0aaa3a786fc2bdbeddd1'})]);

// The words a record may use in five places, as the installed adoption schema
// lists them (a test compares the two). A value from the record is shown only
// when it is one of these; anything else is counted as `other`.
export const RECORD_WORDS=Object.freeze({
  declaration_status:Object.freeze(['draft','active','superseded','withdrawn']),
  speaker_authority_state:Object.freeze(['unverified','verified']),
  outcomes:Object.freeze(['pass','fail','partial','unknown']),
  evidence_states:Object.freeze(['none','asserted','tested','attested']),
  right_states:Object.freeze(['implemented','partial','breached','unknown']),
});

const usage=reason=>Object.assign(new ModuleError('INVALID_ARGUMENTS'),{reason});
const checkout=()=>Object.assign(new ModuleError('CHECKOUT_REQUIRED'),{reason:'covenant_files'});
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const list=value=>Array.isArray(value)?value:[];
const word=(value,words)=>typeof value==='string'&&words.includes(value)?value:'other';
const tally=words=>Object.fromEntries([...words,'other'].map(name=>[name,0]));
const INDEX=/^\d{1,9}$/;

async function load(){
  if(COVENANT_FILES.some(name=>!fs.existsSync(new URL(name,COVENANT))))throw checkout();
  try{
    const [rules,times]=await Promise.all([import(new URL('validate-adoption.mjs',COVENANT).href),import(new URL('rfc3339.mjs',COVENANT).href)]);
    return {validateCovenantAdoption:rules.validateCovenantAdoption,pins:rules.canonicalPins,release:rules.canonicalRelease,schema:rules.canonicalAdoptionSchema,
      parseRfc3339:times.parseRfc3339,compareRfc3339:times.compareRfc3339};
  }catch{throw checkout();}
}

// Runs the installed checks. Nothing about a failed load is copied out: the
// reason is one of three fixed words.
async function runChecks(lib,bytes,record){
  let reason='observe_not_present';
  if(fs.existsSync(OBSERVE)){
    let inspect;
    reason='observe_did_not_load';
    try{({inspectCovenantAdoption:inspect}=await import(OBSERVE.href));}catch{}
    if(typeof inspect==='function'){
      reason='observe_failed';
      try{
        const result=inspect(bytes,undefined);
        return {schema:{state:'run',issues:list(result.schemaValidation.issues).slice(0,ISSUE_LIMIT)},cross:list(result.crossDocumentValidation.issues).slice(0,ISSUE_LIMIT)};
      }catch{}
    }
  }
  return {schema:{state:'not_run',reason},cross:list(lib.validateCovenantAdoption(record).issues).slice(0,ISSUE_LIMIT)};
}
const NOT_RUN_HOW={
  observe_not_present:'This copy has no observe/0.1 beside the kit; a full Xenia source checkout has it.',
  observe_did_not_load:'observe/0.1/observe.mjs is here but could not be loaded. From the Xenia checkout, `npm ci --ignore-scripts` installs what it needs; then repeat the command.',
  observe_failed:'observe/0.1/observe.mjs was loaded and its inspection stopped with an error. The other check was run by itself.',
};

// An HTTP(S) origin read out of a URL, or null. Only the origin is kept: a
// user name, password, path, query and fragment are dropped, and a host name
// comes out in its ASCII form.
function originOf(text){
  if(typeof text!=='string'||text.length>2000)return null;
  let url;
  try{url=new URL(text);}catch{return null;}
  if(url.protocol!=='https:'&&url.protocol!=='http:')return null;
  return url.origin.length<=ORIGIN_LENGTH?url.origin:null;
}
// --origin must be an origin and nothing more. What was typed is never copied out.
function givenOrigin(text){
  if(text===undefined)return null;
  const origin=originOf(text);
  if(origin===null||new URL(text).href!==`${origin}/`)throw usage('origin_not_an_origin');
  return origin;
}

// Every property name the installed adoption schema defines, at any depth.
export function schemaNames(schema){
  const names=new Set();
  const walk=node=>{
    if(Array.isArray(node)){node.forEach(walk);return;}
    if(!isRecord(node))return;
    if(isRecord(node.properties))for(const name of Object.keys(node.properties))names.add(name);
    Object.values(node).forEach(walk);
  };
  walk(schema);
  return names;
}
// The two checks write a place differently ($.rights[0].x and /rights/0/x).
const steps=path=>typeof path!=='string'?[]:path.startsWith('/')?path.slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~')):
  path.replace(/^\$/,'').split(/[.[\]]+/).filter(Boolean);
// A place in the record, written one way, and only as far as each step is an
// index or a name the installed schema defines. With the installed schema a
// path cannot carry a name the record chose; this is here in case that changes.
export function shownPath(path,names){
  const all=steps(path),kept=[];
  for(const part of all){
    if(!INDEX.test(part)&&!names.has(part))break;
    kept.push(part);
  }
  return {path:'$'+kept.map(part=>INDEX.test(part)?`[${part}]`:`.${part}`).join(''),...(kept.length<all.length?{path_cut:true}:{})};
}

function countIssues(issues,topLevel){
  const byCode=new Map(),byField=new Map(),rows=new Set();
  let inLedger=0;
  const add=(map,key)=>map.set(key,(map.get(key)??0)+1);
  for(const issue of issues){
    add(byCode,issue.code);
    const at=steps(issue.rawPath);
    add(byField,at.length===0?'whole_record':topLevel.includes(at[0])?at[0]:'other');
    if(at[0]==='rights'||at[0]==='protective_limit_results')inLedger+=1;
    if(at[0]==='rights'&&INDEX.test(at[1]??'')&&at[2]==='requirement_results'&&INDEX.test(at[3]??''))rows.add(`r${at[1]}.${at[3]}`);
    if(at[0]==='protective_limit_results'&&INDEX.test(at[1]??''))rows.add(`p${at[1]}`);
  }
  return {byCode:Object.fromEntries(byCode),byField:Object.fromEntries(byField),inLedger,rows:rows.size};
}

// One pass over the duty rows: what the record says in each, and when the
// evidence behind it expires.
function readLedger(lib,record,asOf){
  const outcomes=tally(RECORD_WORDS.outcomes),evidenceStates=tally(RECORD_WORDS.evidence_states),rightStates=tally(RECORD_WORDS.right_states);
  const expiry={with:0,expired:0,pass:0,passExpired:0,passUnreadable:0,earliest:null,latest:null};
  let rows=0;
  const row=item=>{
    rows+=1;
    const outcome=word(item?.outcome,RECORD_WORDS.outcomes);
    outcomes[outcome]+=1;
    const evidence=isRecord(item?.evidence)?item.evidence:{};
    evidenceStates[word(evidence.state,RECORD_WORDS.evidence_states)]+=1;
    if(outcome==='pass')expiry.pass+=1;
    const expires=evidence.expires_at;
    if(lib.parseRfc3339(expires)===null){if(outcome==='pass')expiry.passUnreadable+=1;return;}
    expiry.with+=1;
    if(lib.compareRfc3339(expires,asOf)<=0){expiry.expired+=1;if(outcome==='pass')expiry.passExpired+=1;}
    if(expiry.earliest===null||lib.compareRfc3339(expires,expiry.earliest)<0)expiry.earliest=expires;
    if(expiry.latest===null||lib.compareRfc3339(expires,expiry.latest)>0)expiry.latest=expires;
  };
  for(const right of list(record.rights)){
    rightStates[word(right?.service_obligation_state,RECORD_WORDS.right_states)]+=1;
    for(const item of list(right?.requirement_results))row(item);
  }
  for(const item of list(record.protective_limit_results))row(item);
  return {rows,outcomes,evidenceStates,rightStates,expiry};
}

const FINDING_WORDS={
  no_issue_under_installed_rules:'no_inconsistency_found',
  issues_under_installed_rules:'inconsistent',
  json_schema_not_run:'undetermined',
  pins_an_earlier_snapshot:'undetermined',
  pins_not_recognised:'undetermined',
};
const ORIGIN_MEANS={
  not_compared:'No --origin was given, so the origin the record names was not compared with anything.',
  same_origin:'The record names the origin given. That compares two pieces of text; it is not that the file came from that origin, or that the service there wrote it.',
  different_origin:'The record names an origin other than the one given.',
  unknown:'The record names no usable HTTP(S) origin, so nothing could be compared.',
};
const plural=(count,one,many)=>`${count} ${count===1?one:many}`;

// deps.now exists for tests; the CLI passes nothing, so the real clock is used
// when --as-of is not given.
export async function doorRights({file,asOf,origin,full=false}={},deps={}){
  const lib=await load();
  const fromClock=asOf===undefined;
  const asOfValue=fromClock?(deps.now?deps.now():new Date()).toISOString():asOf;
  if(typeof asOfValue!=='string'||asOfValue.length>TIME_LENGTH||lib.parseRfc3339(asOfValue)===null)throw usage('as_of_not_rfc3339');
  const given=givenOrigin(origin);
  if(typeof file!=='string'||!file)throw new ModuleError('INVALID_ARGUMENTS');

  const bytes=readBoundedBytes(file,INPUT_LIMIT_BYTES);
  const record=parseStrictJson(bytes);
  if(!isRecord(record)||typeof record.schema_version!=='string'||!record.schema_version.startsWith(RECORD_PREFIX))
    throw Object.assign(new ModuleError('INVALID_INPUT'),{reason:'not_an_adoption_record'});

  // Which release the record pins: its two digests, as text, against the installed ones and the known earlier ones.
  const pinOf=name=>isRecord(record[name])&&typeof record[name].sha256==='string'?record[name].sha256:undefined;
  const covenantPin=pinOf('covenant'),schemaPin=pinOf('adoption_schema');
  const snapshot=EARLIER_SNAPSHOTS.find(row=>row.covenant_sha256===covenantPin&&row.adoption_schema_sha256===schemaPin);
  const pinState=(pin,installed,key)=>pin===undefined?'not_stated':pin===installed?'installed':EARLIER_SNAPSHOTS.some(row=>row[key]===pin)?'earlier_snapshot':'other';
  const relation=covenantPin===lib.pins.covenant&&schemaPin===lib.pins.adoptionSchema?'installed':snapshot?'earlier_snapshot':'not_recognised';
  const releaseMeans={
    installed:`The two digests this record pins equal those of the covenant/0.1 files installed in this checkout, which the installed rules name as release tag ${lib.release.tag}. That the tag exists anywhere, or serves these bytes, was not observed.`,
    earlier_snapshot:snapshot?`The two digests this record pins equal those of covenant/0.1 at tag ${snapshot.tag} (commit ${snapshot.commit}). It was not checked under that snapshot's rules, which this checkout does not carry.`:'',
    not_recognised:'The digests this record pins are not those of the installed files, and not those of the one earlier snapshot this command knows. They may belong to a newer release, or to bytes that are no release; this command cannot tell which.',
  }[relation];

  const checks=await runChecks(lib,bytes,record);
  const names=schemaNames(lib.schema),topLevel=isRecord(lib.schema.properties)?Object.keys(lib.schema.properties):[];
  const tidy=check=>issue=>({check,code:typeof issue?.code==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(issue.code)?issue.code:'other',rawPath:issue?.path,
    message:typeof issue?.message==='string'?[...issue.message].slice(0,MESSAGE_LENGTH).join(''):''});
  const schemaIssues=checks.schema.state==='run'?checks.schema.issues.map(tidy('json_schema')):[];
  const crossIssues=checks.cross.map(tidy('cross_document'));
  const everyIssue=[...schemaIssues,...crossIssues];
  const counted=countIssues(everyIssue,topLevel);
  const issueRows=everyIssue.map(({check,code,rawPath,message})=>({check,code,...shownPath(rawPath,names),message}));

  const ledger=readLedger(lib,record,asOfValue);
  const reason=relation==='earlier_snapshot'?'pins_an_earlier_snapshot':relation==='not_recognised'?'pins_not_recognised':
    everyIssue.length?'issues_under_installed_rules':checks.schema.state==='not_run'?'json_schema_not_run':'no_issue_under_installed_rules';
  const expiredPasses=ledger.expiry.passExpired;
  const [code,exitReason]={
    pins_an_earlier_snapshot:[4,'The record pins an earlier snapshot of covenant/0.1, whose rules this checkout does not carry. What the installed rules raise is shown, labelled, and is not a finding about the record.'],
    pins_not_recognised:[4,'The record pins digests this command does not recognise, so it was not checked under the rules it names. What the installed rules raise is shown, labelled, and is not a finding about the record.'],
    issues_under_installed_rules:[3,`The record pins the installed bytes, and the installed rules raise ${plural(everyIssue.length,'issue','issues')} on it. under_installed_rules counts them; --full lists them.`],
    json_schema_not_run:[4,'The JSON Schema check could not be run here, and the other check raised nothing. Whether the record raises an issue under the installed rules is not known.'],
    no_issue_under_installed_rules:expiredPasses?
      [3,`No issue was raised under the installed rules, and ${plural(expiredPasses,'row','rows')} the record gives as \`pass\` ${expiredPasses===1?'rests':'rest'} on evidence that had expired at as_of. See expiry.`]:
      [0,'No issue was raised under the installed rules, which this record pins, and no evidence behind a row the record gives as `pass` had expired at as_of. A 0 covers that and nothing else: see not_established and checked_by_this_command.'],
  }[reason];

  const shownTime=value=>typeof value==='string'&&value.length<=TIME_LENGTH&&lib.parseRfc3339(value)!==null?value:null;
  const reviewed=isRecord(record.declaration)?record.declaration.reviewed_at:undefined;
  const reviewedAt=lib.parseRfc3339(reviewed),asOfAt=lib.parseRfc3339(asOfValue);
  const recordOrigin=originOf(isRecord(record.host)?record.host.canonical_url:undefined);
  const originRelation=given===null?'not_compared':recordOrigin===null?'unknown':recordOrigin===given?'same_origin':'different_origin';
  const checkOf=(state,issues)=>({state,issues:issues.length,limit:ISSUE_LIMIT,by_code:countIssues(issues,topLevel).byCode});
  const rowsText=JSON.stringify(issueRows);

  return withExit({
    schema:SCHEMA,kind:'door-rights',
    scope:'Whether one local file, read as a Covenant 0.1 adoption record, raises issues under the rules installed in this checkout, and which of its evidence had expired at as_of. Nothing was fetched or sent, and nothing the record says was verified.',
    not_established:[
      'that the host does what the record says: a record that agrees with itself is not evidence of practice',
      'that any outcome, evidence item, digest or signature in the record is true: none was checked',
      'who wrote the record, or that the speaker it names has authority to speak for the host',
      'that this file came from the host it names, or is what that host publishes now: it was read from local disk',
      'that the release tag the record names exists, cannot move, or serves the pinned bytes',
      'that the host conforms to anything, that anyone\'s rights are respected there, or that anything is safe',
      'anything about whoever ran this command',
    ],
    input:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},
    as_of:{value:asOfValue,source:fromClock?'clock':'flag'},
    release:{relation,means:releaseMeans,
      record_pins:{covenant:pinState(covenantPin,lib.pins.covenant,'covenant_sha256'),adoption_schema:pinState(schemaPin,lib.pins.adoptionSchema,'adoption_schema_sha256')},
      compared_with:{installed:{tag:lib.release.tag,covenant_sha256:lib.pins.covenant,adoption_schema_sha256:lib.pins.adoptionSchema},earlier_snapshots:EARLIER_SNAPSHOTS.map(row=>({...row}))}},
    finding:{word:FINDING_WORDS[reason],reason,covers:'Whether this file raises an issue under the rules installed in this checkout. Not what the host does.'},
    under_installed_rules:{
      label:`Raised by the two checks installed in this checkout (covenant/0.1, release tag ${lib.release.tag}). ${relation==='installed'?'The record pins these bytes.':
        'The record pins other bytes, so these are not a finding about the record: they include the pin differences themselves, and anything the two sets of rules treat differently.'}`,
      json_schema:checks.schema.state==='run'?checkOf('run',schemaIssues):{state:'not_run',reason:checks.schema.reason,how:NOT_RUN_HOW[checks.schema.reason]},
      cross_document:checkOf('run',crossIssues),
      issues_by_top_level_field:counted.byField,
      issues_in_ledger_rows:{issues:counted.inLedger,duty_rows_with_an_issue:counted.rows},
    },
    expiry:{
      rule:'Evidence is counted as expired when its expires_at is at or before as_of.',
      evidence_with_expiry:ledger.expiry.with,expired_at_as_of:ledger.expiry.expired,
      pass_rows:ledger.expiry.pass,pass_rows_on_expired_evidence:expiredPasses,pass_rows_with_no_readable_expiry:ledger.expiry.passUnreadable,
      earliest_expires_at:shownTime(ledger.expiry.earliest),latest_expires_at:shownTime(ledger.expiry.latest),
      note:'The installed rules compare expires_at with the record\'s own reviewed_at only. The comparison with as_of is made by this command, with compareRfc3339 from covenant/0.1/rfc3339.mjs.',
    },
    record_says:{
      note:'Copied or counted from the record, in its own words. Whoever wrote the file wrote these, and this command checked none of them. `other` is a value outside the installed lists, or no value.',
      host_origin:recordOrigin,
      declaration_status:word(isRecord(record.declaration)?record.declaration.status:undefined,RECORD_WORDS.declaration_status),
      speaker_authority_state:word(isRecord(record.declaration)&&isRecord(record.declaration.speaker)?record.declaration.speaker.authority_state:undefined,RECORD_WORDS.speaker_authority_state),
      reviewed_at:{value:shownTime(reviewed),whole_days_before_as_of:reviewedAt===null?null:Number((asOfAt.wholeSeconds-reviewedAt.wholeSeconds)/86400n)},
      duty_rows:ledger.rows,outcomes:ledger.outcomes,evidence_states:ledger.evidenceStates,right_states:ledger.rightStates,
    },
    checked_by_this_command:{
      pass_rows_checked:0,signatures_verified:0,evidence_fetched:0,digests_recomputed:0,speaker_authenticated:false,release_tag_observed:false,
      relation_to_origin:{given,relation:originRelation,means:ORIGIN_MEANS[originRelation]},
      note:'The two pinned digests were compared, as text, with digests of the files installed in this checkout and with the earlier snapshot written down in this command. No source was fetched, and no digest the record gives for evidence, a subject or an artifact was recomputed.',
    },
    ...exitFields(code,exitReason),
    issues:full?{count:issueRows.length,rows:issueRows}:{included:false,count:issueRows.length,bytes:Buffer.byteLength(rowsText),sha256:createHash('sha256').update(rowsText).digest('hex')},
  },code);
}
