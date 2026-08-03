#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { realpathSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const WORK_PROFILE = "xenia-work/0.1-development";
export const WORK_RUN_VERSION = "xenia.work.run/0.1-development";
export const WORK_RESULT_VERSION = "xenia.work.result/0.1-development";
export const WORK_CHECKER_VERSION = "0.1.0-development";
export const MAX_INPUT_BYTES = 1024 * 1024;
export const MAX_ISSUES = 256;
export const AUTHORITY_DIGEST_DOMAIN = "xenia.work.authority-claim/0.1\n";
export const ACTION_DIGEST_DOMAIN = "xenia.work.action-proposal/0.1\n";

const MAX_PROFILE_ELAPSED_MS = 604800000;
const CREDENTIAL_NAME_PATTERN = /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|cookie|session)/i;
const CREDENTIAL_VALUE_PATTERNS = Object.freeze([
  /\bsk-[A-Za-z0-9_-]{8,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:access|refresh|id)[_-]?token\s*[:=]/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
]);

const RUN_SCHEMA_ID = "urn:xenia:work:run:0.1:development-draft";
const RESULT_SCHEMA_ID = "urn:xenia:work:result:0.1:development-draft";
const RESULT_SCOPE = "Structural and interchange validation of one supplied XENIA Work 0.1 run document; no external system or evidence was contacted.";
const RESULT_OUTPUT_HANDLING = "Treat this result at least as restrictively as the input record; artifact digests and terminal metadata may remain sensitive.";
const NOT_ESTABLISHED = Object.freeze([
  "actor identity, consciousness, personhood, or legal status",
  "informed consent, legal basis, provider permission, or representative authority beyond internal record consistency",
  "that an invocation or external effect occurred",
  "the truth, authenticity, or causal force of evidence, receipts, observations, or claims",
  "privacy, security, Covenant duties, or whole-XENIA conformance",
  "that this checker result is safe to publish or sufficient to authorize dispatch",
]);
const SEMANTIC_CHECKS = Object.freeze([
  ["R.IDS", "unique actor, zone, evidence, event, execution, step, input, nonce, and idempotency identifiers"],
  ["R.CHAIN_TIME", "a contiguous append-only event chain with coherent timestamps"],
  ["R.REFERENCES", "all internal references resolve to an earlier record of the required type"],
  ["R.LIMITS_PLAN", "declared finite limits, costs, attempts, and acyclic plans are respected"],
  ["R.STATE", "the finite work-state transitions are internally consistent"],
  ["R.DIGESTS", "authority and action digests match the profile canonicalization"],
  ["R.AUTHORITY", "recorded execution starts reference active, exactly scoped authority claims without upgrading claims into proof"],
  ["R.APPROVALS", "every recorded execution start has exact, unexpired, one-use approvals for its proposal"],
  ["R.EXECUTION", "recorded execution starts and provider receipts are paired once and remain distinct from effects"],
  ["R.EFFECTS", "effect observations are separate, ordered, and consistent with terminal outcome claims"],
  ["R.PROBLEMS", "typed problems distinguish terminal refusal from optional recovery"],
  ["R.CORRECTIONS", "corrections and appeals append to earlier records without reopening execution"],
  ["R.TERMINAL", "one declared terminal event ends execution and matches the run summary"],
]);
const TERMINAL_EVENT_FOR_STATE = Object.freeze({
  completed: "work.completed",
  declined: "work.declined",
  paused: "work.paused",
  cancelled: "work.cancelled",
  expired: "work.expired",
  failed: "work.failed",
  closed: "work.closed",
});
const TERMINAL_EVENT_TYPES = new Set(Object.values(TERMINAL_EVENT_FOR_STATE));
const AUTHORITY_BASIS_KINDS = Object.freeze([
  "technical_control",
  "affected_party_consent",
  "representative_authority",
  "legal_basis",
  "provider_permission",
]);
const CLASSIFICATION_RANK = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
});

const directory = new URL("./", import.meta.url);
const runSchema = JSON.parse(readFileSync(new URL("run.schema.json", directory), "utf8"));
const problemSchema = JSON.parse(readFileSync(new URL("problem.schema.json", directory), "utf8"));
const resultSchema = JSON.parse(readFileSync(new URL("result.schema.json", directory), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(problemSchema);
ajv.addSchema(runSchema);
ajv.addSchema(resultSchema);
const validateRunSchema = ajv.getSchema(RUN_SCHEMA_ID);
const validateResultSchema = ajv.getSchema(RESULT_SCHEMA_ID);

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertUnicodeScalarString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("canonical JSON strings must not contain lone UTF-16 surrogates");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("canonical JSON strings must not contain lone UTF-16 surrogates");
    }
  }
}

/**
 * RFC 8785-compatible canonical JSON for the Work profile's constrained JSON
 * values. Numbers are deliberately limited to safe integers; decimal costs are
 * strings in the profile. The function never calls toJSON or getters.
 */
export function canonicalJson(value) {
  const active = new Set();

  function visit(current) {
    if (current === null) return "null";
    if (current === true) return "true";
    if (current === false) return "false";
    if (typeof current === "string") {
      assertUnicodeScalarString(current);
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isSafeInteger(current)) {
        throw new TypeError("canonical Work JSON numbers must be safe integers");
      }
      return Object.is(current, -0) ? "0" : String(current);
    }
    if (Array.isArray(current)) {
      if (active.has(current)) throw new TypeError("canonical JSON cannot contain cycles");
      active.add(current);
      try {
        const members = [];
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.hasOwn(current, index)) {
            throw new TypeError("canonical JSON arrays cannot contain holes");
          }
          members.push(visit(current[index]));
        }
        const ownKeys = Reflect.ownKeys(current).filter((key) => key !== "length");
        if (ownKeys.length !== current.length) {
          throw new TypeError("canonical JSON arrays cannot contain extra properties");
        }
        return `[${members.join(",")}]`;
      } finally {
        active.delete(current);
      }
    }
    if (!isPlainRecord(current)) {
      throw new TypeError("canonical JSON accepts only null, booleans, strings, safe integers, arrays, and plain objects");
    }
    if (active.has(current)) throw new TypeError("canonical JSON cannot contain cycles");
    active.add(current);
    try {
      const ownKeys = Reflect.ownKeys(current);
      if (ownKeys.some((key) => typeof key !== "string")) {
        throw new TypeError("canonical JSON objects cannot contain symbol keys");
      }
      const keys = Object.keys(current);
      if (keys.length !== ownKeys.length) {
        throw new TypeError("canonical JSON objects cannot contain non-enumerable properties");
      }
      keys.sort();
      return `{${keys.map((key) => {
        assertUnicodeScalarString(key);
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !("value" in descriptor)) {
          throw new TypeError("canonical JSON objects cannot contain accessors");
        }
        return `${JSON.stringify(key)}:${visit(descriptor.value)}`;
      }).join(",")}}`;
    } finally {
      active.delete(current);
    }
  }

  return visit(value);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function bindingDigest(domain, binding) {
  const canonical = canonicalJson(binding);
  return sha256(Buffer.from(domain + canonical, "utf8"));
}

export function authorityClaimDigest(binding) {
  return bindingDigest(AUTHORITY_DIGEST_DOMAIN, binding);
}

export function actionProposalDigest(binding) {
  return bindingDigest(ACTION_DIGEST_DOMAIN, binding);
}

function timestampParts(value) {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?Z$/.exec(value);
  if (!match) return null;
  return {
    tuple: match.slice(1, 7).map(Number),
    fraction: match[7] ?? "",
  };
}

function validTimestamp(value) {
  const parts = timestampParts(value);
  if (!parts) return false;
  const adjusted = value.replace(/:60(\.[0-9]+)?Z$/, ":59$1Z");
  const date = new Date(adjusted);
  if (!Number.isFinite(date.getTime())) return false;
  const [year, month, day, hour, minute, second] = parts.tuple;
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === Math.min(second, 59);
}

function compareTimestamp(left, right) {
  const a = timestampParts(left);
  const b = timestampParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < a.tuple.length; index += 1) {
    if (a.tuple[index] < b.tuple[index]) return -1;
    if (a.tuple[index] > b.tuple[index]) return 1;
  }
  const length = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(length, "0");
  const bf = b.fraction.padEnd(length, "0");
  return af < bf ? -1 : af > bf ? 1 : 0;
}

