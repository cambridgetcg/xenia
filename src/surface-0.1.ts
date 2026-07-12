// SPDX-License-Identifier: MPL-2.0

import { mergeVary } from "./negotiation.js";

export const SURFACE_PROFILE = "xenia-surface/0.1" as const;
export const SURFACE_MANIFEST_VERSION = "xenia.surface.manifest/0.1" as const;
export const SURFACE_PROBLEM_VERSION = "xenia.surface.problem/0.1" as const;
export const SURFACE_MANIFEST_PATH = "/.well-known/agent.json" as const;
export const SURFACE_MANIFEST_SCHEMA_URL =
  "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/manifest.schema.json" as const;
export const SURFACE_PROBLEM_SCHEMA_URL =
  "https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json" as const;
export const SURFACE_PROFILE_DOCUMENTATION_URL =
  "https://github.com/cambridgetcg/xenia/blob/surface-v0.1.0-rc.1/surface/0.1/README.md" as const;

export const SURFACE_DEFAULT_NOT_COVERED = Object.freeze([
  "identity control",
  "actor authorization",
  "consent",
  "privacy and retention",
  "continuity and portability",
  "economic behavior",
  "unprobed routes",
] as const);

export type SurfaceMediaType = "application/json" | "text/html";
export type SurfaceNegotiatedRepresentation = SurfaceMediaType | "not-acceptable";
export type SurfaceClaimEvidenceState = "asserted" | "tested" | "attested";
export type SurfaceClaimOutcome = "pass" | "fail" | "unknown";
export type SurfaceEvidenceKind =
  | "probe"
  | "source"
  | "audit"
  | "signature"
  | "receipt";

export interface SurfaceService {
  readonly name: string;
  readonly canonical_url: string;
  readonly description: string;
}

export interface SurfaceResource {
  readonly id: string;
  readonly href: string;
  readonly representations: readonly SurfaceMediaType[];
  readonly default_media_type: SurfaceMediaType;
  readonly auth: "none";
  readonly description?: string;
}

export interface SurfaceEvidence {
  readonly kind: SurfaceEvidenceKind;
  readonly uri: string;
  readonly observed_at: string;
  readonly expires_at: string;
  readonly digest: string;
  readonly verifier: string;
  readonly algorithm?: "ed25519" | "receipt";
  readonly key_id?: string;
  readonly signature?: string;
  readonly issuer?: string;
}

export interface SurfaceClaim {
  readonly id: string;
  readonly statement: string;
  readonly scope: readonly string[];
  readonly evidence_state: SurfaceClaimEvidenceState;
  readonly outcome: SurfaceClaimOutcome;
  readonly evidence: readonly SurfaceEvidence[];
}

export interface SurfaceManifest {
  readonly $schema: typeof SURFACE_MANIFEST_SCHEMA_URL;
  readonly schema_version: typeof SURFACE_MANIFEST_VERSION;
  readonly profile: typeof SURFACE_PROFILE;
  readonly service: SurfaceService;
  readonly resources: readonly SurfaceResource[];
  readonly problem_schema: typeof SURFACE_PROBLEM_SCHEMA_URL;
  readonly claims: readonly SurfaceClaim[];
  readonly not_covered: readonly string[];
  readonly documentation?: string;
}

export interface SurfaceNextAction {
  readonly rel: string;
  readonly href: string;
  readonly method: "GET";
  readonly accept: string;
  readonly description?: string;
}

export interface SurfaceProblem {
  readonly schema_version: typeof SURFACE_PROBLEM_VERSION;
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly retryable: boolean;
  readonly terminal: boolean;
  readonly next_actions: readonly SurfaceNextAction[];
  readonly docs: readonly string[];
  readonly error?: string;
}

export interface SurfaceServiceDefinition {
  readonly name: string;
  readonly canonicalUrl: string;
  readonly description: string;
}

export interface SurfaceResourceDefinition {
  readonly id: string;
  readonly href: string;
  readonly representations?: readonly SurfaceMediaType[];
  readonly defaultMediaType?: SurfaceMediaType;
  readonly description?: string;
}

export interface SurfaceEvidenceDefinition {
  readonly kind: SurfaceEvidenceKind;
  readonly uri: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly digest: string;
  readonly verifier: string;
  readonly algorithm?: "ed25519" | "receipt";
  readonly keyId?: string;
  readonly signature?: string;
  readonly issuer?: string;
}

export interface SurfaceClaimDefinition {
  readonly id: string;
  readonly statement: string;
  readonly scope: readonly string[];
  readonly evidenceState: SurfaceClaimEvidenceState;
  readonly outcome: SurfaceClaimOutcome;
  readonly evidence?: readonly SurfaceEvidenceDefinition[];
}

export interface SurfaceManifestDefinition {
  readonly service: SurfaceServiceDefinition;
  readonly resources: readonly SurfaceResourceDefinition[];
  readonly claims?: readonly SurfaceClaimDefinition[];
  readonly notCovered?: readonly string[];
  readonly documentation?: string;
}

