#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

// XENIA Arrival 0.1 development-draft checker.
//
// It compares the exchanges recorded in one two-visit fixture with the twenty
// Arrival 0.1 checks. It reads the bytes it is given, or one local file, and
// contacts nothing. A result says, per check, whether the recorded exchanges
// agree with that check; it establishes nothing listed in NOT_ESTABLISHED.
//
// Reused by copying, not by importing, so this file needs only node: modules:
// - work/0.1/check.mjs: the input pipeline (size, strict UTF-8, one JSON
//   value), the repeated-key preflight, the timestamp check and comparison,
//   the bounded file read (here a path is looked at before it is opened, so
//   a named pipe is refused and not waited on), the result shape, and the
//   credential patterns, which are adapted (see SECRET_SHAPES).
// - surface/0.1/check.mjs: the address test and the problem rules of
//   validateProblem, which here return rule names instead of sentences so
//   that no field name or value from a fixture reaches a result.
// The three document schemas beside this file are read on first use and
// applied by the small validator below, which knows only the JSON Schema
// keywords those schemas use and stops on any other.

import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ARRIVAL_PROFILE = "xenia-arrival/0.1-development";
export const ARRIVAL_RESULT_VERSION = "xenia.arrival.result/0.1-development";
export const ARRIVAL_CHECKER_VERSION = "0.1.0-development";
export const MAX_INPUT_BYTES = 262144;
export const MAX_ORIENTATION_BYTES = 8192;
export const MAX_VIEW_BYTES = 65536;
export const MAX_JSON_DEPTH = 64;
export const MAX_ISSUES = 256;

const RESULT_SCHEMA_ID = "urn:xenia:arrival:result:0.1:development-draft";
const RESULT_SCOPE = "Offline comparison of the exchanges recorded in one supplied XENIA Arrival 0.1 fixture with the Arrival 0.1 checks; no host, network, credential, or other system was contacted.";
const RESULT_OUTPUT_HANDLING = "Treat this result at least as restrictively as the fixture; the artifact digest, issue paths, and counts may remain sensitive.";
const NOT_ESTABLISHED = Object.freeze([
  "that any host sent these exchanges, or behaves this way now",
  "that a read wrote nothing on the host; only declarations and the two recorded views were compared",
  "that nothing was acknowledged or written between the two reads; that statement is the recorder's own, and acts by other holders of the same credential are not ruled out",
  "that a difference between the reads was caused by reading",
  "that a section reported ok or quiet was read successfully, or that the view lists every section the host has",
  "who the reader is, that one reader or one credential made both reads, or that time passed between them",
  "whether the cursor is self-contained or a key to state the host keeps",
  "the truth of any time, count, summary or reference, or whether free text presses the reader",
  "how an acknowledgement behaves, or that any listed obligation is valid or binds anyone",
  "conformance, authority, consent, safety, or anything about a caller's inner state",
]);

// The twenty checks, in result order, each with what a pass means.
const CHECKS = Object.freeze([
  ["I.SIZE", `at most ${MAX_INPUT_BYTES} bytes`],
  ["I.UTF8", "strict UTF-8 without a byte-order mark"],
  ["I.JSON", `one JSON value with no repeated object key, nested at most ${MAX_JSON_DEPTH} deep`],
  ["I.SHAPE", "the fixture matches xenia.arrival.fixture/0.1-development"],
  ["I.NO_CREDENTIAL", "no field name, and no string outside cursors and positions, has a secret shape; no address has userinfo, or a query or fragment pair with a key named like a credential and a value; and no address in an address field fails to parse"],
  ["I.RECORD", "each request records the credential and cursor its slot is for, the view requests share one address that is not the orientation's, request times do not go back, the second read presents only the cursor the first view handed back, and the bad cursor is one no recorded view handed back"],
  ["R1.ORIENTATION", `status 200 with a valid orientation of at most ${MAX_ORIENTATION_BYTES} bytes that points at the view address`],
  ["R1.REFUSAL", "a 4xx XENIA Surface 0.1 problem with code credential_required, not terminal, whose first next action is the orientation address"],
  ["R1.VIEW", `each served view is valid, at most ${MAX_VIEW_BYTES} bytes, and repeats no section id and no item id inside a section`],
  ["P.PAIR", "both views served and valid, stating the same audience"],
  ["R2.DECLARED_EFFECTS", "every served document's read-effects declaration is stated, says none for the participant's record, and equals the others, the order of operational writes aside"],
  ["R2.SHOWN_AGAIN", "with nothing acknowledged by the recorder, the acknowledgement position is unmoved, no item shown in the same section on both reads has a different mark, every unacknowledged first-read item is equal on the second read or its change is named, and at least one was found equal"],
  ["R3.STATES", "every section and changes envelope of every served view agrees with the state table"],
  ["R3.SECTIONS_KEPT", "every first-read section is on the second read with the same kind and scope"],
  ["R4.CURSOR", "each served view hands back a cursor, and a view answering a request with no cursor is full, with no basis cursor and no changes"],
  ["R4.CHANGES", "the basis echoes the presented cursor, no changes entry names a section in neither view or contradicts the two views, every decidable difference this check owns is named, and at least one decidable difference was found and named"],
  ["R4.BAD_CURSOR", "a 4xx XENIA Surface 0.1 problem with code cursor_not_accepted, not terminal, with a next action back to the view address"],
  ["R5.FRESHNESS", "every served document states as_of and valid_until, valid_until is not before as_of, and the second view is not dated before the first; no time is compared with a request time or a clock"],
  ["R6.NO_OBLIGATION", "every served document says no reply is expected, every served view says reading creates no obligation, and each view sets owed_to and due_at only in its one recorded_obligations section"],
  ["R7.NON_CLAIMS", "every served document lists every not_established token of its kind"],
]);
export const CHECK_IDS = Object.freeze(CHECKS.map(([id]) => id));
const EXPECTED = new Map(CHECKS);

const REQUIRED_TOKENS = Object.freeze({
  orientation: Object.freeze(["anything_about_caller", "access_to_view"]),
  view: Object.freeze([
    "reader_sameness",
    "identity_beyond_credential",
    "completeness_beyond_bounds",
    "instruction_or_authority",
    "obligation_binds_reader",
    "waiver_by_silence",
    "other_layers_unrecorded",
  ]),
});

// From work/0.1/check.mjs (CREDENTIAL_NAME_PATTERN, CREDENTIAL_VALUE_PATTERNS),
// changed for a record whose prose may say "bearer" or "basic" and whose ids
// may begin "sk-": the sk- and Bearer/Basic shapes need 20 or more token
// characters with a digit among them, and the "token:" shape is dropped. The
// sk- and three-part eyJ shapes begin only where no token character comes
// before them, so a long run of such starts is read once and not once per
// start. The gh?_, AKIA and PEM shapes are as they were. This is a tripwire.
// A match is a failure whatever the value is; no match establishes nothing.
const SECRET_SHAPES = Object.freeze([
  /(?<![A-Za-z0-9_-])sk-(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:Bearer|Basic)\s+(?=[A-Za-z0-9._~+/-]*[0-9])[A-Za-z0-9._~+/-]{20,}=*/i,
  /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
]);

