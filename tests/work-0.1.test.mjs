// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  MAX_INPUT_BYTES,
  actionProposalDigest,
  authorityClaimDigest,
  canonicalJson,
  checkWorkRunBytes,
  validateWorkRun,
} from "../work/0.1/check.mjs";

const root = new URL("../", import.meta.url);
const fixedNow = "2026-08-03T16:00:00Z";

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

const runSchema = await json("work/0.1/run.schema.json");
const problemSchema = await json("work/0.1/problem.schema.json");
const resultSchema = await json("work/0.1/result.schema.json");
const completed = await json("work/0.1/examples/completed-effect.json");
const declined = await json("work/0.1/examples/declined.json");
const approvalRequired = await json("work/0.1/examples/approval-required.problem.json");
const authorityUnknown = await json("work/0.1/examples/authority-unknown.problem.json");
const conformanceFixtures = await json("work/0.1/fixtures/conformance.json");
const checkerPath = fileURLToPath(new URL("work/0.1/check.mjs", root));
const completedPath = fileURLToPath(new URL("work/0.1/examples/completed-effect.json", root));
const approvalRequiredPath = fileURLToPath(
  new URL("work/0.1/examples/approval-required.problem.json", root),
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(problemSchema);
const validateRunSchema = ajv.compile(runSchema);
const validateProblemSchema = ajv.getSchema(problemSchema.$id);
const validateResultSchema = ajv.compile(resultSchema);

function clone(value) {
  return structuredClone(value);
}

function event(run, type) {
  return run.events.find((entry) => entry.type === type);
}

function refreshDigests(run) {
  const authority = event(run, "authority.claimed");
  const proposal = event(run, "action.proposed");
  const authorityDigest = authorityClaimDigest(authority.payload.binding);
  authority.payload.claim_digest = authorityDigest;
  for (const reference of proposal.payload.binding.authority_claims) {
    if (reference.event_id === authority.id) reference.digest = authorityDigest;
  }
  const proposalDigest = actionProposalDigest(proposal.payload.binding);
  proposal.payload.proposal_digest = proposalDigest;
  for (const entry of run.events) {
    if (Object.hasOwn(entry.payload, "proposal_digest")) {
      entry.payload.proposal_digest = proposalDigest;
    }
  }
  return run;
}

function resequenceEvents(run) {
  for (const [index, entry] of run.events.entries()) {
    entry.sequence = index + 1;
    entry.previous_event_id = index === 0 ? null : run.events[index - 1].id;
  }
  run.updated_at = run.events.at(-1).at;
  return run;
}

function issueCodes(run) {
  return new Set(validateWorkRun(run).issues.map(({ code }) => code));
}

function validationFor(run) {
  const validation = validateWorkRun(run);
  assert.equal(validation.schema_valid, true, JSON.stringify(validation.issues));
  return validation;
}

function checkOutcome(validation, id) {
  return validation.checks.find((entry) => entry.id === id)?.outcome;
}

function assertFailedCheck(run, id, code) {
  const validation = validationFor(run);
  assert.equal(checkOutcome(validation, id), "fail", JSON.stringify(validation.issues));
  assert.ok(validation.issues.some((entry) => entry.code === code), JSON.stringify(validation.issues));
  return validation;
}

function checkedResult(run) {
  return checkWorkRunBytes(Buffer.from(JSON.stringify(run)), { now: fixedNow });
}

function addPairActor(run) {
  const id = "urn:xenia:test:actor:human-agent-pair";
  run.actors.push({
    id,
    kind: "human_agent_pair",
    name: "Bounded test pair",
    identity_claims: [],
    pair_members: [
      { actor_id: "urn:xenia:example:actor:steward", role: "human" },
      { actor_id: "urn:xenia:example:actor:helper", role: "agent" },
    ],
    authority_merge: false,
  });
  return id;
}

test("Work development schemas compile strictly and accept their examples", () => {
  assert.equal(validateRunSchema(completed), true, JSON.stringify(validateRunSchema.errors));
  assert.equal(validateRunSchema(declined), true, JSON.stringify(validateRunSchema.errors));
  assert.equal(validateProblemSchema(approvalRequired), true, JSON.stringify(validateProblemSchema.errors));
  assert.equal(validateProblemSchema(authorityUnknown), true, JSON.stringify(validateProblemSchema.errors));

  const contradiction = clone(approvalRequired);
  contradiction.terminal = true;
  assert.equal(validateProblemSchema(contradiction), false);

  const malformedPair = clone(completed);
  malformedPair.actors.push({
    id: "urn:xenia:test:actor:malformed-pair",
    kind: "human_agent_pair",
    name: "Malformed pair",
    identity_claims: [],
    pair_members: [
      { actor_id: "urn:xenia:example:actor:steward", role: "human" },
      { actor_id: "urn:xenia:example:actor:helper", role: "human" },
    ],
    authority_merge: false,
  });
  assert.equal(validateRunSchema(malformedPair), false);
});

test("the conformance fixture manifest names every hardened boundary", () => {
  assert.equal(
    conformanceFixtures.schema_version,
    "xenia.work.conformance-fixtures/0.1-development",
  );
  assert.equal(conformanceFixtures.base_artifact, "../examples/completed-effect.json");
  assert.deepEqual(
    new Set(conformanceFixtures.cases.map(({ id }) => id)),
    new Set([
      "evidence-record-mutation",
      "authority-evidence-after-claim",
      "asserted-authority-at-execution",
      "authority-positive-basis-missing",
      "identity-claim-is-not-implicitly-authority",
      "non-revocable-authority-at-execution",
      "consent-evidence-kind-mismatch",
      "consent-evidence-scope-mismatch",
      "credential-literal",
      "credential-reference-secret",
      "restricted-literal",
      "choice-not-advertised",
      "pair-executor",
      "pair-approver",
      "record-zone-too-broad",
      "record-zone-ignores-unused-zone",
      "recipient-outside-input-zone",
      "causal-evidence-before-receipt",
      "causal-evidence-kind-mismatch",
      "causal-evidence-scope-mismatch",
      "rejection-after-execution",
      "repair-reserve-consumed",
      "result-output-privacy",
    ]),
  );
  for (const fixture of conformanceFixtures.cases) {
    assert.equal(fixture.expected_result, "nonconformant");
    assert.match(fixture.expected_check, /^R\.[A-Z_]+$/);
    assert.match(fixture.expected_issue, /^[a-z][a-z0-9_]+$/);
  }
});

test("the completed and declined runs pass every bounded checker layer", async () => {
  for (const path of [
    "work/0.1/examples/completed-effect.json",
    "work/0.1/examples/declined.json",
  ]) {
    const bytes = await readFile(new URL(path, root));
    const result = checkWorkRunBytes(bytes, { now: fixedNow });
    assert.equal(result.result, "conformant", JSON.stringify(result.issues));
    assert.equal(result.counts.fail, 0);
    assert.equal(result.counts.unknown, 0);
    assert.equal(result.counts.not_run, 0);
    assert.equal(result.observed_at, fixedNow);
    assert.equal(validateResultSchema(result), true, JSON.stringify(validateResultSchema.errors));
    assert.match(result.artifact.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.ok(result.not_established.includes("that an invocation or external effect occurred"));
  }
});

test("the published example carries its currently computed digest vectors", () => {
  const authority = event(completed, "authority.claimed");
  const proposal = event(completed, "action.proposed");
  assert.equal(authority.payload.claim_digest, authorityClaimDigest(authority.payload.binding));
  assert.equal(proposal.payload.proposal_digest, actionProposalDigest(proposal.payload.binding));
});

test("canonical Work JSON is deterministic and rejects ambiguous host values", () => {
  const first = { z: [3, 2, 1], a: { yes: true, no: null } };
  const second = { a: { no: null, yes: true }, z: [3, 2, 1] };
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(canonicalJson({ "\ufffd": 1, "😀": 2 }), "{\"😀\":2,\"�\":1}");
  assert.equal(canonicalJson(-0), "0");
  assert.throws(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1), /safe integers/);
  assert.throws(() => canonicalJson(1.5), /safe integers/);
  assert.throws(() => canonicalJson("\ud800"), /lone UTF-16 surrogates/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cycles/);

  assert.equal(
    actionProposalDigest(first),
    actionProposalDigest(second),
    "member insertion order must not change a binding digest",
  );
});

test("validation does not mutate an already parsed run", () => {
  const candidate = clone(completed);
  const before = JSON.stringify(candidate);
  assert.equal(validateWorkRun(candidate).valid, true);
  assert.equal(JSON.stringify(candidate), before);
});

test("the byte checker fails safely before semantic validation", () => {
  assert.throws(
    () => checkWorkRunBytes(Buffer.from("{}"), { now: "2026-02-30T00:00:00Z" }),
    /uppercase-UTC RFC 3339/,
  );
  const overlongNow = `2026-08-03T16:00:00.${"1".repeat(20)}Z`;
  assert.throws(
    () => checkWorkRunBytes(Buffer.from("{}"), { now: overlongNow }),
    (error) => error instanceof TypeError && !/checker produced an invalid result/.test(error.message),
    "an overlong verifier timestamp must fail input validation, not result construction",
  );
  const cases = [
    [Buffer.from([0xff]), "utf8_decode"],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}")]), "utf8_bom"],
    [Buffer.from("{", "utf8"), "json_parse"],
    [Buffer.from('{"a":1,"a":2}', "utf8"), "json_key_duplicate"],
  ];
  for (const [bytes, expectedCode] of cases) {
    const result = checkWorkRunBytes(bytes, { now: fixedNow });
    assert.equal(result.result, "nonconformant");
    assert.ok(result.issues.some(({ code }) => code === expectedCode));
    assert.equal(result.run.state, "unavailable");
    assert.equal(validateResultSchema(result), true, JSON.stringify(validateResultSchema.errors));
  }

  const oversized = checkWorkRunBytes(Buffer.alloc(MAX_INPUT_BYTES + 1), { now: fixedNow });
  assert.equal(oversized.result, "indeterminate");
  assert.deepEqual(oversized.artifact, {
    complete: false,
    observed_bytes: MAX_INPUT_BYTES + 1,
  });
  assert.ok(oversized.issues.some(({ code }) => code === "input_limit_exceeded"));
  assert.equal(validateResultSchema(oversized), true, JSON.stringify(validateResultSchema.errors));
});

