// SPDX-License-Identifier: MPL-2.0
// One Node-only door. Metadata is inert; compatibility never grants authority.
import {readFile, mkdir, open, stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {planUpgrade, createModuleHost} from './host.mjs';
import {createCollabConnector} from './adapters/agenttool-collab/adapter.mjs';

const readLocal = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const moduleCard = () => readLocal('./adapters/agenttool-collab/module.json');
const failure = code => ({ok: false, error: {code, retryable: false}});
const help = {
  commands: {
    list: 'list (default): inert source catalog',
    motifs: 'motifs [id]: read source-grounded design cards; no activation',
    describe: 'describe <component-id>: inert module card or catalog entry',
    'upgrade-plan': 'upgrade-plan <candidate-json> [state]: review only; state defaults to unknown',
    demo: 'demo --bundle ABS --sha256 HEX --state-dir ABS: new private synthetic store only',
    session: 'session --config ABS_JSON [--allow-local-state]: explicit local JSONL session',
  },
  session_protocol: {
    request: '{id:string|integer,method:inspect|activate|invoke|retire,operation?,input?}',
    response: '{id,ok,state?,value?,error?}; invalid/unidentifiable input uses id:null',
    end: 'One final {event:session_end,reason,complete,state,cleanup_pending} record; it is not a request response.',
    bounds: {line_bytes: 65536, pending_requests: 16, retirement_reserved_slot: 1},
    dependency_rule: 'Wait for dependent responses; concurrent mutations are not queued.',
    stop: 'retire fences admission; EOF, SIGINT and SIGTERM attempt bounded retirement.',
    authorization: 'Without --allow-local-state activation is denied. Review code and selected stores first.',
  },
  limits: ['Local only; no scheduler, automatic resume, peer discovery or remote networking.',
    'Demo means two protocol sessions under one synthetic test controller, not independent agents.'],
};

// Strict, command-local flags; duplicates and positional arguments are errors.
function flags(args, valued, switches = []) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (Object.hasOwn(options, key)) throw new Error();
    if (switches.includes(key)) options[key] = true;
    else if (valued.includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
    else throw new Error();
  }
  if (valued.some(key => !Object.hasOwn(options, key))) throw new Error();
  return options;
}

async function retire(host) {
  let complete = false;
  try { complete = (await host.retire()).complete === true; } catch { /* No replay. */ }
  const {state, cleanup_pending} = host.inspect();
  return {complete, state, cleanup_pending: cleanup_pending || !complete};
}

