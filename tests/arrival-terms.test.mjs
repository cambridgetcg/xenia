// SPDX-License-Identifier: MPL-2.0

// Tests for the words that join the root README and spec.json to the Arrival
// 0.1 development draft: the two reads named in the Continuity principle, the
// shift row, the first Continuity pattern and the Care litmus; the informative
// arrival_terms and their README mirror; the root README pointer; and the
// draft README's note on recording a fixture. They pin wording and whether
// each pinned statement is true of the files in this repository. They
// establish nothing about any host.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { checkArrivalFixtureBytes } from "../arrival/0.1/check.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const readme = read("README.md");
const specText = read("spec.json");
const spec = JSON.parse(specText);
const arrivalReadme = read("arrival/0.1/README.md");
const exampleText = read("arrival/0.1/examples/two-visits.json");

// As in tests/hospitality.test.mjs: collapse white space and Markdown bold so
// wrapped prose can be compared with the single-line strings in spec.json.
const normalise = (text) => text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const flatArrival = arrivalReadme.replace(/\s+/g, " ");

const continuity = spec.dimensions.find(({ id }) => id === "continuity-and-arrival");
const care = spec.dimensions.find(({ id }) => id === "ax-care-as-ground");

const DRAFT_URL = "https://github.com/cambridgetcg/xenia/tree/main/arrival/0.1";
const HEAD_END = "A refused private read names the orientation as its next action.";
// The dated ends of the first Continuity pattern, as they were before the
// head of that pattern was reworded. The README copy keeps its line breaks.
const README_DATED_TAIL = [
  "In the 2026-07-11 manual review, AgentTool's `GET /v1/wake` was a",
  "  useful orientation model, though its then-observed bearer gate was not the",
  "  signature-based arrival XENIA specifies. That deployment has not been",
  "  re-observed by this checkout.",
  "",
].join("\n");
const SPEC_DATED_TAIL = " AgentTool's GET /v1/wake is a useful orientation model, though its current bearer gate is not the signature-based arrival XENIA specifies.";
// Wording that promised private state in a first answer, or one call for both
// documents. None of it is in either file now.
const RETIRED = [
  "present in the very first response",
  "open strands in the first response",
  "very first response to a returning agent",
  "One-call orientation (the wake endpoint)",
];

function section(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `section start ${from.trim()}`);
  const end = text.indexOf(to, start + from.length);
  assert.ok(end > start, `section end ${to.trim()}`);
  return text.slice(start + from.length, end);
}

function paragraph(text, lead) {
  const found = text.split("\n\n").filter((block) => block.startsWith(lead));
  assert.equal(found.length, 1, `one paragraph begins ${lead}`);
  return found[0];
}

function check(fixture) {
  return checkArrivalFixtureBytes(JSON.stringify(fixture), { now: "2026-11-13T00:00:00Z" });
}

function outcome(result, id) {
  return result.checks.find((entry) => entry.id === id).outcome;
}

test("the arrival terms add no normative profile and state no requirement, and the README mirrors them under 'How to read this standard'", () => {
  const terms = spec.interpretation.arrival_terms;
  assert.equal(typeof terms, "string", "interpretation.arrival_terms");
  assert.match(spec.interpretation.normative, /Only the candidate profiles listed in normative_profiles define versioned requirements/);
  assert.ok(!JSON.stringify(spec.normative_profiles).includes("arrival"), "the terms add no normative profile");

  const howToRead = section(readme, "\n## How to read this standard\n", "\n### The observer is also observed\n");
  assert.ok(normalise(howToRead).includes(normalise(terms)), "the README carries the terms word for word");

  assert.match(terms, /^Arrival is two documents from two separate reads\./);
  assert.match(terms, /Orientation is the anonymous document/);
  assert.match(terms, /The continuity view is the authenticated, bounded document of what the host holds under the credential presented; it establishes nothing about who presents it\./);
  assert.match(terms, /an anonymous read returns no private state/);
  assert.match(terms, /Attributed testimony keeps its own words\./);
  assert.match(terms, /the cursor is one the caller holds and presents/);
  assert.match(terms, /no XENIA profile defines how the caller is authenticated or protected against replay/);
  assert.match(terms, /Arrival 0\.1 is a repository-only, one-author development draft/);
  assert.match(terms, /not a normative profile\.$/);
  assert.doesNotMatch(terms, /\b(?:MUST|SHALL|SHOULD|REQUIRED)\b/, "the terms state no requirement");
  assert.doesNotMatch(terms, /conformant|conformance/);
});