test("checker results preserve opaque input privacy across parse and semantic failures", () => {
  const duplicateKeySentinel = "private_duplicate_key_sentinel_239bd714";
  const duplicate = checkWorkRunBytes(
    Buffer.from(`{"${duplicateKeySentinel}":1,"${duplicateKeySentinel}":2}`),
    { now: fixedNow },
  );
  assert.ok(duplicate.issues.some(({ code }) => code === "json_key_duplicate"));
  assert.doesNotMatch(JSON.stringify(duplicate), new RegExp(duplicateKeySentinel));

  const malformedValueSentinel = "private_malformed_value_sentinel_81c3a9e5";
  const malformed = checkWorkRunBytes(
    Buffer.from(`{"value":"${malformedValueSentinel}"`),
    { now: fixedNow },
  );
  assert.ok(malformed.issues.some(({ code }) => code === "json_parse"));
  assert.doesNotMatch(JSON.stringify(malformed), new RegExp(malformedValueSentinel));

  const schemaKeySentinel = "private_schema_key_sentinel_9f4e";
  const additionalProperty = clone(completed);
  additionalProperty[schemaKeySentinel] = true;
  const schemaFailure = checkedResult(additionalProperty);
  assert.ok(schemaFailure.issues.some(({ code }) => code === "schema_additional_properties"));
  assert.doesNotMatch(JSON.stringify(schemaFailure), new RegExp(schemaKeySentinel));

  const candidate = clone(completed);
  const runIdSentinel = "urn:xenia:test:run:private-output-sentinel-541be732";
  const targetSentinel = "urn:xenia:test:resource:private-output-sentinel-a37c6920";
  candidate.run_id = runIdSentinel;
  event(candidate, "authority.claimed").payload.binding.run_id = runIdSentinel;
  const action = event(candidate, "action.proposed").payload.binding;
  action.run_id = runIdSentinel;
  action.target = targetSentinel;
  action.expected_effect.target = targetSentinel;
  refreshDigests(candidate);
  const result = checkedResult(candidate);
  assert.equal(result.result, "nonconformant");
  assert.ok(result.issues.some(({ code }) => code === "authority_resource_mismatch"));
  assert.deepEqual(result.run, { state: "available", terminal_state: "completed" });
  assert.match(result.output_handling, /at least as restrictively as the input record/);
  assert.ok(result.not_established.includes(
    "that this checker result is safe to publish or sufficient to authorize dispatch",
  ));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, new RegExp(runIdSentinel));
  assert.doesNotMatch(serialized, new RegExp(targetSentinel));
  assert.equal(validateResultSchema(result), true, JSON.stringify(validateResultSchema.errors));
});

