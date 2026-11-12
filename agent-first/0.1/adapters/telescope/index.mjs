// SPDX-License-Identifier: MPL-2.0
// Optional host-supplied reader; no package discovery, installation or transport.
export const MAX_MANIFEST_BYTES = 65_536;

const NON_CLAIMS = Object.freeze({
  surface_conformance: 'not_tested', claims_verified: false, evidence_verified: false,
  covenant_adoption: 'not_assessed', authority: 'none',
});
const COUNTS = Object.freeze([
  'resource_count', 'html_resource_count', 'declared_claim_count',
  'declared_asserted_claim_count', 'declared_tested_claim_count', 'declared_attested_claim_count',
  'declared_pass_claim_count', 'declared_fail_claim_count', 'declared_unknown_claim_count', 'not_covered_count',
]);
function notRecognized(problem) {
  return { recognized: false, problem, summary: null, ...NON_CLAIMS };
}
const PROBLEMS = new Set([
  'invalid_utf8', 'invalid_json', 'json_complexity_limit', 'xenia_surface_manifest_not_object',
  'xenia_surface_profile_mismatch', 'xenia_surface_manifest_shape_unrecognized',
]);
function unknownProvider() {
  return { recognized: null, problem: 'provider_contract_mismatch', summary: null, ...NON_CLAIMS };
}
function projectSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schema_version !== 'xenia.surface.manifest/0.1' || value.profile !== 'xenia-surface/0.1' ||
      typeof value.service_canonical_origin !== 'string' || value.service_canonical_origin.length > 2048 ||
      COUNTS.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 10_000)) return null;
  try {
    const url = new URL(value.service_canonical_origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        url.origin !== value.service_canonical_origin) return null;
  } catch { return null; }
  if (value.resource_count < 1 || value.resource_count > 8 || value.html_resource_count > value.resource_count ||
      value.not_covered_count < 1 ||
      value.declared_asserted_claim_count + value.declared_tested_claim_count + value.declared_attested_claim_count !== value.declared_claim_count ||
      value.declared_pass_claim_count + value.declared_fail_claim_count + value.declared_unknown_claim_count !== value.declared_claim_count) return null;
  return Object.fromEntries(['schema_version', 'profile', 'service_canonical_origin', ...COUNTS]
    .map(key => [key, value[key]]));
}

export function createTelescopeSurfaceModule(telescope) {
  if (!telescope || typeof telescope.parseXeniaSurfaceManifestEvidence !== 'function') {
    const error = new TypeError('An explicitly supplied AgentTool-compatible parser is required.');
    error.code = 'TELESCOPE_PROVIDER_REQUIRED';
    throw error;
  }
  const parse = telescope.parseXeniaSurfaceManifestEvidence;
  return {
    id: 'agenttool.telescope-surface',
    version: '0.1.0-dev.0',
    contract: 'xenia.telescope.recognition/0.1-development',
    title: 'AgentTool XENIA Surface reader',
    motif: 'legibility',
    description: 'Recognize supplied manifest text without observing a service; contract: agent-first/0.1/adapters/telescope/contract.json.',
    source: 'Host-supplied AgentTool-compatible parser; the adapter does not authenticate its origin.',
    operations: {
      recognize: {
        description: 'Input {manifest_text: string}, at most 65536 UTF-8 bytes. Return recognition, not conformance or authority.',
        effects: [],
        run(input) {
          if (!input || typeof input !== 'object' || Array.isArray(input) ||
              Object.keys(input).length !== 1 || !Object.hasOwn(input, 'manifest_text') ||
              typeof input.manifest_text !== 'string' || !input.manifest_text.isWellFormed()) {
            return notRecognized('invalid_input');
          }
          if (Buffer.byteLength(input.manifest_text, 'utf8') > MAX_MANIFEST_BYTES) {
            return notRecognized('input_too_large');
          }
          const body = new TextEncoder().encode(input.manifest_text);
          const result = parse(body);
          if (!result || typeof result !== 'object' || Array.isArray(result)) return unknownProvider();
          if (result.ok === false) return PROBLEMS.has(result.code) ? notRecognized(result.code) : unknownProvider();
          if (result.ok !== true) return unknownProvider();
          const summary = projectSummary(result.value);
          if (!summary) return unknownProvider();
          return { recognized: true, problem: null, summary, ...NON_CLAIMS };
        },
      },
    },
  };
}
