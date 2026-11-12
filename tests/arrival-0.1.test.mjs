// SPDX-License-Identifier: MPL-2.0

// Schema and pin tests for the Arrival 0.1 development draft. They cover the
// four JSON Schemas, the hand-written example, and what the README says. They
// do not run a checker.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { validateProblem } from "../surface/0.1/check.mjs";

const root = new URL("../", import.meta.url);
const directory = new URL("arrival/0.1/", root);

function text(path, base = directory) {
  return readFileSync(new URL(path, base), "utf8");
}

function json(path, base = directory) {
  return JSON.parse(text(path, base));
}

const SCHEMA_NAMES = ["orientation", "view", "fixture", "result"];
const schemas = Object.fromEntries(SCHEMA_NAMES.map((name) => [name, json(`${name}.schema.json`)]));
const example = json("examples/two-visits.json");
const readme = text("README.md");
const surfaceProblemSchema = json("surface/0.1/problem.schema.json", root);
const workRunSchema = json("work/0.1/run.schema.json", root);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = Object.fromEntries(SCHEMA_NAMES.map((name) => [name, ajv.compile(schemas[name])]));
const validateSurfaceProblem = ajv.compile(surfaceProblemSchema);

const VIEW_TOKENS = [
  "reader_sameness",
  "identity_beyond_credential",
  "completeness_beyond_bounds",
  "instruction_or_authority",
  "obligation_binds_reader",
  "waiver_by_silence",
  "other_layers_unrecorded",
];
const ORIENTATION_TOKENS = ["anything_about_caller", "access_to_view"];
const STATES = ["ok", "quiet", "partial", "unavailable", "withheld"];
const CHANGE_KINDS = ["added", "changed", "ended", "out_of_window"];
const CHECK_IDS = [
  "I.SIZE",
  "I.UTF8",
  "I.JSON",
  "I.SHAPE",
  "I.NO_CREDENTIAL",
  "I.RECORD",
  "R1.ORIENTATION",
  "R1.REFUSAL",
  "R1.VIEW",
  "P.PAIR",
  "R2.DECLARED_EFFECTS",
  "R2.SHOWN_AGAIN",
  "R3.STATES",
  "R3.SECTIONS_KEPT",
  "R4.CURSOR",
  "R4.CHANGES",
  "R4.BAD_CURSOR",
  "R5.FRESHNESS",
  "R6.NO_OBLIGATION",
  "R7.NON_CLAIMS",
];
const RESULT_NOT_ESTABLISHED = [
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
];

function clone(value) {
  return structuredClone(value);
}

function errorsOf(validator) {
  return JSON.stringify(validator.errors, null, 2);
}

function accepts(name, value, message) {
  assert.equal(validate[name](value), true, `${message ?? name} should be schema-valid: ${errorsOf(validate[name])}`);
}

function rejects(name, value, message) {
  assert.equal(validate[name](value), false, `${message ?? name} should be schema-invalid`);
}

function orientationBody() {
  return clone(example.visits.first.orientation.response.body);
}

function firstView() {
  return clone(example.visits.first.view.response.body);
}

function secondView() {
  return clone(example.visits.second.view.response.body);
}

// The JSON Schema keywords the Arrival schemas use, by what they hold. A
// keyword outside these sets fails a test below, so the walk cannot miss a
// subschema, and a hand-written validator has a closed list to match.
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "$defs"]);
const SCHEMA_LIST_KEYWORDS = new Set(["anyOf", "allOf", "prefixItems"]);
const SCHEMA_KEYWORDS = new Set(["items", "contains", "not", "if", "then", "else", "additionalProperties"]);
const VALUE_KEYWORDS = new Set([
  "$schema", "$id", "$comment", "$ref", "title", "description", "type", "required", "enum", "const",
  "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
]);

// Visits every schema object. `inCondition` is true below an `if`, where a
// subschema is a question about a value and not a shape for one.
function walkSchema(node, path, visit, inCondition = false) {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return;
  visit(node, path, inCondition);
  for (const [key, value] of Object.entries(node)) {
    const below = inCondition || key === "if";
    if (SCHEMA_MAP_KEYWORDS.has(key)) {
      for (const [name, child] of Object.entries(value)) walkSchema(child, `${path}/${key}/${name}`, visit, below);
    } else if (SCHEMA_LIST_KEYWORDS.has(key)) {
      value.forEach((child, index) => walkSchema(child, `${path}/${key}/${index}`, visit, below));
    } else if (SCHEMA_KEYWORDS.has(key)) {
      walkSchema(value, `${path}/${key}`, visit, below);
    }
  }
}