// Addresses. A field with one of these names holds an address in the three
// schemas or in a Surface problem; a string there that begins as a web
// address is one address, taken whole. Inside any other string, each run that
// begins as a web address and goes on to white space, a quote or an angle
// bracket is an address too.
const ADDRESS_FIELDS = new Set(["href", "ref", "deeper_read", "manifest", "type", "docs"]);
const ADDRESS_START = /^https?:\/\//i;
const ADDRESS_RUN = /https?:\/\/[^\s"'<>]+/gi;
// Applied to a query or fragment key once it is normalised (see
// normalisedKey). Whole parts only, so page_token, max_tokens and sort_key do
// not match; key, auth, sig and pass count only as the whole key, because
// each is also an ordinary word. The name alone decides: token=USDC matches.
const CREDENTIAL_NAMED = /(?:^|_)(?:password|passwd|pwd|passphrase|secret|authorization|bearer|credentials?|jwt|signature|cookie|session(?:id)?|(?:api|access|private)_?key|(?<!page_)token)(?:_|$)|^(?:key|auth|sig|pass)$/;

// The five exchange slots of a fixture, in the order their requests are read.
const SLOTS = Object.freeze([
  ["orientation", "first", "orientation"],
  ["refusal", "first", "view_without_credential"],
  ["first", "first", "view"],
  ["second", "second", "view"],
  ["bad", "second", "bad_cursor"],
]);

// States in which a section claims to list everything it has.
const WHOLE = new Set(["ok", "quiet"]);
// The changes kinds that name each kind of difference.
const NAMED_BY = Object.freeze({
  differs: Object.freeze(["changed"]),
  gone: Object.freeze(["ended", "out_of_window"]),
  new: Object.freeze(["added"]),
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** JSON with object keys sorted, so two values are equal when these strings are. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameValue(left, right) {
  return canonical(left) === canonical(right);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function pointer(path, token) {
  return `${path}/${String(token).replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

// --- Timestamps: timestampParts, validTimestamp and compareTimestamp of
// work/0.1/check.mjs, copied.

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

// --- Addresses: SURFACE_URL_PREFIX, URI_CHARACTERS, isAbsoluteHttpUrl and
// isSecureOrLoopbackUrl of surface/0.1/check.mjs, copied. The loopback test
// is written without Node's net module; the prefix already admits plain http
// only for localhost, 127.0.0.0/8 written as four numbers, and [::1].

const SURFACE_URL_PREFIX = /^(?:https:\/\/(?![^/?#]*@)|http:\/\/(?:localhost|127(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|\[::1\])(?::[0-9]+)?(?:\/|$))/;
const URI_CHARACTERS = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;

function isAbsoluteHttpUrl(value) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || !SURFACE_URL_PREFIX.test(value)
    || !URI_CHARACTERS.test(value)
    || /%(?![A-Fa-f0-9]{2})/.test(value)
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
  return hostname === "localhost"
    || hostname === "[::1]"
    || hostname === "::1"
    || /^127(?:\.[0-9]{1,3}){3}$/.test(hostname);
}

function isSecureOrLoopbackUrl(value) {
  if (!isAbsoluteHttpUrl(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname));
}

// --- Problems: the rules of validateProblem in surface/0.1/check.mjs,
// copied. Each broken rule is returned as [rule name, path below the body].

const PROBLEM_VERSION = "xenia.surface.problem/0.1";
const PROBLEM_FIELDS = new Set([
  "schema_version", "type", "title", "status", "code", "detail", "retryable", "terminal", "next_actions", "docs", "error",
]);
const NEXT_ACTION_FIELDS = new Set(["rel", "href", "method", "accept", "description"]);

function hasLength(value, minimum, maximum) {
  if (typeof value !== "string") return false;
  const length = [...value].length;
  return length >= minimum && length <= maximum;
}

function matchesString(value, pattern) {
  return typeof value === "string" && pattern.test(value);
}

function problemRuleFailures(problem, httpStatus) {
  if (!isObject(problem)) return [["not_an_object", ""]];
  const failed = [];
  if (Object.keys(problem).some((key) => !PROBLEM_FIELDS.has(key))) failed.push(["unknown_field", ""]);
  if (problem.schema_version !== PROBLEM_VERSION) failed.push(["schema_version", "/schema_version"]);
  if (!isSecureOrLoopbackUrl(problem.type)) failed.push(["type", "/type"]);
  if (!hasLength(problem.title, 1, 200)) failed.push(["title", "/title"]);
  if (!Number.isInteger(problem.status) || problem.status < 400 || problem.status > 599) {
    failed.push(["status", "/status"]);
  } else if (problem.status !== httpStatus) {
    failed.push(["status_differs", "/status"]);
  }
  if (!matchesString(problem.code, /^[a-z][a-z0-9_]{0,63}$/)) failed.push(["code", "/code"]);
  if (!hasLength(problem.detail, 1, 2000)) failed.push(["detail", "/detail"]);
  if (typeof problem.retryable !== "boolean") failed.push(["retryable", "/retryable"]);
  if (typeof problem.terminal !== "boolean") failed.push(["terminal", "/terminal"]);
  if (!Array.isArray(problem.next_actions)) {
    failed.push(["next_actions", "/next_actions"]);
  } else {
    for (const [index, action] of problem.next_actions.entries()) {
      const below = `/next_actions/${index}`;
      if (!isObject(action)) {
        failed.push(["next_action", below]);
        continue;
      }
      if (Object.keys(action).some((key) => !NEXT_ACTION_FIELDS.has(key))) failed.push(["next_action_unknown_field", below]);
      if (!matchesString(action.rel, /^[a-z][a-z0-9._-]*$/)) failed.push(["next_action_rel", `${below}/rel`]);
      if (!isSecureOrLoopbackUrl(action.href)) failed.push(["next_action_href", `${below}/href`]);
      if (action.method !== "GET") failed.push(["next_action_method", `${below}/method`]);
      if (!hasLength(action.accept, 3, 200)) failed.push(["next_action_accept", `${below}/accept`]);
      if (action.description !== undefined && !hasLength(action.description, 0, 500)) {
        failed.push(["next_action_description", `${below}/description`]);
      }
    }
  }
  if (
    !Array.isArray(problem.docs)
    || problem.docs.length === 0
    || !problem.docs.every(isSecureOrLoopbackUrl)
    || new Set(problem.docs).size !== problem.docs.length
  ) {
    failed.push(["docs", "/docs"]);
  }
  if (problem.error !== undefined && !hasLength(problem.error, 1, 500)) failed.push(["error", "/error"]);
  if (problem.terminal === true && problem.next_actions?.length !== 0) {
    failed.push(["terminal_with_next_actions", "/next_actions"]);
  }
  if (problem.terminal === false && problem.next_actions?.length < 1) {
    failed.push(["non_terminal_without_next_action", "/next_actions"]);
  }
  return failed;
}

// --- Issues and the result, after issue, pushIssue, countChecks and
// buildResult of work/0.1/check.mjs.

function boundedText(value, maximum) {
  const text = String(value);
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function issue(code, path, message) {
  return {
    code: boundedText(code, 64),
    path: boundedText(path, 1000),
    message: boundedText(message, 2000),
  };
}

/**
 * Collects the outcome of every check and its issues. A result holds at most
 * MAX_ISSUES issues. When more arise, three kinds are always kept: the first
 * failure of each check, its first undecidable point, and each issue that
 * several checks point at. The rest of the list is filled in the order the
 * issues arose. So a check that fails or is unknown has an issue in the list.
 */
class Report {
  constructor() {
    this.outcomes = new Map();
    this.kept = []; // the issues that are always kept: a few dozen at most
    this.others = []; // the rest, at most MAX_ISSUES of them
    this.sequence = 0;
    this.seen = new Set();
    this.final = null;
  }

  /**
   * `owner` is the id of the check an issue belongs to, or null for an issue
   * several checks point at. `kind` is fail or unknown.
   */
  issue(code, path, message, owner = null, kind = "fail") {
    this.sequence += 1;
    const entry = { order: this.sequence, owner, kind, issue: issue(code, path, message) };
    const first = `${owner} ${kind}`;
    if (owner === null || !this.seen.has(first)) {
      this.seen.add(first);
      this.kept.push(entry);
    } else if (this.others.length < MAX_ISSUES) {
      this.others.push(entry);
    }
  }

  /** The entries a result carries, in the order they arose. */
  entries() {
    if (this.final === null) {
      const room = Math.max(0, MAX_ISSUES - this.kept.length);
      this.final = [...this.kept.slice(0, MAX_ISSUES), ...this.others.slice(0, room)]
        .sort((left, right) => left.order - right.order);
    }
    return this.final;
  }

  /** How many issues of one check and one kind the result carries. */
  held(owner, kind) {
    return this.entries().filter((entry) => entry.owner === owner && entry.kind === kind).length;
  }

  /** `observed` is a sentence, or a function of this report that gives one once every issue is in. */
  set(id, outcome, observed) {
    this.outcomes.set(id, { outcome, observed });
  }

  outcome(id) {
    return this.outcomes.get(id)?.outcome;
  }

  /** Marks every check with no outcome yet as not run, for one stated reason. */
  rest(reason) {
    for (const id of CHECK_IDS) {
      if (!this.outcomes.has(id)) this.set(id, "not_run", reason);
    }
  }
}

/** "N things recorded as issues", or how many of them a full list holds. */
function recorded(count, word, held) {
  if (held === count) return `${plural(count, word)} recorded as ${count === 1 ? "an issue" : "issues"}.`;
  return `${plural(count, word)}; the issues list holds ${held} of them and is full at ${MAX_ISSUES}.`;
}

/**
 * One check's failures and undecidable points. Each is an issue of that
 * check. `unread` counts served documents the check would have read and did
 * not, because their bodies do not match their schema; those are recorded
 * once, as document_not_read issues, for every check that points at them.
 */
class Tally {
  constructor(report, id) {
    this.report = report;
    this.id = id;
    this.fails = 0;
    this.unknowns = 0;
    this.unread = 0;
    this.floor = false; // true when a validator stopped counting at its bound
  }

  fail(code, path, message) {
    this.fails += 1;
    this.report.issue(code, path, message, this.id, "fail");
  }

  unknown(code, path, message) {
    this.unknowns += 1;
    this.report.issue(code, path, message, this.id, "unknown");
  }

  settle(passed) {
    const { id, fails, unknowns, unread, floor } = this;
    if (fails > 0) {
      this.report.set(id, "fail", (report) => `${floor ? "At least " : ""}${recorded(fails, "disagreement", report.held(id, "fail"))}`);
    } else if (unknowns > 0 || unread > 0) {
      this.report.set(id, "unknown", (report) => {
        const parts = [];
        if (unknowns > 0) parts.push(recorded(unknowns, "point", report.held(id, "unknown")));
        if (unread > 0) {
          parts.push(`${plural(unread, "served document")} ${unread === 1 ? "was" : "were"} not read; see the document_not_read ${unread === 1 ? "issue" : "issues"}.`);
        }
        return `Not decidable from this fixture: ${parts.join(" ")}`;
      });
    } else {
      this.report.set(id, "pass", passed);
    }
  }
}

function strictObservedAt(value) {
  const observedAt = value instanceof Date ? value.toISOString() : value ?? new Date().toISOString();
  if (typeof observedAt !== "string" || observedAt.length > 40 || !validTimestamp(observedAt)) {
    throw new TypeError("now must be an uppercase-UTC RFC 3339 timestamp or Date");
  }
  return observedAt;
}

function emptyExercised() {
  return {
    items_compared_equal: 0,
    differences_found: 0,
    differences_named: 0,
    states_seen: { ok: 0, quiet: 0, partial: 0, unavailable: 0, withheld: 0 },
  };
}

function buildResult({ artifact, observedAt, report, origin = null, exercised = emptyExercised() }) {
  const checks = CHECK_IDS.map((id) => {
    const entry = report.outcomes.get(id);
    if (!entry) throw new Error(`checker defect: no outcome for ${id}`);
    const observed = typeof entry.observed === "function" ? entry.observed(report) : entry.observed;
    return { id, outcome: entry.outcome, expected: EXPECTED.get(id), observed };
  });
  const counts = { pass: 0, fail: 0, unknown: 0, not_run: 0 };
  for (const entry of checks) counts[entry.outcome] += 1;
  const result = counts.fail > 0
    ? "check_failed"
    : counts.unknown > 0 || counts.not_run > 0
      ? "indeterminate"
      : "checks_passed";
  return {
    $schema: RESULT_SCHEMA_ID,
    schema_version: ARRIVAL_RESULT_VERSION,
    profile: ARRIVAL_PROFILE,
    artifact,
    fixture_origin: origin,
    verifier: { name: "xenia-arrival-check", version: ARRIVAL_CHECKER_VERSION },
    observed_at: observedAt,
    result,
    scope: RESULT_SCOPE,
    output_handling: RESULT_OUTPUT_HANDLING,
    limits: {
      max_input_bytes: MAX_INPUT_BYTES,
      max_orientation_bytes: MAX_ORIENTATION_BYTES,
      max_view_bytes: MAX_VIEW_BYTES,
      max_json_depth: MAX_JSON_DEPTH,
      max_issues: MAX_ISSUES,
    },
    counts,
    exercised,
    checks,
    issues: report.entries().map((entry) => entry.issue), // at most MAX_ISSUES
    not_established: [...NOT_ESTABLISHED],
  };
}

// --- The document schemas, read from the files beside this one.

const directory = new URL("./", import.meta.url);
const SCHEMA_NAMES = Object.freeze(["orientation", "view", "fixture"]);
const SCHEMA_NOTES = new Set(["$schema", "$id", "$comment", "title", "description"]);
const SCHEMA_TYPES = new Set(["object", "array", "string", "integer", "boolean", "null"]);
const SCHEMA_FORMATS = new Set(["uri", "date-time"]);
const SCHEMA_KEYWORDS = new Set([
  "$ref", "$defs", "type", "required", "properties", "additionalProperties", "enum", "const", "anyOf", "items",
  "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
]);
const loadedSchemas = new Map();

function isScalar(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** Reads one schema and refuses any keyword or keyword value this file does not apply. */
function loadSchema(name) {
  if (loadedSchemas.has(name)) return loadedSchemas.get(name);
  const root = JSON.parse(readFileSync(new URL(`${name}.schema.json`, directory), "utf8"));
  const patterns = new Map();
  const refuse = (what) => {
    throw new Error(`checker defect: the ${name} schema uses ${what}, which this checker does not apply`);
  };
  (function visit(node) {
    if (!isObject(node)) refuse("a schema that is not an object");
    for (const [keyword, value] of Object.entries(node)) {
      if (SCHEMA_NOTES.has(keyword)) continue;
      if (!SCHEMA_KEYWORDS.has(keyword)) refuse(`the keyword ${keyword}`);
      if (keyword === "$ref" && !/^#\/\$defs\/[A-Za-z_]+$/.test(value)) refuse("a reference outside its own $defs");
      if (keyword === "type" && !SCHEMA_TYPES.has(value)) refuse(`the type ${value}`);
      if (keyword === "format" && !SCHEMA_FORMATS.has(value)) refuse(`the format ${value}`);
      if (keyword === "additionalProperties" && value !== false) refuse("an open additionalProperties");
      if (keyword === "const" && !isScalar(value)) refuse("a const that is not a scalar");
      if (keyword === "enum" && !value.every(isScalar)) refuse("an enum value that is not a scalar");
      if (keyword === "pattern") patterns.set(value, new RegExp(value, "u"));
      if (keyword === "properties" || keyword === "$defs") Object.values(value).forEach(visit);
      if (keyword === "anyOf") value.forEach(visit);
      if (keyword === "items") visit(value);
    }
  })(root);
  const loaded = { root, defs: root.$defs ?? {}, patterns };
  loadedSchemas.set(name, loaded);
  return loaded;
}

function hasType(type, value) {
  switch (type) {
    case "object": return isObject(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    default: return value === null;
  }
}

/** Length in Unicode code points, as JSON Schema counts it. */
function codePoints(value) {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
    }
    length += 1;
  }
  return length;
}

/**
 * Applies one schema node to one value. Issue messages name schema facts
 * (a type, a bound) and never the value or an undefined field's name.
 */
function applySchema(schema, node, value, path, issues) {
  if (issues.length >= MAX_ISSUES) return;
  const add = (keyword, message, at = path) => issues.push(issue(`schema_${keyword}`, at, message));
  if (node.$ref !== undefined) applySchema(schema, schema.defs[node.$ref.slice("#/$defs/".length)], value, path, issues);
  if (node.type !== undefined && !hasType(node.type, value)) {
    add("type", `The value is not of type ${node.type}.`);
    return;
  }
  if (Object.hasOwn(node, "const") && value !== node.const) add("const", "The value is not the one fixed for this field.");
  if (node.enum !== undefined && !node.enum.includes(value)) add("enum", "The value is not one of the words this field allows.");
  if (node.anyOf !== undefined) {
    const attempts = node.anyOf.map((branch) => {
      const local = [];
      applySchema(schema, branch, value, path, local);
      return local;
    });
    if (!attempts.some((local) => local.length === 0)) {
      const stated = attempts.filter((_, index) => node.anyOf[index].type !== "null");
      if (value !== null && stated.length === 1) issues.push(...stated[0]);
      else add("any_of", "The value has none of the forms this field allows.");
    }
  }
  if (typeof value === "string") {
    if (node.minLength !== undefined && codePoints(value) < node.minLength) add("min_length", `The text is shorter than ${node.minLength}.`);
    if (node.maxLength !== undefined && codePoints(value) > node.maxLength) add("max_length", `The text is longer than ${node.maxLength}.`);
    if (node.pattern !== undefined && !schema.patterns.get(node.pattern).test(value)) add("pattern", "The text does not have the form this field allows.");
    if (node.format === "uri" && !isSecureOrLoopbackUrl(value)) add("format", "The text is not an absolute https address, or a loopback http address, that parses.");
    if (node.format === "date-time" && !validTimestamp(value)) add("format", "The text is not a real UTC time written with Z.");
  }
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) add("minimum", `The number is below ${node.minimum}.`);
    if (node.maximum !== undefined && value > node.maximum) add("maximum", `The number is above ${node.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) add("min_items", `The list has fewer than ${node.minItems} entries.`);
    if (node.maxItems !== undefined && value.length > node.maxItems) add("max_items", `The list has more than ${node.maxItems} entries.`);
    if (node.uniqueItems === true && new Set(value.map(canonical)).size !== value.length) add("unique_items", "The list repeats an entry.");
    if (node.items !== undefined) {
      value.forEach((member, index) => applySchema(schema, node.items, member, `${path}/${index}`, issues));
    }
  }
  if (isObject(value)) {
    for (const name of node.required ?? []) {
      if (!Object.hasOwn(value, name)) add("required", "A required field is missing.", pointer(path, name));
    }
    if (node.properties !== undefined) {
      for (const [name, child] of Object.entries(node.properties)) {
        if (Object.hasOwn(value, name)) applySchema(schema, child, value[name], pointer(path, name), issues);
      }
      if (node.additionalProperties === false) {
        const extra = Object.keys(value).filter((key) => !Object.hasOwn(node.properties, key)).length;
        if (extra > 0) add("additional_properties", `${plural(extra, "field")} the schema does not define; the name${extra === 1 ? " was" : "s were"} not copied.`);
      }
    }
  }
}

function schemaIssues(name, value, path = "$") {
  const schema = loadSchema(name);
  const issues = [];
  applySchema(schema, schema.root, value, path, issues);
  return issues.slice(0, MAX_ISSUES);
}

/**
 * Structure only: the issues an already parsed body has against
 * orientation.schema.json. An empty list means it matches. Addresses are
 * held to Surface's test, which also asks that they parse, so a few strings
 * that `format: uri` admits (a port above 65535, for one) are refused here.
 */
export function validateOrientation(body) {
  return schemaIssues("orientation", body);
}

/** Structure only: the issues an already parsed body has against view.schema.json. */
export function validateView(body) {
  return schemaIssues("view", body);
}

// --- Input.

function inputBytes(input) {
  if (typeof input === "string") return Buffer.from(input, "utf8");
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("fixture input must be a string, Buffer, or Uint8Array");
}

/** Counts open brackets outside strings, without parsing. */
function nestingExceeds(text, maximum) {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (inString) {
      if (unit === 0x5c) index += 1;
      else if (unit === 0x22) inString = false;
    } else if (unit === 0x22) {
      inString = true;
    } else if (unit === 0x7b || unit === 0x5b) {
      depth += 1;
      if (depth > maximum) return true;
    } else if (unit === 0x7d || unit === 0x5d) {
      depth -= 1;
    }
  }
  return false;
}

/**
 * duplicateJsonKeys of work/0.1/check.mjs, copied, returning a count. It runs
 * only on text JSON.parse accepted and nestingExceeds bounded.
 */
function repeatedJsonKeys(text) {
  let index = 0;
  let repeated = 0;

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

  function value() {
    whitespace();
    const token = text[index];
    if (token === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (text[index] !== "}") {
        while (true) {
          const key = string();
          if (keys.has(key)) repeated += 1;
          keys.add(key);
          whitespace();
          index += 1; // colon; JSON.parse already established valid syntax.
          value();
          whitespace();
          if (text[index] === "}") break;
          index += 1; // comma
          whitespace();
        }
      }
      index += 1;
      return;
    }
    if (token === "[") {
      index += 1;
      whitespace();
      if (text[index] !== "]") {
        while (true) {
          value();
          whitespace();
          if (text[index] === "]") break;
          index += 1;
        }
      }
      index += 1;
      return;
    }
    if (token === "\"") {
      string();
      return;
    }
    while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1;
  }

  value();
  return repeated;
}

function incompleteResult(observedBytes, observedAt) {
  const report = new Report();
  report.issue(
    "input_limit_exceeded",
    "$",
    `The input is over the fixed ${MAX_INPUT_BYTES}-byte limit; nothing was parsed and no conclusion was drawn.`,
    "I.SIZE",
    "unknown",
  );
  report.set("I.SIZE", "unknown", `at least ${observedBytes} bytes`);
  report.rest("The input size limit prevented this check.");
  return buildResult({
    artifact: { complete: false, observed_bytes: observedBytes },
    observedAt,
    report,
  });
}

// --- The fixture, once it has the fixture shape.

function recordedExchanges(fixture) {
  const found = {};
  for (const [key, visit, name] of SLOTS) {
    if (!Object.hasOwn(fixture.visits[visit], name)) continue;
    const exchange = fixture.visits[visit][name];
    found[key] = {
      path: `$/visits/${visit}/${name}`,
      requestedAt: exchange.requested_at,
      request: exchange.request,
      status: exchange.response.status,
      body: exchange.response.body,
    };
  }
  return found;
}

function bodyPath(slot) {
  return `${slot.path}/response/body`;
}

/** The cursor string a recorded body carries at its top level, or null. */
function cursorIn(slot) {
  return slot && isObject(slot.body) && typeof slot.body.cursor === "string" ? slot.body.cursor : null;
}

/**
 * A query or fragment key as CREDENTIAL_NAMED reads it: a break is put
 * between a lower-case letter or digit and an upper-case letter after it,
 * the key is lower-cased and split at every run of other characters, and the
 * parts are joined with _.
 */
function normalisedKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== "")
    .join("_");
}

