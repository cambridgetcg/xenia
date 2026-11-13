// SPDX-License-Identifier: MPL-2.0

// Tests for the Arrival 0.1 development draft: the four JSON Schemas, the
// hand-written example, what the README says, and the checker run over the
// example and every case in arrival/0.1/fixtures/cases.json. The checker, the
// cases and these tests have one author; a pass here is that author agreeing
// with itself.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  CHECK_IDS as CHECKER_CHECK_IDS,
  MAX_INPUT_BYTES,
  MAX_ISSUES,
  MAX_JSON_DEPTH,
  MAX_ORIENTATION_BYTES,
  MAX_VIEW_BYTES,
  checkArrivalFixtureBytes,
  checkArrivalFixtureFile,
  validateOrientation,
  validateView,
} from "../arrival/0.1/check.mjs";
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

// The README writes a shape as `{name, name|null, name: "word"|"word", name:
// {…}}`. This reads one such shape into its entries, in order: the name,
// whether it is marked |null, and the words or the nested shape after a colon.
function readShape(notation) {
  let rest = notation;
  const next = (pattern) => {
    const found = pattern.exec(rest.trimStart());
    if (found === null) return null;
    rest = rest.trimStart().slice(found[0].length);
    return found[0];
  };
  const need = (pattern, what) => {
    const found = next(pattern);
    assert.ok(found !== null, `${what} expected before "${rest}" in ${notation}`);
    return found;
  };
  const word = () => need(/^"[A-Za-z_]+"/, "a quoted word").slice(1, -1);
  const shape = () => {
    need(/^\{/, "an opening brace");
    const entries = [];
    do {
      const entry = { name: need(/^[a-z_]+/, "a field name"), nullable: next(/^\|null/) !== null, words: null, fields: null };
      if (next(/^:/) !== null) {
        if (rest.trimStart().startsWith("{")) {
          entry.fields = shape();
        } else {
          entry.words = [word()];
          while (next(/^\|/) !== null) entry.words.push(word());
        }
      }
      entries.push(entry);
    } while (next(/^,/) !== null);
    need(/^\}/, "a closing brace");
    return entries;
  };
  const read = shape();
  assert.equal(rest.trim(), "", `nothing follows the shape in ${notation}`);
  return read;
}

// The schema a field holds once a local reference is followed and "or null"
// is set aside, with whether null was allowed on the way.
function statedSchema(schema, node) {
  let current = node;
  let admitsNull = false;
  for (;;) {
    if (current.$ref !== undefined) {
      current = schema.$defs[current.$ref.slice("#/$defs/".length)];
    } else if (current.anyOf !== undefined) {
      const stated = current.anyOf.filter((branch) => branch.type !== "null");
      assert.equal(stated.length, 1, "one form beside null");
      admitsNull = admitsNull || stated.length < current.anyOf.length;
      current = stated[0];
    } else {
      return { node: current, admitsNull };
    }
  }
}

// Holds one shape the README writes to the schema it describes: the same
// field names in the same order, the same words where the README gives
// words, null allowed wherever the README marks |null, and so on down.
function assertReadmeShape(schema, node, entries, where, leftOut = []) {
  const object = statedSchema(schema, node).node;
  assert.deepEqual(
    entries.map((entry) => entry.name),
    Object.keys(object.properties).filter((name) => !leftOut.includes(name)),
    `${where}: the README lists the schema's fields, in the schema's order`,
  );
  for (const entry of entries) {
    const child = statedSchema(schema, object.properties[entry.name]);
    if (entry.nullable) assert.ok(child.admitsNull, `${where}.${entry.name}: the README marks |null, and the schema allows null`);
    if (entry.words) assert.deepEqual(entry.words, child.node.enum ?? [child.node.const], `${where}.${entry.name}: the README's words are the schema's`);
    if (entry.fields) assertReadmeShape(schema, object.properties[entry.name], entry.fields, `${where}.${entry.name}`);
  }
}

test("the document and fixture shapes are the field lists the README gives, schema_version aside, with no optional document field", () => {
  const fields = (node) => Object.keys(node.properties);
  const { orientation, view, fixture } = schemas;

  // What the README writes, read from its text and held to the schemas. The
  // README's two top-level lists leave out schema_version, which every
  // document carries; nothing else is left out.
  const documents = blocksOf(readmeSection("## The two documents"));
  const listed = (block, opening, closing) => {
    assert.ok(block.startsWith(opening) && block.endsWith(closing), `the README block begins ${opening}`);
    return block.slice(opening.length, block.length - closing.length);
  };
  const asShape = (list, where) => {
    const spans = [...list.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    assert.equal(list.replace(/`[^`]+`/g, "").replace(/[, ]/g, ""), "", `${where}: the list is code spans and commas only`);
    return readShape(`{${spans.join(", ")}}`);
  };
  const orientationList = listed(documents[1], "**Orientation** ([orientation.schema.json](orientation.schema.json)): ", ". It has no field about the caller.");
  assertReadmeShape(orientation, orientation, asShape(orientationList, "orientation"), "orientation", ["schema_version"]);
  const viewList = listed(documents[2], "**View** ([view.schema.json](view.schema.json)): ", ".");
  const acknowledgement = / \(`null` or `(\{[^`]+\})`\)/.exec(viewList);
  assert.ok(acknowledgement, "the README gives the two forms of acknowledgement in brackets");
  assertReadmeShape(view, view, asShape(viewList.replace(acknowledgement[0], ""), "view"), "view", ["schema_version"]);
  assertReadmeShape(view, view.properties.acknowledgement, readShape(acknowledgement[1]), "view.acknowledgement");
  assert.ok(statedSchema(view, view.properties.acknowledgement).admitsNull);
  const shapes = /^A \*\*section\*\* is `([^`]+)` plus the envelope `([^`]+)`\. `changes` is `null`, or the same envelope holding `([^`]+)`\. An \*\*item\*\* has one shape: `([^`]+)`\.$/.exec(documents[3]);
  assert.ok(shapes, "the README gives the section, the envelope, a change and an item as four shapes");
  assertReadmeShape(view, view.$defs.section, [...readShape(shapes[1]), ...readShape(shapes[2])], "section");
  assertReadmeShape(view, view.$defs.changes, readShape(shapes[2]), "changes");
  assert.ok(statedSchema(view, view.properties.changes).admitsNull);
  assertReadmeShape(view, view.$defs.change, readShape(shapes[3]), "change");
  assertReadmeShape(view, view.$defs.item, readShape(shapes[4]), "item");
  // The state table writes three more shapes, with the bar escaped for the table.
  const stateRows = blocksOf(readmeSection("### States")).join("\n").replaceAll("\\|", "|");
  for (const name of ["dropped", "unavailable", "withheld"]) {
    const written = new RegExp(`\`${name}: (\\{[^\`]+\\})\``).exec(stateRows);
    assert.ok(written, `the state table writes the shape of ${name}`);
    assertReadmeShape(view, view.$defs[name], readShape(written[1]), name);
  }

  const recorded = blocksOf(readmeSection("## The fixture"));
  const slots = /`visits\.first\.(\{[^`]+\})` and `visits\.second\.(\{[^`]+\})`\.$/.exec(recorded[0]);
  assert.ok(slots, "the README lists the exchanges of each visit");
  assertReadmeShape(fixture, fixture.properties.visits.properties.first, readShape(slots[1]), "visits.first");
  assertReadmeShape(fixture, fixture.properties.visits.properties.second, readShape(slots[2]), "visits.second");
  const exchange = /^Each is `([^`]+)`\. /.exec(recorded[1]);
  assert.ok(exchange, "the README gives the shape of an exchange");
  assertReadmeShape(fixture, fixture.$defs.exchange, readShape(exchange[1]), "exchange");
  const origins = /`origin` is `([a-z_]+)`, `([a-z_]+)` \([^)]*\) or `([a-z_]+)` \([^)]*\)\./.exec(recorded[2]);
  assert.deepEqual(origins?.slice(1), fixture.properties.origin.enum, "the README's origin words are the schema's");
  const statements = /`between_visits\.acknowledged_by_recorder` is the recorder's own statement: `([a-z_]+)`, `([a-z_]+)` or `([a-z_]+)`\./.exec(recorded[2]);
  assert.deepEqual(statements?.slice(1), fixture.properties.between_visits.properties.acknowledged_by_recorder.enum, "the README's recorder words are the schema's");

  // The same shapes, written out here.
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
  assert.ok(Buffer.byteLength(readme) <= 18 * 1024, "README is at most 18 KiB");
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

// ---------------------------------------------------------------------------
// The checker.

const cases = json("fixtures/cases.json");
const exampleBytes = readFileSync(new URL("examples/two-visits.json", directory));
const checkerPath = fileURLToPath(new URL("check.mjs", directory));
const examplePath = fileURLToPath(new URL("examples/two-visits.json", directory));
const checkerSource = existsSync(checkerPath) ? readFileSync(checkerPath, "utf8") : "";
// Later than every time in the example and the cases, so that a fixture time
// copied into a result could not be mistaken for the time of the check.
const fixedNow = "2027-01-01T00:00:00Z";
const OUTCOMES = ["pass", "fail", "unknown", "not_run"];
const RESULT_WORDS = ["checks_passed", "check_failed", "indeterminate"];
const VIEW_PATH = "/visits/first/view/response/body";
const SECOND_VIEW_PATH = "/visits/second/view/response/body";
const ORIENTATION_PATH = "/visits/first/orientation/response/body";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// JSON Pointer (RFC 6901) edits, as fixtures/cases.json describes them.
function pointerTokens(pointer) {
  assert.match(pointer, /^(?:\/[^/]*)+$/, `${pointer} is a non-empty JSON Pointer`);
  return pointer.split("/").slice(1).map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function step(node, token, pointer) {
  if (Array.isArray(node)) {
    assert.match(token, /^(?:0|[1-9][0-9]*)$/, `${pointer}: ${token} is a list index`);
    assert.ok(Number(token) < node.length, `${pointer}: index ${token} exists`);
    return node[Number(token)];
  }
  assert.ok(isRecord(node) && Object.hasOwn(node, token), `${pointer}: ${token} exists`);
  return node[token];
}

function valueAt(document, pointer) {
  return pointerTokens(pointer).reduce((node, token) => step(node, token, pointer), document);
}

function parentOf(document, pointer) {
  const tokens = pointerTokens(pointer);
  const last = tokens.pop();
  return [tokens.reduce((node, token) => step(node, token, pointer), document), last];
}

function placeAt(document, pointer, value) {
  const [parent, last] = parentOf(document, pointer);
  if (Array.isArray(parent)) {
    if (last === "-") parent.push(value);
    else {
      step(parent, last, pointer);
      parent[Number(last)] = value;
    }
  } else {
    assert.ok(isRecord(parent), `${pointer}: the parent is an object or a list`);
    parent[last] = value;
  }
}

function removeAt(document, pointer) {
  const [parent, last] = parentOf(document, pointer);
  step(parent, last, pointer);
  if (Array.isArray(parent)) parent.splice(Number(last), 1);
  else delete parent[last];
}

function applyEdits(base, edits) {
  const document = clone(base);
  for (const edit of edits) {
    if (edit.op === "set") placeAt(document, edit.path, clone(edit.value));
    else if (edit.op === "remove") removeAt(document, edit.path);
    else if (edit.op === "copy") placeAt(document, edit.path, clone(valueAt(document, edit.from)));
    else assert.fail(`unknown edit operation ${edit.op}`);
  }
  return document;
}

function check(input) {
  const bytes = Buffer.isBuffer(input) || typeof input === "string" ? input : JSON.stringify(input);
  const result = checkArrivalFixtureBytes(bytes, { now: fixedNow });
  assert.equal(validate.result(result), true, `the checker's result matches result.schema.json: ${errorsOf(validate.result)}`);
  return result;
}

function outcomesOf(result) {
  return Object.fromEntries(result.checks.map((entry) => [entry.id, entry.outcome]));
}

function codesOf(result) {
  return [...new Set(result.issues.map((entry) => entry.code))].sort();
}

function expectedOutcomes(entry) {
  return { ...cases.base_outcomes, ...entry.outcomes };
}

function wordFor(outcomes) {
  const values = Object.values(outcomes);
  if (values.includes("fail")) return "check_failed";
  return values.some((value) => value === "unknown" || value === "not_run") ? "indeterminate" : "checks_passed";
}

function withEdits(...edits) {
  return applyEdits(example, edits.map(([path, value]) => ({ op: "set", path, value })));
}

// A schema-valid orientation near its ceiling: every bounded text at its
// longest, most of it in a four-byte code point, and one address of a chosen
// length. The three read-effects declarations are kept equal.
function wideOrientationFixture(copies) {
  const fixture = clone(example);
  const wide = "\u{1F600}"; // one code point, four bytes in UTF-8
  const writes = Array.from({ length: 8 }, (_, index) => `${index}${wide.repeat(119)}`);
  const body = fixture.visits.first.orientation.response.body;
  body.place.name = wide.repeat(120);
  body.place.summary = wide.repeat(300);
  body.place.manifest = `https://house.example/${"a".repeat(copies)}`;
  body.view.credential_kinds = Array.from({ length: 8 }, (_, index) => `k${index}${"a".repeat(62)}`);
  body.view.read_effects.operational_writes = writes;
  fixture.visits.first.view.response.body.read_effects.operational_writes = writes;
  fixture.visits.second.view.response.body.read_effects.operational_writes = writes;
  return Buffer.from(JSON.stringify(fixture));
}

// A schema-valid second view near its ceiling: thirty items appended to a
// section that was partial on the first read, so nothing has to name them.
function paddedSecondViewFixture(first) {
  const fixture = clone(example);
  const section = fixture.visits.second.view.response.body.sections[1];
  section.limit = 32;
  section.count = 36;
  for (let index = 0; index < 30; index += 1) {
    section.items.push({
      id: `pad-${index}`,
      summary: "s",
      recorded_at: null,
      acknowledged_at: null,
      ref: `https://house.example/notes/${"a".repeat(index === 0 ? first : 1937)}`,
      owed_to: null,
      due_at: null,
    });
  }
  return Buffer.from(JSON.stringify(fixture));
}

// The byte-level and ceiling cases, built from the recipes in cases.json.
const BUILDERS = {
  "bytes-over-the-limit": () => Buffer.alloc(262145, 0x20),
  "bytes-at-the-limit": () => Buffer.alloc(262144, 0x20),
  "bytes-byte-order-mark": () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), exampleBytes]),
  "bytes-invalid-utf8": () => Buffer.from([0xff]),
  "bytes-not-json": () => Buffer.from("{"),
  "bytes-repeated-key": (entry) => Buffer.from(entry.text),
  "bytes-nested-65-deep": () => Buffer.from("[".repeat(65) + "]".repeat(65)),
  "bytes-nested-64-deep": () => Buffer.from("[".repeat(64) + "]".repeat(64)),
  "orientation-over-its-ceiling": () => {
    const fixture = clone(example);
    fixture.visits.first.orientation.response.body.padding = "a".repeat(8192);
    return Buffer.from(JSON.stringify(fixture));
  },
  "tripwire-long-run-with-no-digit": () => {
    const fixture = clone(example);
    fixture.visits.second.bad_cursor.response = { status: 503, body: { note: "sk-".repeat(60000) } };
    return Buffer.from(JSON.stringify(fixture));
  },
  "orientation-valid-at-its-ceiling": () => wideOrientationFixture(1646),
  "orientation-valid-one-byte-over-its-ceiling": () => wideOrientationFixture(1647),
  "view-at-its-ceiling": () => paddedSecondViewFixture(1951),
  "view-one-byte-over-its-ceiling": () => paddedSecondViewFixture(1952),
  "view-over-its-ceiling": () => {
    const fixture = clone(example);
    const section = fixture.visits.first.view.response.body.sections[0];
    section.limit = 32;
    section.count = 32;
    section.items = Array.from({ length: 32 }, (_, index) => ({
      id: `item-${index}`,
      summary: "s",
      recorded_at: null,
      acknowledged_at: null,
      ref: `https://house.example/obligations/${"a".repeat(2014)}`,
      owed_to: null,
      due_at: null,
    }));
    return Buffer.from(JSON.stringify(fixture));
  },
};

test("the checker fixes the same twenty checks, limits and non-claims as the result schema", () => {
  assert.deepEqual([...CHECKER_CHECK_IDS], CHECK_IDS);
  const limits = schemas.result.properties.limits.properties;
  assert.equal(MAX_INPUT_BYTES, limits.max_input_bytes.const);
  assert.equal(MAX_ORIENTATION_BYTES, limits.max_orientation_bytes.const);
  assert.equal(MAX_VIEW_BYTES, limits.max_view_bytes.const);
  assert.equal(MAX_JSON_DEPTH, limits.max_json_depth.const);
  assert.equal(MAX_ISSUES, limits.max_issues.const);
  const result = check(exampleBytes);
  assert.deepEqual(result.not_established, RESULT_NOT_ESTABLISHED);
  assert.equal(result.observed_at, fixedNow);
  assert.deepEqual(result.limits, {
    max_input_bytes: 262144,
    max_orientation_bytes: 8192,
    max_view_bytes: 65536,
    max_json_depth: 64,
    max_issues: 256,
  });
});

test("the hand-written example passes all twenty checks, and the result says how much was compared", () => {
  const result = check(exampleBytes);
  assert.equal(result.result, "checks_passed", JSON.stringify(result.issues, null, 2));
  assert.equal(cases.base_result, "checks_passed");
  assert.deepEqual(outcomesOf(result), cases.base_outcomes);
  assert.deepEqual(result.counts, { pass: 20, fail: 0, unknown: 0, not_run: 0 });
  assert.deepEqual(result.issues, []);
  assert.equal(result.fixture_origin, "hand_written");
  assert.deepEqual(result.artifact.observed_bytes, exampleBytes.length);
  assert.match(result.artifact.sha256, /^sha256:[a-f0-9]{64}$/);
  // Two unacknowledged items come back equal; three differences are decidable
  // and all three are named. A pass that compared nothing would say 0 here.
  assert.deepEqual(result.exercised, cases.base_exercised);
  assert.deepEqual(result.exercised, {
    items_compared_equal: 2,
    differences_found: 3,
    differences_named: 3,
    states_seen: { ok: 4, quiet: 1, partial: 2, unavailable: 2, withheld: 2 },
  });
  for (const entry of result.checks) {
    assert.ok(entry.expected.length > 0 && entry.observed.length > 0, `${entry.id} states what it expected and observed`);
  }
});

test("the cases file is complete, uses three edit operations, and names only a fictitious host", () => {
  assert.equal(cases.schema_version, "xenia.arrival.cases/0.1-development");
  assert.equal(cases.base, "../examples/two-visits.json");
  assert.match(cases.status, /author of check\.mjs/);
  assert.match(cases.status, /not independent evidence/);
  assert.match(cases.status, /No host sent/);
  assert.deepEqual(Object.keys(cases.base_outcomes), CHECK_IDS);
  assert.ok(Object.values(cases.base_outcomes).every((outcome) => outcome === "pass"));

  const ids = [...cases.cases, ...cases.built].map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "case ids are unique");
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/);

  for (const entry of [...cases.cases, ...cases.built]) {
    for (const [id, outcome] of Object.entries(entry.outcomes)) {
      assert.ok(CHECK_IDS.includes(id), `${entry.id}: ${id} is a check`);
      assert.ok(OUTCOMES.includes(outcome), `${entry.id}: ${outcome} is an outcome`);
      assert.notEqual(outcome, "pass", `${entry.id}: the overlay lists only what differs from the base`);
    }
    assert.ok(RESULT_WORDS.includes(entry.result));
    assert.equal(entry.result, wordFor(expectedOutcomes(entry)), `${entry.id}: the result word follows from the outcomes`);
    assert.ok(Array.isArray(entry.issues), `${entry.id} lists issue codes`);
    assert.equal(new Set(entry.issues).size, entry.issues.length);
    if (entry.targets !== undefined) {
      assert.ok(CHECK_IDS.includes(entry.targets), `${entry.id}: targets names a check`);
      assert.ok(["fail", "unknown"].includes(expectedOutcomes(entry)[entry.targets]), `${entry.id}: the targeted check fails or is unknown`);
    }
  }
  for (const entry of cases.cases) {
    assert.ok(entry.description.length > 0);
    assert.ok(entry.edits.length > 0, `${entry.id} has at least one edit`);
    for (const edit of entry.edits) {
      assert.ok(["set", "remove", "copy"].includes(edit.op), `${entry.id}: ${edit.op}`);
      const allowed = { set: ["op", "path", "value"], remove: ["op", "path"], copy: ["from", "op", "path"] }[edit.op];
      assert.deepEqual(Object.keys(edit).sort(), allowed, `${entry.id}: fields of a ${edit.op} edit`);
    }
  }
  assert.deepEqual(cases.built.map((entry) => entry.id).sort(), Object.keys(BUILDERS).sort(), "every built case has a builder here");
  for (const entry of cases.built) assert.ok(entry.recipe.length > 0, `${entry.id} gives a recipe`);

  // Every check that can fail has a case in which it alone fails; every check
  // that can be unknown has a case in which it is.
  const failsAlone = new Set();
  const unknownSomewhere = new Set();
  for (const entry of [...cases.cases, ...cases.built]) {
    const outcomes = expectedOutcomes(entry);
    const failed = CHECK_IDS.filter((id) => outcomes[id] === "fail");
    if (failed.length === 1 && entry.targets === failed[0]) failsAlone.add(failed[0]);
    for (const id of CHECK_IDS) if (outcomes[id] === "unknown") unknownSomewhere.add(id);
  }
  const cannotFail = ["I.SIZE", "P.PAIR"];
  assert.deepEqual([...failsAlone].sort(), CHECK_IDS.filter((id) => !cannotFail.includes(id)).sort());
  assert.deepEqual([...unknownSomewhere].sort(), [
    "I.SIZE", "P.PAIR", "R1.ORIENTATION", "R1.REFUSAL", "R1.VIEW", "R2.DECLARED_EFFECTS", "R2.SHOWN_AGAIN", "R3.STATES",
    "R4.BAD_CURSOR", "R4.CHANGES", "R4.CURSOR", "R5.FRESHNESS", "R6.NO_OBLIGATION", "R7.NON_CLAIMS",
  ]);

  const strings = [];
  (function collect(value) {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  })(cases.cases.map((entry) => entry.edits));
  for (const address of strings.filter((value) => /^https?:\/\//.test(value))) {
    assert.match(address, /^https:\/\/(?:[a-z]+@)?house\.example[:/]/, "case addresses use the example's reserved host");
  }
});

