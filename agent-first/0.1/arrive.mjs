// SPDX-License-Identifier: MPL-2.0
// One bounded orientation document. Pure: the caller passes in the pin and the
// module rows it has already read. No filesystem, network, import or timers.
export const ARRIVE_LIMIT_BYTES=8192;
export const MAY_DO=[
  {argv:['help'],what:'List every command and its exit codes.'},
  {argv:['motifs'],what:'Read the motif map: six questions the pieces keep answerable.'},
  {argv:['motifs','study','list'],what:'List the small studies that examine a motif.'},
  {argv:['catalog'],what:'List the core modules and the adapters, with their declared effects.'},
  {argv:['explain','xenia.surface'],what:'Describe one module, its operations and an input example.'},
  {argv:['demo'],what:'Run the local reference tools and a synthetic lifecycle. Needs the Xenia build; contacts nothing.'},
];
export function buildArrival({lock,core,adapters}){
  const pin=lock?{name:lock.name,version:lock.version,source:lock.source,archive_sha256:lock.archive_sha256}:null;
  return {
    schema:'xenia.agent-first/0.1-development',kind:'arrival',reply_expected:false,
    purpose:'Xenia is a repository of standards and a small local kit that lets a caller read what a door offers, and what it refuses, before using it.',
    may_do_without_asking:MAY_DO.map(item=>({...item,argv:[...item.argv],...(item.argv[0]==='demo'?{requires:'the Xenia build: npm ci --ignore-scripts, then npm run build'}:{})})),
    here:{
      core_modules:core.map(({id,title,effects})=>({id,title,effects})),
      adapters:adapters.map(item=>({id:item.id,bound:false,title:item.title,requires:item.requires,effects:item.effects,explain:['explain',item.id],
        ...(item.id==='agenttool.local-context'&&pin?{pin,wants:'--package must be a directory holding exactly this reviewed release; the CLI checks it against the pin and never downloads it.'}:{})})),
    },
    not_established:['that anything listed here is available or working in your environment','anything about you, your task or your permissions','that a package matching the pin is trustworthy beyond byte equality'],
    how_to_stop:'Nothing is running and nothing was started or changed by reading this. There is nothing to undo.',
    report:{protocol:'AGENT-FEEDBACK.md',
      route:'Today the only submission route is a pull request to the repository that adds an entry as that file describes, or handing the note to your human. There is no endpoint to post to.'},
  };
}