export interface SurfaceNextActionDefinition {
  readonly rel: string;
  readonly href: string;
  readonly accept: string;
  readonly description?: string;
}

export interface SurfaceProblemDefinition {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly retryable: boolean;
  readonly terminal: boolean;
  readonly nextActions?: readonly SurfaceNextActionDefinition[];
  readonly docs?: readonly string[];
  readonly error?: string;
}

export interface SurfaceNotAcceptableProblemDefinition {
  readonly resource: SurfaceResource;
  readonly docs?: readonly string[];
}

export interface SurfaceRouteNotFoundProblemDefinition {
  readonly manifestUrl: string;
  readonly docs?: readonly string[];
}

type UnknownRecord = Record<string, unknown>;

const MEDIA_TYPES = new Set<SurfaceMediaType>(["application/json", "text/html"]);
const EVIDENCE_KINDS = new Set<SurfaceEvidenceKind>([
  "probe",
  "source",
  "audit",
  "signature",
  "receipt",
]);
const CLAIM_EVIDENCE_STATES = new Set<SurfaceClaimEvidenceState>([
  "asserted",
  "tested",
  "attested",
]);
const CLAIM_OUTCOMES = new Set<SurfaceClaimOutcome>(["pass", "fail", "unknown"]);
const STABLE_ID_PATTERN = /^[a-z][a-z0-9._-]*$/;
const PROBLEM_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const MEDIA_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const URI_CHARACTERS = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;
const LOOPBACK_HTTP_URL_PATTERN =
  /^http:\/\/(?:localhost|127(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|\[::1\])(?::[0-9]+)?(?:\/|$)/;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): asserts value is UnknownRecord {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
}

function assertKnownKeys(value: UnknownRecord, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`${label}.${key} is not defined by Surface 0.1`);
    }
  }
}

function characterLength(value: string): number {
  return [...value].length;
}

function assertStringLength(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string"
    || characterLength(value) < minimum
    || characterLength(value) > maximum
  ) {
    throw new TypeError(`${label} must be ${minimum} to ${maximum} characters`);
  }
}

function assertStableId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a stable lowercase identifier`);
  }
}

function assertUniqueStrings(
  value: unknown,
  minimum: number,
  maximum: number | undefined,
  itemMaximum: number,
  label: string,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length < minimum || (maximum !== undefined && value.length > maximum)) {
    throw new TypeError(
      maximum === undefined
        ? `${label} must contain at least ${minimum} item${minimum === 1 ? "" : "s"}`
        : `${label} must contain ${minimum} to ${maximum} items`,
    );
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== "string"
      || item.trim() === ""
      || characterLength(item) > itemMaximum
      || seen.has(item)
    ) {
      throw new TypeError(`${label} must contain unique, non-empty strings of at most ${itemMaximum} characters`);
    }
    seen.add(item);
  }
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  const octets = hostname.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^(?:0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255);
}

function parseSurfaceUrl(value: unknown, label: string): URL {
  if (
    typeof value !== "string"
    || !URI_CHARACTERS.test(value)
    || /%(?![A-Fa-f0-9]{2})/.test(value)
    || (!value.startsWith("https://") && !value.startsWith("http://"))
    || (value.startsWith("http://") && !LOOPBACK_HTTP_URL_PATTERN.test(value))
  ) {
    throw new TypeError(`${label} must be an absolute HTTPS URL or a loopback HTTP URL`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute HTTPS URL or a loopback HTTP URL`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username !== ""
    || url.password !== ""
    || (url.protocol === "http:" && !isLoopbackHostname(url.hostname))
  ) {
    throw new TypeError(`${label} must be an absolute HTTPS URL or a loopback HTTP URL`);
  }

  const authorityStart = value.indexOf("://") + 3;
  const authoritySuffix = value.slice(authorityStart);
  const authorityEndOffset = authoritySuffix.search(/[/?#]/);
  const authorityEnd = authorityEndOffset < 0 ? value.length : authorityStart + authorityEndOffset;
  const authority = value.slice(authorityStart, authorityEnd);
  const suffix = value.slice(authorityEnd);
  if (
    authority.includes("@")
    || suffix.includes("[")
    || suffix.includes("]")
    || value.indexOf("#") !== value.lastIndexOf("#")
  ) {
    throw new TypeError(`${label} must be an absolute HTTPS URL or a loopback HTTP URL`);
  }
  return url;
}

interface ParsedDateTime {
  readonly seconds: bigint;
  readonly leapSecond: boolean;
  readonly fraction: string;
}

function parseDateTime(value: unknown): ParsedDateTime | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [0, 31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month];
  if (month < 1 || month > 12 || maximumDay === undefined || day < 1 || day > maximumDay) {
    return null;
  }
  const leapSecond = hour === 23 && minute === 59 && second === 60;
  if (!leapSecond && (hour > 23 || minute > 59 || second > 59)) return null;

  const adjustedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear;
  const daysSinceEpoch = era * 146097 + dayOfEra - 719468;
  return {
    seconds: BigInt(daysSinceEpoch) * 86_400n
      + BigInt(hour * 3600 + minute * 60 + (leapSecond ? 59 : second)),
    leapSecond,
    fraction,
  };
}

