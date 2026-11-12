// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const moduleUrl = new URL('../agent-first/0.1/motif-studies.mjs', import.meta.url);
async function motifs() {
  assert.ok(existsSync(moduleUrl), 'the source-linked motif study must exist');
  return import(moduleUrl.href);
}

test('motifs explain independent questions, mechanisms and connections without activation', async () => {
  const { listStudies, describeStudy } = await motifs();
  const cards = listStudies();
  assert.deepEqual(cards.map(card => card.id), ['arrival', 'representation', 'recovery', 'ending']);
  for (const card of cards) {
    assert.ok(card.question && card.mechanism && card.study);
    assert.ok(card.sources.length && card.not_established.length);
    assert.equal(card.standalone, true);
    assert.equal(card.requirements?.description_needs_build, false);
    assert.equal(card.requirements.study_needs_xenia_build, true);
    assert.equal(card.requirements.external_provider, false);
    assert.equal(card.requirements.network, false);
    assert.ok(Array.isArray(card.relates_to) && card.relates_to.length);
    const broad = JSON.parse(readFileSync(new URL('../agent-first/0.1/motifs.json', import.meta.url), 'utf8'));
    for (const link of card.relates_to) {
      assert.ok(broad.motifs.some(motif => motif.id === link.id));
      assert.ok(link.limit && ['partial-illustration', 'contrast'].includes(link.relation));
    }
    for (const source of card.sources) {
      const path = new URL(`../${source.path}`, import.meta.url);
      assert.ok(existsSync(path), source.path);
      if (source.symbol) assert.ok(readFileSync(path, 'utf8').includes(source.symbol), source.symbol);
    }
    for (const link of card.connects_to) assert.ok(cards.some(other => other.id === link.id));
  }
  cards[0].question = 'changed'; cards[0].sources[0].path = 'changed';
  assert.notEqual(describeStudy('arrival').question, 'changed');
  assert.notEqual(describeStudy('arrival').sources[0].path, 'changed');
  assert.throws(() => describeStudy('not-a-motif'), { code: 'STUDY_NOT_FOUND' });
});

test('arrival constructs a native manifest response with no invented assurance claims', async () => {
  const { runStudy } = await motifs();
  assert.equal(typeof runStudy, 'function', 'motifs must have an executable study, not only labels');
  const study = await runStudy('arrival');
  assert.equal(study.kind, 'motif-study');
  assert.equal(study.motif.id, 'arrival');
  assert.equal(study.basis, 'native-helper-execution-with-synthetic-inputs');
  assert.equal(study.output.status, 200);
  assert.match(study.output.content_type, /^application\/json/);
  assert.match(study.output.vary, /Accept/);
  assert.equal(study.output.body.profile, 'xenia-surface/0.1');
  assert.equal(study.output.body.resources[0].id, 'room');
  assert.deepEqual(study.output.body.claims, []);
  assert.ok(study.not_established.includes('hosted-service conformance'));
  assert.equal(study.external_actions_executed, false);
});

test('representation honors the requested form and explicit exclusion for one message', async () => {
  const { runStudy } = await motifs();
  const result = await runStudy('representation');
  assert.equal(result.json.selected, 'application/json');
  assert.equal(result.html.selected, 'text/html');
  assert.equal(result.json_excluded.selected, 'text/html');
  assert.equal(result.unsupported.selected, 'not-acceptable');
  assert.equal(result.unsupported.output, null);
  assert.equal(result.json.output.status, 200);
  assert.equal(result.html.output.status, 200);
  assert.ok(result.html.output.body.includes(result.json.output.body.message));
  assert.equal(result.json.output.vary, 'Accept');
  assert.equal(result.html.output.vary, 'Accept');
});

test('recovery offers native discovery and representation guidance without executing it', async () => {
  const { runStudy } = await motifs();
  const result = await runStudy('recovery');
  assert.equal(result.wrong_door.status, 404);
  assert.equal(result.wrong_door.body.terminal, false);
  assert.equal(result.wrong_door.body.retryable, false);
  assert.equal(result.wrong_door.body.next_actions[0].rel, 'discover');
  assert.equal(result.wrong_door.body.next_actions[0].method, 'GET');
  assert.equal(new URL(result.wrong_door.body.next_actions[0].href).pathname, '/.well-known/agent.json');
  assert.equal(result.unsupported_form.status, 406);
  assert.equal(result.unsupported_form.body.terminal, false);
  assert.equal(result.unsupported_form.body.next_actions[0].href, result.resource.href);
  assert.equal(result.unsupported_form.body.next_actions[0].accept, result.resource.default_media_type);
  assert.equal(result.external_actions_executed, false);
});

test('ending is independently complete and does not fabricate a participant decision', async () => {
  const { runStudy } = await motifs();
  const result = await runStudy('ending');
  assert.equal(result.output.status, 410);
  assert.equal(result.output.body.terminal, true);
  assert.equal(result.output.body.retryable, false);
  assert.deepEqual(result.output.body.next_actions, []);
  assert.ok(result.not_established.includes('a real participant’s choice'));
  assert.equal(result.external_actions_executed, false);
});