test("every case in cases.json gives the result word and the twenty outcomes its entry states", () => {
  for (const entry of cases.cases) {
    const fixture = applyEdits(example, entry.edits);
    const result = check(fixture);
    const where = `case ${entry.id}`;
    assert.deepEqual(outcomesOf(result), expectedOutcomes(entry), `${where}: outcomes; issues ${JSON.stringify(result.issues)}`);
    assert.equal(result.result, entry.result, `${where}: result word`);
    assert.deepEqual(codesOf(result), [...entry.issues].sort(), `${where}: issue codes`);
    assert.equal(result.fixture_origin, expectedOutcomes(entry)["I.SHAPE"] === "pass" ? "hand_written" : null, `${where}: origin`);
    for (const [name, count] of Object.entries(entry.exercised ?? {})) {
      assert.deepEqual(result.exercised[name], count, `${where}: exercised.${name}`);
    }
    if (entry.body_stays_schema_valid !== undefined) {
      const body = valueAt(fixture, entry.body_stays_schema_valid);
      const name = body.schema_version === schemas.view.properties.schema_version.const ? "view" : "orientation";
      accepts(name, body, `${where}: the edited body`);
    }
  }
});

test("every built case gives the result word and the twenty outcomes its entry states", () => {
  for (const entry of cases.built) {
    const result = check(BUILDERS[entry.id](entry));
    const where = `built case ${entry.id}`;
    assert.deepEqual(outcomesOf(result), expectedOutcomes(entry), `${where}: outcomes; issues ${JSON.stringify(result.issues)}`);
    assert.equal(result.result, entry.result, `${where}: result word`);
    assert.deepEqual(codesOf(result), [...entry.issues].sort(), `${where}: issue codes`);
  }
  const oversize = check(BUILDERS["bytes-over-the-limit"]());
  assert.deepEqual(oversize.artifact, { complete: false, observed_bytes: 262145 });
  assert.equal(oversize.fixture_origin, null);
  const atLimit = check(Buffer.alloc(MAX_INPUT_BYTES, 0x20));
  assert.equal(outcomesOf(atLimit)["I.SIZE"], "pass", "exactly the limit is read");
  assert.equal(atLimit.artifact.complete, true);

  // The two ceilings are measured on a body serialised again, and a body one
  // byte under each is not held against the host.
  const overView = JSON.parse(BUILDERS["view-over-its-ceiling"]().toString());
  const viewBody = overView.visits.first.view.response.body;
  assert.ok(Buffer.byteLength(JSON.stringify(viewBody)) > MAX_VIEW_BYTES);
  accepts("view", viewBody, "the over-ceiling view is still schema-valid");
  // Each ceiling also has a pair of schema-valid bodies, one exactly at it
  // and one a byte over, so a checker that left a ceiling out, or put it one
  // byte away, would not reproduce these cases.
  const bodyOf = (id, visit, name) => JSON.parse(BUILDERS[id]().toString()).visits[visit][name].response.body;
  for (const [id, visit, name, schema, bytes] of [
    ["orientation-valid-at-its-ceiling", "first", "orientation", "orientation", MAX_ORIENTATION_BYTES],
    ["orientation-valid-one-byte-over-its-ceiling", "first", "orientation", "orientation", MAX_ORIENTATION_BYTES + 1],
    ["view-at-its-ceiling", "second", "view", "view", MAX_VIEW_BYTES],
    ["view-one-byte-over-its-ceiling", "second", "view", "view", MAX_VIEW_BYTES + 1],
  ]) {
    const body = bodyOf(id, visit, name);
    assert.equal(Buffer.byteLength(JSON.stringify(body)), bytes, `${id}: serialised size`);
    accepts(schema, body, `${id}: the body is schema-valid`);
  }
});

test("a failing case fails only the check it targets", () => {
  let targeted = 0;
  for (const entry of [...cases.cases, ...cases.built]) {
    if (entry.targets === undefined || entry.result !== "check_failed") continue;
    const result = check(entry.edits ? applyEdits(example, entry.edits) : BUILDERS[entry.id](entry));
    const failed = result.checks.filter((item) => item.outcome === "fail").map((item) => item.id);
    assert.deepEqual(failed, [entry.targets], `case ${entry.id} fails ${entry.targets} and nothing else`);
    targeted += 1;
  }
  assert.ok(targeted >= 60, `${targeted} targeted failing cases were run`);
});

// Every string and field name in a fixture that is not a word the schemas or
// the two refusal codes fix is rewritten to carry a marker. Times are left as
// they are and looked for separately.
const SENTINEL = "zqsentinel";
const vocabulary = new Set(["credential_required", "cursor_not_accepted", "xenia.surface.problem/0.1"]);
const knownFields = new Set([
  "schema_version", "type", "title", "status", "code", "detail", "retryable", "terminal", "next_actions", "docs", "error",
  "rel", "href", "method", "accept", "description",
]);
for (const name of ["orientation", "view", "fixture"]) {
  walkSchema(schemas[name], "", (node) => {
    if (typeof node.const === "string") vocabulary.add(node.const);
    for (const word of node.enum ?? []) if (typeof word === "string") vocabulary.add(word);
    for (const field of Object.keys(node.properties ?? {})) knownFields.add(field);
  });
}
const TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$/;

function withSentinels(value) {
  if (typeof value === "string") {
    if (vocabulary.has(value) || TIME.test(value)) return value;
    if (/^https?:\/\//.test(value)) return value.replace("house.example", `${SENTINEL}.example`);
    return `${value}_${SENTINEL}`;
  }
  if (Array.isArray(value)) return value.map(withSentinels);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, member]) => [
      knownFields.has(key) ? key : `${key}_${SENTINEL}`,
      withSentinels(member),
    ]));
  }
  return value;
}

function timesIn(value, found = new Set()) {
  if (typeof value === "string" && TIME.test(value)) found.add(value);
  else if (Array.isArray(value)) value.forEach((member) => timesIn(member, found));
  else if (isRecord(value)) Object.values(value).forEach((member) => timesIn(member, found));
  return found;
}

test("a result copies no value from the fixture except its origin word, whatever the outcome", () => {
  let rewritten = 0;
  for (const entry of [{ id: "the example", edits: [], outcomes: {} }, ...cases.cases]) {
    const fixture = withSentinels(applyEdits(example, entry.edits));
    if (JSON.stringify(fixture).includes(SENTINEL)) rewritten += 1;
    const result = check(fixture);
    const text = JSON.stringify(result);
    assert.ok(!text.includes(SENTINEL), `case ${entry.id}: no rewritten string or field name reaches the result`);
    for (const time of timesIn(fixture)) assert.ok(!text.includes(time), `case ${entry.id}: no fixture time reaches the result`);
    // Renaming every free string the same way everywhere changes no outcome,
    // so no check depends on what a host or a recorder called something.
    assert.deepEqual(outcomesOf(result), expectedOutcomes(entry), `case ${entry.id}: outcomes survive renaming`);
  }
  // Every fixture but the one with no exchange recorded had something to rewrite.
  assert.equal(rewritten, cases.cases.length);

  const repeated = check(`{"private_key_${SENTINEL}":1,"private_key_${SENTINEL}":2}`);
  assert.deepEqual(codesOf(repeated), ["json_key_duplicate"]);
  assert.ok(!JSON.stringify(repeated).includes(SENTINEL));
  const malformed = check(`{"value":"${SENTINEL}"`);
  assert.deepEqual(codesOf(malformed), ["json_parse"]);
  assert.ok(!JSON.stringify(malformed).includes(SENTINEL));
  const padded = check(BUILDERS["orientation-over-its-ceiling"]());
  assert.ok(!JSON.stringify(padded).includes("padding"), "a field name the schemas do not define is not copied");
});

// Values tried in place of every node of a document, to compare the checker's
// own validator with Ajv applying the schema.
const LONG_ADDRESS = `https://house.example/${"a".repeat(2026)}`;
const REPLACEMENTS = [
  null, true, false, 0, 1, -1, 1.5, 32, 33, 9007199254740992, [], {}, ["x"], { x: 1 },
  "", "x", "notes", "OB-1", "ok", "full", "none", "s".repeat(120), "s".repeat(121), "s".repeat(256), "s".repeat(257),
  "s".repeat(300), "s".repeat(301), "s".repeat(1024), "s".repeat(1025), "\u{1F600}".repeat(120), "\u{1F600}".repeat(300),
  "2026-11-12T09:00:07Z", "2026-11-12T09:00:07.250Z", "2026-12-31T23:59:60Z", "2026-11-12T23:59:60Z", "2026-02-30T09:00:00Z",
  "2026-11-12T24:00:00Z", "2026-11-12T09:00:00+00:00", "2026-11-12t09:00:00z", "2026-11-12T09:00:00", "2024-02-29T00:00:00Z",
  "2025-02-29T00:00:00Z", "0000-01-01T00:00:00Z", `2026-11-12T09:00:00.${"1".repeat(30)}Z`,
  "https://house.example", "https://house.example/a?b=c", "https://house.example/a#b", "https://house.example/a b",
  "https://house.example/%zz", "https://house.example/a%20b", "https://name@house.example/", "http://house.example/",
  "http://localhost:8080/a", "http://127.0.0.1/a", "http://[::1]/a", "http://localhost.example/", "/relative", "ftp://house.example/",
  "HTTPS://house.example/", "https://house.example/[a]", "https://house.example/a#b#c", "https://[::1]:8443/a",
  LONG_ADDRESS, `${LONG_ADDRESS}a`,
];