/** True when form-encoded text holds a pair with a credential-named key and a value. */
function holdsCredentialPair(text) {
  if (text === "") return false;
  for (const [key, value] of new URLSearchParams(text)) {
    if (value !== "" && CREDENTIAL_NAMED.test(normalisedKey(key))) return true;
  }
  return false;
}

/**
 * What one address carries, read from its text alone so that an address
 * which does not parse is still looked at: the codes of the rules it breaks.
 */
function addressFindings(address) {
  const found = [];
  const afterScheme = address.slice(address.indexOf("://") + 3);
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = authorityEnd < 0 ? afterScheme : afterScheme.slice(0, authorityEnd);
  if (authority.includes("@")) found.push("href_userinfo");
  const hashAt = address.indexOf("#");
  const beforeHash = hashAt < 0 ? address : address.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  if (queryAt >= 0 && holdsCredentialPair(beforeHash.slice(queryAt + 1))) found.push("href_credential_query_key");
  if (hashAt >= 0 && holdsCredentialPair(address.slice(hashAt + 1))) found.push("href_credential_fragment_key");
  return found;
}

const ADDRESS_MESSAGES = Object.freeze({
  href_userinfo: "An address carries userinfo before its host.",
  href_credential_query_key: "An address has a query pair whose key is named like a credential. The name alone decides; the value was not read for what it is.",
  href_credential_fragment_key: "An address has a fragment pair whose key is named like a credential. The name alone decides; the value was not read for what it is.",
});