function timestampScalar(value, scale) {
  const parts = timestampParts(value);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.tuple;
  const midnight = Date.parse(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
  if (!Number.isFinite(midnight)) return null;
  const seconds = BigInt(midnight / 1000) + BigInt(hour * 3600 + minute * 60 + second);
  const fraction = BigInt((parts.fraction || "0").padEnd(scale, "0"));
  return seconds * (10n ** BigInt(scale)) + fraction;
}

function elapsedExceeds(start, end, maxMilliseconds) {
  const startParts = timestampParts(start);
  const endParts = timestampParts(end);
  if (!startParts || !endParts) return false;
  const scale = Math.max(3, startParts.fraction.length, endParts.fraction.length);
  const startValue = timestampScalar(start, scale);
  const endValue = timestampScalar(end, scale);
  if (startValue === null || endValue === null) return false;
  const limit = BigInt(maxMilliseconds) * (10n ** BigInt(scale - 3));
  return endValue - startValue > limit;
}

function boundedText(value, maximum) {
  const text = String(value);
  return text.length <= maximum ? text : text.slice(0, maximum - 1) + "…";
}

function issue(code, path, message) {
  return {
    code: boundedText(code, 64),
    path: boundedText(path, 1000),
    message: boundedText(message, 2000),
  };
}

function pushIssue(issues, code, path, message) {
  if (issues.length < MAX_ISSUES) issues.push(issue(code, path, message));
}

function pointerPath(error) {
  let path = error.instancePath ? `$${error.instancePath}` : "$";
  if (error.keyword === "required" && error.params?.missingProperty) {
    path += `/${String(error.params.missingProperty).replaceAll("~", "~0").replaceAll("/", "~1")}`;
  }
  return path;
}

function schemaIssues(errors) {
  const issues = [];
  for (const error of errors ?? []) {
    const keyword = String(error.keyword || "invalid")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase();
    pushIssue(
      issues,
      `schema_${keyword}`,
      pointerPath(error),
      `Run schema ${error.message || "validation failed"}.`,
    );
  }
  return issues;
}

function check(id, outcome, expected, observed) {
  return { id, outcome, expected, observed };
}

function notRunChecks(reason) {
  return SEMANTIC_CHECKS.map(([id, expected]) => check(id, "not_run", expected, reason));
}

function countChecks(checks) {
  const counts = { pass: 0, fail: 0, unknown: 0, not_run: 0 };
  for (const entry of checks) counts[entry.outcome] += 1;
  return counts;
}

function resultState(counts) {
  if (counts.fail > 0) return "nonconformant";
  if (counts.unknown > 0 || counts.not_run > 0) return "indeterminate";
  return "conformant";
}

function strictObservedAt(value) {
  const observedAt = value instanceof Date ? value.toISOString() : value ?? new Date().toISOString();
  if (typeof observedAt !== "string" || observedAt.length > 40 || !validTimestamp(observedAt)) {
    throw new TypeError("now must be an uppercase-UTC RFC 3339 timestamp or Date");
  }
  return observedAt;
}

function buildResult({ artifact, observedAt, checks, issues, run }) {
  const counts = countChecks(checks);
  const result = {
    $schema: RESULT_SCHEMA_ID,
    schema_version: WORK_RESULT_VERSION,
    profile: WORK_PROFILE,
    artifact,
    verifier: { name: "xenia-work-check", version: WORK_CHECKER_VERSION },
    observed_at: observedAt,
    result: resultState(counts),
    scope: RESULT_SCOPE,
    output_handling: RESULT_OUTPUT_HANDLING,
    limits: { max_input_bytes: MAX_INPUT_BYTES, max_issues: MAX_ISSUES },
    counts,
    checks,
    issues: issues.slice(0, MAX_ISSUES),
    run,
    not_established: [...NOT_ESTABLISHED],
  };
  if (!validateResultSchema(result)) {
    throw new Error(`checker produced an invalid result: ${JSON.stringify(validateResultSchema.errors)}`);
  }
  return result;
}

function duplicateJsonKeys(text) {
  let index = 0;
  let depth = 0;
  const duplicates = [];

  function whitespace() {
    while (/\s/.test(text[index] ?? "")) index += 1;
  }

  function string() {
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += text[index + 1] === "u" ? 6 : 2;
      } else if (text[index] === "\"") {
        index += 1;
        return JSON.parse(text.slice(start, index));
      } else {
        index += 1;
      }
    }
    throw new SyntaxError("unterminated JSON string");
  }

  function value(path) {
    whitespace();
    if (depth > 128) throw new RangeError("JSON nesting exceeds 128 levels");
    const token = text[index];
    if (token === "{") {
      depth += 1;
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] !== "}") {
        while (true) {
          const key = string();
          if (keys.has(key) && duplicates.length < MAX_ISSUES) {
            duplicates.push({ path, key });
          }
          keys.add(key);
          whitespace();
          index += 1; // colon; JSON.parse already established valid syntax.
          value(`${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
          whitespace();
          if (text[index] === "}") break;
          index += 1; // comma
          whitespace();
        }
      }
      index += 1;
      depth -= 1;
      return;
    }
    if (token === "[") {
      depth += 1;
      index += 1;
      whitespace();
      let member = 0;
      if (text[index] !== "]") {
        while (true) {
          value(`${path}/${member}`);
          member += 1;
          whitespace();
          if (text[index] === "]") break;
          index += 1;
        }
      }
      index += 1;
      depth -= 1;
      return;
    }
    if (token === "\"") {
      string();
      return;
    }
    while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1;
  }

  whitespace();
  value("$");
  return duplicates;
}

function contextFor(run) {
  const actors = new Map(run.actors.map((actor, index) => [actor.id, { actor, index }]));
  const zones = new Map(run.data_zones.map((zone, index) => [zone.id, { zone, index }]));
  const evidence = new Map(run.evidence.map((entry, index) => [entry.id, { entry, index }]));
  const events = new Map(run.events.map((event, index) => [event.id, { event, index }]));
  const byType = new Map();
  for (const event of run.events) {
    const values = byType.get(event.type) ?? [];
    values.push(event);
    byType.set(event.type, values);
  }
  return { run, actors, zones, evidence, events, byType };
}

function dataZoneProjection(zone) {
  return {
    id: zone.id,
    classification: zone.classification,
    purpose: zone.purpose,
    audience: zone.audience,
    retention: zone.retention,
  };
}

function evidenceProjection(entry, zone) {
  const projection = {
    id: entry.id,
    kind: entry.kind,
    digest: entry.digest,
    observed_at: entry.observed_at,
    recorded_by_actor_id: entry.recorded_by_actor_id,
    scope: entry.scope,
    data_zone: dataZoneProjection(zone),
  };
  for (const name of ["consent_subject_actor_ids", "action_scope", "causal_scope"]) {
    if (Object.hasOwn(entry, name)) projection[name] = entry[name];
  }
  return projection;
}

function actionScope(run, action) {
  return {
    run_id: run.run_id,
    purpose: action.purpose,
    operation: action.operation,
    target: action.target,
    data_zone_ids: action.data_zones.map(({ id }) => id),
    expected_effect: action.expected_effect,
  };
}

function causalScope(run, proposal, receipt, observation) {
  return {
    run_id: run.run_id,
    proposal_event_id: proposal.id,
    proposal_digest: proposal.payload.proposal_digest,
    execution_event_id: observation.payload.execution_event_id,
    receipt_event_id: receipt.id,
    target: proposal.payload.binding.target,
    expected_effect: proposal.payload.binding.expected_effect,
    observed_outcome: observation.payload.outcome,
    observed_summary: observation.payload.summary,
  };
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function looksLikeCredential(name, value) {
  if (CREDENTIAL_NAME_PATTERN.test(name)) return true;
  return typeof value === "string"
    && CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function unsafeCredentialReference(value) {
  if (typeof value !== "string") return true;
  if (looksLikeCredential("", value) || value.includes("?") || value.includes("#")) return true;
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.username.length > 0 || parsed.password.length > 0;
  } catch {
    return true;
  }
}

function addDuplicateIssues(values, valueOf, pathOf, code, label, issues) {
  const seen = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = valueOf(values[index]);
    if (seen.has(value)) {
      pushIssue(
        issues,
        code,
        pathOf(index),
        `${label} duplicates the value first used at index ${seen.get(value)}.`,
      );
    } else {
      seen.set(value, index);
    }
  }
}

function sameMembers(actual, expected) {
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && actual.every((value) => expected.includes(value));
}

function audienceNoBroader(candidate, boundary) {
  if (boundary.mode === "public") return true;
  return candidate.mode === "actors"
    && candidate.actor_ids.every((actorId) => boundary.actor_ids.includes(actorId));
}

function retentionNoLonger(candidate, boundary) {
  if (candidate.mode === "ephemeral") return true;
  if (boundary.mode === "ephemeral") return false;
  if (candidate.mode === "until" && boundary.mode === "until") {
    return compareTimestamp(candidate.until, boundary.until) <= 0;
  }
  return sameCanonical(candidate, boundary);
}

function declaredZoneIds(ctx) {
  return new Set(ctx.run.data_zones.map(({ id }) => id));
}

function checkIdentifiers(ctx, issues) {
  const { run } = ctx;
  addDuplicateIssues(run.actors, (value) => value.id, (index) => `$.actors[${index}].id`, "actor_id_duplicate", "Actor ID", issues);
  addDuplicateIssues(run.data_zones, (value) => value.id, (index) => `$.data_zones[${index}].id`, "data_zone_id_duplicate", "Data-zone ID", issues);
  addDuplicateIssues(run.evidence, (value) => value.id, (index) => `$.evidence[${index}].id`, "evidence_id_duplicate", "Evidence ID", issues);
  addDuplicateIssues(run.events, (value) => value.id, (index) => `$.events[${index}].id`, "event_id_duplicate", "Event ID", issues);

  for (const [actorIndex, actor] of run.actors.entries()) {
    addDuplicateIssues(
      actor.identity_claims,
      (value) => value.id,
      (index) => `$.actors[${actorIndex}].identity_claims[${index}].id`,
      "claim_id_duplicate",
      "Identity-claim ID",
      issues,
    );
    if (actor.kind === "human_agent_pair") {
      addDuplicateIssues(
        actor.pair_members,
        (value) => value.actor_id,
        (index) => `$.actors[${actorIndex}].pair_members[${index}].actor_id`,
        "pair_member_duplicate",
        "Pair member",
        issues,
      );
    }
  }

  const executionIds = [];
  const idempotencyKeys = [];
  const approvalNonces = [];
  for (const [eventIndex, event] of run.events.entries()) {
    if (event.type === "plan.proposed") {
      addDuplicateIssues(
        event.payload.steps,
        (value) => value.id,
        (index) => `$.events[${eventIndex}].payload.steps[${index}].id`,
        "plan_step_id_duplicate",
        "Plan-step ID",
        issues,
      );
    }
    if (event.type === "authority.claimed") {
      const authority = event.payload.binding;
      const bases = authority.bases;
      addDuplicateIssues(
        authority.data_zones,
        (value) => value.id,
        (index) => `$.events[${eventIndex}].payload.binding.data_zones[${index}].id`,
        "authority_data_zone_duplicate",
        "Authority data zone",
        issues,
      );
      addDuplicateIssues(
        bases,
        (value) => value.kind,
        (index) => `$.events[${eventIndex}].payload.binding.bases[${index}].kind`,
        "authority_basis_duplicate",
        "Authority-basis kind",
        issues,
      );
      if (!sameMembers(bases.map(({ kind }) => kind), AUTHORITY_BASIS_KINDS)) {
        pushIssue(
          issues,
          "authority_basis_set_mismatch",
          `$.events[${eventIndex}].payload.binding.bases`,
          "An authority claim must enumerate each of the five authority-basis kinds exactly once.",
        );
      }
      for (const [basisIndex, basis] of bases.entries()) {
        addDuplicateIssues(
          basis.evidence,
          (value) => value.id,
          (index) => `$.events[${eventIndex}].payload.binding.bases[${basisIndex}].evidence[${index}].id`,
          "authority_evidence_duplicate",
          "Authority evidence",
          issues,
        );
      }
    }
    if (event.type === "action.proposed") {
      const binding = event.payload.binding;
      addDuplicateIssues(
        binding.data_zones,
        (value) => value.id,
        (index) => `$.events[${eventIndex}].payload.binding.data_zones[${index}].id`,
        "action_data_zone_duplicate",
        "Action data zone",
        issues,
      );
      addDuplicateIssues(
        binding.inputs,
        (value) => value.name,
        (index) => `$.events[${eventIndex}].payload.binding.inputs[${index}].name`,
        "action_input_name_duplicate",
        "Action-input name",
        issues,
      );
      addDuplicateIssues(
        binding.authority_claims,
        (value) => value.event_id,
        (index) => `$.events[${eventIndex}].payload.binding.authority_claims[${index}].event_id`,
        "authority_reference_duplicate",
        "Authority reference",
        issues,
      );
      addDuplicateIssues(
        binding.required_approvals,
        (value) => value.actor_id,
        (index) => `$.events[${eventIndex}].payload.binding.required_approvals[${index}].actor_id`,
        "required_approver_duplicate",
        "Required approver",
        issues,
      );
      addDuplicateIssues(
        binding.required_approvals,
        (value) => value.nonce,
        (index) => `$.events[${eventIndex}].payload.binding.required_approvals[${index}].nonce`,
        "approval_nonce_duplicate",
        "Approval nonce",
        issues,
      );
      for (const [approvalIndex, approval] of binding.required_approvals.entries()) {
        approvalNonces.push({
          value: approval.nonce,
          path: `$.events[${eventIndex}].payload.binding.required_approvals[${approvalIndex}].nonce`,
        });
      }
      idempotencyKeys.push({
        value: binding.idempotency_key,
        path: `$.events[${eventIndex}].payload.binding.idempotency_key`,
      });
    }
    if (event.type === "work.handed_off") {
      addDuplicateIssues(
        event.payload.data_zones,
        (value) => value.id,
        (index) => `$.events[${eventIndex}].payload.data_zones[${index}].id`,
        "handoff_data_zone_duplicate",
        "Handoff data zone",
        issues,
      );
    }
    if (event.type === "execution.started") {
      executionIds.push({ value: event.payload.execution_id, path: `$.events[${eventIndex}].payload.execution_id` });
    }
  }
  addDuplicateIssues(idempotencyKeys, (value) => value.value, (index) => idempotencyKeys[index].path, "idempotency_key_duplicate", "Idempotency key", issues);
  addDuplicateIssues(approvalNonces, (value) => value.value, (index) => approvalNonces[index].path, "approval_nonce_reused", "Approval nonce", issues);
  addDuplicateIssues(executionIds, (value) => value.value, (index) => executionIds[index].path, "execution_id_duplicate", "Execution ID", issues);
}

function checkChainAndTime(ctx, issues) {
  const { run } = ctx;
  if (run.continuation?.prior_run_id === run.run_id) {
    pushIssue(issues, "continuation_self_reference", "$.continuation.prior_run_id", "A run cannot continue itself.");
  }
  if (run.source_handoff?.source_run_id === run.run_id) {
    pushIssue(issues, "handoff_self_reference", "$.source_handoff.source_run_id", "A run cannot receive its own handoff.");
  }
  if (compareTimestamp(run.created_at, run.updated_at) > 0) {
    pushIssue(issues, "run_time_order_invalid", "$.updated_at", "updated_at must not precede created_at.");
  }
  if (run.events.length > 0 && run.created_at !== run.events[0].at) {
    pushIssue(issues, "created_at_mismatch", "$.created_at", "created_at must equal the first event time.");
  }
  for (let index = 0; index < run.events.length; index += 1) {
    const event = run.events[index];
    const path = `$.events[${index}]`;
    if (event.sequence !== index + 1) {
      pushIssue(issues, "event_sequence_invalid", `${path}.sequence`, `Expected contiguous sequence ${index + 1}.`);
    }
    const expectedPrevious = index === 0 ? null : run.events[index - 1].id;
    if (event.previous_event_id !== expectedPrevious) {
      pushIssue(
        issues,
        "event_chain_invalid",
        `${path}.previous_event_id`,
        "The previous-event reference does not match the immediately preceding event.",
      );
    }
    if (index > 0 && compareTimestamp(event.at, run.events[index - 1].at) < 0) {
      pushIssue(issues, "event_time_order_invalid", `${path}.at`, "Event time must not precede the prior event time.");
    }
    if (compareTimestamp(event.at, run.created_at) < 0) {
      pushIssue(issues, "event_before_run", `${path}.at`, "An event cannot precede run creation.");
    }
    if (compareTimestamp(event.at, run.updated_at) > 0) {
      pushIssue(issues, "event_after_update", `${path}.at`, "An event cannot be later than run updated_at.");
    }
  }
  if (run.events.length > 0 && run.updated_at !== run.events.at(-1).at) {
    pushIssue(issues, "updated_at_mismatch", "$.updated_at", "updated_at must equal the final appended event time.");
  }
  for (const [index, evidence] of run.evidence.entries()) {
    if (evidence.observed_at !== undefined && compareTimestamp(evidence.observed_at, run.updated_at) > 0) {
      pushIssue(issues, "evidence_after_update", `$.evidence[${index}].observed_at`, "Evidence cannot be observed after run updated_at.");
    }
  }
}

function requireActor(ctx, id, path, issues) {
  if (!ctx.actors.has(id)) pushIssue(issues, "actor_reference_missing", path, "The referenced actor record is absent.");
}

function requireZone(ctx, id, path, issues) {
  if (!ctx.zones.has(id)) pushIssue(issues, "data_zone_reference_missing", path, "The referenced data-zone record is absent.");
}

function requireEvidence(ctx, id, path, issues, expectedKind) {
  const found = ctx.evidence.get(id);
  if (!found) {
    pushIssue(issues, "evidence_reference_missing", path, "The referenced evidence record is absent.");
  } else if (expectedKind && found.entry.kind !== expectedKind) {
    pushIssue(issues, "evidence_kind_mismatch", path, `Expected evidence kind ${expectedKind}, observed ${found.entry.kind}.`);
  }
}

function evidenceAtOrBefore(ctx, id, event, path, issues, code = "evidence_after_reference_event") {
  const found = ctx.evidence.get(id);
  if (found && compareTimestamp(found.entry.observed_at, event.at) > 0) {
    pushIssue(issues, code, path, "Referenced evidence was observed after the event that relies on it.");
  }
  return found?.entry ?? null;
}

function requireEvent(ctx, id, path, issues, expectedType, beforeEvent) {
  const found = ctx.events.get(id);
  if (!found) {
    pushIssue(issues, "event_reference_missing", path, "The referenced event is absent.");
    return null;
  }
  if (expectedType && found.event.type !== expectedType) {
    pushIssue(issues, "event_reference_type_mismatch", path, `Expected ${expectedType}, observed ${found.event.type}.`);
  }
  if (beforeEvent && found.event.sequence >= beforeEvent.sequence) {
    pushIssue(issues, "event_reference_not_prior", path, "A record may reference only an earlier event at this field.");
  }
  return found.event;
}

function requireZoneBinding(ctx, binding, path, issues) {
  const found = ctx.zones.get(binding.id);
  if (!found) {
    pushIssue(issues, "data_zone_reference_missing", path, "The bound data-zone record is absent.");
    return null;
  }
  if (!sameCanonical(binding, dataZoneProjection(found.zone))) {
    pushIssue(issues, "data_zone_binding_mismatch", path, "The bound data-zone projection differs from the top-level declaration.");
  }
  return found.zone;
}

function requireEvidenceBinding(ctx, binding, path, issues) {
  const found = ctx.evidence.get(binding.id);
  if (!found) {
    pushIssue(issues, "evidence_reference_missing", path, "The bound evidence record is absent.");
    return null;
  }
  const zone = ctx.zones.get(found.entry.data_zone_id)?.zone;
  if (!zone) {
    pushIssue(issues, "data_zone_reference_missing", `${path}.data_zone`, "The evidence data-zone record is absent.");
    return found.entry;
  }
  if (!sameCanonical(binding, evidenceProjection(found.entry, zone))) {
    pushIssue(issues, "evidence_binding_mismatch", path, "The bound evidence projection differs from the top-level evidence record.");
  }
  return found.entry;
}

function checkReferences(ctx, issues) {
  const { run } = ctx;
  requireZone(ctx, run.record_data_zone_id, "$.record_data_zone_id", issues);
  for (const [actorIndex, actor] of run.actors.entries()) {
    for (const [claimIndex, claim] of actor.identity_claims.entries()) {
      for (const [evidenceIndex, id] of claim.evidence_ids.entries()) {
        requireEvidence(ctx, id, `$.actors[${actorIndex}].identity_claims[${claimIndex}].evidence_ids[${evidenceIndex}]`, issues);
      }
    }
    if (actor.kind === "human_agent_pair") {
      for (const [memberIndex, member] of actor.pair_members.entries()) {
        requireActor(ctx, member.actor_id, `$.actors[${actorIndex}].pair_members[${memberIndex}].actor_id`, issues);
        if (member.actor_id === actor.id) {
          pushIssue(issues, "pair_self_member", `$.actors[${actorIndex}].pair_members[${memberIndex}].actor_id`, "A pair cannot list itself as a member.");
        }
        const memberActor = ctx.actors.get(member.actor_id)?.actor;
        if (["human", "agent"].includes(member.role) && memberActor?.kind !== member.role) {
          pushIssue(issues, "pair_member_role_mismatch", `$.actors[${actorIndex}].pair_members[${memberIndex}].role`, "A human or agent pair-member role must match the referenced actor kind.");
        }
      }
    }
  }
  for (const [zoneIndex, zone] of run.data_zones.entries()) {
    if (zone.audience.mode === "actors") {
      for (const [actorIndex, id] of zone.audience.actor_ids.entries()) {
        requireActor(ctx, id, `$.data_zones[${zoneIndex}].audience.actor_ids[${actorIndex}]`, issues);
      }
    }
  }
  for (const [evidenceIndex, entry] of run.evidence.entries()) {
    const path = `$.evidence[${evidenceIndex}]`;
    requireActor(ctx, entry.recorded_by_actor_id, `${path}.recorded_by_actor_id`, issues);
    requireZone(ctx, entry.data_zone_id, `${path}.data_zone_id`, issues);
    entry.consent_subject_actor_ids?.forEach((id, index) =>
      requireActor(ctx, id, `${path}.consent_subject_actor_ids[${index}]`, issues)
    );
    if (entry.action_scope) {
      if (entry.action_scope.run_id !== run.run_id) {
        pushIssue(issues, "evidence_action_scope_run_mismatch", `${path}.action_scope.run_id`, "The structured action scope must name this run.");
      }
      entry.action_scope.data_zone_ids.forEach((id, index) =>
        requireZone(ctx, id, `${path}.action_scope.data_zone_ids[${index}]`, issues)
      );
      entry.action_scope.expected_effect.affected_actor_ids.forEach((id, index) =>
        requireActor(ctx, id, `${path}.action_scope.expected_effect.affected_actor_ids[${index}]`, issues)
      );
    }
    if (entry.causal_scope) {
      if (entry.causal_scope.run_id !== run.run_id) {
        pushIssue(issues, "evidence_causal_scope_run_mismatch", `${path}.causal_scope.run_id`, "The structured causal scope must name this run.");
      }
      requireEvent(ctx, entry.causal_scope.proposal_event_id, `${path}.causal_scope.proposal_event_id`, issues, "action.proposed");
      requireEvent(ctx, entry.causal_scope.execution_event_id, `${path}.causal_scope.execution_event_id`, issues, "execution.started");
      requireEvent(ctx, entry.causal_scope.receipt_event_id, `${path}.causal_scope.receipt_event_id`, issues, "execution.receipt");
      entry.causal_scope.expected_effect.affected_actor_ids.forEach((id, index) =>
        requireActor(ctx, id, `${path}.causal_scope.expected_effect.affected_actor_ids[${index}]`, issues)
      );
    }
  }

  for (const [eventIndex, event] of run.events.entries()) {
    const payload = event.payload;
    const path = `$.events[${eventIndex}]`;
    requireActor(ctx, event.actor_id, `${path}.actor_id`, issues);
    switch (event.type) {
      case "work.offered":
        payload.offered_to_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.offered_to_actor_ids[${index}]`, issues));
        payload.affected_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.affected_actor_ids[${index}]`, issues));
        payload.data_zone_ids.forEach((id, index) => requireZone(ctx, id, `${path}.payload.data_zone_ids[${index}]`, issues));
        break;
      case "work.accepted":
      case "work.declined":
        requireEvent(ctx, payload.offer_event_id, `${path}.payload.offer_event_id`, issues, "work.offered", event);
        break;
      case "work.handed_off":
        payload.to_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.to_actor_ids[${index}]`, issues));
        payload.plan_event_ids.forEach((id, index) => requireEvent(ctx, id, `${path}.payload.plan_event_ids[${index}]`, issues, "plan.proposed", event));
        payload.authority_claims.forEach((reference, index) => requireEvent(ctx, reference.event_id, `${path}.payload.authority_claims[${index}].event_id`, issues, "authority.claimed", event));
        payload.evidence.forEach((binding, index) => {
          requireEvidenceBinding(ctx, binding, `${path}.payload.evidence[${index}]`, issues);
          evidenceAtOrBefore(ctx, binding.id, event, `${path}.payload.evidence[${index}].observed_at`, issues);
        });
        payload.data_zones.forEach((binding, index) => requireZoneBinding(ctx, binding, `${path}.payload.data_zones[${index}]`, issues));
        break;
      case "work.asked":
        payload.to_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.to_actor_ids[${index}]`, issues));
        requireZone(ctx, payload.data_zone_id, `${path}.payload.data_zone_id`, issues);
        break;
      case "plan.proposed":
        if (payload.supersedes_plan_event_id !== undefined) {
          requireEvent(ctx, payload.supersedes_plan_event_id, `${path}.payload.supersedes_plan_event_id`, issues, "plan.proposed", event);
        }
        break;
      case "authority.claimed": {
        const binding = payload.binding;
        requireActor(ctx, binding.claimant_actor_id, `${path}.payload.binding.claimant_actor_id`, issues);
        requireActor(ctx, binding.executor_actor_id, `${path}.payload.binding.executor_actor_id`, issues);
        binding.data_zones.forEach((zone, index) => requireZoneBinding(ctx, zone, `${path}.payload.binding.data_zones[${index}]`, issues));
        binding.bases.forEach((basis, basisIndex) => {
          basis.subject_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.binding.bases[${basisIndex}].subject_actor_ids[${index}]`, issues));
          basis.evidence.forEach((evidence, index) => {
            requireEvidenceBinding(ctx, evidence, `${path}.payload.binding.bases[${basisIndex}].evidence[${index}]`, issues);
            evidenceAtOrBefore(
              ctx,
              evidence.id,
              event,
              `${path}.payload.binding.bases[${basisIndex}].evidence[${index}].observed_at`,
              issues,
              "authority_evidence_after_claim",
            );
          });
        });
        break;
      }
      case "authority.withdrawn":
        requireEvent(ctx, payload.authority_claim_event_id, `${path}.payload.authority_claim_event_id`, issues, "authority.claimed", event);
        break;
      case "action.proposed": {
        const binding = payload.binding;
        const plan = requireEvent(ctx, binding.plan_event_id, `${path}.payload.binding.plan_event_id`, issues, "plan.proposed", event);
        if (plan && !plan.payload.steps.some((step) => step.id === binding.plan_step_id)) {
          pushIssue(issues, "plan_step_reference_missing", `${path}.payload.binding.plan_step_id`, "The referenced plan does not contain this step ID.");
        }
        requireActor(ctx, binding.executor_actor_id, `${path}.payload.binding.executor_actor_id`, issues);
        binding.recipient_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.binding.recipient_actor_ids[${index}]`, issues));
        binding.data_zones.forEach((zone, index) => requireZoneBinding(ctx, zone, `${path}.payload.binding.data_zones[${index}]`, issues));
        binding.expected_effect.affected_actor_ids.forEach((id, index) => requireActor(ctx, id, `${path}.payload.binding.expected_effect.affected_actor_ids[${index}]`, issues));
        binding.inputs.forEach((input, inputIndex) => {
          requireZone(ctx, input.data_zone_id, `${path}.payload.binding.inputs[${inputIndex}].data_zone_id`, issues);
        });
        binding.authority_claims.forEach((reference, index) => requireEvent(ctx, reference.event_id, `${path}.payload.binding.authority_claims[${index}].event_id`, issues, "authority.claimed", event));
        binding.required_approvals.forEach((approval, index) => requireActor(ctx, approval.actor_id, `${path}.payload.binding.required_approvals[${index}].actor_id`, issues));
        if (binding.license.state === "reviewed") {
          requireActor(ctx, binding.license.reviewed_by_actor_id, `${path}.payload.binding.license.reviewed_by_actor_id`, issues);
          binding.license.review_evidence.forEach((evidence, index) => {
            requireEvidenceBinding(ctx, evidence, `${path}.payload.binding.license.review_evidence[${index}]`, issues);
            evidenceAtOrBefore(ctx, evidence.id, event, `${path}.payload.binding.license.review_evidence[${index}].observed_at`, issues);
          });
        }
        for (const [termIndex, term] of binding.license.terms?.entries?.() ?? []) {
          if (compareTimestamp(term.observed_at, event.at) > 0) {
            pushIssue(issues, "license_terms_after_proposal", `${path}.payload.binding.license.terms[${termIndex}].observed_at`, "Declared license terms must have been observed no later than the proposal event.");
          }
        }
        break;
      }
      case "action.rejected":
        requireEvent(ctx, payload.proposal_event_id, `${path}.payload.proposal_event_id`, issues, "action.proposed", event);
        requireActor(ctx, payload.rejected_by_actor_id, `${path}.payload.rejected_by_actor_id`, issues);
        break;
      case "execution.approved":
        requireEvent(ctx, payload.proposal_event_id, `${path}.payload.proposal_event_id`, issues, "action.proposed", event);
        requireActor(ctx, payload.approver_actor_id, `${path}.payload.approver_actor_id`, issues);
        break;
      case "execution.started":
        requireEvent(ctx, payload.proposal_event_id, `${path}.payload.proposal_event_id`, issues, "action.proposed", event);
        payload.approval_event_ids.forEach((id, index) => requireEvent(ctx, id, `${path}.payload.approval_event_ids[${index}]`, issues, "execution.approved", event));
        payload.authority_claim_event_ids.forEach((id, index) => requireEvent(ctx, id, `${path}.payload.authority_claim_event_ids[${index}]`, issues, "authority.claimed", event));
        requireActor(ctx, payload.executor_actor_id, `${path}.payload.executor_actor_id`, issues);
        break;
      case "execution.receipt":
        requireEvent(ctx, payload.execution_event_id, `${path}.payload.execution_event_id`, issues, "execution.started", event);
        requireEvent(ctx, payload.proposal_event_id, `${path}.payload.proposal_event_id`, issues, "action.proposed", event);
        payload.provider_receipt_evidence_ids.forEach((id, index) => {
          requireEvidence(ctx, id, `${path}.payload.provider_receipt_evidence_ids[${index}]`, issues, "provider_receipt");
          evidenceAtOrBefore(ctx, id, event, `${path}.payload.provider_receipt_evidence_ids[${index}]`, issues);
        });
        break;
      case "effect.observed":
        requireEvent(ctx, payload.execution_event_id, `${path}.payload.execution_event_id`, issues, "execution.started", event);
        requireEvent(ctx, payload.receipt_event_id, `${path}.payload.receipt_event_id`, issues, "execution.receipt", event);
        requireEvent(ctx, payload.proposal_event_id, `${path}.payload.proposal_event_id`, issues, "action.proposed", event);
        payload.evidence_ids.forEach((id, index) => {
          requireEvidence(ctx, id, `${path}.payload.evidence_ids[${index}]`, issues, "observation");
          evidenceAtOrBefore(ctx, id, event, `${path}.payload.evidence_ids[${index}]`, issues);
        });
        payload.causal_claim.evidence_ids.forEach((id, index) => {
          requireEvidence(ctx, id, `${path}.payload.causal_claim.evidence_ids[${index}]`, issues);
          evidenceAtOrBefore(ctx, id, event, `${path}.payload.causal_claim.evidence_ids[${index}]`, issues);
        });
        break;
      case "correction.appended":
      case "appeal.appended":
        payload.target_event_ids.forEach((id, index) => requireEvent(ctx, id, `${path}.payload.target_event_ids[${index}]`, issues, undefined, event));
        payload.evidence_ids.forEach((id, index) => {
          requireEvidence(ctx, id, `${path}.payload.evidence_ids[${index}]`, issues);
          evidenceAtOrBefore(ctx, id, event, `${path}.payload.evidence_ids[${index}]`, issues);
        });
        break;
      default:
        break;
    }
  }
}

function decimalParts(value) {
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}

function compareDecimal(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  const av = a.coefficient * (10n ** BigInt(scale - a.scale));
  const bv = b.coefficient * (10n ** BigInt(scale - b.scale));
  return av < bv ? -1 : av > bv ? 1 : 0;
}

function sumDecimals(values) {
  const parsed = values.map(decimalParts);
  const scale = Math.max(0, ...parsed.map((value) => value.scale));
  const coefficient = parsed.reduce(
    (total, value) => total + value.coefficient * (10n ** BigInt(scale - value.scale)),
    0n,
  );
  return { coefficient, scale };
}

function compareDecimalSum(values, ceiling) {
  const sum = sumDecimals(values);
  const limit = decimalParts(ceiling);
  const scale = Math.max(sum.scale, limit.scale);
  const actual = sum.coefficient * (10n ** BigInt(scale - sum.scale));
  const maximum = limit.coefficient * (10n ** BigInt(scale - limit.scale));
  return actual < maximum ? -1 : actual > maximum ? 1 : 0;
}

function checkPlanGraph(event, eventIndex, issues) {
  const steps = event.payload.steps;
  const ids = new Set(steps.map(({ id }) => id));
  for (const [stepIndex, step] of steps.entries()) {
    for (const [dependencyIndex, dependency] of step.depends_on.entries()) {
      const path = `$.events[${eventIndex}].payload.steps[${stepIndex}].depends_on[${dependencyIndex}]`;
      if (!ids.has(dependency)) {
        pushIssue(issues, "plan_dependency_missing", path, "The referenced plan dependency is absent.");
      } else if (dependency === step.id) {
        pushIssue(issues, "plan_dependency_self", path, "A plan step cannot depend on itself.");
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(steps.map((step) => [step.id, step]));
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const step = byId.get(id);
    for (const dependency of step?.depends_on ?? []) {
      if (byId.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  if (steps.some(({ id }) => visit(id))) {
    pushIssue(issues, "plan_dependency_cycle", `$.events[${eventIndex}].payload.steps`, "Plan dependencies must form an acyclic graph.");
  }
}

function checkLimitsAndPlans(ctx, issues) {
  const { run } = ctx;
  if (run.events.length > run.limits.max_events) {
    pushIssue(issues, "event_limit_exceeded", "$.events", `Observed ${run.events.length} events; the run declared at most ${run.limits.max_events}.`);
  }

  for (const [index, event] of run.events.entries()) {
    if (event.type === "plan.proposed") {
      if (event.payload.steps.length > run.limits.max_plan_steps) {
        pushIssue(
          issues,
          "plan_step_limit_exceeded",
          `$.events[${index}].payload.steps`,
          `Observed ${event.payload.steps.length} plan steps; the run declared at most ${run.limits.max_plan_steps}.`,
        );
      }
      checkPlanGraph(event, index, issues);
    }
  }

  const proposals = new Map(
    (ctx.byType.get("action.proposed") ?? []).map((event) => [event.id, event]),
  );
  const starts = ctx.byType.get("execution.started") ?? [];
  if (starts.length > run.limits.max_external_effects) {
    pushIssue(
      issues,
      "external_effect_limit_exceeded",
      "$.limits.max_external_effects",
      `Observed ${starts.length} external execution starts; the run declared at most ${run.limits.max_external_effects}.`,
    );
  }

  const startsByProposal = new Map();
  for (const event of starts) {
    const values = startsByProposal.get(event.payload.proposal_event_id) ?? [];
    values.push(event);
    startsByProposal.set(event.payload.proposal_event_id, values);
  }
  for (const [proposalId, values] of startsByProposal) {
    if (values.length > run.limits.max_attempts_per_action) {
      const found = ctx.events.get(proposalId);
      pushIssue(
        issues,
        "action_attempt_limit_exceeded",
        found ? `$.events[${found.index}].payload.binding.retry_policy.max_attempts` : "$.limits.max_attempts_per_action",
        `One proposal was started ${values.length} times; the declared limit is ${run.limits.max_attempts_per_action}.`,
      );
    }
  }

  const terminal = ctx.events.get(run.terminal_event_id)?.event;
  if (terminal && terminal.sequence > run.limits.max_events - run.limits.repair_event_reserve) {
    pushIssue(issues, "repair_reserve_consumed", "$.limits.repair_event_reserve", "The terminal event must leave the declared repair-event reserve unused.");
  }
  if (elapsedExceeds(run.created_at, run.updated_at, run.limits.max_elapsed_ms)) {
    pushIssue(issues, "elapsed_limit_exceeded", "$.limits.max_elapsed_ms", "The final appended event occurs after the declared maximum elapsed time.");
  }
  if (compareTimestamp(run.limits.expires_at, run.created_at) <= 0
    || elapsedExceeds(run.created_at, run.limits.expires_at, MAX_PROFILE_ELAPSED_MS)) {
    pushIssue(issues, "run_expiry_invalid", "$.limits.expires_at", "Run expiry must follow creation and remain within the seven-day profile ceiling.");
  }
  if (terminal && terminal.type !== "work.expired" && compareTimestamp(terminal.at, run.limits.expires_at) > 0) {
    pushIssue(issues, "terminal_after_expiry", `$.events[${ctx.events.get(terminal.id).index}].at`, "A non-expiry terminal event cannot occur after the run expiry.");
  }
  for (const [index, event] of run.events.entries()) {
    if (event.type === "execution.started" && compareTimestamp(event.at, run.limits.expires_at) >= 0) {
      pushIssue(issues, "execution_after_expiry", `$.events[${index}].at`, "An execution must begin before the run expires.");
    }
  }

  const ceiling = run.limits.cost_ceiling;
  const receipts = ctx.byType.get("execution.receipt") ?? [];
  if (ceiling.state === "known") {
    const known = [];
    for (const receipt of receipts) {
      const cost = receipt.payload.actual_cost;
      const index = ctx.events.get(receipt.id).index;
      if (cost.state !== "known") {
        pushIssue(issues, "actual_cost_unresolved", `$.events[${index}].payload.actual_cost`, "A known run cost ceiling requires a known actual cost for every invocation receipt.");
      } else if (cost.unit !== ceiling.unit) {
        pushIssue(issues, "actual_cost_unit_mismatch", `$.events[${index}].payload.actual_cost.unit`, "The actual-cost unit differs from the run ceiling unit.");
      } else {
        known.push(cost.amount);
      }
    }
    if (known.length === receipts.length && compareDecimalSum(known, ceiling.maximum_amount) > 0) {
      pushIssue(issues, "cost_ceiling_exceeded", "$.limits.cost_ceiling.maximum_amount", "The sum of actual invocation costs exceeds the declared run ceiling.");
    }
    for (const proposal of proposals.values()) {
      const cost = proposal.payload.binding.cost;
      const index = ctx.events.get(proposal.id).index;
      if (cost.state === "known" && (cost.unit !== ceiling.unit || compareDecimal(cost.maximum_amount, ceiling.maximum_amount) > 0)) {
        pushIssue(issues, "proposal_cost_exceeds_ceiling", `$.events[${index}].payload.binding.cost`, "The proposal's disclosed maximum cost is outside the run cost ceiling.");
      }
    }
  }
}

function eventBefore(ctx, type, sequence) {
  return (ctx.byType.get(type) ?? []).some((event) => event.sequence < sequence);
}

function offeredChoiceForEvent(event) {
  if (event.type === "work.declined") return "decline";
  if (event.type === "work.handed_off") return "handoff";
  if (event.type === "work.asked") return "ask";
  if (event.type === "work.cancelled") return "cancel";
  if (event.type === "work.paused") return event.payload.kind;
  return null;
}

function checkState(ctx, issues) {
  const { run } = ctx;
  const recordZone = ctx.zones.get(run.record_data_zone_id)?.zone;
  if (recordZone) {
    for (const id of declaredZoneIds(ctx)) {
      const boundary = ctx.zones.get(id)?.zone;
      if (!boundary || boundary.classification === "public") continue;
      if (CLASSIFICATION_RANK[recordZone.classification] < CLASSIFICATION_RANK[boundary.classification]) {
        pushIssue(issues, "record_zone_classification_too_broad", "$.record_data_zone_id", "The whole-record data zone is less restrictive than a protected data zone declared in the document.");
      }
      if (!audienceNoBroader(recordZone.audience, boundary.audience)) {
        pushIssue(issues, "record_zone_audience_too_broad", "$.record_data_zone_id", "The whole-record audience is broader than a protected data zone declared in the document.");
      }
      if (!retentionNoLonger(recordZone.retention, boundary.retention)) {
        pushIssue(issues, "record_zone_retention_too_long", "$.record_data_zone_id", "The whole-record retention is longer than or not safely comparable with a protected data zone declared in the document.");
      }
    }
  }
  const offers = ctx.byType.get("work.offered") ?? [];
  if (offers.length !== 1 || run.events[0]?.type !== "work.offered") {
    pushIssue(issues, "offer_state_invalid", "$.events", "A finite run must begin with exactly one work.offered event.");
  }
  const accepted = ctx.byType.get("work.accepted") ?? [];
  if (accepted.length > 1) {
    pushIssue(issues, "acceptance_duplicate", "$.events", "A run may contain at most one work.accepted event.");
  }
  if (accepted.length > 0 && (ctx.byType.get("work.declined") ?? []).length > 0) {
    pushIssue(issues, "acceptance_decline_conflict", "$.events", "One finite run cannot record both acceptance and terminal decline.");
  }
  for (const [index, event] of run.events.entries()) {
    if (["plan.proposed", "authority.claimed", "action.proposed", "execution.approved", "execution.started"].includes(event.type)
      && !eventBefore(ctx, "work.accepted", event.sequence)) {
      pushIssue(issues, "event_before_acceptance", `$.events[${index}]`, `${event.type} requires an earlier work.accepted event.`);
    }
    if (event.type === "action.proposed" && !eventBefore(ctx, "plan.proposed", event.sequence)) {
      pushIssue(issues, "action_before_plan", `$.events[${index}]`, "An action proposal requires an earlier plan.");
    }
    if (event.type === "action.proposed") {
      const binding = event.payload.binding;
      const boundZoneIds = binding.data_zones.map(({ id }) => id);
      if (binding.expected_effect.target !== binding.target) {
        pushIssue(issues, "expected_effect_target_mismatch", `$.events[${index}].payload.binding.expected_effect.target`, "The expected-effect target must equal the proposed action target.");
      }
      for (const [inputIndex, input] of binding.inputs.entries()) {
        if (!boundZoneIds.includes(input.data_zone_id)) {
          pushIssue(issues, "input_data_zone_out_of_scope", `$.events[${index}].payload.binding.inputs[${inputIndex}].data_zone_id`, "Every input data zone must be included in the action binding's data zones.");
        }
        const zone = ctx.zones.get(input.data_zone_id)?.zone;
        if (zone?.audience.mode === "actors") {
          for (const recipient of binding.recipient_actor_ids) {
            if (!zone.audience.actor_ids.includes(recipient)) {
              pushIssue(issues, "recipient_out_of_data_zone_audience", `$.events[${index}].payload.binding.recipient_actor_ids`, "Every action recipient must be included in every input data zone's declared audience.");
            }
          }
        }
        if (input.kind === "literal" && zone
          && !["public", "internal"].includes(zone.classification)) {
          pushIssue(issues, "literal_protected_data", `$.events[${index}].payload.binding.inputs[${inputIndex}]`, "Confidential or restricted input must be externalized as an artifact or credential reference.");
        }
        if (input.kind === "literal" && looksLikeCredential(input.name, input.value)) {
          pushIssue(issues, "credential_literal_forbidden", `$.events[${index}].payload.binding.inputs[${inputIndex}]`, "A literal input resembles credential material; use a separately authorized credential reference.");
        }
        if (input.kind === "credential_ref" && unsafeCredentialReference(input.ref)) {
          pushIssue(issues, "credential_ref_secret_forbidden", `$.events[${index}].payload.binding.inputs[${inputIndex}].ref`, "A credential reference must be an opaque broker identifier without secret material, URI user information, a query, or a fragment.");
        }
      }
    }
    if (event.type === "work.accepted") {
      const offer = ctx.events.get(event.payload.offer_event_id)?.event;
      if (offer && !offer.payload.offered_to_actor_ids.includes(event.actor_id)) {
        pushIssue(issues, "acceptor_not_offered", `$.events[${index}].actor_id`, "The accepting actor was not among the offer recipients.");
      }
    }
    const choice = offeredChoiceForEvent(event);
    if (choice) {
      const offer = offers[0];
      const acceptance = accepted[0];
      if (!acceptance || event.sequence < acceptance.sequence) {
        if (offer && !offer.payload.exit_options.includes(choice)) {
          pushIssue(issues, "choice_not_advertised", `$.events[${index}]`, "This pre-acceptance participant choice was not advertised by the offer.");
        }
        if (offer && !offer.payload.offered_to_actor_ids.includes(event.actor_id)) {
          pushIssue(issues, "choice_actor_not_offered", `$.events[${index}].actor_id`, "Only an offered participant may record a pre-acceptance offer choice.");
        }
      } else if (event.actor_id !== acceptance.actor_id) {
        pushIssue(issues, "choice_actor_not_participant", `$.events[${index}].actor_id`, "A post-acceptance participant choice must be recorded by the actor that accepted the work.");
      }
    }
  }
  if ((ctx.byType.get("work.declined") ?? []).length > 0 && (ctx.byType.get("execution.started") ?? []).length > 0) {
    pushIssue(issues, "execution_after_decline", "$.events", "A declined run cannot contain an execution start.");
  }
  for (const [index, start] of run.events.entries()) {
    if (start.type !== "execution.started") continue;
    const rejected = (ctx.byType.get("action.rejected") ?? []).some((candidate) =>
      candidate.sequence < start.sequence
      && candidate.payload.proposal_event_id === start.payload.proposal_event_id
    );
    if (rejected) {
      pushIssue(issues, "execution_after_rejection", `$.events[${index}]`, "A rejected proposal cannot be executed.");
    }
  }
}

function bindingDigestOrIssue(binding, digestFunction, path, code, issues) {
  try {
    return digestFunction(binding);
  } catch (error) {
    pushIssue(issues, code, path, `The binding cannot be canonicalized: ${error?.message || error}.`);
    return null;
  }
}

function checkDigests(ctx, issues) {
  const { run } = ctx;
  for (const [index, event] of run.events.entries()) {
    const path = `$.events[${index}].payload`;
    if (event.type === "authority.claimed") {
      const binding = event.payload.binding;
      const digest = bindingDigestOrIssue(binding, authorityClaimDigest, `${path}.binding`, "authority_binding_not_canonical", issues);
      if (digest !== null && digest !== event.payload.claim_digest) {
        pushIssue(issues, "authority_digest_mismatch", `${path}.claim_digest`, "The authority digest does not match the canonical binding.");
      }
      if (binding.run_id !== run.run_id) {
        pushIssue(issues, "authority_run_mismatch", `${path}.binding.run_id`, "The authority binding must name this run.");
      }
      if (binding.claim_event_id !== event.id) {
        pushIssue(issues, "authority_event_mismatch", `${path}.binding.claim_event_id`, "The authority binding must name its containing event.");
      }
      if (binding.claimant_actor_id !== event.actor_id) {
        pushIssue(issues, "authority_claimant_mismatch", `${path}.binding.claimant_actor_id`, "The binding claimant must be the event actor.");
      }
    }
    if (event.type === "action.proposed") {
      const binding = event.payload.binding;
      const digest = bindingDigestOrIssue(binding, actionProposalDigest, `${path}.binding`, "action_binding_not_canonical", issues);
      if (digest !== null && digest !== event.payload.proposal_digest) {
        pushIssue(issues, "proposal_digest_mismatch", `${path}.proposal_digest`, "The proposal digest does not match the canonical binding.");
      }
      if (binding.run_id !== run.run_id) {
        pushIssue(issues, "proposal_run_mismatch", `${path}.binding.run_id`, "The action binding must name this run.");
      }
      if (binding.proposal_event_id !== event.id) {
        pushIssue(issues, "proposal_event_mismatch", `${path}.binding.proposal_event_id`, "The action binding must name its containing event.");
      }
      for (const [referenceIndex, reference] of binding.authority_claims.entries()) {
        const authority = ctx.events.get(reference.event_id)?.event;
        if (authority?.type === "authority.claimed" && authority.payload.claim_digest !== reference.digest) {
          pushIssue(issues, "authority_reference_digest_mismatch", `${path}.binding.authority_claims[${referenceIndex}].digest`, "The action binding does not carry the referenced authority claim digest.");
        }
      }
    }
    if (event.type === "authority.withdrawn") {
      const authority = ctx.events.get(event.payload.authority_claim_event_id)?.event;
      if (authority?.type === "authority.claimed" && authority.payload.claim_digest !== event.payload.claim_digest) {
        pushIssue(issues, "withdrawal_digest_mismatch", `${path}.claim_digest`, "The withdrawal does not carry the referenced authority claim digest.");
      }
    }
    if (event.type === "work.handed_off") {
      for (const [referenceIndex, reference] of event.payload.authority_claims.entries()) {
        const authority = ctx.events.get(reference.event_id)?.event;
        if (authority?.type === "authority.claimed" && authority.payload.claim_digest !== reference.digest) {
          pushIssue(issues, "handoff_authority_digest_mismatch", `${path}.authority_claims[${referenceIndex}].digest`, "The handoff does not carry the exact referenced authority-claim digest.");
        }
      }
    }
    if (["action.rejected", "execution.approved", "execution.started", "execution.receipt", "effect.observed"].includes(event.type)) {
      const proposal = ctx.events.get(event.payload.proposal_event_id)?.event;
      if (proposal?.type === "action.proposed" && proposal.payload.proposal_digest !== event.payload.proposal_digest) {
        pushIssue(issues, "downstream_proposal_digest_mismatch", `${path}.proposal_digest`, "The record does not carry the exact referenced proposal digest.");
      }
    }
  }
}

function authorityWithdrawnBefore(ctx, authorityEventId, sequence) {
  return (ctx.byType.get("authority.withdrawn") ?? []).some((event) =>
    event.sequence < sequence && event.payload.authority_claim_event_id === authorityEventId
  );
}

function checkAuthority(ctx, issues) {
  for (const [index, event] of ctx.run.events.entries()) {
    if (event.type === "authority.claimed") {
      const binding = event.payload.binding;
      if (compareTimestamp(binding.valid_from, binding.expires_at) >= 0) {
        pushIssue(issues, "authority_time_range_invalid", `$.events[${index}].payload.binding.expires_at`, "Authority expiry must be later than valid_from.");
      }
      for (const [basisIndex, basis] of binding.bases.entries()) {
        const path = `$.events[${index}].payload.binding.bases[${basisIndex}]`;
        if (basis.outcome === "pass" && basis.evidence_state === "none") {
          pushIssue(issues, "authority_pass_without_claim", path, "A passing authority basis cannot have evidence_state none.");
        }
        for (const evidence of basis.evidence) {
          if (compareTimestamp(evidence.observed_at, event.at) > 0) {
            pushIssue(issues, "authority_evidence_after_claim", path, "Authority evidence must have been observed no later than the claim event.");
          }
        }
      }
    }
    if (event.type === "authority.withdrawn") {
      const authority = ctx.events.get(event.payload.authority_claim_event_id)?.event;
      if (authority?.type === "authority.claimed") {
        if (event.actor_id !== authority.payload.binding.claimant_actor_id) {
          pushIssue(issues, "withdrawal_actor_mismatch", `$.events[${index}].actor_id`, "Only the recorded claimant may append this authority withdrawal.");
        }
        if (!authority.payload.binding.revocable) {
          pushIssue(issues, "withdrawal_not_revocable", `$.events[${index}].payload.authority_claim_event_id`, "The referenced authority claim is recorded as non-revocable.");
        }
      }
    }
    if (event.type !== "execution.started") continue;
    const path = `$.events[${index}].payload`;
    const proposal = ctx.events.get(event.payload.proposal_event_id)?.event;
    if (proposal?.type !== "action.proposed") continue;
    const action = proposal.payload.binding;
    if (event.actor_id !== event.payload.executor_actor_id || event.payload.executor_actor_id !== action.executor_actor_id) {
      pushIssue(issues, "execution_actor_mismatch", `${path}.executor_actor_id`, "The start event actor, execution actor, and proposal executor must be the same actor.");
    }
    if (ctx.actors.get(action.executor_actor_id)?.actor.kind === "human_agent_pair") {
      pushIssue(issues, "pair_execution_unsupported", `${path}.executor_actor_id`, "A human-agent pair does not merge member authority and cannot be the recorded executor in Work 0.1.");
    }
    if (action.license.state === "unknown") {
      pushIssue(issues, "license_unknown_at_execution", `$.events[${ctx.events.get(proposal.id).index}].payload.binding.license`, "A recorded action start cannot rely on an unknown license disclosure.");
    }
    const proposalAuthorityIds = action.authority_claims.map(({ event_id }) => event_id);
    if (!sameMembers(event.payload.authority_claim_event_ids, proposalAuthorityIds)) {
      pushIssue(issues, "execution_authority_set_mismatch", `${path}.authority_claim_event_ids`, "Execution authority IDs must exactly match the authority claims bound into the proposal.");
    }
    for (const [authorityIndex, reference] of action.authority_claims.entries()) {
      const authority = ctx.events.get(reference.event_id)?.event;
      if (authority?.type !== "authority.claimed") continue;
      const binding = authority.payload.binding;
      const authorityPath = `$.events[${index}].payload.authority_claim_event_ids[${authorityIndex}]`;
      if (ctx.actors.get(binding.claimant_actor_id)?.actor.kind === "human_agent_pair") {
        pushIssue(issues, "pair_authority_unsupported", authorityPath, "A human-agent pair does not merge member authority and cannot supply an execution authority claim in Work 0.1.");
      }
      if (!binding.revocable) {
        pushIssue(issues, "non_revocable_authority_at_execution", authorityPath, "A non-revocable authority claim cannot authorize an execution start in Work 0.1.");
      }
      if (!binding.bases.some((basis) => basis.outcome === "pass")) {
        pushIssue(issues, "authority_positive_basis_missing", authorityPath, "An execution authority claim needs at least one applicable passing basis.");
      }
      if (binding.executor_actor_id !== action.executor_actor_id) {
        pushIssue(issues, "authority_executor_mismatch", authorityPath, "The authority claim names a different executor.");
      }
      if (binding.purpose !== action.purpose) {
        pushIssue(issues, "authority_purpose_mismatch", authorityPath, "The authority purpose must exactly match the action purpose.");
      }
      if (!binding.operations.includes(action.operation)) {
        pushIssue(issues, "authority_operation_mismatch", authorityPath, "The authority claim does not include the proposed operation.");
      }
      if (!binding.resources.includes(action.target)) {
        pushIssue(issues, "authority_resource_mismatch", authorityPath, "The authority claim does not include the proposed target.");
      }
      const actionZoneIds = action.data_zones.map(({ id }) => id);
      const authorityZoneIds = binding.data_zones.map(({ id }) => id);
      if (!actionZoneIds.every((id) => authorityZoneIds.includes(id))) {
        pushIssue(issues, "authority_data_zone_mismatch", authorityPath, "The authority claim does not cover every action data zone.");
      }
      if (compareTimestamp(event.at, binding.valid_from) < 0 || compareTimestamp(event.at, binding.expires_at) >= 0) {
        pushIssue(issues, "authority_inactive", authorityPath, "The authority claim is not active at execution start.");
      }
      if (authorityWithdrawnBefore(ctx, authority.id, event.sequence)) {
        pushIssue(issues, "authority_withdrawn", authorityPath, "The authority claim was withdrawn before execution.");
      }
      for (const basis of binding.bases) {
        if (basis.kind === "affected_party_consent"
          && !sameMembers(basis.subject_actor_ids, action.expected_effect.affected_actor_ids)) {
          pushIssue(issues, "consent_subject_set_mismatch", authorityPath, "The affected-party consent basis must name exactly the actors declared as affected by the action.");
        }
        if (basis.kind === "affected_party_consent" && basis.outcome === "pass"
          && basis.evidence.some((entry) => entry.kind !== "consent_record")) {
          pushIssue(issues, "consent_evidence_kind_mismatch", authorityPath, "A passing affected-party consent basis may use only consent-record evidence.");
        }
        if (basis.kind === "affected_party_consent" && basis.outcome === "pass") {
          const expectedScope = actionScope(ctx.run, action);
          for (const evidenceBinding of basis.evidence) {
            const evidence = ctx.evidence.get(evidenceBinding.id)?.entry;
            if (!evidence) continue;
            if (!sameMembers(evidence.consent_subject_actor_ids ?? [], action.expected_effect.affected_actor_ids)) {
              pushIssue(issues, "consent_evidence_subject_mismatch", authorityPath, "Consent evidence must bind exactly the action's affected actors.");
            }
            if (!evidence.action_scope || !sameCanonical(evidence.action_scope, expectedScope)) {
              pushIssue(issues, "consent_evidence_scope_mismatch", authorityPath, "Consent evidence must bind the exact run, purpose, operation, target, data zones, and expected effect.");
            }
          }
        }
        if (!["pass", "not_applicable"].includes(basis.outcome)) {
          pushIssue(issues, "authority_basis_unresolved", authorityPath, "Every authority basis must be recorded as pass or not_applicable before an execution start.");
        }
        if (basis.outcome === "pass"
          && (!["tested", "attested"].includes(basis.evidence_state) || basis.evidence.length === 0)) {
          pushIssue(issues, "asserted_authority_at_execution", authorityPath, "A passing authority basis must carry tested or attested evidence before an execution start.");
        }
      }
    }
  }
}

function checkApprovals(ctx, issues) {
  const approvalUse = new Map();
  const startsByProposal = new Map();
  const approvalKeys = new Map();
  for (const [index, event] of ctx.run.events.entries()) {
    if (event.type === "execution.approved") {
      const proposal = ctx.events.get(event.payload.proposal_event_id)?.event;
      if (proposal?.type !== "action.proposed") continue;
      const required = proposal.payload.binding.required_approvals.filter((entry) =>
        entry.actor_id === event.payload.approver_actor_id && entry.nonce === event.payload.nonce
      );
      const approvalKey = `${event.payload.proposal_event_id}\u0000${event.payload.approver_actor_id}\u0000${event.payload.nonce}`;
      if (approvalKeys.has(approvalKey)) {
        pushIssue(issues, "approval_duplicate", `$.events[${index}].payload`, "This exact proposal, actor, and nonce were already approved by an earlier event.");
      } else {
        approvalKeys.set(approvalKey, event.id);
      }
      if (event.actor_id !== event.payload.approver_actor_id) {
        pushIssue(issues, "approval_actor_mismatch", `$.events[${index}].payload.approver_actor_id`, "The approval event actor must be the named approver.");
      }
      if (ctx.actors.get(event.payload.approver_actor_id)?.actor.kind === "human_agent_pair") {
        pushIssue(issues, "pair_approval_unsupported", `$.events[${index}].payload.approver_actor_id`, "A human-agent pair does not merge member authority and cannot be the recorded approver in Work 0.1.");
      }
      if (required.length !== 1) {
        pushIssue(issues, "approval_not_requested", `$.events[${index}].payload`, "The proposal does not contain this exact approver and nonce request.");
      } else if (compareTimestamp(event.at, required[0].expires_at) >= 0) {
        pushIssue(issues, "approval_expired", `$.events[${index}].at`, "The approval was recorded at or after its bound expiry.");
      }
    }
    if (event.type !== "execution.started") continue;
    const proposal = ctx.events.get(event.payload.proposal_event_id)?.event;
    if (proposal?.type !== "action.proposed") continue;
    const starts = startsByProposal.get(proposal.id) ?? [];
    starts.push(event);
    startsByProposal.set(proposal.id, starts);
    const required = proposal.payload.binding.required_approvals;
    const observed = [];
    for (const [approvalIndex, approvalId] of event.payload.approval_event_ids.entries()) {
      const approval = ctx.events.get(approvalId)?.event;
      if (approval?.type !== "execution.approved") continue;
      const path = `$.events[${index}].payload.approval_event_ids[${approvalIndex}]`;
      observed.push({ actor_id: approval.payload.approver_actor_id, nonce: approval.payload.nonce });
      if (approval.payload.proposal_event_id !== proposal.id
        || approval.payload.proposal_digest !== proposal.payload.proposal_digest) {
        pushIssue(issues, "approval_proposal_mismatch", path, "The approval is bound to a different proposal or digest.");
      }
      const request = required.find((entry) =>
        entry.actor_id === approval.payload.approver_actor_id && entry.nonce === approval.payload.nonce
      );
      if (!request) {
        pushIssue(issues, "approval_not_requested", path, "This exact approver and nonce were not requested by the proposal.");
      } else if (compareTimestamp(event.at, request.expires_at) >= 0) {
        pushIssue(issues, "approval_expired", path, "Execution began at or after this approval request expired.");
      }
      approvalUse.set(approvalId, (approvalUse.get(approvalId) ?? 0) + 1);
    }
    if (observed.length !== required.length || !required.every((request) =>
      observed.some((entry) => entry.actor_id === request.actor_id && entry.nonce === request.nonce)
    )) {
      pushIssue(issues, "approval_set_mismatch", `$.events[${index}].payload.approval_event_ids`, "Execution approvals must exactly satisfy every approver and nonce bound into the proposal.");
    }
  }
  for (const proposal of ctx.byType.get("action.proposed") ?? []) {
    const proposalIndex = ctx.events.get(proposal.id).index;
    for (const [requestIndex, request] of proposal.payload.binding.required_approvals.entries()) {
      if (compareTimestamp(request.expires_at, proposal.at) <= 0) {
        pushIssue(issues, "approval_request_expired", `$.events[${proposalIndex}].payload.binding.required_approvals[${requestIndex}].expires_at`, "An approval request must expire after its proposal is recorded.");
      }
    }
  }
  for (const [approvalId, uses] of approvalUse) {
    if (uses > 1) {
      const found = ctx.events.get(approvalId);
      pushIssue(issues, "approval_reused", found ? `$.events[${found.index}].id` : "$.events", "One approval event was consumed by more than one execution start.");
    }
  }
  for (const [proposalId, starts] of startsByProposal) {
    if (starts.length > 1) {
      const found = ctx.events.get(proposalId);
      pushIssue(issues, "proposal_executed_more_than_once", found ? `$.events[${found.index}].id` : "$.events", "One proposal has more than one execution start.");
    }
  }
}

function checkExecution(ctx, issues) {
  const starts = ctx.byType.get("execution.started") ?? [];
  const receipts = ctx.byType.get("execution.receipt") ?? [];
  for (const start of starts) {
    const matching = receipts.filter((receipt) => receipt.payload.execution_event_id === start.id);
    const startIndex = ctx.events.get(start.id).index;
    if (matching.length !== 1) {
      pushIssue(issues, "execution_receipt_count_invalid", `$.events[${startIndex}].id`, "Every execution start must have exactly one provider receipt.");
      continue;
    }
    const receipt = matching[0];
    const receiptIndex = ctx.events.get(receipt.id).index;
    if (receipt.payload.proposal_event_id !== start.payload.proposal_event_id
      || receipt.payload.proposal_digest !== start.payload.proposal_digest) {
      pushIssue(issues, "receipt_proposal_mismatch", `$.events[${receiptIndex}].payload`, "The receipt proposal reference must match its execution start.");
    }
    const proposal = ctx.events.get(start.payload.proposal_event_id)?.event;
    if (proposal?.type === "action.proposed") {
      const maximum = proposal.payload.binding.cost;
      const actual = receipt.payload.actual_cost;
      if (maximum.state === "known" && actual.state === "known"
        && (maximum.unit !== actual.unit || compareDecimal(actual.amount, maximum.maximum_amount) > 0)) {
        pushIssue(issues, "actual_cost_exceeds_proposal", `$.events[${receiptIndex}].payload.actual_cost`, "Actual cost is outside the unit or maximum amount approved in the proposal.");
      }
    }
    if (receipt.payload.outcome === "pass" && receipt.payload.provider_receipt_evidence_ids.length === 0) {
      pushIssue(issues, "provider_receipt_evidence_missing", `$.events[${receiptIndex}].payload.provider_receipt_evidence_ids`, "A passing provider receipt needs a bounded provider-receipt evidence reference.");
    }
    for (const [evidenceIndex, evidenceId] of receipt.payload.provider_receipt_evidence_ids.entries()) {
      const evidence = ctx.evidence.get(evidenceId)?.entry;
      if (evidence && compareTimestamp(evidence.observed_at, start.at) < 0) {
        pushIssue(issues, "provider_receipt_evidence_before_execution", `$.events[${receiptIndex}].payload.provider_receipt_evidence_ids[${evidenceIndex}]`, "Provider-receipt evidence cannot predate its execution start.");
      }
    }
  }
  for (const receipt of receipts) {
    const duplicates = receipts.filter((entry) => entry.payload.execution_event_id === receipt.payload.execution_event_id);
    if (duplicates.length > 1 && duplicates[0] === receipt) {
      const eventIndex = ctx.events.get(receipt.id).index;
      pushIssue(issues, "execution_receipt_duplicate", `$.events[${eventIndex}].payload.execution_event_id`, "More than one provider receipt names the same execution start.");
    }
  }
}

function latestPlanBefore(ctx, sequence) {
  return (ctx.byType.get("plan.proposed") ?? [])
    .filter((event) => event.sequence < sequence)
    .sort((left, right) => right.sequence - left.sequence)[0];
}

function checkEffects(ctx, issues) {
  const receipts = ctx.byType.get("execution.receipt") ?? [];
  const observations = ctx.byType.get("effect.observed") ?? [];
  for (const receipt of receipts) {
    const matching = observations.filter((observation) => observation.payload.receipt_event_id === receipt.id);
    const receiptIndex = ctx.events.get(receipt.id).index;
    if (matching.length === 0) {
      pushIssue(issues, "effect_observation_missing", `$.events[${receiptIndex}].id`, "Each provider receipt needs a separate effect observation.");
      continue;
    }
    for (const observation of matching) {
      const observationIndex = ctx.events.get(observation.id).index;
      const proposal = ctx.events.get(observation.payload.proposal_event_id)?.event;
      if (observation.payload.execution_event_id !== receipt.payload.execution_event_id
        || observation.payload.proposal_event_id !== receipt.payload.proposal_event_id
        || observation.payload.proposal_digest !== receipt.payload.proposal_digest) {
        pushIssue(issues, "effect_observation_reference_mismatch", `$.events[${observationIndex}].payload`, "The effect observation must carry the receipt's execution and proposal references.");
      }
      if (["tested", "attested"].includes(observation.payload.causal_claim.state)
        && observation.payload.causal_claim.evidence_ids.length === 0) {
        pushIssue(issues, "causal_claim_evidence_missing", `$.events[${observationIndex}].payload.causal_claim.evidence_ids`, "A tested or attested causal claim needs evidence references.");
      }
      if (["tested", "attested"].includes(observation.payload.causal_claim.state)) {
        for (const [evidenceIndex, evidenceId] of observation.payload.causal_claim.evidence_ids.entries()) {
          const evidence = ctx.evidence.get(evidenceId)?.entry;
          if (!evidence) continue;
          const path = `$.events[${observationIndex}].payload.causal_claim.evidence_ids[${evidenceIndex}]`;
          if (!["observation", "test_result", "attestation"].includes(evidence.kind)) {
            pushIssue(issues, "causal_evidence_kind_mismatch", path, "A tested or attested causal claim needs observation, test-result, or attestation evidence.");
          }
          if (compareTimestamp(evidence.observed_at, receipt.at) <= 0) {
            pushIssue(issues, "causal_evidence_before_receipt", path, "Causal-claim evidence must be recorded after the provider receipt.");
          }
          if (proposal?.type === "action.proposed"
            && (!evidence.causal_scope
              || !sameCanonical(evidence.causal_scope, causalScope(ctx.run, proposal, receipt, observation)))) {
            pushIssue(issues, "causal_evidence_scope_mismatch", path, "Causal evidence must bind the exact run, proposal, execution, receipt, target, expected effect, and observed outcome.");
          }
        }
      }
      for (const [evidenceIndex, evidenceId] of observation.payload.evidence_ids.entries()) {
        const evidence = ctx.evidence.get(evidenceId)?.entry;
        if (evidence && compareTimestamp(evidence.observed_at, receipt.at) < 0) {
          pushIssue(issues, "effect_evidence_before_receipt", `$.events[${observationIndex}].payload.evidence_ids[${evidenceIndex}]`, "Effect-observation evidence cannot predate its provider receipt.");
        }
      }
    }
  }

  const terminal = ctx.events.get(ctx.run.terminal_event_id)?.event;
  if (!terminal) return;
  if (terminal.type === "work.completed") {
    for (const receipt of receipts) {
      if (receipt.payload.outcome !== "pass") {
        pushIssue(issues, "completion_with_failed_receipt", `$.events[${ctx.events.get(receipt.id).index}].payload.outcome`, "A completed run cannot rely on a failed or unknown provider receipt.");
      }
      const latestObservation = observations
        .filter((entry) => entry.payload.receipt_event_id === receipt.id && entry.sequence < terminal.sequence)
        .sort((left, right) => right.sequence - left.sequence)[0];
      if (latestObservation?.payload.outcome !== "confirmed") {
        pushIssue(issues, "completion_without_confirmed_effect", `$.events[${ctx.events.get(receipt.id).index}].id`, "A completed run requires the latest pre-terminal observation for every provider receipt to be confirmed.");
      }
    }
    const plan = latestPlanBefore(ctx, terminal.sequence);
    if (!plan || !sameMembers(terminal.payload.satisfied_acceptance_tests, plan.payload.acceptance_tests)) {
      pushIssue(issues, "completion_acceptance_tests_mismatch", `$.events[${ctx.events.get(terminal.id).index}].payload.satisfied_acceptance_tests`, "Completed acceptance tests must exactly match the latest plan's declared tests.");
    }
  }
  if (terminal.type === "work.closed") {
    if (terminal.payload.outcome === "no_action" && (ctx.byType.get("execution.started") ?? []).length > 0) {
      pushIssue(issues, "closed_no_action_mismatch", `$.events[${ctx.events.get(terminal.id).index}].payload.outcome`, "A no_action closure cannot contain an execution start.");
    }
    const latestOutcomes = receipts.map((receipt) => observations
      .filter((entry) => entry.payload.receipt_event_id === receipt.id && entry.sequence < terminal.sequence)
      .sort((left, right) => right.sequence - left.sequence)[0]?.payload.outcome);
    if (terminal.payload.outcome === "effect_unknown"
      && !latestOutcomes.some((outcome) => ["unknown", "not_observed"].includes(outcome))) {
      pushIssue(issues, "closed_unknown_effect_missing", `$.events[${ctx.events.get(terminal.id).index}].payload.outcome`, "An effect_unknown closure needs an unknown or not_observed effect observation.");
    }
    if (terminal.payload.outcome === "effect_mismatch"
      && !latestOutcomes.includes("contradicted")) {
      pushIssue(issues, "closed_effect_mismatch_missing", `$.events[${ctx.events.get(terminal.id).index}].payload.outcome`, "An effect_mismatch closure needs a contradicted effect observation.");
    }
  }
}

function checkProblems(ctx, issues) {
  for (const [index, event] of ctx.run.events.entries()) {
    if (event.type === "work.failed") {
      if (!event.payload.problem.terminal || event.payload.problem.retryable) {
        pushIssue(issues, "terminal_problem_inconsistent", `$.events[${index}].payload.problem`, "A work.failed problem must be terminal and must not invite an unchanged retry.");
      }
    }
    if (event.type === "action.rejected") {
      if (event.actor_id !== event.payload.rejected_by_actor_id) {
        pushIssue(issues, "rejection_actor_mismatch", `$.events[${index}].payload.rejected_by_actor_id`, "The rejection event actor must be the named rejecting actor.");
      }
      if (event.payload.problem.terminal) {
        const laterTerminal = ctx.run.events.find((candidate) =>
          candidate.sequence > event.sequence && ["work.failed", "work.closed", "work.cancelled"].includes(candidate.type)
        );
        if (!laterTerminal) {
          pushIssue(issues, "terminal_rejection_without_closure", `$.events[${index}].payload.problem.terminal`, "A terminal action rejection must lead to a failed, closed, or cancelled run.");
        }
      }
      const execution = (ctx.byType.get("execution.started") ?? []).find((candidate) =>
        candidate.payload.proposal_event_id === event.payload.proposal_event_id
      );
      if (execution?.sequence < event.sequence) {
        pushIssue(issues, "rejection_after_execution", `$.events[${index}].payload.proposal_event_id`, "A proposal cannot be rejected after its execution was recorded as started.");
      } else if (execution) {
        pushIssue(issues, "rejected_proposal_executed", `$.events[${index}].payload.proposal_event_id`, "A rejected proposal was later recorded as started.");
      }
      const otherDownstream = ctx.run.events.find((candidate) =>
        ["execution.approved", "execution.receipt", "effect.observed"].includes(candidate.type)
        && candidate.payload.proposal_event_id === event.payload.proposal_event_id
      );
      if (otherDownstream) {
        pushIssue(issues, "rejected_proposal_downstream_conflict", `$.events[${index}].payload.proposal_event_id`, "A rejected proposal cannot also have approval, receipt, or effect-observation records.");
      }
    }
  }
}

function checkCorrections(ctx, issues) {
  for (const [index, event] of ctx.run.events.entries()) {
    if (event.type === "correction.appended") {
      const payload = event.payload;
      if (payload.kind === "tombstone" && payload.tombstones.length === 0) {
        pushIssue(issues, "tombstone_details_missing", `$.events[${index}].payload.tombstones`, "A tombstone correction must itemize at least one tombstoned reference.");
      }
      if (payload.kind !== "tombstone" && payload.tombstones.length > 0) {
        pushIssue(issues, "tombstone_kind_mismatch", `$.events[${index}].payload.tombstones`, "Only a tombstone correction may carry tombstone records.");
      }
    }
  }
}

function checkTerminal(ctx, issues) {
  const { run } = ctx;
  const declared = ctx.events.get(run.terminal_event_id)?.event;
  if (!declared) {
    pushIssue(issues, "terminal_event_missing", "$.terminal_event_id", "The declared terminal event does not exist.");
    return;
  }
  const expectedType = TERMINAL_EVENT_FOR_STATE[run.terminal_state];
  if (declared.type !== expectedType) {
    pushIssue(issues, "terminal_state_mismatch", "$.terminal_state", "The declared terminal state does not match its required terminal event type.");
  }
  const terminalEvents = run.events.filter((event) => TERMINAL_EVENT_TYPES.has(event.type));
  if (terminalEvents.length !== 1 || terminalEvents[0]?.id !== declared.id) {
    pushIssue(issues, "terminal_event_count_invalid", "$.events", `A finite run must contain exactly its one declared terminal event; observed ${terminalEvents.length}.`);
  }
  for (const [index, event] of run.events.entries()) {
    if (event.sequence > declared.sequence && !["correction.appended", "appeal.appended"].includes(event.type)) {
      pushIssue(issues, "post_terminal_effect", `$.events[${index}]`, "Only correction.appended or appeal.appended may follow the declared terminal event.");
    }
  }
  if (declared.type === "work.expired") {
    if (declared.payload.deadline !== run.limits.expires_at) {
      pushIssue(issues, "expiry_deadline_mismatch", `$.events[${ctx.events.get(declared.id).index}].payload.deadline`, "The expiry event deadline must equal the run expiry.");
    }
    if (compareTimestamp(declared.at, run.limits.expires_at) < 0) {
      pushIssue(issues, "premature_expiry", `$.events[${ctx.events.get(declared.id).index}].at`, "An expired run cannot terminate before its declared expiry.");
    }
  }
}

const SEMANTIC_VALIDATORS = new Map([
  ["R.IDS", checkIdentifiers],
  ["R.CHAIN_TIME", checkChainAndTime],
  ["R.REFERENCES", checkReferences],
  ["R.LIMITS_PLAN", checkLimitsAndPlans],
  ["R.STATE", checkState],
  ["R.DIGESTS", checkDigests],
  ["R.AUTHORITY", checkAuthority],
  ["R.APPROVALS", checkApprovals],
  ["R.EXECUTION", checkExecution],
  ["R.EFFECTS", checkEffects],
  ["R.PROBLEMS", checkProblems],
  ["R.CORRECTIONS", checkCorrections],
  ["R.TERMINAL", checkTerminal],
]);

function semanticValidation(run) {
  const ctx = contextFor(run);
  const allIssues = [];
  const checks = [];
  for (const [id, expected] of SEMANTIC_CHECKS) {
    const localIssues = [];
    SEMANTIC_VALIDATORS.get(id)(ctx, localIssues);
    for (const entry of localIssues) {
      if (allIssues.length < MAX_ISSUES) allIssues.push(entry);
    }
    checks.push(check(
      id,
      localIssues.length === 0 ? "pass" : "fail",
      expected,
      localIssues.length === 0 ? "No inconsistency observed." : `${localIssues.length} structured issue${localIssues.length === 1 ? "" : "s"} observed.`,
    ));
  }
  return { valid: allIssues.length === 0, issues: allIssues, checks };
}

/** Validate an already parsed run without mutating it or resolving any URI. */
export function validateWorkRun(run) {
  const schemaValid = validateRunSchema(run);
  if (!schemaValid) {
    return {
      valid: false,
      schema_valid: false,
      issues: schemaIssues(validateRunSchema.errors),
      checks: [],
    };
  }
  const semantic = semanticValidation(run);
  return {
    valid: semantic.valid,
    schema_valid: true,
    issues: semantic.issues,
    checks: semantic.checks,
  };
}

function unavailableRun() {
  return { state: "unavailable" };
}

function availableRun(run) {
  return {
    state: "available",
    terminal_state: run.terminal_state,
  };
}

function incompleteResult(observedBytes, observedAt) {
  const issues = [issue(
    "input_limit_exceeded",
    "$",
    `The input exceeds the fixed ${MAX_INPUT_BYTES}-byte checker limit; no structural conclusion was drawn.`,
  )];
  const checks = [
    check("I.SIZE", "unknown", `at most ${MAX_INPUT_BYTES} bytes`, `observed at least ${observedBytes} bytes`),
    check("I.UTF8", "not_run", "strict UTF-8 without a byte-order mark", "input size limit prevented decoding"),
    check("I.JSON", "not_run", "one JSON value with unique object keys", "input size limit prevented parsing"),
    check("I.SCHEMA", "not_run", WORK_RUN_VERSION, "input size limit prevented schema validation"),
    ...notRunChecks("input size limit prevented semantic validation"),
  ];
  return buildResult({
    artifact: { complete: false, observed_bytes: observedBytes },
    observedAt,
    checks,
    issues,
    run: unavailableRun(),
  });
}

function inputBytes(input) {
  if (typeof input === "string") return Buffer.from(input, "utf8");
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("run input must be a string, Buffer, or Uint8Array");
}

/**
 * Check one complete in-memory artifact. This performs no network access,
 * credential lookup, execution, or write.
 */
export function checkWorkRunBytes(input, options = {}) {
  const observedAt = strictObservedAt(options.now);
  const bytes = inputBytes(input);
  if (bytes.length > MAX_INPUT_BYTES) return incompleteResult(bytes.length, observedAt);

  const artifact = {
    complete: true,
    observed_bytes: bytes.length,
    sha256: sha256(bytes),
  };
  const checks = [check("I.SIZE", "pass", `at most ${MAX_INPUT_BYTES} bytes`, `${bytes.length} bytes`)];
  const issues = [];

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    pushIssue(issues, "utf8_bom", "$", "A JSON interchange artifact must not begin with a UTF-8 byte-order mark.");
    checks.push(check("I.UTF8", "fail", "strict UTF-8 without a byte-order mark", "UTF-8 byte-order mark observed"));
    checks.push(check("I.JSON", "not_run", "one JSON value with unique object keys", "UTF-8 check failed"));
    checks.push(check("I.SCHEMA", "not_run", WORK_RUN_VERSION, "UTF-8 check failed"));
    checks.push(...notRunChecks("UTF-8 check failed"));
    return buildResult({ artifact, observedAt, checks, issues, run: unavailableRun() });
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    checks.push(check("I.UTF8", "pass", "strict UTF-8 without a byte-order mark", "decoded without replacement characters"));
  } catch (error) {
    pushIssue(issues, "utf8_decode", "$", `Strict UTF-8 decoding failed: ${error?.message || error}.`);
    checks.push(check("I.UTF8", "fail", "strict UTF-8 without a byte-order mark", "strict decoding failed"));
    checks.push(check("I.JSON", "not_run", "one JSON value with unique object keys", "UTF-8 check failed"));
    checks.push(check("I.SCHEMA", "not_run", WORK_RUN_VERSION, "UTF-8 check failed"));
    checks.push(...notRunChecks("UTF-8 check failed"));
    return buildResult({ artifact, observedAt, checks, issues, run: unavailableRun() });
  }

  let run;
  try {
    run = JSON.parse(text);
  } catch {
    pushIssue(issues, "json_parse", "$", "JSON parsing failed; input content was not copied into the issue.");
    checks.push(check("I.JSON", "fail", "one JSON value with unique object keys", "JSON parsing failed"));
    checks.push(check("I.SCHEMA", "not_run", WORK_RUN_VERSION, "JSON parsing failed"));
    checks.push(...notRunChecks("JSON parsing failed"));
    return buildResult({ artifact, observedAt, checks, issues, run: unavailableRun() });
  }

  let duplicates;
  try {
    duplicates = duplicateJsonKeys(text);
  } catch (error) {
    pushIssue(issues, "json_depth_exceeded", "$", `JSON preflight failed: ${error?.message || error}.`);
    checks.push(check("I.JSON", "fail", "one JSON value with unique object keys", "JSON nesting exceeded the bounded preflight"));
    checks.push(check("I.SCHEMA", "not_run", WORK_RUN_VERSION, "JSON preflight failed"));
    checks.push(...notRunChecks("JSON preflight failed"));
    return buildResult({ artifact, observedAt, checks, issues, run: unavailableRun() });
  }
  if (duplicates.length > 0) {
    for (const _duplicate of duplicates) {
      pushIssue(issues, "json_key_duplicate", "$", "An object key appears more than once; key text was not copied into the result.");
    }
    checks.push(check("I.JSON", "fail", "one JSON value with unique object keys", `${duplicates.length} duplicate object key${duplicates.length === 1 ? "" : "s"} observed`));
    checks.push(check("I.SCHEMA", "not_run", WORK_RUN_VERSION, "ambiguous duplicate keys prevented validation"));
    checks.push(...notRunChecks("ambiguous duplicate keys prevented semantic validation"));
    return buildResult({ artifact, observedAt, checks, issues, run: unavailableRun() });
  }
  checks.push(check("I.JSON", "pass", "one JSON value with unique object keys", "one unambiguous JSON value parsed"));

  const validation = validateWorkRun(run);
  if (!validation.schema_valid) {
    for (const entry of validation.issues) pushIssue(issues, entry.code, entry.path, entry.message);
    checks.push(check("I.SCHEMA", "fail", WORK_RUN_VERSION, `${validation.issues.length} schema issue${validation.issues.length === 1 ? "" : "s"} observed`));
    checks.push(...notRunChecks("run schema validation failed"));
    return buildResult({ artifact, observedAt, checks, issues, run: unavailableRun() });
  }

  checks.push(check("I.SCHEMA", "pass", WORK_RUN_VERSION, "run matches the development-draft JSON Schema"));
  for (const entry of validation.issues) pushIssue(issues, entry.code, entry.path, entry.message);
  checks.push(...validation.checks);
  return buildResult({ artifact, observedAt, checks, issues, run: availableRun(run) });
}

async function readBoundedRegularFile(path) {
  const handle = await open(path, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error("input path must name a regular file");
    if (metadata.size > MAX_INPUT_BYTES) {
      return { complete: false, observedBytes: metadata.size };
    }
    const chunks = [];
    let total = 0;
    while (total <= MAX_INPUT_BYTES) {
      const remaining = MAX_INPUT_BYTES + 1 - total;
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      total += bytesRead;
    }
    if (total > MAX_INPUT_BYTES) return { complete: false, observedBytes: total };
    return { complete: true, bytes: Buffer.concat(chunks, total) };
  } finally {
    await handle.close();
  }
}

/** Check one local regular file without resolving any URI found inside it. */
export async function checkWorkRunFile(path, options = {}) {
  if (typeof path !== "string" || path.length === 0) throw new TypeError("path must be a non-empty string");
  const observedAt = strictObservedAt(options.now);
  const input = await readBoundedRegularFile(path);
  if (!input.complete) return incompleteResult(input.observedBytes, observedAt);
  return checkWorkRunBytes(input.bytes, { now: observedAt });
}

function usage() {
  return [
    "Usage: xenia-work-check <run.json> [--json]",
    "       xenia-work-check --help",
    "",
    "Checks one local XENIA Work 0.1 run artifact. It performs no network",
    "requests, writes, credential access, provider calls, or real-world effect",
    "verification. Input is limited to 1 MiB.",
    "",
    "Exit codes: 0 conformant, 1 nonconformant or indeterminate, 2 misuse or checker defect.",
  ].join("\n");
}

function printHuman(result) {
  const heading = result.result.toUpperCase();
  const lines = [
    `XENIA Work 0.1: ${heading}`,
    `scope: ${result.scope}`,
    `artifact: ${result.artifact.complete ? result.artifact.sha256 : "incomplete (input limit)"}`,
    `checks: ${result.counts.pass} pass, ${result.counts.fail} fail, ${result.counts.unknown} unknown, ${result.counts.not_run} not run`,
  ];
  if (result.run.state === "available") {
    lines.push(`terminal: ${result.run.terminal_state}`);
  }
  for (const entry of result.issues.slice(0, 12)) {
    lines.push(`- ${entry.code} at ${entry.path}: ${entry.message}`);
  }
  if (result.issues.length > 12) lines.push(`- … ${result.issues.length - 12} more structured issues`);
  lines.push("whole-XENIA conformance: not assessed");
  return lines.join("\n") + "\n";
}

export async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage() + "\n");
    return 0;
  }
  const json = args.includes("--json");
  const unknownOptions = args.filter((value) => value.startsWith("-") && value !== "--json");
  const positional = args.filter((value) => !value.startsWith("-"));
  if (unknownOptions.length > 0 || positional.length !== 1) {
    process.stderr.write(usage() + "\n");
    return 2;
  }
  try {
    const result = await checkWorkRunFile(positional[0]);
    process.stdout.write(json ? JSON.stringify(result, null, 2) + "\n" : printHuman(result));
    return result.result === "conformant" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    return 2;
  }
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = await main(process.argv.slice(2));