function compareDateTimes(left: string, right: string): number | null {
  const first = parseDateTime(left);
  const second = parseDateTime(right);
  if (first === null || second === null) return null;
  if (first.seconds < second.seconds) return -1;
  if (first.seconds > second.seconds) return 1;
  if (first.leapSecond !== second.leapSecond) return first.leapSecond ? 1 : -1;
  const precision = Math.max(first.fraction.length, second.fraction.length);
  const firstFraction = first.fraction.padEnd(precision, "0");
  const secondFraction = second.fraction.padEnd(precision, "0");
  if (firstFraction < secondFraction) return -1;
  if (firstFraction > secondFraction) return 1;
  return 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as UnknownRecord)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function assertWireResource(
  value: unknown,
  label: string,
  expectedOrigin?: string,
): asserts value is SurfaceResource {
  assertRecord(value, label);
  assertKnownKeys(
    value,
    ["id", "href", "representations", "default_media_type", "auth", "description"],
    label,
  );
  assertStableId(value.id, `${label}.id`);
  const href = parseSurfaceUrl(value.href, `${label}.href`);
  if (href.search !== "" || href.hash !== "") {
    throw new TypeError(`${label}.href must not contain a query or fragment`);
  }
  if (expectedOrigin !== undefined && href.origin !== expectedOrigin) {
    throw new TypeError(`${label}.href must be same-origin with the service`);
  }
  if (!Array.isArray(value.representations) || value.representations.length < 1 || value.representations.length > 2) {
    throw new TypeError(`${label}.representations must contain one or both defined media types`);
  }
  const representations = value.representations;
  if (
    representations.some((item) => typeof item !== "string" || !MEDIA_TYPES.has(item as SurfaceMediaType))
    || new Set(representations).size !== representations.length
    || !representations.includes("application/json")
  ) {
    throw new TypeError(`${label}.representations must uniquely contain application/json and optionally text/html`);
  }
  if (
    typeof value.default_media_type !== "string"
    || !MEDIA_TYPES.has(value.default_media_type as SurfaceMediaType)
    || !representations.includes(value.default_media_type)
  ) {
    throw new TypeError(`${label}.default_media_type must name a declared representation`);
  }
  if (value.auth !== "none") throw new TypeError(`${label}.auth must be none`);
  if (value.description !== undefined) {
    assertStringLength(value.description, 0, 500, `${label}.description`);
  }
}

function mapResourceDefinition(
  value: unknown,
  index: number,
  expectedOrigin: string,
): SurfaceResource {
  const label = `definition.resources[${index}]`;
  assertRecord(value, label);
  assertKnownKeys(value, ["id", "href", "representations", "defaultMediaType", "description"], label);
  assertStableId(value.id, `${label}.id`);
  const href = parseSurfaceUrl(value.href, `${label}.href`);
  if (href.origin !== expectedOrigin) throw new TypeError(`${label}.href must be same-origin with the service`);
  if (href.search !== "" || href.hash !== "") {
    throw new TypeError(`${label}.href must not contain a query or fragment`);
  }

  const rawRepresentations = value.representations ?? ["application/json"];
  if (!Array.isArray(rawRepresentations)) {
    throw new TypeError(`${label}.representations must be an array`);
  }
  const representations = [...rawRepresentations];
  if (
    representations.length < 1
    || representations.length > 2
    || representations.some((item) => typeof item !== "string" || !MEDIA_TYPES.has(item as SurfaceMediaType))
    || new Set(representations).size !== representations.length
    || !representations.includes("application/json")
  ) {
    throw new TypeError(`${label}.representations must uniquely contain application/json and optionally text/html`);
  }
  const defaultMediaType = value.defaultMediaType
    ?? (representations.includes("text/html") ? "text/html" : "application/json");
  if (
    typeof defaultMediaType !== "string"
    || !MEDIA_TYPES.has(defaultMediaType as SurfaceMediaType)
    || !representations.includes(defaultMediaType)
  ) {
    throw new TypeError(`${label}.defaultMediaType must name a declared representation`);
  }
  if (value.description !== undefined) {
    assertStringLength(value.description, 0, 500, `${label}.description`);
  }
  return {
    id: value.id,
    href: String(value.href),
    representations: representations as SurfaceMediaType[],
    default_media_type: defaultMediaType as SurfaceMediaType,
    auth: "none",
    ...(value.description !== undefined ? { description: value.description as string } : {}),
  };
}

