// SPDX-License-Identifier: MPL-2.0
// Pure helpers over the parsed motif map (motifs.json): the index `motifs` prints, one entry with what touches it,
// where an earlier name went, the path line, and the page tools/render-motifs.mjs writes. The caller reads the files
// and passes them in; nothing here touches a file, the network or a clock, and every value returned is a copy.
export const MOTIF_OUTPUT_LIMIT_BYTES=8192;
export const MAP_FILE='agent-first/0.1/motifs.json';
// The page tools/render-motifs.mjs writes from the map with renderMotifs below.
export const PAGE_FILE='agent-first/0.1/MOTIFS.md';
const SCHEMA='xenia.agent-first/0.1-development';
// The vocabulary whose ids a reader of `.motifs[].id` may still hold.
const KIT_MAP='kit-map';
// What a card leaves open, taken from the map's own list: the four that are about the entry it prints, and the one
// about the caller, since a card can be read without the index. Its practice says what the pieces do, so a card needs
// no line of its own on how to read it.
const CARD_NOT_ESTABLISHED=['that any duty is met','that an entry describes a running service','that a passing check establishes a motif','that a mapping is right beyond its pointers resolving',
  'anything about a caller\'s identity, authority, safety or inner state'];
// Not every command's output carries its own not_established (`catalog`, `explain`, `motifs study list` and
// `motifs study help`, for example, print none), so the note says only what `does` is, and where the usage is.
const COMMANDS_NOTE='`does` is what a command does here, not what it establishes; `help <command>` gives its usage.';
const copy=value=>structuredClone(value);
const idsOf=map=>map.motifs.map(entry=>entry.id);
const entryOf=(map,id)=>map.motifs.find(entry=>entry.id===id);

// One line: the ground, the cards along their then edges, the back edges, the optional return and the crossing.
export function pathLine(map){
  const of=place=>map.motifs.filter(entry=>entry.place===place).map(entry=>entry.id);
  const edges=kind=>map.edges.filter(edge=>edge.kind===kind);
  const then=edges('then');
  const cards=of('card');
  const path=[cards.find(id=>!then.some(edge=>edge.to===id))];
  for(let next=then.find(edge=>edge.from===path.at(-1));next&&!path.includes(next.to);next=then.find(edge=>edge.from===path.at(-1)))path.push(next.to);
  const pairs=list=>list.map(edge=>`${edge.from} → ${edge.to}`).join(', ');
  const parts=[`Ground: ${of('ground').join(', ')}.`,`Cards, in a reading order that nothing enforces: ${path.join(' → ')}.`];
  if(edges('back').length)parts.push(`Back: ${pairs(edges('back'))}.`);
  if(edges('optional-return').length)parts.push(`Optional return: ${pairs(edges('optional-return'))}.`);
  if(of('crossing').length)parts.push(`Crossing: ${of('crossing').join(', ')}.`);
  return parts.join(' ');
}

// The ids of the kit map that are not ids now, each with its status (a split is not a rename) and where it went.
function renamed(map){
  const ids=idsOf(map);
  return map.reconciliation.name_rows.filter(row=>row.vocabulary===KIT_MAP&&!ids.includes(row.name)).map(({name,status,now})=>({name,status,now:[...now]}));
}

export function motifIndex(map){
  return {schema:SCHEMA,kind:'motif-index',status:map.status,
    use:`Optional; no command needs this map. The whole map is ${MAP_FILE}.`,
    reading:map.reading,
    fields:copy(map.fields),
    path:pathLine(map),
    page:PAGE_FILE,
    entries:map.motifs.map(({id,place,title,question})=>({id,place,title,...(question===undefined?{}:{question})})),
    edges:copy(map.edges),
    edge_kinds:map.edge_kinds.map(({id,meaning})=>({id,meaning})),
    studies:copy(map.studies),
    without_study:copy(map.without_study),
    renamed:renamed(map),
    self_sufficiency:{motifs_and_catalog:map.self_sufficiency.motifs_and_catalog,network:map.self_sufficiency.network},
    next:[
      {argv:['motifs','standing'],why:'Read one entry and what touches it.'},
      {argv:['motifs','study','list'],why:'List the studies.'},
      {argv:['motifs','study','journey'],why:'Run the studies on synthetic input; needs the Xenia build.'}],
    not_established:[...map.not_established]};
}

