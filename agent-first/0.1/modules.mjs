// SPDX-License-Identifier: MPL-2.0
// These small adapters reuse the existing profiles; they do not redefine them.
export function createXeniaModules() {
  return [
    {
      id:'xenia.surface',version:'0.1.0-dev.0',contract:'xenia.module.surface/0.1-development',
      title:'Legible arrival',motif:'legibility',
      description:'Build a Surface 0.1 manifest. This does not serve a site or observe conformance. Requires the existing root library build.',
      source:'Xenia src/surface-0.1.ts / defineSurfaceManifest',
      operations:{manifest:{description:'Create a manifest from an explicit definition; no network or publication.',effects:[],
        async run(input){const {defineSurfaceManifest}=await import('../../dist/surface-0.1.js');return defineSurfaceManifest(input);}}},
    },
    {
      id:'xenia.covenant',version:'0.1.0-dev.0',contract:'xenia.module.covenant/0.1-development',
      title:'Standing before permission',motif:'standing',
      description:'Prepare the existing all-unknown Covenant draft. Retiring this helper does not retire anyone’s rights.',
      source:'Xenia covenant/0.1/create-adoption.mjs / createUnknownCovenantAdoption',
      operations:{draft:{description:'Generate an explicitly unverified draft; no adoption, signature or activation.',effects:[],
        async run(input){const {createUnknownCovenantAdoption}=await import('../../covenant/0.1/create-adoption.mjs');return createUnknownCovenantAdoption(input);}}},
    },
    {
      id:'xenia.work',version:'0.1.0-dev.0',contract:'xenia.module.work/0.1-development',
      title:'Finite work, honest closure',motif:'bounded-work',
      description:'Check an in-memory Work 0.1 draft record with the existing checker. This is not a Work executor or proof of authority.',
      source:'Xenia work/0.1/check.mjs / validateWorkRun',
      operations:{check:{description:'Check schema and cross-record consistency; no provider action or evidence retrieval.',effects:[],
        async run(input){const {validateWorkRun}=await import('../../work/0.1/check.mjs');return validateWorkRun(input);}}},
    },
  ];
}
