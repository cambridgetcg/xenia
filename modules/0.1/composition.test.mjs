// SPDX-License-Identifier: MPL-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createMotifHost} from './motifs.mjs';
import {createModuleHost} from './host.mjs';

const entry = new URL('./composition.mjs', import.meta.url);
const fixtureHost = (id, invoke, options = {}) => createModuleHost({id, version: '1.0.0',
  contract_version: 'test-only/1', state_schema_version: 1, operations: ['run'], effects: []}, {
  authorize: () => true, connect: async () => ({invoke: (_operation, input) => invoke(input),
    retire: async () => ({complete: true}), disconnect: async () => {}}), ...options,
});

test('invalid graphs are refused before any host invocation', async t => {
  const {runComposition} = await import(entry);
  let invoked = 0;
  const host = fixtureHost('unit-fixture', input => {invoked++; return input;});
  await host.activate(); t.after(() => host.retire());
  const base = () => ({schema, steps: [{id: 'a', use: 'fixture', operation: 'run', input: {}}], links: []});
  const cases = [
    ['unknown graph fields', plan => {plan.script = 'never execute';}, 'invalid_plan'],
    ['empty graph', plan => {plan.steps = [];}, 'invalid_plan'],
    ['step limit', plan => {plan.steps = Array.from({length: 65}, (_, i) => ({...plan.steps[0], id: 's'+i}));}, 'invalid_plan'],
    ['link limit', plan => {plan.links = Array(129).fill({from: {step: 'a', path: []}, to: {step: 'a', path: []}});}, 'invalid_plan'],
    ['unknown step fields', plan => {plan.steps[0].evaluate = 'never execute';}, 'invalid_plan'],
    ['dangerous id', plan => {plan.steps[0].id = '__proto__';}, 'invalid_plan'],
    ['duplicate id', plan => {plan.steps.push({...plan.steps[0]});}, 'duplicate_step'],
    ['missing dependency', plan => {plan.steps[0].after = ['absent'];}, 'unknown_step'],
    ['cycle', plan => {plan.steps[0].after = ['a'];}, 'cycle'],
    ['unknown operation', plan => {plan.steps[0].operation = 'not-declared';}, 'unknown_operation'],
    ['unknown binding', plan => {plan.steps[0].use = 'absent';}, 'unknown_operation'],
    ['unsafe link', plan => {plan.links = [{from: {step: 'a', path: ['__proto__']}, to: {step: 'a', path: []}}];}, 'invalid_plan'],
    ['malformed link', plan => {plan.links = [{from: {step: 'a', path: 'wrong'}, to: {step: 'a', path: []}}];}, 'invalid_plan'],
    ['overlapping destinations', plan => {
      plan.steps.push({...plan.steps[0], id: 'b'});
      plan.links = [[], ['nested']].map(p => ({from: {step: 'a', path: []}, to: {step: 'b', path: p}}));
    }, 'overlapping_links'],
  ];
  for (const [name, change, code] of cases) {
    const plan = base(); change(plan);
    await assert.rejects(runComposition(plan, {fixture: host}), error => error.code === code, name);
  }
  let accessed = 0;
  const accessor = base(); Object.defineProperty(accessor, 'hidden', {enumerable: true, get() {accessed++; return 1;}});
  await assert.rejects(runComposition(accessor, {fixture: host}), {code: 'invalid_plan'});
  assert.equal(accessed, 0);
  assert.equal(invoked, 0);
});
test('capacity scales while repeated bindings to one host remain serial', async () => {
  const {runComposition} = await import(entry);
  for (const concurrency of [1, 2, 8]) {
    let active = 0, peak = 0;
    const hosts = Object.fromEntries(Array.from({length: 9}, (_, i) => ['worker'+i,
      fixtureHost('same-motif-different-instance', async input => {
        active++; peak = Math.max(peak, active);
        await new Promise(resolve => setImmediate(resolve));
        active--; return input;
      })]));
    for (const host of Object.values(hosts)) await host.activate();
    try {
      const plan = {schema, links: [], steps: Object.keys(hosts).map((use, i) => ({id: 'step'+i, use, operation: 'run', input: i}))};
      const result = await runComposition(plan, hosts, {concurrency});
      assert.equal(result.ok, true);
      assert.equal(peak, concurrency, 'The requested capacity should be exercised');
      assert.deepEqual(Object.values(result.steps).map(step => step.value), Array.from({length: 9}, (_, i) => i));
      for (const invalid of [0, 9, 1.5, '2']) await assert.rejects(runComposition(plan, hosts, {concurrency: invalid}), {code: 'invalid_concurrency'});
      // Distinct names for the SAME object do not manufacture provider capacity.
      peak = 0;
      const shared = {worker0: hosts.worker0, worker1: hosts.worker0};
      const serial = {...plan, steps: plan.steps.slice(0, 2)};
      assert.equal((await runComposition(serial, shared, {concurrency: 8})).ok, true);
      assert.equal(peak, 1);
    } finally { for (const host of Object.values(hosts)) await host.retire(); }
  }
});