function checkNoCredential(fixture, known, report) {
  const tally = new Tally(report, "I.NO_CREDENTIAL");
  const exempt = new Set();
  for (const [, visit, name] of SLOTS) {
    const base = `$/visits/${visit}/${name}`;
    exempt.add(`${base}/request/cursor`);
    exempt.add(`${base}/response/body/cursor`);
    exempt.add(`${base}/response/body/basis/cursor`);
    exempt.add(`${base}/response/body/acknowledgement/position`);
  }
  // `shown` is the path printed in an issue: a field name the schemas do not
  // define is written as *, so no such name is copied into a result. `field`
  // is the nearest field name above a value; a list passes its own on.
  (function scan(value, path, shown, field) {
    if (typeof value === "string") {
      if (exempt.has(path)) return;
      if (SECRET_SHAPES.some((shape) => shape.test(value))) {
        tally.fail("secret_shape", shown, "A string has the shape of a secret. It was not copied.");
      }
      let addresses;
      if (ADDRESS_FIELDS.has(field) && ADDRESS_START.test(value)) {
        addresses = [value];
        try {
          new URL(value);
        } catch {
          tally.fail("href_unparseable", shown, "An address field begins like a web address and does not parse as one.");
        }
      } else {
        addresses = value.match(ADDRESS_RUN) ?? [];
      }
      const codes = new Set(addresses.flatMap(addressFindings));
      for (const code of Object.keys(ADDRESS_MESSAGES)) {
        if (codes.has(code)) tally.fail(code, shown, ADDRESS_MESSAGES[code]);
      }
    } else if (Array.isArray(value)) {
      value.forEach((member, index) => scan(member, `${path}/${index}`, `${shown}/${index}`, field));
    } else if (isObject(value)) {
      for (const [key, member] of Object.entries(value)) {
        if (SECRET_SHAPES.some((shape) => shape.test(key))) {
          tally.fail("secret_shape", shown, "A field name has the shape of a secret. It was not copied.");
        }
        scan(member, pointer(path, key), known.has(key) ? pointer(shown, key) : `${shown}/*`, key);
      }
    }
  })(fixture, "$", "$", null);
  tally.settle("No field name or string that was read has a secret shape, and no address broke the address rules. Cursors and positions were not read. This is a tripwire, not a guarantee.");
}

function checkRecord(slots, report) {
  const tally = new Tally(report, "I.RECORD");
  const { orientation, refusal, first, second, bad } = slots;
  for (const slot of [orientation, refusal]) {
    if (!slot) continue;
    if (slot.request.credential !== "none") {
      tally.fail("request_credential_presented", `${slot.path}/request/credential`, "This slot is for a request with no credential; one is recorded as presented.");
    }
    if (slot.request.cursor !== null) {
      tally.fail("request_cursor_presented", `${slot.path}/request/cursor`, "This slot is for a request with no cursor; one is recorded.");
    }
  }
  for (const slot of [first, second, bad]) {
    if (slot && slot.request.credential !== "presented") {
      tally.fail("request_credential_missing", `${slot.path}/request/credential`, "This slot is for a request that presents a credential; none is recorded as presented.");
    }
  }
  if (first && first.request.cursor !== null) {
    tally.fail("request_cursor_presented", `${first.path}/request/cursor`, "The first view request is recorded with a cursor; a first read has none to present.");
  }
  if (bad && bad.request.cursor === null) {
    tally.fail("request_cursor_missing", `${bad.path}/request/cursor`, "The bad-cursor request is recorded with no cursor.");
  }

  const viewRequests = [refusal, first, second, bad].filter(Boolean);
  const viewHref = viewRequests.length > 0 ? viewRequests[0].request.href : null;
  for (const slot of viewRequests.slice(1)) {
    if (slot.request.href !== viewHref) {
      tally.fail("view_address_differs", `${slot.path}/request/href`, "The requests to the view do not share one address.");
    }
  }
  if (orientation && viewHref !== null && orientation.request.href === viewHref) {
    tally.fail("orientation_address_is_view_address", `${orientation.path}/request/href`, "The orientation request has the view's address.");
  }

  let previous = null;
  for (const [key] of SLOTS) {
    const slot = slots[key];
    if (!slot) continue;
    if (previous && compareTimestamp(previous.requestedAt, slot.requestedAt) > 0) {
      tally.fail("requested_at_decreases", `${slot.path}/requested_at`, "This request is recorded as sent before the one in the slot before it.");
    }
    previous = slot;
  }

  if (second && second.request.cursor !== null && first) {
    const handedBack = first.status === 200 ? cursorIn(first) : null;
    if (second.request.cursor !== handedBack) {
      tally.fail("cursor_not_handed_back", `${second.path}/request/cursor`, "The second view request presents a cursor that is not the one the first served view handed back.");
    }
  }
  if (bad && bad.request.cursor !== null && [first, second].some((slot) => cursorIn(slot) === bad.request.cursor)) {
    tally.fail("bad_cursor_was_handed_back", `${bad.path}/request/cursor`, "The bad-cursor request presents a cursor that a recorded view handed back.");
  }
  tally.settle(`${plural(Object.keys(slots).length, "recorded exchange")} agree with the slots they are recorded in.`);
  return viewHref;
}

