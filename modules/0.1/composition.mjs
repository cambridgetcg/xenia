// SPDX-License-Identifier: MPL-2.0
// Finite data wiring over already-supplied hosts, not a second module runtime.
import {snapshotInput} from './host.mjs';
export const COMPOSITION_SCHEMA = 'xenia.composition/0.1-dev';
export class CompositionError extends Error {
  constructor(code) { super(code); this.name = 'CompositionError'; this.code = code; }
}
const fail = code => { throw new CompositionError(code); };
export const COMPOSITION_LIMITS = Object.freeze({steps: 64, links: 128, bindings: 16, concurrency: 8, json_bytes: 65536});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const name = value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(value)
  && !['constructor', 'prototype'].includes(value);
const closed = (value, allowed, required = []) => record(value)
  && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));
const safePath = value => Array.isArray(value) && value.length <= 16 && value.every(key =>
  (Number.isSafeInteger(key) && key >= 0 && key < 10000) ||
  (typeof key === 'string' && key.length > 0 && key.length <= 128 && !/[\u0000-\u001f\u007f]/.test(key)
    && !['__proto__', 'prototype', 'constructor'].includes(key)));
function validatePlan(plan) {
  if (!closed(plan, ['schema', 'steps', 'links', 'bindings'], ['schema', 'steps', 'links'])
      || plan.schema !== COMPOSITION_SCHEMA || !Array.isArray(plan.steps)
      || plan.steps.length < 1 || plan.steps.length > COMPOSITION_LIMITS.steps
      || !Array.isArray(plan.links) || plan.links.length > COMPOSITION_LIMITS.links) fail('invalid_plan');
  for (const step of plan.steps) {
    if (!closed(step, ['id', 'use', 'operation', 'input', 'after'], ['id', 'use', 'operation'])
        || !name(step.id) || !name(step.use) || typeof step.operation !== 'string'
        || step.operation.length < 1 || step.operation.length > 128
        || (Object.hasOwn(step, 'after') && (!Array.isArray(step.after)
          || step.after.length > COMPOSITION_LIMITS.steps || !step.after.every(name)
          || new Set(step.after).size !== step.after.length))) fail('invalid_plan');
  }
  const uses = new Set(plan.steps.map(step => step.use));
  if (uses.size > COMPOSITION_LIMITS.bindings) fail('invalid_plan');
  if (plan.bindings !== undefined && (!record(plan.bindings)
      || Object.keys(plan.bindings).length !== uses.size
      || !Object.entries(plan.bindings).every(([key, value]) => uses.has(key) && name(value)))) fail('invalid_plan');
  for (const link of plan.links) {
    if (!closed(link, ['from', 'to'], ['from', 'to']) || !['from', 'to'].every(key =>
      closed(link[key], ['step', 'path'], ['step', 'path']) && name(link[key].step) && safePath(link[key].path))) fail('invalid_plan');
  }
  for (let i = 0; i < plan.links.length; i++) for (let j = 0; j < i; j++) {
    const a = plan.links[i].to, b = plan.links[j].to;
    if (a.step === b.step && a.path.slice(0, Math.min(a.path.length, b.path.length))
      .every((key, index) => String(key) === String(b.path[index]))) fail('overlapping_links');
  }
}

function compile(definition, hosts) {
  let plan;
  try { plan = snapshotInput(definition); } catch { fail('invalid_plan'); }
  validatePlan(plan);
  const steps = [...plan.steps].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(), dependencies = new Map(), selected = new Map();
  for (const step of steps) {
    if (byId.has(step.id)) fail('duplicate_step');
    const host = Object.hasOwn(hosts, step.use) ? hosts[step.use] : null;
    if (!host || !host.inspect().descriptor.operations.includes(step.operation)) fail('unknown_operation');
    if (plan.bindings && host.inspect().descriptor.id !== plan.bindings[step.use]) fail('binding_mismatch');
    byId.set(step.id, step); dependencies.set(step.id, new Set(step.after ?? [])); selected.set(step.id, host);
  }
  for (const link of plan.links) {
    if (!byId.has(link.from.step) || !byId.has(link.to.step)) fail('unknown_step');
    dependencies.get(link.to.step).add(link.from.step);
  }
  for (const parents of dependencies.values()) for (const id of parents) if (!byId.has(id)) fail('unknown_step');
  const order = [];
  while (order.length < steps.length) {
    const ready = steps.filter(step => !order.includes(step.id) && [...dependencies.get(step.id)].every(id => order.includes(id)));
    if (!ready.length) fail('cycle');
    order.push(...ready.map(step => step.id));
  }
  return {plan, byId, selected, dependencies, order};
}

