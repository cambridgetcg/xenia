// Source-only draft seam; not a released protocol or a security sandbox.
import { types } from 'node:util';
import { Buffer } from 'node:buffer';
const fields = ['id', 'version', 'contract_version', 'state_schema_version', 'operations', 'effects'];
const invalid = () => { throw new TypeError('Invalid descriptor.'); };
const text = (value, max = Infinity) => typeof value === 'string'
  && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

function names(value, max) {
  if (!Array.isArray(value)) invalid();
  const properties = Object.getOwnPropertyDescriptors(value);
  const length = properties.length.value;
  if (Reflect.ownKeys(properties).length !== length + 1) invalid();
  const result = [];
  for (let index = 0; index < length; index++) {
    const entry = properties[index];
    if (!entry || !Object.hasOwn(entry, 'value') || !text(entry.value, max)) invalid();
    result.push(entry.value);
  }
  if (new Set(result).size !== result.length) invalid();
  return result;
}

/** Validate plain data without invoking accessors/toJSON; detach all collections. */
export function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object'
      || ![Object.prototype, null].includes(Object.getPrototypeOf(descriptor))) invalid();
  const properties = Object.getOwnPropertyDescriptors(descriptor);
  if (Reflect.ownKeys(properties).length !== fields.length) invalid();
  const data = {};
  for (const field of fields) {
    const property = properties[field];
    if (!property || !Object.hasOwn(property, 'value')) invalid();
    data[field] = property.value;
  }
  if (!text(data.id, 64) || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(data.id)
      || !text(data.version, 128)
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(data.version)
      || !text(data.contract_version)
      || !Number.isSafeInteger(data.state_schema_version) || data.state_schema_version < 1) invalid();
  data.operations = names(data.operations, 128);
  data.effects = names(data.effects, 256);
  return data;
}

/** Inert review only. Unblocked is not authorization, migration, or replacement. */
export function planUpgrade(current, candidate, { state = 'disabled' } = {}) {
  const before = validateDescriptor(current);
  const after = validateDescriptor(candidate);
  const difference = (left, right) => left.filter(value => !right.includes(value));
  const changes = {
    added_operations: difference(after.operations, before.operations),
    removed_operations: difference(before.operations, after.operations),
    added_effects: difference(after.effects, before.effects),
    removed_effects: difference(before.effects, after.effects),
  };
  const compatible = before.id === after.id
    && before.contract_version === after.contract_version
    && before.state_schema_version === after.state_schema_version
    && changes.removed_operations.length === 0;
  const unsafeState = state !== 'disabled' && state !== 'retired';
  const required_actions = ['review-candidate-code'];
  if (changes.added_operations.length || changes.removed_operations.length) required_actions.push('review-operation-changes');
  if (changes.added_effects.length || changes.removed_effects.length) required_actions.push('review-effect-changes');
  if (!compatible) required_actions.push('resolve-incompatibility');
  if (unsafeState) required_actions.push('retire-current-module', 'reconcile-current-state');
  return {
    compatible, blocked: !compatible || unsafeState, changes, required_actions,
    not_established: ['authority', 'provider_compatibility', 'migration_safety'],
  };
}

// Admission accepts only detached plain JSON: <=64 KiB encoded, 10,000 values,
// depth <=32 (root depth 0). Descriptors avoid getters/toJSON; proxies are refused.
export function snapshotInput(input) {
  if (input === undefined) return undefined; // Existing omitted-input calls remain valid.
  let bytes = 0, nodes = 0;
  const ancestors = new Set();
  const invalidInput = () => { throw new TypeError('Invalid invocation input.'); };
  const charge = size => { if ((bytes += size) > 65536) invalidInput(); };
  const stringSize = value => {
    if (value.length > 65536) invalidInput();
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  };
  const copy = (value, depth) => {
    if (++nodes > 10000 || depth > 32) invalidInput();
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      charge(JSON.stringify(value).length); return value;
    }
    if (typeof value === 'string') { charge(stringSize(value)); return value; }
    if (!value || typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) invalidInput();
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) invalidInput();
    const properties = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(properties);
    const length = array ? properties.length.value : keys.length;
    if (length > 10000 || (array && keys.length !== length + 1)) invalidInput();
    charge(2 + Math.max(0, length - 1)); // Brackets/braces and commas.
    const result = array ? [] : Object.create(prototype);
    ancestors.add(value);
    for (let index = 0; index < length; index++) {
      const key = array ? String(index) : keys[index];
      const property = properties[key];
      if (typeof key !== 'string' || !property || !property.enumerable || !Object.hasOwn(property, 'value')) invalidInput();
      if (!array) charge(stringSize(key) + 1); // Encoded key and colon.
      Object.defineProperty(result, key, { value: copy(property.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(value);
    return Object.freeze(result);
  };
  return copy(input, 0);
}

const messages = {
  disabled: 'Module is disabled.', 'not-active': 'Module is not active.',
  unauthorized: 'Authorization denied.', busy: 'Module is busy.',
  'unknown-operation': 'Operation is not declared.',
  'invalid-input': 'Invalid invocation input.',
  'activation-failed': 'Activation failed.', 'operation-failed': 'Operation failed.',
  'outcome-unknown': 'Outcome is unknown; reconciliation required.',
};
const timedOut = Symbol('deadline');
const fenced = Symbol('retired');

// Deadlines bound waiting, not execution: injected code must yield to the runtime.
function deadline(action, milliseconds) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, timedOut), milliseconds);
    Promise.resolve().then(action).then(
      value => finish(resolve, value), error => finish(reject, error),
    );
  });
}
const isUncertain = error => {
  try { return error === timedOut || error?.uncertain === true; }
  catch { return true; }
};

