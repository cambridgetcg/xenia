#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = new URL("./", import.meta.url);
const covenantBytes = readFileSync(new URL("covenant.json", directory));
const covenantSchemaBytes = readFileSync(new URL("covenant.schema.json", directory));
const adoptionSchemaBytes = readFileSync(new URL("adoption.schema.json", directory));

export const canonicalCovenant = JSON.parse(covenantBytes.toString("utf8"));
export const canonicalCovenantSchema = JSON.parse(covenantSchemaBytes.toString("utf8"));
export const canonicalAdoptionSchema = JSON.parse(adoptionSchemaBytes.toString("utf8"));

function sha256(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

export const canonicalPins = Object.freeze({
  covenant: sha256(covenantBytes),
  covenantSchema: sha256(covenantSchemaBytes),
  adoptionSchema: sha256(adoptionSchemaBytes),
});

export const canonicalSources = Object.freeze({
  covenantSchema: canonicalCovenantSchema.$id,
  adoptionSchema: canonicalAdoptionSchema.$id,
  covenant: new URL("covenant.json", canonicalAdoptionSchema.$id).href,
});

export const canonicalRelease = Object.freeze({
  tag: "covenant-v0.1.0-rc.1",
  sources: Object.freeze([
    Object.freeze({
      source: canonicalSources.covenantSchema,
      sha256: canonicalPins.covenantSchema,
    }),
    Object.freeze({
      source: canonicalSources.covenant,
      sha256: canonicalPins.covenant,
    }),
    Object.freeze({
      source: canonicalSources.adoptionSchema,
      sha256: canonicalPins.adoptionSchema,
    }),
  ]),
});

export const canonicalDigestProfile = Object.freeze({
  algorithm: "sha-256",
  representation: "exact-source-bytes",
  transport_decoding: "after-content-decoding",
  redirects: "forbidden",
  transformations: "none",
  encoding: "lowercase-hex",
});

const rights = new Map(
  canonicalCovenant.rights.map((right) => [
    right.id,
    right.requirements.map((requirement) => requirement.id),
  ]),
);
const rightIds = [...rights.keys()];
const protectiveLimitIds = canonicalCovenant.protective_limits.map(({ id }) => id);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function values(value) {
  return Array.isArray(value) ? value : [];
}

function add(issues, code, path, message) {
  issues.push({ code, path, message });
}

function sameArray(actual, expected) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sameRecord(actual, expected) {
  return record(actual)
    && Object.keys(expected).every((key) => actual[key] === expected[key])
    && Object.keys(actual).length === Object.keys(expected).length;
}

function validTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function checkTimeOrder(start, end, startPath, endPath, issues) {
  if (validTime(start) && validTime(end) && Date.parse(end) <= Date.parse(start)) {
    add(issues, "time_order_invalid", endPath, `${endPath} must be later than ${startPath}.`);
  }
}

function checkSourcePin(pin, expectedSource, expectedDigest, path, issues) {
  if (!record(pin)) {
    add(issues, "source_pin_missing", path, "A structured source pin is required.");
    return;
  }
  if (pin.sha256 !== expectedDigest) {
    add(issues, "source_pin_mismatch", `${path}.sha256`, "The record does not pin the installed canonical bytes.");
  }
  if (pin.source !== expectedSource) {
    add(issues, "source_locator_mismatch", `${path}.source`, "The record does not identify the installed release source.");
  }
  if (pin.source_stability !== "immutable") {
    add(issues, "source_stability_mismatch", `${path}.source_stability`, "The installed canonical source identity requires immutable release treatment.");
  }
  if (!sameRecord(pin.digest_profile, canonicalDigestProfile)) {
    add(issues, "digest_profile_mismatch", `${path}.digest_profile`, "The digest profile must identify exact source bytes without redirects or transformations.");
  }
}

function checkEvidence(evidence, outcome, reviewedAt, path, issues) {
  if (!record(evidence)) {
    add(issues, "evidence_missing", path, "Every duty result needs a structured evidence state.");
    return;
  }

  const state = evidence.state;
  const artifacts = values(evidence.artifacts);
  if (state === "none") {
    if (outcome !== "unknown" || evidence.verification !== "not_applicable" || artifacts.length !== 0) {
      add(issues, "evidence_none_inconsistent", path, "No evidence is valid only for an unknown result and cannot imply verification or artifacts.");
    }
    return;
  }

  if (state === "asserted") {
    if (evidence.verification !== "unverified" || artifacts.length === 0) {
      add(issues, "assertion_overstated", path, "An assertion must remain unverified and cite source or documentation.");
    }
    if (artifacts.some((artifact) => !["source", "documentation"].includes(artifact?.kind))) {
      add(issues, "assertion_artifact_invalid", `${path}.artifacts`, "Assertions may cite source or documentation only; a result artifact is required before using tested or attested.");
    }
    if (outcome === "pass") {
      add(issues, "pass_without_verified_evidence", path, "A pass requires verified tested or attested evidence.");
    }
    if (validTime(reviewedAt)
      && validTime(evidence.observed_at)
      && Date.parse(evidence.observed_at) > Date.parse(reviewedAt)) {
      add(issues, "evidence_after_review", `${path}.observed_at`, "Evidence cannot be observed after the review that relies on it.");
    }
    return;
  }

  if (!["tested", "attested"].includes(state)) {
    add(issues, "evidence_state_unknown", `${path}.state`, "The evidence state is not part of this profile.");
    return;
  }
  if (evidence.verification !== "verified" || !record(evidence.verifier)) {
    add(issues, "verification_incomplete", path, "Tested or attested evidence needs a named verifier, method, and verified result.");
  }
  if (!sameRecord(evidence.digest_profile, canonicalDigestProfile)) {
    add(issues, "evidence_digest_profile_mismatch", `${path}.digest_profile`, "Evidence digests must use the canonical exact-byte profile.");
  }
  checkTimeOrder(evidence.observed_at, evidence.expires_at, `${path}.observed_at`, `${path}.expires_at`, issues);
  if (validTime(reviewedAt)
    && validTime(evidence.observed_at)
    && Date.parse(evidence.observed_at) > Date.parse(reviewedAt)) {
    add(issues, "evidence_after_review", `${path}.observed_at`, "Evidence cannot be observed after the review that relies on it.");
  }
  if (outcome === "pass"
    && validTime(reviewedAt)
    && validTime(evidence.expires_at)
    && Date.parse(evidence.expires_at) <= Date.parse(reviewedAt)) {
    add(issues, "pass_evidence_expired", `${path}.expires_at`, "Evidence supporting a pass must remain current after the declaration review time.");
  }
  if (!record(evidence.subject) || typeof evidence.subject.digest !== "string" || typeof evidence.evidence_digest !== "string") {
    add(issues, "verification_digest_missing", path, "Verified evidence needs subject and evidence digests.");
  }

  if (state === "tested") {
    const resultArtifact = artifacts.some((artifact) =>
      ["test_result", "runtime_observation"].includes(artifact?.kind)
      && typeof artifact.digest === "string"
      && validTime(artifact.observed_at)
    );
    if (!resultArtifact) {
      add(issues, "test_result_missing", `${path}.artifacts`, "Tested evidence needs a dated, digested test-result or runtime-observation artifact, not merely test source.");
    }
  }

  if (state === "attested") {
    const attestation = artifacts.some((artifact) =>
      artifact?.kind === "attestation"
      && typeof artifact.digest === "string"
      && validTime(artifact.observed_at)
      && typeof artifact.issuer === "string"
      && typeof artifact.preimage_digest === "string"
      && typeof artifact.canonicalization === "string"
      && typeof artifact.signer === "string"
      && typeof artifact.key_id === "string"
      && typeof artifact.key_resolution === "string"
      && typeof artifact.signature_algorithm === "string"
      && typeof artifact.signature === "string"
      && artifact.signature_verification === "verified"
    );
    if (!attestation) {
      add(issues, "attestation_incomplete", `${path}.artifacts`, "Attested evidence needs a signed preimage, canonicalization, signer and key resolution, signature, and verified signature result.");
    }
  }
}

function checkReleaseVerification(release, declarationStatus, reviewedAt, issues) {
  const path = "$.release_verification";
  if (!record(release)) {
    add(issues, "release_verification_missing", path, "A structured release verification state is required.");
    return;
  }
  if (release.tag !== canonicalRelease.tag) {
    add(issues, "release_tag_mismatch", `${path}.tag`, `Expected ${canonicalRelease.tag}.`);
  }
  if (declarationStatus === "active" && release.state !== "verified") {
    add(issues, "active_release_unverified", path, "An active record requires a separately observed release-tag and source-byte verification record.");
  }
  if (release.state !== "verified") return;

  const sourceResults = values(release.source_results);
  if (sourceResults.length !== canonicalRelease.sources.length) {
    add(issues, "release_source_count_mismatch", `${path}.source_results`, `Expected ${canonicalRelease.sources.length} ordered release source results.`);
  }
  for (const [index, expected] of canonicalRelease.sources.entries()) {
    const actual = sourceResults[index];
    const resultPath = `${path}.source_results[${index}]`;
    if (!record(actual)
      || actual.source !== expected.source
      || actual.sha256 !== expected.sha256
      || actual.outcome !== "pass") {
      add(issues, "release_source_result_mismatch", resultPath, "The release source result must match the installed canonical source, digest, and pass outcome.");
    }
  }
  const artifacts = values(release.artifacts);
  const hasDigestedArtifact = (kind) => artifacts.some((artifact) => (
    record(artifact)
      && artifact.kind === kind
      && typeof artifact.digest === "string"
      && /^sha256:[a-f0-9]{64}$/.test(artifact.digest)
  ));
  if (!hasDigestedArtifact("git_tag_resolution")) {
    add(issues, "release_tag_resolution_artifact_missing", `${path}.artifacts`, "Verified release evidence requires a digested annotated-tag resolution artifact.");
  }
  if (!hasDigestedArtifact("source_retrieval")) {
    add(issues, "release_source_retrieval_artifact_missing", `${path}.artifacts`, "Verified release evidence requires a digested no-redirect source-retrieval artifact.");
  }
  if (validTime(reviewedAt)
    && validTime(release.observed_at)
    && Date.parse(release.observed_at) > Date.parse(reviewedAt)) {
    add(issues, "release_observed_after_review", `${path}.observed_at`, "Release verification cannot be observed after the declaration review that relies on it.");
  }
}

function derivedState(assessment) {
  const outcomes = values(assessment.requirement_results).map((result) => result?.outcome);
  if (outcomes.includes("fail")) return "breached";
  if (outcomes.includes("partial") || assessment.assessment_scope?.coverage === "partial") {
    return "partial";
  }
  if (outcomes.includes("unknown")) return "unknown";
  return outcomes.length > 0 && outcomes.every((outcome) => outcome === "pass")
    ? "implemented"
    : "unknown";
}

function checkRightAssessment(
  assessment,
  expectedRightId,
  expectedRequirementIds,
  reviewedAt,
  index,
  issues,
) {
  const path = `$.rights[${index}]`;
  if (!record(assessment)) {
    add(issues, "right_missing", path, "Every Covenant right must have an ordered assessment.");
    return;
  }
  if (assessment.right_id !== expectedRightId) {
    add(issues, "right_order_or_id_mismatch", `${path}.right_id`, `Expected ${expectedRightId} at this ledger position.`);
  }
  const actualRequirementIds = values(assessment.requirement_results).map(
    (result) => result?.requirement_id,
  );
  if (!sameArray(actualRequirementIds, expectedRequirementIds)) {
    add(issues, "requirement_mapping_mismatch", `${path}.requirement_results`, "The result IDs must exactly match this right's ordered Covenant duties.");
  }
  for (const [resultIndex, result] of values(assessment.requirement_results).entries()) {
    checkEvidence(
      result?.evidence,
      result?.outcome,
      reviewedAt,
      `${path}.requirement_results[${resultIndex}].evidence`,
      issues,
    );
  }
  const expectedState = derivedState(assessment);
  if (assessment.service_obligation_state !== expectedState) {
    add(issues, "aggregate_state_mismatch", `${path}.service_obligation_state`, `The declared state must be ${expectedState} for these outcomes and assessment coverage.`);
  }
  if (assessment.service_obligation_state === "implemented") {
    const stronglyEvidenced = values(assessment.requirement_results).every((result) =>
      result?.outcome === "pass"
      && ["tested", "attested"].includes(result?.evidence?.state)
      && result?.evidence?.verification === "verified"
    );
    if (!stronglyEvidenced || assessment.assessment_scope?.coverage !== "complete") {
      add(issues, "implementation_overstated", path, "Implemented requires complete assessment scope and verified tested or attested evidence for every duty.");
    }
  }
}

function checkRestrictionEvent(event, path, issues) {
  if (!record(event)) {
    add(issues, "restriction_event_invalid", path, "Restriction events must be structured records.");
    return;
  }
  checkTimeOrder(event.started_at, event.expires_at, `${path}.started_at`, `${path}.expires_at`, issues);
  if (validTime(event.started_at) && validTime(event.review_at) && Date.parse(event.review_at) < Date.parse(event.started_at)) {
    add(issues, "review_before_restriction", `${path}.review_at`, "A restriction review cannot precede the restriction start.");
  }
  if (validTime(event.expires_at) && validTime(event.review_at) && Date.parse(event.review_at) > Date.parse(event.expires_at)) {
    add(issues, "review_after_expiry", `${path}.review_at`, "A restriction review must occur no later than expiry.");
  }
}

/**
 * Checks Covenant 0.1 relationships against the exact bytes installed beside
 * this module. It does not fetch sources, authenticate a speaker, execute a
 * test, verify a signature cryptographically, inspect a deployment, or prove
 * that a cited artifact is truthful. In particular, accepting an active-shaped
 * record does not establish that its release tag exists remotely, cannot move,
 * or serves the pinned bytes. Run JSON Schema validation separately.
 */
export function validateCovenantAdoption(adoption) {
  const issues = [];
  if (!record(adoption)) {
    add(issues, "record_invalid", "$", "The adoption must be an object.");
    return { valid: false, issues };
  }

  checkSourcePin(
    adoption.covenant,
    canonicalSources.covenant,
    canonicalPins.covenant,
    "$.covenant",
    issues,
  );
  checkSourcePin(
    adoption.adoption_schema,
    canonicalSources.adoptionSchema,
    canonicalPins.adoptionSchema,
    "$.adoption_schema",
    issues,
  );
  if (canonicalCovenant.$schema !== canonicalSources.covenantSchema) {
    add(issues, "canonical_schema_locator_mismatch", "$.covenant.$schema", "The installed Covenant does not identify its installed structural schema release.");
  }
  if (canonicalCovenant.schema_pin?.source !== canonicalSources.covenantSchema) {
    add(issues, "canonical_schema_locator_mismatch", "$.covenant.schema_pin.source", "The installed Covenant does not pin its installed structural schema release.");
  }
  if (canonicalCovenant.schema_pin?.sha256 !== canonicalPins.covenantSchema) {
    add(issues, "canonical_schema_pin_mismatch", "$.covenant.schema_pin.sha256", "The installed Covenant does not pin its installed structural schema bytes.");
  }
  if (!sameRecord(canonicalCovenant.schema_pin?.digest_profile, canonicalDigestProfile)) {
    add(issues, "canonical_digest_profile_mismatch", "$.covenant.schema_pin.digest_profile", "The installed Covenant schema pin uses a different digest profile.");
  }
  if (canonicalCovenant.schema_pin?.source_stability !== "immutable") {
    add(issues, "canonical_schema_stability_mismatch", "$.covenant.schema_pin.source_stability", "The installed Covenant structural schema source is not immutable.");
  }

  if (adoption.ledger_coverage !== "all_profile_duties_enumerated") {
    add(issues, "ledger_incomplete", "$.ledger_coverage", "The ledger must enumerate every right duty and protective-limit duty; unknown is the honest result for unassessed duties.");
  }
  if (adoption.recognition_scope?.rights_origin !== "intrinsic_not_host_granted"
    || adoption.recognition_scope?.protected_subjects !== "every_affected_principal_at_the_host_boundary"
    || values(adoption.recognition_scope?.eligibility_conditions).length !== 0) {
    add(issues, "recognition_scope_restricted", "$.recognition_scope", "Recognition applies to every affected principal without eligibility, acceptance, payment, ontology, or host approval conditions.");
  }

  checkReleaseVerification(
    adoption.release_verification,
    adoption.declaration?.status,
    adoption.declaration?.reviewed_at,
    issues,
  );

  const speaker = adoption.declaration?.speaker;
  if (adoption.declaration?.status === "active") {
    if (!record(speaker)
      || speaker.authority_state !== "verified"
      || values(speaker.authority_evidence).length === 0) {
      add(issues, "active_authority_unverified", "$.declaration.speaker", "An active record needs explicit verified representative authority and cited evidence.");
    }
  }

  if (values(adoption.rights).length !== rightIds.length) {
    add(issues, "right_count_mismatch", "$.rights", `The ordered ledger requires exactly ${rightIds.length} rights.`);
  }
  for (const [index, rightId] of rightIds.entries()) {
    checkRightAssessment(
      values(adoption.rights)[index],
      rightId,
      rights.get(rightId),
      adoption.declaration?.reviewed_at,
      index,
      issues,
    );
  }

  if (values(adoption.protective_limit_results).length !== protectiveLimitIds.length) {
    add(issues, "protective_limit_count_mismatch", "$.protective_limit_results", `The ordered ledger requires exactly ${protectiveLimitIds.length} protective-limit duties.`);
  }
  const restrictionEventIds = new Set();
  for (const [index, expectedId] of protectiveLimitIds.entries()) {
    const result = values(adoption.protective_limit_results)[index];
    const path = `$.protective_limit_results[${index}]`;
    if (!record(result) || result.requirement_id !== expectedId) {
      add(issues, "protective_limit_id_mismatch", `${path}.requirement_id`, `Expected ${expectedId} at this ledger position.`);
      continue;
    }
    checkEvidence(
      result.evidence,
      result.outcome,
      adoption.declaration?.reviewed_at,
      `${path}.evidence`,
      issues,
    );
    for (const [eventIndex, event] of values(result.restriction_events).entries()) {
      const eventPath = `${path}.restriction_events[${eventIndex}]`;
      checkRestrictionEvent(event, eventPath, issues);
      if (record(event) && typeof event.event_id === "string") {
        if (restrictionEventIds.has(event.event_id)) {
          add(issues, "restriction_event_id_duplicate", `${eventPath}.event_id`, "Restriction event IDs must be unique across the adoption ledger.");
        }
        restrictionEventIds.add(event.event_id);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath || process.argv.length !== 3) {
    console.error("usage: validate-adoption.mjs <adoption.json>");
    process.exitCode = 2;
  } else {
    try {
      const adoption = JSON.parse(readFileSync(inputPath, "utf8"));
      const result = validateCovenantAdoption(adoption);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exitCode = result.valid ? 0 : 1;
    } catch {
      console.error("adoption is not a readable JSON document");
      process.exitCode = 1;
    }
  }
}