test("finite limits, ordering and exact digest binding reject mutations", () => {
  const eventLimit = clone(completed);
  eventLimit.limits.max_events = 9;
  assert.ok(issueCodes(eventLimit).has("event_limit_exceeded"));

  const sequence = clone(completed);
  sequence.events[1].sequence = 3;
  assert.ok(issueCodes(sequence).has("event_sequence_invalid"));

  const proposalMutation = clone(completed);
  event(proposalMutation, "action.proposed").payload.binding.inputs[0].value = "Different notice.";
  assert.ok(issueCodes(proposalMutation).has("proposal_digest_mismatch"));

  const authorityScope = clone(completed);
  event(authorityScope, "authority.claimed").payload.binding.resources = [
    "urn:xenia:example:resource:other-board",
  ];
  refreshDigests(authorityScope);
  assert.ok(issueCodes(authorityScope).has("authority_resource_mismatch"));

  const expiredApproval = clone(completed);
  event(expiredApproval, "action.proposed").payload.binding.required_approvals[0].expires_at =
    "2026-08-03T11:05:30Z";
  refreshDigests(expiredApproval);
  assert.ok(issueCodes(expiredApproval).has("approval_expired"));
});

test("authority evidence is immutable in the binding and cannot arrive after the claim", () => {
  const evidenceMutation = clone(completed);
  const permission = evidenceMutation.evidence.find(({ id }) => id.endsWith("permission-1"));
  permission.digest = `sha256:${"a".repeat(64)}`;
  assertFailedCheck(evidenceMutation, "R.REFERENCES", "evidence_binding_mismatch");

  const lateEvidence = clone(completed);
  const permissionId = "urn:xenia:example:evidence:permission-1";
  const lateObservedAt = "2026-08-03T11:02:30Z";
  lateEvidence.evidence.find(({ id }) => id === permissionId).observed_at = lateObservedAt;
  for (const basis of event(lateEvidence, "authority.claimed").payload.binding.bases) {
    for (const binding of basis.evidence) {
      if (binding.id === permissionId) binding.observed_at = lateObservedAt;
    }
  }
  refreshDigests(lateEvidence);
  assertFailedCheck(lateEvidence, "R.AUTHORITY", "authority_evidence_after_claim");
});

