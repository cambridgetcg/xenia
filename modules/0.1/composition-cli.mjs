// SPDX-License-Identifier: MPL-2.0
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createModuleHost} from './host.mjs';
import {createCollabConnector} from './adapters/agenttool-collab/adapter.mjs';
import {createMotifHost, motifCards} from './motifs.mjs';
import {runComposition, inspectComposition, CompositionError} from './composition.mjs';

const failure = code => ({ok: false, error: {code, retryable: false}});
const collabCard = async () => JSON.parse(await readFile(new URL('./adapters/agenttool-collab/module.json', import.meta.url), 'utf8'));
function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (Object.hasOwn(result, key)) throw new CompositionError('invalid_arguments');
    if (key === '--run' || key === '--allow-local-state') result[key] = true;
    else if (key === '--collab-config' && typeof args[index + 1] === 'string' && path.isAbsolute(args[index + 1])) result[key] = args[++index];
    else if (key === '--jobs' && /^[1-8]$/.test(args[index + 1] ?? '')) result[key] = Number(args[++index]);
    else throw new CompositionError('invalid_arguments');
  }
  if (result['--allow-local-state'] && !result['--collab-config']) throw new CompositionError('invalid_arguments');
  return result;
}
async function executePlan(plan, {run = false, concurrency = 1, collabConfig, allowLocalState = false} = {}) {
  if (!Array.isArray(plan?.steps)) throw new CompositionError('invalid_plan');
  const hosts = {}, controller = new AbortController();
  for (const {use} of plan.steps) {
    if (typeof use !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(use)) throw new CompositionError('invalid_plan');
    if (!Object.hasOwn(hosts, use)) {
      const id = plan.bindings?.[use] ?? use;
      if (id === 'agenttool-collab') {
        if (run && !allowLocalState) throw new CompositionError('local_state_not_authorized');
        if (run && !collabConfig) throw new CompositionError('collab_configuration_required');
        const card = await collabCard();
        let connect = async () => {throw new Error('Preview cannot activate.');};
        try {if (run) connect = createCollabConnector(collabConfig);}
        catch {throw new CompositionError('invalid_collab_configuration');}
        hosts[use] = createModuleHost(card.descriptor, {connect, authorize: () => !controller.signal.aborted && allowLocalState === true,
          timeoutMs: (collabConfig?.timeoutMs ?? 10000) + 3000});
      } else {
        try { hosts[use] = createMotifHost(id, {authorize: request => !controller.signal.aborted && request.effects.length === 0}); }
        catch { throw new CompositionError('unknown_motif'); }
      }
    }
  }
  const preview = inspectComposition(plan, hosts);
  if (!run) return {ok: true, mode: 'preview', ...preview};
  let result = {ok: false}, interrupted = null;
  const stop = signal => {interrupted ??= signal; controller.abort();};
  const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
  process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate);
  try {
    for (const host of Object.values(hosts)) {
      if (controller.signal.aborted) break;
      const activated = await host.activate();
      if (!activated.ok) {result = activated; break;}
    }
    if (controller.signal.aborted) result = {...failure('cancelled'), cancelled: true};
    else if (Object.values(hosts).every(host => host.inspect().admission)) {
      result = {...await runComposition(plan, hosts, {concurrency, signal: controller.signal}), mode: 'explicit_composition'};
    }
  } catch (error) { result = failure(error instanceof CompositionError ? error.code : 'composition_failed'); }
  finally {
    result.retirement = Object.fromEntries(await Promise.all(Object.entries(hosts).map(async ([id, host]) => {
      let complete = false;
      try { complete = (await host.retire()).complete === true; } catch { /* No cleanup replay. */ }
      return [id, {complete, state: host.inspect().state}];
    })));
    result.cleanup_pending = Object.values(result.retirement).some(state => !state.complete);
    if (result.cleanup_pending) result.ok = false;
    if (interrupted) {result.interrupted = interrupted; result.cancelled = true; result.ok = false;}
    process.off('SIGINT', onInterrupt); process.off('SIGTERM', onTerminate);
  }
  return result;
}
export const listMotifs = async () => ({ok: true, observation: 'declarations_not_runtime_state',
  cards: [...motifCards(), {...await collabCard(), motif: 'coordination-and-correction'}]});
export async function invokeMotif(args, readConfiguration) {
  if (args.length !== 4 || args[2] !== '--input') return failure('invalid_arguments');
  try {
    const input = await readConfiguration(args[3]);
    const result = await executePlan({schema: 'xenia.composition/0.1-dev', links: [],
      steps: [{id: 'invocation', use: args[0], operation: args[1], input}]}, {run: true});
    return {...result, ...(result.steps?.invocation?.status === 'succeeded' ? {value: result.steps.invocation.value} : {})};
  } catch (error) { return failure(error instanceof CompositionError ? error.code : 'invalid_input_file'); }
}
export async function compositionDemo() {
  const plan = JSON.parse(await readFile(new URL('./examples/arrival-and-standing.json', import.meta.url), 'utf8'));
  return {...await executePlan(plan, {run: true}), mode: 'synthetic_local_profile_composition'};
}
export async function compositionCommand(args, readConfiguration) {
  try {
    if (!args[0] || args[0].startsWith('--')) return failure('invalid_arguments');
    const flags = options(args.slice(1));
    const plan = await readConfiguration(args[0]);
    const run = flags['--run'] === true;
    if (run && flags['--collab-config'] && !flags['--allow-local-state']) return failure('local_state_not_authorized');
    const collabConfig = run && flags['--collab-config'] ? await readConfiguration(flags['--collab-config']) : undefined;
    return await executePlan(plan, {run, concurrency: flags['--jobs'] ?? 1, collabConfig, allowLocalState: flags['--allow-local-state'] === true});
  } catch (error) { return failure(error instanceof CompositionError ? error.code : 'invalid_plan_file'); }
}