function assertWireEvidence(value: unknown, label: string): asserts value is SurfaceEvidence {
  assertRecord(value, label);
  assertKnownKeys(
    value,
    ["kind", "uri", "observed_at", "expires_at", "digest", "verifier", "algorithm", "key_id", "signature", "issuer"],
    label,
  );
  if (typeof value.kind !== "string" || !EVIDENCE_KINDS.has(value.kind as SurfaceEvidenceKind)) {
    throw new TypeError(`${label}.kind is not defined by Surface 0.1`);
  }
  parseSurfaceUrl(value.uri, `${label}.uri`);
  if (parseDateTime(value.observed_at) === null) {
    throw new TypeError(`${label}.observed_at must be an uppercase UTC date-time`);
  }
  if (parseDateTime(value.expires_at) === null) {
    throw new TypeError(`${label}.expires_at must be an uppercase UTC date-time`);
  }
  if (compareDateTimes(value.expires_at as string, value.observed_at as string)! <= 0) {
    throw new TypeError(`${label}.expires_at must be after observed_at`);
  }
  if (typeof value.digest !== "string" || !DIGEST_PATTERN.test(value.digest)) {
    throw new TypeError(`${label}.digest must be a lowercase sha256 digest`);
  }
  parseSurfaceUrl(value.verifier, `${label}.verifier`);
  if (value.algorithm !== undefined && value.algorithm !== "ed25519" && value.algorithm !== "receipt") {
    throw new TypeError(`${label}.algorithm is not defined by Surface 0.1`);
  }
  if (value.key_id !== undefined) parseSurfaceUrl(value.key_id, `${label}.key_id`);
  if (value.signature !== undefined && (typeof value.signature !== "string" || !SIGNATURE_PATTERN.test(value.signature))) {
    throw new TypeError(`${label}.signature must be a 64-byte base64 Ed25519 signature`);
  }
  if (value.issuer !== undefined) parseSurfaceUrl(value.issuer, `${label}.issuer`);
  if (value.kind === "signature") {
    if (value.algorithm !== "ed25519") throw new TypeError(`${label}.algorithm must be ed25519`);
    if (value.key_id === undefined) throw new TypeError(`${label}.key_id is required for signature evidence`);
    if (value.signature === undefined) {
      throw new TypeError(`${label}.signature is required for signature evidence`);
    }
  }
  if (value.kind === "receipt") {
    if (value.algorithm !== "receipt") throw new TypeError(`${label}.algorithm must be receipt`);
    if (value.issuer === undefined) throw new TypeError(`${label}.issuer is required for receipt evidence`);
  }
}

function mapEvidenceDefinition(value: unknown, label: string): SurfaceEvidence {
  assertRecord(value, label);
  assertKnownKeys(
    value,
    ["kind", "uri", "observedAt", "expiresAt", "digest", "verifier", "algorithm", "keyId", "signature", "issuer"],
    label,
  );
  const wire: SurfaceEvidence = {
    kind: value.kind as SurfaceEvidenceKind,
    uri: value.uri as string,
    observed_at: value.observedAt as string,
    expires_at: value.expiresAt as string,
    digest: value.digest as string,
    verifier: value.verifier as string,
    ...(value.algorithm !== undefined ? { algorithm: value.algorithm as "ed25519" | "receipt" } : {}),
    ...(value.keyId !== undefined ? { key_id: value.keyId as string } : {}),
    ...(value.signature !== undefined ? { signature: value.signature as string } : {}),
    ...(value.issuer !== undefined ? { issuer: value.issuer as string } : {}),
  };
  assertWireEvidence(wire, label);
  return wire;
}

function assertWireClaim(value: unknown, label: string): asserts value is SurfaceClaim {
  assertRecord(value, label);
  assertKnownKeys(value, ["id", "statement", "scope", "evidence_state", "outcome", "evidence"], label);
  assertStableId(value.id, `${label}.id`);
  assertStringLength(value.statement, 1, 1000, `${label}.statement`);
  assertUniqueStrings(value.scope, 1, undefined, 300, `${label}.scope`);
  if (
    typeof value.evidence_state !== "string"
    || !CLAIM_EVIDENCE_STATES.has(value.evidence_state as SurfaceClaimEvidenceState)
  ) {
    throw new TypeError(`${label}.evidence_state is not defined by Surface 0.1`);
  }
  if (typeof value.outcome !== "string" || !CLAIM_OUTCOMES.has(value.outcome as SurfaceClaimOutcome)) {
    throw new TypeError(`${label}.outcome is not defined by Surface 0.1`);
  }
  if (!Array.isArray(value.evidence)) throw new TypeError(`${label}.evidence must be an array`);
  value.evidence.forEach((evidence, index) => assertWireEvidence(evidence, `${label}.evidence[${index}]`));
  if (value.evidence_state === "asserted" && value.evidence.length !== 0) {
    throw new TypeError(`${label}.asserted must not carry evidence`);
  }
  if (
    value.evidence_state === "tested"
    && !value.evidence.some((evidence) => evidence.kind === "probe" || evidence.kind === "audit")
  ) {
    throw new TypeError(`${label}.tested requires probe or audit evidence`);
  }
  if (
    value.evidence_state === "attested"
    && !value.evidence.some((evidence) => evidence.kind === "signature" || evidence.kind === "receipt")
  ) {
    throw new TypeError(`${label}.attested requires signature or receipt evidence`);
  }
}