function* mutations(document) {
  const visit = function* (node, path) {
    for (const replacement of REPLACEMENTS) yield [path, (root) => placeAtOrRoot(root, path, replacement)];
    if (Array.isArray(node)) {
      if (node.length > 0) {
        for (const length of [2, 3, 8, 9, 16, 17, 32, 33]) {
          yield [path, (root) => placeAt(root, path, Array.from({ length }, () => clone(node[0])))];
        }
      }
      for (const [index, member] of node.entries()) yield* visit(member, `${path}/${index}`);
    } else if (isRecord(node)) {
      yield [path, (root) => placeAtOrRoot(root, `${path}/unknown_field`, "x")];
      for (const [key, member] of Object.entries(node)) {
        const below = `${path}/${key}`;
        yield [below, (root) => removeAt(root, below)];
        yield* visit(member, below);
      }
    }
  };
  for (const [path, mutate] of visit(document, "")) {
    const copy = clone(document);
    const replaced = mutate(copy);
    yield [path, replaced === undefined ? copy : replaced];
  }
}

// placeAt cannot replace the whole document; this returns the replacement instead.
function placeAtOrRoot(root, path, value) {
  if (path === "") return { replaced: clone(value) }.replaced;
  placeAt(root, path, clone(value));
  return undefined;
}

test("the checker's own validators agree with the schemas on every mutation tried", () => {
  const documents = [
    ["orientation", validateOrientation, orientationBody()],
    ["view", validateView, firstView()],
    ["view", validateView, secondView()],
  ];
  let tried = 0;
  let invalid = 0;
  for (const [name, validator, document] of documents) {
    assert.deepEqual(validator(document), [], `the example ${name} has no issue`);
    for (const [path, mutated] of mutations(document)) {
      const bySchema = validate[name](mutated);
      const issues = validator(mutated);
      assert.equal(issues.length === 0, bySchema, `${name} at ${path || "/"}: validator ${JSON.stringify(issues.slice(0, 3))}, schema ${bySchema}`);
      for (const entry of issues) {
        assert.match(entry.code, /^schema_[a-z_]+$/);
        assert.match(entry.path, /^\$/);
      }
      tried += 1;
      if (!bySchema) invalid += 1;
    }
  }
  assert.ok(tried > 20000, `${tried} mutations were compared`);
  assert.ok(invalid > tried / 2 && invalid < tried, `${invalid} of them were invalid, and some were not`);

  const before = JSON.stringify(example);
  validateView(example.visits.first.view.response.body);
  validateOrientation(example.visits.first.orientation.response.body);
  assert.equal(JSON.stringify(example), before, "validating changes nothing");
});

test("the checker gives a result for every mutation of a recorded body, and a body that breaks its schema fails R1", () => {
  const slots = [
    ["R1.ORIENTATION", "orientation", ORIENTATION_PATH],
    ["R1.VIEW", "view", VIEW_PATH],
    ["R1.VIEW", "view", SECOND_VIEW_PATH],
  ];
  let tried = 0;
  for (const [id, name, path] of slots) {
    let turn = 0;
    for (const [at, mutated] of mutations(valueAt(example, path))) {
      turn += 1;
      if (turn % 12 !== 0 || !(isRecord(mutated) || mutated === null)) continue;
      const fixture = applyEdits(example, [{ op: "set", path, value: mutated }]);
      const outcomes = outcomesOf(check(fixture)); // check() throws if the result breaks its schema
      if (outcomes["I.RECORD"] !== "pass") {
        assert.equal(outcomes[id], "not_run", `${path}${at}: nothing later runs once the record is incoherent`);
      } else if (!validate[name](mutated)) {
        assert.equal(outcomes[id], "fail", `${path}${at}: a body that breaks its schema fails ${id}`);
      } else {
        assert.ok(["pass", "fail"].includes(outcomes[id]), `${path}${at}: ${id} is decided`);
      }
      tried += 1;
    }
  }
  assert.ok(tried > 1500, `${tried} fixtures were checked`);

  // Field names that are also names on every JavaScript object are plain
  // undefined fields here, wherever they sit.
  for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const text = JSON.stringify(example);
    for (const [id, marker] of [
      ["R1.ORIENTATION", '"audience":{"basis":"anyone"}'],
      ["R1.VIEW", '"basis":{"kind":"full","cursor":null}'],
      ["R1.REFUSAL", '"code":"credential_required"'],
    ]) {
      assert.ok(text.includes(marker));
      const result = check(text.replace(marker, `"${name}":{"cursor":"x"},${marker}`));
      assert.equal(outcomesOf(result)[id], "fail", `${name} beside ${marker}`);
      assert.deepEqual(result.checks.filter((entry) => entry.outcome === "fail").map((entry) => entry.id), [id]);
    }
  }
});

test("the address test is Surface's, and is stricter than the schema for addresses that do not parse", () => {
  // `format: uri` admits these; a URL parser does not. The checker's validator
  // follows Surface's checker and refuses them. This is the known difference
  // between the validator and the schema.
  for (const address of ["https://house.example:99999/a", "https://999.999.999.999/a", "https://"]) {
    const view = firstView();
    view.acknowledgement.href = address;
    assert.equal(validate.view(view), true, `the schema admits ${address}`);
    assert.deepEqual(validateView(view).map((entry) => entry.code), ["schema_format"], `the validator refuses ${address}`);
    const result = check(withEdits([`${VIEW_PATH}/acknowledgement/href`, address]));
    assert.equal(outcomesOf(result)["R1.VIEW"], "fail");
    assert.equal(outcomesOf(result)["I.NO_CREDENTIAL"], "fail", "an address that does not parse also trips the tripwire");
  }
});

test("I.SHAPE agrees with the fixture schema on every mutation of the recorded wrapper", () => {
  let tried = 0;
  const wrapper = clone(example);
  // Bodies are any object at this step, so one small body stands for all.
  for (const visit of Object.values(wrapper.visits)) {
    for (const exchange of Object.values(visit)) exchange.response.body = { any: "object" };
  }
  for (const [path, mutated] of mutations(wrapper)) {
    const bySchema = validate.fixture(mutated);
    const outcome = outcomesOf(check(JSON.stringify(mutated) ?? "null"))["I.SHAPE"];
    assert.equal(outcome === "pass", bySchema, `fixture wrapper at ${path || "/"}: I.SHAPE ${outcome}, schema ${bySchema}`);
    tried += 1;
  }
  assert.ok(tried > 3000, `${tried} wrapper mutations were compared`);
});

test("the copied problem rules agree with Surface's validateProblem on every mutation tried", () => {
  const orientationHref = example.visits.first.orientation.request.href;
  const viewHref = example.visits.first.view.request.href;
  const slots = [
    ["first", "view_without_credential", "R1.REFUSAL", "credential_required", (body) => body.next_actions[0]?.href === orientationHref],
    ["second", "bad_cursor", "R4.BAD_CURSOR", "cursor_not_accepted", (body) => body.next_actions.some((action) => action?.href === viewHref)],
  ];
  let tried = 0;
  let passed = 0;
  for (const [visit, name, id, code, leadsOn] of slots) {
    const { status, body } = example.visits[visit][name].response;
    for (const [path, mutated] of mutations(body)) {
      if (!isRecord(mutated)) continue; // the fixture shape admits only an object or null
      const fixture = clone(example);
      fixture.visits[visit][name].response.body = mutated;
      const bySurface = validateProblem(mutated, status).length === 0
        && mutated.code === code && mutated.terminal === false && leadsOn(mutated);
      const outcome = outcomesOf(check(fixture))[id];
      assert.equal(outcome === "pass", bySurface, `${id} with the body changed at ${path || "/"}: ${outcome}`);
      assert.ok(outcome === "pass" || outcome === "fail", `${id} is decided either way`);
      tried += 1;
      if (bySurface) passed += 1;
    }
  }
  assert.ok(tried > 2000 && passed > 20, `${tried} problem mutations were compared, ${passed} of them still passing`);
});

test("the credential tripwire catches secret shapes built here, and leaves cursors and positions alone", () => {
  // Built at run time so that no secret-shaped text sits in this repository.
  const shapes = {
    "a provider key": `sk-${"a1b2c3d4".repeat(3)}`,
    "a forge token": `gh${"p"}_${"A1b2C3d4".repeat(3)}`,
    "a cloud key id": `AKIA${"ABCDEFGH12345678"}`,
    "a private key header": `-----BEGIN ${"RSA "}PRIVATE KEY-----`,
    "a bearer value": `Bearer ${"abc123".repeat(4)}`,
    "a basic value": `basic ${"QWxhZGRpbjpvcGVu".repeat(2)}0=`,
    "a three-part token": `eyJ${"hbGciOiJI".repeat(2)}.${"eyJzdWIiOiIx".repeat(2)}.${"SflKxwRJSMeKKF2Q".repeat(2)}`,
    // The two texts of the final check: a shape that begins straight after a
    // hyphen, inside a longer run of token characters. A hyphen is a word
    // boundary, so both patterns match there, as they did when first written.
    "a provider key straight after a hyphen": `live-sk-${["A1b2C3d4", "E5f6G7h8", "I9j0K1l2"].join("")}`,
    "a three-part token straight after a hyphen": `x-${["eyJhbGciOiJ9", "eyJzdWIiOiIxIn0", "c2lnbmF0dXJl"].join(".")}`,
    "a provider key after an earlier start in the same run": `sk-sk-notes-sk-${"a1b2c3d4".repeat(3)}`,
    "a three-part token after an earlier start in the same run": `eyJ-eyJ${"hbGciOiJI"}.${"eyJzdWIiOiIx"}.${"SflKxwRJSMeKKF2Q"}`,
    // The first start in a run that stands at a word boundary need not be the
    // first start in the run.
    "a provider key after a start that is not at a word boundary": `xsk-notes-sk-${"a1b2c3d4".repeat(3)}`,
    "a three-part token after a start that is not at a word boundary": `9eyJ-eyJ${"hbGciOiJI"}.${"eyJzdWIiOiIx"}.${"SflKxwRJSMeKKF2Q"}`,
  };
  const free = `${ORIENTATION_PATH}/place/summary`;
  for (const [label, secret] of Object.entries(shapes)) {
    const result = check(withEdits([free, `Text with ${secret} inside.`]));
    assert.equal(outcomesOf(result)["I.NO_CREDENTIAL"], "fail", label);
    assert.deepEqual(codesOf(result), ["secret_shape"], label);
    assert.ok(!JSON.stringify(result).includes(secret), `${label} is not copied into the result`);
    assert.deepEqual(result.checks.filter((entry) => entry.outcome === "fail").map((entry) => entry.id), ["I.NO_CREDENTIAL"], `${label}: later checks still ran`);
  }

  // A cursor or position is opaque and may look like anything.
  const token = shapes["a three-part token"];
  const opaque = applyEdits(example, [
    { op: "set", path: `${VIEW_PATH}/cursor`, value: token },
    { op: "set", path: "/visits/second/view/request/cursor", value: token },
    { op: "set", path: `${SECOND_VIEW_PATH}/basis/cursor`, value: token },
    { op: "set", path: `${VIEW_PATH}/acknowledgement/position`, value: shapes["a provider key"] },
    { op: "set", path: `${SECOND_VIEW_PATH}/acknowledgement/position`, value: shapes["a provider key"] },
    { op: "set", path: "/visits/second/bad_cursor/request/cursor", value: shapes["a forge token"] },
  ]);
  assert.equal(check(opaque).result, "checks_passed");
  // The exemption is those four places only.
  const elsewhere = check(withEdits([`${VIEW_PATH}/audience/record_set_ref`, token]));
  assert.equal(outcomesOf(elsewhere)["I.NO_CREDENTIAL"], "fail");

  // A secret-shaped field name in a body is caught and not printed.
  const named = clone(example);
  named.visits.first.orientation.response.body[shapes["a forge token"]] = true;
  const namedResult = check(named);
  assert.equal(outcomesOf(namedResult)["I.NO_CREDENTIAL"], "fail");
  assert.ok(!JSON.stringify(namedResult).includes(shapes["a forge token"]));
  // Field names are read for the same shapes as strings, the two that are
  // tried once per run among them.
  for (const label of ["a provider key straight after a hyphen", "a three-part token straight after a hyphen"]) {
    const keyed = clone(example);
    keyed.visits.second.bad_cursor.response = { status: 503, body: { [shapes[label]]: true } };
    const keyedResult = check(keyed);
    assert.deepEqual(codesOf(keyedResult), ["secret_shape", "status_5xx"], `${label}, as a field name`);
    assert.ok(!JSON.stringify(keyedResult).includes(shapes[label]));
  }
  // A field the schemas do not define, holding a secret shape: the issue
  // points at it without printing its name.
  const unnamed = clone(example);
  unnamed.visits.first.orientation.response.body.recorder_note = { inner_note: `Text with ${shapes["a bearer value"]} inside.` };
  const unnamedResult = check(unnamed);
  assert.deepEqual(
    unnamedResult.issues.filter((entry) => entry.code === "secret_shape").map((entry) => entry.path),
    [`$${ORIENTATION_PATH}/*/*`],
  );
  assert.ok(!/recorder_note|inner_note/.test(JSON.stringify(unnamedResult)));

  // Words that only resemble the shapes pass.
  for (const text of [
    "A bearer of the basic plan asked about room booking.",
    "Basic information for a bearer: see the desk.",
    "The ticket sk-17 and the note sk-notes-2026 are open.",
    "Bearer tokens are described in the orientation.",
    // No word boundary falls between a letter, a digit or an underscore and
    // the shape after it, so neither pattern matches there. These are misses
    // the two patterns have always had, kept so that the boundary is held.
    `live_${shapes["a provider key"]}`,
    `x${shapes["a provider key"]}`,
    `jwt_${shapes["a three-part token"]}`,
    `9${shapes["a three-part token"]}`,
    // Too short after its start, or with no digit, wherever it begins.
    `live-sk-${"a1b2c3d4".repeat(2)}abc`,
    `live-sk-${"abcdefgh".repeat(3)}`,
    `x-eyJ${"hbGciOiJI"}.${"eyJzdWIiOiIx"}`,
    `x-eyJ${"hbGci"}.${"eyJzdWIiOiIx"}.${"SflKxwRJSMeKKF2Q"}`,
  ]) {
    assert.equal(check(withEdits([free, text])).result, "checks_passed", text);
  }

  // Address rules, each alone. Free text is searched for addresses anywhere:
  // userinfo, and a query or fragment pair with a credential-named key and a
  // value.
  const addresses = [
    ["https://reader@house.example/a", "href_userinfo"],
    ["HTTPS://reader@house.example/a", "href_userinfo"],
    ["see https://reader@house.example/a", "href_userinfo"],
    ["https://house.example/a?session=1", "href_credential_query_key"],
    ["https://house.example/a?page=2&%74oken=1", "href_credential_query_key"],
    ["https://house.example/a?X-Api-Key=1", "href_credential_query_key"],
    ["see https://house.example/x?access_token=abc for more", "href_credential_query_key"],
    ["https://house.example/a#access_token=abc", "href_credential_fragment_key"],
    ["read (https://house.example/a?b=1#id_token=abc).", "href_credential_fragment_key"],
    // The query ends where the fragment begins.
    ["https://house.example/a?b=1#c&id_token=abc", "href_credential_fragment_key"],
  ];
  for (const [address, code] of addresses) {
    assert.deepEqual(codesOf(check(withEdits([free, address]))), [code], address);
  }
  // An anchor is not a credential, a name with no value carries nothing, free
  // text is not asked to parse, and paging and sorting keys are not names of
  // credentials.
  for (const address of [
    "https://house.example/a?status=open&page=2",
    "https://house.example/a#",
    "https://house.example/glossary#spelling was updated",
    "http://localhost is where the test server runs",
    "https://exa mple/",
    "https://house.example/a?token=",
    "https://house.example/docs/errors#auth",
    "https://house.example/a?page_token=abc&max_tokens=5&sort_key=name&keys=a&code=7",
    // The words that make a key name with "key" after them are not names on
    // their own, otp counts only as the whole key, and sid, PHPSESSID and
    // code are not listed.
    "https://house.example/a?app=notes&app_id=7&client=web&client_id=9&consumer=team&subscription=free&subscription_id=3",
    "https://house.example/a?auth_type=basic&otp_enabled=true&otp_length=6&sid=4&PHPSESSID=5&keyboard=us&appkeys=2&monkey=1&passed=1",
    // Userinfo is what stands before the host. An @ later in an address is not.
    "https://house.example/@reader/notes?to=reader@house.example",
  ]) {
    assert.equal(check(withEdits([free, address])).result, "checks_passed", address);
  }
  // A fragment is held to the pair rule and the secret shapes only. A bare
  // fragment of 32 hexadecimal characters has neither, so it passes: a secret
  // with no shape, carried as a fragment, is not caught. Built at run time.
  const opaque32 = "9f8e7d6c".repeat(4);
  for (const address of [`https://house.example/a#${opaque32}`, `see https://house.example/a?page=2#${opaque32} for more`]) {
    assert.equal(check(withEdits([free, address])).result, "checks_passed", "a fragment with no pair");
  }
  assert.deepEqual(codesOf(check(withEdits([free, `https://house.example/a#state=1&token=${opaque32}`]))), ["href_credential_fragment_key"]);
  assert.deepEqual(codesOf(check(withEdits([free, `https://house.example/a#${shapes["a provider key"]}`]))), ["secret_shape"], "a secret shape in a fragment is still a secret shape");
  // The names added after the final check, each alone as a query key.
  for (const key of ["auth_key", "authkey", "authKey", "app_key", "appKey", "client_key", "consumer_key", "subscription-key", "Ocp-Apim-Subscription-Key", "passcode", "otp", "OTP"]) {
    assert.deepEqual(codesOf(check(withEdits([free, `https://house.example/a?page=2&${key}=${opaque32}`]))), ["href_credential_query_key"], key);
  }

  // An address field is taken whole and asked to parse; the same text in a
  // field that is not an address field is not. The body here is one no other
  // check reads, so the tripwire is the only thing that looks at it.
  const unparsed = clone(example);
  unparsed.visits.second.bad_cursor.response = {
    status: 503,
    body: { docs: ["https://house.example:99999/x"], note: "https://house.example:99999/x" },
  };
  const unparsedResult = check(unparsed);
  assert.deepEqual(codesOf(unparsedResult), ["href_unparseable", "status_5xx"]);
  assert.deepEqual(
    unparsedResult.issues.filter((entry) => entry.code === "href_unparseable").map((entry) => entry.path),
    ["$/visits/second/bad_cursor/response/body/docs/0"],
  );

  // The view address itself with a credential-named key, wherever it is
  // written: every request to the view, the orientation's pointer, and the
  // way back from a refused cursor. Built at run time.
  const value = "9f8e7d6c".repeat(4);
  for (const [key, trips] of [["key", true], ["sig", true], ["X-Amz-Signature", true], ["jwt", true], ["pwd", true], ["page_token", false]]) {
    const keyed = clone(example);
    const href = `https://house.example/arrival/view?${key}=${value}`;
    for (const exchange of [keyed.visits.first.view_without_credential, keyed.visits.first.view, keyed.visits.second.view, keyed.visits.second.bad_cursor]) {
      exchange.request.href = href;
    }
    keyed.visits.first.orientation.response.body.view.href = href;
    keyed.visits.second.bad_cursor.response.body.next_actions[0].href = href;
    const result = check(keyed);
    assert.equal(outcomesOf(result)["I.NO_CREDENTIAL"], trips ? "fail" : "pass", `the view address with the key ${key}`);
    assert.equal(result.result, trips ? "check_failed" : "checks_passed", `the view address with the key ${key}`);
    assert.ok(!JSON.stringify(result).includes(value));
  }
});

