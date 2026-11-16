// SPDX-License-Identifier: MPL-2.0
// Pure helpers over the parsed motif map (motifs.json): the index `motifs` prints, one entry with what touches it,
// where an earlier name went, and the path line. The caller reads the file and passes the map in; nothing here
// touches a file, the network or a clock, and every value returned is a copy.
export const MOTIF_OUTPUT_LIMIT_BYTES=8192;
export const MAP_FILE='agent-first/0.1/motifs.json';
const SCHEMA='xenia.agent-first/0.1-development';
// The vocabulary whose ids a reader of `.motifs[].id` may still hold.
const KIT_MAP='kit-map';
// What a card leaves open, taken from the map's own list: the four that are about the entry it prints.
const CARD_NOT_ESTABLISHED=['that any duty is met','that an entry describes a running service','that a passing check establishes a motif','that a mapping is right beyond its pointers resolving'];
// Not every command's output carries its own not_established (`explain` and `motifs study help` print none), so the
// note says only what `does` is.
const COMMANDS_NOTE='`does` says what each command does here, not what it establishes.';
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

// The ids of the kit map that are not ids now, each with where it went.
function renamed(map){
  const ids=idsOf(map);
  return map.reconciliation.name_rows.filter(row=>row.vocabulary===KIT_MAP&&!ids.includes(row.name)).map(({name,now})=>({name,now:[...now]}));
}

export function motifIndex(map){
  return {schema:SCHEMA,kind:'motif-index',status:map.status,
    use:`Optional; no command needs this map. \`motifs <id>\` prints one entry and what touches it. The whole map, every field, is ${MAP_FILE}.`,
    reading:map.reading,
    path:pathLine(map),
    entries:map.motifs.map(({id,place,title,question})=>({id,place,title,...(question===undefined?{}:{question})})),
    edges:copy(map.edges),
    edge_kinds:map.edge_kinds.map(({id,meaning})=>({id,meaning})),
    studies:copy(map.studies),
    without_study:copy(map.without_study),
    renamed:renamed(map),
    self_sufficiency:{motifs_and_catalog:map.self_sufficiency.motifs_and_catalog,network:map.self_sufficiency.network},
    next:[
      {argv:['motifs','standing'],why:'Read one entry and what touches it.'},
      {argv:['motifs','study','list'],why:'List the studies and the entries they relate to.'},
      {argv:['motifs','study','journey'],why:'Run the four studies on synthetic input. Needs the Xenia build.'}],
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
// study id, and undefined otherwise. Only the map's own words are returned, never the word given.
export function earlierName(map,word){
  if(typeof word!=='string'||idsOf(map).includes(word))return undefined;
  const study=map.studies.find(row=>row.study===word);
  if(study)return {study:study.study};
  const row=map.reconciliation.name_rows.find(item=>item.name===word);
  return row?{now_at:[...row.now]}:undefined;
}
