// SPDX-License-Identifier: MPL-2.0
// Static, inert metadata for the adapter modules that are present in this
// folder but not bound by the door. Pure data: importing this file imports no
// adapter and no provider. A test compares it with what each real factory
// declares, so it cannot quietly drift from the code it describes.
export const ADAPTER_META=[
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
export const ADAPTER_IDS=ADAPTER_META.map(item=>item.id);
const effectsOf=meta=>[...new Set(meta.operations.flatMap(op=>op.effects))];
// Catalog row: what an adapter is, clearly not bound, with no runtime state.
export function adapterRow(meta){
  const {id,version,version_note,contract,title,description,requires,bound_by}=meta;
  return {id,version,...(version_note?{version_note}:{}),contract,title,description,bound:false,requires,bound_by,effects:effectsOf(meta),operations:meta.operations.map(op=>({...op,effects:[...op.effects]}))};
}
export const adapterRows=()=>ADAPTER_META.map(adapterRow);
export function describeAdapter(id){
  const meta=ADAPTER_META.find(item=>item.id===id);
  if(!meta)return undefined;
  return {bound:false,requires:meta.requires,bound_by:meta.bound_by,
    module:{id:meta.id,version:meta.version,...(meta.version_note?{version_note:meta.version_note}:{}),contract:meta.contract,title:meta.title,description:meta.description,source:meta.source,
      operations:meta.operations.map(op=>({...op,effects:[...op.effects]}))},
    example:meta.example,contract_file:meta.contract_file,
    interpretation:'Static metadata only: nothing was imported, bound or activated. State and revision exist only once a host binds the module.',
    not_established:['that the required provider is available here','that a host has bound this module']};
}
