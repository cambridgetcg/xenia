// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {existsSync, watch} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {dispatch} from './cli.mjs';
import {createModuleHost} from './host.mjs';
import {createCollabConnector} from './adapters/agenttool-collab/adapter.mjs';
const bundle = process.env.XENIA_COLLAB_BUNDLE, digest = process.env.XENIA_COLLAB_SHA256;

test('Stop during native composition activation drains and retires the owned session', {skip: !bundle || !digest}, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'xenia-composition-stop-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const config = {bundlePath: bundle, bundleSha256: digest, databasePath: path.join(dir, 'journal.sqlite'),
    homeDir: path.join(dir, 'home'), workspace: path.join(dir, 'workspace'), actor: 'synthetic-stop-controller', serverVersion: '0.5.0', timeoutMs: 5000};
  await mkdir(config.workspace);
  const configFile = path.join(dir, 'config.json'), planFile = path.join(dir, 'plan.json');
  await writeFile(configFile, JSON.stringify(config));
  await writeFile(planFile, JSON.stringify({schema: 'xenia.composition/0.1-dev', links: [],
    steps: [{id: 'status', use: 'agenttool-collab', operation: 'status'}]}));
  let child, sent = false;
  const watcher = watch(dir, (_, name) => {if (name === 'journal.sqlite' && !sent) {sent = true; child.kill('SIGTERM');}});
  t.after(() => watcher.close());
  child = spawn(process.execPath, [new URL('./cli.mjs', import.meta.url).pathname, 'compose', planFile,
    '--run', '--collab-config', configFile, '--allow-local-state'], {env: {PATH: process.env.PATH}, stdio: ['ignore','pipe','pipe']});
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => {stdout += chunk;}); child.stderr.on('data', chunk => {stderr += chunk;});
  const closed = new Promise(resolve => child.on('close', (code, signal) => resolve({code, signal})));
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  t.after(async () => {clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await closed;});
  const end = await closed; clearTimeout(timer);
  assert.equal(sent, true, 'The test must reach actual native database initialization');
  assert.equal(end.signal, null, 'Stop should produce a bounded cleanup receipt, not default termination');
  assert.equal(end.code, 1);
  assert.equal(stderr, '');
  const result = JSON.parse(stdout);
  assert.equal(result.interrupted, 'SIGTERM');
  assert.equal(result.cancelled, true);
  assert.equal(result.cleanup_pending, false);
  assert.ok(Object.values(result.retirement).every(state => state.complete && state.state === 'retired'));
});

test('native composition wires a profile into two synthetic Collab sessions and preserves the journal', {skip: !bundle || !digest}, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'xenia-native-composition-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const config = {bundlePath: bundle, bundleSha256: digest, databasePath: path.join(dir, 'journal.sqlite'),
    homeDir: path.join(dir, 'home'), workspace: path.join(dir, 'workspace'), actor: 'synthetic-graph-controller', serverVersion: '0.5.0', timeoutMs: 5000};
  await mkdir(config.workspace);
  const configFile = path.join(dir, 'config.json'); await writeFile(configFile, JSON.stringify(config));
  const fixture = JSON.parse(await readFile(new URL('./examples/arrival-and-standing.json', import.meta.url)));
  const plan = {schema: 'xenia.composition/0.1-dev',
    bindings: {arrival: 'xenia-surface', writer: 'agenttool-collab', reader: 'agenttool-collab'},
    steps: [
      {...fixture.steps.find(step => step.id === 'manifest'), use: 'arrival'},
      {id: 'create', use: 'writer', operation: 'createTask', input: {idempotency_key: 'graph-create'}},
      {id: 'claim', use: 'writer', operation: 'claimTask', input: {idempotency_key: 'graph-claim'}},
      {id: 'report', use: 'writer', operation: 'report', input: {idempotency_key: 'graph-report', kind: 'observation', body: 'Synthetic graph fixture, not independent agent collaboration.', limits: 'Only local protocol behavior is tested.'}},
      {id: 'receive', use: 'reader', operation: 'next', input: {event_limit: 50}, after: ['report']},
    ],
    links: [
      {from: {step: 'manifest', path: ['service','name']}, to: {step: 'create', path: ['title']}},
      {from: {step: 'create', path: ['id']}, to: {step: 'claim', path: ['task_id']}},
      {from: {step: 'create', path: ['version']}, to: {step: 'claim', path: ['expected_version']}},
      {from: {step: 'claim', path: ['id']}, to: {step: 'report', path: ['task_id']}},
    ]};
  const planFile = path.join(dir, 'plan.json'); await writeFile(planFile, JSON.stringify(plan));
  const preview = await dispatch(['compose', planFile]);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.mode, 'preview');
  assert.equal(existsSync(config.databasePath), false);
  const denied = await dispatch(['compose', planFile, '--run', '--collab-config', configFile]);
  assert.equal(denied.error.code, 'local_state_not_authorized');
  assert.equal(existsSync(config.databasePath), false);
  const result = await dispatch(['compose', planFile, '--run', '--jobs', '2', '--collab-config', configFile, '--allow-local-state']);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.steps.create.value.title, result.steps.manifest.value.service.name);
  assert.equal(result.steps.claim.value.status, 'claimed');
  assert.ok(result.steps.receive.value.reports.some(report => report.id === result.steps.report.value.report_id));
  assert.ok(Object.values(result.retirement).every(state => state.complete));
  assert.equal(result.cleanup_pending, false);
  assert.ok(existsSync(config.databasePath));
  const card = JSON.parse(await readFile(new URL('./adapters/agenttool-collab/module.json', import.meta.url)));
  const observer = createModuleHost(card.descriptor, {connect: createCollabConnector({...config, actor: 'synthetic-post-exit-observer'}), authorize: () => true});
  try {
    assert.equal((await observer.activate()).ok, true);
    const task = await observer.invoke('getTask', {task_id: result.steps.create.value.id});
    assert.equal(task.value.status, 'open'); assert.equal(task.value.lease_id, null);
    const status = (await observer.invoke('status', {})).value;
    assert.deepEqual(status.active_session_ids, [status.session_id]);
  } finally { assert.equal((await observer.retire()).complete, true); }
});
