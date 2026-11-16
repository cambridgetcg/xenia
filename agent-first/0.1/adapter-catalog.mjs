// SPDX-License-Identifier: MPL-2.0
// Static, inert metadata for the adapter modules that are present in this
// folder and not bound when a command starts. Importing this file imports no
// adapter and no provider. Three rows are written here. The fourth is read
// from the Collab adapter's own card (adapters/agenttool-collab/card.json, a
// data file), which is also what that adapter builds its module from, so the
// row and the module are one text. A test compares every row with what the
// real factory declares, so none can quietly drift from the code it describes.
import fs from 'node:fs';

const COLLAB_CARD='adapters/agenttool-collab/card.json';
const STATIC_META=[
  {id:'agenttool.local-context',version:null,version_note:'the version of the reviewed Local Starter release the host supplies; see the pin in arrive',contract:'xenia.module.agenttool-local-context/0.1-development',
    title:'Chosen continuity',source:'agent-first/0.1/adapters/local-starter.mjs',
    description:'Optional AgentTool files-only context at one host-selected root. Retained notes are data, not authority. Retirement does not delete them.',
    bound_by:'The CLI binds this one, only inside the context and starter-smoke commands, after checking the package against the pin.',
    requires:{package:'a reviewed Local Starter distribution directory matching the pin (the CLI never downloads it)',dir:'an absolute notes root outside that package',host_gate:'an authorize function that allows each effectful operation'},
    operations:[
      {id:'init',effects:['local-read','local-write'],description:'Create a new notes root only; refuses existing destinations.'},
      {id:'status',effects:['local-read'],description:'Inspect all fixed slots for metadata only.'},
      {id:'render',effects:['local-read'],description:'Read only selected local context under the provider limits.'},
      {id:'handoff',effects:['local-read','local-write'],description:'Replace only handoff.md, given the expected current hash.'},
    ],
    example:{operation:'handoff',input:{text:'<UTF-8 text to carry>',expectedSha256:'<current handoff sha256 from status>'}}},
  {id:'agenttool.skills-inspector',version:'0.1.0',contract:'agent-first.skills-inspector/0.1',
    title:'Inspect a skill without activating it',source:'agent-first/0.1/adapters/skills-inspector.mjs',
    description:'Read-only structural inspection via a host-supplied @agenttool/skills. Inspection does not grant permission or establish safety to execute.',
    bound_by:'A programmatic host. The CLI does not bind it.',
    requires:{provider:'a host-supplied @agenttool/skills module that exports inspectLocalSkills',root:'an absolute directory to inspect',host_gate:'an authorize function that allows local-read'},
    operations:[{id:'inspect',effects:['local-read'],description:'Inspect one host-selected directory; does not install or run discovered skills.'}]},
  {id:'agenttool.telescope-surface',version:'0.1.0-dev.0',contract:'xenia.telescope.recognition/0.1-development',
    title:'AgentTool XENIA Surface reader',source:'agent-first/0.1/adapters/telescope/index.mjs',
    description:'Recognize supplied manifest text without observing a service. Recognition is not conformance or authority.',
    bound_by:'A programmatic host. The CLI does not bind it.',
    requires:{parser:'a host-supplied AgentTool-compatible parseXeniaSurfaceManifestEvidence function'},
    operations:[{id:'recognize',effects:[],description:'Input {manifest_text: string}, at most 65536 UTF-8 bytes.'}],
    example:{manifest_text:'<the text of a Surface manifest>'},contract_file:'agent-first/0.1/adapters/telescope/contract.json'},
];
// The row for an adapter that describes itself in a card. `card` is kept beside the row's fields so that `explain`
// can show all of it. Throws when the card is not the shape read here; nothing in the card is run.
const text=value=>typeof value==='string'&&value.length>0;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function cardMeta(card,cardFile){
  if(!record(card)||!record(card.module)||!record(card.requires)||!record(card.operations)||!text(card.bound_by)||
    ['id','version','contract','title','description','source'].some(key=>!text(card.module[key])))throw new TypeError('not an adapter card');
  const operations=Object.entries(card.operations).map(([id,op])=>{
    if(!record(op)||!text(op.description)||!Array.isArray(op.effects)||op.effects.some(effect=>!text(effect)))throw new TypeError('not an adapter card');
    return {id,effects:[...op.effects],description:op.description};
  });
  const {id,version,contract,title,description,source}=card.module;
  return {id,version,contract,title,source,description,bound_by:card.bound_by,requires:{...card.requires},operations,card,card_file:cardFile};
}
function readCollabMeta(){
  try{return cardMeta(JSON.parse(fs.readFileSync(new URL(`./${COLLAB_CARD}`,import.meta.url),'utf8')),`agent-first/0.1/${COLLAB_CARD}`);}
  catch{return undefined;}
}
const collab=readCollabMeta();
export const ADAPTER_META=[...STATIC_META,...(collab?[collab]:[])];
// An adapter whose card could not be read is not given a row made up here. It is named, so a list of three is not read as the whole.
export const ADAPTERS_NOT_LISTED=collab?[]:[{id:'agenttool.collab',card_file:`agent-first/0.1/${COLLAB_CARD}`,why:'The card could not be read as an adapter card.'}];
export const ADAPTER_IDS=ADAPTER_META.map(item=>item.id);
const effectsOf=meta=>[...new Set(meta.operations.flatMap(op=>op.effects))];
// Catalog row: what an adapter is, clearly not bound, with no runtime state.
export function adapterRow(meta){
  const {id,version,version_note,contract,title,description,requires,bound_by}=meta;
  return {id,version,...(version_note?{version_note}:{}),contract,title,description,bound:false,requires,bound_by,effects:effectsOf(meta),operations:meta.operations.map(op=>({...op,effects:[...op.effects]}))};
}
export const adapterRows=()=>ADAPTER_META.map(adapterRow);
// What `explain` shows for an adapter that has a card: the whole card, operation by operation. `refusals` on an
// operation are codes; the table beside the module words each code once.
function describeCard(meta){
  const {card}=meta;
  // The document is long, so what a caller has to supply and know first comes first: the config keys, the pin, the
  // limits and what the end writes. The nine cards follow.
  return {bound:false,requires:meta.requires,bound_by:meta.bound_by,
    config:structuredClone(card.config),pin:card.pin,limits:structuredClone(card.limits),at_end:structuredClone(card.at_end),
    module:{id:meta.id,version:meta.version,contract:meta.contract,title:meta.title,description:meta.description,source:meta.source,
      operations:Object.entries(card.operations).map(([id,op])=>({id,...structuredClone(op)}))},
    refusals_note:card.refusals_note,refusals:structuredClone(card.refusals),
    ...(card.backend_reading===undefined?{}:{backend_reading:structuredClone(card.backend_reading)}),card_file:meta.card_file,origin:card.origin,...(card.lineage_note===undefined?{}:{lineage_note:structuredClone(card.lineage_note)}),license:card.license,
    interpretation:'This is the adapter\'s card, read as data: nothing was imported, bound, started or activated. State and revision exist only once a session binds the module; from then on the runtime holds each input to the schema on the operation\'s card. `does`, every meaning and every place under `sites` are the adapter author\'s statements, which nothing here checks: no command reads the backend\'s bundle.',
    not_established:[...(Array.isArray(card.not_established)?card.not_established:[]),'that a session has bound this module','that what the card says the backend does is what a given backend does']};
}
export function describeAdapter(id){
  const meta=ADAPTER_META.find(item=>item.id===id);
  if(!meta)return undefined;
  if(meta.card)return describeCard(meta);
  return {bound:false,requires:meta.requires,bound_by:meta.bound_by,
    module:{id:meta.id,version:meta.version,...(meta.version_note?{version_note:meta.version_note}:{}),contract:meta.contract,title:meta.title,description:meta.description,source:meta.source,
      operations:meta.operations.map(op=>({...op,effects:[...op.effects]}))},
    example:meta.example,contract_file:meta.contract_file,
    interpretation:'Static metadata only: nothing was imported, bound or activated. State and revision exist only once a host binds the module.',
    not_established:['that the required provider is available here','that a host has bound this module']};
}