test("merely asserted authority cannot authorize execution", () => {
  const candidate = clone(completed);
  const technicalControl = event(candidate, "authority.claimed").payload.binding.bases
    .find(({ kind }) => kind === "technical_control");
  technicalControl.evidence_state = "asserted";
  refreshDigests(candidate);
  assertFailedCheck(candidate, "R.AUTHORITY", "asserted_authority_at_execution");
});

test("execution needs at least one positive authority basis", () => {
  const candidate = clone(completed);
  for (const basis of event(candidate, "authority.claimed").payload.binding.bases) {
    basis.outcome = "not_applicable";
    basis.evidence_state = "none";
    basis.evidence = [];
  }
  refreshDigests(candidate);
  assertFailedCheck(candidate, "R.AUTHORITY", "authority_positive_basis_missing");
});

test("an attested title or role claim is not implicitly promoted into authority", () => {
  const candidate = clone(completed);
  const evidenceId = "urn:xenia:test:evidence:office-attestation";
  candidate.evidence.push({
    id: evidenceId,
    kind: "attestation",
    ref: "https://example.invalid/evidence/office-attestation",
    digest: `sha256:${"a".repeat(64)}`,
    description: "Fictitious attestation of one named office, not an authority grant.",
    observed_at: "2026-08-03T11:01:30Z",
    recorded_by_actor_id: "urn:xenia:example:actor:steward",
    scope: "This record claims only that the named actor held one office at the stated time.",
    data_zone_id: "internal_record",
  });
  const executorId = event(candidate, "action.proposed").payload.binding.executor_actor_id;
  const executor = candidate.actors.find(({ id }) => id === executorId);
  assert.ok(executor);
  executor.identity_claims.push({
    id: "claimed-office",
    statement: "The actor is attested to hold a named office.",
    evidence_state: "attested",
    outcome: "pass",
    evidence_ids: [evidenceId],
  });
  for (const basis of event(candidate, "authority.claimed").payload.binding.bases) {
    basis.outcome = "not_applicable";
    basis.evidence_state = "none";
    basis.evidence = [];
  }
  refreshDigests(candidate);

  assert.equal(validateRunSchema(candidate), true, JSON.stringify(validateRunSchema.errors));
  const validation = assertFailedCheck(
    candidate,
    "R.AUTHORITY",
    "authority_positive_basis_missing",
  );
  assert.equal(validation.issues.some(({ code }) => code === "evidence_reference_missing"), false);
});

