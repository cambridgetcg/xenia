// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canonicalAdoptionSchema,
  canonicalCovenant,
  canonicalDigestProfile,
  canonicalPins,
  canonicalRelease,
  canonicalSources,
} from "../../covenant/0.1/validate-adoption.mjs";
import { inspectCovenantAdoption, recordObservation } from "./observe.mjs";

function sha256(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function surfaceResult(outcome = "conformant") {
  const checkOutcome = outcome === "conformant"
    ? "pass"
    : outcome === "nonconformant" ? "fail" : "unknown";
  return {
    schema_version: "xenia.surface.result/0.1",
    profile: "xenia-surface/0.1",
    target: "https://example.com/",
    manifest_url: "https://example.com/.well-known/agent.json",
    verifier: { name: "xenia-surface-check", version: "0.1.0-rc.1" },
    observed_at: "2026-07-22T20:00:00.000Z",
    expires_at: "2026-07-23T20:00:00.000Z",
    result: outcome,
    scope: "One deterministic test fixture observation.",
    limits: {
      request_timeout_ms: 5000,
      total_timeout_ms: 20000,
      manifest_problem_max_bytes: 65536,
      resource_max_bytes: 1000000,
    },
    counts: {
      pass: checkOutcome === "pass" ? 1 : 0,
      fail: checkOutcome === "fail" ? 1 : 0,
      unknown: checkOutcome === "unknown" ? 1 : 0,
      not_run: 0,
    },
    checks: [{
      id: "M.STATUS",
      outcome: checkOutcome,
      expected: "HTTP 200",
      observed: checkOutcome === "unknown" ? "not observed" : "HTTP response",
      observation: {
        request: {
          method: "GET",
          url: "https://example.com/.well-known/agent.json",
          accept: "application/json",
          user_agent: "xenia-surface-check/0.1.0-rc.1",
        },
        ...(checkOutcome === "unknown"
          ? { error: "fixture transport unavailable" }
          : {
              response: {
                status: checkOutcome === "pass" ? 200 : 500,
                content_type: "application/json",
                vary: "Accept",
                duration_ms: 1,
              },
            }),
      },
    }],
    claims: [{
      id: "surface.discovery",
      scope: ["https://example.com/.well-known/agent.json"],
      evidence_state: "tested",
      outcome: checkOutcome,
      test_ids: ["M.STATUS"],
    }],
    declared_claims: [],
    not_tested: ["everything outside this fixture's bounded Surface scope"],
  };
}

function noEvidence() {
  return { state: "none", verification: "not_applicable", artifacts: [] };
}

function assessmentScope(hostName) {
  return {
    coverage: "partial",
    systems: [hostName],
    routes: ["/"],
    data_classes: ["public response metadata"],
    layers: ["application"],
    unobserved: ["Every layer and behavior outside the stated fixture scope"],
  };
}

function draftAdoption(canonicalUrl = "https://example.com/") {
  const hostName = "Example host";
  return {
    $schema: canonicalAdoptionSchema.$id,
    schema_version: "xenia.covenant.adoption/0.1",
    profile: "xenia-covenant/0.1",
    adoption_schema: {
      source: canonicalSources.adoptionSchema,
      sha256: canonicalPins.adoptionSchema,
      source_stability: "immutable",
      digest_profile: { ...canonicalDigestProfile },
    },
    covenant: {
      source: canonicalSources.covenant,
      sha256: canonicalPins.covenant,
      source_stability: "immutable",
      digest_profile: { ...canonicalDigestProfile },
    },
    release_verification: {
      state: "unverified",
      tag: canonicalRelease.tag,
      source_results: [],
      artifacts: [],
      limitations: ["The reserved release tag and source bytes have not been observed."],
    },
    host: { name: hostName, canonical_url: canonicalUrl },
    recognition_scope: {
      rights_origin: "intrinsic_not_host_granted",
      protected_subjects: "every_affected_principal_at_the_host_boundary",
      eligibility_conditions: [],
    },
    declaration: {
      status: "draft",
      kind: "unilateral_host_undertaking",
      statement: "A test draft; it does not bind a guest or establish implementation.",
      reviewed_at: "2026-07-22T19:59:00.000Z",
      system_scope: {
        systems: [hostName],
        layers: ["application"],
        exclusions: ["Unobserved platform, network, operator, legal, and third-party layers"],
      },
      speaker: {
        id: `${canonicalUrl}#operator`,
        role: "authorized_representative",
        authority_state: "unverified",
        authority_evidence: [],
      },
      guest_acceptance_required: false,
    },
    ledger_coverage: "all_profile_duties_enumerated",
    rights: canonicalCovenant.rights.map((right) => ({
      right_id: right.id,
      service_obligation_state: "partial",
      assessment_scope: assessmentScope(hostName),
      requirement_results: right.requirements.map((requirement) => ({
        requirement_id: requirement.id,
        outcome: "unknown",
        evidence: noEvidence(),
        limitations: ["No implementation conclusion is drawn for this duty."],
      })),
      limitations: ["The duty ledger is complete; runtime coverage is partial."],
    })),
    protective_limit_results: canonicalCovenant.protective_limits.map((limit) => ({
      requirement_id: limit.id,
      outcome: "unknown",
      assessment_scope: assessmentScope(hostName),
      evidence: noEvidence(),
      limitations: ["No implementation conclusion is drawn for this protective limit."],
      restriction_events: [],
    })),
    non_claims: {
      schema_is_not_implementation_evidence: true,
      ledger_completeness_is_not_implementation: true,
      guest_assent_is_not_established: true,
      host_authorship_or_authority_is_not_established_by_schema: true,
      release_publication_or_immutability_is_not_established_by_schema: true,
      no_conformance_badge: true,
      ontology_or_legal_status_is_not_determined: true,
    },
  };
}

async function temporaryCase() {
  return mkdtemp(join(tmpdir(), "xenia-observe-test-"));
}

test("records a complete no-adoption bundle without inventing a verdict", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, "evidence");
  const result = await recordObservation({
    target: "https://example.com/",
    outputDirectory: output,
  }, { checkSurfaceImpl: async () => surfaceResult() });

  assert.equal(result.exitCode, 0);
  assert.equal(result.index.covenant_adoption.state, "not_supplied");
  assert.equal(result.index.interpretation.whole_xenia_conformance_claimed, false);
  const surfaceBytes = await readFile(join(output, "surface-result.json"));
  const indexBytes = await readFile(join(output, "observe-result.json"));
  assert.equal(result.index.surface.artifact.sha256, sha256(surfaceBytes));
  assert.deepEqual(indexBytes, result.indexBytes);
  await assert.rejects(readFile(join(output, "adoption.json")), /ENOENT/);
});

