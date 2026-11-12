#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
// Explicit reference host, not a package loader for untrusted manifests.
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createModuleRuntime, ModuleError } from '../runtime.mjs';
import { createSkillsInspectorModule, SkillsInspectorError } from '../adapters/skills-inspector.mjs';

const usage = 'node agent-first/0.1/examples/inspect-skills.mjs PROVIDER_MODULE ABSOLUTE_SKILL_ROOT [EXPECTED_PROVIDER_VERSION]';
const counters = ['skills', 'files', 'scripts', 'resources', 'errors', 'warnings', 'redactions'];
const safePath = value => typeof value === 'string' && isAbsolute(value) && !value.includes('\0') && value.length <= 4096;

function emit(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}
function fail(code, effectOutcome = 'not_attempted') {
  const guidance = code === 'INVALID_ARGUMENTS'
    ? 'Choose explicit absolute provider and directory paths, with an exact expected version.'
    : code === 'PROVIDER_LOAD_FAILED'
      ? 'Check the selected reviewed module and its local dependencies. Nothing is installed automatically.'
      : 'Check the existing non-symlink directory, provider/report version, module state and host gate. No operation is retried automatically.';
  emit({ status: 'error', code, effect_outcome: effectOutcome, retryable: false, guidance, usage }, 2);
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    emit({ usage, effects: ['imports the explicitly selected trusted provider', 'reads the explicitly selected root'], boundary: 'No automatic installation, registration or execution of discovered skills. This host is not a sandbox or an authority proof.' });
    return;
  }
  const [providerPath, root, providerVersion = '0.3.3'] = args;
  if (args.length < 2 || args.length > 3 || !safePath(providerPath) || !safePath(root) ||
      providerVersion.length > 80 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(providerVersion)) {
    fail('INVALID_ARGUMENTS'); return;
  }

  let provider;
  try { provider = await import(pathToFileURL(providerPath).href); }
  catch { fail('PROVIDER_LOAD_FAILED', 'unknown'); return; }

  const runtime = createModuleRuntime({
    // The operator supplied both paths. No skill text participates in this gate.
    // The host/operator remains responsible for authority and provider trust.
    authorize: request => request.module.id === 'agenttool.skills-inspector' &&
      request.operation === 'inspect' && request.input === null &&
      request.effects.length === 1 && request.effects[0] === 'local-read',
  });
  let id, receipt;
  try {
    const definition = createSkillsInspectorModule({ provider, root, providerVersion });
    runtime.register(definition);
    id = definition.id;
    runtime.activate(id);
    receipt = await runtime.invoke(id, 'inspect');
  } catch (error) {
    const code = error instanceof ModuleError || error instanceof SkillsInspectorError
      ? error.code : 'INSPECTION_FAILED';
    fail(code, 'unknown'); return;
  } finally {
    if (id) runtime.retire(id);
  }

  const report = receipt.value;
  emit({
    status: 'inspected', module: receipt.module,
    provider: { name: report.generatedBy.name, version: report.generatedBy.version },
    report_contract: report.schemaVersion, valid_structure: report.valid,
    counts: Object.fromEntries(counters.map(key => [key, report.summary[key]])),
    lifecycle: runtime.describe(id).state,
    establishes_permission: false, establishes_safety_to_execute: false,
    establishes_xenia_conformance: false,
  }, report.valid ? 0 : 1);
}

await main(process.argv.slice(2));