function mapClaimDefinition(value: unknown, index: number): SurfaceClaim {
  const label = `definition.claims[${index}]`;
  assertRecord(value, label);
  assertKnownKeys(value, ["id", "statement", "scope", "evidenceState", "outcome", "evidence"], label);
  if (value.evidence !== undefined && !Array.isArray(value.evidence)) {
    throw new TypeError(`${label}.evidence must be an array`);
  }
  const evidence = (value.evidence ?? []).map((item, evidenceIndex) =>
    mapEvidenceDefinition(item, `${label}.evidence[${evidenceIndex}]`)
  );
  const wire: SurfaceClaim = {
    id: value.id as string,
    statement: value.statement as string,
    scope: Array.isArray(value.scope) ? [...value.scope] as string[] : value.scope as string[],
    evidence_state: value.evidenceState as SurfaceClaimEvidenceState,
    outcome: value.outcome as SurfaceClaimOutcome,
    evidence,
  };
  assertWireClaim(wire, label);
  return wire;
}

function assertWireManifest(value: unknown): asserts value is SurfaceManifest {
  assertRecord(value, "manifest");
  assertKnownKeys(
    value,
    ["$schema", "schema_version", "profile", "service", "resources", "problem_schema", "claims", "not_covered", "documentation"],
    "manifest",
  );
  if (value.$schema !== SURFACE_MANIFEST_SCHEMA_URL) {
    throw new TypeError("manifest.$schema must use the release-pinned Surface 0.1 schema");
  }
  if (value.schema_version !== SURFACE_MANIFEST_VERSION) {
    throw new TypeError(`manifest.schema_version must be ${SURFACE_MANIFEST_VERSION}`);
  }
  if (value.profile !== SURFACE_PROFILE) throw new TypeError(`manifest.profile must be ${SURFACE_PROFILE}`);
  assertRecord(value.service, "manifest.service");
  assertKnownKeys(value.service, ["name", "canonical_url", "description"], "manifest.service");
  assertStringLength(value.service.name, 1, 120, "manifest.service.name");
  assertStringLength(value.service.description, 1, 500, "manifest.service.description");
  const canonical = parseSurfaceUrl(value.service.canonical_url, "manifest.service.canonical_url");
  if (!Array.isArray(value.resources) || value.resources.length < 1 || value.resources.length > 8) {
    throw new TypeError("manifest.resources must contain one to eight resources");
  }
  const resourceIds = new Set<string>();
  value.resources.forEach((resource, index) => {
    assertWireResource(resource, `manifest.resources[${index}]`, canonical.origin);
    if (resourceIds.has(resource.id)) throw new TypeError(`manifest.resources[${index}].id must be unique`);
    resourceIds.add(resource.id);
  });
  if (value.problem_schema !== SURFACE_PROBLEM_SCHEMA_URL) {
    throw new TypeError("manifest.problem_schema must use the release-pinned Surface 0.1 schema");
  }
  if (!Array.isArray(value.claims)) throw new TypeError("manifest.claims must be an array");
  const claimIds = new Set<string>();
  value.claims.forEach((claim, index) => {
    assertWireClaim(claim, `manifest.claims[${index}]`);
    if (claimIds.has(claim.id)) throw new TypeError(`manifest.claims[${index}].id must be unique`);
    claimIds.add(claim.id);
  });
  assertUniqueStrings(value.not_covered, 1, undefined, 300, "manifest.not_covered");
  if (value.documentation !== undefined) parseSurfaceUrl(value.documentation, "manifest.documentation");
}