function sampleResult(outcomes = {}) {
  const checks = CHECK_IDS.map((id) => ({
    id,
    outcome: outcomes[id] ?? "pass",
    expected: "what the check table states",
    observed: "a summary that copies no fixture value",
  }));
  const counts = { pass: 0, fail: 0, unknown: 0, not_run: 0 };
  for (const entry of checks) counts[entry.outcome] += 1;
  const word = counts.fail > 0
    ? "check_failed"
    : counts.unknown + counts.not_run > 0
      ? "indeterminate"
      : "checks_passed";
  return {
    $schema: "urn:xenia:arrival:result:0.1:development-draft",
    schema_version: "xenia.arrival.result/0.1-development",
    profile: "xenia-arrival/0.1-development",
    artifact: { complete: true, observed_bytes: 4096, sha256: `sha256:${"0".repeat(64)}` },
    fixture_origin: "hand_written",
    verifier: { name: "xenia-arrival-check", version: "0.1.0-development" },
    observed_at: "2026-11-12T12:00:00Z",
    result: word,
    scope: schemas.result.properties.scope.const,
    output_handling: schemas.result.properties.output_handling.const,
    limits: {
      max_input_bytes: 262144,
      max_orientation_bytes: 8192,
      max_view_bytes: 65536,
      max_json_depth: 64,
      max_issues: 256,
    },
    counts,
    exercised: {
      items_compared_equal: 2,
      differences_found: 3,
      differences_named: 3,
      states_seen: { ok: 4, quiet: 1, partial: 2, unavailable: 2, withheld: 2 },
    },
    checks,
    issues: [],
    not_established: [...RESULT_NOT_ESTABLISHED],
  };
}

test("each Arrival schema carries a development identifier and compiles under strict Ajv", () => {
  for (const name of SCHEMA_NAMES) {
    const schema = schemas[name];
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.$id, `urn:xenia:arrival:${name}:0.1:development-draft`);
    assert.equal(schema.$comment, "SPDX-License-Identifier: CC-BY-SA-4.0");
    assert.match(schema.title, /^XENIA Arrival 0\.1 .* development draft$/);
    assert.equal(schema.properties.schema_version.const, `xenia.arrival.${name}/0.1-development`);
    assert.ok(schema.required.includes("schema_version"));
    assert.equal(typeof validate[name], "function");
    assert.match(schema.description, /does not establish|establishes nothing/, `${name} says what validity does not establish`);
  }
});

test("the Arrival schemas use a small, known set of JSON Schema keywords", () => {
  for (const name of SCHEMA_NAMES) {
    walkSchema(schemas[name], "", (node, path) => {
      for (const key of Object.keys(node)) {
        const known = SCHEMA_MAP_KEYWORDS.has(key) || SCHEMA_LIST_KEYWORDS.has(key)
          || SCHEMA_KEYWORDS.has(key) || VALUE_KEYWORDS.has(key);
        assert.ok(known, `${name}${path} uses the keyword ${key}, which these tests do not walk`);
      }
    });
  }
  // Only the result schema asks questions with if/then/else or contains.
  for (const name of ["orientation", "view", "fixture"]) {
    walkSchema(schemas[name], "", (node, path) => {
      for (const key of ["if", "then", "else", "not", "contains", "allOf", "prefixItems"]) {
        assert.ok(!Object.hasOwn(node, key), `${name}${path} stays free of ${key}`);
      }
    });
  }
});

// An object schema is closed when it refuses unnamed properties itself, or
// narrows a local definition that does.
function isClosed(schema, node) {
  if (node.additionalProperties === false) return true;
  const local = /^#\/\$defs\/([A-Za-z_]+)$/.exec(node.$ref ?? "");
  return local !== null && schema.$defs[local[1]]?.additionalProperties === false;
}

test("every object in every Arrival schema is closed, except the recorded response body", () => {
  for (const name of SCHEMA_NAMES) {
    const open = [];
    walkSchema(schemas[name], "", (node, path, inCondition) => {
      if (inCondition || node.type !== "object") return;
      if (!isClosed(schemas[name], node)) open.push(path);
    });
    const expected = name === "fixture" ? ["/$defs/exchange/properties/response/properties/body/anyOf/0"] : [];
    assert.deepEqual(open, expected, `${name} schema objects left open`);
  }
});