test("preserves and separately validates an exact same-origin adoption", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const adoptionBytes = Buffer.from(JSON.stringify(draftAdoption(), null, 2) + "\n");
  const adoptionPath = join(temporary, "input-adoption.json");
  await writeFile(adoptionPath, adoptionBytes);

  const output = join(temporary, "evidence");
  const result = await recordObservation({
    target: "https://example.com/",
    outputDirectory: output,
    adoptionPath,
  }, { checkSurfaceImpl: async () => surfaceResult() });

  assert.equal(result.exitCode, 0);
  assert.equal(result.index.covenant_adoption.schema_validation.valid, true);
  assert.equal(result.index.covenant_adoption.cross_document_validation.valid, true);
  assert.equal(result.index.covenant_adoption.target_relation, "same_origin");
  assert.deepEqual(await readFile(join(output, "adoption.json")), adoptionBytes);
  assert.equal(result.index.covenant_adoption.artifact.sha256, sha256(adoptionBytes));
});

test("records invalid or differently scoped adoption input with exit one", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const otherPath = join(temporary, "other.json");
  await writeFile(otherPath, JSON.stringify(draftAdoption("https://other.example/")));
  const different = await recordObservation({
    target: "https://example.com/",
    outputDirectory: join(temporary, "different"),
    adoptionPath: otherPath,
  }, { checkSurfaceImpl: async () => surfaceResult() });
  assert.equal(different.exitCode, 1);
  assert.equal(different.index.covenant_adoption.schema_validation.valid, true);
  assert.equal(different.index.covenant_adoption.target_relation, "different_origin");

  const invalidPath = join(temporary, "invalid.json");
  const invalidBytes = Buffer.from("{ definitely not JSON }\n");
  await writeFile(invalidPath, invalidBytes);
  const invalid = await recordObservation({
    target: "https://example.com/",
    outputDirectory: join(temporary, "invalid"),
    adoptionPath: invalidPath,
  }, { checkSurfaceImpl: async () => surfaceResult() });
  assert.equal(invalid.exitCode, 1);
  assert.equal(invalid.index.covenant_adoption.schema_validation.valid, false);
  assert.deepEqual(await readFile(join(temporary, "invalid", "adoption.json")), invalidBytes);
});

