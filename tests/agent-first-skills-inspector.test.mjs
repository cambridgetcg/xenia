// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { createModuleRuntime } from '../agent-first/0.1/runtime.mjs';

const adapterUrl = new URL('../agent-first/0.1/adapters/skills-inspector.mjs', import.meta.url);
const exampleUrl = new URL('../agent-first/0.1/examples/inspect-skills.mjs', import.meta.url);
const unitRoot = mkdtempSync(join(tmpdir(), 'xenia-inspector-unit-'));
after(() => rmSync(unitRoot, { recursive: true, force: true }));
async function adapter() {
  assert.ok(existsSync(adapterUrl), 'the optional Skills inspector adapter must exist');
  return import(adapterUrl.href);
}

// Synthetic provider reports are contract fixtures, not live inspection evidence.
function fixtureReport(version = '0.3.3') {
  return {
    $schema: 'urn:agenttool:skills:inspection:v0.1',
    schemaVersion: 'agenttool.skills/inspect-v0.1',
    kind: 'agenttool.skills.inspection',
    generatedBy: { name: '@agenttool/skills', version },
    mode: 'read-only', valid: true,
    scope: { root: '.', inputKind: 'directory', limits: {} },
    executionPolicy: {
      network: false, subprocesses: false, scriptExecution: false,
      mcpStartup: false, configMutation: false, credentialLookup: false, hostedApiCalls: false,
    },
    filesystemPolicy: {
      observedSymlinks: 'reject', finalFileSymlinkFollowing: false,
      concurrentAncestorReplacement: 'not-guaranteed', immutableSnapshotRecommended: true,
    },
    package: null, manifests: [], skills: [],
    summary: { skills: 0, files: 0, scripts: 0, resources: 0, errors: 0, warnings: 0, redactions: 0 },
    issues: [],
  };
}

test('a chosen inspector is inert until activation and affirmative host permission', async () => {
  const { createSkillsInspectorModule } = await adapter();
  const calls = [];
  const provider = { async inspectLocalSkills(root) { calls.push(root); return fixtureReport(); } };
  const definition = createSkillsInspectorModule({ provider, root: unitRoot });
  assert.equal(calls.length, 0);
  const closed = createModuleRuntime();
  closed.register(definition);
  const described = closed.describe('agenttool.skills-inspector');
  assert.equal(described.state, 'registered');
  assert.deepEqual(described.operations.map(op => [op.id, op.effects]), [['inspect', ['local-read']]]);
  assert.equal(Object.hasOwn(described.operations[0], 'run'), false);
  await assert.rejects(closed.invoke(definition.id, 'inspect'), { code: 'MODULE_INACTIVE' });
  closed.activate(definition.id);
  await assert.rejects(closed.invoke(definition.id, 'inspect'), { code: 'POLICY_BLOCKED' });
  assert.equal(calls.length, 0);
  let admission;
  const open = createModuleRuntime({ authorize(request) { admission = request; return true; } });
  open.register(definition); open.activate(definition.id);
  const result = await open.invoke(definition.id, 'inspect');
  assert.deepEqual(calls, [unitRoot]);
  assert.deepEqual(admission.effects, ['local-read']);
  assert.equal(result.value.kind, 'agenttool.skills.inspection');
  assert.equal(result.module.contract, 'agent-first.skills-inspector/0.1');
  assert.equal(result.establishes_external_effect, false);
});

test('construction rejects unsupported inputs without inspecting files or invoking getters', async () => {
  const { createSkillsInspectorModule: create } = await adapter();
  let touched = 0;
  const provider = { inspectLocalSkills() { touched++; return fixtureReport(); } };
  assert.throws(() => create(), { code: 'INVALID_CONFIGURATION' });
  assert.throws(() => create({ root: unitRoot }), { code: 'INVALID_PROVIDER' });
  for (const root of ['relative/path', 'file:///tmp/fixture', '/bad\0path', '', null]) {
    assert.throws(() => create({ provider, root }), { code: 'INVALID_ROOT' });
  }
  for (const providerVersion of ['latest', '*', '^0.3.3', '0.3.x', null]) {
    assert.throws(() => create({ provider, root: unitRoot, providerVersion }), { code: 'INVALID_PROVIDER_VERSION' });
  }
  assert.throws(() => create({ provider, root: unitRoot, autoActivate: true }), { code: 'INVALID_CONFIGURATION' });
  const getters = {};
  Object.defineProperty(getters, 'inspectLocalSkills', { get() { touched++; return provider.inspectLocalSkills; } });
  assert.throws(() => create({ provider: getters, root: unitRoot }), { code: 'INVALID_PROVIDER' });
  const config = { root: unitRoot };
  Object.defineProperty(config, 'provider', { get() { touched++; return provider; } });
  assert.throws(() => create(config), { code: 'INVALID_CONFIGURATION' });
  const proxy = new Proxy(provider, { getOwnPropertyDescriptor() { touched++; throw new Error('not inspected'); } });
  assert.throws(() => create({ provider: proxy, root: unitRoot }), { code: 'INVALID_PROVIDER' });
  assert.equal(touched, 0);
});

