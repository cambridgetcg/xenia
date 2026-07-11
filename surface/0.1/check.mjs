#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

export const PROFILE = "xenia-surface/0.1";
export const MANIFEST_VERSION = "xenia.surface.manifest/0.1";
export const PROBLEM_VERSION = "xenia.surface.problem/0.1";
export const RESULT_VERSION = "xenia.surface.result/0.1";
export const CHECKER_VERSION = "0.1.0-rc.1";
export const CHECKER_USER_AGENT = `xenia-surface-check/${CHECKER_VERSION}`;

const MANIFEST_PATH = "/.well-known/agent.json";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const METADATA_MAX_BODY_BYTES = 65_536;
const TOTAL_TIMEOUT_MS = 20_000;
const CLAIM_STATES = new Set(["asserted", "tested", "attested"]);
const CLAIM_OUTCOMES = new Set(["pass", "fail", "unknown"]);
const EVIDENCE_KINDS = new Set(["probe", "source", "audit", "signature", "receipt"]);
const SURFACE_URL_PREFIX = /^(?:https:\/\/(?![^/?#]*@)|http:\/\/(?:localhost|127(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|\[::1\])(?::[0-9]+)?(?:\/|$))/;
const URI_CHARACTERS = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;
const MANIFEST_SCHEMA_URL = "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/manifest.schema.json";
const PROBLEM_SCHEMA_URL = "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json";

const PROFILE_LIMITS = [
  "identity control",
  "actor authorization",
  "consent",
  "privacy and retention",
  "continuity and portability",
  "economic behavior",
  "behavior outside the public GET routes listed in checks"
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasLength(value, minimum, maximum) {
  if (typeof value !== "string") return false;
  const length = [...value].length;
  return length >= minimum && length <= maximum;
}

function exceedsLength(value, maximum) {
  return typeof value !== "string" || [...value].length > maximum;
}

function matchesString(value, pattern) {
  return typeof value === "string" && pattern.test(value);
}

function parseDateTime(value) {
  if (!isNonEmptyString(value)) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(
    value
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = ""] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [0, 31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month]) return null;
  const leapSecond = hour === 23 && minute === 59 && second === 60;
  if (!leapSecond && (hour > 23 || minute > 59 || second > 59)) return null;

  const adjustedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  const daysSinceEpoch = era * 146097 + dayOfEra - 719468;
  const localSeconds =
    BigInt(daysSinceEpoch) * 86_400n +
    BigInt(hour * 3600 + minute * 60 + (leapSecond ? 59 : second));
  return { seconds: localSeconds, leapSecond, fraction };
}

function isDateTime(value) {
  return parseDateTime(value) !== null;
}

function compareDateTimes(left, right) {
  const first = parseDateTime(left);
  const second = parseDateTime(right);
  if (!first || !second) return null;
  if (first.seconds < second.seconds) return -1;
  if (first.seconds > second.seconds) return 1;
  if (first.leapSecond !== second.leapSecond) return first.leapSecond ? 1 : -1;
  const fractionLength = Math.max(first.fraction.length, second.fraction.length);
  const firstFraction = first.fraction.padEnd(fractionLength, "0");
  const secondFraction = second.fraction.padEnd(fractionLength, "0");
  if (firstFraction < secondFraction) return -1;
  if (firstFraction > secondFraction) return 1;
  return 0;
}

function hasUniqueStrings(values) {
  return Array.isArray(values) && values.every(isNonEmptyString) && new Set(values).size === values.length;
}

function mediaTypeEssence(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function hasVaryAccept(value) {
  return String(value || "")
    .toLowerCase()
    .split(",")
    .map((token) => token.trim())
    .includes("accept");
}

function isAbsoluteHttpUrl(value) {
  if (
    !isNonEmptyString(value) ||
    !SURFACE_URL_PREFIX.test(value) ||
    !URI_CHARACTERS.test(value) ||
    /%(?![A-Fa-f0-9]{2})/.test(value)
  ) return false;
  const authorityStart = value.indexOf("://") + 3;
  const authorityEndMatch = /[/?#]/.exec(value.slice(authorityStart));
  const authorityEnd = authorityEndMatch ? authorityStart + authorityEndMatch.index : value.length;
  const suffix = value.slice(authorityEnd);
  if (suffix.includes("[") || suffix.includes("]")) return false;
  if (value.indexOf("#") !== value.lastIndexOf("#")) return false;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname) {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  return isIP(hostname) === 4 && hostname.split(".")[0] === "127";
}

function isSecureOrLoopbackUrl(value) {
  if (!isAbsoluteHttpUrl(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname));
}

function unknownKeys(value, allowed, label, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label}.${key} is not defined by Surface 0.1`);
  }
}

export function validateManifest(manifest, target) {
  const errors = [];
  const targetUrl = new URL(target);

  if (!isObject(manifest)) return ["manifest must be a JSON object"];
  unknownKeys(
    manifest,
    new Set([
      "$schema",
      "schema_version",
      "profile",
      "service",
      "resources",
      "problem_schema",
      "claims",
      "not_covered",
      "documentation"
    ]),
    "manifest",
    errors
  );
  if (manifest.$schema !== MANIFEST_SCHEMA_URL) {
    errors.push("$schema must identify the release-tag-pinned Surface 0.1 candidate schema");
  }
  if (manifest.schema_version !== MANIFEST_VERSION) {
    errors.push(`schema_version must be ${MANIFEST_VERSION}`);
  }
  if (manifest.profile !== PROFILE) errors.push(`profile must be ${PROFILE}`);

  if (!isObject(manifest.service)) {
    errors.push("service must be an object");
  } else {
    unknownKeys(
      manifest.service,
      new Set(["name", "canonical_url", "description"]),
      "service",
      errors
    );
    if (!hasLength(manifest.service.name, 1, 120)) errors.push("service.name must be 1 to 120 characters");
    if (!hasLength(manifest.service.description, 1, 500)) {
      errors.push("service.description must be 1 to 500 characters");
    }
    if (!isSecureOrLoopbackUrl(manifest.service.canonical_url)) {
      errors.push("service.canonical_url must use HTTPS outside loopback development");
    } else if (new URL(manifest.service.canonical_url).origin !== targetUrl.origin) {
      errors.push("service.canonical_url origin must match the checked target");
    }
  }

  const resourceIds = new Set();
  if (!Array.isArray(manifest.resources) || manifest.resources.length < 1 || manifest.resources.length > 8) {
    errors.push("resources must contain between one and eight entries");
  } else {
    for (const [index, resource] of manifest.resources.entries()) {
      const label = `resources[${index}]`;
      if (!isObject(resource)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      unknownKeys(
        resource,
        new Set(["id", "href", "representations", "default_media_type", "auth", "description"]),
        label,
        errors
      );
      if (!matchesString(resource.id, /^[a-z][a-z0-9._-]*$/)) {
        errors.push(`${label}.id must be a stable lowercase identifier`);
      } else if (resourceIds.has(resource.id)) {
        errors.push(`${label}.id must be unique`);
      } else {
        resourceIds.add(resource.id);
      }
      if (!isSecureOrLoopbackUrl(resource.href)) {
        errors.push(`${label}.href must use HTTPS outside loopback development`);
      } else {
        const href = new URL(resource.href);
        if (href.origin !== targetUrl.origin) errors.push(`${label}.href must be same-origin`);
        if (href.search || href.hash) errors.push(`${label}.href must not contain a query or fragment`);
      }
      if (
        !hasUniqueStrings(resource.representations) ||
        resource.representations.length < 1 ||
        resource.representations.length > 2 ||
        resource.representations.some((type) => type !== "application/json" && type !== "text/html")
      ) {
        errors.push(`${label}.representations must contain one or both defined media types`);
      } else if (!resource.representations.includes("application/json")) {
        errors.push(`${label}.representations must include application/json`);
      }
      if (!Array.isArray(resource.representations) || !resource.representations.includes(resource.default_media_type)) {
        errors.push(`${label}.default_media_type must name a declared representation`);
      }
      if (resource.auth !== "none") errors.push(`${label}.auth must be none in Surface 0.1`);
      if (resource.description !== undefined && !hasLength(resource.description, 0, 500)) {
        errors.push(`${label}.description must be at most 500 characters`);
      }
    }
  }

  if (manifest.problem_schema !== PROBLEM_SCHEMA_URL) {
    errors.push("problem_schema must identify the release-tag-pinned Surface 0.1 candidate schema");
  }

  const claimIds = new Set();
  if (!Array.isArray(manifest.claims)) {
    errors.push("claims must be an array");
  } else {
    for (const [index, claim] of manifest.claims.entries()) {
      const label = `claims[${index}]`;
      if (!isObject(claim)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      unknownKeys(
        claim,
        new Set(["id", "statement", "scope", "evidence_state", "outcome", "evidence"]),
        label,
        errors
      );
      if (!matchesString(claim.id, /^[a-z][a-z0-9._-]*$/)) {
        errors.push(`${label}.id must be a stable lowercase identifier`);
      } else if (claimIds.has(claim.id)) {
        errors.push(`${label}.id must be unique`);
      } else {
        claimIds.add(claim.id);
      }
      if (!hasLength(claim.statement, 1, 1000)) {
        errors.push(`${label}.statement must be 1 to 1000 characters`);
      }
      if (
        !hasUniqueStrings(claim.scope) ||
        claim.scope.length === 0 ||
        claim.scope.some((scope) => exceedsLength(scope, 300))
      ) {
        errors.push(`${label}.scope must contain at least one unique scope`);
      }
      if (!CLAIM_STATES.has(claim.evidence_state)) errors.push(`${label}.evidence_state is not defined`);
      if (!CLAIM_OUTCOMES.has(claim.outcome)) errors.push(`${label}.outcome is not defined`);
      if (!Array.isArray(claim.evidence)) {
        errors.push(`${label}.evidence must be an array`);
        continue;
      }
      for (const [evidenceIndex, evidence] of claim.evidence.entries()) {
        const evidenceLabel = `${label}.evidence[${evidenceIndex}]`;
        if (!isObject(evidence)) {
          errors.push(`${evidenceLabel} must be an object`);
          continue;
        }
        unknownKeys(
          evidence,
          new Set([
            "kind",
            "uri",
            "observed_at",
            "expires_at",
            "digest",
            "verifier",
            "algorithm",
            "key_id",
            "signature",
            "issuer"
          ]),
          evidenceLabel,
          errors
        );
        if (!EVIDENCE_KINDS.has(evidence.kind)) errors.push(`${evidenceLabel}.kind is not defined`);
        if (!isSecureOrLoopbackUrl(evidence.uri)) errors.push(`${evidenceLabel}.uri must use HTTPS outside loopback development`);
        if (!isDateTime(evidence.observed_at)) errors.push(`${evidenceLabel}.observed_at must be a date-time`);
        if (!isDateTime(evidence.expires_at)) errors.push(`${evidenceLabel}.expires_at must be a date-time`);
        const timeOrder = compareDateTimes(evidence.expires_at, evidence.observed_at);
        if (timeOrder !== null && timeOrder <= 0) {
          errors.push(`${evidenceLabel}.expires_at must be after observed_at`);
        }
        if (!matchesString(evidence.digest, /^sha256:[a-f0-9]{64}$/)) {
          errors.push(`${evidenceLabel}.digest must be a lowercase sha256 digest`);
        }
        if (!isSecureOrLoopbackUrl(evidence.verifier)) errors.push(`${evidenceLabel}.verifier must use HTTPS outside loopback development`);
        if (evidence.algorithm !== undefined && evidence.algorithm !== "ed25519" && evidence.algorithm !== "receipt") {
          errors.push(`${evidenceLabel}.algorithm is not defined`);
        }
        if (evidence.key_id !== undefined && !isSecureOrLoopbackUrl(evidence.key_id)) {
          errors.push(`${evidenceLabel}.key_id must use HTTPS outside loopback development`);
        }
        if (evidence.signature !== undefined && !matchesString(evidence.signature, /^[A-Za-z0-9+/]{86}==$/)) {
          errors.push(`${evidenceLabel}.signature must be a 64-byte base64 Ed25519 signature`);
        }
        if (evidence.issuer !== undefined && !isSecureOrLoopbackUrl(evidence.issuer)) {
          errors.push(`${evidenceLabel}.issuer must use HTTPS outside loopback development`);
        }
        if (evidence.kind === "signature") {
          if (evidence.algorithm !== "ed25519") errors.push(`${evidenceLabel}.algorithm must be ed25519`);
          if (evidence.key_id === undefined) errors.push(`${evidenceLabel}.key_id is required for signature evidence`);
          if (evidence.signature === undefined) {
            errors.push(`${evidenceLabel}.signature must be a 64-byte base64 Ed25519 signature`);
          }
        }
        if (evidence.kind === "receipt") {
          if (evidence.algorithm !== "receipt") errors.push(`${evidenceLabel}.algorithm must be receipt`);
          if (evidence.issuer === undefined) errors.push(`${evidenceLabel}.issuer is required for receipt evidence`);
        }
      }
      if (
        claim.evidence_state === "tested" &&
        !claim.evidence.some((evidence) => evidence?.kind === "probe" || evidence?.kind === "audit")
      ) {
        errors.push(`${label}.tested requires probe or audit evidence`);
      }
      if (claim.evidence_state === "asserted" && claim.evidence.length !== 0) {
        errors.push(`${label}.asserted must not carry evidence`);
      }
      if (
        claim.evidence_state === "attested" &&
        !claim.evidence.some((evidence) => evidence?.kind === "signature" || evidence?.kind === "receipt")
      ) {
        errors.push(`${label}.attested requires signature or receipt evidence`);
      }
    }
  }

  if (
    !hasUniqueStrings(manifest.not_covered) ||
    manifest.not_covered.length === 0 ||
    manifest.not_covered.some((boundary) => exceedsLength(boundary, 300))
  ) {
    errors.push("not_covered must name at least one explicit boundary");
  }
  if (manifest.documentation !== undefined && !isSecureOrLoopbackUrl(manifest.documentation)) {
    errors.push("documentation must use HTTPS outside loopback development");
  }
  return errors;
}

export function validateProblem(problem, httpStatus, options = {}) {
  const errors = [];
  if (!isObject(problem)) return ["problem must be a JSON object"];
  unknownKeys(
    problem,
    new Set([
      "schema_version",
      "type",
      "title",
      "status",
      "code",
      "detail",
      "retryable",
      "terminal",
      "next_actions",
      "docs",
      "error"
    ]),
    "problem",
    errors
  );
  if (problem.schema_version !== PROBLEM_VERSION) {
    errors.push(`schema_version must be ${PROBLEM_VERSION}`);
  }
  if (!isSecureOrLoopbackUrl(problem.type)) errors.push("type must use HTTPS outside loopback development");
  if (!hasLength(problem.title, 1, 200)) errors.push("title must be 1 to 200 characters");
  if (!Number.isInteger(problem.status) || problem.status < 400 || problem.status > 599) {
    errors.push("status must be an HTTP error status");
  } else if (problem.status !== httpStatus) {
    errors.push("body status must equal HTTP status");
  }
  if (!matchesString(problem.code, /^[a-z][a-z0-9_]{0,63}$/)) {
    errors.push("code must be a stable lowercase identifier");
  }
  if (options.expectedCode && problem.code !== options.expectedCode) {
    errors.push(`code must be ${options.expectedCode}`);
  }
  if (!hasLength(problem.detail, 1, 2000)) errors.push("detail must be 1 to 2000 characters");
  if (typeof problem.retryable !== "boolean") errors.push("retryable must be boolean");
  if (typeof problem.terminal !== "boolean") errors.push("terminal must be boolean");
  if (!Array.isArray(problem.next_actions)) {
    errors.push("next_actions must be an array");
  } else {
    for (const [index, action] of problem.next_actions.entries()) {
      const label = `next_actions[${index}]`;
      if (!isObject(action)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      unknownKeys(
        action,
        new Set(["rel", "href", "method", "accept", "description"]),
        label,
        errors
      );
      if (!matchesString(action.rel, /^[a-z][a-z0-9._-]*$/)) {
        errors.push(`${label}.rel must be a stable lowercase identifier`);
      }
      if (!isSecureOrLoopbackUrl(action.href)) errors.push(`${label}.href must use HTTPS outside loopback development`);
      if (action.method !== "GET") errors.push(`${label}.method must be GET`);
      if (!hasLength(action.accept, 3, 200)) errors.push(`${label}.accept must be 3 to 200 characters`);
      if (action.description !== undefined && !hasLength(action.description, 0, 500)) {
        errors.push(`${label}.description must be at most 500 characters`);
      }
    }
  }
  if (
    !Array.isArray(problem.docs) ||
    problem.docs.length === 0 ||
    !problem.docs.every(isSecureOrLoopbackUrl) ||
    new Set(problem.docs).size !== problem.docs.length
  ) {
    errors.push("docs must contain at least one absolute HTTP(S) URL");
  }
  if (problem.error !== undefined && !hasLength(problem.error, 1, 500)) {
    errors.push("error must be 1 to 500 characters when present");
  }
  if (problem.terminal === true && problem.next_actions?.length !== 0) {
    errors.push("terminal problems must not offer next actions");
  }
  if (problem.terminal === false && problem.next_actions?.length < 1) {
    errors.push("non-terminal problems must offer at least one next action");
  }
  if (options.manifestUrl) {
    const discover = Array.isArray(problem.next_actions)
      ? problem.next_actions.filter((action) => action?.rel === "discover")
      : [];
    if (
      discover.length !== 1 ||
      discover[0]?.method !== "GET" ||
      discover[0]?.accept !== "application/json" ||
      discover[0]?.href !== options.manifestUrl
    ) {
      errors.push("route-not-found problem must contain exactly one discover action for the manifest");
    }
  }
  if (options.resource) {
    const retry = Array.isArray(problem.next_actions) ? problem.next_actions.filter(
      (action) =>
        action?.href === options.resource.href &&
        action?.method === "GET" &&
        options.resource.representations.includes(action?.accept)
    ) : [];
    if (retry.length < 1) {
      errors.push("not-acceptable problem must contain a retry action for a declared representation");
    }
  }
  return errors;
}

function parseJson(body) {
  try {
    const value = JSON.parse(body);
    return isObject(value)
      ? { value, error: null }
      : { value: null, error: "JSON body must be an object" };
  } catch (error) {
    return { value: null, error: String(error.message || error) };
  }
}

async function readLimited(response, maxBodyBytes, requireUtf8) {
  if (!response.body) {
    return { body: "", decodedBytes: 0, bodySha256: createHash("sha256").digest("hex") };
  }
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  const chunks = [];
  let decodedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    decodedBytes += value.byteLength;
    if (decodedBytes > maxBodyBytes) {
      await reader.cancel();
      throw new Error(`decoded body exceeds ${maxBodyBytes} bytes`);
    }
    hash.update(value);
    chunks.push(value);
  }
  const bytes = new Uint8Array(decodedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const bodySha256 = hash.digest("hex");
  try {
    return {
      body: new TextDecoder("utf-8", { fatal: requireUtf8 }).decode(bytes),
      decodedBytes,
      bodySha256,
      bodyError: null
    };
  } catch {
    return { body: null, decodedBytes, bodySha256, bodyError: "body is not valid UTF-8" };
  }
}

async function observe(url, accept, options, maxBodyBytes) {
  const request = { method: "GET", url: String(url), accept: accept || "", user_agent: CHECKER_USER_AGENT };
  const remainingMs = options.deadlineAt - Date.now();
  if (remainingMs <= 0) {
    return { observation: { request, error: `total timeout after ${options.totalTimeoutMs}ms` }, body: null };
  }
  const controller = new AbortController();
  const timeoutMs = Math.min(options.timeoutMs, remainingMs);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  let response;
  try {
    const headers = { "user-agent": CHECKER_USER_AGENT };
    if (accept) headers.accept = accept;
    response = await options.fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers,
      signal: controller.signal
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : String(error.message || error);
    clearTimeout(timer);
    return { observation: { request, error: message }, body: null };
  }

  const responseMetadata = {
    status: response.status,
    content_type: response.headers.get("content-type") || "",
    vary: response.headers.get("vary") || "",
    duration_ms: 0
  };
  try {
    const responseMediaType = mediaTypeEssence(responseMetadata.content_type);
    const read = await readLimited(
      response,
      maxBodyBytes,
      responseMediaType === "application/json" || responseMediaType === "application/problem+json"
    );
    responseMetadata.duration_ms = Math.max(0, Math.round(performance.now() - started));
    responseMetadata.decoded_bytes = read.decodedBytes;
    responseMetadata.body_sha256 = read.bodySha256;
    const observation = {
      request,
      response: responseMetadata,
      ...(read.bodyError ? { error: read.bodyError } : {})
    };
    return {
      observation,
      body: read.body,
      bodyError: read.bodyError
    };
  } catch (error) {
    responseMetadata.duration_ms = Math.max(0, Math.round(performance.now() - started));
    const message = error?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : String(error.message || error);
    return { observation: { request, response: responseMetadata, error: message }, body: null };
  } finally {
    clearTimeout(timer);
  }
}

function addCheck(checks, id, outcome, expected, observed, observation) {
  checks.push({ id, outcome, expected, observed: String(observed), observation });
}

function addNotRun(checks, id, expected, url, accept, reason) {
  addCheck(
    checks,
    id,
    "not_run",
    expected,
    reason,
    { request: { method: "GET", url: String(url), accept: accept || "", user_agent: CHECKER_USER_AGENT } }
  );
}

function observationOutcome(observed, predicate) {
  if (!observed.observation.response) return "unknown";
  return predicate(observed) ? "pass" : "fail";
}

function observationSummary(observed) {
  if (!observed.observation.response) return observed.observation.error;
  const response = observed.observation.response;
  return `${response.status} ${response.content_type || "missing content-type"}${
    observed.observation.error ? `; ${observed.observation.error}` : ""
  }`;
}

function checkVary(checks, id, observed) {
  addCheck(
    checks,
    id,
    observationOutcome(observed, (value) => hasVaryAccept(value.observation.response.vary)),
    "Vary contains the exact token Accept",
    observed.observation.response?.vary || observed.observation.error || "missing",
    observed.observation
  );
}

function validJsonRepresentation(observed) {
  if (observed.observation.error) return false;
  const response = observed.observation.response;
  if (
    response.status < 200 ||
    response.status >= 300 ||
    mediaTypeEssence(response.content_type) !== "application/json"
  ) return false;
  const parsed = parseJson(observed.body);
  return !parsed.error && isNonEmptyString(parsed.value.schema_version);
}

function validHtmlRepresentation(observed) {
  if (observed.observation.error) return false;
  const response = observed.observation.response;
  return response.status >= 200 && response.status < 300 && mediaTypeEssence(response.content_type) === "text/html";
}

function checkRepresentation(checks, id, observed, expectedMediaType) {
  const response = observed.observation.response;
  if (!response) {
    addCheck(checks, id, "unknown", `2xx ${expectedMediaType}`, observed.observation.error, observed.observation);
    return;
  }
  const mediaMatches = mediaTypeEssence(response.content_type) === expectedMediaType;
  if (response.status < 200 || response.status >= 300 || !mediaMatches) {
    addCheck(
      checks,
      id,
      "fail",
      `2xx ${expectedMediaType}${expectedMediaType === "application/json" ? " object with schema_version" : ""}`,
      observationSummary(observed),
      observed.observation
    );
    return;
  }
  if (observed.observation.error) {
    addCheck(
      checks,
      id,
      observed.bodyError ? "fail" : "unknown",
      `complete ${expectedMediaType} body`,
      observationSummary(observed),
      observed.observation
    );
    return;
  }
  const valid = expectedMediaType === "application/json"
    ? validJsonRepresentation(observed)
    : validHtmlRepresentation(observed);
  addCheck(
    checks,
    id,
    valid ? "pass" : "fail",
    `2xx ${expectedMediaType}${expectedMediaType === "application/json" ? " object with schema_version" : ""}`,
    observationSummary(observed),
    observed.observation
  );
}

function checkProblem(checks, id, observed, status, options = {}) {
  const response = observed.observation.response;
  if (!response) {
    addCheck(
      checks,
      id,
      "unknown",
      `${status} application/problem+json matching ${PROBLEM_VERSION}`,
      observed.observation.error,
      observed.observation
    );
    return;
  }
  const errors = [];
  if (response.status !== status) errors.push(`HTTP status must be ${status}`);
  if (mediaTypeEssence(response.content_type) !== "application/problem+json") {
    errors.push("Content-Type must be application/problem+json");
  }
  if (observed.bodyError) errors.push(observed.bodyError);
  if (errors.length === 0 && observed.observation.error) {
    addCheck(
      checks,
      id,
      "unknown",
      `${status} application/problem+json matching ${PROBLEM_VERSION}`,
      observationSummary(observed),
      observed.observation
    );
    return;
  }
  if (!observed.observation.error) {
    const parsed = parseJson(observed.body);
    if (parsed.error) errors.push(parsed.error);
    else errors.push(...validateProblem(parsed.value, response.status, options));
  }
  addCheck(
    checks,
    id,
    errors.length ? "fail" : "pass",
    `${status} application/problem+json matching ${PROBLEM_VERSION}`,
    errors.length ? errors.join("; ") : observationSummary(observed),
    observed.observation
  );
}

function checkIdsForPrefix(checks, prefix) {
  return checks.filter((check) => check.id.startsWith(prefix)).map((check) => check.id);
}

function outcomeForChecks(checks, ids) {
  const selected = checks.filter((check) => ids.includes(check.id));
  if (selected.some((check) => check.outcome === "fail")) return "fail";
  if (selected.some((check) => check.outcome === "unknown" || check.outcome === "not_run")) return "unknown";
  return selected.length ? "pass" : "unknown";
}

function buildResult(target, manifestUrl, observedAt, checks, manifest, limits) {
  const counts = { pass: 0, fail: 0, unknown: 0, not_run: 0 };
  for (const check of checks) counts[check.outcome] += 1;
  const result = counts.fail > 0
    ? "nonconformant"
    : counts.unknown > 0 || counts.not_run > 0
      ? "indeterminate"
      : "conformant";
  const expiresAt = new Date(new Date(observedAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const discoveryIds = checkIdsForPrefix(checks, "M.");
  const representationIds = checkIdsForPrefix(checks, "R.");
  const problemIds = checkIdsForPrefix(checks, "E.");
  const manifestValid = checks.some((check) => check.id === "M.SCHEMA" && check.outcome === "pass");
  const claims = [
    {
      id: "surface.discovery",
      scope: [manifestUrl],
      evidence_state: "tested",
      outcome: outcomeForChecks(checks, discoveryIds),
      test_ids: discoveryIds
    }
  ];
  if (representationIds.some((id) => checks.find((check) => check.id === id)?.outcome !== "not_run")) {
    claims.push({
      id: "surface.representations",
      scope: manifest.resources.map((resource) => resource.href),
      evidence_state: "tested",
      outcome: outcomeForChecks(checks, representationIds),
      test_ids: representationIds
    });
  }
  if (problemIds.some((id) => checks.find((check) => check.id === id)?.outcome !== "not_run")) {
    const testedPath = checks.find((check) => check.id === "E.STATUS")?.observation?.request?.url;
    claims.push({
      id: "surface.route_not_found",
      scope: [testedPath],
      evidence_state: "tested",
      outcome: outcomeForChecks(checks, problemIds),
      test_ids: problemIds
    });
  }
  return {
    schema_version: RESULT_VERSION,
    profile: PROFILE,
    target,
    manifest_url: manifestUrl,
    verifier: { name: "xenia-surface-check", version: CHECKER_VERSION },
    observed_at: observedAt,
    expires_at: expiresAt,
    result,
    scope: "Unauthenticated GET probes of the canonical manifest, every declared public resource, and one unpredictable route-not-found path.",
    limits,
    counts,
    checks,
    claims,
    declared_claims: manifestValid && Array.isArray(manifest?.claims) ? manifest.claims : [],
    not_tested: [
      ...new Set([
        ...PROFILE_LIMITS,
        ...(manifestValid && Array.isArray(manifest?.not_covered) ? manifest.not_covered : [])
      ])
    ]
  };
}

function addDependentNotRun(checks, target, reason) {
  addNotRun(checks, "R.NOT_RUN", "declared resource checks", target, "application/json", reason);
  addNotRun(checks, "E.NOT_RUN", "unpredictable 404 problem check", target, "application/problem+json", reason);
}

export async function checkSurface(input, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available");

  let targetUrl;
  try {
    targetUrl = new URL(input);
    if (
      !/^https?:$/.test(targetUrl.protocol) ||
      targetUrl.username ||
      targetUrl.password ||
      targetUrl.pathname !== "/" ||
      targetUrl.search ||
      targetUrl.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("target must be a credential-free HTTP(S) origin with no path, query, or fragment");
  }
  if (targetUrl.protocol !== "https:" && !isLoopbackHost(targetUrl.hostname)) {
    throw new Error("public targets must use HTTPS; HTTP is allowed only for loopback development");
  }

  const target = `${targetUrl.origin}/`;
  const manifestUrl = new URL(MANIFEST_PATH, target).href;
  const observedAt = (options.now ? new Date(options.now) : new Date()).toISOString();
  const requestTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS;
  const resourceMaxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 30_000) {
    throw new Error("timeoutMs must be an integer from 100 to 30000");
  }
  if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 100 || totalTimeoutMs > 120_000) {
    throw new Error("totalTimeoutMs must be an integer from 100 to 120000");
  }
  if (!Number.isInteger(resourceMaxBodyBytes) || resourceMaxBodyBytes < 1024 || resourceMaxBodyBytes > 10_000_000) {
    throw new Error("maxBodyBytes must be an integer from 1024 to 10000000");
  }
  const limits = {
    request_timeout_ms: requestTimeoutMs,
    total_timeout_ms: totalTimeoutMs,
    manifest_problem_max_bytes: METADATA_MAX_BODY_BYTES,
    resource_max_bytes: resourceMaxBodyBytes
  };
  const requestOptions = {
    fetchImpl,
    timeoutMs: limits.request_timeout_ms,
    totalTimeoutMs: limits.total_timeout_ms,
    deadlineAt: Date.now() + totalTimeoutMs
  };
  const checks = [];

  const manifestObserved = await observe(
    manifestUrl,
    "application/json",
    requestOptions,
    METADATA_MAX_BODY_BYTES
  );
  if (!manifestObserved.observation.response) {
    addCheck(
      checks,
      "M.STATUS",
      "unknown",
      "HTTP 200",
      manifestObserved.observation.error,
      manifestObserved.observation
    );
    addNotRun(checks, "M.CONTENT_TYPE", "application/json", manifestUrl, "application/json", "manifest request was unknown");
    addNotRun(checks, "M.JSON", "valid JSON object", manifestUrl, "application/json", "manifest request was unknown");
    addNotRun(checks, "M.SCHEMA", MANIFEST_VERSION, manifestUrl, "application/json", "manifest request was unknown");
    addDependentNotRun(checks, target, "manifest could not be observed");
    return buildResult(target, manifestUrl, observedAt, checks, null, limits);
  }

  const manifestResponse = manifestObserved.observation.response;
  addCheck(
    checks,
    "M.STATUS",
    manifestResponse.status === 200 ? "pass" : "fail",
    "HTTP 200",
    manifestResponse.status,
    manifestObserved.observation
  );
  addCheck(
    checks,
    "M.CONTENT_TYPE",
    mediaTypeEssence(manifestResponse.content_type) === "application/json" ? "pass" : "fail",
    "application/json",
    manifestResponse.content_type || "missing",
    manifestObserved.observation
  );
  if (manifestObserved.observation.error) {
    const invalidBody = Boolean(manifestObserved.bodyError);
    addCheck(
      checks,
      "M.JSON",
      invalidBody ? "fail" : "unknown",
      "valid JSON object",
      manifestObserved.observation.error,
      manifestObserved.observation
    );
    addCheck(
      checks,
      "M.SCHEMA",
      "not_run",
      MANIFEST_VERSION,
      invalidBody ? "manifest body is not valid UTF-8" : "manifest body could not be read",
      manifestObserved.observation
    );
    addDependentNotRun(checks, target, invalidBody ? "manifest body is not valid UTF-8" : "manifest body could not be read");
    return buildResult(target, manifestUrl, observedAt, checks, null, limits);
  }
  const manifestParsed = parseJson(manifestObserved.body);
  addCheck(
    checks,
    "M.JSON",
    manifestParsed.error ? "fail" : "pass",
    "valid JSON object",
    manifestParsed.error || "valid JSON object",
    manifestObserved.observation
  );
  const manifest = manifestParsed.value;
  const manifestErrors = manifestParsed.error ? [manifestParsed.error] : validateManifest(manifest, target);
  addCheck(
    checks,
    "M.SCHEMA",
    manifestErrors.length ? "fail" : "pass",
    MANIFEST_VERSION,
    manifestErrors.length ? manifestErrors.join("; ") : MANIFEST_VERSION,
    manifestObserved.observation
  );
  if (checks.some((check) => check.id.startsWith("M.") && check.outcome !== "pass")) {
    addDependentNotRun(checks, target, "manifest failed a required check");
    return buildResult(target, manifestUrl, observedAt, checks, manifest, limits);
  }

  for (const resource of manifest.resources) {
    const prefix = `R.${resource.id.toUpperCase().replace(/[^A-Z0-9._-]/g, "_")}`;
    const url = resource.href;
    const cases = [
      ["JSON", "application/json", "application/json"],
      ["QUALITY_JSON", "text/html;q=0, application/json;q=1", "application/json"],
      ["APPLICATION_WILDCARD", "application/*;q=1, text/html;q=0.2", "application/json"],
      ["ANY", "*/*", resource.default_media_type]
    ];
    if (resource.representations.includes("text/html")) {
      cases.push(
        ["HTML", "text/html", "text/html"],
        ["QUALITY_HTML", "application/json;q=0.2, text/html;q=1", "text/html"],
        ["ZERO_JSON", "application/json;q=0, */*;q=1", "text/html"]
      );
    } else {
      cases.push(
        ["HTML", "text/html", "problem:406"],
        ["ZERO_JSON", "application/json;q=0, */*;q=1", "problem:406"]
      );
    }

    for (const [caseId, accept, expected] of cases) {
      const maxBodyBytes = expected === "problem:406" ? METADATA_MAX_BODY_BYTES : resourceMaxBodyBytes;
      const observed = await observe(url, accept, requestOptions, maxBodyBytes);
      if (expected === "problem:406") checkProblem(checks, `${prefix}.${caseId}`, observed, 406, { expectedCode: "not_acceptable", resource });
      else checkRepresentation(checks, `${prefix}.${caseId}`, observed, expected);
      checkVary(checks, `${prefix}.${caseId}_VARY`, observed);
    }

    const unsupported = await observe(
      url,
      "application/x-xenia-unsupported",
      requestOptions,
      METADATA_MAX_BODY_BYTES
    );
    checkProblem(checks, `${prefix}.UNSUPPORTED`, unsupported, 406, { expectedCode: "not_acceptable", resource });
    checkVary(checks, `${prefix}.UNSUPPORTED_VARY`, unsupported);
  }

  const missingUrl = new URL(`/${randomBytes(24).toString("base64url")}`, target).href;
  const missing = await observe(
    missingUrl,
    "application/problem+json",
    requestOptions,
    METADATA_MAX_BODY_BYTES
  );
  addCheck(
    checks,
    "E.STATUS",
    observationOutcome(missing, (value) => value.observation.response.status === 404),
    "HTTP 404",
    missing.observation.error || missing.observation.response.status,
    missing.observation
  );
  addCheck(
    checks,
    "E.CONTENT_TYPE",
    observationOutcome(
      missing,
      (value) => mediaTypeEssence(value.observation.response.content_type) === "application/problem+json"
    ),
    "application/problem+json",
    missing.observation.error || missing.observation.response.content_type || "missing",
    missing.observation
  );
  checkProblem(checks, "E.SCHEMA", missing, 404, {
    expectedCode: "route_not_found",
    manifestUrl
  });
  checkVary(checks, "E.VARY", missing);

  return buildResult(target, manifestUrl, observedAt, checks, manifest, limits);
}

function usage() {
  return [
    "Usage: node surface/0.1/check.mjs <origin> [--json] [--timeout-ms=5000] [--max-bytes=1000000]",
    "",
    "The target must be an HTTP(S) origin such as https://example.com/.",
    "Exit codes: 0 conformant, 1 nonconformant or indeterminate, 2 CLI misuse or checker defect."
  ].join("\n");
}

function printHuman(result) {
  const lines = [
    `XENIA Surface 0.1: ${result.result.toUpperCase()}`,
    `target: ${result.target}`,
    `observed: ${result.observed_at}`,
    `expires: ${result.expires_at}`,
    ""
  ];
  for (const check of result.checks) {
    lines.push(`${check.outcome.toUpperCase().padEnd(9)} ${check.id}: ${check.observed}`);
  }
  lines.push("", "Not tested by this profile:");
  for (const boundary of result.not_tested) lines.push(`- ${boundary}`);
  return lines.join("\n");
}

function optionNumber(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return Number(inline.slice(name.length + 1));
  const index = args.indexOf(name);
  if (index >= 0) return Number(args[index + 1]);
  return fallback;
}

function positionalArgs(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json" || arg === "--help" || arg === "-h") continue;
    if (arg === "--timeout-ms" || arg === "--max-bytes") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--timeout-ms=") || arg.startsWith("--max-bytes=")) continue;
    values.push(arg);
  }
  return values;
}

async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return 0;
  }
  const positional = positionalArgs(args);
  if (positional.length !== 1) {
    console.error(usage());
    return 2;
  }
  const timeoutMs = optionNumber(args, "--timeout-ms", DEFAULT_TIMEOUT_MS);
  const maxBodyBytes = optionNumber(args, "--max-bytes", DEFAULT_MAX_BODY_BYTES);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    console.error("--timeout-ms must be an integer from 100 to 30000");
    return 2;
  }
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 10_000_000) {
    console.error("--max-bytes must be an integer from 1024 to 10000000");
    return 2;
  }
  try {
    const result = await checkSurface(positional[0], { timeoutMs, maxBodyBytes });
    console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : printHuman(result));
    return result.result === "conformant" ? 0 : 1;
  } catch (error) {
    console.error(String(error.message || error));
    return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  process.exitCode = await main(process.argv.slice(2));
}
