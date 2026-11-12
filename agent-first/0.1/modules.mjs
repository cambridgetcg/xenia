// SPDX-License-Identifier: MPL-2.0
import {Decline,DETAIL_LIMIT} from './runtime.mjs';
// These small adapters reuse the existing profiles; they do not redefine them.
// The native validators say what is wrong with an input by throwing. These
// operations declare effects: [], so nothing can have been applied.
const invalidInput=[{code:'invalid_input',effect:'not_applied',
  meaning:'The existing Xenia function rejected this input. Nothing was produced or changed.',
  next:'Fix the input using the detail, or see the example from explain <module-id>.'}];
const native=(fn,input)=>{
  try{return fn(input);}
  catch(error){
    const message=typeof error?.message==='string'?error.message.slice(0,DETAIL_LIMIT):undefined;
    throw new Decline('invalid_input',message);
  }
};
export function createXeniaModules() {
  return [
    {
      id:'xenia.surface',version:'0.1.0-dev.0',contract:'xenia.module.surface/0.1-development',
      title:'Legible arrival',motif:'legibility',
      description:'Build a Surface 0.1 manifest. This does not serve a site or observe conformance. Requires the existing root library build.',
      source:'Xenia src/surface-0.1.ts / defineSurfaceManifest',
      operations:{manifest:{description:'Create a manifest from an explicit definition; no network or publication.',effects:[],refusals:invalidInput,
        input:{summary:'One JSON object: service {name, canonicalUrl, description} and resources [{id, href}].',
          example:{service:{name:'Local example',canonicalUrl:'https://example.com/',description:'An unserved reference example.'},resources:[{id:'about',href:'https://example.com/about'}]}},
        async run(input){const {defineSurfaceManifest}=await import('../../dist/surface-0.1.js');return native(defineSurfaceManifest,input);}}},
    },
    {
      id:'xenia.covenant',version:'0.1.0-dev.0',contract:'xenia.module.covenant/0.1-development',
      title:'Standing before permission',motif:'standing',
      description:'Prepare the existing all-unknown Covenant draft. Retiring this helper does not retire anyone’s rights.',
      source:'Xenia covenant/0.1/create-adoption.mjs / createUnknownCovenantAdoption',
      operations:{draft:{description:'Generate an explicitly unverified draft; no adoption, signature or activation.',effects:[],refusals:invalidInput,
        input:{summary:'One JSON object: hostName, canonicalUrl, speakerId and reviewedAt (an RFC 3339 time).',
          example:{hostName:'Local example',canonicalUrl:'https://example.com/',speakerId:'https://example.com/#operator',reviewedAt:'2026-10-09T00:00:00Z'}},
        async run(input){const {createUnknownCovenantAdoption}=await import('../../covenant/0.1/create-adoption.mjs');return native(createUnknownCovenantAdoption,input);}}},
    },
    {
      id:'xenia.work',version:'0.1.0-dev.0',contract:'xenia.module.work/0.1-development',
      title:'Finite work, honest closure',motif:'bounded-work',
      description:'Check an in-memory Work 0.1 draft record with the existing checker. This is not a Work executor or proof of authority.',
      source:'Xenia work/0.1/check.mjs / validateWorkRun',
      operations:{check:{description:'Check schema and cross-record consistency; no provider action or evidence retrieval.',effects:[],refusals:invalidInput,
        input:{summary:'One complete parsed Work 0.1 record (a JSON object). Too large to show here; see example_ref.',example_ref:'work/0.1/examples/declined.json'},
        async run(input){const {validateWorkRun}=await import('../../work/0.1/check.mjs');return native(validateWorkRun,input);}}},
    },
  ];
}