test('the journey passes real local values between motifs and ends without external action', async () => {
  const { composeJourney } = await motifs();
  assert.equal(typeof composeJourney, 'function');
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw new Error('network forbidden in this study'); };
  try {
    const journey = await composeJourney();
    assert.equal(journey.kind, 'motif-journey');
    assert.equal(journey.basis, 'native-helper-execution-with-synthetic-inputs');
    assert.deepEqual(journey.steps.map(step => step.id), ['wrong-door', 'arrival', 'unsupported-shape', 'recovered-json', 'alternate-html', 'clear-ending']);
    assert.deepEqual(journey.steps.map(step => step.output.status), [404, 200, 406, 200, 200, 410]);
    const byId = Object.fromEntries(journey.steps.map(step => [step.id, step]));
    const resource = byId.arrival.output.body.resources[0];
    assert.equal(byId['unsupported-shape'].resource.href, resource.href);
    assert.equal(byId['recovered-json'].chosen_proposal.href, resource.href);
    assert.equal(byId['recovered-json'].chosen_proposal.accept, byId['unsupported-shape'].output.body.next_actions[0].accept);
    assert.equal(byId['alternate-html'].resource.href, resource.href);
    assert.ok(byId['alternate-html'].output.body.includes(byId['recovered-json'].output.body.message));
    assert.ok(journey.connections.some(link => link.kind === 'contrast' && link.to === 'clear-ending'));
    assert.ok(journey.connections.every(link => byId[link.from] && byId[link.to]));
    assert.deepEqual(journey.next_actions, []);
    assert.equal(journey.external_actions_executed, false);
    assert.equal(fetchCalls, 0);
    journey.steps[1].output.body.service.name = 'changed';
    assert.notEqual((await composeJourney()).steps[1].output.body.service.name, 'changed');
  } finally { globalThis.fetch = previousFetch; }
});

function cliRun(file, args, extra = {}) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 10000, ...extra,
  });
  assert.equal(result.error, undefined);
  assert.ok(result.stdout.trim(), result.stderr || `CLI returned empty output (status ${result.status})`);
  return { ...result, value: JSON.parse(result.stdout) };
}

test('one existing CLI exposes motif metadata, standalone studies and the composed journey', () => {
  const cli = fileURLToPath(new URL('../agent-first/0.1/cli.mjs', import.meta.url));
  const broadMap = cliRun(cli, ['motifs']);
  const {next, ...mapOnly} = broadMap.value;
  assert.ok(Array.isArray(next), 'the door adds a next list to the map');
  assert.deepEqual(mapOnly, JSON.parse(readFileSync(new URL('../agent-first/0.1/motifs.json', import.meta.url), 'utf8')));
  const listed = cliRun(cli, ['motifs', 'study']);
  assert.equal(listed.status, 0);
  assert.equal(listed.value.kind, 'motif-study-catalog');
  assert.equal(listed.value.studies.length, 4);
  assert.equal(cliRun(cli, ['motifs', 'study', 'show', 'recovery']).value.motif.id, 'recovery');
  assert.equal(cliRun(cli, ['motifs', 'study', 'run', 'ending']).value.output.body.terminal, true);
  assert.equal(cliRun(cli, ['motifs', 'study', 'journey']).value.steps.length, 6);
  assert.ok(cliRun(cli, ['help']).value.commands.some(command => command.startsWith('motifs study')));
  assert.equal(cliRun(cli, ['motifs', 'study', '--help']).value.kind, 'motif-help');
  const unknown = cliRun(cli, ['motifs', 'study', 'run', 'private-untrusted-value']);
  assert.equal(unknown.status, 2);
  assert.equal(unknown.value.error.code, 'STUDY_NOT_FOUND');
  assert.equal(unknown.stdout.includes('private-untrusted-value'), false);
  const invalid = cliRun(cli, ['motifs', 'study', 'journey', 'extra']);
  assert.equal(invalid.status, 2);
  assert.equal(invalid.value.error.code, 'MOTIF_INVALID_ARGUMENTS');
  assert.equal(cliRun(cli, ['catalog']).value.modules.length, 3);
});

test('metadata stands alone without a build or provider, and removing studies leaves the core catalog', () => {
  // The existing CLI direct-entry guard compares canonical module URLs. Use
  // a canonical fixture directory (macOS /var is a symlink to /private/var).
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'xenia-motif-independence-'));
  try {
    const folder = join(base, 'agent-first', '0.1'); mkdirSync(folder, { recursive: true });
    for (const name of ['cli.mjs', 'runtime.mjs', 'modules.mjs', 'command-state.mjs', 'invoke.mjs', 'input-file.mjs', 'problems.mjs', 'adapter-catalog.mjs', 'arrive.mjs', 'motif-studies.mjs']) {
      copyFileSync(new URL(`../agent-first/0.1/${name}`, import.meta.url), join(folder, name));
    }
    const absentHome = join(base, 'absent-home');
    const options = { cwd: base, env: { PATH: '', HOME: absentHome } };
    const before = readdirSync(folder).sort();
    const cli = join(folder, 'cli.mjs');
    const listed = cliRun(cli, ['motifs', 'study'], options);
    assert.equal(listed.status, 0);
    assert.equal(listed.value.studies.length, 4);
    assert.equal(cliRun(cli, ['motifs', 'study', 'show', 'ending'], options).value.motif.id, 'ending');
    assert.equal(existsSync(absentHome), false);
    assert.deepEqual(readdirSync(folder).sort(), before);
    const missingBuild = cliRun(cli, ['motifs', 'study', 'run', 'ending'], options);
    assert.equal(missingBuild.status, 1);
    assert.equal(missingBuild.value.error.code, 'BUILD_REQUIRED');
    assert.equal(existsSync(absentHome), false);
    rmSync(join(folder, 'motif-studies.mjs'));
    const core = cliRun(cli, ['catalog'], options);
    assert.equal(core.status, 0);
    assert.equal(core.value.modules.length, 3);
  } finally { rmSync(base, { recursive: true, force: true }); }
});







