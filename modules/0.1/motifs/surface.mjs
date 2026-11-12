// SPDX-License-Identifier: MPL-2.0
import {pureConnector} from './pure.mjs';
export const card = {
  descriptor: {id: 'xenia-surface', version: '0.1.0-dev', contract_version: 'xenia.module/0.1-dev',
    state_schema_version: 1, operations: ['manifest'], effects: []},
  motif: 'legibility',
  purpose: 'Build a Surface 0.1 manifest from explicit input; do not serve or publish it.',
  source: 'src/surface-0.1.ts# defineSurfaceManifest',
  input: 'SurfaceDefinition; validated by the native root-library helper.',
  retire: 'Disable this binding; no session or external store is owned.',
  not_established: ['service availability', 'Surface conformance', 'authority'],
};
export const connect = pureConnector({
  async manifest(input) {
    const {defineSurfaceManifest} = await import('../../../dist/surface-0.1.js');
    return defineSurfaceManifest(input);
  },
});
