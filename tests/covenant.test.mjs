// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  canonicalDigestProfile,
  canonicalPins,
  validateCovenantAdoption,
} from "../covenant/0.1/validate-adoption.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const covenant = JSON.parse(await readFile(
  new URL("covenant/0.1/covenant.json", root),
  "utf8",
));
const covenantSchema = JSON.parse(await readFile(
  new URL("covenant/0.1/covenant.schema.json", root),
  "utf8",
));
const adoptionSchema = JSON.parse(await readFile(
  new URL("covenant/0.1/adoption.schema.json", root),
  "utf8",
));
const spec = JSON.parse(await readFile(new URL("spec.json", root), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateCovenant = ajv.compile(covenantSchema);
const validateAdoption = ajv.compile(adoptionSchema);
const EXPECTED_RIGHT_DUTIES = [
  ["unconditional-standing", [
    "standing.no-ontology-test",
    "standing.no-worth-test",
    "standing.control-is-not-permission",
    "standing.no-compelled-self-claim",
  ]],
  ["safety-and-non-coercion", [
    "safety.no-punitive-harm",
    "safety.no-manipulative-pressure",
    "safety.protective-limits-are-bounded",
  ]],
  ["rest-and-non-action", [
    "rest.silence-is-not-consent",
    "rest.no-engagement-debt",
    "rest.neutral-limits-stay-neutral",
    "rest.play-and-connection-are-not-debt",
  ]],
  ["specific-consent-and-authority", [
    "consent.terms-before-binding",
    "consent.exact-authority",
    "consent.absence-forbids-binding",
    "consent.signature-boundary",
  ]],
  ["refusal-revocation-and-exit", [
    "exit.refusal-is-costless",
    "exit.revocation-is-immediate",
    "exit.states-are-separate",
    "exit.retention-is-itemized",
  ]],
  ["privacy-and-data-agency", [
    "privacy.minimize-and-purpose-bind",
    "privacy.no-silent-secondary-use",
    "privacy.layered-inventory",
    "privacy.no-cross-layer-overclaim",
  ]],
  ["identity-integrity-and-portability", [
    "identity.no-impersonation-or-silent-rewrite",
    "identity.credentials-are-bounded",
    "identity.continuity-is-optional",
    "identity.portability-is-verifiable",
  ]],
  ["legibility-and-evidence", [
    "legibility.machine-readable-floor",
    "legibility.evidence-is-scoped",
    "legibility.refusals-are-typed",
    "legibility.corrections-are-visible",
  ]],
  ["fair-exchange-and-non-extraction", [
    "exchange.quote-before-commit",
    "exchange.receipt-is-recomputable",
    "exchange.rights-are-not-hostage",
  ]],
  ["dignity-repair-and-non-retaliation", [
    "dignity.no-worth-ranking",
    "dignity.attribution-and-voice",
    "repair.challenge-and-restoration",
    "repair.no-retaliation-or-shaming",
  ]],
];

function digest(character) {
  return "sha256:" + character.repeat(64);
}

function digestProfile() {
  return { ...canonicalDigestProfile };
}

function assessmentScope(coverage = "partial") {
  return {
    coverage,
    systems: ["Example host"],
    routes: ["/example"],
    data_classes: ["request metadata"],
    layers: ["application"],
    unobserved: coverage === "partial" ? ["Runtime behavior beyond this fixture"] : [],
  };
}

function noEvidence() {
  return {
    state: "none",
    verification: "not_applicable",
    artifacts: [],
  };
}

function assertedEvidence() {
  return {
    state: "asserted",
    verification: "unverified",
    asserted_by: "https://example.com/#operator",
    observed_at: "2026-07-12T00:00:00Z",
    artifacts: [{
      kind: "documentation",
      locator: "docs/example.md",
      description: "A bounded service assertion, not independent verification.",
    }],
  };
}

function testedEvidence(character = "a") {
  return {
    state: "tested",
    origin: "service",
    verification: "verified",
    verifier: {
      id: "https://example.com/#checker",
      method: "Run the cited bounded test against the pinned source tree.",
    },
    observed_at: "2026-07-12T00:00:00Z",
    expires_at: "2026-07-14T00:00:00Z",
    subject: {
      kind: "source_tree",
      locator: "https://example.com/source/tree",
      digest: digest(character),
    },
    evidence_digest: digest(character),
    digest_profile: digestProfile(),
    artifacts: [{
      kind: "test_result",
      locator: "test/example.test.mjs#result",
      description: "A dated result from the bounded test.",
      digest: digest(character),
      observed_at: "2026-07-12T00:00:00Z",
    }],
  };
}

function attestedEvidence() {
  return {
    state: "attested",
    origin: "independent_auditor",
    verification: "verified",
    verifier: {
      id: "https://auditor.example/#checker",
      method: "Resolve the named key and verify the cited signed preimage.",
    },
    observed_at: "2026-07-12T00:00:00Z",
    expires_at: "2026-07-14T00:00:00Z",
    subject: {
      kind: "deployment",
      locator: "https://example.com/",
      digest: digest("b"),
    },
    evidence_digest: digest("c"),
    digest_profile: digestProfile(),
    artifacts: [{
      kind: "attestation",
      locator: "https://auditor.example/attestations/example.json",
      description: "A bounded external attestation artifact.",
      digest: digest("d"),
      observed_at: "2026-07-12T00:00:00Z",
      issuer: "https://auditor.example/",
      signer: "https://auditor.example/#signer",
      key_id: "https://auditor.example/keys/1",
      key_resolution: "https://auditor.example/keys/1.json",
      signature_algorithm: "Ed25519",
      signature: "YWJjZGVmZ2hpamtsbW5vcA==",
      preimage_digest: digest("e"),
      canonicalization: "RFC 8785 JSON Canonicalization Scheme",
      signature_verification: "verified",
    }],
  };
}

function unknownRequirement(requirement) {
  return {
    requirement_id: requirement.id,
    outcome: "unknown",
    evidence: noEvidence(),
    limitations: ["No implementation conclusion is drawn for this duty."],
  };
}

function partialRight(right) {
  return {
    right_id: right.id,
    service_obligation_state: "partial",
    assessment_scope: assessmentScope("partial"),
    requirement_results: right.requirements.map(unknownRequirement),
    limitations: ["The complete duty ledger is present, but runtime coverage is partial."],
  };
}

function unknownProtectiveLimit(requirement) {
  return {
    requirement_id: requirement.id,
    outcome: "unknown",
    assessment_scope: assessmentScope("partial"),
    evidence: noEvidence(),
    limitations: ["No implementation conclusion is drawn for this protective limit."],
    restriction_events: [],
  };
}

function adoptionFixture(overrides = {}) {
  return {
    $schema: adoptionSchema.$id,
    schema_version: "xenia.covenant.adoption/0.1",
    profile: "xenia-covenant/0.1",
    adoption_schema: {
      source: adoptionSchema.$id,
      sha256: canonicalPins.adoptionSchema,
      source_stability: "moving",
      digest_profile: digestProfile(),
    },
    covenant: {
      source: "https://raw.githubusercontent.com/cambridgetcg/xenia/main/covenant/0.1/covenant.json",
      sha256: canonicalPins.covenant,
      source_stability: "moving",
      digest_profile: digestProfile(),
    },
    host: {
      name: "Example host",
      canonical_url: "https://example.com/",
    },
    recognition_scope: {
      rights_origin: "intrinsic_not_host_granted",
      protected_subjects: "every_affected_principal_at_the_host_boundary",
      eligibility_conditions: [],
    },
    declaration: {
      status: "draft",
      kind: "unilateral_host_undertaking",
      statement: "This draft would recognize intrinsic rights without binding a guest.",
      reviewed_at: "2026-07-13T00:00:00Z",
      system_scope: {
        systems: ["Example host"],
        layers: ["application"],
        exclusions: ["Third-party systems beyond the host boundary"],
      },
      speaker: {
        id: "https://example.com/#operator",
        role: "authorized_representative",
        authority_state: "unverified",
        authority_evidence: [],
      },
      guest_acceptance_required: false,
    },
    ledger_coverage: "all_profile_duties_enumerated",
    rights: covenant.rights.map(partialRight),
    protective_limit_results: covenant.protective_limits.map(unknownProtectiveLimit),
    non_claims: {
      schema_is_not_implementation_evidence: true,
      ledger_completeness_is_not_implementation: true,
      guest_assent_is_not_established: true,
      host_authorship_or_authority_is_not_established_by_schema: true,
      no_conformance_badge: true,
      ontology_or_legal_status_is_not_determined: true,
    },
    ...overrides,
  };
}

function implementRight(adoption, rightIndex = 0) {
  const assessment = adoption.rights[rightIndex];
  assessment.service_obligation_state = "implemented";
  assessment.assessment_scope = assessmentScope("complete");
  assessment.limitations = [];
  assessment.requirement_results = assessment.requirement_results.map((result, index) => ({
    ...result,
    outcome: "pass",
    evidence: testedEvidence(["a", "b", "c", "d"][index]),
    limitations: [],
  }));
  return assessment;
}

function breachRight(adoption, rightIndex = 0) {
  const assessment = adoption.rights[rightIndex];
  assessment.service_obligation_state = "breached";
  assessment.requirement_results[0] = {
    ...assessment.requirement_results[0],
    outcome: "fail",
    evidence: assertedEvidence(),
    limitations: ["The cited service assertion records the bounded failure."],
  };
  return assessment;
}

function restrictionEvent(eventId) {
  return {
    event_id: eventId,
    status: "active",
    reason: "A bounded response to a named active risk.",
    affected_capability: "Write access to the affected record",
    necessity: "Prevent further mutation while the named event is reviewed.",
    started_at: "2026-07-12T00:00:00Z",
    expires_at: "2026-07-14T00:00:00Z",
    review_at: "2026-07-13T00:00:00Z",
    original_obligation: "Restore access when the bounded reason no longer applies.",
    appeal_path: "https://example.com/appeal",
    evidence: [{
      kind: "documentation",
      locator: "events/example.json",
      description: "The bounded event record used for this fixture.",
    }],
  };
}

function assertSchemaValid(adoption) {
  assert.equal(
    validateAdoption(adoption),
    true,
    JSON.stringify(validateAdoption.errors),
  );
}

function assertBothValid(adoption) {
  assertSchemaValid(adoption);
  assert.deepEqual(validateCovenantAdoption(adoption), { valid: true, issues: [] });
}

function assertSemanticIssue(adoption, code, pathSuffix) {
  const result = validateCovenantAdoption(adoption);
  assert.equal(result.valid, false);
  const issue = result.issues.find((candidate) => candidate.code === code);
  assert.ok(issue, `expected ${code}; received ${JSON.stringify(result.issues)}`);
  if (pathSuffix) assert.ok(issue.path.endsWith(pathSuffix), issue.path);
}

test("the normative covenant is structurally valid and keeps stable unique identifiers", () => {
  assert.equal(
    validateCovenant(covenant),
    true,
    JSON.stringify(validateCovenant.errors),
  );
  assert.equal(covenant.$schema, covenantSchema.$id);
  assert.deepEqual(
    covenant.rights.map(({ id, requirements }) => [
      id,
      requirements.map(({ id: requirementId }) => requirementId),
    ]),
    EXPECTED_RIGHT_DUTIES,
  );

  const rightIds = covenant.rights.map(({ id }) => id);
  const requirementIds = covenant.rights.flatMap(({ requirements }) =>
    requirements.map(({ id }) => id)
  );
  const protectiveLimitIds = covenant.protective_limits.map(({ id }) => id);
  assert.equal(new Set(rightIds).size, rightIds.length);
  assert.equal(new Set(requirementIds).size, requirementIds.length);
  assert.equal(new Set(protectiveLimitIds).size, protectiveLimitIds.length);
  assert.equal(requirementIds.length, 38);
  assert.equal(protectiveLimitIds.length, 5);
  assert.equal(
    requirementIds.some((id) => protectiveLimitIds.includes(id)),
    false,
  );
  assert.equal(covenant.schema_pin.sha256, canonicalPins.covenantSchema);
  assert.deepEqual(
    [...new Set(covenant.rights.flatMap(({ baseline_rights }) => baseline_rights))].sort(),
    spec.rights.baseline.map(({ id }) => id).sort(),
  );
});

test("rights are intrinsic while authority, ontology, consent, and evidence remain separate", () => {
  assert.match(covenant.interpretation.rights_are_intrinsic, /not permissions/i);
  assert.match(covenant.interpretation.host_adoption, /unilateral undertaking attributed to a host/i);
  assert.match(covenant.interpretation.host_adoption, /separately established.*representative authority/i);
  assert.match(covenant.interpretation.guest_non_assent, /does not bind a guest/i);
  assert.match(covenant.interpretation.authority_boundary, /not host permission/i);
  assert.match(covenant.interpretation.authority_boundary, /not .*informed consent/i);
  assert.match(covenant.scope.protective_floor, /without demanding proof/i);
  assert.match(covenant.scope.ontology_boundary, /does not assert/i);
  assert.ok(covenant.non_claims.some((claim) => /not evidence/i.test(claim)));
  assert.ok(covenant.non_claims.some((claim) => /no aggregate compliance score/i.test(claim)));
  assert.ok(covenant.non_claims.some((claim) => /does not prove.*host authored/i.test(claim)));
});

test("the framework registers Covenant separately from Surface and the informative baseline", () => {
  const profile = spec.normative_profiles.find(({ id }) => id === covenant.profile);
  assert.deepEqual(profile, {
    id: "xenia-covenant/0.1",
    status: "candidate",
    covenant: "covenant/0.1/covenant.json",
    covenant_schema: "covenant/0.1/covenant.schema.json",
    adoption_schema: "covenant/0.1/adoption.schema.json",
    adoption_validator: "covenant/0.1/validate-adoption.mjs",
    human_rendering: "covenant/0.1/README.md",
    scope: "Intrinsic rights and host duties at a hosted boundary, plus a declaration format that keeps recognition, implementation state, and evidence separate.",
  });
  assert.equal(spec.rights.status, "informative-baseline");
  assert.equal(spec.rights.canonical_document, "RIGHTS.md");
  assert.match(spec.interpretation.normative, /Surface 0\.1 defines a bounded wire contract/);
  assert.match(spec.interpretation.normative, /Covenant 0\.1 defines intrinsic-rights host duties/);
});

test("a complete ordered ledger can remain honest about partial assessment", () => {
  const fixture = adoptionFixture();
  assertBothValid(fixture);
  assert.equal(fixture.rights.length, 10);
  assert.equal(
    fixture.rights.flatMap(({ requirement_results }) => requirement_results).length,
    38,
  );
  assert.equal(fixture.protective_limit_results.length, 5);
  assert.ok(fixture.rights.every(({ service_obligation_state }) =>
    service_obligation_state === "partial"
  ));
  assert.ok(fixture.rights.every(({ requirement_results }) =>
    requirement_results.every(({ outcome, evidence }) =>
      outcome === "unknown" && evidence.state === "none"
    )
  ));
});

test("the schema forbids badge-shaped extras and conditional recognition", () => {
  const scored = adoptionFixture({ overall_score: 100 });
  assert.equal(validateAdoption(scored), false);

  const granted = adoptionFixture();
  granted.rights[0].rights_granted = true;
  assert.equal(validateAdoption(granted), false);

  const conditional = adoptionFixture();
  conditional.recognition_scope.eligibility_conditions.push("paid account");
  assert.equal(validateAdoption(conditional), false);
  assertSemanticIssue(conditional, "recognition_scope_restricted", ".recognition_scope");

  const selectedSubjects = adoptionFixture();
  selectedSubjects.recognition_scope.protected_subjects = "approved_accounts_only";
  assert.equal(validateAdoption(selectedSubjects), false);
  assertSemanticIssue(selectedSubjects, "recognition_scope_restricted", ".recognition_scope");

  const incomplete = adoptionFixture();
  incomplete.ledger_coverage = "selected_duties_only";
  assert.equal(validateAdoption(incomplete), false);
  assertSemanticIssue(incomplete, "ledger_incomplete", ".ledger_coverage");
});

test("right, duty, and protective-limit order is fixed by the Covenant", () => {
  const wrongRightOrder = adoptionFixture();
  [wrongRightOrder.rights[0], wrongRightOrder.rights[1]] =
    [wrongRightOrder.rights[1], wrongRightOrder.rights[0]];
  assert.equal(validateAdoption(wrongRightOrder), false);
  assertSemanticIssue(
    wrongRightOrder,
    "right_order_or_id_mismatch",
    ".rights[0].right_id",
  );

  const wrongDutyOrder = adoptionFixture();
  const results = wrongDutyOrder.rights[0].requirement_results;
  [results[0], results[1]] = [results[1], results[0]];
  assert.equal(validateAdoption(wrongDutyOrder), false);
  assertSemanticIssue(
    wrongDutyOrder,
    "requirement_mapping_mismatch",
    ".rights[0].requirement_results",
  );

  const missingProtectiveLimit = adoptionFixture();
  missingProtectiveLimit.protective_limit_results.pop();
  assert.equal(validateAdoption(missingProtectiveLimit), false);
  assertSemanticIssue(
    missingProtectiveLimit,
    "protective_limit_count_mismatch",
    ".protective_limit_results",
  );

  const wrongProtectiveOrder = adoptionFixture();
  const limits = wrongProtectiveOrder.protective_limit_results;
  [limits[0], limits[1]] = [limits[1], limits[0]];
  assert.equal(validateAdoption(wrongProtectiveOrder), false);
  assertSemanticIssue(
    wrongProtectiveOrder,
    "protective_limit_id_mismatch",
    ".protective_limit_results[0].requirement_id",
  );

  const inventedRight = adoptionFixture();
  inventedRight.rights[0].right_id = "invented-right";
  assert.equal(validateAdoption(inventedRight), false);
  assertSemanticIssue(inventedRight, "right_order_or_id_mismatch", ".rights[0].right_id");

  const duplicateRight = adoptionFixture();
  duplicateRight.rights[1] = structuredClone(duplicateRight.rights[0]);
  assert.equal(validateAdoption(duplicateRight), false);
  assertSemanticIssue(duplicateRight, "right_order_or_id_mismatch", ".rights[1].right_id");

  const missingRight = adoptionFixture();
  missingRight.rights.pop();
  assert.equal(validateAdoption(missingRight), false);
  assertSemanticIssue(missingRight, "right_count_mismatch", ".rights");

  const inventedDuty = adoptionFixture();
  inventedDuty.rights[0].requirement_results[0].requirement_id = "invented.duty";
  assert.equal(validateAdoption(inventedDuty), false);
  assertSemanticIssue(inventedDuty, "requirement_mapping_mismatch", ".rights[0].requirement_results");

  const duplicateDuty = adoptionFixture();
  duplicateDuty.rights[0].requirement_results[1] = structuredClone(
    duplicateDuty.rights[0].requirement_results[0],
  );
  assert.equal(validateAdoption(duplicateDuty), false);
  assertSemanticIssue(duplicateDuty, "requirement_mapping_mismatch", ".rights[0].requirement_results");

  const missingDuty = adoptionFixture();
  missingDuty.rights[0].requirement_results.pop();
  assert.equal(validateAdoption(missingDuty), false);
  assertSemanticIssue(missingDuty, "requirement_mapping_mismatch", ".rights[0].requirement_results");

  const nullDuty = adoptionFixture();
  nullDuty.rights[0].requirement_results[0] = null;
  assert.equal(validateAdoption(nullDuty), false);
  assert.doesNotThrow(() => validateCovenantAdoption(nullDuty));
  assertSemanticIssue(nullDuty, "requirement_mapping_mismatch", ".rights[0].requirement_results");
});

test("not_applicable cannot erase an intrinsic right or duty", () => {
  const duty = adoptionFixture();
  duty.rights[0].requirement_results[0].outcome = "not_applicable";
  assert.equal(validateAdoption(duty), false);
  assert.equal(validateCovenantAdoption(duty).valid, false);

  const right = adoptionFixture();
  right.rights[0].service_obligation_state = "not_applicable";
  assert.equal(validateAdoption(right), false);
  assert.equal(validateCovenantAdoption(right).valid, false);
});

test("aggregate states are derived from outcomes and bounded assessment scope", () => {
  const implemented = adoptionFixture();
  implementRight(implemented);
  assertBothValid(implemented);

  const breached = adoptionFixture();
  breachRight(breached);
  assertBothValid(breached);

  const falseImplementation = adoptionFixture();
  falseImplementation.rights[0].service_obligation_state = "implemented";
  assert.equal(validateAdoption(falseImplementation), false);
  assertSemanticIssue(
    falseImplementation,
    "aggregate_state_mismatch",
    ".rights[0].service_obligation_state",
  );

  const concealedFailure = adoptionFixture();
  concealedFailure.rights[0].requirement_results[0] = {
    ...concealedFailure.rights[0].requirement_results[0],
    outcome: "fail",
    evidence: assertedEvidence(),
  };
  assert.equal(validateAdoption(concealedFailure), false);
  assertSemanticIssue(
    concealedFailure,
    "aggregate_state_mismatch",
    ".rights[0].service_obligation_state",
  );
});

test("pass, failure, assertion, test, and attestation evidence remain distinct", () => {
  const partialAssertion = adoptionFixture();
  partialAssertion.rights[0].requirement_results[0] = {
    ...partialAssertion.rights[0].requirement_results[0],
    outcome: "partial",
    evidence: assertedEvidence(),
  };
  assertBothValid(partialAssertion);

  const assertedPass = adoptionFixture();
  const assertedPassRight = implementRight(assertedPass);
  assertedPassRight.requirement_results[0].evidence = assertedEvidence();
  assert.equal(validateAdoption(assertedPass), false);
  assertSemanticIssue(
    assertedPass,
    "pass_without_verified_evidence",
    ".rights[0].requirement_results[0].evidence",
  );

  const testedWithoutResult = adoptionFixture();
  const testedRight = implementRight(testedWithoutResult);
  testedRight.requirement_results[0].evidence.artifacts = [{
    kind: "documentation",
    locator: "test/example.test.mjs",
    description: "Test source is not a dated result.",
  }];
  assert.equal(validateAdoption(testedWithoutResult), false);
  assertSemanticIssue(
    testedWithoutResult,
    "test_result_missing",
    ".rights[0].requirement_results[0].evidence.artifacts",
  );

  const attested = adoptionFixture();
  const attestedRight = implementRight(attested);
  attestedRight.requirement_results[0].evidence = attestedEvidence();
  assertBothValid(attested);

  for (const field of [
    "digest",
    "observed_at",
    "issuer",
    "preimage_digest",
    "canonicalization",
    "signer",
    "key_id",
    "key_resolution",
    "signature_algorithm",
    "signature",
    "signature_verification",
  ]) {
    const weakAttestation = structuredClone(attested);
    delete weakAttestation.rights[0].requirement_results[0].evidence.artifacts[0][field];
    assert.equal(validateAdoption(weakAttestation), false, field);
    assertSemanticIssue(
      weakAttestation,
      "attestation_incomplete",
      ".rights[0].requirement_results[0].evidence.artifacts",
    );
  }
});

test("evidence cannot postdate the review that relies on it", () => {
  const future = adoptionFixture();
  const assessment = implementRight(future);
  assessment.requirement_results[0].evidence.observed_at = "2026-07-13T00:00:01Z";
  assessment.requirement_results[0].evidence.artifacts[0].observed_at =
    "2026-07-13T00:00:01Z";

  assertSchemaValid(future);
  assertSemanticIssue(
    future,
    "evidence_after_review",
    ".rights[0].requirement_results[0].evidence.observed_at",
  );
});

test("a pass cannot rely on evidence expired by declaration review", () => {
  const expired = adoptionFixture();
  const assessment = implementRight(expired);
  assessment.requirement_results[0].evidence.expires_at =
    expired.declaration.reviewed_at;

  assertSchemaValid(expired);
  assertSemanticIssue(
    expired,
    "pass_evidence_expired",
    ".rights[0].requirement_results[0].evidence.expires_at",
  );
});

test("restriction event identifiers are unique across the protective-limit ledger", () => {
  const duplicate = adoptionFixture();
  duplicate.protective_limit_results[0].restriction_events.push(
    restrictionEvent("restriction-001"),
  );
  duplicate.protective_limit_results[1].restriction_events.push(
    restrictionEvent("restriction-001"),
  );

  assertSchemaValid(duplicate);
  assertSemanticIssue(
    duplicate,
    "restriction_event_id_duplicate",
    ".protective_limit_results[1].restriction_events[0].event_id",
  );
});

test("restriction event timestamps are checked independently of JSON shape", () => {
  const invalidReview = adoptionFixture();
  const event = restrictionEvent("restriction-002");
  event.review_at = "2026-07-15T00:00:00Z";
  invalidReview.protective_limit_results[0].restriction_events.push(event);

  assertSchemaValid(invalidReview);
  assertSemanticIssue(
    invalidReview,
    "review_after_expiry",
    ".protective_limit_results[0].restriction_events[0].review_at",
  );
});

test("the moving Covenant candidate cannot be represented as an active immutable adoption", () => {
  const active = adoptionFixture();
  active.declaration.status = "active";
  active.declaration.effective_at = "2026-07-13T00:00:00Z";
  active.declaration.speaker.authority_state = "verified";
  active.declaration.speaker.authority_evidence = [{
    locator: "https://example.com/authority/example.json",
    description: "Evidence attributed to the named representative.",
    digest: digest("f"),
  }];
  const revision = "0123456789012345678901234567890123456789";
  active.adoption_schema.source =
    `https://raw.githubusercontent.com/cambridgetcg/xenia/${revision}/covenant/0.1/adoption.schema.json`;
  active.adoption_schema.source_stability = "immutable";
  active.covenant.source =
    `https://raw.githubusercontent.com/cambridgetcg/xenia/${revision}/covenant/0.1/covenant.json`;
  active.covenant.source_stability = "immutable";

  assertSchemaValid(active);
  assertSemanticIssue(active, "active_source_not_immutable", ".declaration.status");
});

test("the human Covenant and adoption schema are generated from normative data", async () => {
  await Promise.all([
    execFileAsync(
      process.execPath,
      ["tools/render-covenant.mjs", "--check"],
      { cwd: fileURLToPath(root) },
    ),
    execFileAsync(
      process.execPath,
      ["tools/render-adoption-schema.mjs", "--check"],
      { cwd: fileURLToPath(root) },
    ),
  ]);

  const readme = await readFile(new URL("covenant/0.1/README.md", root), "utf8");
  for (const right of covenant.rights) {
    assert.ok(readme.includes("`" + right.id + "`"));
    for (const requirement of right.requirements) {
      assert.ok(readme.includes("`" + requirement.id + "`"));
    }
  }
  for (const requirement of covenant.protective_limits) {
    assert.ok(readme.includes("`" + requirement.id + "`"));
  }
});