export function defineSurfaceManifest(definition: SurfaceManifestDefinition): SurfaceManifest {
  assertRecord(definition, "definition");
  assertKnownKeys(definition, ["service", "resources", "claims", "notCovered", "documentation"], "definition");
  assertRecord(definition.service, "definition.service");
  assertKnownKeys(definition.service, ["name", "canonicalUrl", "description"], "definition.service");
  assertStringLength(definition.service.name, 1, 120, "definition.service.name");
  assertStringLength(definition.service.description, 1, 500, "definition.service.description");
  const canonical = parseSurfaceUrl(definition.service.canonicalUrl, "definition.service.canonicalUrl");
  if (!Array.isArray(definition.resources) || definition.resources.length < 1 || definition.resources.length > 8) {
    throw new TypeError("definition.resources must contain one to eight resources");
  }
  const resources = definition.resources.map((resource, index) =>
    mapResourceDefinition(resource, index, canonical.origin)
  );
  const resourceIds = new Set<string>();
  resources.forEach((resource, index) => {
    if (resourceIds.has(resource.id)) throw new TypeError(`definition.resources[${index}].id must be unique`);
    resourceIds.add(resource.id);
  });

  if (definition.claims !== undefined && !Array.isArray(definition.claims)) {
    throw new TypeError("definition.claims must be an array");
  }
  const claims = (definition.claims ?? []).map(mapClaimDefinition);
  const claimIds = new Set<string>();
  claims.forEach((claim, index) => {
    if (claimIds.has(claim.id)) throw new TypeError(`definition.claims[${index}].id must be unique`);
    claimIds.add(claim.id);
  });

  if (definition.notCovered !== undefined) {
    assertUniqueStrings(definition.notCovered, 0, undefined, 300, "definition.notCovered");
  }
  const notCovered = [
    ...SURFACE_DEFAULT_NOT_COVERED,
    ...(definition.notCovered ?? []),
  ].filter((boundary, index, all) => all.indexOf(boundary) === index);
  if (definition.documentation !== undefined) {
    parseSurfaceUrl(definition.documentation, "definition.documentation");
  }
  const manifest: SurfaceManifest = {
    $schema: SURFACE_MANIFEST_SCHEMA_URL,
    schema_version: SURFACE_MANIFEST_VERSION,
    profile: SURFACE_PROFILE,
    service: {
      name: definition.service.name,
      canonical_url: definition.service.canonicalUrl,
      description: definition.service.description,
    },
    resources,
    problem_schema: SURFACE_PROBLEM_SCHEMA_URL,
    claims,
    not_covered: notCovered,
    documentation: definition.documentation ?? SURFACE_PROFILE_DOCUMENTATION_URL,
  };
  assertWireManifest(manifest);
  return deepFreeze(manifest);
}

interface MediaRange {
  readonly type: string;
  readonly subtype: string;
  readonly quality: number;
  readonly position: number;
}

interface MediaPreference {
  readonly quality: number;
  readonly specificity: number;
  readonly position: number;
}

function parseQuality(parameters: readonly string[]): number {
  const qualityParameters = parameters.filter((parameter) =>
    parameter.trim().toLowerCase().startsWith("q=")
  );
  if (qualityParameters.length === 0) return 1;
  if (qualityParameters.length > 1) return 0;
  const source = qualityParameters[0]?.trim().slice(2) ?? "";
  if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(source)) return 0;
  return Number(source);
}

function parseAccept(accept: string): MediaRange[] {
  const ranges: MediaRange[] = [];
  accept.split(",").forEach((part, position) => {
    const [mediaType = "", ...parameters] = part.split(";");
    const components = mediaType.trim().toLowerCase().split("/");
    if (components.length !== 2) return;
    const type = components[0] ?? "";
    const subtype = components[1] ?? "";
    if (
      !MEDIA_TOKEN_PATTERN.test(type)
      || !MEDIA_TOKEN_PATTERN.test(subtype)
      || (type === "*" && subtype !== "*")
    ) return;
    ranges.push({ type, subtype, quality: parseQuality(parameters), position });
  });
  return ranges;
}

function preferenceFor(mediaType: SurfaceMediaType, ranges: readonly MediaRange[]): MediaPreference {
  const [type = "", subtype = ""] = mediaType.split("/");
  let preference: MediaPreference = { quality: 0, specificity: -1, position: Number.MAX_SAFE_INTEGER };
  for (const range of ranges) {
    const specificity = range.type === type && range.subtype === subtype
      ? 2
      : range.type === type && range.subtype === "*"
        ? 1
        : range.type === "*" && range.subtype === "*"
          ? 0
          : -1;
    if (specificity < 0) continue;
    if (
      specificity > preference.specificity
      || (
        specificity === preference.specificity
        && (
          range.quality > preference.quality
          || (range.quality === preference.quality && range.position < preference.position)
        )
      )
    ) {
      preference = {
        quality: range.quality,
        specificity,
        position: range.position,
      };
    }
  }
  return preference;
}

export function negotiateSurfaceResource(
  resource: SurfaceResource,
  accept?: string | null,
): SurfaceNegotiatedRepresentation {
  assertWireResource(resource, "resource");
  if (accept !== undefined && accept !== null && typeof accept !== "string") {
    throw new TypeError("accept must be a string, null, or undefined");
  }
  const ranges = parseAccept(accept?.trim() || "*/*");
  const available = resource.representations.map((mediaType) => ({
    mediaType,
    preference: preferenceFor(mediaType, ranges),
  })).filter(({ preference }) => preference.quality > 0);
  if (available.length === 0) return "not-acceptable";
  available.sort((left, right) => {
    if (left.preference.quality !== right.preference.quality) {
      return right.preference.quality - left.preference.quality;
    }
    if (left.mediaType === resource.default_media_type) return -1;
    if (right.mediaType === resource.default_media_type) return 1;
    return left.preference.position - right.preference.position;
  });
  return available[0]?.mediaType ?? "not-acceptable";
}