test("the tripwire takes time that grows with the input, not with its square", () => {
  // Each text is the worst one found for a shape: many places where a secret
  // could start, and none that is one. 180,000 characters, inside the limit.
  const timed = (note) => {
    const fixture = clone(example);
    fixture.visits.second.bad_cursor.response = { status: 503, body: { note } };
    const bytes = Buffer.from(JSON.stringify(fixture));
    assert.ok(bytes.length <= MAX_INPUT_BYTES);
    const started = performance.now();
    const result = checkArrivalFixtureBytes(bytes, { now: fixedNow });
    return [performance.now() - started, result];
  };
  for (const [label, unit, copies] of [
    // One run of token characters in which every sk- but the first stands
    // straight after a hyphen: each is a place the pattern could begin.
    ["sk- starts with no digit", "sk-", 60000],
    ["sk- starts after a letter, none at a word boundary", "xsk-", 45000],
    ["sk- with a digit and then hyphens to the end of its run", `sk-1${"-".repeat(400)} `, 444],
    ["eyJ starts with no second part", "eyJaaaaaaaa-", 15000],
    ["eyJ starts with a second part and no third", `eyJaaaaaaaa-eyJaaaaaaaa.${"a".repeat(8)} `, 5400],
    ["eyJ parts that end in hyphens", `eyJ${"-".repeat(300)}.${"-".repeat(300)}.${"-".repeat(300)} `, 198],
    ["short runs with no start in them", "a ", 90000],
    ["Bearer followed by a short word", "Bearer aaaaaaaa ", 11250],
    ["addresses with a query", "https://house.example/?a=b ", 6600],
    ["one long address", "https://", 22500],
  ]) {
    const [elapsed, result] = timed(unit.repeat(copies));
    assert.equal(outcomesOf(result)["I.NO_CREDENTIAL"], "pass", label);
    assert.ok(elapsed < 2000, `${label}: ${Math.round(elapsed)} ms for ${unit.length * copies} characters`);
  }
});

test("the sk- and eyJ shapes, tried once in each run of token characters, match exactly where the patterns in cases.json match", () => {
  // The patterns as cases.json writes them say what matches. check.mjs does
  // not apply the two with a start as written; this holds that it gives their
  // answers all the same, over texts built here from the pieces a shape is
  // made of and the characters that stand around one. Nothing built here is a
  // real secret, and none of it sits in the repository.
  const patterns = cases.tripwire.secret_shapes.map(({ pattern, flags }) => new RegExp(pattern, flags));
  let seed = 20261113;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const soup = ["sk-", "sk-", "eyJ", "eyJ", "-", "-", "_", ".", ".", " ", "x", "7", "abcdefgh", "ABCD1234", "0123456789ab", "----", "sk", "ey", "=", "é"];
  const filled = (length, digits) => Array.from({ length }, () => pick(digits ? ["a", "B", "7", "_", "-"] : ["a", "B", "_", "-"])).join("");
  const before = ["", "x", "-", "_", ".", " ", "live-", "a_", "sk-", "eyJ", "eyJabcdefgh-", "sk-sk-", "=", "x-", "9-", "é", "--", "xsk-a-", "_sk--", "9eyJ-", "aeyJab-"];
  const after = ["", " ", "-", "_", ".", "x", "-x", ".eyJabcdefgh", "-sk-", "--", "=", "é"];
  const shaped = () => {
    if (random() < 0.5) return `${pick(before)}sk-${filled(pick([0, 1, 18, 19, 20, 21, 40]), random() < 0.8)}${pick(after)}`;
    const parts = Array.from({ length: pick([1, 2, 3, 3, 3, 4]) }, () => filled(pick([0, 7, 8, 9, 12]), true));
    return `${pick(before)}eyJ${parts.join(".")}${pick(after)}`;
  };
  const built = () => {
    if (random() < 0.4) return Array.from({ length: 1 + Math.floor(random() * 10) }, () => pick(soup)).join("");
    return random() < 0.7 ? shaped() : `${shaped()}${pick([" ", "-", ".", ""])}${shaped()}`;
  };
  let matched = 0;
  let unmatched = 0;
  for (let batch = 0; batch < 60; batch += 1) {
    // Fewer strings than a result holds issues, so every failing string has its own.
    const texts = Array.from({ length: 200 }, built);
    const fixture = clone(example);
    fixture.visits.second.bad_cursor.response = { status: 503, body: { note: texts } };
    const result = checkArrivalFixtureBytes(JSON.stringify(fixture), { now: fixedNow });
    const tripped = new Set(result.issues.filter((entry) => entry.code === "secret_shape").map((entry) => entry.path));
    for (const [index, text] of texts.entries()) {
      const expected = patterns.some((pattern) => pattern.test(text));
      assert.equal(
        tripped.has(`$/visits/second/bad_cursor/response/body/*/${index}`),
        expected,
        `the checker and the patterns as written disagree on ${JSON.stringify(text)}`,
      );
      if (expected) matched += 1;
      else unmatched += 1;
    }
  }
  assert.ok(matched > 1500 && unmatched > 1500, `${matched} texts matched and ${unmatched} did not`);
});