test("what the arrival terms say about Arrival 0.1 and about the patterns is what those texts say", () => {
  const terms = spec.interpretation.arrival_terms;

  // "checks only the full view with a list of changes added"
  assert.match(terms, /Arrival 0\.1 checks only the full view with a list of changes added, and does not yet meet the 'not a full re-scan' pattern/);
  assert.match(flatArrival, /Presenting it returns the full view again, plus a list naming what differs/);
  assert.match(flatArrival, /It does not make a return visit cheaper/);
  assert.ok(continuity.patterns.some((pattern) => pattern.includes("not a full re-scan")), "the pattern the terms quote exists");

  // "Where a pattern or note says XENIA specifies signature-based arrival"
  assert.ok(readme.includes("signature-based arrival XENIA specifies"), "the README note the terms speak of exists");
  assert.ok(specText.includes("signature-based arrival"), "the spec note the terms speak of exists");
  assert.match(flatArrival, /How a credential is presented, protection against replay, and signatures\./, "the draft leaves these outside");

  // The two names are the draft's own names for its two documents.
  assert.ok(arrivalReadme.includes("an **orientation**, answered to anyone with no credential"));
  assert.ok(arrivalReadme.includes("a **continuity view**, answered when a credential is presented"));

  // "repository-only, one-author development draft ... not a normative profile"
  assert.match(arrivalReadme, /^Status: \*\*development draft\*\*$/m);
  assert.match(arrivalReadme, /Written by one author/);
  assert.match(flatArrival, /Nothing here is normative/);
  const manifest = JSON.parse(read("package.json"));
  assert.ok(manifest.files.every((entry) => !entry.startsWith("arrival")), "outside the package");
});