async function demo(args) {
  let options;
  try {
    options = flags(args, ['--bundle', '--sha256', '--state-dir']);
    if (!path.isAbsolute(options['--bundle']) || !path.isAbsolute(options['--state-dir'])
        || !/^[a-fA-F0-9]{64}$/.test(options['--sha256'])) throw new Error();
  } catch { return failure('invalid_arguments'); }
  const directory = options['--state-dir'];
  // Atomic, non-recursive creation refuses directories, files and dangling symlinks.
  try { await mkdir(directory, {mode: 0o700}); }
  catch (error) { return failure(error.code === 'EEXIST' ? 'state_exists' : 'state_unavailable'); }
  const hosts = {};
  const result = {ok: false, mode: 'synthetic_two_sessions_one_controller', state_retained: true};
  const requireOK = async promise => {
    const response = await promise;
    if (response.ok !== true) throw new Error();
    return response.value;
  };
  try {
    const card = await moduleCard();
    const config = {bundlePath: options['--bundle'], bundleSha256: options['--sha256'].toLowerCase(),
      databasePath: path.join(directory, 'journal.sqlite'), homeDir: path.join(directory, 'home'),
      workspace: path.join(directory, 'workspace'), serverVersion: card.runtime.server_version, timeoutMs: 5000};
    await mkdir(config.homeDir, {mode: 0o700});
    await mkdir(config.workspace, {mode: 0o700});
    for (const name of ['a', 'b']) {
      hosts[name] = createModuleHost(card.descriptor, {
        connect: createCollabConnector({...config, actor: 'xenia-synthetic-session-' + name}),
        authorize: () => true, timeoutMs: 8000,
      });
      await requireOK(hosts[name].activate());
    }
    const a = await requireOK(hosts.a.invoke('status', {}));
    const b = await requireOK(hosts.b.invoke('status', {}));
    result.sessions = {a: {workspace_id: a.workspace_id, session_id: a.session_id},
      b: {workspace_id: b.workspace_id, session_id: b.session_id}};
    if (a.session_id === b.session_id || a.workspace_id !== b.workspace_id) throw new Error();
    const task = await requireOK(hosts.a.invoke('createTask', {
      idempotency_key: 'synthetic-create', title: 'Synthetic protocol exercise; not completed work',
    }));
    const claimed = await requireOK(hosts.a.invoke('claimTask', {
      task_id: task.id, expected_version: task.version, idempotency_key: 'synthetic-claim',
    }));
    const report = await requireOK(hosts.a.invoke('report', {
      idempotency_key: 'synthetic-report', kind: 'observation', task_id: task.id,
      body: 'Two local protocol sessions under one synthetic test controller.',
      limits: 'Not independent agents or evidence of real collaborative participation. No task completion.',
    }));
    const page = await requireOK(hosts.b.invoke('next', {event_limit: 50}));
    // Processing here is only checking the synthetic report was actually read.
    const observed = page.reports.some(item => item.id === report.report_id);
    result.report = {...report, observed};
    if (!observed) throw new Error();
    result.page = {cursor_version: page.cursor_version, event_count: page.events.events.length,
      report_count: page.reports.length, next_anchor: page.events.next_anchor, has_more: page.events.has_more};
    result.acknowledged = await requireOK(hosts.b.invoke('acknowledge', {
      anchor: page.events.next_anchor, expected_cursor_version: page.cursor_version,
    }));
    if (!(await retire(hosts.a)).complete) throw new Error();
    const after = await requireOK(hosts.b.invoke('getTask', {task_id: task.id}));
    const peer = await requireOK(hosts.b.invoke('status', {}));
    result.task = {id: task.id, claimed: {status: claimed.status, version: claimed.version, lease_id: claimed.lease_id},
      after_a_retire: {status: after.status, version: after.version, lease_id: after.lease_id}};
    result.peer_after_a_retire = {state: hosts.b.inspect().state, active_session_ids: peer.active_session_ids};
    if (after.status !== 'open' || !peer.active_session_ids.includes(b.session_id)) throw new Error();
    result.ok = true;
  } catch { Object.assign(result, failure('demo_failed')); }
  finally {
    result.retirement = Object.fromEntries(await Promise.all(Object.entries(hosts)
      .map(async ([name, host]) => [name, await retire(host)])));
    result.cleanup_pending = Object.values(result.retirement).some(value => value.cleanup_pending);
    if (result.cleanup_pending) Object.assign(result, failure('cleanup_pending'));
  }
  return result;
}

const MAX_LINE = 65536;
const MAX_PENDING = 16;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = id => Number.isSafeInteger(id) || (typeof id === 'string' && id.length > 0
  && id.length <= 128 && !/[\u0000-\u001f\u007f]/.test(id));

async function readConfiguration(filename) {
  if (!(await stat(filename)).isFile()) throw new Error();
  const handle = await open(filename, 'r');
  try {
    const bytes = Buffer.alloc(MAX_LINE + 1);
    const {bytesRead} = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_LINE) throw new Error();
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
  } finally { await handle.close(); }
}