test('an invocation cannot change the host-selected root or inspector function', async () => {
  const { createSkillsInspectorModule } = await adapter();
  const calls = [];
  const provider = { async inspectLocalSkills(root) { calls.push(root); return fixtureReport(); } };
  const definition = createSkillsInspectorModule({ provider, root: unitRoot });
  provider.inspectLocalSkills = () => { throw new Error('replacement must not run'); };
  const runtime = createModuleRuntime({ authorize: () => true });
  runtime.register(definition); runtime.activate(definition.id);
  for (const input of [{ root: '/different' }, { install: true }, {}, [], 'path']) {
    await assert.rejects(runtime.invoke(definition.id, 'inspect', input), { code: 'OPERATION_FAILED' });
  }
  assert.equal(calls.length, 0);
  await runtime.invoke(definition.id, 'inspect');
  assert.deepEqual(calls, [unitRoot]);
});

test('report compatibility is fenced and successful reports are retained as snapshots', async () => {
  const { createSkillsInspectorModule } = await adapter();
  let response = fixtureReport();
  const runtime = createModuleRuntime({ authorize: () => true });
  const definition = createSkillsInspectorModule({ provider: { async inspectLocalSkills() { return response; } }, root: unitRoot });
  runtime.register(definition); runtime.activate(definition.id);
  const result = await runtime.invoke(definition.id, 'inspect');
  response.summary.files = 99;
  assert.equal(result.value.summary.files, 0, 'returned evidence must not remain aliased to provider state');
  const mutations = [
    r => { r.$schema = 'urn:other'; },
    r => { r.schemaVersion = 'future-unreviewed'; },
    r => { r.kind = 'execution'; },
    r => { r.mode = 'execute'; },
    r => { r.generatedBy.version = '9.0.0'; },
    r => { r.generatedBy.name = 'other-provider'; },
    r => { r.executionPolicy.network = true; },
    r => { r.executionPolicy.extraCapability = false; },
    r => { delete r.executionPolicy.credentialLookup; },
    r => { r.scope.root = '/private'; },
    r => { r.valid = 'yes'; },
    r => { r.skills = {}; },
    r => { r.summary = null; },
    r => { r.summary.files = -1; },
    r => { r.summary.errors = 'none'; },
  ];
  for (const mutate of mutations) {
    response = fixtureReport(); mutate(response);
    await assert.rejects(runtime.invoke(definition.id, 'inspect'), { code: 'OPERATION_FAILED' });
  }
  for (const malformed of [null, [], undefined, { fn() {} }]) {
    response = malformed;
    await assert.rejects(runtime.invoke(definition.id, 'inspect'), { code: 'OPERATION_FAILED' });
  }
  response = fixtureReport(); response.valid = false;
  response.summary.errors = 1;
  response.issues.push({ severity: 'error', code: 'fixture-invalid', path: 'SKILL.md', message: 'A synthetic finding.' });
  const findings = await runtime.invoke(definition.id, 'inspect');
  assert.equal(findings.value.valid, false, 'an invalid skill remains a useful inspection result');
});