test("the document schemas fix only the version and the kind of document or request", () => {
  const expected = {
    orientation: ["/properties/audience/properties/basis", "/properties/schema_version"],
    view: ["/properties/audience/properties/basis", "/properties/schema_version"],
    fixture: ["/$defs/exchange/properties/request/properties/method", "/properties/schema_version"],
  };
  for (const [name, paths] of Object.entries(expected)) {
    const fixed = [];
    walkSchema(schemas[name], "", (node, path) => {
      if (Object.hasOwn(node, "const")) fixed.push(path);
      if (Array.isArray(node.enum) && node.enum.length === 1) fixed.push(path);
    });
    assert.deepEqual(fixed.sort(), paths, `${name} constants`);
  }
  assert.equal(schemas.orientation.properties.audience.properties.basis.const, "anyone");
  assert.equal(schemas.view.properties.audience.properties.basis.const, "credential_presented");
});

test("reused definitions are the ones in Work and Surface, and the two read-effects shapes are one shape", () => {
  const surfaceHref = surfaceProblemSchema.properties.next_actions.items.properties.href;
  for (const name of ["orientation", "view", "fixture"]) {
    assert.equal(schemas[name].$defs.href.pattern, surfaceHref.pattern, `${name} href pattern is Surface's`);
    assert.equal(schemas[name].$defs.href.format, surfaceHref.format);
    assert.equal(schemas[name].$defs.href.maxLength, 2048);
    assert.deepEqual(schemas[name].$defs.timestamp, workRunSchema.$defs.timestamp, `${name} timestamp is Work's`);
  }
  assert.deepEqual(schemas.result.properties.observed_at, workRunSchema.$defs.timestamp);
  assert.deepEqual(schemas.orientation.$defs.read_effects, schemas.view.$defs.read_effects);
  assert.deepEqual(schemas.fixture.$defs.cursor, schemas.view.$defs.cursor);
});

test("the document and fixture shapes are the field lists the README gives, with no optional document field", () => {
  const fields = (node) => Object.keys(node.properties);
  const { orientation, view, fixture } = schemas;
  assert.deepEqual(fields(orientation), [
    "schema_version", "as_of", "valid_until", "audience", "place", "view", "reply_expected", "not_established",
  ]);
  assert.deepEqual(fields(orientation.properties.audience), ["basis"]);
  assert.deepEqual(fields(orientation.properties.place), ["name", "summary", "manifest"]);
  assert.deepEqual(fields(orientation.properties.view), ["href", "credential_kinds", "cursor_parameter", "read_effects"]);
  assert.deepEqual(fields(view), [
    "schema_version", "as_of", "valid_until", "audience", "basis", "cursor", "changes", "sections",
    "read_effects", "acknowledgement", "reply_expected", "read_creates_obligation", "not_established",
  ]);
  assert.deepEqual(fields(view.properties.audience), ["basis", "scope", "record_set_ref"]);
  assert.deepEqual(fields(view.properties.basis), ["kind", "cursor"]);
  assert.deepEqual(fields(view.properties.acknowledgement.anyOf[0]), ["href", "position"]);
  const envelope = ["state", "count", "limit", "items", "dropped", "unavailable", "withheld"];
  assert.deepEqual(fields(view.$defs.section), ["id", "title", "kind", "scope", ...envelope]);
  assert.deepEqual(fields(view.$defs.changes), envelope);
  for (const field of envelope.filter((name) => name !== "items")) {
    assert.deepEqual(view.$defs.changes.properties[field], view.$defs.section.properties[field], `one ${field} for sections and changes`);
  }
  assert.deepEqual(fields(view.$defs.item), ["id", "summary", "recorded_at", "acknowledged_at", "ref", "owed_to", "due_at"]);
  assert.deepEqual(fields(view.$defs.change), ["section_id", "item_id", "change"]);
  assert.deepEqual(fields(view.$defs.dropped.anyOf[0]), ["count", "reason", "deeper_read"]);
  assert.deepEqual(fields(view.$defs.read_effects), ["participant_record_writes", "operational_writes"]);

  assert.deepEqual(view.$defs.state.enum, STATES);
  assert.deepEqual(view.$defs.change.properties.change.enum, CHANGE_KINDS);
  assert.deepEqual(view.$defs.scope.enum, ["identity", "project", "mixed", "unknown"]);
  assert.deepEqual(view.$defs.section.properties.kind.enum, ["recorded_obligations", "other"]);
  assert.deepEqual(view.properties.basis.properties.kind.enum, ["full", "since_cursor"]);
  assert.deepEqual(view.$defs.dropped.anyOf[0].properties.reason.enum, ["limit", "not_listed_by_design", "other"]);
  assert.deepEqual(view.$defs.unavailable.anyOf[0].properties.code.enum, ["read_failed", "not_observed", "other"]);
  assert.deepEqual(view.$defs.withheld.anyOf[0].properties.code.enum, ["not_shown_to_this_credential", "other"]);
  assert.deepEqual(view.$defs.read_effects.properties.participant_record_writes.enum, ["none", "some", "unknown"]);

  assert.deepEqual(fields(fixture), ["schema_version", "origin", "between_visits", "visits"]);
  assert.deepEqual(fields(fixture.properties.visits.properties.first), ["orientation", "view_without_credential", "view"]);
  assert.deepEqual(fields(fixture.properties.visits.properties.second), ["view", "bad_cursor"]);
  assert.deepEqual(fields(fixture.$defs.exchange), ["requested_at", "request", "response"]);
  assert.deepEqual(fields(fixture.$defs.exchange.properties.request), ["method", "href", "credential", "cursor"]);
  assert.deepEqual(fields(fixture.$defs.exchange.properties.response), ["status", "body"]);
  assert.deepEqual(fixture.properties.origin.enum, ["hand_written", "host_bytes", "projected_by_recorder"]);
  assert.deepEqual(fixture.properties.between_visits.properties.acknowledged_by_recorder.enum, ["no", "yes", "not_stated"]);
  assert.deepEqual(fixture.$defs.exchange.properties.request.properties.credential.enum, ["none", "presented"]);

  // Not stated is said with null, never by leaving a field out. Only the five
  // exchanges of a fixture are optional.
  const optionalByDesign = new Set(["/properties/visits/properties/first", "/properties/visits/properties/second"]);
  for (const name of ["orientation", "view", "fixture"]) {
    walkSchema(schemas[name], "", (node, path, inCondition) => {
      if (inCondition || node.type !== "object" || node.properties === undefined) return;
      if (name === "fixture" && optionalByDesign.has(path)) {
        assert.equal(node.required, undefined, `${name}${path} leaves each exchange optional`);
        return;
      }
      assert.deepEqual(node.required, Object.keys(node.properties), `${name}${path} requires every field it names`);
    });
  }
});