// One entry exactly as the map has it, with the edges, commands, modules and studies that name it; undefined when
// the map has no entry with that id.
export function motifCard(map,id){
  const entry=typeof id==='string'?entryOf(map,id):undefined;
  if(!entry)return undefined;
  return {schema:SCHEMA,kind:'motif-card',motif:copy(entry),
    edges:copy(map.edges.filter(edge=>edge.from===id||edge.to===id)),
    commands:map.commands.filter(row=>row.motifs.includes(id)).map(({argv,does})=>({argv:[...argv],does:copy(does)})),
    commands_note:COMMANDS_NOTE,
    modules:copy(map.modules.filter(row=>row.motif===id||row.also?.includes(id))),
    studies:copy(map.studies.filter(row=>row.motif===id)),
    not_established:map.not_established.filter(item=>CARD_NOT_ESTABLISHED.includes(item))};
}

// A word that is not an entry id: {now_at} when the reconciliation has it as an earlier name, {study} when it is a
// study id, {face_of} when it is <entry id>/<face> for a face that entry has, and undefined otherwise. Only the map's
// own words are returned, never the word given.
export function earlierName(map,word){
  if(typeof word!=='string'||idsOf(map).includes(word))return undefined;
  const study=map.studies.find(row=>row.study===word);
  if(study)return {study:study.study};
  const row=map.reconciliation.name_rows.find(item=>item.name===word);
  if(row)return {now_at:[...row.now]};
  const [head,face,...more]=word.split('/');
  const entry=more.length===0&&face!==undefined?entryOf(map,head):undefined;
  return entry&&Object.hasOwn(entry.faces??{},face)?{face_of:entry.id}:undefined;
}

// The page, MOTIFS.md: every string of the map, in the order of the file, with the titles of the dimensions, rights and
// limits it relates, read from the parsed spec.json and covenant/0.1/covenant.json the caller passes in. A right is not
// stored in the map; its row lists the entries its duties relate to. No duty's text is quoted; the page links to the
// Covenant, where it is. A field, key or id this function has no rendering for is an error, so nothing of the map is
// left off the page without notice. Its shape, a pure function from the parsed map to the lines of a page, follows
// renderMotifs in modules/0.1/motifs.mjs at beed37a, the other lineage (MPL-2.0; see LINEAGE.md). The code is new.
const PAGE_TOOL='tools/render-motifs.mjs';
const UP='../../';
const MAP_KEYS=['schema','status','license','activation','reading','places','fields','revisions','motifs','edge_kinds','edges','studies','without_study','commands','modules','cross_index','reconciliation','not_established','self_sufficiency'];
const LABELS={question:'Question',purpose:'Purpose',needs:'Needs',produces:'Produces',practice:'Practice',holds_in:'Holds in',boundary:'Boundary',limit:'Limit',
  on_change:'On change',on_exit:'On exit',sources:'Sources',implementation:'Implementation',checks:'Checks',dimensions:'Dimensions',covenant:'Covenant',not_covered:'Not covered'};
const PROSE=new Set(['question','purpose','practice','boundary','limit','on_change','on_exit']);
const LISTS=new Set(['needs','produces','holds_in','not_covered']);
const code=text=>'`'+text+'`';
const quote=text=>'“'+text+'”';
const fail=what=>{throw new Error(`renderMotifs: ${what}`);};
function only(value,keys,where){
  for(const key of Object.keys(value))if(!keys.includes(key))fail(`no rendering for ${where}.${key}`);
  return value;
}
// A file of the checkout, linked from the page's folder. An anchor is kept in the link for a Markdown heading only.
const fileLink=(file,anchor)=>`[${code(anchor===undefined?file:`${file}#${anchor}`)}](${UP}${file}${anchor!==undefined&&file.endsWith('.md')?`#${anchor}`:''})`;
const sourceLink=source=>{const at=source.indexOf('#');return at<0?fileLink(source):fileLink(source.slice(0,at),source.slice(at+1));};
const shown=(item,where)=>{
  only(item,['path','test','not_tested'],where);
  return `${fileLink(item.path)}: ${item.test===null?`no test. ${item.not_tested}`:quote(item.test)}`;
};
const checkLine=(check,where)=>{
  only(check,['path','test','invariant','runs_by_default','needs'],where);
  const run=check.runs_by_default?'In a default `npm test` run.':`Not in a default \`npm test\` run${check.needs===undefined?'':`; needs ${check.needs}`}.`;
  return `${fileLink(check.path)}: ${quote(check.test)}. Invariant: ${check.invariant}. ${run}`;
};
const cell=text=>String(text).replaceAll('|','\\|');
const table=(head,rows)=>[`| ${head.join(' | ')} |`,`|${head.map(()=>'---').join('|')}|`,...rows.map(row=>`| ${row.map(cell).join(' | ')} |`),''];
const list=items=>[...items.map(item=>`- ${item}`),''];
const cap=word=>word[0].toUpperCase()+word.slice(1);

