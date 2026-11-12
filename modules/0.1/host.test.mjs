import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from './host.mjs';
const descriptor = (overrides = {}) => ({
  id: 'local-agenttool', version: '0.1.0-dev',
  contract_version: 'xenia.module/0.1-dev', state_schema_version: 1,
  operations: ['read', 'mutate'], effects: ['local:mutation'], ...overrides,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const failure = (result, code) => {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.equal(result.error.retryable, false);
  assert.ok(result.error.message.length < 80);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
};

test('registration is inert and returns only validated detached JSON', () => {
  assert.equal(typeof api.validateDescriptor, 'function');
  assert.equal(typeof api.createModuleHost, 'function');
  let calls = 0;
  const input = descriptor();
  const validated = api.validateDescriptor(input);
  assert.deepEqual(validated, input);
  assert.notEqual(validated, input);
  assert.notEqual(validated.operations, input.operations);
  const host = api.createModuleHost(input, {
    connect: () => { calls++; }, authorize: () => { calls++; },
  });
  const expected = {
    descriptor: descriptor(), state: 'disabled', admission: false,
    busy: false, cleanup_pending: false,
  };
  assert.deepEqual(host.inspect(), expected);
  input.operations.push('injected');
  input.effects.push('SECRET');
  validated.id = 'changed';
  const snapshot = host.inspect();
  snapshot.descriptor.operations.push('injected');
  snapshot.descriptor.id = 'changed';
  assert.deepEqual(host.inspect(), expected);
  assert.equal(calls, 0);
  for (const bad of [
    null, [], descriptor({ extra: 'SECRET' }), descriptor({ id: '' }),
    descriptor({ id: 'not a slug' }), descriptor({ id: 'a'.repeat(65) }),
    descriptor({ version: 'latest' }), descriptor({ contract_version: ' ' }),
    descriptor({ state_schema_version: 0 }), descriptor({ state_schema_version: 1.5 }),
    descriptor({ operations: ['read', 'read'] }), descriptor({ operations: [''] }),
    descriptor({ operations: ['a'.repeat(129)] }), descriptor({ effects: ['x', 'x'] }),
    descriptor({ effects: ['x'.repeat(257)] }), descriptor({ effects: [1] }),
  ]) assert.throws(() => api.validateDescriptor(bad), /Invalid descriptor/);
  const getter = descriptor();
  Object.defineProperty(getter, 'id', { get() { calls++; return 'SECRET'; } });
  assert.throws(() => api.validateDescriptor(getter), /Invalid descriptor/);
  assert.equal(calls, 0);
});

test('each admitted operation needs exact fresh authority and runs singly', async () => {
  let connected = 0;
  const denied = api.createModuleHost(descriptor(), { connect: () => { connected++; } });
  assert.equal(typeof denied.activate, 'function');
  failure(await denied.invoke('read', {}), 'disabled');
  failure(await denied.activate(), 'unauthorized');
  assert.equal(connected, 0);

  let approval = 'yes';
  const events = [];
  const work = deferred();
  let invoked = 0;
  const host = api.createModuleHost(descriptor(), {
    authorize: async request => { events.push(request); return approval; },
    connect: async (...args) => {
      assert.deepEqual(args, []);
      connected++;
      return {
        async invoke(operation, input) {
          invoked++;
          assert.equal(operation, 'mutate');
          assert.deepEqual(input, { local: 1 });
          return work.promise;
        },
        async retire() { return { complete: true }; },
        async disconnect() {},
      };
    },
    timeoutMs: 100,
  });
  failure(await host.activate(), 'unauthorized');
  assert.equal(connected, 0);
  approval = true;
  assert.deepEqual(await host.activate(), { ok: true, state: 'active' });
  assert.equal(connected, 1);
  assert.equal(host.inspect().admission, true);
  const count = events.length;
  failure(await host.invoke('undeclared', 'SECRET'), 'unknown-operation');
  assert.equal(events.length, count);
  approval = false;
  failure(await host.invoke('mutate', { local: 1 }), 'unauthorized');
  assert.equal(invoked, 0);
  approval = true;
  const pending = host.invoke('mutate', { local: 1 });
  assert.equal(host.inspect().busy, true);
  failure(await host.invoke('mutate', { local: 1 }), 'busy');
  await tick();
  assert.equal(invoked, 1);
  work.resolve('done');
  assert.deepEqual(await pending, { ok: true, state: 'active', value: 'done' });
  assert.equal(host.inspect().busy, false);
  assert.deepEqual(events[1], {
    phase: 'activate', module_id: 'local-agenttool', effects: ['local:mutation'],
  });
  assert.deepEqual(events.at(-1), {
    phase: 'invoke', module_id: 'local-agenttool', operation: 'mutate', input: { local: 1 }, effects: ['local:mutation'],
  });
  for (const [phase, code] of [['activate', 'activation-failed'], ['invoke', 'operation-failed']]) {
    const broken = api.createModuleHost(descriptor(), {
      authorize: () => true,
      connect: async () => {
        if (phase === 'activate') throw new Error('SECRET');
        return {
          invoke() { throw new Error('SECRET'); },
          retire() { return { complete: true }; }, disconnect() {},
        };
      },
    });
    const activated = await broken.activate();
    failure(phase === 'activate' ? activated : await broken.invoke('mutate', 'SECRET'), code);
  }
});

test('invocation input is bound at admission across nested mutation and async approval', async t => {
  const approval = deferred(), entered = deferred();
  const input = { task_id: 'approved-task', nested: { bodies: ['approved-body'] } };
  const expected = { task_id: 'approved-task', nested: { bodies: ['approved-body'] } };
  let request, dispatched;
  const host = api.createModuleHost(descriptor(), {
    authorize(value) {
      if (value.phase === 'activate') return true;
      request = value; entered.resolve(); return approval.promise;
    },
    connect: () => ({
      invoke(operation, value) { dispatched = value; return value; },
      retire: () => ({ complete: true }), disconnect() {},
    }),
  });
  t.after(async () => { approval.resolve(true); await host.retire(); });
  await host.activate();
  const pending = host.invoke('mutate', input);
  input.task_id = 'changed-before-policy';
  await entered.promise;
  input.nested.bodies[0] = 'changed-during-policy';
  input.nested.bodies.push('extra');
  approval.resolve(true);
  assert.deepEqual((await pending).value, expected);
  assert.deepEqual(request.input, expected);
  assert.equal(dispatched, request.input, 'Policy and provider receive the same snapshot');
  assert.notEqual(dispatched, input); assert.notEqual(dispatched.nested, input.nested);
});

test('invocation authorization receives a deeply frozen detached JSON snapshot', async t => {
  let request, dispatched, frozenAtApproval;
  const input = JSON.parse('{"nested":{"items":[{"value":1}]},"__proto__":{"safe":true}}');
  const host = api.createModuleHost(descriptor(), {
    authorize(value) {
      if (value.phase === 'invoke') {
        request = value;
        frozenAtApproval = [value.input, value.input?.nested, value.input?.nested?.items, value.input?.nested?.items?.[0], value.input?.__proto__]
          .map(item => item !== null && typeof item === 'object' && Object.isFrozen(item));
      }
      return true;
    },
    connect: () => ({
      invoke(operation, value) { dispatched = value; return 'done'; },
      retire: () => ({ complete: true }), disconnect() {},
    }),
  });
  t.after(() => host.retire()); await host.activate();
  assert.equal((await host.invoke('mutate', input)).ok, true);
  assert.deepEqual(frozenAtApproval, [true, true, true, true, true], 'Already immutable inside the authorization callback');
  assert.deepEqual(request.input, input);
  assert.equal(dispatched, request.input);
  for (const value of [request.input, request.input.nested, request.input.nested.items, request.input.nested.items[0], request.input.__proto__]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { request.input.nested.items[0].value = 2; }, TypeError);
  assert.throws(() => request.input.nested.items.push({ value: 2 }), TypeError);
  assert.equal(input.nested.items[0].value, 1);
  assert.equal(Object.getPrototypeOf(request.input), Object.prototype);
});

test('invalid invocation input is fixed, bounded and inert before policy or provider', async t => {
  let policy = 0, provider = 0, getters = 0;
  const host = api.createModuleHost(descriptor(), {
    authorize() { policy++; return true; },
    connect: () => ({ invoke() { provider++; }, retire: () => ({ complete: true }), disconnect() {} }),
  });
  t.after(() => host.retire()); await host.activate();
  const accessor = Object.defineProperty({}, 'SECRET', { enumerable: true, get() { getters++; return 'SECRET'; } });
  const arrayAccessor = Object.defineProperty([], '0', { enumerable: true, get() { getters++; return 'SECRET'; } });
  const toJSON = Object.defineProperty({}, 'toJSON', { get() { getters++; return () => 'SECRET'; } });
  const cycle = {}; cycle.self = cycle;
  let deep = null; for (let i = 0; i < 34; i++) deep = { next: deep };
  const proxy = new Proxy({}, { getPrototypeOf() { getters++; return Object.prototype; } });
  const candidates = [
    { nested: { value: undefined } }, [undefined], { value: NaN }, Infinity, 1n, Symbol('SECRET'), () => 'SECRET',
    new Date(), new Map(), new Set(), /SECRET/, new Uint8Array([1]), new (class Value {})(),
    accessor, arrayAccessor, toJSON, proxy, cycle, [,'SECRET'], Object.assign([], { extra: 'SECRET' }),
    { [Symbol('SECRET')]: 1 }, Object.defineProperty({}, 'hidden', { value: 'SECRET' }),
    deep, Array(10001).fill(null), 'x'.repeat(65537), 'é'.repeat(32768),
  ];
  for (const input of candidates) {
    assert.deepEqual(await host.invoke('mutate', input), {
      ok: false, state: 'active', error: { code: 'invalid-input', message: 'Invalid invocation input.', retryable: false },
    });
    assert.equal(host.inspect().busy, false);
    assert.equal(policy, 1); assert.equal(provider, 0); assert.equal(getters, 0);
  }
});

test('valid JSON and omitted invocation input retain their values', async t => {
  let authorized;
  const host = api.createModuleHost(descriptor(), {
    authorize(request) { if (request.phase === 'invoke') authorized = request.input; return true; },
    connect: () => ({ invoke(operation, input) { assert.equal(input, authorized); return input; }, retire: () => ({ complete: true }), disconnect() {} }),
  });
  t.after(() => host.retire()); await host.activate();
  const shared = { value: 1 };
  for (const input of [undefined, null, true, false, 0, 1.5, '', [1, { nested: null }], { a: shared, b: shared }, 'x'.repeat(65534)]) {
    const result = input === undefined ? await host.invoke('read') : await host.invoke('read', input);
    assert.equal(result.ok, true); assert.deepEqual(result.value, input);
  }
});

test('retirement is an irreversible bounded fence', { timeout: 1000 }, async t => {
  const idle = api.createModuleHost(descriptor(), {
    connect() { assert.fail('idle retirement connected'); },
    authorize() { assert.fail('retirement requested authority'); },
  });
  assert.equal(typeof idle.retire, 'function');
  const idleRetirement = idle.retire();
  assert.equal(idle.retire(), idleRetirement);
  assert.deepEqual(await idleRetirement, { complete: true });
  assert.equal(idle.inspect().state, 'retired');
  failure(await idle.activate(), 'not-active');

  const fixture = (options = {}) => {
    const counts = { connect: 0, invoke: 0, retire: 0, disconnect: 0, authorize: 0 };
    const provider = {
      async invoke() { counts.invoke++; return options.invoke?.(); },
      async retire() { counts.retire++; return options.retire ? options.retire() : { complete: true }; },
      async disconnect() { counts.disconnect++; return options.disconnect?.(); },
    };
    const host = api.createModuleHost(descriptor(), {
      async connect() { counts.connect++; return options.connect ? options.connect(provider) : provider; },
      async authorize(request) { counts.authorize++; return options.authorize ? options.authorize(request) : true; },
      timeoutMs: 15,
    });
    return { host, counts, provider };
  };
  const sealed = async (host, result, expected) => {
    assert.deepEqual(await result, { complete: expected });
    assert.equal(host.retire(), result);
    assert.equal(host.inspect().admission, false);
    assert.equal(host.inspect().cleanup_pending, !expected);
    assert.equal(host.inspect().state, expected ? 'retired' : 'cleanup_pending');
    failure(await host.activate(), 'not-active');
    failure(await host.invoke('mutate', 'SECRET'), 'not-active');
  };

  for (const phase of ['activate', 'invoke']) await t.test(`late ${phase} approval cannot escape`, async () => {
    const approval = deferred();
    const entered = deferred();
    const { host, counts } = fixture({
      authorize(request) {
        if (request.phase !== phase) return true;
        entered.resolve();
        return approval.promise;
      },
    });
    if (phase === 'invoke') await host.activate();
    const pending = phase === 'activate' ? host.activate() : host.invoke('mutate', {});
    await entered.promise;
    const retirement = host.retire();
    assert.equal(host.inspect().admission, false);
    failure(await host.invoke('read', {}), 'not-active');
    failure(await host.activate(), 'not-active');
    const authorities = counts.authorize;
    approval.resolve(true);
    failure(await pending, 'not-active');
    await sealed(host, retirement, true);
    assert.equal(counts.authorize, authorities);
    assert.equal(counts.invoke, 0);
    assert.equal(counts.connect, phase === 'activate' ? 0 : 1);
    assert.equal(counts.retire, phase === 'activate' ? 0 : 1);
    assert.equal(counts.disconnect, counts.retire);
  });

  await t.test('accepted work can finish before permanent cleanup', async () => {
    const operation = deferred();
    const entered = deferred();
    const { host, counts } = fixture({ invoke() { entered.resolve(); return operation.promise; } });
    await host.activate();
    const pending = host.invoke('mutate', {});
    await entered.promise;
    const retirement = host.retire();
    assert.equal(counts.retire, 0);
    operation.resolve('finished');
    failure(await pending, 'not-active');
    await sealed(host, retirement, true);
    assert.equal(counts.invoke, 1);
    assert.equal(counts.retire, 1);
    assert.equal(counts.disconnect, 1);
  });

  for (const mode of ['uncertain-error', 'invoke-timeout', 'retire-during-invoke']) {
    await t.test(`${mode} never replays mutation or permanent cleanup`, async () => {
      const operation = deferred();
      const entered = deferred();
      const { host, counts } = fixture({ invoke() {
        entered.resolve();
        if (mode === 'uncertain-error') throw Object.assign(new Error('SECRET'), { uncertain: true });
        return operation.promise;
      } });
      await host.activate();
      const pending = host.invoke('mutate', 'SECRET');
      await entered.promise;
      let retirement;
      if (mode === 'retire-during-invoke') retirement = host.retire();
      failure(await pending, 'outcome-unknown');
      assert.equal(host.inspect().admission, false);
      failure(await host.invoke('mutate', {}), 'not-active');
      retirement ??= host.retire();
      await sealed(host, retirement, false);
      operation.resolve('late success is not reconciliation');
      await tick();
      assert.equal(counts.invoke, 1);
      assert.equal(counts.retire, 0);
      assert.equal(counts.disconnect, 1);
      assert.equal(host.inspect().state, 'cleanup_pending');
    });
  }

  for (const mode of ['connect-timeout', 'retire-during-connect']) {
    await t.test(`${mode} disconnects a late provider without reactivation`, async () => {
      const connection = deferred();
      const entered = deferred();
      const { host, counts, provider } = fixture({ connect() { entered.resolve(); return connection.promise; } });
      const activation = host.activate();
      await entered.promise;
      let retirement;
      if (mode === 'retire-during-connect') retirement = host.retire();
      failure(await activation, 'outcome-unknown');
      retirement ??= host.retire();
      await sealed(host, retirement, false);
      connection.resolve(provider);
      await tick();
      assert.equal(counts.connect, 1);
      assert.equal(counts.retire, 0);
      assert.equal(counts.disconnect, 1);
      assert.equal(host.inspect().state, 'cleanup_pending');
    });
  }

  for (const mode of ['incomplete', 'throw', 'timeout', 'disconnect-throw', 'disconnect-timeout']) {
    await t.test(`${mode} cleanup stays disabled and runs once`, async () => {
      const never = new Promise(() => {});
      const { host, counts } = fixture({
        retire() {
          if (mode === 'throw') throw new Error('SECRET');
          if (mode === 'timeout') return never;
          return { complete: mode !== 'incomplete' };
        },
        disconnect() {
          if (mode === 'disconnect-throw') throw new Error('SECRET');
          if (mode === 'disconnect-timeout') return never;
        },
      });
      await host.activate();
      const retirement = host.retire();
      assert.equal(host.inspect().admission, false);
      await sealed(host, retirement, false);
      assert.equal(counts.retire, 1);
      assert.equal(counts.disconnect, 1);
      assert.equal(counts.authorize, 1);
    });
  }
});

test('upgrade preview separates compatibility, review, and lifecycle barriers', () => {
  assert.equal(typeof api.planUpgrade, 'function');
  const current = descriptor();
  const candidate = descriptor({
    version: '0.2.0-dev', operations: ['read', 'mutate', 'inspect'], effects: ['new:effect'],
  });
  const preview = api.planUpgrade(current, candidate);
  assert.deepEqual(preview, {
    compatible: true, blocked: false,
    changes: {
      added_operations: ['inspect'], removed_operations: [],
      added_effects: ['new:effect'], removed_effects: ['local:mutation'],
    },
    required_actions: ['review-candidate-code', 'review-operation-changes', 'review-effect-changes'],
    not_established: ['authority', 'provider_compatibility', 'migration_safety'],
  });
  preview.changes.added_operations.push('injected');
  assert.deepEqual(candidate.operations, ['read', 'mutate', 'inspect']);
  assert.deepEqual(current, descriptor());
  for (const difference of [
    { id: 'different-module' }, { contract_version: 'xenia.module/next' },
    { state_schema_version: 2 }, { operations: ['read'] },
  ]) {
    const incompatible = api.planUpgrade(current, descriptor(difference));
    assert.equal(incompatible.compatible, false);
    assert.equal(incompatible.blocked, true);
    assert.ok(incompatible.required_actions.includes('resolve-incompatibility'));
    if (difference.operations) assert.deepEqual(incompatible.changes.removed_operations, ['mutate']);
  }
  for (const state of ['disabled', 'retired']) {
    const inert = api.planUpgrade(current, current, { state });
    assert.equal(inert.compatible, true);
    assert.equal(inert.blocked, false);
    assert.deepEqual(inert.required_actions, ['review-candidate-code']);
  }
  for (const state of ['active', 'activating', 'pending', 'retiring', 'outcome_unknown', 'unknown', 'cleanup_pending', 'unrecognized']) {
    const blocked = api.planUpgrade(current, current, { state });
    assert.equal(blocked.compatible, true);
    assert.equal(blocked.blocked, true);
    assert.ok(blocked.required_actions.includes('review-candidate-code'));
    assert.ok(blocked.required_actions.includes('retire-current-module'));
    assert.ok(blocked.required_actions.includes('reconcile-current-state'));
  }
  assert.throws(() => api.planUpgrade(descriptor({ extra: true }), candidate), /Invalid descriptor/);
  assert.throws(() => api.planUpgrade(current, descriptor({ operations: ['read', 'read'] })), /Invalid descriptor/);
});