test("the hand-written example matches the fixture, orientation and view schemas", () => {
  accepts("fixture", example, "the example fixture");
  assert.equal(example.origin, "hand_written");
  assert.equal(example.between_visits.acknowledged_by_recorder, "no");
  assert.deepEqual(Object.keys(example.visits.first), ["orientation", "view_without_credential", "view"]);
  assert.deepEqual(Object.keys(example.visits.second), ["view", "bad_cursor"]);

  const orientation = example.visits.first.orientation;
  assert.equal(orientation.response.status, 200);
  accepts("orientation", orientation.response.body, "the example orientation");
  assert.ok(Buffer.byteLength(JSON.stringify(orientation.response.body)) <= 8192);

  for (const exchange of [example.visits.first.view, example.visits.second.view]) {
    assert.equal(exchange.response.status, 200);
    accepts("view", exchange.response.body, "an example view");
    assert.ok(Buffer.byteLength(JSON.stringify(exchange.response.body)) <= 65536);
  }
  assert.ok(Buffer.byteLength(text("examples/two-visits.json")) <= 262144);

  // The two documents are different documents: neither passes for the other.
  rejects("view", orientation.response.body, "an orientation offered as a view");
  rejects("orientation", example.visits.first.view.response.body, "a view offered as an orientation");
});

test("the example refusals are XENIA Surface 0.1 problems with the two Arrival codes", () => {
  const refusals = [
    [example.visits.first.view_without_credential, "credential_required"],
    [example.visits.second.bad_cursor, "cursor_not_accepted"],
  ];
  for (const [exchange, code] of refusals) {
    const { status, body } = exchange.response;
    assert.ok(status >= 400 && status <= 499, `${code} is answered with a 4xx`);
    assert.equal(validateSurfaceProblem(body), true, errorsOf(validateSurfaceProblem));
    assert.deepEqual(validateProblem(body, status), []);
    assert.equal(body.code, code);
    assert.equal(body.terminal, false);
  }
  const orientationHref = example.visits.first.orientation.request.href;
  const viewHref = example.visits.first.view.request.href;
  assert.equal(example.visits.first.view_without_credential.response.body.next_actions[0].href, orientationHref);
  assert.ok(example.visits.second.bad_cursor.response.body.next_actions.some((action) => action.href === viewHref));
});