function titlesOf(spec,covenant){
  return {
    dimensions:new Map(spec.dimensions.map(item=>[item.id,item])),
    duties:new Map(covenant.rights.flatMap(right=>right.requirements.map(duty=>[duty.id,right]))),
    limits:new Map(covenant.protective_limits.map(item=>[item.id,item]))};
}

// A face's fields carry the face's name in their label.
function fieldLines(key,value,titles,where,face){
  const label=(LABELS[key]??fail(`no rendering for ${where}.${key}`))+(face===undefined?'':` (${face})`);
  if(PROSE.has(key))return [`**${label}:** ${value}`,''];
  if(LISTS.has(key))return [`**${label}:**`,'',...list(value)];
  if(key==='sources')return [`**${label}:**`,'',...list(value.map(sourceLink))];
  if(key==='implementation')return [`**${label}:**`,'',...list(value.map(item=>{only(item,['path','symbol'],`${where}.implementation`);return `${fileLink(item.path)}: ${code(item.symbol)}`;}))];
  if(key==='checks')return [`**${label}:**`,'',...list(value.map(check=>checkLine(check,`${where}.checks`)))];
  if(key==='dimensions')return [`**${label}:**`,'',...list(value.map(item=>{
    only(item,['id','part'],`${where}.dimensions`);
    const dimension=titles.dimensions.get(item.id)??fail(`${where}: no dimension ${item.id} in spec.json`);
    return `${code(item.id)}, ${dimension.title}, at ${code(item.part)}`;
  }))];
  if(key==='covenant')return [`**${label}:**`,'',...list(value.map(item=>{
    only(item,['id','via'],`${where}.covenant`);
    const right=titles.duties.get(item.id),limit=titles.limits.get(item.id);
    const what=right?`a duty of the right ${right.title} (${code(right.id)})`:limit?`the protective limit ${limit.title}`:fail(`${where}: no duty or limit ${item.id} in the Covenant`);
    // The relation is to the duty's subject; the test checks a mechanism, and does not show the duty met.
    return `${code(item.id)}, ${what}: its subject is touched by the mechanism that ${quote(item.via)} checks; that does not show the ${right?'duty met':'limit held'}.`;
  }))];
  return fail(`no rendering for ${where}.${key}`);
}

function entryLines(map,entry,titles){
  const lines=[];
  const where=entry.id;
  for(const [key,value] of Object.entries(entry)){
    if(key==='id')lines.push(`#### ${value}`,'');
    else if(key==='place')continue;
    else if(key==='title')lines.push(`**${value}**`,'');
    else if(key==='where')lines.push('**Where:**','',...table(['Entry','What','Shown by'],value.map(row=>{
      only(row,['motif','what','shown_by'],`${where}.where`);
      return [entryLink(map,row.motif),row.what,shown(row.shown_by,`${where}.where.shown_by`)];
    })));
    else if(key==='faces')for(const [name,face] of Object.entries(value)){
      lines.push(`**Face ${code(name)}.** Owner: ${face.owner}. Holds: ${face.holds}.`,'');
      for(const [field,item] of Object.entries(face))if(field!=='owner'&&field!=='holds')lines.push(...fieldLines(field,item,titles,`${where}.faces.${name}`,name));
    }
    else if(key==='from'){
      const claims=Object.entries(value).map(([field,claim])=>{only(claim,['source','as'],`${where}.from`);return `${code(field)} ${claim.as}, from ${code(claim.source)}`;});
      lines.push(`**From earlier text:** ${claims.length?`${claims.join('; ')}. A field not named here is new.`:'none; each field is new.'}`,'');
    }
    else lines.push(...fieldLines(key,value,titles,where));
  }
  const touching=[
    ['Edges',map.edges.filter(edge=>edge.from===entry.id||edge.to===entry.id).map(edge=>`${entryLink(map,edge.from)} → ${entryLink(map,edge.to)} (${edge.kind})`)],
    ['Commands',map.commands.filter(row=>row.motifs.includes(entry.id)).map(row=>code(row.argv.join(' ')))],
    ['Modules',map.modules.filter(row=>row.motif===entry.id||row.also?.includes(entry.id)).map(row=>code(row.id))],
    ['Studies',map.studies.filter(row=>row.motif===entry.id).map(row=>`${code(row.study)} (${row.relation})`)]];
  lines.push('**What touches it**, from the tables below:','',...list(touching.map(([name,items])=>`${name}: ${items.length?items.join(', '):'none'}.`)));
  return lines;
}