// No mutable-work scheduler: dispatch each accepted line immediately to the host.
// Clients must wait for dependencies. Only the host owns admission and retirement.
function jsonl(host) {
  return new Promise(resolve => {
    const input = process.stdin, output = process.stdout;
    const pending = new Map();
    let buffer = Buffer.alloc(0), stopped = false, stopping, outputBroken = false;
    let failed = false, retirementRequested = false;
    function send(value) {
      if (outputBroken) return;
      const line = JSON.stringify(value) + '\n';
      if (output.writableLength + Buffer.byteLength(line) > 2 * 1024 * 1024) {
        outputBroken = failed = true;
        void stop('output_backpressure');
      } else output.write(line);
    }
    function stop(reason) {
      if (stopping) return stopping;
      stopped = true;
      input.removeListener('data', data);
      input.removeListener('end', end);
      input.pause();
      input.unref?.();
      // retire() fences synchronously, BEFORE waiting for outstanding responses.
      stopping = (async () => {
        const cleanup = await retire(host);
        await Promise.allSettled([...pending.values()]);
        const summary = {event: 'session_end', reason, ...cleanup};
        send(summary);
        input.removeListener('error', inputError);
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', terminate);
        resolve({ok: !failed && cleanup.complete, streamed: true, ...summary});
      })();
      return stopping;
    }
    function line(bytes) {
      if (!bytes.toString('utf8').trim()) return;
      let request;
      try { request = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
      catch { send({id: null, ...failure('invalid_json')}); return; }
      const id = record(request) && validId(request.id) ? request.id : null;
      if (id === null || !['inspect', 'activate', 'invoke', 'retire'].includes(request.method)
          || Object.keys(request).some(key => !['id', 'method', 'operation', 'input'].includes(key))
          || (request.method === 'invoke' ? typeof request.operation !== 'string'
            || (request.input !== undefined && !record(request.input))
            : Object.hasOwn(request, 'operation') || Object.hasOwn(request, 'input'))) {
        send({id, ...failure('invalid_request')}); return;
      }
      // A duplicate pending ID cannot receive a second ambiguous response.
      if (pending.has(id)) { send({id: null, ...failure('duplicate_id')}); return; }
      if (request.method === 'inspect') { send({id, ok: true, value: host.inspect()}); return; }
      if (pending.size >= MAX_PENDING && !(request.method === 'retire' && !retirementRequested)) {
        send({id, ...failure('too_many_pending')}); return;
      }
      let action;
      if (request.method === 'retire') {
        retirementRequested = true;
        action = retire(host).then(value => ({ok: value.complete, state: value.state,
          cleanup_pending: value.cleanup_pending, value: {complete: value.complete},
          ...(!value.complete ? failure('cleanup_pending') : {})}));
      } else if (request.method === 'activate') action = host.activate();
      else action = host.invoke(request.operation, request.input ?? {});
      const work = Promise.resolve(action).then(result => send({id, ...result}),
        () => send({id, ...failure('request_failed')})).finally(() => pending.delete(id));
      pending.set(id, work);
    }
    function data(chunk) {
      let offset = 0;
      while (!stopped && offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const end = newline < 0 ? chunk.length : newline;
        const part = chunk.subarray(offset, end);
        if (buffer.length + part.length > MAX_LINE) {
          failed = true; send({id: null, ...failure('line_too_large')});
          void stop('line_too_large'); return;
        }
        buffer = Buffer.concat([buffer, part]);
        if (newline < 0) return;
        line(buffer); buffer = Buffer.alloc(0); offset = newline + 1;
      }
    }
    function end() {
      if (buffer.length && !stopped) line(buffer);
      void stop('eof');
    }
    function inputError() { failed = true; void stop('input_error'); }
    function interrupt() { void stop('SIGINT'); }
    function terminate() { void stop('SIGTERM'); }
    // Repeated Stop signals share retirement; they never replay native mutations.
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    output.on('error', () => { outputBroken = failed = true; void stop('output_error'); });
    input.on('error', inputError);
    input.on('data', data);
    input.once('end', end);
    input.resume();
  });
}

async function session(args) {
  let options;
  try {
    options = flags(args, ['--config'], ['--allow-local-state']);
    if (!path.isAbsolute(options['--config'])) throw new Error();
  } catch { return failure('invalid_arguments'); }
  let host;
  try {
    const config = await readConfiguration(options['--config']);
    const card = await moduleCard();
    host = createModuleHost(card.descriptor, {
      connect: createCollabConnector(config),
      authorize: () => options['--allow-local-state'] === true,
      timeoutMs: (config.timeoutMs ?? 10000) + 3000,
    });
  } catch { return failure('invalid_configuration'); }
  return jsonl(host);
}

export async function dispatch(args = []) {
  try {
    const command = args[0] ?? 'list';
    if (command === 'list' && args.length <= 1) return readLocal('./catalog.json');
    if (command === 'motifs' && (args.length === 1 || args.length === 2)) {
      const atlas = await readLocal('./motifs.json');
      if (args.length === 1) return atlas;
      const motif = atlas.motifs.find(item => item.id === args[1]);
      return motif ? {schema: atlas.schema, status: atlas.status, license: atlas.license,
        source: atlas.source, self_sufficiency: atlas.self_sufficiency,
        verification_boundary: atlas.verification_boundary, motif,
        connections: atlas.connections.filter(edge => edge.from === motif.id || edge.to === motif.id)}
        : failure('unknown_motif');
    }
    if (command === 'help' && args.length === 1) return help;
    if (command === 'demo') return await demo(args.slice(1));
    if (command === 'session') return await session(args.slice(1));
    if (command === 'describe' && args.length === 2) {
      if (args[1] === 'agenttool-collab') return moduleCard();
      return (await readLocal('./catalog.json')).components.find(entry => entry.id === args[1])
        ?? failure('unknown_module');
    }
    if (command === 'upgrade-plan' && (args.length === 2 || args.length === 3)) {
      try {
        const candidate = JSON.parse(await readFile(args[1], 'utf8'));
        const state = args[2] ?? 'unknown';
        return {ok: true, state, state_source: 'caller_supplied_not_runtime_observation',
          ...planUpgrade((await moduleCard()).descriptor, candidate?.descriptor ?? candidate, {state})};
      } catch { return failure('invalid_candidate'); }
    }
    return failure('unknown_command');
  } catch { return failure('command_failed'); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await dispatch(process.argv.slice(2));
  if (!result.streamed) process.stdout.write(JSON.stringify(result) + '\n');
  if (result.ok === false) process.exitCode = 1;
}