export function createModuleHost(descriptor, { connect, authorize = () => false, timeoutMs = 10000 }) {
  const data = validateDescriptor(descriptor);
  if (typeof connect !== 'function' || typeof authorize !== 'function'
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    throw new TypeError('Invalid host options.');
  }
  let state = 'disabled';
  let generation = 0;
  let provider;
  let work = null;
  let effectPending = false;
  let uncertain = false;
  let cleanupPending = false;
  let retirement;
  let retirementFinished = false;
  let disconnection;
  const fail = code => ({ ok: false, state, error: { code, message: messages[code], retryable: false } });
  const reject = code => Promise.resolve(fail(code));
  const live = (token, expected) => token === generation && state === expected && !retirement && !uncertain;
  const unknown = () => {
    uncertain = cleanupPending = true;
    if (!retirement && state !== 'retiring') state = 'outcome_unknown';
  };
  const run = body => {
    const current = Promise.resolve().then(body);
    work = current;
    return current.finally(() => { if (work === current) work = null; });
  };
  // There is only one provider per admitted activation; never replay disconnect.
  const disconnect = target => disconnection ??= deadline(() => target.disconnect(), timeoutMs)
    .then(() => true, () => false);
  const permitted = async (phase, token, operation, input) => {
    try {
      return await deadline(() => {
        if (!live(token, phase === 'activate' ? 'activating' : 'active')) return false;
        return authorize({
          phase, module_id: data.id, ...(phase === 'invoke' ? { operation, input } : {}),
          effects: [...data.effects],
        });
      }, timeoutMs) === true;
    } catch { return false; }
  };
  return {
    inspect: () => ({
      descriptor: validateDescriptor(data), state, admission: state === 'active' && !uncertain && !retirement,
      busy: work !== null, cleanup_pending: cleanupPending,
    }),
    activate() {
      if (retirement || uncertain || state === 'cleanup_pending') return reject('not-active');
      if (work) return reject('busy');
      if (state !== 'disabled') return reject('not-active');
      state = 'activating';
      const token = ++generation;
      return run(async () => {
        const approved = await permitted('activate', token);
        if (!live(token, 'activating')) return fail('not-active');
        if (!approved) { state = 'disabled'; return fail('unauthorized'); }
        try {
          await deadline(async () => {
            if (!live(token, 'activating')) throw fenced;
            effectPending = true;
            try {
              provider = await connect();
              // The deadline cannot cancel connect. Quarantine any late provider.
              if (uncertain || retirementFinished) {
                cleanupPending = true;
                if (retirementFinished) state = 'cleanup_pending';
                await disconnect(provider);
              }
            } finally { effectPending = false; }
          }, timeoutMs);
          if (!live(token, 'activating')) return fail('not-active');
          if (!provider || !['invoke', 'retire', 'disconnect'].every(key => typeof provider[key] === 'function')) {
            throw new TypeError();
          }
          state = 'active';
          return { ok: true, state: 'active' };
        } catch (error) {
          if (isUncertain(error)) { unknown(); return fail('outcome-unknown'); }
          if (error === fenced || !live(token, 'activating')) return fail('not-active');
          if (provider) {
            cleanupPending = true;
            state = 'cleanup_pending';
            await disconnect(provider);
          } else state = 'disabled';
          return fail('activation-failed');
        }
      });
    },
    invoke(operation, input) {
      if (state !== 'active' || retirement || uncertain) return reject(state === 'disabled' ? 'disabled' : 'not-active');
      if (!data.operations.includes(operation)) return reject('unknown-operation');
      if (work) return reject('busy');
      let snapshot;
      try { snapshot = snapshotInput(input); }
      catch { return reject('invalid-input'); }
      const token = generation;
      return run(async () => {
        const approved = await permitted('invoke', token, operation, snapshot);
        if (!live(token, 'active')) return fail('not-active');
        if (!approved) return fail('unauthorized');
        try {
          const value = await deadline(async () => {
            if (!live(token, 'active')) throw fenced;
            effectPending = true;
            try { return await provider.invoke(operation, snapshot); }
            finally { effectPending = false; }
          }, timeoutMs);
          if (!live(token, 'active')) return fail('not-active');
          return { ok: true, state: 'active', value };
        } catch (error) {
          if (isUncertain(error)) { unknown(); return fail('outcome-unknown'); }
          return fail(error === fenced ? 'not-active' : 'operation-failed');
        }
      });
    },
    retire() {
      if (retirement) return retirement;
      // Revoke synchronously, before any wait or injected cleanup code.
      state = 'retiring';
      generation++;
      const accepted = work;
      retirement = Promise.resolve().then(async () => {
        if (accepted) {
          try { await deadline(() => accepted, timeoutMs); }
          catch { if (effectPending) unknown(); }
        }
        let complete = !uncertain;
        if (provider) {
          if (complete) {
            try { complete = (await deadline(() => provider.retire(), timeoutMs))?.complete === true; }
            catch { complete = false; }
          }
          const disconnected = await disconnect(provider);
          complete = complete && disconnected;
        } else if (effectPending) complete = false;
        cleanupPending = !complete;
        state = complete ? 'retired' : 'cleanup_pending';
        retirementFinished = true;
        return Object.freeze({ complete });
      });
      return retirement;
    },
  };
}