function checkOrientation(slots, viewHref, report) {
  const slot = slots.orientation;
  if (!slot) {
    report.set("R1.ORIENTATION", "not_run", "The orientation exchange is not recorded.");
    return null;
  }
  const tally = new Tally(report, "R1.ORIENTATION");
  let valid = null;
  if (slot.status >= 500) {
    tally.unknown("status_5xx", `${slot.path}/response/status`, "The recorded status is 5xx, so no orientation was read.");
  } else if (slot.status !== 200) {
    tally.fail("status_not_200", `${slot.path}/response/status`, "The orientation was not answered with status 200.");
  } else {
    const found = schemaIssues("orientation", slot.body, bodyPath(slot));
    for (const entry of found) tally.fail(entry.code, entry.path, entry.message);
    if (found.length === MAX_ISSUES) tally.floor = true;
    if (found.length === 0) valid = slot.body;
    if (isObject(slot.body) && Buffer.byteLength(JSON.stringify(slot.body)) > MAX_ORIENTATION_BYTES) {
      tally.fail("orientation_over_ceiling", bodyPath(slot), `The orientation, serialised again, is over ${MAX_ORIENTATION_BYTES} bytes.`);
    }
    if (valid && viewHref !== null && valid.view.href !== viewHref) {
      tally.fail("view_address_mismatch", `${bodyPath(slot)}/view/href`, "The orientation points at an address other than the one the view requests used.");
    }
  }
  tally.settle("Status 200, a valid orientation within its ceiling, pointing at the view address where one is recorded.");
  return valid;
}

/**
 * Shared by R1.REFUSAL and R4.BAD_CURSOR: a 4xx Surface problem with one
 * expected code that is not terminal. Returns the body when the caller should
 * go on to look at its next actions.
 */
function checkRefusal(slot, expectedCode, tally) {
  if (slot.status >= 500) {
    tally.unknown("status_5xx", `${slot.path}/response/status`, "The recorded status is 5xx, so no refusal was read.");
    return null;
  }
  if (slot.status < 400) {
    tally.fail("status_not_4xx", `${slot.path}/response/status`, "The request was not refused with a 4xx status.");
    return null;
  }
  for (const [rule, below] of problemRuleFailures(slot.body, slot.status)) {
    tally.fail(`problem_${rule}`, `${bodyPath(slot)}${below}`, "The body breaks a XENIA Surface 0.1 problem rule; the code of this issue names the rule.");
  }
  if (!isObject(slot.body)) return null;
  if (slot.body.code !== expectedCode) {
    tally.fail("refusal_code_unexpected", `${bodyPath(slot)}/code`, `The problem code is not ${expectedCode}.`);
  }
  if (slot.body.terminal === true) {
    tally.fail("refusal_is_terminal", `${bodyPath(slot)}/terminal`, "The problem is terminal, so it offers no way on.");
    return null;
  }
  return slot.body;
}

function nextActions(body) {
  return Array.isArray(body.next_actions) ? body.next_actions : [];
}

function checkCredentialRefusal(slots, report) {
  const slot = slots.refusal;
  if (!slot) {
    report.set("R1.REFUSAL", "not_run", "The exchange with no credential is not recorded.");
    return;
  }
  const tally = new Tally(report, "R1.REFUSAL");
  const body = checkRefusal(slot, "credential_required", tally);
  if (body) {
    const firstAction = nextActions(body)[0];
    if (!slots.orientation) {
      if (tally.fails === 0) {
        tally.unknown("orientation_not_recorded", slot.path, "No orientation exchange is recorded, so the first next action has no address to be compared with.");
      }
    } else if (!isObject(firstAction) || firstAction.href !== slots.orientation.request.href) {
      tally.fail("next_action_not_orientation", `${bodyPath(slot)}/next_actions`, "The first next action is not the orientation address.");
    }
  }
  tally.settle("A 4xx problem with code credential_required, not terminal, whose first next action is the orientation address.");
}

function checkBadCursor(slots, report) {
  const slot = slots.bad;
  if (!slot) {
    report.set("R4.BAD_CURSOR", "not_run", "The bad-cursor exchange is not recorded.");
    return;
  }
  const tally = new Tally(report, "R4.BAD_CURSOR");
  const body = checkRefusal(slot, "cursor_not_accepted", tally);
  if (body && !nextActions(body).some((action) => isObject(action) && action.href === slot.request.href)) {
    tally.fail("next_action_not_view", `${bodyPath(slot)}/next_actions`, "No next action leads back to the view address.");
  }
  tally.settle("A 4xx problem with code cursor_not_accepted, not terminal, with a next action back to the view address.");
}

function checkViews(slots, report) {
  const recorded = [slots.first, slots.second].filter(Boolean);
  const valid = { first: null, second: null };
  if (recorded.length === 0) {
    report.set("R1.VIEW", "not_run", "No view exchange is recorded.");
    return valid;
  }
  const tally = new Tally(report, "R1.VIEW");
  const served = recorded.filter((slot) => slot.status === 200);
  if (served.length === 0) {
    for (const slot of recorded) {
      tally.unknown("view_not_served", `${slot.path}/response/status`, "This view request was not answered with status 200, so no view was read.");
    }
  }
  for (const slot of served) {
    const found = schemaIssues("view", slot.body, bodyPath(slot));
    for (const entry of found) tally.fail(entry.code, entry.path, entry.message);
    if (found.length === MAX_ISSUES) tally.floor = true;
    if (isObject(slot.body) && Buffer.byteLength(JSON.stringify(slot.body)) > MAX_VIEW_BYTES) {
      tally.fail("view_over_ceiling", bodyPath(slot), `The view, serialised again, is over ${MAX_VIEW_BYTES} bytes.`);
    }
    if (found.length > 0) continue;
    valid[slot === slots.first ? "first" : "second"] = slot.body;
    const sectionIds = new Set();
    slot.body.sections.forEach((section, sectionIndex) => {
      const sectionPath = `${bodyPath(slot)}/sections/${sectionIndex}`;
      if (sectionIds.has(section.id)) tally.fail("section_id_repeated", `${sectionPath}/id`, "A section id is used twice in one view.");
      sectionIds.add(section.id);
      const itemIds = new Set();
      section.items.forEach((item, itemIndex) => {
        if (itemIds.has(item.id)) tally.fail("item_id_repeated", `${sectionPath}/items/${itemIndex}/id`, "An item id is used twice in one section.");
        itemIds.add(item.id);
      });
    });
  }
  tally.settle(`${plural(served.length, "served view")}: valid, within the ceiling, with no repeated id.`);
  return valid;
}

function checkPair(slots, views, report) {
  if (!slots.first || !slots.second) {
    report.set("P.PAIR", "not_run", "One or both view exchanges are not recorded.");
    return;
  }
  if (report.outcome("R1.VIEW") !== "pass") {
    report.set("P.PAIR", "not_run", "R1.VIEW did not pass.");
    return;
  }
  const tally = new Tally(report, "P.PAIR");
  for (const slot of [slots.first, slots.second]) {
    if (slot.status !== 200) {
      tally.unknown("view_not_served", `${slot.path}/response/status`, "This view request was not answered with status 200, so the two reads cannot be compared.");
    }
  }
  if (views.first && views.second && !sameValue(views.first.audience, views.second.audience)) {
    tally.unknown("audience_differs", `${bodyPath(slots.second)}/audience`, "The two views state different audiences, so they are not compared with each other.");
  }
  tally.settle("Both views are served and valid and state the same audience.");
}

/**
 * Every served document: an orientation or view exchange answered with
 * status 200. `read` holds the ones whose bodies match their schema, with
 * where each is and what kind it is. `unread` holds the rest. A body that is
 * not valid is held neither for nor against a host by any later check; each
 * unread document is recorded here once, as an issue those checks point at.
 */
function servedDocuments(slots, orientation, views, report) {
  const documents = { read: [], unread: [] };
  for (const [kind, slot, body] of [
    ["orientation", slots.orientation, orientation],
    ["view", slots.first, views.first],
    ["view", slots.second, views.second],
  ]) {
    if (!slot || slot.status !== 200) continue;
    if (body) {
      documents.read.push({ kind, path: bodyPath(slot), body, slot });
    } else {
      documents.unread.push({ kind, path: bodyPath(slot) });
      report.issue("document_not_read", bodyPath(slot), "This body was answered with status 200 and does not match its schema. The checks that read every served document of its kind did not read it, and are unknown unless they fail on another.");
    }
  }
  return documents;
}

/**
 * Starts a check that reads every served document (`kind` null) or every
 * served view. Returns its tally and the documents it reads, or null when
 * none of that kind was served and the check is not run.
 */