// Compatibility/regression checks of the reused runtime; no second lifecycle engine.
test('provider replacement uses a revision boundary and retirement drains only the existing call', async () => {
  const { createSkillsInspectorModule: create } = await adapter();
  const runtime = createModuleRuntime({ authorize: () => true });
  const first = create({ provider: { async inspectLocalSkills() { return fixtureReport(); } }, root: unitRoot });
  runtime.register(first); runtime.activate(first.id);
  const prior = await runtime.invoke(first.id, 'inspect');
  let release, entered, calls = 0;
  const providerEntered = new Promise(resolve => { entered = resolve; });
  const replacement = create({
    provider: { inspectLocalSkills() { calls++; entered(); return new Promise(resolve => { release = resolve; }); } },
    root: unitRoot, providerVersion: '0.3.4',
  });
  assert.throws(() => runtime.upgrade(first.id, replacement, { expectedRevision: 0 }), { code: 'STALE_REVISION' });
  runtime.upgrade(first.id, replacement, { expectedRevision: 1 });
  const pending = runtime.invoke(first.id, 'inspect');
  await providerEntered;
  assert.equal(runtime.retire(first.id).state, 'retiring');
  await assert.rejects(runtime.invoke(first.id, 'inspect'), { code: 'MODULE_RETIRED' });
  release(fixtureReport('0.3.4'));
  const finished = await pending;
  assert.equal(calls, 1);
  assert.equal(finished.module.revision, 2);
  assert.equal(finished.value.generatedBy.version, '0.3.4');
  assert.equal(prior.module.revision, 1);
  assert.equal(prior.value.generatedBy.version, '0.3.3');
  assert.equal(runtime.describe(first.id).state, 'retired');
  runtime.register({ id: 'local.echo', version: '1.0.0', contract: 'local.echo/1', title: 'Local echo', motif: 'independence', description: 'An unrelated pure module.', operations: { echo: { description: 'Echo.', effects: [], run: input => input } } });
  runtime.activate('local.echo');
  assert.equal((await runtime.invoke('local.echo', 'echo', 'still usable')).value, 'still usable');
});

