// SPDX-License-Identifier: MPL-2.0
// Repository-only integration. The provider is supplied by a trusted host;
// this module never discovers, downloads, installs or imports a provider.

import { isAbsolute, resolve } from 'node:path';
import { lstat } from 'node:fs/promises';
import { isProxy } from 'node:util/types';

export class SkillsInspectorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SkillsInspectorError';
    this.code = code;
  }
}

function isConfiguration(value) {
  if (!value || typeof value !== 'object' || isProxy(value) || Array.isArray(value)) return false;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key =>
    ['provider', 'root', 'providerVersion'].includes(key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

const reportSummaryKeys = ['skills', 'files', 'scripts', 'resources', 'errors', 'warnings', 'redactions'];
const reportPolicyKeys = [
  'network', 'subprocesses', 'scriptExecution', 'mcpStartup',
  'configMutation', 'credentialLookup', 'hostedApiCalls',
];

// A compatibility fence, not a replacement for the provider's full schema,
// proof of its implementation behavior, or permission to execute a skill.
function snapshotReport(value, providerVersion) {
  let report;
  try { report = structuredClone(value); }
  catch { throw new SkillsInspectorError('REPORT_CONTRACT_MISMATCH'); }
  const policy = report?.executionPolicy;
  if (!report || Array.isArray(report) ||
      report.$schema !== 'urn:agenttool:skills:inspection:v0.1' ||
      report.schemaVersion !== 'agenttool.skills/inspect-v0.1' ||
      report.kind !== 'agenttool.skills.inspection' || report.mode !== 'read-only' ||
      report.generatedBy?.name !== '@agenttool/skills' ||
      report.generatedBy?.version !== providerVersion ||
      report.scope?.root !== '.' || typeof report.valid !== 'boolean' ||
      !Array.isArray(report.skills) || !Array.isArray(report.issues) ||
      !report.summary || !reportSummaryKeys.every(key =>
        Number.isSafeInteger(report.summary[key]) && report.summary[key] >= 0) ||
      !policy || Object.keys(policy).length !== reportPolicyKeys.length ||
      !reportPolicyKeys.every(key => Object.hasOwn(policy, key) && policy[key] === false)) {
    throw new SkillsInspectorError('REPORT_CONTRACT_MISMATCH');
  }
  return report;
}

export function createSkillsInspectorModule(options) {
  if (!isConfiguration(options)) throw new SkillsInspectorError('INVALID_CONFIGURATION');
  const { provider, root, providerVersion = '0.3.3' } = options;
  if (!provider || typeof provider !== 'object' || isProxy(provider)) {
    throw new SkillsInspectorError('INVALID_PROVIDER');
  }
  const exported = Object.getOwnPropertyDescriptor(provider, 'inspectLocalSkills');
  if (!exported || !Object.hasOwn(exported, 'value') || typeof exported.value !== 'function') {
    throw new SkillsInspectorError('INVALID_PROVIDER');
  }
  if (typeof root !== 'string' || !isAbsolute(root) || root.includes('\0') || root.length > 4096) {
    throw new SkillsInspectorError('INVALID_ROOT');
  }
  if (typeof providerVersion !== 'string' || providerVersion.length > 80 ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(providerVersion)) {
    throw new SkillsInspectorError('INVALID_PROVIDER_VERSION');
  }
  const inspect = exported.value;
  const selectedRoot = resolve(root);
  return {
    id: 'agenttool.skills-inspector',
    version: '0.1.0',
    contract: 'agent-first.skills-inspector/0.1',
    title: 'Inspect a skill without activating it',
    motif: 'legibility',
    description: `Read-only structural inspection via a host-supplied @agenttool/skills ${providerVersion}. Inspection does not grant permission or establish safety to execute.`,
    operations: {
      inspect: {
        description: 'Inspect one host-selected directory, never widen a file target. Does not install or run discovered skills.',
        effects: ['local-read'],
        async run(input = null) {
          if (input !== null) throw new SkillsInspectorError('UNSUPPORTED_INPUT');
          // Provider file targets expand to parent roots. Refuse that convenience
          // here, after the host gate, so this adapter accepts directories only.
          let stat;
          try { stat = await lstat(selectedRoot); }
          catch { throw new SkillsInspectorError('ROOT_UNAVAILABLE'); }
          if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new SkillsInspectorError('ROOT_MUST_BE_DIRECTORY');
          }
          return snapshotReport(await inspect(selectedRoot), providerVersion);
        },
      },
    },
  };
}