function openDocumentCheck(id, documents, kind, report) {
  const ofKind = (document) => kind === null || document.kind === kind;
  const read = documents.read.filter(ofKind);
  const unread = documents.unread.filter(ofKind).length;
  if (read.length === 0 && unread === 0) {
    report.set(id, "not_run", kind === null ? "No served document is recorded." : `No served ${kind} is recorded.`);
    return null;
  }
  const tally = new Tally(report, id);
  tally.unread = unread;
  return { tally, read };
}

/** A declaration with its operational writes in one order, so that the list is compared as a set. */
function declarationKey(declaration) {
  return canonical({ ...declaration, operational_writes: [...declaration.operational_writes].sort() });
}

function checkDeclaredEffects(documents, report) {
  const opened = openDocumentCheck("R2.DECLARED_EFFECTS", documents, null, report);
  if (!opened) return;
  const { tally } = opened;
  const stated = [];
  for (const document of opened.read) {
    const at = document.kind === "orientation" ? `${document.path}/view/read_effects` : `${document.path}/read_effects`;
    const declaration = document.kind === "orientation" ? document.body.view.read_effects : document.body.read_effects;
    if (declaration === null) {
      tally.fail("not_stated", at, "The document does not state what a read writes.");
      continue;
    }
    stated.push(declaration);
    if (declaration.participant_record_writes === "some") {
      tally.fail("participant_record_write_declared", `${at}/participant_record_writes`, "The document declares that a read writes to the participant's record.");
    }
  }
  if (stated.some((declaration) => declarationKey(declaration) !== declarationKey(stated[0]))) {
    tally.fail("declarations_differ", "$/visits", "The read-effects declarations of the recorded documents are not all equal, the order of their operational writes aside.");
  }
  if (tally.fails === 0 && stated.some((declaration) => declaration.participant_record_writes === "unknown")) {
    tally.unknown("declaration_unknown", "$/visits", "A document declares that it does not know whether a read writes to the participant's record.");
  }
  tally.settle(`${plural(stated.length, "declaration")} compared: all say none and are equal, the order of operational writes aside. Declarations were compared, not what a host wrote.`);
}

/** The ways one envelope disagrees with the state table, as fixed phrases. */
function stateDisagreements(envelope) {
  const found = [];
  const listed = envelope.items.length;
  const others = (names) => {
    if (names.some((name) => envelope[name] !== null)) found.push("a field that belongs to another state is not null");
  };
  if (listed > envelope.limit) found.push("more items than the limit");
  switch (envelope.state) {
    case "ok":
      if (listed < 1) found.push("no items");
      if (envelope.count !== listed) found.push("the count is not the number of items");
      others(["dropped", "unavailable", "withheld"]);
      break;
    case "quiet":
      if (listed !== 0) found.push("items are listed");
      if (envelope.count !== 0) found.push("the count is not 0");
      others(["dropped", "unavailable", "withheld"]);
      break;
    case "partial":
      if (envelope.dropped === null) {
        found.push("dropped is null");
      } else {
        if (typeof envelope.dropped.count === "number") {
          if (envelope.count !== listed + envelope.dropped.count) found.push("the count is not the items listed plus the items dropped");
        } else if (envelope.count !== null && envelope.count <= listed) {
          // A partial envelope says at least one entry was dropped, so a
          // count given as a floor is above what is listed.
          found.push("the count is not above the number of items listed");
        }
        if (envelope.dropped.reason === "limit" && listed !== envelope.limit) {
          found.push("entries are said to be dropped for the limit, and the list is not full");
        }
      }
      others(["unavailable", "withheld"]);
      break;
    case "unavailable":
      if (listed !== 0) found.push("items are listed");
      if (envelope.count !== null) found.push("the count is not null");
      if (envelope.unavailable === null) found.push("unavailable is null");
      others(["dropped", "withheld"]);
      break;
    default:
      if (listed !== 0) found.push("items are listed");
      if (envelope.count !== null) found.push("the count is not null");
      if (envelope.withheld === null) found.push("withheld is null");
      others(["dropped", "unavailable"]);
  }
  return found;
}

function checkStates(documents, exercised, report) {
  const opened = openDocumentCheck("R3.STATES", documents, "view", report);
  if (!opened) return;
  const { tally, read: views } = opened;
  let envelopes = 0;
  for (const view of views) {
    const all = view.body.sections.map((section, index) => [section, `${view.path}/sections/${index}`]);
    if (view.body.changes !== null) all.push([view.body.changes, `${view.path}/changes`]);
    for (const [envelope, at] of all) {
      envelopes += 1;
      exercised.states_seen[envelope.state] += 1;
      const found = stateDisagreements(envelope);
      if (found.length > 0) {
        tally.fail("state_mismatch", at, `The envelope disagrees with the state table for the state it reports: ${found.join("; ")}.`);
      }
    }
  }
  const seen = Object.entries(exercised.states_seen).map(([state, count]) => `${count} ${state}`).join(", ");
  tally.settle(`${plural(envelopes, "envelope")} agree with the state table (${seen}). Each state agrees with its own fields; that is not evidence a section was read successfully.`);
}

function checkCursor(documents, report) {
  const opened = openDocumentCheck("R4.CURSOR", documents, "view", report);
  if (!opened) return;
  const { tally, read: views } = opened;
  for (const view of views) {
    if (view.body.cursor === null) {
      tally.fail("cursor_not_returned", `${view.path}/cursor`, "The view hands back no cursor.");
    }
    if (view.slot.request.cursor !== null) continue;
    if (view.body.basis.kind !== "full" || view.body.basis.cursor !== null) {
      tally.fail("basis_not_full", `${view.path}/basis`, "The request presented no cursor, yet the view's basis is not a full view with no cursor.");
    }
    if (view.body.changes !== null) {
      tally.fail("changes_without_cursor", `${view.path}/changes`, "The request presented no cursor, yet the view carries changes.");
    }
  }
  tally.settle(`${plural(views.length, "served view")}: each hands back a cursor, and each read with no cursor is a full view.`);
}

function checkFreshness(documents, slots, views, pairPassed, report) {
  const opened = openDocumentCheck("R5.FRESHNESS", documents, null, report);
  if (!opened) return;
  const { tally, read } = opened;
  for (const document of read) {
    const { as_of: asOf, valid_until: validUntil } = document.body;
    if (asOf === null) tally.fail("not_stated", `${document.path}/as_of`, "The document does not state when it was made.");
    if (validUntil === null) tally.fail("not_stated", `${document.path}/valid_until`, "The document does not state until when the host stands by it.");
    if (asOf !== null && validUntil !== null && compareTimestamp(validUntil, asOf) < 0) {
      tally.fail("valid_until_before_as_of", `${document.path}/valid_until`, "The document stops being valid before the time it says it was made.");
    }
  }
  if (pairPassed && views.first.as_of !== null && views.second.as_of !== null
    && compareTimestamp(views.second.as_of, views.first.as_of) < 0) {
    tally.fail("as_of_went_back", `${bodyPath(slots.second)}/as_of`, "The second view is dated before the first.");
  }
  tally.settle(`${plural(read.length, "served document")}: each states as_of and valid_until, and valid_until is not before as_of${pairPassed ? "; the second view is not dated before the first" : ""}. Host times were compared with host times only: no request time and no clock was read, so a document already past its valid_until when it was requested is not held against the host.`);
}

function checkNoObligation(documents, report) {
  const opened = openDocumentCheck("R6.NO_OBLIGATION", documents, null, report);
  if (!opened) return;
  const { tally, read } = opened;
  for (const document of read) {
    const { body, path } = document;
    if (body.reply_expected === null) tally.fail("not_stated", `${path}/reply_expected`, "The document does not state whether a reply is expected.");
    else if (body.reply_expected !== false) tally.fail("reply_expected", `${path}/reply_expected`, "The document says a reply is expected.");
    if (document.kind !== "view") continue;
    if (body.read_creates_obligation === null) tally.fail("not_stated", `${path}/read_creates_obligation`, "The view does not state whether reading creates an obligation.");
    else if (body.read_creates_obligation !== false) tally.fail("read_creates_obligation", `${path}/read_creates_obligation`, "The view says reading creates an obligation.");
    const obligationSections = body.sections.filter((section) => section.kind === "recorded_obligations").length;
    if (obligationSections !== 1) {
      tally.fail("obligation_section_count", `${path}/sections`, "The view does not have exactly one section of kind recorded_obligations.");
    }
    body.sections.forEach((section, sectionIndex) => {
      if (section.kind === "recorded_obligations") return;
      section.items.forEach((item, itemIndex) => {
        if (item.owed_to !== null || item.due_at !== null) {
          tally.fail("obligation_field_outside_section", `${path}/sections/${sectionIndex}/items/${itemIndex}`, "An item outside the recorded_obligations section sets owed_to or due_at.");
        }
      });
    });
  }
  tally.settle(`${plural(read.length, "served document")}: each says no reply is expected; each view says reading creates no obligation and sets owed_to and due_at only in its one recorded_obligations section. These are the documents' own statements.`);
}