test("non-revocable authority cannot support an execution start", () => {
  const candidate = clone(completed);
  event(candidate, "authority.claimed").payload.binding.revocable = false;
  refreshDigests(candidate);
  assertFailedCheck(candidate, "R.AUTHORITY", "non_revocable_authority_at_execution");
});

test("affected-party consent uses consent-specific evidence", () => {
  const candidate = clone(completed);
  const bases = event(candidate, "authority.claimed").payload.binding.bases;
  const permissionEvidence = bases.find(({ kind }) => kind === "technical_control").evidence[0];
  const consent = bases.find(({ kind }) => kind === "affected_party_consent");
  consent.evidence = [clone(permissionEvidence)];
  refreshDigests(candidate);
  assertFailedCheck(candidate, "R.AUTHORITY", "consent_evidence_kind_mismatch");
});

test("affected-party consent evidence binds exact subjects and action scope", () => {
  const wrongScope = clone(completed);
  const scopeEvidence = wrongScope.evidence.find(({ id }) => id.endsWith(":consent-1"));
  const scopeBinding = event(wrongScope, "authority.claimed").payload.binding.bases
    .find(({ kind }) => kind === "affected_party_consent").evidence[0];
  scopeEvidence.scope = "Unrelated visitor consent for an unrelated weather survey.";
  scopeBinding.scope = scopeEvidence.scope;
  scopeEvidence.action_scope.purpose = "Run an unrelated weather survey.";
  scopeBinding.action_scope.purpose = scopeEvidence.action_scope.purpose;
  refreshDigests(wrongScope);
  assertFailedCheck(wrongScope, "R.AUTHORITY", "consent_evidence_scope_mismatch");

  const wrongSubjects = clone(completed);
  const subjectEvidence = wrongSubjects.evidence.find(({ id }) => id.endsWith(":consent-1"));
  const subjectBinding = event(wrongSubjects, "authority.claimed").payload.binding.bases
    .find(({ kind }) => kind === "affected_party_consent").evidence[0];
  subjectEvidence.consent_subject_actor_ids = ["urn:xenia:example:actor:helper"];
  subjectBinding.consent_subject_actor_ids = clone(subjectEvidence.consent_subject_actor_ids);
  refreshDigests(wrongSubjects);
  assertFailedCheck(wrongSubjects, "R.AUTHORITY", "consent_evidence_subject_mismatch");
});