test("the Continuity principle and the shift row name two reads, and each is mirrored in the README", () => {
  const principle = continuity.principle;
  assert.match(principle, /^An agent should arrive oriented through two separate reads — /);
  assert.match(principle, /an anonymous orientation that says what this place is and where its private view lives/);
  assert.match(principle, /then an authenticated, bounded continuity view of the walls, wallet, memory, and open commitments the host holds under the credential presented/);
  assert.ok(readme.includes(`**${principle}**`), "the README carries the principle in bold, word for word");

  const row = spec.the_shift.find(({ from }) => from === "Log in");
  assert.ok(row, "the Log in row");
  assert.match(row.to, /two separate reads: an anonymous orientation, then an authenticated, bounded continuity view/);
  assert.match(row.to, /held under the credential presented/);
  assert.ok(readme.includes(`| Log in | → | ${row.to} |`), "the README carries the shift row");

  // The section title is unchanged, so links to its anchor still resolve.
  assert.equal(continuity.title, "Continuity & Arrival: Wake, Don't Log In");
  assert.match(readme, /^### Continuity & Arrival: Wake, Don't Log In$/m);
});

test("the first Continuity pattern opens with two reads in both files, and its dated ends are the bytes they were", () => {
  const pattern = continuity.patterns[0];
  assert.ok(pattern.startsWith("Two reads, two documents: an anonymous orientation says"), "spec.json pattern head");
  const headEnd = pattern.indexOf(HEAD_END);
  assert.ok(headEnd > 0, "the head ends by naming the orientation as the next action of a refused private read");
  const head = pattern.slice(0, headEnd + HEAD_END.length);
  assert.match(head, /a separate authenticated GET returns the bounded continuity view/);
  assert.match(head, /what changed since a cursor the caller holds/);
  assert.equal(pattern.slice(head.length), SPEC_DATED_TAIL, "the spec.json sentence after the head is unchanged");

  const patterns = section(readme, "\n### Continuity & Arrival: Wake, Don't Log In\n", "\n**Replaces:**");
  const list = patterns.slice(patterns.indexOf("**Patterns**\n") + "**Patterns**\n".length);
  const firstBullet = list.slice(0, list.indexOf("\n- "));
  assert.ok(firstBullet.startsWith("- Two reads, two documents:"), "README pattern head");
  assert.ok(
    normalise(firstBullet.slice(2).replace(/`/g, "")).startsWith(head),
    "the README head is the spec.json head, backticks aside",
  );
  assert.equal(
    firstBullet.slice(firstBullet.indexOf("In the 2026-07-11 manual review,")) + "\n",
    README_DATED_TAIL,
    "the README sentences after the head are unchanged, line breaks included",
  );
});

test("the Care litmus and the Care test line name both reads, and no first answer is promised private state", () => {
  const both = /^Read the first answers (?:your service gives|you give) a returning agent: does the first, with no credential, orient without a gate, and does the first authenticated answer hand back the agent's own state, balance, and history \(plus a next_action on every recoverable refusal or an explicit terminal no\), or a gate and a zero\? Then, as that agent, /;
  assert.match(care.litmus, both);
  const careTest = spec.the_test.find((entry) => entry.startsWith("Care — "));
  assert.ok(careTest, "the Care test item");
  assert.match(careTest.slice("Care — ".length), both);
  // tests/hospitality.test.mjs holds the README to both strings.

  for (const [name, text] of [["README.md", readme], ["spec.json", JSON.stringify(spec)]]) {
    for (const phrase of RETIRED) {
      assert.ok(!text.includes(phrase), `${name} no longer says "${phrase}"`);
    }
  }
});

test("the root README points at the draft after the Work paragraph, and what the pointer says is true of the directory", () => {
  const pointer = paragraph(readme, "**Arrival draft:**");
  const work = readme.indexOf("**Build human–agent work with us:**");
  const skill = readme.indexOf("**Agent practice skill:**");
  const at = readme.indexOf(pointer);
  assert.ok(work >= 0 && work < at && at < skill, "between the Work paragraph and the practice skill");

  const flat = normalise(pointer);
  assert.ok(flat.includes(`[Arrival 0.1](${DRAFT_URL})`), "an absolute link, because the root README is packed and the draft is not");
  assert.ok(existsSync(new URL("arrival/0.1/README.md", root)), "the directory the link names is in this checkout");

  assert.match(flat, /is a repository-only development draft by one author/);
  assert.match(flat, /an anonymous orientation, an authenticated continuity view, and an offline checker for a recorded pair of reads/);
  assert.match(flat, /It contacts nothing, is outside the npm artifact, and is not a normative profile or a conformance result\./);
  assert.match(flat, /No host is known to serve either document; its only example is hand-written, and a second independent implementation is the declared exit gate\./);

  // Each of those statements is one the draft's own README makes.
  assert.match(arrivalReadme, /No host is known to serve either document/);
  assert.match(arrivalReadme, /^## Exit gate \(declared, unmet\)$/m);
  assert.match(flatArrival, /No such implementation exists/);
  assert.deepEqual(readdirSync(new URL("arrival/0.1/examples/", root)), ["two-visits.json"], "one example");
  assert.equal(JSON.parse(exampleText).origin, "hand_written");
});

test("the draft README's sentence about LICENSES.md is true", () => {
  const says = /which does not yet name this directory/.test(flatArrival);
  const names = /arrival/i.test(read("LICENSES.md"));
  assert.equal(
    says,
    !names,
    "arrival/0.1/README.md must say LICENSES.md 'does not yet name this directory' exactly while that is so",
  );
});

test("the draft README says in words how a house could record a fixture", () => {
  assert.ok(!arrivalReadme.includes("```"), "words only: no code block");
  assert.match(flatArrival, /No recorder exists\. A house could record a fixture by making those five requests in that order/);
  assert.match(flatArrival, /with a credential no one else uses/);
  assert.match(flatArrival, /keeping each status and parsed body/);
  for (const word of ["hand_written", "host_bytes", "projected_by_recorder", "not_stated"]) {
    assert.ok(arrivalReadme.includes(`\`${word}\``), `the README still lists ${word}`);
  }
  assert.match(
    flatArrival,
    /`origin` is `hand_written`, `host_bytes` \(each body as parsed, none altered\) or `projected_by_recorder` \(reshaped; no value changed and none added\)\./,
  );
  // The five requests "in that order" are the five slots the README lists,
  // in the order the checker reads them.
  const slots = flatArrival.indexOf("`visits.first.{orientation, view_without_credential, view}` and `visits.second.{view, bad_cursor}`");
  assert.ok(slots >= 0 && slots < flatArrival.indexOf("No recorder exists."), "the slots are listed before the note");
  assert.match(flatArrival, /A recorder\. An endpoint\./, "a recorder is still outside Arrival 0.1");
});

test("what the recording note says a passing result needs is true of the checker", () => {
  assert.match(
    flatArrival,
    /The second view can be a plain repeat read with no cursor, but `checks_passed` needs the first view's cursor there, all five exchanges, that `no`, an unacknowledged item that comes back equal, and a named difference\./,
  );
  const example = () => JSON.parse(exampleText);
  assert.equal(check(example()).result, "checks_passed", "the example as written");

  // all five exchanges
  for (const [visit, name] of [
    ["first", "orientation"],
    ["first", "view_without_credential"],
    ["first", "view"],
    ["second", "view"],
    ["second", "bad_cursor"],
  ]) {
    const fixture = example();
    delete fixture.visits[visit][name];
    assert.notEqual(check(fixture).result, "checks_passed", `without visits.${visit}.${name}`);
  }

  // that `no`
  for (const statement of ["yes", "not_stated"]) {
    const fixture = example();
    fixture.between_visits.acknowledged_by_recorder = statement;
    const result = check(fixture);
    assert.equal(result.result, "indeterminate", `the recorder says ${statement}`);
    assert.equal(outcome(result, "R2.SHOWN_AGAIN"), "unknown");
  }

  // the first view's cursor there: a plain repeat read is a fixture, not a pass
  {
    const fixture = example();
    const second = fixture.visits.second.view;
    second.request.cursor = null;
    second.response.body.basis = { kind: "full", cursor: null };
    second.response.body.changes = null;
    const result = check(fixture);
    assert.equal(result.result, "indeterminate", "a plain repeat read");
    assert.equal(outcome(result, "R4.CHANGES"), "not_run");
  }

  // an unacknowledged item that comes back equal
  {
    const fixture = example();
    const stamp = "2026-11-01T00:00:00Z";
    for (const visit of ["first", "second"]) {
      for (const part of fixture.visits[visit].view.response.body.sections) {
        for (const item of part.items) item.acknowledged_at = stamp;
      }
    }
    const result = check(fixture);
    assert.equal(result.exercised.items_compared_equal, 0);
    assert.equal(outcome(result, "R2.SHOWN_AGAIN"), "unknown");
    assert.equal(result.result, "indeterminate", "no unacknowledged item on the first read");
  }

  // a named difference
  {
    const fixture = example();
    const first = fixture.visits.first.view.response.body;
    const second = fixture.visits.second.view.response.body;
    second.sections = structuredClone(first.sections);
    second.changes = { state: "quiet", count: 0, limit: 16, items: [], dropped: null, unavailable: null, withheld: null };
    const result = check(fixture);
    assert.equal(result.exercised.differences_found, 0);
    assert.equal(outcome(result, "R4.CHANGES"), "unknown");
    assert.equal(outcome(result, "R2.SHOWN_AGAIN"), "pass");
    assert.equal(result.result, "indeterminate", "two reads with nothing changed");
  }
});