function checkNonClaims(documents, report) {
  const opened = openDocumentCheck("R7.NON_CLAIMS", documents, null, report);
  if (!opened) return;
  const { tally, read } = opened;
  for (const document of read) {
    for (const token of REQUIRED_TOKENS[document.kind]) {
      if (!document.body.not_established.includes(token)) {
        tally.fail("non_claim_missing", `${document.path}/not_established`, `The document does not list ${token}.`);
      }
    }
  }
  tally.settle(`${plural(read.length, "served document")}: each lists every token of its kind.`);
}

/**
 * The checker's own comparison of two valid views with unique ids. For each
 * section in both: an item is the same, differs, is gone, or is new. Differs
 * is always decidable; gone when the second-read section is ok or quiet; new
 * when the first-read section is ok or quiet.
 */
function compareViews(first, second) {
  const firstSections = new Map(first.sections.map((section, index) => [section.id, { section, index }]));
  const secondSections = new Map(second.sections.map((section, index) => [section.id, { section, index }]));
  const differences = [];
  const marksMoved = [];
  let comparedEqual = 0;
  for (const [id, earlier] of firstSections) {
    const later = secondSections.get(id);
    if (!later) continue;
    const laterItems = new Map(later.section.items.map((item, index) => [item.id, { item, index }]));
    const earlierIds = new Set();
    earlier.section.items.forEach((item, index) => {
      earlierIds.add(item.id);
      const owner = item.acknowledged_at === null ? "R2.SHOWN_AGAIN" : "R4.CHANGES";
      const where = { sectionId: id, itemId: item.id, at: `first:/sections/${earlier.index}/items/${index}` };
      const match = laterItems.get(item.id);
      if (!match) {
        differences.push({ kind: "gone", owner, decidable: WHOLE.has(later.section.state), ...where });
        return;
      }
      if (item.acknowledged_at !== match.item.acknowledged_at) marksMoved.push(where);
      if (sameValue(item, match.item)) {
        if (owner === "R2.SHOWN_AGAIN") comparedEqual += 1;
        return;
      }
      differences.push({ kind: "differs", owner, decidable: true, ...where });
    });
    later.section.items.forEach((item, index) => {
      if (earlierIds.has(item.id)) return;
      differences.push({
        kind: "new",
        owner: "R4.CHANGES",
        decidable: WHOLE.has(earlier.section.state),
        sectionId: id,
        itemId: item.id,
        at: `second:/sections/${later.index}/items/${index}`,
      });
    });
  }
  const names = new Map();
  for (const entry of second.changes?.items ?? []) {
    const key = JSON.stringify([entry.section_id, entry.item_id]);
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(entry.change);
  }
  for (const difference of differences) {
    const kinds = names.get(JSON.stringify([difference.sectionId, difference.itemId])) ?? [];
    difference.named = kinds.some((kind) => NAMED_BY[difference.kind].includes(kind));
  }
  return { firstSections, secondSections, differences, marksMoved, comparedEqual };
}

/** Turns a comparison's own "first:/…" or "second:/…" mark into an issue path. */
function viewPath(slots, at) {
  const [which, below] = at.split(":");
  return `${bodyPath(slots[which])}${below}`;
}

function checkShownAgain(fixture, slots, views, comparison, report) {
  const tally = new Tally(report, "R2.SHOWN_AGAIN");
  if (fixture.between_visits.acknowledged_by_recorder !== "no") {
    tally.unknown("recorder_statement_not_no", "$/between_visits/acknowledged_by_recorder", "The recorder does not state that it acknowledged nothing between the reads, so a moved mark or position cannot be held against the host.");
    tally.settle("");
    return;
  }
  const position = (view) => (view.acknowledgement === null ? null : view.acknowledgement.position);
  if (position(views.first) !== position(views.second)) {
    tally.fail("acknowledgement_moved", `${bodyPath(slots.second)}/acknowledgement`, "The acknowledgement position differs between the two reads, though the recorder states it acknowledged nothing.");
  }
  for (const moved of comparison.marksMoved) {
    tally.fail("acknowledgement_moved", `${viewPath(slots, moved.at)}/acknowledged_at`, "An item shown on both reads has a different acknowledged_at, though the recorder states it acknowledged nothing.");
  }
  const changes = views.second.changes;
  const namesReadable = changes !== null && WHOLE.has(changes.state);
  for (const difference of comparison.differences) {
    if (difference.owner !== "R2.SHOWN_AGAIN" || difference.named) continue;
    const at = viewPath(slots, difference.at);
    if (namesReadable && difference.decidable) {
      if (difference.kind === "differs") {
        tally.fail("unacknowledged_item_changed_unnamed", at, "An unacknowledged item is shown again changed, and the changes list does not name it as changed.");
      } else {
        tally.fail("unacknowledged_item_gone_unnamed", at, "An unacknowledged item is not shown again in a section that claims to list everything, and the changes list does not name it as ended.");
      }
    } else {
      tally.unknown("undecidable_difference", at, "An unacknowledged item changed or is not shown again, and it cannot be decided whether that is named: the changes list is absent or incomplete, or the second-read section does not list everything.");
    }
  }
  if (comparison.comparedEqual === 0 && tally.fails === 0) {
    tally.unknown("not_exercised", bodyPath(slots.first), "No unacknowledged first-read item was found equal on the second read, so nothing was shown again to compare.");
  }
  tally.settle(`${plural(comparison.comparedEqual, "unacknowledged first-read item")} found equal on the second read; the position is unmoved, no item shown in the same section on both reads has a different mark, and no change is unnamed. A named change is accepted whatever caused it. This rests on the recorder's own statement that it acknowledged nothing between the reads.`);
}

function checkSectionsKept(slots, comparison, report) {
  const tally = new Tally(report, "R3.SECTIONS_KEPT");
  for (const [id, earlier] of comparison.firstSections) {
    const at = `${bodyPath(slots.first)}/sections/${earlier.index}`;
    const later = comparison.secondSections.get(id);
    if (!later) {
      tally.fail("section_missing", at, "A section listed on the first read is not listed on the second.");
      continue;
    }
    if (later.section.kind !== earlier.section.kind) tally.fail("section_kind_changed", `${at}/kind`, "A section has a different kind on the second read.");
    if (later.section.scope !== earlier.section.scope) tally.fail("section_scope_changed", `${at}/scope`, "A section has a different scope on the second read.");
  }
  tally.settle(`${plural(comparison.firstSections.size, "first-read section")} listed again with the same kind and scope.`);
}

function checkChanges(slots, views, comparison, named, report) {
  if (slots.second.request.cursor === null) {
    report.set("R4.CHANGES", "not_run", "The second request presented no cursor.");
    return;
  }
  const tally = new Tally(report, "R4.CHANGES");
  const view = views.second;
  const at = bodyPath(slots.second);
  if (view.basis.kind !== "since_cursor") {
    tally.fail("basis_not_since_cursor", `${at}/basis/kind`, "A cursor was presented, yet the view's basis is not since_cursor.");
  }
  if (view.basis.cursor !== slots.second.request.cursor) {
    tally.fail("basis_cursor_mismatch", `${at}/basis/cursor`, "The basis does not echo the cursor that was presented.");
  }
  if (view.changes === null) {
    tally.fail("changes_missing", `${at}/changes`, "A cursor was presented, yet the view carries no changes.");
    tally.settle("");
    return;
  }

  view.changes.items.forEach((entry, index) => {
    const entryPath = `${at}/changes/items/${index}`;
    const earlier = comparison.firstSections.get(entry.section_id);
    const later = comparison.secondSections.get(entry.section_id);
    if (!earlier && !later) {
      tally.fail("change_names_no_section", entryPath, "A changes entry names a section that is in neither view.");
      return;
    }
    const before = earlier?.section.items.find((item) => item.id === entry.item_id);
    const after = later?.section.items.find((item) => item.id === entry.item_id);
    const contradictions = [];
    if (entry.change === "added" && before) contradictions.push("it says added, and the item is on the first read");
    if (entry.change === "changed" && before && after && sameValue(before, after)) contradictions.push("it says changed, and the item is equal on both reads");
    if (entry.change !== "added" && entry.change !== "changed" && after) contradictions.push("it says the item is no longer shown, and it is on the second read");
    if (entry.change === "out_of_window" && later && later.section.state !== "partial") contradictions.push("it says out_of_window, and the second-read section is not partial");
    if (entry.change !== "added" && earlier && WHOLE.has(earlier.section.state) && !before) contradictions.push("it names an item absent from a first-read section that claimed to list everything");
    // The mirror image of the line above: an entry that says an item is now
    // shown, where a second-read section that claims to list everything does
    // not show it.
    if ((entry.change === "added" || entry.change === "changed") && later && WHOLE.has(later.section.state) && !after) contradictions.push("it says the item is shown, and it is absent from a second-read section that claims to list everything");
    if (contradictions.length > 0) {
      tally.fail("change_contradicts_views", entryPath, `A changes entry contradicts the two views: ${contradictions.join("; ")}.`);
    }
  });

  const state = view.changes.state;
  if (state === "unavailable" || state === "withheld") {
    tally.unknown("changes_not_readable", `${at}/changes`, "The changes list is reported unavailable or withheld, so what it names cannot be read.");
    tally.settle("");
    return;
  }
  for (const difference of comparison.differences) {
    if (difference.owner !== "R4.CHANGES" || difference.named) continue;
    const where = viewPath(slots, difference.at);
    if (state === "partial") {
      tally.unknown("undecidable_difference", where, "A difference is not named in a changes list that is partial, so it cannot be decided whether it was named.");
    } else if (difference.decidable) {
      tally.fail("difference_unnamed", where, "The two views differ here decidably, and a changes list that claims to be whole does not name it.");
    }
  }
  if (named === 0 && tally.fails === 0) {
    tally.unknown("not_exercised", `${at}/changes`, "No decidable difference between the two views was both found and named, so the changes list was not exercised.");
  }
  const entries = view.changes.items.length;
  tally.settle(`The basis echoes the cursor; ${entries} ${entries === 1 ? "entry" : "entries"} checked against the two views; ${plural(named, "decidable difference")} found and named.`);
}

