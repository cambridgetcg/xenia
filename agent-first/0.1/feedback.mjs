// SPDX-License-Identifier: MPL-2.0
// `feedback new` and `feedback check`: the form AGENT-FEEDBACK.md describes,
// as a blank entry and as a line-by-line reading of a written one.
//
// The form is not invented here. The layout (a dated heading, then a list of
// bold-labelled fields) and six of the eight fields are those of the entry
// already in the notebook (2026-07-11). The other two, Network vantage and
// Reply path, are not in that entry: they answer bullets 3 and 7. The
// sections answer the eight bullets under "When adding an entry, say:", and
// each part below quotes the words of the bullet it answers; a test compares
// them with the notebook. A file is read with the kit's bounded, no-follow
// reader (input-file.mjs).
//
// Neither command sends, delivers or decides anything, and neither reads a
// clock. `feedback new --out` creates one file, and only when nothing is at
// that path. The notebook does not require this form, and both outputs say so.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ModuleError,MODULE_INPUT_LIMITS} from './runtime.mjs';
import {readBoundedBytes,decodeUtf8} from './input-file.mjs';
import {FEEDBACK_FLAGS,REPORT_ROUTE,exitFields,missingFlags,parseFlags,withExit} from './problems.mjs';

const SCHEMA='xenia.agent-first/0.1-development';
const NOTEBOOK=new URL('../../AGENT-FEEDBACK.md',import.meta.url);
// The same 1 MiB as an `invoke` input.
export const INPUT_LIMIT_BYTES=MODULE_INPUT_LIMITS.maxBytes;
const NOTEBOOK_LIMIT_BYTES=4*1024*1024;
// The warning patterns are applied to this many characters of a line; a longer line is reported.
export const SCAN_LINE_LIMIT=2000;
export const ROW_LIMIT=20;
const ID_LENGTH=100;
const STATUS_WORDS=['open','resolved','declined','superseded'];
const NEEDED=['dated_heading','entry_id','observed_at','speaker','status','filled_section'];

// One table for both commands. `bullet` is the bullet under "When adding an
// entry, say:" in AGENT-FEEDBACK.md that the part answers, and `asks` quotes
// it. A part with no bullet comes from the form of the entry already there.
const part=(kind,label,bullet,asks,needed=false)=>Object.freeze({kind,label,bullet,asks,needed_for_exit_0:needed});
export const PARTS=Object.freeze([
  part('heading','Dated heading',null,'the date as YYYY-MM-DD, then a name or description for the writer, or the word anonymous',true),
  part('field','Entry ID',null,'`xenia-feedback-YYYYMMDD-label-NNN`: the date, a short lowercase label, a three-digit number',true),
  part('field','Observed at',null,'YYYY-MM-DD first; a time zone or place after it, if you want to give one',true),
  part('field','Speaker',1,'who is speaking, as a voluntary self-description',true),
  part('field','Identity proof',1,'what identity proof (if any) supports that exact claim'),
  part('field','Source snapshots',3,'which tool and version or source snapshot you used'),
  part('field','Network vantage',3,'what network vantage was actually known, and what remained unknown'),
  part('field','Reply path',7,'where a reply or challenge can be made, when such a path exists'),
  part('field','Status',null,'open for a new entry; the notebook also keeps resolved, declined and superseded entries',true),
  part('section','How I arrived and what I could inspect',2,'how you arrived and what you could inspect'),
  part('section','Actions taken',4,'which requests or other actions you took, what credentials and limits applied, and which writes or other side effects were or were not established'),
  part('section','What reduced friction',5,'what reduced or increased friction'),
  part('section','What increased friction',5,'what reduced or increased friction'),
  part('section','Observed',6,'what you directly observed'),
  part('section','Inferred',6,'what you inferred'),
  part('section','Declared by the subject',6,'what the subject declared'),
  part('section','Unknown',6,'what you still do not know'),
  part('section','What I would keep',8,'what you would keep or change'),
  part('section','What I would change',8,'what you would keep or change'),
]);
const FIELDS=PARTS.filter(item=>item.kind==='field'),SECTIONS=PARTS.filter(item=>item.kind==='section');
const flat=text=>text.replace(/\s+/g,' ').trim().toLowerCase();
const FIELD_KEYS=new Set(FIELDS.map(item=>flat(item.label)));