// An entry id links to its heading; continuity/carried to continuity's. Anything else is shown as code.
function entryLink(map,id){
  const ids=idsOf(map);
  if(ids.includes(id))return `[${id}](#${id})`;
  const head=id.split('/')[0];
  return id.includes('/')&&ids.includes(head)?`[${id}](#${head})`:code(id);
}

function crossIndexLines(map,{spec,covenant},titles){
  const index=map.cross_index;
  only(index,['meaning','dimensions_from','duties_from','limits_from','rights_note','not_covered'],'cross_index');
  const related=new Map();
  const relate=(id,entry,last)=>related.set(id,[...(related.get(id)??[]),{entry,last}]);
  for(const entry of map.motifs){
    for(const item of entry.dimensions??[])relate(item.id,entry.id,code(item.part));
    for(const item of entry.covenant??[])relate(item.id,entry.id,quote(item.via));
  }
  const gaps=new Map(index.not_covered.map(item=>{only(item,['id','why'],'cross_index.not_covered');return [item.id,item.why];}));
  const known=new Set([...titles.dimensions.keys(),...titles.duties.keys(),...titles.limits.keys()]);
  for(const id of [...related.keys(),...gaps.keys()])if(!known.has(id))fail(`the cross-index names ${id}, which spec.json and the Covenant do not have`);
  const status=id=>{
    const rows=related.get(id)??[];
    if(rows.length)return [rows.map(row=>entryLink(map,row.entry)).join(', '),rows.map(row=>row.last).join('; ')];
    return gaps.has(id)?['not covered',gaps.get(id)]:['none','none'];
  };
  const rights=covenant.rights.map(right=>{
    const duties=new Set(right.requirements.map(duty=>duty.id));
    const entries=map.motifs.filter(entry=>entry.covenant?.some(item=>duties.has(item.id))).map(entry=>entryLink(map,entry.id));
    return [code(right.id),right.title,entries.length?entries.join(', '):'none'];
  });
  return ['## Cross-index','',index.meaning,'',
    '### Dimensions','',`Read from ${code(index.dimensions_from)}. [The root README](${UP}README.md#how-to-read-this-standard) says how the dimensions are read.`,'',
    ...table(['Dimension','Title','Related to','Part, or why it is not covered'],spec.dimensions.map(item=>[code(item.id),item.title,...status(item.id)])),
    '### Covenant rights','',`In [motifs.json](motifs.json): ${index.rights_note} The rows below are read from the duties.`,'',
    ...table(['Right','Title','Entries, from its duties'],rights),
    '### Covenant duties','',`Read from ${code(index.duties_from)}. The text of each duty is in [the Covenant](${UP}covenant/0.1/README.md).`,'',
    ...table(['Duty','Right','Related to','Mechanism checked by, or why it is not covered'],covenant.rights.flatMap(right=>right.requirements.map(duty=>[code(duty.id),code(right.id),...status(duty.id)]))),
    '### Protective limits','',`Read from ${code(index.limits_from)}.`,'',
    ...table(['Limit','Title','Related to','Mechanism checked by, or why it is not covered'],covenant.protective_limits.map(item=>[code(item.id),item.title,...status(item.id)]))];
}

function earlierLines(map){
  const record=map.reconciliation;
  only(record,['meaning','vocabularies','name_rows','edge_rows','field_rows','provenance'],'reconciliation');
  const rows=(list,where)=>list.map(row=>{
    only(row,['name','vocabulary','source','status','now','source_question','note'],where);
    const asked=row.source_question===undefined?'':` Earlier question: ${quote(row.source_question)}`;
    return [code(row.vocabulary),code(row.name),code(row.status),row.now.length?row.now.map(item=>entryLink(map,item)).join(', '):'none',code(row.source),row.note+asked];
  });
  const head=['Vocabulary','Name','Status','Now','Source','Note'];
  return ['## Earlier names','',record.meaning,'',
    `Revisions read: ${Object.entries(map.revisions).map(([short,full])=>`${code(short)} is ${code(full)}`).join('; ')}.`,'',
    '### Vocabularies','',...list(record.vocabularies.map(item=>{
      only(item,['id','source','also','what'],'reconciliation.vocabularies');
      return `${code(item.id)}: ${code(item.source)}${item.also?`, with ${item.also.map(code).join(', ')}`:''}. ${item.what}`;
    })),
    '### Earlier names of entries','',...table(head,rows(record.name_rows,'reconciliation.name_rows')),
    '### Earlier edges','',...table(head,rows(record.edge_rows,'reconciliation.edge_rows')),
    '### Earlier fields','',...table(head,rows(record.field_rows,'reconciliation.field_rows')),
    record.provenance,''];
}