function assertWireNextAction(value: unknown, label: string): asserts value is SurfaceNextAction {
  assertRecord(value, label);
  assertKnownKeys(value, ["rel", "href", "method", "accept", "description"], label);
  assertStableId(value.rel, `${label}.rel`);
  parseSurfaceUrl(value.href, `${label}.href`);
  if (value.method !== "GET") throw new TypeError(`${label}.method must be GET`);
  assertStringLength(value.accept, 3, 200, `${label}.accept`);
  if (value.description !== undefined) {
    assertStringLength(value.description, 0, 500, `${label}.description`);
  }
}

function assertWireProblem(value: unknown): asserts value is SurfaceProblem {
  assertRecord(value, "problem");
  assertKnownKeys(
    value,
    ["schema_version", "type", "title", "status", "code", "detail", "retryable", "terminal", "next_actions", "docs", "error"],
    "problem",
  );
  if (value.schema_version !== SURFACE_PROBLEM_VERSION) {
    throw new TypeError(`problem.schema_version must be ${SURFACE_PROBLEM_VERSION}`);
  }
  parseSurfaceUrl(value.type, "problem.type");
  assertStringLength(value.title, 1, 200, "problem.title");
  if (!Number.isInteger(value.status) || (value.status as number) < 400 || (value.status as number) > 599) {
    throw new TypeError("problem.status must be an HTTP error status");
  }
  if (typeof value.code !== "string" || !PROBLEM_CODE_PATTERN.test(value.code)) {
    throw new TypeError("problem.code must be a stable lowercase identifier");
  }
  assertStringLength(value.detail, 1, 2000, "problem.detail");
  if (typeof value.retryable !== "boolean") throw new TypeError("problem.retryable must be boolean");
  if (typeof value.terminal !== "boolean") throw new TypeError("problem.terminal must be boolean");
  if (!Array.isArray(value.next_actions)) throw new TypeError("problem.next_actions must be an array");
  value.next_actions.forEach((action, index) => assertWireNextAction(action, `problem.next_actions[${index}]`));
  assertUniqueStrings(value.docs, 1, undefined, Number.MAX_SAFE_INTEGER, "problem.docs");
  (value.docs as string[]).forEach((doc, index) => parseSurfaceUrl(doc, `problem.docs[${index}]`));
  if (value.error !== undefined) assertStringLength(value.error, 1, 500, "problem.error");
  if (value.terminal && value.next_actions.length !== 0) {
    throw new TypeError("terminal problems must not offer next actions");
  }
  if (!value.terminal && value.next_actions.length < 1) {
    throw new TypeError("non-terminal problems must offer at least one next action");
  }
}

export function createSurfaceProblem(definition: SurfaceProblemDefinition): SurfaceProblem {
  assertRecord(definition, "definition");
  assertKnownKeys(
    definition,
    ["type", "title", "status", "code", "detail", "retryable", "terminal", "nextActions", "docs", "error"],
    "definition",
  );
  if (definition.nextActions !== undefined && !Array.isArray(definition.nextActions)) {
    throw new TypeError("definition.nextActions must be an array");
  }
  const nextActions = (definition.nextActions ?? []).map((value, index): SurfaceNextAction => {
    const label = `definition.nextActions[${index}]`;
    assertRecord(value, label);
    assertKnownKeys(value, ["rel", "href", "accept", "description"], label);
    const action: SurfaceNextAction = {
      rel: value.rel as string,
      href: value.href as string,
      method: "GET",
      accept: value.accept as string,
      ...(value.description !== undefined ? { description: value.description as string } : {}),
    };
    assertWireNextAction(action, label);
    return action;
  });
  const docs = definition.docs ?? [SURFACE_PROFILE_DOCUMENTATION_URL];
  const problem: SurfaceProblem = {
    schema_version: SURFACE_PROBLEM_VERSION,
    type: definition.type,
    title: definition.title,
    status: definition.status,
    code: definition.code,
    detail: definition.detail,
    retryable: definition.retryable,
    terminal: definition.terminal,
    next_actions: nextActions,
    docs: Array.isArray(docs) ? [...docs] : docs,
    ...(definition.error !== undefined ? { error: definition.error } : {}),
  };
  assertWireProblem(problem);
  return deepFreeze(problem);
}