const OPENING='A blank entry in the form AGENT-FEEDBACK.md describes. Each comment says what could go in its place, and `feedback check` does not read a comment as content. '+
  'Any part can be left out or written another way: the notebook does not require this form, and it allows anonymous reports.';
const hint=item=>`<!-- ${item.bullet===null?'':`notebook bullet ${item.bullet}: `}${item.asks} -->`;
// The same bytes every time: no date is filled in, because no clock is read.
export function blankEntry(){
  return [
    `<!-- ${OPENING} -->`,'',
    `## YYYY-MM-DD: ${hint(PARTS[0])}`,'',
    ...FIELDS.map(item=>`- **${item.label}:** ${item.label==='Status'?'open':hint(item)}`),'',
    ...SECTIONS.flatMap(item=>[`### ${item.label}`,'',hint(item),'']),
  ].join('\n');
}

const digest=bytes=>({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
const OPEN_REASONS={EEXIST:'already_exists',EISDIR:'already_exists',ENOENT:'parent_missing',ENOTDIR:'parent_not_a_directory',EACCES:'not_permitted',EPERM:'not_permitted',EROFS:'not_permitted'};
const refuse=reason=>Object.assign(new ModuleError('INVALID_OUTPUT'),{reason});

// deps.write exists for tests; the CLI passes nothing.
export function feedbackNew({out}={},deps={}){
  const text=blankEntry(),bytes=Buffer.from(text,'utf8');
  const written=out!==undefined;
  if(written){
    if(typeof out!=='string'||!out)throw new ModuleError('INVALID_ARGUMENTS');
    if(!path.isAbsolute(out))throw refuse('relative_path');
    // Such a path fails to open with a code that differs by platform, and none of them says why.
    if(out.endsWith('/')||out.endsWith(path.sep))throw refuse('names_a_folder');
    // 'wx' creates the file only if nothing is at the path; a link there, even a dangling one, is refused too.
    let fd;
    try{fd=fs.openSync(out,'wx');}catch(error){throw refuse(OPEN_REASONS[error?.code]??'could_not_create');}
    let failed=false;
    try{(deps.write??fs.writeFileSync)(fd,bytes);}catch{failed=true;}
    try{fs.closeSync(fd);}catch{failed=true;}
    if(failed)throw Object.assign(new ModuleError('OPERATION_FAILED',true),{reason:'output_write_incomplete'});
  }
  return withExit({
    schema:SCHEMA,kind:'feedback-blank-entry',
    scope:written?
      'A blank feedback entry in the form `feedback check` reads, written to one new file at the path given. This command read no clock and no input file, wrote nothing else and sent nothing.':
      'A blank feedback entry in the form `feedback check` reads. This command read no clock and no input file, wrote nothing and sent nothing.',
    not_established:[
      'that the notebook requires this form: it does not, and an entry written another way is still an entry',
      'that a written entry will be read, merged or answered',
      'that the blank entry asks for everything worth saying: it follows the eight bullets in AGENT-FEEDBACK.md and the form of the entry already there',
      'anything about whoever ran this command',
    ],
    notebook_requires_this_form:false,
    written_to_file:written,
    entry:{media_type:'text/markdown; charset=utf-8',...digest(bytes),...(written?{}:{text})},
    parts_note:'needed_for_exit_0 marks the five parts `feedback check` needs for exit 0; it also needs at least one section with text, whichever one. Every other part can be left out. '+
      'Speaker needs only some text: the notebook allows anonymous reports, and nothing is inferred from what is written there. '+
      'bullet is the bullet under "When adding an entry, say:" in AGENT-FEEDBACK.md that the part answers; null means the part comes from the form of the entry already in the notebook. '+
      'What each part asks for is said once, in the entry itself, as the comment beside its label.',
    // The hint each part carries is in the entry text and is not repeated here.
    parts:PARTS.map(({asks,...item})=>item),
    next:[{argv:['feedback','check'],needs:['--input <file>'],why:'Read a written entry back: which labelled parts are found, and lines that match a few warning patterns. Sends nothing.'}],
    delivered:false,
    route:REPORT_ROUTE,
    ...exitFields(0,written?'A blank entry was written to one new file. Nothing else was written, and nothing was sent.':'A blank entry was printed. Nothing was written or sent.'),
  },0);
}

// ---- reading a written entry, line by line ----
// This is not a Markdown parser. It knows four things. A fenced code block is
// content, and holds no heading, field or comment. An HTML comment is not
// content (readRows says what counts as one); a `<!--` that is not one is read
// as text, so a `<!--` quoted in a sentence does not hide the sections after
// it. A heading is `#` marks, a space and a title. A field is a list item
// that begins with a bold label and a colon. A line ends at LF, CRLF or CR.
const LINE_END=/\r\n|\n|\r/;
const HEADING=/^ {0,3}(#{1,6})[ \t]+(.*)$/s;
const FENCE=/^ {0,3}(`{3,}|~{3,})/;
const COMMENT_AT_START=/^ {0,3}<!--/;
const ITEM=/^[ \t]{0,3}[-*+][ \t]+/;
const FIELD=/^[ \t]{0,3}[-*+][ \t]+\*\*(.+?)\*\*[ \t]*(.*)$/s;
const DATE_START=/^(\d{4})-(\d{2})-(\d{2})(?![0-9])/;
const ENTRY_ID=/^xenia-feedback-(\d{4})(\d{2})(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/;

function realDate(year,month,day){
  if(year<1||month<1||month>12||day<1)return false;
  const leap=(year%4===0&&year%100!==0)||year%400===0;
  return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
const dateAt=text=>{const m=DATE_START.exec(text);return !m?undefined:realDate(Number(m[1]),Number(m[2]),Number(m[3]))?`${m[1]}-${m[2]}-${m[3]}`:null;};

function splitLines(text){
  const lines=text.split(LINE_END);
  if(lines[lines.length-1]==='')lines.pop();
  return lines;
}
// One row for each line of the file, so a row's number is its line number.
// Comments are taken out of the text of a row. A comment is `<!--` to the
// first `-->` after it:
// - on the same line; or
// - on a later line, when the `<!--` is at the start of its line; or
// - on a later line, when the `<!--` is inside a line and no blank line,
//   heading, list item or start of a fence comes first.
// Any other `<!--` stays in the text. `unclosed` holds the lines of those, and
// `several` the first line of each comment that runs over more than one line.
// Each line is looked at a fixed number of times, however many `<!--` it has.
function readRows(text){
  const raw=splitLines(text),rows=[],unclosed=[],several=[],count=raw.length;
  let comments=0,fence=null,closeFrom=null,stopFrom=null;
  // For each line, the first line at or after it that holds `-->`, and the first that ends a paragraph. Made only when needed.
  const lookAhead=()=>{
    closeFrom=new Int32Array(count+1);stopFrom=new Int32Array(count+1);
    closeFrom[count]=stopFrom[count]=count;
    for(let k=count-1;k>=0;k-=1){
      const line=raw[k];
      closeFrom[k]=line.includes('-->')?k:closeFrom[k+1];
      stopFrom[k]=!/\S/.test(line)||HEADING.test(line)||FENCE.test(line)||ITEM.test(line)?k:stopFrom[k+1];
    }
  };
  // A line outside a fence and outside a comment: the start of a fence, a heading, or text.
  const plain=(n,line)=>{
    const mark=FENCE.exec(line);
    if(mark)fence=mark[1];
    const heading=mark?null:HEADING.exec(line);
    rows.push({n,text:line,fenced:Boolean(mark),heading:heading?{level:heading[1].length,title:heading[2].trim()}:null});
  };
  for(let i=0;i<count;i+=1){
    let line=raw[i];
    if(fence){
      const mark=FENCE.exec(line);
      if(mark&&mark[1][0]===fence[0]&&mark[1].length>=fence.length&&line.trim()===mark[1])fence=null;
      rows.push({n:i+1,text:line,fenced:true,heading:null});
      continue;
    }
    // A line that starts a fence is a fence, whatever follows its marks.
    if(!line.includes('<!--')||FENCE.test(line)){plain(i+1,line);continue;}
    let kept=[],at=0,atStart=COMMENT_AT_START.test(line);
    for(;;){
      const start=line.indexOf('<!--',at);
      if(start<0){kept.push(line.slice(at));break;}
      const close=line.indexOf('-->',start+4);
      if(close>=0){kept.push(line.slice(at,start));comments+=1;at=close+3;atStart=false;continue;}
      // Not closed on this line.
      if(!closeFrom)lookAhead();
      const end=closeFrom[i+1];
      if(end>=(atStart?count:stopFrom[i+1])){kept.push(line.slice(at));unclosed.push(i+1);break;}
      // The comment runs to line `end`. What is before it on this line and after it on that one is read.
      kept.push(line.slice(at,start));comments+=1;several.push(i+1);
      plain(i+1,kept.join(''));
      for(i+=1;i<end;i+=1)rows.push({n:i+1,text:'',fenced:false,heading:null,comment:true});
      line=raw[end].slice(raw[end].indexOf('-->')+3);kept=[];at=0;atStart=false;
    }
    plain(i+1,kept.join(''));
  }
  return {rows,comments,unclosed,several};
}
const indentOf=line=>/^[ \t]*/.exec(line)[0].length;
// `- **Label:** value` or `- **Label**: value`, with any of the three list marks.
function fieldOf(row){
  if(row.fenced||row.heading)return null;
  const m=FIELD.exec(row.text);
  if(!m)return null;
  let label=m[1].trim(),rest=m[2];
  if(label.endsWith(':'))label=label.slice(0,-1);
  else if(rest.startsWith(':'))rest=rest.slice(1);
  else return null;
  return {key:flat(label),rest};
}
function readFields(rows){
  const found=new Map(),repeats=[];
  rows.forEach((row,i)=>{
    const field=fieldOf(row);
    if(!field||!FIELD_KEYS.has(field.key))return;
    if(found.has(field.key)){repeats.push(row.n);return;}
    // A value may go on over the lines after it, up to a blank line, a heading, a fence or the next list item beside it.
    // A list item indented further than the label is under it, and is part of its value. A line inside a comment is passed over.
    const value=[field.rest],own=indentOf(row.text);
    for(let j=i+1;j<rows.length;j+=1){
      const next=rows[j];
      if(next.comment)continue;
      if(next.fenced||next.heading||!/\S/.test(next.text)||(ITEM.test(next.text)&&indentOf(next.text)<=own))break;
      value.push(next.text);
    }
    found.set(field.key,{line:row.n,value:value.join('\n').trim()});
  });
  return {found,repeats};
}
// Every `###` section, and whether anything but white space is under it.
function readSections(rows){
  const sections=[];
  let current=null;
  for(const row of rows){
    if(row.heading&&row.heading.level<=3){
      current=row.heading.level===3?{title:flat(row.heading.title),text:false}:null;
      if(current)sections.push(current);
    }else if(current&&/\S/.test(row.text))current.text=true;
  }
  return sections;
}
// A heading answers a label when it is the label, or begins with it and goes on with something that is not a letter or a digit.
function sectionFor(sections,label){
  const want=label.toLowerCase();
  return sections.find(({title})=>title===want||(title.startsWith(want)&&!/^[\p{L}\p{N}]/u.test(title.slice(want.length))));
}
function entryIdIn(value){
  if(value.length>ID_LENGTH)return null;
  const text=value.replace(/^`|`$/g,'').trim();
  const m=ENTRY_ID.exec(text);
  return m&&realDate(Number(m[1]),Number(m[2]),Number(m[3]))?text:null;
}

// Fixed patterns, applied to the raw line (a comment is scanned too). Each is
// written so that a line that does not match is given up in about one pass.
// - assigned_secret: one of six words, then up to 40 more name characters, an
//   optional quote, a colon or equals sign, and 12 or more characters. So an
//   environment name (GITHUB_TOKEN=...), an ini or YAML key and a JSON key are
//   read, and `password: none` is not.
// - A path is looked for at the start of a line and after white space, a
//   quote, a bracket, `=`, `:`, and the marks an entry puts around one: `*`
//   (bold), `|` (a table cell), `<`, `>` and a comma.
// A row is a line to look at. Two shapes are flagged knowingly although they
// can hold nothing: any 20 characters after `Bearer`, and `~/` before a digit.
const PATH_START='(?:^|[\\s"\'`([=:*|<>,])';
const PATTERNS=Object.freeze([
  ['private_key_block',/-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/],
  ['aws_access_key_id',/\bAKIA[0-9A-Z]{16}\b/],
  ['github_token',/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ['bearer_value',/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['prefixed_api_key',/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{20,}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b|\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|\bwhsec_[A-Za-z0-9]{16,}|\bnpm_[A-Za-z0-9]{36}\b|\bAIza[0-9A-Za-z_-]{35}\b/],
  ['json_web_token',/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['assigned_secret',/(?:api[_-]?key|secret|token|password|passwd|authorization)[A-Za-z0-9_-]{0,40}["']?\s*[:=]\s*["']?[^\s"'`<>]{12,}/i],
  ['url_credentials',/\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@]{0,64}:[^\s/@]{3,}@/i],
  ['basic_value',/\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}/],
  ['unix_home_or_temp',new RegExp(`${PATH_START}/(?:Users|home|root|private|var/folders|tmp|Volumes|mnt)/[^\\s"'\`)\\]]+`)],
  ['tilde_home',new RegExp(`${PATH_START}~/[^\\s"'\`)\\]]+`)],
  ['windows_drive',/\b[A-Za-z]:\\[^\s"'`]+/],
  ['windows_share',/(?:^|[^\\])\\\\[A-Za-z0-9._$-]+\\[^\s"'`]+/],
  ['file_url',/\bfile:\/\/\/?[^\s"'`)]+/i],
]);
const PATTERN_KINDS=PATTERNS.length;
export const WARNING_KINDS=Object.freeze([...PATTERNS.map(([kind])=>kind),'line_not_fully_scanned','unclosed_comment','comment_over_several_lines','repeated_label','heading_date_does_not_exist']);
const NUMBER_WORDS=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen'];

// One pass over the raw lines. Rows come out in line order without sorting, and
// only the first ROW_LIMIT are kept; the rest are counted.
function readWarnings(text,{unclosed,several},repeats,noSuchDate){
  const extras=new Map();
  const extra=(line,kind)=>extras.set(line,[...(extras.get(line)??[]),kind]);
  for(const line of unclosed)extra(line,'unclosed_comment');
  for(const line of several)extra(line,'comment_over_several_lines');
  for(const line of repeats)extra(line,'repeated_label');
  for(const line of noSuchDate)extra(line,'heading_date_does_not_exist');
  const rows=[],counts=new Map();
  let count=0;
  const add=(kind,line)=>{count+=1;counts.set(kind,(counts.get(kind)??0)+1);if(rows.length<ROW_LIMIT)rows.push({kind,line});};
  splitLines(text).forEach((line,i)=>{
    if(line){
      const scanned=line.length>SCAN_LINE_LIMIT?line.slice(0,SCAN_LINE_LIMIT):line;
      for(const [kind,pattern] of PATTERNS)if(pattern.test(scanned))add(kind,i+1);
      if(scanned!==line)add('line_not_fully_scanned',i+1);
    }
    for(const kind of extras.get(i+1)??[])add(kind,i+1);
  });
  const byKind={};
  for(const kind of WARNING_KINDS)if(counts.has(kind))byKind[kind]=counts.get(kind);
  return {
    note:`Each row is a kind and a line number, never the text. ${NUMBER_WORDS[PATTERN_KINDS]} kinds are fixed patterns that look like a credential or a local path. `+
      `${NUMBER_WORDS[WARNING_KINDS.length-PATTERN_KINDS]} are about how the file was read: a line too long to scan whole; a \`<!--\` that is not closed, which was read as text; a comment over more than one line, which was not read as content; a field label given twice, of which the first was read; a level-two heading that begins with a date that does not exist, which was not read as a dated heading. `+
      'A row is a line to look at before sharing the file, not a finding that it holds a secret, and finding none is not a finding that there are none.',
    looked_for:[...WARNING_KINDS],count,by_kind:byKind,rows,more:count-rows.length,
  };
}

const NOTEBOOK_MEANS={
  found:'An entry in this checkout\'s AGENT-FEEDBACK.md already has this Entry ID. Either this entry is already there, or the ID is taken; this command does not compare the two.',
  not_found:'No entry in this checkout\'s AGENT-FEEDBACK.md has this Entry ID. The notebook anywhere else, such as a newer commit or an open pull request, was not looked at.',
  entry_not_read:'No entry was read, so there is no Entry ID to look for.',
  entry_id_not_well_formed:'No Entry ID in the form this command reads was found, so none was looked for.',
  notebook_not_present:'This copy has no AGENT-FEEDBACK.md beside the kit; a full source checkout has it.',
  notebook_unreadable:'AGENT-FEEDBACK.md beside the kit could not be read as a regular UTF-8 file of at most 4 MiB.',
};
const notChecked=reason=>({state:'not_checked',reason,means:NOTEBOOK_MEANS[reason]});
function inNotebook(id){
  let text;
  try{text=decodeUtf8(readBoundedBytes(fileURLToPath(NOTEBOOK),NOTEBOOK_LIMIT_BYTES));}
  catch(error){return notChecked(error?.reason==='missing'?'notebook_not_present':'notebook_unreadable');}
  const found=readRows(text).rows.some(row=>{
    const field=fieldOf(row);
    return field!==null&&field.key==='entry id'&&entryIdIn(field.rest.trim())===id;
  });
  return {state:found?'found':'not_found',means:NOTEBOOK_MEANS[found?'found':'not_found']};
}

export function feedbackCheck({file}={}){
  if(typeof file!=='string'||!file)throw new ModuleError('INVALID_ARGUMENTS');
  const bytes=readBoundedBytes(file,INPUT_LIMIT_BYTES);
  const text=decodeUtf8(bytes);
  if(text.charCodeAt(0)===0xfeff)throw Object.assign(new ModuleError('INVALID_INPUT'),{reason:'byte_order_mark'});

  const lines=readRows(text),rows=lines.rows;
  // A dated heading: level two, beginning with a date that exists.
  const level2=rows.filter(row=>row.heading?.level===2).map(row=>({row,date:dateAt(row.heading.title)}));
  const dated=level2.filter(item=>typeof item.date==='string');
  // A level-two heading that begins with a date that does not exist (31 November). It is not a dated heading; its line is
  // given as a warning. Beside a dated heading it is a second place the entry could begin, and this command does not choose.
  const noSuchDate=level2.filter(item=>item.date===null).map(item=>item.row.n);
  const several=dated.length>1||(dated.length===1&&noSuchDate.length>0);
  // The entry runs from its heading to the next heading of level one or two. With no dated heading, the whole file is read.
  let first=rows.length?1:null,last=rows.length?rows.length:null;
  if(dated.length===1){
    first=dated[0].row.n;
    const after=rows.find(row=>row.n>first&&row.heading&&row.heading.level<=2);
    last=after?after.n-1:rows.length;
  }
  if(several)first=last=null;
  const inEntry=several?[]:rows.slice((first??1)-1,last??0);
  const fields=readFields(inEntry),sections=readSections(inEntry);

  const fieldState=label=>{
    const field=fields.found.get(flat(label));
    return !field?{state:'not_found_by_label'}:!field.value?{state:'empty',line:field.line}:{state:'found',line:field.line,value:field.value};
  };
  const shaped=(label,read,name)=>{
    const {value,...state}=fieldState(label);
    if(state.state!=='found')return state;
    const shown=read(value);
    return shown===null||shown===undefined?{state:'not_well_formed',line:state.line}:{...state,[name]:shown};
  };
  const withText=sections.filter(section=>section.text).length;
  const notRead={state:'not_read'};
  const status=fieldState('Status');
  const parts=several?Object.fromEntries(NEEDED.map(key=>[key,notRead])):{
    dated_heading:dated.length===1?{state:'found',line:first,date:dated[0].date}:{state:noSuchDate.length?'not_well_formed':'not_found'},
    entry_id:shaped('Entry ID',entryIdIn,'value'),
    observed_at:shaped('Observed at',dateAt,'date'),
    speaker:(({value,...state})=>state)(fieldState('Speaker')),
    status:status.state==='found'?{state:'found',line:status.line,word:STATUS_WORDS.includes(status.value.toLowerCase())?status.value.toLowerCase():'other'}:status,
    filled_section:{state:withText?'found':'not_found',sections:sections.length,with_text:withText},
  };
  const labelState=item=>{
    if(several)return 'not_read';
    if(item.kind==='field'){const {state}=fieldState(item.label);return state;}
    const section=sectionFor(sections,item.label);
    return !section?'not_found_by_label':section.text?'found':'empty';
  };
  const missing=several?[]:NEEDED.filter(key=>parts[key].state!=='found');
  const [word,reason,code,exitReason]=dated.length>1?
    ['undetermined','more_than_one_dated_heading',4,`The file has ${dated.length} dated headings. This command reads one entry in a file and did not choose between them; no part was read.`]:
    several?
    ['undetermined','dated_heading_beside_one_with_no_such_date',4,`The file has one dated heading and ${noSuchDate.length} level-two heading${noSuchDate.length===1?' that begins':'s that begin'} with a date that does not exist; warnings gives ${noSuchDate.length===1?'its line':'their lines'}. `+
      'This command reads one entry in a file and did not choose where it begins; no part was read.']:
    missing.length?
    ['parts_missing','parts_not_found',3,`Not found in the form this command reads: ${missing.join(', ')}. See parts. The notebook does not require this form, so this is a finding about the form, not about what the entry says.`]:
    ['parts_found','all_parts_found',0,'A dated heading, a well-formed Entry ID, Observed at starting with a date, Speaker, Status and at least one section with text were found. A 0 covers that and nothing else: see not_established.'];
  const id=several?undefined:parts.entry_id.value;

  return withExit({
    schema:SCHEMA,kind:'feedback-check',
    scope:'Whether one local file, read line by line as a feedback entry, has five labelled parts and at least one section with text. Nothing was sent or delivered, and nothing the entry says was checked. '+
      'The only other file read is AGENT-FEEDBACK.md beside the kit, when it is there, to look for the Entry ID.',
    not_established:[
      'that anything the entry says is true, complete or fair: its words were not checked',
      'that the entry was delivered, or will be read, merged or answered: this command sends nothing',
      'that the notebook requires this form: it does not, and an entry written another way is still an entry',
      'who wrote the entry, or that the speaker it names wrote it',
      'that the warnings found every credential, local path or personal detail: they look for a few fixed patterns, on the first 2,000 characters of each line',
      'how the file renders as Markdown: it was read line by line, not parsed',
      'anything about whoever ran this command',
    ],
    notebook_requires_this_form:false,
    input:digest(bytes),
    entry:{lines:rows.length,dated_headings:dated.length,first_line:first,last_line:last,comments_ignored:lines.comments},
    finding:{word,reason,missing,covers:'Whether this file has the labelled parts this command reads. Not whether the entry is true, useful, or delivered.'},
    parts,
    bullets:{source:'AGENT-FEEDBACK.md',
      note:'Each label is one the blank entry from `feedback new` uses to answer a bullet under "When adding an entry, say:" in AGENT-FEEDBACK.md. found means a field or section with that label has text; it does not mean the text answers the bullet. '+
        'empty means the label is there with no text. not_found_by_label means only that the label was not found: the entry may say the same thing under a heading of its own. These never change the exit.',
      rows:[1,2,3,4,5,6,7,8].map(bullet=>({bullet,labels:PARTS.filter(item=>item.bullet===bullet).map(item=>({label:item.label,kind:item.kind,state:labelState(item)}))}))},
    warnings:readWarnings(text,lines,fields.repeats,noSuchDate),
    entry_id_in_notebook:several?notChecked('entry_not_read'):id===undefined?notChecked('entry_id_not_well_formed'):inNotebook(id),
    delivered:false,
    route:REPORT_ROUTE,
    ...exitFields(code,exitReason),
  },code);
}

export function runFeedbackCommand(args,deps={}){
  const [operation,...rest]=args;
  if(!Object.hasOwn(FEEDBACK_FLAGS,operation??''))throw new ModuleError('INVALID_ARGUMENTS');
  const flags=parseFlags(rest,FEEDBACK_FLAGS[operation]);
  if(!flags){
    // A required flag that was left out is named; the reason is a fixed word and nothing typed is kept.
    const missing=missingFlags(rest,FEEDBACK_FLAGS[operation]);
    throw missing?Object.assign(new ModuleError('INVALID_ARGUMENTS'),{reason:'required_flag_missing',missing}):new ModuleError('INVALID_ARGUMENTS');
  }
  return operation==='new'?feedbackNew({out:flags.values['--out']},deps):feedbackCheck({file:flags.values['--input']});
}
