// SPDX-License-Identifier: MPL-2.0
import {pureConnector} from './pure.mjs';
export const card = {
  descriptor: {id: 'xenia-covenant', version: '0.1.0-dev', contract_version: 'xenia.module/0.1-dev',
    state_schema_version: 1, operations: ['draft'], effects: []},
  motif: 'standing-before-permission',
  purpose: 'Prepare the existing all-unknown Covenant draft; never adopt or sign it.',
  source: 'covenant/0.1/create-adoption.mjs# createUnknownCovenantAdoption',
  input: '{hostName, canonicalUrl, speakerId, reviewedAt}; native validation applies.',
  retire: 'Disable the helper; neither rights nor earlier duties are retired.',
  not_established: ['implementation assessment', 'adoption', 'consent', 'authority'],
};
export const connect = pureConnector({
  async draft(input) {
    const {createUnknownCovenantAdoption} = await import('../../../covenant/0.1/create-adoption.mjs');
    return createUnknownCovenantAdoption(input);
  },
});