test("the example names a fictitious host only and shows every state and every kind of change", () => {
  const strings = [];
  (function collect(value) {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  })(example);
  const addresses = strings.filter((value) => /^https?:\/\//.test(value));
  assert.ok(addresses.length > 0);
  for (const address of addresses) {
    assert.match(new URL(address).hostname, /\.example$/, "example addresses use a reserved .example host");
  }

  const views = [example.visits.first.view.response.body, example.visits.second.view.response.body];
  const seenStates = new Set(views.flatMap((view) => view.sections.map((section) => section.state)));
  assert.deepEqual([...seenStates].sort(), [...STATES].sort());
  const seenChanges = new Set(views.flatMap((view) => (view.changes?.items ?? []).map((entry) => entry.change)));
  assert.deepEqual([...seenChanges].sort(), [...CHANGE_KINDS].sort());
  assert.equal(views[0].changes, null);
  assert.equal(views[0].basis.kind, "full");
  assert.equal(views[1].basis.kind, "since_cursor");
  assert.equal(example.visits.second.view.request.cursor, views[0].cursor);
});

test("a field whose presence is itself a rule may be null and the document stays schema-valid", () => {
  for (const field of ["as_of", "valid_until", "reply_expected"]) {
    const body = orientationBody();
    body[field] = null;
    accepts("orientation", body, `orientation with ${field} not stated`);
  }
  const withoutEffects = orientationBody();
  withoutEffects.view.read_effects = null;
  accepts("orientation", withoutEffects, "orientation with read_effects not stated");
  const withoutNonClaims = orientationBody();
  withoutNonClaims.not_established = [];
  accepts("orientation", withoutNonClaims, "orientation with an empty not_established");

  for (const field of ["as_of", "valid_until", "read_effects", "reply_expected", "read_creates_obligation"]) {
    const body = firstView();
    body[field] = null;
    accepts("view", body, `view with ${field} not stated`);
  }
  const viewWithoutNonClaims = firstView();
  viewWithoutNonClaims.not_established = [];
  accepts("view", viewWithoutNonClaims, "view with an empty not_established");
});

test("a broken rule is not a broken shape: rule values stay schema-valid", () => {
  const replies = firstView();
  replies.reply_expected = true;
  replies.read_creates_obligation = true;
  accepts("view", replies, "a view that expects a reply");

  const writes = firstView();
  writes.read_effects.participant_record_writes = "some";
  accepts("view", writes, "a view that declares a write");

  // The state table is a check, not a schema rule.
  const zeroCount = firstView();
  const unavailable = zeroCount.sections.find((section) => section.state === "unavailable");
  unavailable.count = 0;
  accepts("view", zeroCount, "count 0 on an unavailable section");

  const noCursor = firstView();
  noCursor.cursor = null;
  accepts("view", noCursor, "a view that hands back no cursor");

  const noAcknowledgement = firstView();
  noAcknowledgement.acknowledgement = null;
  accepts("view", noAcknowledgement, "a view with no acknowledgement address");
});

test("the orientation has no field about the caller", () => {
  for (const field of ["caller", "identity", "subject", "you", "greeting"]) {
    const body = orientationBody();
    body[field] = "anything";
    rejects("orientation", body, `orientation with a ${field} field`);
  }
  const widened = orientationBody();
  widened.audience.basis = "credential_presented";
  rejects("orientation", widened, "an orientation addressed to a credential");
  const narrowed = firstView();
  narrowed.audience.basis = "anyone";
  rejects("view", narrowed, "a view addressed to anyone");
});

test("the view schema holds its bounds", () => {
  const cases = [
    ["no sections", (view) => { view.sections = []; }],
    ["seventeen sections", (view) => {
      view.sections = Array.from({ length: 17 }, (_, index) => ({ ...clone(view.sections[0]), id: `section-${index}` }));
    }],
    ["limit 0", (view) => { view.sections[0].limit = 0; }],
    ["limit 33", (view) => { view.sections[0].limit = 33; }],
    ["thirty-three items", (view) => {
      const item = view.sections[0].items[0];
      view.sections[0].items = Array.from({ length: 33 }, (_, index) => ({ ...clone(item), id: `item-${index}` }));
    }],
    ["a negative count", (view) => { view.sections[0].count = -1; }],
    ["a fractional count", (view) => { view.sections[0].count = 1.5; }],
    ["a state outside the five", (view) => { view.sections[0].state = "empty"; }],
    ["a section kind outside the two", (view) => { view.sections[0].kind = "owed_to_others"; }],
    ["a scope outside the four", (view) => { view.sections[0].scope = "account"; }],
    ["a summary of 301 characters", (view) => { view.sections[0].items[0].summary = "s".repeat(301); }],
    ["an empty summary", (view) => { view.sections[0].items[0].summary = ""; }],
    ["a title of 121 characters", (view) => { view.sections[0].title = "t".repeat(121); }],
    ["a cursor of 1025 characters", (view) => { view.cursor = "c".repeat(1025); }],
    ["an empty cursor", (view) => { view.cursor = ""; }],
    ["a position of 257 characters", (view) => { view.acknowledgement.position = "p".repeat(257); }],
    ["nine operational writes", (view) => {
      view.read_effects.operational_writes = Array.from({ length: 9 }, (_, index) => `write ${index}`);
    }],
    ["an operational write of 121 characters", (view) => { view.read_effects.operational_writes = ["w".repeat(121)]; }],
    ["a write word outside the three", (view) => { view.read_effects.participant_record_writes = "maybe"; }],
    ["an item without due_at", (view) => { delete view.sections[0].items[0].due_at; }],
    ["an item with an extra field", (view) => { view.sections[0].items[0].priority = "high"; }],
    ["a section without withheld", (view) => { delete view.sections[0].withheld; }],
    ["an unknown not_established token", (view) => { view.not_established.push("nothing_at_all"); }],
    ["a repeated not_established token", (view) => { view.not_established.push(view.not_established[0]); }],
    ["a timestamp with an offset", (view) => { view.as_of = "2026-11-12T09:00:00+00:00"; }],
    ["a date that does not exist", (view) => { view.as_of = "2026-02-30T09:00:00Z"; }],
    ["an href with userinfo", (view) => { view.acknowledgement.href = "https://name@house.example/arrival/acknowledgements"; }],
    ["a relative href", (view) => { view.acknowledgement.href = "/arrival/acknowledgements"; }],
    ["a plaintext href outside loopback", (view) => { view.acknowledgement.href = "http://house.example/arrival/acknowledgements"; }],
    ["a basis kind outside the two", (view) => { view.basis.kind = "delta"; }],
    ["an unknown top-level field", (view) => { view.greeting = "hello"; }],
    ["a wrong schema_version", (view) => { view.schema_version = "xenia.arrival.view/0.2"; }],
  ];
  for (const [label, mutate] of cases) {
    const view = firstView();
    mutate(view);
    rejects("view", view, label);
  }

  const changeCases = [
    ["a change kind outside the four", (view) => { view.changes.items[0].change = "acknowledged"; }],
    ["a change entry with a reason", (view) => { view.changes.items[0].reason = "because"; }],
    ["a changes envelope without a state", (view) => { delete view.changes.state; }],
  ];
  for (const [label, mutate] of changeCases) {
    const view = secondView();
    mutate(view);
    rejects("view", view, label);
  }

  const atBounds = firstView();
  atBounds.sections[0].limit = 32;
  atBounds.sections[0].items[0].summary = "s".repeat(300);
  atBounds.sections[0].title = "t".repeat(120);
  atBounds.cursor = "c".repeat(1024);
  atBounds.acknowledgement.position = "p".repeat(256);
  atBounds.read_effects.operational_writes = Array.from({ length: 8 }, (_, index) => `${"w".repeat(118)}${index}`);
  atBounds.acknowledgement.href = "https://house.example/arrival/acknowledgements?status=open";
  accepts("view", atBounds, "a view at its bounds, with a query in an href");
});

test("the fixture records requests and responses, and has no slot for headers or the credential", () => {
  const empty = clone(example);
  empty.visits = { first: {}, second: {} };
  accepts("fixture", empty, "a fixture with no exchange recorded");

  const malformed = clone(example);
  malformed.visits.first.view.response.body = { anything: ["at", "all"] };
  malformed.visits.first.orientation.response.body = null;
  accepts("fixture", malformed, "a fixture whose host documents are malformed");

  const repeat = clone(example);
  repeat.visits.second.view.request.cursor = null;
  accepts("fixture", repeat, "a plain repeat read with no cursor");

  for (const origin of ["hand_written", "host_bytes", "projected_by_recorder"]) {
    const fixture = clone(example);
    fixture.origin = origin;
    accepts("fixture", fixture, `origin ${origin}`);
  }
  for (const statement of ["no", "yes", "not_stated"]) {
    const fixture = clone(example);
    fixture.between_visits.acknowledged_by_recorder = statement;
    accepts("fixture", fixture, `recorder statement ${statement}`);
  }

  const cases = [
    ["request headers", (fixture) => { fixture.visits.first.view.request.headers = {}; }],
    ["response headers", (fixture) => { fixture.visits.first.view.response.headers = {}; }],
    ["the credential itself", (fixture) => { fixture.visits.first.view.request.credential_value = "anything"; }],
    ["a note beside an exchange", (fixture) => { fixture.visits.first.view.note = "a note"; }],
    ["a credential word outside the two", (fixture) => { fixture.visits.first.view.request.credential = "bearer"; }],
    ["a method other than GET", (fixture) => { fixture.visits.first.view.request.method = "POST"; }],
    ["a body that is a list", (fixture) => { fixture.visits.first.view.response.body = []; }],
    ["a body that is text", (fixture) => { fixture.visits.first.view.response.body = "<html>"; }],
    ["a status outside 100 to 599", (fixture) => { fixture.visits.first.view.response.status = 600; }],
    ["an exchange with no requested_at", (fixture) => { delete fixture.visits.first.view.requested_at; }],
    ["an unknown exchange", (fixture) => { fixture.visits.second.third_view = clone(fixture.visits.second.view); }],
    ["a third visit", (fixture) => { fixture.visits.third = {}; }],
    ["an origin outside the three", (fixture) => { fixture.origin = "live"; }],
    ["a missing recorder statement", (fixture) => { delete fixture.between_visits; }],
    ["a free-text note", (fixture) => { fixture.note = "a note"; }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = clone(example);
    mutate(fixture);
    rejects("fixture", fixture, label);
  }
});

test("the result schema fixes twenty checks in order and ties the result word to their outcomes", () => {
  assert.deepEqual(schemas.result.properties.checks.prefixItems.map((entry) => entry.properties.id.const), CHECK_IDS);
  assert.deepEqual(schemas.result.properties.not_established.prefixItems.map((entry) => entry.const), RESULT_NOT_ESTABLISHED);
  assert.deepEqual(schemas.result.properties.result.enum, ["checks_passed", "check_failed", "indeterminate"]);

  const passed = sampleResult();
  assert.equal(passed.result, "checks_passed");
  accepts("result", passed, "a result with twenty passes");
  assert.equal(sampleResult({ "R4.CHANGES": "unknown" }).result, "indeterminate");
  accepts("result", sampleResult({ "R4.CHANGES": "unknown" }), "a result with one unknown");
  accepts("result", sampleResult({ "R4.BAD_CURSOR": "not_run" }), "a result with one check not run");
  accepts("result", sampleResult({ "R3.STATES": "fail", "R4.CHANGES": "unknown" }), "a result with one failure");

  const unread = sampleResult({ "I.JSON": "fail" });
  unread.fixture_origin = null;
  accepts("result", unread, "a result for a fixture that could not be read");

  const oversize = sampleResult({ "I.SIZE": "unknown" });
  oversize.artifact = { complete: false, observed_bytes: 300000 };
  oversize.fixture_origin = null;
  accepts("result", oversize, "a result for an oversize input");

  const cases = [
    ["a failure reported as passed", () => ({ ...sampleResult({ "R3.STATES": "fail" }), result: "checks_passed" })],
    ["a failure reported as indeterminate", () => ({ ...sampleResult({ "R3.STATES": "fail" }), result: "indeterminate" })],
    ["an unknown reported as passed", () => ({ ...sampleResult({ "P.PAIR": "unknown" }), result: "checks_passed" })],
    ["a check not run reported as passed", () => ({ ...sampleResult({ "P.PAIR": "not_run" }), result: "checks_passed" })],
    ["twenty passes reported as failed", () => ({ ...sampleResult(), result: "check_failed" })],
    ["a conformance word", () => ({ ...sampleResult(), result: "conformant" })],
    ["nineteen checks", () => { const value = sampleResult(); value.checks.pop(); return value; }],
    ["checks out of order", () => { const value = sampleResult(); value.checks.reverse(); return value; }],
    ["a twenty-first check", () => {
      const value = sampleResult();
      value.checks.push({ id: "R8.EXTRA", outcome: "pass", expected: "x", observed: "y" });
      return value;
    }],
    ["a check with an echoed value field", () => { const value = sampleResult(); value.checks[0].value = "x"; return value; }],
    ["a shortened not_established", () => { const value = sampleResult(); value.not_established.pop(); return value; }],
    ["a reworded not_established", () => {
      const value = sampleResult();
      value.not_established[0] = "that the host is conformant";
      return value;
    }],
    ["a complete artifact without a digest", () => { const value = sampleResult(); delete value.artifact.sha256; return value; }],
    ["an origin outside the three", () => ({ ...sampleResult(), fixture_origin: "live" })],
    ["a missing exercised record", () => { const value = sampleResult(); delete value.exercised; return value; }],
    ["a state count for a sixth state", () => {
      const value = sampleResult();
      value.exercised.states_seen.empty = 1;
      return value;
    }],
    ["an added claim field", () => ({ ...sampleResult(), conformant: true })],
    ["an issue with a copied value", () => {
      const value = sampleResult({ "R3.STATES": "fail" });
      value.issues.push({ code: "state_mismatch", path: "$.visits.first.view", message: "m", value: "copied" });
      return value;
    }],
  ];
  for (const [label, build] of cases) rejects("result", build(), label);
});

test("the README is a short, non-normative status report that names what it leaves open", () => {
  assert.ok(Buffer.byteLength(readme) <= 16 * 1024, "README is at most 16 KiB");
  assert.match(readme, /^Status: \*\*development draft\*\*$/m);
  assert.match(readme, /one author/);
  assert.match(readme, /No second implementation/);
  assert.match(readme, /No host is known to serve/);
  assert.match(readme, /written by hand/);
  assert.match(readme, /^## Outside Arrival 0\.1$/m);
  assert.match(readme, /^## Exit gate \(declared, unmet\)$/m);
  assert.doesNotMatch(readme, /\b(?:MUST|SHALL|SHOULD|MAY|REQUIRED)\b/, "the README states no requirement");
  assert.doesNotMatch(readme, /conformant/);

  for (const token of [...VIEW_TOKENS, ...ORIENTATION_TOKENS]) {
    assert.ok(readme.includes(`\`${token}\``), `README explains ${token}`);
  }
  for (const id of CHECK_IDS) assert.ok(readme.includes(`\`${id}\``), `README lists ${id}`);
  for (const state of STATES) assert.ok(readme.includes(`\`${state}\``), `README lists state ${state}`);
  assert.deepEqual(schemas.view.properties.not_established.items.enum, VIEW_TOKENS);
  assert.deepEqual(schemas.orientation.properties.not_established.items.enum, ORIENTATION_TOKENS);
});

test("the README says whether a checker is in the directory, and that statement is true", () => {
  const checkerPresent = existsSync(new URL("check.mjs", directory));
  const saysAbsent = readme.includes("No checker is in this directory yet");
  assert.equal(
    saysAbsent,
    !checkerPresent,
    "arrival/0.1/README.md must say 'No checker is in this directory yet' exactly while check.mjs is absent; update the status block when that changes",
  );
});

test("relative links in the README resolve, and no file in the directory names a local path", () => {
  const links = [...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  assert.ok(links.length > 0);
  for (const link of links) {
    if (/^(?:https?:|#)/.test(link)) continue;
    const target = new URL(link.split("#")[0], directory);
    assert.ok(existsSync(target), `README link ${link} resolves`);
  }
  for (const [name, content] of directoryFiles()) {
    assert.doesNotMatch(content, /\/(?:Users|home|private|var\/folders)\//, `${name} names no local path`);
  }
});

// Every file under arrival/0.1, as [path relative to that directory, text].
function directoryFiles() {
  const base = fileURLToPath(directory);
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(base, path).split(sep).join("/"), readFileSync(path, "utf8")];
    })
    .sort(([left], [right]) => (left < right ? -1 : 1));
}

test("one README sentence uses the word that has two meanings here; nothing else in the directory does", () => {
  const word = /wake/gi;
  assert.equal((readme.match(word) ?? []).length, 1, "README uses the word exactly once");
  for (const [name, content] of directoryFiles()) {
    if (name === "README.md") continue;
    assert.equal((content.match(word) ?? []).length, 0, `${name} does not use the word`);
  }
});

test("Arrival 0.1 stays outside the package, its exports, and the normative profile list", () => {
  const manifest = json("package.json", root);
  const spec = json("spec.json", root);
  assert.ok(manifest.files.every((entry) => !entry.startsWith("arrival")));
  assert.ok(Object.keys(manifest.exports).every((key) => !key.includes("arrival")));
  assert.ok(!JSON.stringify(manifest.exports).includes("arrival/"));
  assert.ok(!JSON.stringify(spec.normative_profiles).includes("arrival"));
  assert.ok(!JSON.stringify(manifest.workspaces).includes("arrival"));
});