test("records nonconformant and indeterminate Surface outcomes as evidence", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const outcome of ["nonconformant", "indeterminate"]) {
    const result = await recordObservation({
      target: "https://example.com/",
      outputDirectory: join(temporary, outcome),
    }, { checkSurfaceImpl: async () => surfaceResult(outcome) });
    assert.equal(result.exitCode, 0);
    assert.equal(result.index.surface.outcome, outcome);
  }
});

test("refuses an existing output directory before observing or mutating it", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, "evidence");
  await mkdir(output);
  let called = false;
  await assert.rejects(
    recordObservation({
      target: "https://example.com/",
      outputDirectory: output,
    }, {
      checkSurfaceImpl: async () => {
        called = true;
        return surfaceResult();
      },
    }),
    /already exists/,
  );
  assert.equal(called, false);
});

test("leaves no final bundle for invalid checker output or oversized adoption input", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));

  const invalidOutput = join(temporary, "invalid-surface");
  await assert.rejects(
    recordObservation({
      target: "https://example.com/",
      outputDirectory: invalidOutput,
    }, { checkSurfaceImpl: async () => ({}) }),
    /invalid result/,
  );
  await assert.rejects(readFile(invalidOutput), /ENOENT/);

  const oversizedPath = join(temporary, "oversized-adoption.json");
  await writeFile(oversizedPath, Buffer.alloc(2_000_001, 0x20));
  const oversizedOutput = join(temporary, "oversized");
  let oversizedCheckerCalled = false;
  await assert.rejects(
    recordObservation({
      target: "https://example.com/",
      outputDirectory: oversizedOutput,
      adoptionPath: oversizedPath,
    }, {
      checkSurfaceImpl: async () => {
        oversizedCheckerCalled = true;
        return surfaceResult();
      },
    }),
    /exceeds 2000000 bytes/,
  );
  assert.equal(oversizedCheckerCalled, false);
  await assert.rejects(readFile(oversizedOutput), /ENOENT/);
});

test("rejects malformed UTF-8 instead of validating replacement characters", () => {
  const invalidUtf8 = Buffer.concat([
    Buffer.from('{"host":"'),
    Buffer.from([0xff]),
    Buffer.from('"}'),
  ]);
  const inspection = inspectCovenantAdoption(invalidUtf8, "https://example.com/");
  assert.equal(inspection.schemaValidation.valid, false);
  assert.equal(inspection.schemaValidation.issues[0].code, "utf8_decode");
  assert.equal(inspection.crossDocumentValidation.issues[0].code, "not_run");
});

test("preflights the output parent before making external observations", async (t) => {
  const temporary = await temporaryCase();
  t.after(() => rm(temporary, { recursive: true, force: true }));
  let called = false;
  await assert.rejects(
    recordObservation({
      target: "https://example.com/",
      outputDirectory: join(temporary, "missing-parent", "evidence"),
    }, {
      checkSurfaceImpl: async () => {
        called = true;
        return surfaceResult();
      },
    }),
    /output parent is not an existing directory/,
  );
  assert.equal(called, false);
});