test("the tripwire shapes, fields and names listed in cases.json are the ones the checker uses", () => {
  const { tripwire } = cases;
  assert.match(tripwire.note, /establishes nothing/);
  assert.equal(tripwire.secret_shapes.length, 6);
  // Four shapes are applied as written. The two that give a start are written
  // in cases.json as what they match, a word boundary and then the start;
  // check.mjs holds each without that boundary and sticky, and tries it at the
  // first start in each run of token characters (the next test holds that the
  // answers are the same).
  const whole = tripwire.secret_shapes.filter((shape) => shape.start === undefined);
  const byRun = tripwire.secret_shapes.filter((shape) => shape.start !== undefined);
  assert.deepEqual(byRun.map((shape) => shape.start), ["sk-", "eyJ"]);
  for (const { pattern, flags } of [...whole, tripwire.address_start, tripwire.address_run, tripwire.credential_named]) {
    assert.ok(new RegExp(pattern, flags) instanceof RegExp);
    assert.ok(checkerSource.includes(`/${pattern}/${flags}`), `check.mjs uses /${pattern}/${flags}`);
  }
  for (const { pattern, flags, start } of byRun) {
    assert.ok(new RegExp(pattern, flags) instanceof RegExp);
    assert.equal(flags, "");
    assert.ok(pattern.startsWith(`\\b${start}`), `${start}: the pattern is a word boundary, then the start`);
    assert.ok(checkerSource.includes(`["${start}", /${pattern.slice(2)}/y]`), `check.mjs tries /${pattern.slice(2)}/ at a start it has found`);
  }
  assert.match(tripwire.secret_shapes_applied, /gives the same answers/);
  assert.match(tripwire.secret_shapes_applied, /the first place where the start stands at the beginning of the run or straight after a -/);
  // No other pattern literal in the checker is a secret shape: the two lists are whole.
  const literalsIn = (name) => {
    const from = checkerSource.indexOf(`const ${name} = Object.freeze([`);
    assert.ok(from >= 0, `check.mjs has ${name}`);
    return checkerSource.slice(from, checkerSource.indexOf("]);", from)).split("\n").filter((line) => /^\s*(?:\/|\[")/.test(line)).length;
  };
  assert.equal(literalsIn("SECRET_SHAPES"), whole.length);
  assert.equal(literalsIn("RUN_SHAPES"), byRun.length);
  const fields = /const ADDRESS_FIELDS = new Set\(\[([^\]]*)\]\);/.exec(checkerSource);
  assert.ok(fields, "check.mjs lists its address fields in one place");
  assert.deepEqual(JSON.parse(`[${fields[1]}]`), tripwire.address_fields);
  assert.equal(tripwire.address_rules.length, 4);
  assert.equal(tripwire.not_read.length, 4);

  // The naming rule, applied here as cases.json words it, decides every
  // query-key case the way that case states. A second implementation has
  // those words and that pattern to go on.
  const normalise = (key) => key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== "")
    .join("_");
  const named = new RegExp(tripwire.credential_named.pattern, tripwire.credential_named.flags);
  let decided = 0;
  for (const entry of cases.cases) {
    const kind = /^(credential|pass)-query-key/.exec(entry.id);
    if (!kind || entry.edits.length !== 1 || !entry.edits[0].path.endsWith("/deeper_read")) continue;
    const pairs = [...new URL(entry.edits[0].value).searchParams];
    const trips = pairs.some(([key, value]) => value !== "" && named.test(normalise(key)));
    assert.equal(trips, kind[1] === "credential", `${entry.id}: the rule as written`);
    assert.equal(entry.result, trips ? "check_failed" : "checks_passed", entry.id);
    decided += 1;
  }
  assert.ok(decided >= 45, `${decided} query-key cases were decided by the rule as written`);
});

test("each state agrees with its own fields: the state table, row by row", () => {
  const envelope = (fields) => ({ state: "ok", count: 1, limit: 4, items: [], dropped: null, unavailable: null, withheld: null, ...fields });
  const item = (id) => ({ id, summary: "s", recorded_at: null, acknowledged_at: "2026-11-01T00:00:00Z", ref: null, owed_to: null, due_at: null });
  const dropped = (count, reason = "other") => ({ count, reason, deeper_read: null });
  const rows = [
    ["ok with its items counted", { state: "ok", count: 2, items: [item("a"), item("b")] }, true],
    ["ok at its limit", { state: "ok", count: 4, items: ["a", "b", "c", "d"].map(item) }, true],
    ["ok with no items", { state: "ok", count: 0, items: [] }, false],
    ["ok with a null count", { state: "ok", count: null, items: [item("a")] }, false],
    ["ok with dropped set", { state: "ok", count: 1, items: [item("a")], dropped: dropped(1) }, false],
    ["quiet", { state: "quiet", count: 0 }, true],
    ["quiet with a null count", { state: "quiet", count: null }, false],
    ["quiet with an item", { state: "quiet", count: 0, items: [item("a")] }, false],
    ["quiet with unavailable set", { state: "quiet", count: 0, unavailable: { code: "other" } }, false],
    ["partial with an exact total", { state: "partial", count: 5, items: [item("a"), item("b")], dropped: dropped(3) }, true],
    ["partial listing nothing, with an exact total", { state: "partial", count: 3, items: [], dropped: dropped(3) }, true],
    ["partial with a wrong total", { state: "partial", count: 6, items: [item("a"), item("b")], dropped: dropped(3) }, false],
    ["partial with a dropped count and a null total", { state: "partial", count: null, items: [item("a")], dropped: dropped(3) }, false],
    ["partial with a floor", { state: "partial", count: 9, items: [item("a")], dropped: dropped(null) }, true],
    ["partial with a floor one above the items", { state: "partial", count: 2, items: [item("a")], dropped: dropped(null) }, true],
    // A partial envelope says at least one entry was dropped, so a floor is
    // above what is listed, and 0 is never a floor.
    ["partial with a floor equal to the items", { state: "partial", count: 1, items: [item("a")], dropped: dropped(null) }, false],
    ["partial listing nothing, with a floor of 0", { state: "partial", count: 0, items: [], dropped: dropped(null) }, false],
    ["partial listing nothing, with no count at all", { state: "partial", count: null, items: [], dropped: dropped(null) }, true],
    ["partial with no count at all", { state: "partial", count: null, items: [item("a")], dropped: dropped(null) }, true],
    // Dropped for the limit means the list is full.
    ["partial for its limit, with a full list", { state: "partial", count: 7, items: ["a", "b", "c", "d"].map(item), dropped: dropped(3, "limit") }, true],
    ["partial for its limit, with room left", { state: "partial", count: 5, items: [item("a"), item("b")], dropped: dropped(3, "limit") }, false],
    ["partial for its limit, listing nothing", { state: "partial", count: 3, items: [], dropped: dropped(3, "limit") }, false],
    ["partial by design, with room left", { state: "partial", count: 5, items: [item("a"), item("b")], dropped: dropped(3, "not_listed_by_design") }, true],
    ["partial with a floor below the items", { state: "partial", count: 1, items: [item("a"), item("b")], dropped: dropped(null) }, false],
    ["partial without dropped", { state: "partial", count: 1, items: [item("a")] }, false],
    ["partial with withheld set", { state: "partial", count: 4, items: [item("a")], dropped: dropped(3), withheld: { code: "other" } }, false],
    ["unavailable", { state: "unavailable", count: null, unavailable: { code: "not_observed" } }, true],
    ["unavailable with count 0", { state: "unavailable", count: 0, unavailable: { code: "read_failed" } }, false],
    ["unavailable without its code", { state: "unavailable", count: null }, false],
    ["unavailable with an item", { state: "unavailable", count: null, items: [item("a")], unavailable: { code: "other" } }, false],
    ["withheld", { state: "withheld", count: null, withheld: { code: "other" } }, true],
    ["withheld with count 0", { state: "withheld", count: 0, withheld: { code: "other" } }, false],
    ["withheld without its code", { state: "withheld", count: null }, false],
    ["withheld with dropped set", { state: "withheld", count: null, withheld: { code: "other" }, dropped: dropped(null) }, false],
    ["more items than the limit", { state: "ok", count: 5, items: ["a", "b", "c", "d", "e"].map(item) }, false],
  ];
  for (const [label, fields, agrees] of rows) {
    // Only the first visit is kept, so nothing is compared across reads.
    const fixture = clone(example);
    fixture.visits.second = {};
    const view = fixture.visits.first.view.response.body;
    view.sections[2] = { id: "messages", title: "Messages", kind: "other", scope: "identity", ...envelope(fields) };
    accepts("view", view, `${label}: the view stays schema-valid`);
    const result = check(fixture);
    assert.equal(outcomesOf(result)["R3.STATES"], agrees ? "pass" : "fail", label);
    assert.deepEqual(codesOf(result), agrees ? [] : ["state_mismatch"], label);
    assert.deepEqual(
      result.checks.filter((entry) => entry.outcome === "fail").map((entry) => entry.id),
      agrees ? [] : ["R3.STATES"],
      `${label}: no other check fails`,
    );
  }
});

test("status classes are exact at their edges for every single-exchange check", () => {
  const refusal = "/visits/first/view_without_credential/response";
  const bad = "/visits/second/bad_cursor/response";
  const orientation = "/visits/first/orientation/response";
  const rows = [
    ["R1.ORIENTATION", orientation, 200, "pass"],
    ...[201, 204, 301, 404, 499].map((status) => ["R1.ORIENTATION", orientation, status, "fail"]),
    ...[500, 503, 599].map((status) => ["R1.ORIENTATION", orientation, status, "unknown"]),
    ...[400, 401, 403, 404, 499].flatMap((status) => [["R1.REFUSAL", refusal, status, "pass"], ["R4.BAD_CURSOR", bad, status, "pass"]]),
    ...[100, 200, 204, 302, 399].flatMap((status) => [["R1.REFUSAL", refusal, status, "fail"], ["R4.BAD_CURSOR", bad, status, "fail"]]),
    ...[500, 503, 599].flatMap((status) => [["R1.REFUSAL", refusal, status, "unknown"], ["R4.BAD_CURSOR", bad, status, "unknown"]]),
  ];
  for (const [id, path, status, expected] of rows) {
    const edits = [[`${path}/status`, status]];
    // A refusal's body repeats its status, so a 4xx row moves both together.
    if (id !== "R1.ORIENTATION" && status >= 400 && status <= 499) edits.push([`${path}/body/status`, status]);
    const outcomes = outcomesOf(check(withEdits(...edits)));
    assert.equal(outcomes[id], expected, `${id} at status ${status}`);
    for (const other of CHECK_IDS) {
      if (other !== id) assert.equal(outcomes[other], "pass", `${other} is untouched by ${id} at status ${status}`);
    }
  }
  // Below 400 the body is not read as a problem at all.
  for (const path of [refusal, bad]) {
    assert.deepEqual(codesOf(check(withEdits([`${path}/status`, 302]))), ["status_not_4xx"]);
  }
  // A view answered with anything but 200 is not read, whatever the class.
  for (const status of [201, 304, 403, 404, 500]) {
    const outcomes = outcomesOf(check(withEdits(["/visits/second/view/response/status", status])));
    assert.equal(outcomes["R1.VIEW"], "pass", `the first view still stands at ${status}`);
    assert.equal(outcomes["P.PAIR"], "unknown", `the pair is not comparable at ${status}`);
  }
  // A refusal that fails for its own reasons fails, with or without an orientation to compare.
  const lone = applyEdits(example, [
    { op: "remove", path: "/visits/first/orientation" },
    { op: "set", path: `${refusal}/body/code`, value: "unauthorized" },
  ]);
  const loneResult = check(lone);
  assert.equal(outcomesOf(loneResult)["R1.REFUSAL"], "fail");
  assert.deepEqual(codesOf(loneResult), ["refusal_code_unexpected"]);
});

test("each ceiling is exact: a body at the limit is read, one byte over is not", () => {
  const sized = (bytes) => {
    const fixture = clone(example);
    const body = fixture.visits.first.view.response.body;
    const section = body.sections[0];
    section.limit = 32;
    section.count = 32;
    section.items = Array.from({ length: 32 }, (_, index) => ({
      id: `item-${index}`,
      summary: "s",
      recorded_at: null,
      acknowledged_at: null,
      ref: `https://house.example/obligations/${"a".repeat(1835)}`,
      owed_to: null,
      due_at: null,
    }));
    const short = bytes - Buffer.byteLength(JSON.stringify(body));
    assert.ok(short >= 0 && short < 150, "the padding fits inside one address");
    section.items[0].ref += "a".repeat(short);
    assert.equal(Buffer.byteLength(JSON.stringify(body)), bytes);
    accepts("view", body, `a view of ${bytes} bytes`);
    return fixture;
  };
  assert.equal(outcomesOf(check(sized(MAX_VIEW_BYTES)))["R1.VIEW"], "pass");
  const over = check(sized(MAX_VIEW_BYTES + 1));
  assert.equal(outcomesOf(over)["R1.VIEW"], "fail");
  assert.deepEqual(codesOf(over), ["view_over_ceiling"]);

  // The orientation ceiling is measured whether or not the body matches its
  // schema: with an undefined field, the size issue appears one byte over.
  // The schema-valid pair at and over the ceiling is among the built cases;
  // it needs four-byte characters, since plain letters cannot reach 8192.
  const padded = (bytes) => {
    const fixture = clone(example);
    const body = fixture.visits.first.orientation.response.body;
    body.padding = "";
    body.padding = "a".repeat(bytes - Buffer.byteLength(JSON.stringify(body)));
    assert.equal(Buffer.byteLength(JSON.stringify(body)), bytes);
    return fixture;
  };
  // (A body with an undefined field is also one the later checks do not read.)
  assert.deepEqual(codesOf(check(padded(MAX_ORIENTATION_BYTES))), ["document_not_read", "schema_additional_properties"]);
  assert.deepEqual(
    codesOf(check(padded(MAX_ORIENTATION_BYTES + 1))),
    ["document_not_read", "orientation_over_ceiling", "schema_additional_properties"],
  );
});

test("every not_established token is needed, one by one", () => {
  const documents = [
    [ORIENTATION_PATH, ORIENTATION_TOKENS],
    [VIEW_PATH, VIEW_TOKENS],
    [SECOND_VIEW_PATH, VIEW_TOKENS],
  ];
  for (const [path, tokens] of documents) {
    for (const token of tokens) {
      const fixture = withEdits([`${path}/not_established`, tokens.filter((entry) => entry !== token)]);
      const result = check(fixture);
      assert.deepEqual(result.checks.filter((entry) => entry.outcome === "fail").map((entry) => entry.id), ["R7.NON_CLAIMS"], `${path} without ${token}`);
      assert.deepEqual(codesOf(result), ["non_claim_missing"]);
    }
    // Order is free.
    assert.equal(check(withEdits([`${path}/not_established`, [...tokens].reverse()])).result, "checks_passed");
  }
});

test("the second view is held to the first view's date only when the two are compared", () => {
  const older = [`${SECOND_VIEW_PATH}/as_of`, "2026-11-12T08:00:00Z"];
  assert.equal(outcomesOf(check(withEdits(older)))["R5.FRESHNESS"], "fail");
  const notCompared = outcomesOf(check(withEdits(older, [`${SECOND_VIEW_PATH}/audience/scope`, "identity"])));
  assert.equal(notCompared["P.PAIR"], "unknown");
  assert.equal(notCompared["R5.FRESHNESS"], "pass", "two audiences are two documents, each dated consistently");

  // The fixed sentence of the check is true whenever the check passes. The
  // final check's probe: the audiences differ and the second view is dated
  // years before the first, so the check passes with the order not compared.
  const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
  const probe = check(applyEdits(example, byId["freshness-second-view-older-and-not-compared"].edits));
  const views = [probe, check(exampleBytes)].map((result) => result.checks.find((entry) => entry.id === "R5.FRESHNESS"));
  assert.equal(probe.result, "indeterminate");
  assert.equal(outcomesOf(probe)["P.PAIR"], "unknown");
  for (const entry of views) {
    assert.equal(entry.outcome, "pass");
    assert.equal(
      entry.expected,
      "every served document states as_of and valid_until, valid_until is not before as_of, and, where the two views are compared with each other, the second is not dated before the first; no time is compared with a request time or a clock",
    );
  }
  // What was observed says whether the order was compared.
  assert.equal(
    views[0].observed,
    "3 served documents: each states as_of and valid_until, and valid_until is not before as_of. The two views were not compared with each other, so the order of their dates was not either. Host times were compared with host times only: no request time and no clock was read, so a document already past its valid_until when it was requested is not held against the host.",
  );
  assert.equal(
    views[1].observed,
    "3 served documents: each states as_of and valid_until, and valid_until is not before as_of; the second view is not dated before the first. Host times were compared with host times only: no request time and no clock was read, so a document already past its valid_until when it was requested is not held against the host.",
  );
  // With one view recorded there is no order to speak of.
  const alone = check(applyEdits(example, [{ op: "remove", path: "/visits/second/view" }]));
  assert.equal(
    alone.checks.find((entry) => entry.id === "R5.FRESHNESS").observed,
    "2 served documents: each states as_of and valid_until, and valid_until is not before as_of. Host times were compared with host times only: no request time and no clock was read, so a document already past its valid_until when it was requested is not held against the host.",
  );
});

test("an issue that only says nothing was compared is left out when the check already fails", () => {
  const mark = "2026-11-11T12:00:00Z";
  const fixture = withEdits(
    [`${VIEW_PATH}/sections/0/items/2/acknowledged_at`, mark],
    [`${VIEW_PATH}/sections/1/items/0/acknowledged_at`, mark],
    [`${VIEW_PATH}/sections/1/items/1/acknowledged_at`, mark],
    [`${SECOND_VIEW_PATH}/sections/0/items/1/acknowledged_at`, mark],
    [`${SECOND_VIEW_PATH}/sections/1/items/0/acknowledged_at`, mark],
    // The one item left unacknowledged on the first read comes back marked.
    [`${SECOND_VIEW_PATH}/sections/0/items/0/acknowledged_at`, mark],
  );
  const result = check(fixture);
  assert.equal(outcomesOf(result)["R2.SHOWN_AGAIN"], "fail");
  assert.equal(result.exercised.items_compared_equal, 0);
  assert.deepEqual(codesOf(result), ["acknowledgement_moved", "unacknowledged_item_changed_unnamed"]);
});

test("a check with a failure and an undecidable point counts each kind apart in what it says it observed", () => {
  const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
  const result = check(applyEdits(example, byId["shown-again-one-change-unnamed-and-one-item-undecided"].edits));
  assert.equal(outcomesOf(result)["R2.SHOWN_AGAIN"], "fail", "a failure outranks an undecidable point");
  // Both issues are in the result, and each belongs to this check.
  assert.deepEqual(
    result.issues.map((entry) => [entry.code, entry.path]),
    [
      ["unacknowledged_item_changed_unnamed", `$${VIEW_PATH}/sections/0/items/2`],
      ["undecidable_difference", `$${VIEW_PATH}/sections/1/items/0`],
    ],
  );
  // One disagreement, and the list holds it: the undecidable point is not
  // counted with it, on either side of that sentence.
  assert.equal(observedOf(result, "R2.SHOWN_AGAIN"), "1 disagreement recorded as an issue.");

  // The same the other way round: two undecidable points and no failure.
  const undecided = check(applyEdits(example, [
    ...byId["shown-again-gone-from-a-partial-section"].edits,
    { op: "set", path: `${SECOND_VIEW_PATH}/sections/0/state`, value: "partial" },
    { op: "set", path: `${SECOND_VIEW_PATH}/sections/0/dropped`, value: { count: 1, reason: "other", deeper_read: null } },
    { op: "set", path: `${SECOND_VIEW_PATH}/sections/0/count`, value: 2 },
    { op: "remove", path: `${SECOND_VIEW_PATH}/sections/0/items/0` },
  ]));
  assert.equal(outcomesOf(undecided)["R2.SHOWN_AGAIN"], "unknown");
  assert.equal(observedOf(undecided, "R2.SHOWN_AGAIN"), "Not decidable from this fixture: 2 points recorded as issues.");
});

test("a pass that compared nothing is not a pass: both cross-read checks need something to compare", () => {
  const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
  const nothingShown = check(applyEdits(example, byId["shown-again-nothing-unacknowledged-shown"].edits));
  assert.equal(outcomesOf(nothingShown)["R2.SHOWN_AGAIN"], "unknown");
  assert.equal(nothingShown.exercised.items_compared_equal, 0);
  const nothingChanged = check(applyEdits(example, byId["changes-nothing-changed"].edits));
  assert.equal(outcomesOf(nothingChanged)["R4.CHANGES"], "unknown");
  assert.equal(nothingChanged.exercised.differences_found, 0);
  assert.equal(nothingChanged.result, "indeterminate");
  // A fixture with no exchange at all is indeterminate, never passed.
  const empty = check(applyEdits(example, byId["nothing-recorded"].edits));
  assert.equal(empty.result, "indeterminate");
  assert.equal(empty.counts.pass, 6);
  assert.equal(empty.counts.not_run, 14);
  assert.deepEqual(empty.exercised, {
    items_compared_equal: 0,
    differences_found: 0,
    differences_named: 0,
    states_seen: { ok: 0, quiet: 0, partial: 0, unavailable: 0, withheld: 0 },
  });
});

test("the checker bounds its issues, accepts three kinds of input, and refuses a bad clock", () => {
  const noisy = clone(example);
  noisy.visits.first.orientation.response.body = {
    lines: Array.from({ length: 300 }, (_, index) => `Bearer ${"abc123".repeat(4)}${index}`),
  };
  const result = check(noisy);
  assert.equal(result.issues.length, MAX_ISSUES);
  assert.equal(outcomesOf(result)["I.NO_CREDENTIAL"], "fail");
  assert.match(result.checks.find((entry) => entry.id === "I.NO_CREDENTIAL").observed, /^300 /, "the count is of all disagreements, not only the issues kept");

  // A full list still holds an issue for every check that fails or is
  // unknown, and no check says an issue was recorded when it was left out.
  const crowded = clone(example);
  const first = crowded.visits.first.view.response.body;
  const shaped = `gh${"p"}_${"A1b2C3d4".repeat(3)}`;
  const filler = (index) => ({
    id: `filler-${index}`, title: "Filler", kind: "other", scope: "project", state: "ok", count: 20, limit: 32,
    items: Array.from({ length: 20 }, (_, at) => ({
      id: `item-${at}`, summary: shaped, recorded_at: null, acknowledged_at: null, ref: null, owed_to: null, due_at: null,
    })),
    dropped: null, unavailable: null, withheld: null,
  });
  first.sections = [first.sections[0], ...Array.from({ length: 15 }, (_, index) => filler(index))];
  crowded.visits.second.view.response.body.reply_expected = true;
  const full = check(crowded);
  const observedOf = (id) => full.checks.find((entry) => entry.id === id).observed;
  const held = (code) => full.issues.filter((entry) => entry.code === code).length;
  assert.equal(full.issues.length, MAX_ISSUES);
  assert.equal(outcomesOf(full)["R6.NO_OBLIGATION"], "fail");
  assert.equal(held("reply_expected"), 1, "the one issue of a later check is in the full list");
  assert.equal(observedOf("R6.NO_OBLIGATION"), "1 disagreement recorded as an issue.");
  assert.equal(outcomesOf(full)["R3.SECTIONS_KEPT"], "fail");
  assert.ok(held("section_missing") >= 1, "at least one issue of every failing check is kept");
  for (const [id, code, count] of [["I.NO_CREDENTIAL", "secret_shape", 300], ["R3.SECTIONS_KEPT", "section_missing", 15]]) {
    assert.ok(held(code) < count, `${id}: some of its issues were left out`);
    assert.equal(
      observedOf(id),
      `${count} disagreements; the issues list holds ${held(code)} of them and is full at ${MAX_ISSUES}.`,
      `${id} says how many of its issues the list holds`,
    );
  }
  assert.deepEqual(
    full.checks.filter((entry) => entry.outcome === "fail").map((entry) => entry.id),
    ["I.NO_CREDENTIAL", "R3.SECTIONS_KEPT", "R6.NO_OBLIGATION"],
  );
  assert.match(schemas.result.properties.issues.description, /first failure and the first undecidable point of each check are kept/);
  // The issues that are kept stay in the order they arose.
  assert.deepEqual(
    full.issues.map((entry) => entry.code),
    [...Array.from({ length: held("secret_shape") }, () => "secret_shape"), "reply_expected", "section_missing"],
  );

  // A body with more schema issues than the validator counts: the count is
  // given as a floor, since the validator stopped at its bound.
  const broken = clone(example);
  const template = broken.visits.first.view.response.body.sections[2];
  broken.visits.first.view.response.body.sections = Array.from({ length: 16 }, (_, index) => ({
    ...template, id: `section-${index}`, items: Array.from({ length: 32 }, () => ({ id: 5 })),
  }));
  const overfull = check(broken);
  assert.equal(overfull.issues.length, MAX_ISSUES);
  assert.match(
    overfull.checks.find((entry) => entry.id === "R1.VIEW").observed,
    /^At least 256 disagreements; the issues list holds 2\d\d of them and is full at 256\.$/,
  );

  const text = exampleBytes.toString("utf8");
  const fromText = checkArrivalFixtureBytes(text, { now: fixedNow });
  const fromBuffer = checkArrivalFixtureBytes(exampleBytes, { now: fixedNow });
  const fromArray = checkArrivalFixtureBytes(new Uint8Array(exampleBytes), { now: new Date(fixedNow) });
  assert.deepEqual(fromText, fromBuffer);
  assert.deepEqual({ ...fromArray, observed_at: fixedNow }, fromBuffer);
  assert.equal(fromArray.observed_at, "2027-01-01T00:00:00.000Z");
  assert.deepEqual(checkArrivalFixtureBytes(exampleBytes, { now: fixedNow }), fromBuffer, "the same bytes give the same result");
  assert.match(checkArrivalFixtureBytes(exampleBytes).observed_at, /^[0-9]{4}-/);

  assert.throws(() => checkArrivalFixtureBytes(exampleBytes, { now: "2026-02-30T00:00:00Z" }), /uppercase-UTC RFC 3339/);
  assert.throws(() => checkArrivalFixtureBytes(exampleBytes, { now: `2026-08-03T16:00:00.${"1".repeat(20)}Z` }), TypeError);
  assert.throws(() => checkArrivalFixtureBytes({ not: "bytes" }, { now: fixedNow }), /string, Buffer, or Uint8Array/);
});

test("the file reader takes one regular file within the limit", async () => {
  const fromFile = await checkArrivalFixtureFile(examplePath, { now: fixedNow });
  assert.deepEqual(fromFile, checkArrivalFixtureBytes(exampleBytes, { now: fixedNow }));

  const scratch = mkdtempSync(join(tmpdir(), "xenia-arrival-test-"));
  try {
    const large = join(scratch, "large.json");
    writeFileSync(large, Buffer.alloc(MAX_INPUT_BYTES + 1, 0x20));
    const oversize = await checkArrivalFixtureFile(large, { now: fixedNow });
    assert.equal(oversize.result, "indeterminate");
    assert.deepEqual(oversize.artifact, { complete: false, observed_bytes: MAX_INPUT_BYTES + 1 });
    assert.equal(validate.result(oversize), true, errorsOf(validate.result));
    const larger = join(scratch, "larger.json");
    writeFileSync(larger, Buffer.alloc(MAX_INPUT_BYTES + 100, 0x20));
    const notRead = await checkArrivalFixtureFile(larger, { now: fixedNow });
    assert.deepEqual(notRead.artifact, { complete: false, observed_bytes: MAX_INPUT_BYTES + 100 }, "an oversize file is sized from its metadata and not read");
    await assert.rejects(checkArrivalFixtureFile(scratch, { now: fixedNow }), /regular file|EISDIR/);
    // A named pipe is refused before it is opened: opening one waits for a writer.
    const pipe = join(scratch, "pipe");
    if (process.platform !== "win32" && spawnSync("mkfifo", [pipe]).status === 0) {
      const waited = spawnSync(process.execPath, [checkerPath, pipe], { encoding: "utf8", timeout: 10000 });
      assert.equal(waited.status, 2, "the command line refuses a named pipe and does not wait on it");
      assert.match(waited.stderr, /regular file/);
      assert.equal(waited.stdout, "");
    }
    await assert.rejects(checkArrivalFixtureFile(join(scratch, "absent.json"), { now: fixedNow }), /ENOENT/);
    await assert.rejects(checkArrivalFixtureFile("", { now: fixedNow }), /non-empty string/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the command line prints one result, restates what is not established, and has three exit codes", () => {
  const run = (...args) => spawnSync(process.execPath, [checkerPath, ...args], { encoding: "utf8" });
  const scratch = mkdtempSync(join(tmpdir(), "xenia-arrival-test-"));
  try {
    const passed = run(examplePath, "--json");
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(passed.stderr, "");
    const passedResult = JSON.parse(passed.stdout);
    assert.equal(passedResult.result, "checks_passed");
    assert.equal(validate.result(passedResult), true, errorsOf(validate.result));
    assert.deepEqual(passedResult.not_established, RESULT_NOT_ESTABLISHED);

    const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
    const failing = join(scratch, "failing.json");
    writeFileSync(failing, JSON.stringify(applyEdits(example, byId["bad-cursor-answered-with-a-view"].edits)));
    const failed = run(failing, "--json");
    assert.equal(failed.status, 1, failed.stderr);
    assert.equal(JSON.parse(failed.stdout).result, "check_failed");

    const undecided = join(scratch, "undecided.json");
    writeFileSync(undecided, JSON.stringify(applyEdits(example, byId["changes-nothing-changed"].edits)));
    const indeterminate = run(undecided, "--json");
    assert.equal(indeterminate.status, 1, "indeterminate is not a pass");
    assert.equal(JSON.parse(indeterminate.stdout).result, "indeterminate");

    const human = run(failing);
    assert.equal(human.status, 1);
    assert.match(human.stdout, /^XENIA Arrival 0\.1 development draft: check_failed$/m);
    assert.match(human.stdout, /^fail R4\.BAD_CURSOR: /m);
    assert.match(human.stdout, /^- status_not_4xx at \$\/visits\/second\/bad_cursor\/response\/status: /m);
    assert.match(human.stdout, /^not established:$/m);
    for (const line of RESULT_NOT_ESTABLISHED) assert.ok(human.stdout.includes(`- ${line}\n`), "every non-claim is printed");
    const plainPass = run(examplePath);
    assert.equal(plainPass.status, 0);
    assert.match(plainPass.stdout, /^XENIA Arrival 0\.1 development draft: checks_passed$/m);
    assert.match(plainPass.stdout, /^not established:$/m);
    assert.doesNotMatch(plainPass.stdout, /conformant|welcome|hello|congratulations/i);

    for (const args of [[], [examplePath, failing], [examplePath, "--verbose"], ["--json"]]) {
      const misuse = run(...args);
      assert.equal(misuse.status, 2, `misuse: ${args.join(" ")}`);
      assert.match(misuse.stderr, /^Usage: node arrival\/0\.1\/check\.mjs <fixture\.json> \[--json\]/);
      assert.equal(misuse.stdout, "");
    }
    const absent = run(join(scratch, "absent.json"), "--json");
    assert.equal(absent.status, 2);
    assert.equal(absent.stdout, "");
    assert.match(absent.stderr, /ENOENT/);

    for (const flag of ["--help", "-h"]) {
      const help = run(flag);
      assert.equal(help.status, 0);
      assert.equal(help.stderr, "");
      assert.match(help.stdout, /^Usage: node arrival\/0\.1\/check\.mjs <fixture\.json> \[--json\]/);
      assert.match(help.stdout, /makes no network request/);
      assert.match(help.stdout, /262144 bytes/);
      assert.match(help.stdout, /Exit codes: 0 checks_passed; 1 check_failed or indeterminate; 2 misuse/);
      assert.match(help.stdout, /does not establish/);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the checker imports only node: modules, reaches no network, and says what it reuses", () => {
  const imports = [...checkerSource.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["'];/gms)].map((match) => match[1]);
  assert.deepEqual(imports.sort(), ["node:crypto", "node:fs", "node:fs/promises", "node:url"]);
  assert.doesNotMatch(checkerSource, /\bimport\s*\(/, "no dynamic import");
  assert.doesNotMatch(checkerSource, /\brequire\s*\(/);
  assert.doesNotMatch(checkerSource, /\bfetch\s*\(/);
  assert.doesNotMatch(checkerSource, /process\.env/);
  assert.doesNotMatch(checkerSource, /child_process|node:(?:http|https|http2|net|tls|dns|dgram|worker_threads)/);
  assert.doesNotMatch(checkerSource, /\b(?:writeFile|appendFile|mkdir|unlink|rename|createWriteStream)\w*\s*\(/, "nothing is written");
  assert.match(checkerSource, /^\/\/ SPDX-License-Identifier: MPL-2\.0$/m);
  const header = checkerSource.slice(0, checkerSource.indexOf("import "));
  assert.match(header, /work\/0\.1\/check\.mjs/);
  assert.match(header, /surface\/0\.1\/check\.mjs/);
  assert.match(header, /copying, not by importing/);
});

test("the README names the checker's files, counts, exit codes and limits as they are", () => {
  const flat = readme.replace(/\s+/g, " ");
  assert.ok(readme.includes("[check.mjs](check.mjs)"));
  assert.ok(readme.includes("[fixtures/cases.json](fixtures/cases.json)"));
  assert.match(flat, /same author wrote the checker, the cases and their expected outcomes/);
  assert.match(flat, /not independent evidence/);
  assert.match(flat, new RegExp(`holds ${cases.cases.length} cases`), "the README states how many edit cases there are");
  assert.match(flat, new RegExp(`and ${cases.built.length} more built from recipes`), "and how many are built from a recipe");
  assert.ok(readme.includes("node arrival/0.1/check.mjs <fixture.json> [--json]"));
  assert.match(flat, /0 for `checks_passed`, 1 for `check_failed` or `indeterminate`, 2 for misuse/);
  assert.match(flat, /No such implementation exists/, "the exit gate says it is unmet");
  assert.match(flat, /Fails when \| Unknown when/, "the check table gives fail and unknown conditions");
  assert.match(flat, /A check is `not_run` when/);
  assert.match(flat, /A failure outranks an unknown/);
  assert.match(flat, /A tripwire, not a guarantee/);
  assert.match(flat, /Beyond the fixture's origin word, it copies no value from the fixture/);
  assert.match(flat, /establishes none of the ten lines the schema fixes under `not_established`/);
  // The three issue codes the README names are ones the checker reports.
  for (const code of ["not_stated", "acknowledgement_moved", "not_exercised"]) {
    assert.ok(readme.includes(`\`${code}\``), `README names ${code}`);
    assert.ok(cases.cases.some((entry) => entry.issues.includes(code)), `a case reports ${code}`);
  }
  // Each number the README gives as a limit is the checker's.
  for (const [text, value] of [["262,144", MAX_INPUT_BYTES], ["65,536", MAX_VIEW_BYTES], ["8,192", MAX_ORIENTATION_BYTES]]) {
    assert.equal(Number(text.replace(",", "")), value);
    assert.ok(readme.includes(text), `README states ${text}`);
  }
  assert.match(readme, /nesting over 64/);
  assert.equal(MAX_JSON_DEPTH, 64);
});

test("the arrival tests run inside npm test, and the package manifest has no script for this draft", () => {
  const manifest = json("package.json", root);
  // tests/*.test.mjs already takes in every arrival test file, so npm test
  // runs them once, through test:library. package.json is a packed file and
  // this draft adds nothing to it.
  assert.equal(manifest.scripts["test:library"], "node --test tests/*.test.mjs");
  assert.match(manifest.scripts.test, /npm run test:library/);
  assert.ok(Object.keys(manifest.scripts).every((name) => !name.includes("arrival")), "no arrival script");
  assert.ok(!JSON.stringify(manifest).includes("arrival"), "package.json does not name the draft");
});

// ---------------------------------------------------------------------------
// Added after review: a served body that is not read, the fixed sentences of
// a result, what the schemas say about the fields the checker relies on, and
// the README held word for word.

const PER_DOCUMENT_CHECKS = ["R2.DECLARED_EFFECTS", "R5.FRESHNESS", "R6.NO_OBLIGATION", "R7.NON_CLAIMS"];
const PER_VIEW_CHECKS = ["R3.STATES", "R4.CURSOR"];

function observedOf(result, id) {
  return result.checks.find((entry) => entry.id === id).observed;
}

test("a served body that is not valid is not read, and no check passes over it", () => {
  const every = [...PER_DOCUMENT_CHECKS, ...PER_VIEW_CHECKS];
  for (const [path, reads] of [
    [ORIENTATION_PATH, PER_DOCUMENT_CHECKS],
    [VIEW_PATH, every],
    [SECOND_VIEW_PATH, every],
  ]) {
    const result = check(withEdits([`${path}/unknown_field`, 1]));
    const outcomes = outcomesOf(result);
    for (const id of every) {
      assert.equal(outcomes[id], reads.includes(id) ? "unknown" : "pass", `${id} when ${path} is served and not valid`);
    }
    assert.deepEqual(
      result.issues.filter((entry) => entry.code === "document_not_read").map((entry) => entry.path),
      [`$${path}`],
      "one issue for the body that was not read",
    );
    for (const id of reads) {
      assert.equal(
        observedOf(result, id),
        "Not decidable from this fixture: 1 served document was not read; see the document_not_read issue.",
        `${id} says why it is unknown`,
      );
    }
    assert.equal(result.result, "check_failed", "the body still fails its own R1 check");
  }

  // Everything a rule could hold against the unread view is in it, and none
  // of it is passed over: the case is in cases.json for a second checker.
  const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
  const unread = check(applyEdits(example, byId["view-unread-and-breaking-every-rule"].edits));
  for (const id of every) assert.equal(outcomesOf(unread)[id], "unknown", id);

  // A failure in a document that was read outranks the unknown.
  const both = check(applyEdits(example, byId["view-unread-beside-a-view-that-fails"].edits));
  assert.equal(outcomesOf(both)["R6.NO_OBLIGATION"], "fail");
  assert.match(observedOf(both, "R6.NO_OBLIGATION"), /^1 disagreement recorded as an issue\.$/);

  // An answer with another status is not a served document, so nothing is
  // left unread and the checks read what there is.
  for (const status of [403, 404, 503]) {
    const refused = check(withEdits(["/visits/first/orientation/response/status", status]));
    for (const id of every) assert.equal(outcomesOf(refused)[id], "pass", `${id} with the orientation answered ${status}`);
    assert.ok(!codesOf(refused).includes("document_not_read"));
  }

  // not_run is kept for a fixture in which no document of the kind was served.
  const none = check(applyEdits(example, byId["views-5xx"].edits));
  for (const id of PER_VIEW_CHECKS) assert.equal(outcomesOf(none)[id], "not_run", id);
  for (const id of PER_DOCUMENT_CHECKS) assert.equal(outcomesOf(none)[id], "pass", `${id} reads the orientation`);
});

test("the fixed sentences of a result say how far each comparison reaches", () => {
  const result = check(exampleBytes);
  const expected = (id) => result.checks.find((entry) => entry.id === id).expected;
  for (const id of [...PER_DOCUMENT_CHECKS, ...PER_VIEW_CHECKS]) {
    assert.match(expected(id), /\bserved\b/, `${id} speaks of served documents, since an unread one makes it unknown`);
  }
  assert.match(expected("R2.DECLARED_EFFECTS"), /the order of operational writes aside/);
  assert.match(expected("R2.SHOWN_AGAIN"), /no item shown in the same section on both reads has a different mark/);
  assert.match(observedOf(result, "R2.SHOWN_AGAIN"), /A named change is accepted whatever caused it\./);
  assert.match(observedOf(result, "R2.SHOWN_AGAIN"), /recorder's own statement/);
  assert.match(expected("R5.FRESHNESS"), /no time is compared with a request time or a clock/);
  assert.match(expected("I.NO_CREDENTIAL"), /a query or fragment pair with a key named like a credential and a value/);
  assert.match(expected("I.NO_CREDENTIAL"), /no address in an address field fails to parse/);
  assert.match(expected("R3.STATES"), /state table/);
  for (const entry of result.checks) assert.ok(entry.expected.length <= 1000, entry.id);
});

test("operational writes are compared as a set, and a mark set under another section passes with its limit stated", () => {
  const writes = ["credential last-used time", "request log line"];
  const reordered = withEdits(
    [`${ORIENTATION_PATH}/view/read_effects/operational_writes`, writes],
    [`${VIEW_PATH}/read_effects/operational_writes`, writes],
    [`${SECOND_VIEW_PATH}/read_effects/operational_writes`, [...writes].reverse()],
  );
  assert.equal(check(reordered).result, "checks_passed", "the same writes in another order");
  const other = withEdits(
    [`${ORIENTATION_PATH}/view/read_effects/operational_writes`, writes],
    [`${VIEW_PATH}/read_effects/operational_writes`, writes],
    [`${SECOND_VIEW_PATH}/read_effects/operational_writes`, [writes[0], "read receipt"]],
  );
  assert.deepEqual(codesOf(check(other)), ["declarations_differ"], "another write is still a difference");

  const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
  const moved = check(applyEdits(example, byId["pass-item-ended-and-added-elsewhere-with-a-mark"].edits));
  assert.equal(moved.result, "checks_passed");
  // The limit that case shows is one every result states.
  assert.ok(moved.not_established.includes("that a read wrote nothing on the host; only declarations and the two recorded views were compared"));
  assert.ok(moved.not_established.includes("that a difference between the reads was caused by reading"));
});

test("the schemas say what the checker relies on for a position, a change list, a mark, a scope, an origin and a house with no cursor", () => {
  const { view, fixture, orientation } = schemas;
  assert.match(view.properties.acknowledgement.description, /how far acknowledgements made under this credential have reached/);
  assert.match(view.properties.acknowledgement.description, /moves only when one is made/);
  assert.match(view.properties.changes.description, /the net difference between what the two reads list, not a list of the events between them/);
  assert.match(view.$defs.item.properties.acknowledged_at.description, /no form for a mark with no time/);
  assert.match(view.$defs.scope.description, /another unit of tenancy/);
  assert.match(view.properties.valid_until.description, /never with a request time/);
  for (const name of ["view", "orientation"]) {
    assert.match(schemas[name].$defs.read_effects.properties.operational_writes.description, /Order carries no meaning/);
  }
  const origin = fixture.properties.origin.description;
  assert.match(origin, /host_bytes: each body is the JSON a host answered with, parsed and not altered; the bytes themselves are not kept/);
  assert.match(origin, /projected_by_recorder: .* changes no value and adds no statement the host did not make/);
  assert.match(origin, /the field is left out and that body fails its check/);
  assert.match(fixture.properties.visits.properties.second.properties.bad_cursor.description, /names no cursor parameter/);
  assert.match(orientation.properties.view.properties.cursor_parameter.description, /no bad-cursor request/);
});

// Markdown split into the blocks a reader meets: a paragraph, a list item, or
// a table row, each with its white space collapsed.
function blocksOf(markdown) {
  const blocks = [];
  for (const chunk of markdown.trim().split(/\n{2,}/)) {
    const lines = chunk.split("\n");
    if (lines.every((line) => line.startsWith("|"))) {
      blocks.push(...lines);
      continue;
    }
    let current = null;
    for (const line of lines) {
      if (current === null || /^(?:- |[0-9]+\. )/.test(line)) {
        if (current !== null) blocks.push(current);
        current = line.trim();
      } else {
        current += ` ${line.trim()}`;
      }
    }
    if (current !== null) blocks.push(current);
  }
  return blocks;
}

// The text under one heading, up to the next heading of any level: what that
// heading says itself, without the sections below it.
function readmeSection(heading) {
  const start = readme.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `README has the heading ${heading}`);
  const rest = readme.slice(start + heading.length + 2);
  const next = rest.search(/\n#{1,6} /);
  return next < 0 ? rest : rest.slice(0, next);
}

// Every heading of the draft README, in order.
const README_HEADINGS = [
  "# XENIA Arrival 0.1",
  "## Where the rules come from",
  "## The seven rules",
  "## The two documents",
  "### States",
  "### Bounds",
  "### What `not_established` means",
  "## The fixture",
  "## Checks and result",
  "## Beside Surface, Work and Covenant",
  "## Outside Arrival 0.1",
  "## Open questions",
  "## Exit gate (declared, unmet)",
];

// The whole draft README, held word for word, heading by heading. Line breaks
// inside a paragraph are free. A change to the README has to be made here as
// well, on purpose. The bounds table is not here: its test builds it from the
// schemas and the checker.
const README_PINNED = {
  "# XENIA Arrival 0.1": [
    "Status: **development draft**",
    "- Written by one author. No second implementation exists.",
    "- No host is known to serve either document.",
    "- The [example](examples/two-visits.json) and the cases in [fixtures/cases.json](fixtures/cases.json) were written by hand.",
    "- [check.mjs](check.mjs) is the only checker. Its [tests](../../tests/arrival-0.1.test.mjs) run it over the example and every case, and they agree. The same author wrote the checker, the cases and their expected outcomes, so that agreement is not independent evidence.",
    "- This directory is outside the npm package, its exports, the agent-first kit, and the `normative_profiles` list in [spec.json](../../spec.json). Its schema identifiers are development URNs, not release identities.",
    "Arrival 0.1 describes two documents a host can serve to an arriving agent, and a way to record two visits so the pair can be checked offline:",
    "- an **orientation**, answered to anyone with no credential: what this place is, where its private view lives, and what a read does;",
    "- a **continuity view**, answered when a credential is presented: a bounded account of what the host holds under that credential.",
    "Nothing here is normative. This text says what the schemas permit and what a check of a recorded fixture compares. It places no requirement on any host.",
  ],
  "## Where the rules come from": [
    "| Rule | Source |",
    "|---|---|",
    "| 1, 5 | [AGENT-FEEDBACK.md](../../AGENT-FEEDBACK.md), the 2026-07-11 report, \"What I would change first\", item 5 |",
    "| 2, 6 | root [README.md](../../README.md), Continuity & Arrival: \"A look, not an event\" (2) and \"A welcome, not a work order\" (2, 6) |",
    "| 3 | [WEBSITE-ROLLOUT.md](../../WEBSITE-ROLLOUT.md), website integration gates 2 and 3 |",
    "| 4 | the same list, gate 1 |",
    "| 7 | [AGENTS.md](../../AGENTS.md): report evidence, claims, and unknowns separately; the same list, gate 4 |",
    "The root README calls this arrival a wake. This draft does not use the word: the 2026-07-11 report says it has stood for both a public orientation and an authenticated read. The shapes, the state `withheld`, the two problem codes, and the choice that a cursor annotates a full view are this draft's own. No text or code from any host was copied into this directory.",
  ],
  "## The seven rules": [
    "1. **Two addresses.** The orientation answers anyone. The view address answers a request with no credential by refusing: a [Surface 0.1 problem](../../surface/0.1/problem.schema.json) with code `credential_required` whose first next action is the orientation. It does not answer with a smaller view.",
    "2. **A read is not an event.** Each document declares what a read writes. The declarations agree, and say `none` for the participant's record. An item shown and not acknowledged is shown again unchanged on the next read, or the change is named, whatever caused it.",
    "3. **Quiet, partial, unavailable and withheld are different.** Each section says which it is, with its count and limit. A section that could not be read, or is not shown, has a null count, never 0. A section listed on one read is listed on the next.",
    "4. **The caller keeps the cursor.** The view hands back a cursor. Presenting it returns the full view again, plus a list naming what differs. A cursor the host does not accept is refused with a Surface problem with code `cursor_not_accepted` and a next action back to the view. It is never answered with a view.",
    "5. **Every document is dated.** `as_of` says when it was made. `valid_until` says until when the host stands by it. Neither is compared with a request time: a document past `valid_until` when requested still passes.",
    "6. **Reading creates no obligation.** No reply is expected. Recorded obligations sit in exactly one section of that kind; `owed_to` and `due_at` are set nowhere else.",
    "7. **Each document says what it does not establish.**",
    "A field whose presence is itself a rule (`as_of`, `valid_until`, `read_effects`, `reply_expected`, `read_creates_obligation`) can be `null`, meaning not stated, and `not_established` can be empty. The document stays schema-valid; only that rule is unmet.",
  ],
  "## The two documents": [
    "Hrefs are absolute, as in Surface 0.1, and can carry a query.",
    "**Orientation** ([orientation.schema.json](orientation.schema.json)): `as_of`, `valid_until`, `audience: {basis: \"anyone\"}`, `place: {name, summary, manifest|null}`, `view: {href, credential_kinds, cursor_parameter|null, read_effects}`, `reply_expected`, `not_established`. It has no field about the caller.",
    "**View** ([view.schema.json](view.schema.json)): `as_of`, `valid_until`, `audience: {basis: \"credential_presented\", scope, record_set_ref|null}`, `basis: {kind: \"full\"|\"since_cursor\", cursor|null}`, `cursor|null`, `changes`, `sections`, `read_effects: {participant_record_writes: \"none\"|\"some\"|\"unknown\", operational_writes}`, `acknowledgement` (`null` or `{href, position|null}`), `reply_expected`, `read_creates_obligation`, `not_established`.",
    "A **section** is `{id, title, kind: \"recorded_obligations\"|\"other\", scope: \"identity\"|\"project\"|\"mixed\"|\"unknown\"}` plus the envelope `{state, count, limit, items, dropped, unavailable, withheld}`. `changes` is `null`, or the same envelope holding `{section_id, item_id, change: \"added\"|\"changed\"|\"ended\"|\"out_of_window\"}`. An **item** has one shape: `{id, summary, recorded_at|null, acknowledged_at|null, ref|null, owed_to|null, due_at|null}`.",
    "`changes` is a net list: what differs between what the two reads show, not the events between them. `position` says how far acknowledgements under the credential have reached, and moves only when one is made.",
  ],
  "### States": [
    "| State | Items | Count | Other envelope fields |",
    "|---|---|---|---|",
    "| `ok` | 1 to `limit` | `items.length` | all null |",
    "| `quiet` | none | 0 | all null |",
    "| `partial` | 0 to `limit` | see below | `dropped: {count\\|null, reason, deeper_read\\|null}` |",
    "| `unavailable` | none | null | `unavailable: {code}` |",
    "| `withheld` | none | null | `withheld: {code}` |",
    "In a `partial` envelope, a numeric `dropped.count` makes the count an exact total, `items.length + dropped.count`. A null one leaves the count null or a floor above `items.length`. With reason `limit`, `items.length` is `limit`.",
    "A view that breaks this table is still schema-valid; agreement with it is the check `R3.STATES`.",
  ],
  "### What `not_established` means": [
    "It holds tokens. A view that lists a token says it does not establish:",
    "- `reader_sameness`: that whoever reads now made any earlier read;",
    "- `identity_beyond_credential`: who presented the credential, beyond that the host accepted it;",
    "- `completeness_beyond_bounds`: that nothing exists outside the listed sections, limits and counts;",
    "- `instruction_or_authority`: that anything shown instructs the reader or gives authority to act;",
    "- `obligation_binds_reader`: that a listed obligation is valid, or binds whoever reads it;",
    "- `waiver_by_silence`: that not replying or not acknowledging waives or settles anything;",
    "- `other_layers_unrecorded`: what proxies, caches, logs or other layers record about the read.",
    "An orientation that lists a token says it does not establish:",
    "- `anything_about_caller`: anything about who is asking;",
    "- `access_to_view`: that the caller will be given the view.",
  ],
  "## The fixture": [
    "[fixture.schema.json](fixture.schema.json) records up to five exchanges, each optional: `visits.first.{orientation, view_without_credential, view}` and `visits.second.{view, bad_cursor}`.",
    "Each is `{requested_at, request: {method: \"GET\", href, credential: \"none\"|\"presented\", cursor|null}, response: {status, body}}`. `body` is any object or null, so a malformed host document is a failed check, not a broken fixture. There is no slot for headers or for the credential.",
    "No recorder exists. A house could record a fixture by making those five requests in that order, with a credential no one else uses, and keeping each status and parsed body. Where the orientation names no cursor parameter, the fifth is not made. `origin` is `hand_written`, `host_bytes` (each body as parsed, none altered) or `projected_by_recorder` (reshaped; no value changed and none added). `between_visits.acknowledged_by_recorder` is the recorder's own statement: `no`, `yes` or `not_stated`. The second view can be a plain repeat read with no cursor, but `checks_passed` needs the first view's cursor there, all five exchanges, that `no`, an unacknowledged item that comes back equal, and a named difference.",
    "\"Second visit\" means a later read. Nothing in a fixture establishes that one reader made both reads, or that time passed between them.",
  ],
  "## Checks and result": [
    "`node arrival/0.1/check.mjs <fixture.json> [--json]` reads that file and its own three schemas, and contacts nothing. It exits 0 for `checks_passed`, 1 for `check_failed` or `indeterminate`, 2 for misuse. [result.schema.json](result.schema.json) fixes twenty checks, in this order, and how the result word follows from them.",
    "*Served*: status 200. *Valid*: served, with a body that matches its schema; `format` is asserted, so a `date-time` is a real time and a `uri` parses as a URL (WHATWG), as in Surface's checker. *View address*: the href every request but the orientation's shares. *Equal*: the same JSON once object keys are sorted. *Whole*: state `ok` or `quiet`; a null `changes` is not whole.",
    "| Check | Fails when | Unknown when |",
    "|---|---|---|",
    "| `I.SIZE` | never | over 262,144 bytes; nothing is parsed |",
    "| `I.UTF8` | a byte-order mark, or invalid UTF-8 | |",
    "| `I.JSON` | not one JSON value, a repeated key, or nesting over 64 | |",
    "| `I.SHAPE` | the fixture does not match its schema | |",
    "| `I.NO_CREDENTIAL` | a string or field name has a secret shape; an address, in an address field or inside other text, has userinfo, or a query or fragment pair with a credential-named key and a value; an address in an address field does not parse. The name alone decides: `token=USDC` fails. A fragment with no such pair passes unless it has a secret shape. Cursors and `position` are not read; `fixtures/cases.json` gives the shapes, fields and names. A tripwire, not a guarantee | |",
    "| `I.RECORD` | a credential or cursor on the first two requests; no credential on one of the other three; a cursor on the first view request, or none on the bad-cursor one; the view requests not sharing one href, or the orientation having it; `requested_at` going back in slot order; a second-read cursor when a recorded first view was not served, or other than the one it handed back; a bad cursor a recorded view handed back | |",
    "| `R1.ORIENTATION` | status not 200; body not valid, or over its ceiling; `view.href` not the view address | 5xx |",
    "| `R1.REFUSAL` | status not 4xx; body not a Surface problem with that status; code not `credential_required`; terminal; first next action not the orientation's href | 5xx; no orientation recorded |",
    "| `R1.VIEW` | a served view is not valid, is over its ceiling, or repeats a section id, or an item id in one section | no view served |",
    "| `P.PAIR` | never | a view not served; `audience` not equal |",
    "| `R2.DECLARED_EFFECTS` | a valid document's declaration is null (`not_stated`) or says `some`; two differ, the order of `operational_writes` aside | one says `unknown` |",
    "| `R2.SHOWN_AGAIN` | `position` differs, or an item in one section on both reads has another `acknowledged_at` (`acknowledgement_moved`); an owned difference is unnamed and decidable while `changes` is whole | the recorder does not say `no` (nothing else is read); an owned difference is unnamed, and undecidable or `changes` not whole; no unacknowledged item came back equal (`not_exercised`) |",
    "| `R3.STATES` | an envelope in a valid view breaks the state table | |",
    "| `R3.SECTIONS_KEPT` | a first-read section is missing on the second read, or its kind or scope differs | |",
    "| `R4.CURSOR` | a valid view's cursor is null; a read with no cursor is not `full`, or has a basis cursor or `changes` | |",
    "| `R4.CHANGES` | the basis is not `since_cursor` with the cursor presented; `changes` is null; an entry names a section in neither view, or contradicts the views; an owned decidable difference is unnamed while `changes` is whole | `changes` is unavailable or withheld, or partial with an owned difference unnamed; no decidable difference was found and named (`not_exercised`) |",
    "| `R4.BAD_CURSOR` | as `R1.REFUSAL`, with code `cursor_not_accepted` and any next action at the view address | 5xx |",
    "| `R5.FRESHNESS` | a valid document's `as_of` or `valid_until` is null, or `valid_until` is before `as_of`; `P.PAIR` passed and the second view is dated before the first | |",
    "| `R6.NO_OBLIGATION` | a valid document's `reply_expected` or `read_creates_obligation` is not false; a view lacks exactly one `recorded_obligations` section, or sets `owed_to` or `due_at` outside it | |",
    "| `R7.NON_CLAIMS` | a valid document lacks a token above | |",
    "A check is `not_run` when an earlier `I` check other than `I.NO_CREDENTIAL` did not pass, or when what it reads is absent: an exchange; a served document, or for `R3.STATES` and `R4.CURSOR` a served view; for `P.PAIR`, both views recorded and `R1.VIEW` passed; for `R2.SHOWN_AGAIN`, `R3.SECTIONS_KEPT` and `R4.CHANGES`, `P.PAIR` passed and, for the last, a cursor on the second request. A served body that is not valid fails its `R1` check and is not read further: each later check that reads valid documents or valid views of its kind is then `unknown` (`document_not_read`). A failure outranks an unknown.",
    "In a section on both reads, an item *differs* (on both, not equal), is *gone* (first only) or is *new* (second only). Differs is always decidable; gone when the second-read section is whole; new when the first-read one is. `R2.SHOWN_AGAIN` owns differs and gone for items unacknowledged on the first read; `R4.CHANGES` owns the rest. `changed` names differs; `ended` or `out_of_window`, gone; `added`, new. An entry contradicts the views when it says `added` for an item on the first read; `changed` for an equal one; `ended` or `out_of_window` for one on the second read; `out_of_window` where the second-read section is not `partial`; anything but `added` for an item absent from a whole first-read section; or `added` or `changed` for one absent from a whole second-read section.",
    "A result says, per check, whether the exchanges in the fixture agree with that check. Beyond the fixture's origin word, it copies no value from the fixture. It establishes none of the ten lines the schema fixes under `not_established`, which every result repeats. Among them: that a host sent the exchanges or behaves so now; and conformance, authority, consent, safety or a caller's inner state.",
    // The two counts are the ones in cases.json, so this line is true or the test fails.
    `\`fixtures/cases.json\` holds ${cases.cases.length} cases, each a list of edits to the example with the outcome expected for every check, and ${cases.built.length} more built from recipes.`,
  ],
  "## Beside Surface, Work and Covenant": [
    "- [Surface 0.1](../../surface/0.1/README.md) tests a public service with no credential, and says a pass is no proof of continuity. Arrival reuses its problem shape and href pattern and changes nothing in it. An Arrival result is not a Surface result.",
    "- [Work 0.1](../../work/0.1/README.md) records one finite piece of work. Arrival's result is modelled on Work's, with its own result words; its timestamp form is Work's.",
    "- [Covenant 0.1](../../covenant/0.1/README.md) states host duties. Arrival is not an adoption, and is not evidence for one. The tokens `waiver_by_silence`, `other_layers_unrecorded` and `identity_beyond_credential` cover ground that the duties `rest.silence-is-not-consent`, `privacy.no-cross-layer-overclaim` and `identity.credentials-are-bounded` also cover. Arrival tests no duty.",
    "Text, schemas and fixtures are CC BY-SA 4.0 and `check.mjs` is MPL 2.0, by the defaults in [LICENSES.md](../../LICENSES.md), which does not yet name this directory.",
  ],
  "## Outside Arrival 0.1": [
    "A recorder. An endpoint. How a credential is presented, protection against replay, and signatures. Headers and content negotiation. The acknowledgement itself: only its address and position are shown. Answers that carry only the changes, or say nothing changed. Next actions inside the view, and typed values such as a balance. A record carried from one host to another. Any normative, release, or adoption-evidence claim.",
  ],
  "## Open questions": [
    "- `changes` annotates a full view. It does not make a return visit cheaper, which the root README's delta pattern asks for.",
    "- Is one code enough for a cursor that is malformed, expired, or issued under another credential? Is a fixed code word, first among the next actions, the right test of a refusal that leads back to the orientation?",
    "- Does `withheld` say too much, by naming a section the credential cannot see?",
    "- `audience.scope` and `record_set_ref` are the host's own account. Nothing checks that they are true. Is `project` the right word for a host with another unit of tenancy?",
    "- Is deep equality the right meaning of \"shown again unchanged\" for a host whose items carry derived fields?",
    "- A mark with no time has no form: a null `acknowledged_at` reads as not acknowledged. The orientation's pointer to the view has no \"not stated\" form either.",
  ],
  "## Exit gate (declared, unmet)": [
    "This draft does not leave draft status before a second implementation, written without reading `check.mjs`, reproduces the result word and all twenty outcomes for the example and every case in `fixtures/cases.json`. No such implementation exists. Meeting the gate would not make this a release; that is a separate maintainer decision.",
  ],
};

test("the README is held whole: its first lines, its headings in order, and every block under each heading", () => {
  assert.ok(
    readme.startsWith("<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->\n\n# XENIA Arrival 0.1\n\nStatus: "),
    "the README begins with its licence line, its title and its status",
  );
  assert.deepEqual(readme.match(/^#{1,6} .*$/gm), README_HEADINGS, "the headings, in order");
  // Every heading has its blocks listed here, except the bounds table.
  assert.deepEqual(Object.keys(README_PINNED), README_HEADINGS.filter((heading) => heading !== "### Bounds"));
  for (const [heading, expected] of Object.entries(README_PINNED)) {
    assert.deepEqual(blocksOf(readmeSection(heading)), expected, `README section ${heading}`);
  }
  // Nothing but white space stands between the blocks: put back together,
  // the headings and the blocks under them are the README.
  const flat = (value) => value.replace(/\s+/g, " ").trim();
  const whole = README_HEADINGS.flatMap((heading) => [heading, ...blocksOf(readmeSection(heading))]);
  assert.equal(flat(`<!-- SPDX-License-Identifier: CC-BY-SA-4.0 --> ${whole.join(" ")}`), flat(readme));
});

test("the README's check table, state table, token lines and Covenant duties are the checker's, the schemas' and Covenant's", () => {
  // The check table has one row for each check, in result order.
  const rows = README_PINNED["## Checks and result"].filter((block) => block.startsWith("| `"));
  assert.deepEqual(rows.map((row) => /^\| `([^`]+)` \|/.exec(row)[1]), CHECK_IDS);
  // The state table has one row for each state, in schema order.
  const states = README_PINNED["### States"].filter((block) => block.startsWith("| `"));
  assert.deepEqual(states.map((row) => /^\| `([^`]+)` \|/.exec(row)[1]), STATES);
  // The token lines are the schemas' tokens, in schema order.
  const tokens = README_PINNED["### What `not_established` means"].filter((block) => block.startsWith("- `"));
  assert.deepEqual(tokens.map((line) => /^- `([^`]+)`:/.exec(line)[1]), [...VIEW_TOKENS, ...ORIENTATION_TOKENS]);

  // The duties the Covenant line names are duties of Covenant 0.1.
  const covenant = text("covenant/0.1/covenant.json", root);
  const named = README_PINNED["## Beside Surface, Work and Covenant"].join(" ").match(/`[a-z]+\.[a-z]+(?:-[a-z]+)+`/g);
  assert.deepEqual(named, ["`rest.silence-is-not-consent`", "`privacy.no-cross-layer-overclaim`", "`identity.credentials-are-bounded`"]);
  for (const id of named) assert.ok(covenant.includes(`"id": "${id.slice(1, -1)}"`), `${id} is a Covenant 0.1 duty`);
});

test("the README's bounds are the bounds the schemas and the checker hold", () => {
  const { view, orientation } = schemas;
  const writes = view.$defs.read_effects.properties.operational_writes;
  const section = view.$defs.section.properties;
  const item = view.$defs.item.properties;
  const place = orientation.properties.place.properties;
  const grouped = (value) => value.toLocaleString("en-US");
  // Every text bound on one row is the same bound in the schema.
  for (const node of [item.summary, place.summary]) assert.deepEqual([node.minLength, node.maxLength], [1, 300]);
  for (const node of [section.title, place.name, item.owed_to.anyOf[0], writes.items]) {
    assert.deepEqual([node.minLength, node.maxLength], [1, 120]);
  }
  assert.equal(view.$defs.limit.maximum, section.items.maxItems, "a limit cannot be above the items a section can list");
  assert.equal(writes.minItems, undefined, "no operational write is a valid declaration");
  assert.deepEqual(blocksOf(readmeSection("### Bounds")), [
    "| What | Bound |",
    "|---|---|",
    `| sections; \`operational_writes\` | ${view.properties.sections.minItems} to ${view.properties.sections.maxItems}; 0 to ${writes.maxItems} entries |`,
    `| envelope \`limit\`; items listed | ${view.$defs.limit.minimum} to ${view.$defs.limit.maximum}; 0 to ${section.items.maxItems} |`,
    `| \`summary\`, \`place.summary\` | ${item.summary.minLength} to ${item.summary.maxLength} characters |`,
    `| \`title\`, \`place.name\`, \`owed_to\`, each operational write | ${section.title.minLength} to ${section.title.maxLength} characters |`,
    `| cursor; href | ${view.$defs.cursor.minLength} to ${view.$defs.cursor.maxLength}; up to ${view.$defs.href.maxLength} characters |`,
    `| fixture file | ${grouped(MAX_INPUT_BYTES)} bytes |`,
    `| view; orientation | ${grouped(MAX_VIEW_BYTES)}; ${grouped(MAX_ORIENTATION_BYTES)} bytes |`,
    "The last row measures a body written again as UTF-8 JSON with no white space and no optional escape, not bytes on the wire. No schema states it.",
  ]);
});

test("what the README says a recorder does at a house with no cursor, and with a partial list, is what the checker does", () => {
  const flat = readme.replace(/\s+/g, " ");
  assert.match(flat, /Where the orientation names no cursor parameter, the fifth is not made\./);
  const byId = Object.fromEntries(cases.cases.map((entry) => [entry.id, entry]));
  const house = byId["repeat-read-house-without-cursors"];
  assert.equal(applyEdits(example, house.edits).visits.first.orientation.response.body.view.cursor_parameter, null);
  assert.equal(expectedOutcomes(house)["R4.BAD_CURSOR"], "not_run");

  assert.match(flat, /A null one leaves the count null or a floor above `items\.length`\. With reason `limit`, `items\.length` is `limit`\./);
  assert.equal(expectedOutcomes(byId["state-partial-floor-equal-to-items"])["R3.STATES"], "fail");
  assert.equal(expectedOutcomes(byId["state-partial-limit-reason-with-room"])["R3.STATES"], "fail");

  assert.match(flat, /`changes` is a net list: what differs between what the two reads show, not the events between them\./);
  assert.equal(expectedOutcomes(byId["changes-listed-as-events"])["R4.CHANGES"], "fail");
  assert.match(flat, /`position` says how far acknowledgements under the credential have reached, and moves only when one is made\./);
  assert.equal(expectedOutcomes(byId["shown-again-position-moved"])["R2.SHOWN_AGAIN"], "fail");

  assert.match(flat, /`origin` is `hand_written`, `host_bytes` \(each body as parsed, none altered\) or `projected_by_recorder` \(reshaped; no value changed and none added\)\./);
});