test("credential-shaped and restricted literals fail without echoing their values", () => {
  const credentialValue = "sk-XENIA_PRIVATE_SENTINEL_8d9170f4";
  const credential = clone(completed);
  const credentialInput = event(credential, "action.proposed").payload.binding.inputs[0];
  credentialInput.name = "api_token";
  credentialInput.value = credentialValue;
  refreshDigests(credential);
  const credentialResult = checkedResult(credential);
  assert.equal(credentialResult.result, "nonconformant");
  assert.ok(credentialResult.issues.some(({ code }) => code === "credential_literal_forbidden"));
  assert.doesNotMatch(JSON.stringify(credentialResult), new RegExp(credentialValue));
  assert.equal(validateResultSchema(credentialResult), true, JSON.stringify(validateResultSchema.errors));

  const restrictedValue = "RESTRICTED_LITERAL_SENTINEL_4c6f82a1";
  const restricted = clone(completed);
  const zone = restricted.data_zones.find(({ id }) => id === "public_content");
  zone.classification = "restricted";
  event(restricted, "authority.claimed").payload.binding.data_zones[0].classification = "restricted";
  const restrictedAction = event(restricted, "action.proposed").payload.binding;
  restrictedAction.data_zones[0].classification = "restricted";
  restrictedAction.inputs[0].value = restrictedValue;
  refreshDigests(restricted);
  const restrictedResult = checkedResult(restricted);
  assert.equal(restrictedResult.result, "nonconformant");
  assert.ok(restrictedResult.issues.some(({ code }) => code === "literal_protected_data"));
  assert.doesNotMatch(JSON.stringify(restrictedResult), new RegExp(restrictedValue));
  assert.equal(validateResultSchema(restrictedResult), true, JSON.stringify(validateResultSchema.errors));
});

test("credential references cannot carry secret material or echo it", () => {
  const secret = "sk-XENIA_CREDENTIAL_REF_SENTINEL_72a9f4c1";
  const candidate = clone(completed);
  event(candidate, "action.proposed").payload.binding.inputs[0] = {
    name: "service_credential",
    kind: "credential_ref",
    ref: `https://credentials.invalid/resolve?access_token=${secret}`,
    data_zone_id: "public_content",
    purpose: "Resolve one separately authorized credential.",
  };
  refreshDigests(candidate);
  const result = checkedResult(candidate);
  assert.equal(result.result, "nonconformant");
  assert.ok(result.issues.some(({ code }) => code === "credential_ref_secret_forbidden"));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
  assert.equal(validateResultSchema(result), true, JSON.stringify(validateResultSchema.errors));
});

test("a human-agent pair is descriptive, not an execution or approval principal", () => {
  const pairExecutor = clone(completed);
  const executorId = addPairActor(pairExecutor);
  event(pairExecutor, "authority.claimed").payload.binding.executor_actor_id = executorId;
  event(pairExecutor, "action.proposed").payload.binding.executor_actor_id = executorId;
  const execution = event(pairExecutor, "execution.started");
  execution.actor_id = executorId;
  execution.payload.executor_actor_id = executorId;
  refreshDigests(pairExecutor);
  assertFailedCheck(pairExecutor, "R.AUTHORITY", "pair_execution_unsupported");

  const pairApprover = clone(completed);
  const approverId = addPairActor(pairApprover);
  event(pairApprover, "action.proposed").payload.binding.required_approvals[0].actor_id = approverId;
  const approval = event(pairApprover, "execution.approved");
  approval.actor_id = approverId;
  approval.payload.approver_actor_id = approverId;
  refreshDigests(pairApprover);
  assertFailedCheck(pairApprover, "R.APPROVALS", "pair_approval_unsupported");
});

test("a work-choice event must be advertised by the offer", () => {
  const candidate = clone(completed);
  event(candidate, "work.offered").payload.exit_options =
    event(candidate, "work.offered").payload.exit_options.filter((choice) => choice !== "ask");
  candidate.events.splice(1, 0, {
    id: "ask-unadvertised-1",
    sequence: 2,
    type: "work.asked",
    at: "2026-08-03T11:00:30Z",
    actor_id: "urn:xenia:example:actor:helper",
    previous_event_id: "offer-1",
    payload: {
      to_actor_ids: ["urn:xenia:example:actor:steward"],
      question: "May this unadvertised choice be used?",
      data_zone_id: "internal_record",
      reply_ref: "https://example.invalid/reply/unadvertised-choice",
      cancel_ref: "https://example.invalid/cancel/unadvertised-choice",
      no_penalty: true,
    },
  });
  resequenceEvents(candidate);
  assertFailedCheck(candidate, "R.STATE", "choice_not_advertised");
});