function checkFixture(fixture, report) {
  const exercised = emptyExercised();
  const known = knownFieldNames();
  checkNoCredential(fixture, known, report);

  const slots = recordedExchanges(fixture);
  const viewHref = checkRecord(slots, report);
  if (report.outcome("I.RECORD") !== "pass") {
    report.rest("I.RECORD did not pass.");
    return exercised;
  }

  const orientation = checkOrientation(slots, viewHref, report);
  checkCredentialRefusal(slots, report);
  const views = checkViews(slots, report);
  checkPair(slots, views, report);
  const pairPassed = report.outcome("P.PAIR") === "pass";
  const documents = servedDocuments(slots, orientation, views, report);

  checkDeclaredEffects(documents, report);
  checkStates(documents, exercised, report);
  checkCursor(documents, report);
  checkBadCursor(slots, report);
  checkFreshness(documents, slots, views, pairPassed, report);
  checkNoObligation(documents, report);
  checkNonClaims(documents, report);

  if (pairPassed) {
    const comparison = compareViews(views.first, views.second);
    const decidable = comparison.differences.filter((difference) => difference.decidable);
    exercised.items_compared_equal = comparison.comparedEqual;
    exercised.differences_found = decidable.length;
    exercised.differences_named = decidable.filter((difference) => difference.named).length;
    checkShownAgain(fixture, slots, views, comparison, report);
    checkSectionsKept(slots, comparison, report);
    checkChanges(slots, views, comparison, exercised.differences_named, report);
  }
  report.rest("P.PAIR did not pass.");
  return exercised;
}

/** Every field name the three schemas and the problem rules define. */
function knownFieldNames() {
  const names = new Set([...PROBLEM_FIELDS, ...NEXT_ACTION_FIELDS]);
  for (const name of SCHEMA_NAMES) {
    (function visit(node) {
      if (!isObject(node)) return;
      for (const [keyword, value] of Object.entries(node)) {
        if (keyword === "properties" || keyword === "$defs") {
          for (const [field, child] of Object.entries(value)) {
            if (keyword === "properties") names.add(field);
            visit(child);
          }
        } else if (keyword === "anyOf") {
          value.forEach(visit);
        } else if (keyword === "items") {
          visit(value);
        }
      }
    })(loadSchema(name).root);
  }
  return names;
}

/**
 * Check one complete in-memory fixture. This makes no network request, reads
 * no credential or environment variable, and writes nothing. The only files
 * it reads are the three schemas beside this one, on first use.
 */
export function checkArrivalFixtureBytes(input, options = {}) {
  const observedAt = strictObservedAt(options.now);
  const bytes = inputBytes(input);
  if (bytes.length > MAX_INPUT_BYTES) return incompleteResult(bytes.length, observedAt);

  const artifact = { complete: true, observed_bytes: bytes.length, sha256: sha256(bytes) };
  const report = new Report();
  const finish = (reason) => {
    report.rest(reason);
    return buildResult({ artifact, observedAt, report });
  };
  report.set("I.SIZE", "pass", `${bytes.length} bytes`);

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    report.issue("utf8_bom", "$", "The input begins with a UTF-8 byte-order mark.", "I.UTF8");
    report.set("I.UTF8", "fail", "A UTF-8 byte-order mark was observed.");
    return finish("I.UTF8 did not pass.");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    report.issue("utf8_decode", "$", "Strict UTF-8 decoding failed.", "I.UTF8");
    report.set("I.UTF8", "fail", "Strict decoding failed.");
    return finish("I.UTF8 did not pass.");
  }
  report.set("I.UTF8", "pass", "Decoded without replacement characters.");

  if (nestingExceeds(text, MAX_JSON_DEPTH)) {
    report.issue("json_depth_exceeded", "$", `The input nests brackets more than ${MAX_JSON_DEPTH} deep; it was not parsed.`, "I.JSON");
    report.set("I.JSON", "fail", "Nesting is over the limit.");
    return finish("I.JSON did not pass.");
  }
  let fixture;
  try {
    fixture = JSON.parse(text);
  } catch {
    report.issue("json_parse", "$", "JSON parsing failed; no input content was copied into this issue.", "I.JSON");
    report.set("I.JSON", "fail", "JSON parsing failed.");
    return finish("I.JSON did not pass.");
  }
  const repeated = repeatedJsonKeys(text);
  if (repeated > 0) {
    report.issue("json_key_duplicate", "$", `${plural(repeated, "object key")} appear${repeated === 1 ? "s" : ""} more than once in one object; the key text was not copied.`, "I.JSON");
    report.set("I.JSON", "fail", `${plural(repeated, "repeated object key")} observed.`);
    return finish("I.JSON did not pass.");
  }
  report.set("I.JSON", "pass", "One JSON value with no repeated key was parsed.");

  const shape = schemaIssues("fixture", fixture);
  if (shape.length > 0) {
    for (const entry of shape) report.issue(entry.code, entry.path, entry.message, "I.SHAPE");
    report.set("I.SHAPE", "fail", `${plural(shape.length, "schema issue")} observed.`);
    return finish("I.SHAPE did not pass.");
  }
  report.set("I.SHAPE", "pass", "The fixture matches its schema. Response bodies are any object at this step.");

  const exercised = checkFixture(fixture, report);
  return buildResult({ artifact, observedAt, report, origin: fixture.origin, exercised });
}

// --- File input and the command line, after readBoundedRegularFile,
// checkWorkRunFile and main of work/0.1/check.mjs.

async function readBoundedRegularFile(path) {
  // Looked at before it is opened: opening a named pipe waits for a writer.
  if (!(await stat(path)).isFile()) throw new Error("input path must name a regular file");
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

/** Check one local regular file without resolving any address found inside it. */
export async function checkArrivalFixtureFile(path, options = {}) {
  if (typeof path !== "string" || path.length === 0) throw new TypeError("path must be a non-empty string");
  const observedAt = strictObservedAt(options.now);
  const input = await readBoundedRegularFile(path);
  if (!input.complete) return incompleteResult(input.observedBytes, observedAt);
  return checkArrivalFixtureBytes(input.bytes, { now: observedAt });
}

function usage() {
  return [
    "Usage: node arrival/0.1/check.mjs <fixture.json> [--json]",
    "       node arrival/0.1/check.mjs --help",
    "",
    "Compares the exchanges recorded in one local XENIA Arrival 0.1 fixture with",
    "the twenty Arrival 0.1 checks. It reads that one file, up to 262144 bytes,",
    "and the three schema files beside this script. It makes no network request,",
    "reads no credential or environment variable, and writes nothing.",
    "",
    "Exit codes: 0 checks_passed; 1 check_failed or indeterminate; 2 misuse, a",
    "file that cannot be read, or a checker defect.",
    "",
    "A result says, per check, whether the recorded exchanges agree with that",
    "check. It does not establish that any host sent them or behaves so now, or",
    "any other line under not_established, which every result repeats in full.",
  ].join("\n");
}

function printHuman(result) {
  const lines = [
    `XENIA Arrival 0.1 development draft: ${result.result}`,
    `scope: ${result.scope}`,
    `artifact: ${result.artifact.complete ? result.artifact.sha256 : "incomplete (input limit)"}`,
    `fixture origin: ${result.fixture_origin ?? "not read"}`,
    `checks: ${result.counts.pass} pass, ${result.counts.fail} fail, ${result.counts.unknown} unknown, ${result.counts.not_run} not run`,
    `exercised: ${result.exercised.items_compared_equal} unacknowledged items found equal; ${result.exercised.differences_found} decidable differences found, ${result.exercised.differences_named} named`,
  ];
  for (const entry of result.checks) {
    if (entry.outcome !== "pass") lines.push(`${entry.outcome} ${entry.id}: ${entry.observed}`);
  }
  for (const entry of result.issues.slice(0, 12)) {
    lines.push(`- ${entry.code} at ${entry.path}: ${entry.message}`);
  }
  if (result.issues.length > 12) lines.push(`- ${result.issues.length - 12} more issues; use --json for all of them`);
  lines.push("not established:");
  for (const entry of result.not_established) lines.push(`- ${entry}`);
  return `${lines.join("\n")}\n`;
}

export async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const json = args.includes("--json");
  const unknownOptions = args.filter((value) => value.startsWith("-") && value !== "--json");
  const positional = args.filter((value) => !value.startsWith("-"));
  if (unknownOptions.length > 0 || positional.length !== 1) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  try {
    const result = await checkArrivalFixtureFile(positional[0]);
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : printHuman(result));
    return result.result === "checks_passed" ? 0 : 1;
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
