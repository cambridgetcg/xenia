// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from './cli.mjs';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('compose previews by default, executes explicitly, and permits named replicas', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'xenia-composition-cli-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const plan = JSON.parse(await readFile(new URL('./examples/arrival-and-standing.json', import.meta.url)));
  plan.bindings = {arrival: 'xenia-surface', standing: 'xenia-covenant', another: 'xenia-surface'};
  plan.steps[0].use = 'standing'; plan.steps[1].use = 'arrival';
  plan.steps.push({...plan.steps[1], id: 'second-manifest', use: 'another'});
  const filename = path.join(dir, 'plan.json'); await writeFile(filename, JSON.stringify(plan));
  const preview = await dispatch(['compose', filename]);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.retirement, undefined, 'No hosts were activated');
  for (const jobs of ['1', '2', '8']) {
    const result = await dispatch(['compose', filename, '--run', '--jobs', jobs]);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.steps['second-manifest'].status, 'succeeded');
    assert.equal(Object.keys(result.retirement).length, 3);
  }
  for (const suffix of [['--jobs','0'], ['--jobs','2','--jobs','3'], ['--run','--run'], ['--bad']]) {
    assert.equal((await dispatch(['compose', filename, ...suffix])).error.code, 'invalid_arguments');
  }
});

test('the same door lists inert motifs and invokes a standalone native checker', async () => {
  const catalog = await dispatch(['motifs']);
  assert.equal(catalog.ok, true, JSON.stringify(catalog));
  for (const id of ['xenia-surface', 'xenia-covenant', 'xenia-work']) assert.ok(catalog.cards.some(card => card.descriptor.id === id));
  const file = new URL('../../work/0.1/examples/declined.json', import.meta.url).pathname;
  const result = await dispatch(['invoke', 'xenia-work', 'check', '--input', file]);
  assert.equal(result.ok, true, JSON.stringify(result));
  const {validateWorkRun} = await import('../../work/0.1/check.mjs');
  assert.deepEqual(result.value, validateWorkRun(JSON.parse(await readFile(file))));
  assert.equal(result.retirement['xenia-work'].complete, true);
  assert.equal((await dispatch(['invoke', 'xenia-work', 'check', '--bogus', file])).error.code, 'invalid_arguments');
});

test('the existing CLI runs a finite native composition and retires its bindings', async () => {
  const result = await dispatch(['compose-demo']);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mode, 'synthetic_local_profile_composition');
  assert.equal(result.steps.manifest.status, 'succeeded');
  assert.equal(result.steps.draft.status, 'succeeded');
  assert.ok(Object.values(result.retirement).every(state => state.complete && state.state === 'retired'));
  assert.equal(result.cleanup_pending, false);
});