test("post-acceptance cancellation is not held hostage by the offer allowlist", () => {
  const candidate = clone(completed);
  event(candidate, "work.offered").payload.exit_options =
    event(candidate, "work.offered").payload.exit_options.filter((choice) => choice !== "cancel");
  const terminal = event(candidate, "work.completed");
  terminal.id = "cancel-1";
  terminal.type = "work.cancelled";
  terminal.actor_id = "urn:xenia:example:actor:helper";
  terminal.payload = {
    reason_state: "withheld",
    effective_boundary: "before_next_external_effect",
    no_penalty: true,
  };
  candidate.terminal_state = "cancelled";
  candidate.terminal_event_id = terminal.id;
  const validation = validationFor(candidate);
  assert.equal(checkOutcome(validation, "R.STATE"), "pass", JSON.stringify(validation.issues));
  assert.ok(!validation.issues.some(({ code }) => code === "choice_not_advertised"));
});

test("the whole-record data zone protects embedded non-public material", () => {
  const candidate = clone(completed);
  candidate.record_data_zone_id = "public_content";
  assertFailedCheck(candidate, "R.STATE", "record_zone_classification_too_broad");
});

test("the whole-record zone covers every non-public declared zone, including unused zones", () => {
  const candidate = clone(completed);
  candidate.data_zones.push({
    id: "unused_restricted",
    description: "A deliberately unused restricted zone.",
    classification: "restricted",
    purpose: "Exercise whole-record coverage.",
    audience: {
      mode: "actors",
      actor_ids: ["urn:xenia:example:actor:steward"],
    },
    retention: {
      mode: "until",
      until: "2026-08-04T11:00:00Z",
    },
  });
  assertFailedCheck(candidate, "R.STATE", "record_zone_classification_too_broad");
});

test("action recipients stay within every bound data-zone audience", () => {
  const candidate = clone(completed);
  const audience = {
    mode: "actors",
    actor_ids: ["urn:xenia:example:actor:helper"],
  };
  candidate.data_zones.find(({ id }) => id === "public_content").audience = clone(audience);
  event(candidate, "authority.claimed").payload.binding.data_zones[0].audience = clone(audience);
  event(candidate, "action.proposed").payload.binding.data_zones[0].audience = clone(audience);
  refreshDigests(candidate);
  assertFailedCheck(candidate, "R.STATE", "recipient_out_of_data_zone_audience");
});

test("the terminal event leaves the two declared repair slots unused", () => {
  const boundary = refreshDigests(clone(completed));
  boundary.limits.max_events = 12;
  const boundaryValidation = validationFor(boundary);
  assert.equal(checkOutcome(boundaryValidation, "R.LIMITS_PLAN"), "pass", JSON.stringify(boundaryValidation.issues));

  const consumed = refreshDigests(clone(completed));
  consumed.limits.max_events = 11;
  assertFailedCheck(consumed, "R.LIMITS_PLAN", "repair_reserve_consumed");
});

test("tested causal evidence is appropriate and post-receipt", () => {
  const candidate = clone(completed);
  event(candidate, "effect.observed").payload.causal_claim.evidence_ids = [
    "urn:xenia:example:evidence:consent-1",
  ];
  const validation = assertFailedCheck(
    candidate,
    "R.EFFECTS",
    "causal_evidence_before_receipt",
  );
  assert.ok(validation.issues.some(({ code }) => code === "causal_evidence_kind_mismatch"));

  const receiptEqual = clone(completed);
  receiptEqual.evidence.find(({ id }) => id.endsWith(":observation-1")).observed_at =
    event(receiptEqual, "execution.receipt").at;
  assertFailedCheck(receiptEqual, "R.EFFECTS", "causal_evidence_before_receipt");

  const unrelated = clone(completed);
  const unrelatedEvidence = clone(unrelated.evidence.find(({ id }) => id.endsWith(":observation-1")));
  unrelatedEvidence.id = "urn:xenia:test:evidence:unrelated-weather-test";
  unrelatedEvidence.kind = "test_result";
  unrelatedEvidence.ref = "https://example.invalid/evidence/unrelated-weather-test";
  unrelatedEvidence.digest = "sha256:abababababababababababababababababababababababababababababababab";
  unrelatedEvidence.observed_at = "2026-08-03T11:07:30Z";
  unrelatedEvidence.scope = "Test result for an unrelated weather widget.";
  delete unrelatedEvidence.causal_scope;
  unrelated.evidence.push(unrelatedEvidence);
  event(unrelated, "effect.observed").payload.causal_claim.evidence_ids = [unrelatedEvidence.id];
  assertFailedCheck(unrelated, "R.EFFECTS", "causal_evidence_scope_mismatch");
});