export function inspectComposition(definition, hosts) {
  const compiled = compile(definition, hosts);
  return {schema: COMPOSITION_SCHEMA, order: compiled.order,
    steps: compiled.order.map(id => {
      const step = compiled.byId.get(id), {descriptor} = compiled.selected.get(id).inspect();
      return {id, use: step.use, operation: step.operation, effects: descriptor.effects};
    }), not_established: ['activation', 'authorization', 'outcome', 'truth of supplied data']};
}

function inputFor(step, plan, results) {
  let input = structuredClone(step.input ?? {});
  for (const {from, to} of plan.links.filter(link => link.to.step === step.id)) {
    let value = results[from.step].value;
    for (const key of from.path) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) fail('missing_output');
      value = value[key];
    }
    if (!to.path.length) { input = structuredClone(value); continue; }
    let target = input;
    for (const key of to.path.slice(0, -1)) {
      if (target === null || typeof target !== 'object') fail('invalid_destination');
      if (!Object.hasOwn(target, key)) Object.defineProperty(target, key, {value: {}, enumerable: true, writable: true});
      target = target[key];
    }
    if (target === null || typeof target !== 'object') fail('invalid_destination');
    Object.defineProperty(target, to.path.at(-1), {value: structuredClone(value), enumerable: true, writable: true, configurable: true});
  }
  return input;
}

export async function runComposition(definition, hosts, {concurrency = 1, signal} = {}) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail('invalid_signal');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > COMPOSITION_LIMITS.concurrency) fail('invalid_concurrency');
  const {plan, byId, selected, dependencies, order} = compile(definition, hosts);
  for (const host of selected.values()) if (!host.inspect().admission || host.inspect().busy) fail('host_not_ready');
  const steps = {}, pending = new Set(order), running = new Map(), occupied = new Set();
  let stopped = false;
  const launch = id => {
    pending.delete(id);
    const host = selected.get(id), step = byId.get(id);
    occupied.add(host);
    const action = Promise.resolve().then(async () => {
      try {
        const result = await host.invoke(step.operation, inputFor(step, plan, steps));
        if (result.ok !== true) {
          steps[id] = {status: 'failed', error: {code: result.error?.code ?? 'host_failed', retryable: false}};
          stopped = true;
        } else steps[id] = {status: 'succeeded', value: snapshotInput(result.value)};
      } catch (error) {
        steps[id] = {status: 'failed', error: {code: error instanceof CompositionError ? error.code : 'host_failed', retryable: false}};
        stopped = true;
      } finally { occupied.delete(host); running.delete(id); }
    });
    running.set(id, action);
  };
  while (pending.size || running.size) {
    if (!stopped && !signal?.aborted) for (const id of pending) {
      if (running.size >= concurrency) break;
      if (!occupied.has(selected.get(id)) && [...dependencies.get(id)].every(parent => steps[parent]?.status === 'succeeded')) launch(id);
    }
    if (!running.size) break;
    await Promise.race(running.values());
  }
  for (const id of order) if (!steps[id]) {
    const blocked = [...dependencies.get(id)].some(parent => ['failed', 'blocked'].includes(steps[parent]?.status));
    steps[id] = {status: blocked ? 'blocked' : 'not_started'};
  }
  return {schema: COMPOSITION_SCHEMA, ok: order.every(id => steps[id].status === 'succeeded'),
    steps: Object.fromEntries(order.map(id => [id, steps[id]])), cancelled: signal?.aborted === true,
    outcome_unknown: Object.values(steps).some(step => step.error?.code === 'outcome-unknown'), retryable: false};
}