export function renderMotifs(map,{spec,covenant}){
  only(map,MAP_KEYS,'map');
  const titles=titlesOf(spec,covenant);
  for(const entry of map.motifs)if(!Object.hasOwn(map.places,entry.place))fail(`${entry.id}: no place ${entry.place}`);
  const lines=['<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->',
    `<!-- Generated by ${PAGE_TOOL} from motifs.json, with titles read from spec.json and covenant/0.1/covenant.json. To change this page, edit motifs.json, then run: node ${PAGE_TOOL} --write -->`,
    '# The motif map','',
    `[motifs.json](motifs.json) as a page: schema ${code(map.schema)}, status ${code(map.status)}, license ${map.license}, activation ${String(map.activation)}. Where the two differ, the file is what the door reads; \`npm test\` runs \`node ${PAGE_TOOL} --check\`, which compares them. \`npm run --silent xenia -- motifs\` prints an index of the map, and \`motifs <id>\` prints one entry with what touches it.`,'',
    map.reading,'',
    '## The path','',pathLine(map),'',
    ...table(['Edge kind','Meaning','Checked by'],map.edge_kinds.map(kind=>{only(kind,['id','meaning','checked_by'],'edge_kinds');return [code(kind.id),kind.meaning,shown(kind.checked_by,'edge_kinds.checked_by')];})),
    ...table(['From','To','Kind','Meaning','Shown by'],map.edges.map(edge=>{
      only(edge,['from','to','kind','meaning','shown_by'],'edges');
      return [entryLink(map,edge.from),entryLink(map,edge.to),code(edge.kind),edge.meaning,edge.shown_by?shown(edge.shown_by,'edges.shown_by'):'none'];
    })),
    '## Fields','',...list(Object.entries(map.fields).map(([field,meaning])=>`${code(field)}: ${meaning}`)),
    'An entry\'s `from` names each field taken from earlier text, its source, and how it was taken: verbatim, extended or reworded. A field it does not name is new.','',
    '## Entries',''];
  for(const [place,meaning] of Object.entries(map.places)){
    lines.push(`### ${cap(place)}`,'',`Place ${code(place)}: ${meaning}`,'');
    for(const entry of map.motifs.filter(item=>item.place===place))lines.push(...entryLines(map,entry,titles));
  }
  lines.push('## Studies','','The studies are their own id space, run by `motifs study`; [MOTIF-STUDIES.md](MOTIF-STUDIES.md) describes them.','',
    ...table(['Study','Entry','Relation','Limit'],map.studies.map(row=>{only(row,['study','motif','relation','limit'],'studies');return [code(row.study),entryLink(map,row.motif),code(row.relation),row.limit];})),
    `Without a study (${map.without_study.meaning}): ${map.without_study.ids.map(id=>entryLink(map,id)).join(', ')}.`,'',
    '## Commands','',`${COMMANDS_NOTE} One row for each line of \`help\`.`,'',
    ...table(['Command','Does','Entries'],map.commands.map(row=>{
      only(row,['argv','does','motifs'],'commands');
      return [code(row.argv.join(' ')),row.does.map(item=>{only(item,['what','when'],'commands.does');return item.when===undefined?item.what:`${item.what} (${item.when})`;}).join('; '),row.motifs.map(id=>entryLink(map,id)).join(', ')];
    })),
    '## Modules','',
    ...table(['Module','Entry','Face','Also'],map.modules.map(row=>{
      only(row,['id','motif','face','also'],'modules');
      return [code(row.id),entryLink(map,row.motif),row.face===undefined?'none':code(row.face),row.also?row.also.map(id=>entryLink(map,id)).join(', '):'none'];
    })),
    ...crossIndexLines(map,{spec,covenant},titles),
    ...earlierLines(map),
    '## What it needs','',...list(Object.entries(map.self_sufficiency).map(([key,value])=>`${code(key)}: ${Array.isArray(value)?value.join(', '):value}`)),
    '## Not established','','This map does not establish:','',...list(map.not_established));
  return lines.join('\n');
}