export function createSurfaceNotAcceptableProblem(
  definition: SurfaceNotAcceptableProblemDefinition,
): SurfaceProblem {
  assertRecord(definition, "definition");
  assertKnownKeys(definition, ["resource", "docs"], "definition");
  assertWireResource(definition.resource, "definition.resource");
  const resourceUrl = parseSurfaceUrl(definition.resource.href, "definition.resource.href");
  return createSurfaceProblem({
    type: new URL("/problems/not-acceptable", resourceUrl.origin).href,
    title: "No acceptable representation",
    status: 406,
    code: "not_acceptable",
    detail: "Request one of the media types declared for this resource.",
    retryable: false,
    terminal: false,
    nextActions: [{
      rel: "retry_with_supported_representation",
      href: definition.resource.href,
      accept: definition.resource.default_media_type,
    }],
    ...(definition.docs !== undefined ? { docs: definition.docs } : {}),
  });
}

export function createSurfaceRouteNotFoundProblem(
  definition: SurfaceRouteNotFoundProblemDefinition,
): SurfaceProblem {
  assertRecord(definition, "definition");
  assertKnownKeys(definition, ["manifestUrl", "docs"], "definition");
  const manifestUrl = parseSurfaceUrl(definition.manifestUrl, "definition.manifestUrl");
  if (
    manifestUrl.pathname !== SURFACE_MANIFEST_PATH
    || manifestUrl.search !== ""
    || manifestUrl.hash !== ""
  ) {
    throw new TypeError(`definition.manifestUrl must use the canonical ${SURFACE_MANIFEST_PATH} path`);
  }
  return createSurfaceProblem({
    type: new URL("/problems/route-not-found", manifestUrl.origin).href,
    title: "No resource exists at this path",
    status: 404,
    code: "route_not_found",
    detail: "Use the discovery manifest to find public resources.",
    retryable: false,
    terminal: false,
    nextActions: [{
      rel: "discover",
      href: manifestUrl.href,
      accept: "application/json",
    }],
    ...(definition.docs !== undefined ? { docs: definition.docs } : {}),
  });
}

function responseStatus(init: ResponseInit | undefined, fallback: number): number {
  const status = init?.status ?? fallback;
  if (!Number.isInteger(status)) throw new TypeError("response status must be an integer");
  return status;
}

function responseHeaders(
  init: ResponseInit | undefined,
  contentType: string,
): Headers {
  const headers = new Headers(init?.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.delete("Transfer-Encoding");
  headers.set("Content-Type", contentType);
  const vary = mergeVary(headers.get("Vary"), "Accept");
  if (vary === "*") {
    throw new TypeError("Surface responses require an explicit Vary: Accept token, not Vary: *");
  }
  headers.set("Vary", vary);
  return headers;
}

function responseInit(
  init: ResponseInit | undefined,
  status: number,
  contentType: string,
): ResponseInit {
  return {
    ...init,
    status,
    headers: responseHeaders(init, contentType),
  };
}

function serializeJsonDocument(
  value: unknown,
  label: string,
): { readonly body: string; readonly value: unknown } {
  let body: string | undefined;
  try {
    body = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} must be JSON-serializable`);
  }
  if (body === undefined) throw new TypeError(`${label} must serialize to a JSON document`);
  return { body, value: JSON.parse(body) as unknown };
}

export function createSurfaceManifestResponse(
  manifest: SurfaceManifest,
  init?: ResponseInit,
): Response {
  assertWireManifest(manifest);
  const status = responseStatus(init, 200);
  if (status !== 200) throw new TypeError("manifest response status must be 200");
  const serialized = serializeJsonDocument(manifest, "manifest");
  assertWireManifest(serialized.value);
  return new Response(
    serialized.body,
    responseInit(init, status, "application/json; charset=utf-8"),
  );
}

export function createSurfaceResourceResponse(
  mediaType: SurfaceMediaType,
  body: unknown,
  init?: ResponseInit,
): Response {
  if (!MEDIA_TYPES.has(mediaType)) {
    throw new TypeError("mediaType must be application/json or text/html");
  }
  const status = responseStatus(init, 200);
  if (status < 200 || status >= 300) throw new TypeError("resource response status must be 2xx");
  let serialized: string;
  if (mediaType === "application/json") {
    const document = serializeJsonDocument(body, "JSON resource body");
    if (
      !isRecord(document.value)
      || typeof document.value.schema_version !== "string"
      || document.value.schema_version.trim() === ""
    ) {
      throw new TypeError("JSON resource body must be a non-array object with a non-empty schema_version");
    }
    serialized = document.body;
  } else {
    if (typeof body !== "string") throw new TypeError("HTML resource body must be a string");
    serialized = body;
  }
  return new Response(
    serialized,
    responseInit(init, status, `${mediaType}; charset=utf-8`),
  );
}

export function createSurfaceProblemResponse(
  problem: SurfaceProblem,
  init?: ResponseInit,
): Response {
  assertWireProblem(problem);
  const status = responseStatus(init, problem.status);
  if (status !== problem.status) {
    throw new TypeError("problem response status must equal the problem body status");
  }
  const serialized = serializeJsonDocument(problem, "problem");
  assertWireProblem(serialized.value);
  return new Response(
    serialized.body,
    responseInit(init, status, "application/problem+json; charset=utf-8"),
  );
}