test('the reference host explains itself without a provider and rejects incomplete or relative paths', () => {
  assert.ok(existsSync(exampleUrl), 'the explicit reference host must exist');
  const help = spawnSync(process.execPath, [fileURLToPath(exampleUrl), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(JSON.parse(help.stdout).usage, /PROVIDER_MODULE/);
  for (const args of [[], ['relative.mjs', '/root'], ['/module.mjs', 'relative'], ['/module.mjs', '/root', 'latest']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(exampleUrl), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).code, 'INVALID_ARGUMENTS');
    assert.match(JSON.parse(result.stdout).guidance, /explicit absolute/);
  }
});

test('the reference summary omits unconsumed producer metadata and hides provider-loading errors', () => {
  const base = mkdtempSync(join(tmpdir(), 'xenia-skills-cli-'));
  try {
    const report = fixtureReport();
    report.generatedBy.extra = 'TEST_PRIVATE_PROVIDER_NOTE';
    report.summary.extra = 'TEST_PRIVATE_COUNTER_NOTE';
    const fixture = join(base, 'provider.mjs');
    writeFileSync(fixture, `export async function inspectLocalSkills() { return ${JSON.stringify(report)}; }\n`);
    const result = spawnSync(process.execPath, [fileURLToPath(exampleUrl), fixture, base], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.includes('TEST_PRIVATE_'), false);
    assert.deepEqual(JSON.parse(result.stdout).provider, { name: '@agenttool/skills', version: '0.3.3' });
    const missing = spawnSync(process.execPath, [fileURLToPath(exampleUrl), join(base, 'absent.mjs'), base], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).code, 'PROVIDER_LOAD_FAILED');
    assert.equal(JSON.parse(missing.stdout).effect_outcome, 'unknown');
    assert.equal(missing.stdout.includes(base), false);
    assert.equal(missing.stderr, '');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('file targets and symlink roots are refused before the provider can broaden their scope', async () => {
  const { createSkillsInspectorModule } = await adapter();
  const base = mkdtempSync(join(tmpdir(), 'xenia-root-boundary-'));
  try {
    const directory = join(base, 'skill-root'); mkdirSync(directory);
    const file = join(directory, 'SKILL.md'); writeFileSync(file, '# Synthetic file\n');
    const link = join(base, 'directory-link'); symlinkSync(directory, link, 'dir');
    for (const root of [file, link, `${link}/`, join(base, 'missing')]) {
      let called = 0;
      const definition = createSkillsInspectorModule({
        provider: { async inspectLocalSkills() { called++; return fixtureReport(); } }, root,
      });
      const runtime = createModuleRuntime({ authorize: () => true });
      runtime.register(definition); runtime.activate(definition.id);
      await assert.rejects(runtime.invoke(definition.id, 'inspect'), { code: 'OPERATION_FAILED' });
      assert.equal(called, 0);
    }
    assert.equal(readFileSync(file, 'utf8'), '# Synthetic file\n');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

const realProviderPath = process.env.XENIA_AGENTTOOL_SKILLS_MODULE;
test('real selected provider inspects synthetic files without executing them and survives retirement', {
  skip: !realProviderPath && 'set XENIA_AGENTTOOL_SKILLS_MODULE to an explicitly reviewed provider module',
}, async () => {
  assert.equal(isAbsolute(realProviderPath), true);
  const provider = await import(pathToFileURL(realProviderPath).href);
  const { createSkillsInspectorModule } = await adapter();
  const base = mkdtempSync(join(tmpdir(), 'xenia-skills-test-'));
  const root = join(base, 'paper-lantern');
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    const skill = '---\nname: paper-lantern\ndescription: A synthetic inspection fixture.\nallowed-tools: Read\n---\n\nTEST_INSTRUCTION_BODY_NOT_TO_RETURN\n';
    const script = "import {writeFileSync} from 'node:fs'; writeFileSync(new URL('../ran.txt', import.meta.url), 'must not run');\n";
    writeFileSync(join(root, 'SKILL.md'), skill);
    writeFileSync(join(root, 'scripts', 'never-run.mjs'), script);
    const runtime = createModuleRuntime({ authorize: request => request.module.id === 'agenttool.skills-inspector' && request.operation === 'inspect' && request.effects.join(',') === 'local-read' });
    const definition = createSkillsInspectorModule({ provider, root });
    runtime.register(definition); runtime.activate(definition.id);
    const receipt = await runtime.invoke(definition.id, 'inspect');
    const report = receipt.value;
    assert.equal(report.generatedBy.version, '0.3.3');
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    assert.equal(report.summary.skills, 1);
    assert.equal(report.summary.scripts, 1);
    const example = spawnSync(process.execPath, [fileURLToPath(exampleUrl), realProviderPath, root], { encoding: 'utf8' });
    assert.equal(example.status, 0, example.stderr || example.stdout);
    const output = JSON.parse(example.stdout);
    assert.equal(output.status, 'inspected');
    assert.equal(output.valid_structure, true);
    assert.equal(output.counts.skills, 1);
    assert.equal(output.lifecycle, 'retired');
    assert.equal(output.establishes_permission, false);
    assert.equal(example.stdout.includes(root), false);
    assert.equal(example.stdout.includes('TEST_INSTRUCTION_BODY_NOT_TO_RETURN'), false);
    assert.match(report.skills[0].digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(report.skills[0].requirements.tools[0].trusted, false);
    assert.equal(JSON.stringify(report).includes('TEST_INSTRUCTION_BODY_NOT_TO_RETURN'), false);
    assert.equal(JSON.stringify(report).includes(base), false);
    assert.equal(existsSync(join(root, 'ran.txt')), false);
    runtime.pause(definition.id);
    await assert.rejects(runtime.invoke(definition.id, 'inspect'), { code: 'MODULE_INACTIVE' });
    runtime.activate(definition.id);
    assert.deepEqual((await runtime.invoke(definition.id, 'inspect')).value, report);
    runtime.retire(definition.id);
    await assert.rejects(runtime.invoke(definition.id, 'inspect'), { code: 'MODULE_RETIRED' });
    assert.equal(readFileSync(join(root, 'SKILL.md'), 'utf8'), skill);
    assert.equal(readFileSync(join(root, 'scripts', 'never-run.mjs'), 'utf8'), script);
    assert.deepEqual(readdirSync(root).sort(), ['SKILL.md', 'scripts']);
    // A separate invalid fixture must stay a report, not become an execution approval.
    const invalidRoot = join(base, 'invalid-fixture');
    mkdirSync(invalidRoot); writeFileSync(join(invalidRoot, 'SKILL.md'), '# No frontmatter\n');
    const other = createModuleRuntime({ authorize: () => true });
    other.register(createSkillsInspectorModule({ provider, root: invalidRoot }));
    other.activate(definition.id);
    const invalid = (await other.invoke(definition.id, 'inspect')).value;
    assert.equal(invalid.valid, false); assert.ok(invalid.summary.errors > 0);
  } finally { rmSync(base, { recursive: true, force: true }); }
});