test("provider response, observed effect and terminal state remain separate", () => {
  const missingObservation = clone(completed);
  const observationIndex = missingObservation.events.findIndex(({ type }) => type === "effect.observed");
  missingObservation.events.splice(observationIndex, 1);
  const terminal = event(missingObservation, "work.completed");
  terminal.sequence = 9;
  terminal.previous_event_id = "receipt-1";
  const missingCodes = issueCodes(missingObservation);
  assert.ok(missingCodes.has("effect_observation_missing"));
  assert.ok(missingCodes.has("completion_without_confirmed_effect"));

  const postTerminal = clone(completed);
  const observation = event(postTerminal, "effect.observed");
  const completion = event(postTerminal, "work.completed");
  postTerminal.events.splice(postTerminal.events.indexOf(observation), 2, completion, observation);
  completion.sequence = 9;
  completion.at = "2026-08-03T11:08:00Z";
  completion.previous_event_id = "receipt-1";
  observation.sequence = 10;
  observation.at = "2026-08-03T11:09:00Z";
  observation.previous_event_id = "complete-1";
  assert.ok(issueCodes(postTerminal).has("post_terminal_effect"));
});

test("a proposal cannot be rejected after its execution has started", () => {
  const candidate = clone(completed);
  const proposal = event(candidate, "action.proposed");
  const executionIndex = candidate.events.findIndex(({ type }) => type === "execution.started");
  candidate.events.splice(executionIndex + 1, 0, {
    id: "late-rejection-1",
    sequence: executionIndex + 2,
    type: "action.rejected",
    at: "2026-08-03T11:06:30Z",
    actor_id: "urn:xenia:example:actor:steward",
    previous_event_id: "execution-1",
    payload: {
      proposal_event_id: proposal.id,
      proposal_digest: proposal.payload.proposal_digest,
      rejected_by_actor_id: "urn:xenia:example:actor:steward",
      problem: clone(approvalRequired),
    },
  });
  resequenceEvents(candidate);
  assertFailedCheck(candidate, "R.PROBLEMS", "rejection_after_execution");
});

test("corrections append but must target an earlier event", () => {
  const candidate = clone(completed);
  candidate.updated_at = "2026-08-03T11:10:00Z";
  candidate.events.push({
    id: "correction-1",
    sequence: 11,
    type: "correction.appended",
    at: candidate.updated_at,
    actor_id: "urn:xenia:example:actor:steward",
    previous_event_id: "complete-1",
    payload: {
      target_event_ids: ["missing-event"],
      kind: "clarification",
      statement: "This fictitious correction deliberately names no existing event.",
      evidence_ids: [],
      tombstones: [],
    },
  });
  assert.equal(validateRunSchema(candidate), true, JSON.stringify(validateRunSchema.errors));
  assert.ok(issueCodes(candidate).has("event_reference_missing"));
});

test("the CLI has pure JSON output and stable exit classes", () => {
  const conformant = spawnSync(process.execPath, [checkerPath, completedPath, "--json"], {
    encoding: "utf8",
  });
  assert.equal(conformant.status, 0, conformant.stderr);
  assert.equal(JSON.parse(conformant.stdout).result, "conformant");
  assert.equal(conformant.stderr, "");

  const nonRun = spawnSync(process.execPath, [
    checkerPath,
    approvalRequiredPath,
    "--json",
  ], { encoding: "utf8" });
  assert.equal(nonRun.status, 1, nonRun.stderr);
  assert.equal(JSON.parse(nonRun.stdout).result, "nonconformant");

  const misuse = spawnSync(process.execPath, [checkerPath], { encoding: "utf8" });
  assert.equal(misuse.status, 2);
  assert.match(misuse.stderr, /^Usage:/);

  const help = spawnSync(process.execPath, [checkerPath, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /performs no network/);
});

test("the checker has no network, credential or environment dependency", async () => {
  const source = await readFile(checkerPath, "utf8");
  assert.doesNotMatch(source, /from ["']node:(?:http|https|http2|net|tls|dns)["']/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /child_process/);
});
