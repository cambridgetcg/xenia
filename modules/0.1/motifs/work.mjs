// SPDX-License-Identifier: MPL-2.0
import {pureConnector} from './pure.mjs';
export const card = {
  descriptor: {id: 'xenia-work', version: '0.1.0-dev', contract_version: 'xenia.module/0.1-dev',
    state_schema_version: 1, operations: ['check'], effects: []},
  motif: 'finite-work-and-honest-closure',
  purpose: 'Check a supplied Work 0.1 development record using the native checker.',
  source: 'work/0.1/check.mjs# validateWorkRun',
  input: 'Parsed Work 0.1 development record; no referenced evidence is fetched.',
  retire: 'Disable the checker; retain the caller-owned input and any receipts.',
  not_established: ['execution', 'actor authority', 'truth of evidence', 'host conformance'],
};
export const connect = pureConnector({
  async check(input) {
    const {validateWorkRun} = await import('../../../work/0.1/check.mjs');
    return validateWorkRun(input);
  },
});