test('cancellation stops admission, drains accepted work, and never retires caller-owned hosts', async t => {
  const {runComposition} = await import(entry);
  const controller = new AbortController();
  let calls = 0;
  const host = fixtureHost('cancel-fixture', input => {calls++; controller.abort(); return input;});
  await host.activate(); t.after(() => host.retire());
  const plan = {schema, links: [], steps: [0, 1].map(i => ({id: 's'+i, use: 'fixture', operation: 'run', input: i}))};
  const result = await runComposition(plan, {fixture: host}, {signal: controller.signal});
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.steps.s0.status, 'succeeded');
  assert.equal(result.steps.s1.status, 'not_started');
  assert.equal(host.inspect().state, 'active');
  const again = await runComposition(plan, {fixture: host}, {signal: controller.signal});
  assert.equal(calls, 1, 'Already-aborted admission cannot invoke anything');
  assert.ok(Object.values(again.steps).every(step => step.status === 'not_started'));
  await assert.rejects(runComposition(plan, {fixture: host}, {signal: {aborted: false}}), {code: 'invalid_signal'});
});

test('failure receipts distinguish blocked and unstarted work without replay or hidden errors', async () => {
  const {runComposition} = await import(entry);
  for (const uncertain of [false, true]) {
    let calls = 0;
    const host = fixtureHost('failure-fixture', () => {calls++; throw Object.assign(new Error('PRIVATE-SENTINEL'), {uncertain});});
    await host.activate();
    try {
      const plan = {schema, links: [], steps: [
        {id: 'a-error', use: 'fixture', operation: 'run'},
        {id: 'b-follower', use: 'fixture', operation: 'run', after: ['a-error']},
        {id: 'z-independent', use: 'fixture', operation: 'run'},
      ]};
      const result = await runComposition(plan, {fixture: host});
      assert.equal(result.ok, false);
      assert.equal(result.outcome_unknown, uncertain);
      assert.equal(result.steps['a-error'].status, 'failed');
      assert.equal(result.steps['b-follower'].status, 'blocked');
      assert.equal(result.steps['z-independent'].status, 'not_started');
      assert.equal(calls, 1);
      assert.equal(result.retryable, false);
      assert.ok(!JSON.stringify(result).includes('PRIVATE-SENTINEL'));
    } finally { await host.retire(); }
  }
});

const schema = 'xenia.composition/0.1-dev';
const source = {service: {name: 'A linked, synthetic example', canonicalUrl: 'https://example.com/', description: 'Not a served site.'}, resources: [{id: 'about', href: 'https://example.com/about'}]};
export const linkedPlan = () => ({schema, steps: [
  {id: 'draft', use: 'standing', operation: 'draft', input: {speakerId: 'https://example.com/#operator', reviewedAt: '2026-10-09T00:00:00Z'}},
  {id: 'manifest', use: 'arrival', operation: 'manifest', input: source},
], links: [
  {from: {step: 'manifest', path: ['service', 'name']}, to: {step: 'draft', path: ['hostName']}},
  {from: {step: 'manifest', path: ['service', 'canonical_url']}, to: {step: 'draft', path: ['canonicalUrl']}},
]});

test('a composition wires native outputs independently of declaration order', async t => {
  assert.ok(existsSync(entry), 'The existing modules have no data-only composition seam yet');
  const {inspectComposition, runComposition} = await import(entry);
  const {createUnknownCovenantAdoption} = await import('../../covenant/0.1/create-adoption.mjs');
  const hosts = {arrival: createMotifHost('xenia-surface', {authorize: () => true}),
    standing: createMotifHost('xenia-covenant', {authorize: () => true})};
  t.after(async () => {for (const host of Object.values(hosts)) await host.retire();});
  const plan = linkedPlan();
  assert.deepEqual(inspectComposition(plan, hosts).order, ['manifest', 'draft']);
  assert.equal(hosts.arrival.inspect().state, 'disabled', 'Planning cannot activate a module');
  for (const host of Object.values(hosts)) assert.equal((await host.activate()).ok, true);
  const result = await runComposition(plan, hosts);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.steps.manifest.status, 'succeeded');
  assert.deepEqual(result.steps.draft.value, createUnknownCovenantAdoption({
    hostName: source.service.name, canonicalUrl: source.service.canonicalUrl,
    speakerId: 'https://example.com/#operator', reviewedAt: '2026-10-09T00:00:00Z',
  }));
  plan.steps.reverse();
  assert.deepEqual((await runComposition(plan, hosts)).steps, result.steps);
  plan.bindings = {arrival: 'xenia-surface', standing: 'xenia-covenant'};
  assert.deepEqual((await runComposition(plan, hosts)).steps, result.steps);
  plan.bindings.arrival = 'xenia-work';
  await assert.rejects(runComposition(plan, hosts), {code: 'binding_mismatch'});
});
