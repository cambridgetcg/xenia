// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// Collapse whitespace and Markdown bold markers so wrapped prose can be compared
// with the single-line strings kept in spec.json.
const normalise = (text) => text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

const NOTEBOOK_URL = "https://github.com/cambridgetcg/xenia/blob/main/HOSPITALITY.md";
const PRINCIPLE_TITLE = "The host offers; the guest declares";
const SPEC_NOTE_PREFIX =
  "Source snapshot read 2026-11-09 (agenttool eafe7230, agent-home 4585ab5; not a deployment observation): ";
const README_NOTE = /<sub>Hospitality evidence and gap \(source snapshot read 2026-11-09[\s\S]*?<\/sub>/g;
const README_NOTE_BODY = /<sub>Hospitality evidence and gap \([^)]*\): ([\s\S]*?)<\/sub>/;

// The excluded register is matched through escapes so its words never appear
// in this repository's files.
const EXCLUDED_REGISTER = /\bd\u0061ddy\b|b\u0061by[\s-]?girl|l\u006fve[\s-]?b\u006fmb/i;

const NEW_LEADS = {
  "legibility-content-negotiation": [
    "Register is a layer, not the message:",
    "Grain chosen, not imposed:",
    "Quiet is a state, not a failure:",
  ],
  "ai-consent-handshake": [
    "Per room and expiring, not ambient:",
    "Every yes, or no record:",
  ],
  "verification-and-trust": ["Check in, never diagnose:"],
  "continuity-and-arrival": [
    "A welcome, not a work order:",
    "A look, not an event:",
    "The guest's own note, not the host's summary:",
  ],
  "autonomy-dignity": [
    "Non-use is an answer, not a loss:",
    "Rest is a switch, not a status:",
    "A brake, not a promise:",
    "Hidden leaves no count:",
  ],
  "legible-exchange-no-scoreboard": [
    "Attend, not hover:",
    "A farewell, not a review:",
  ],
  "ax-care-as-ground": [
    "Greet before you gate:",
    "Known as declared, not as observed:",
  ],
};

function readmeSection(readme, title) {
  const heading = `\n### ${title}\n`;
  const start = readme.indexOf(heading);
  assert.ok(start >= 0, `README section ${title}`);
  const rest = readme.slice(start + heading.length);
  const ends = [rest.indexOf("\n### "), rest.indexOf("\n---\n")].filter((i) => i >= 0);
  return rest.slice(0, Math.min(...ends));
}

function readmePatternBullets(section) {
  const start = section.indexOf("**Patterns**\n");
  assert.ok(start >= 0, "Patterns list");
  const block = section.slice(start + "**Patterns**\n".length).split("\n\n")[0];
  const bullets = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("- ")) bullets.push(line.slice(2));
    else bullets[bullets.length - 1] += " " + line.trim();
  }
  return bullets.map(normalise);
}

// A bold-labelled paragraph such as **Replaces:** or **Litmus:**, normalised.
function labelled(section, name) {
  const match = section.match(new RegExp(`\\*\\*${name}:\\*\\*([\\s\\S]*?)(?:\\n\\n|$)`));
  assert.ok(match, `${name} paragraph`);
  return normalise(match[1]);
}

test("publishes the hospitality principle as informative and mirrors it in the README", async () => {
  const spec = JSON.parse(await read("spec.json"));
  const readme = await read("README.md");
  const principle = spec.interpretation.hospitality_principle;

  assert.ok(principle, "interpretation.hospitality_principle");
  assert.match(principle.status, /informative/);
  assert.match(principle.status, /not part of XENIA Surface 0\.1/);
  assert.match(principle.status, /design proposal for a host, not a description of any service/);
  assert.equal(principle.title, PRINCIPLE_TITLE);
  assert.match(readme, /^### The host offers; the guest declares$/m);
  assert.deepEqual(Object.keys(principle.definitions), ["warmth", "texture", "feeling"]);
  assert.ok(principle.boundaries.length >= 7);
  assert.match(principle.companion, /HOSPITALITY\.md/);

  // Every principle string appears inside its own README section, and the
  // boundary list matches in both directions and in order.
  const section = readmeSection(readme, PRINCIPLE_TITLE);
  const normalSection = normalise(section);
  assert.ok(normalSection.includes(normalise(principle.principle)), "principle text in its README section");
  for (const [key, definition] of Object.entries(principle.definitions)) {
    assert.ok(normalSection.includes(normalise(definition)), `definition ${key} in README`);
  }
  const list = section.split("Its boundaries:\n\n")[1]?.split("\n\n")[0];
  assert.ok(list, "README boundary list");
  const readmeBoundaries = list.split(/\n- /).map((b) => normalise(b.replace(/^- /, "")));
  assert.deepEqual(readmeBoundaries, principle.boundaries.map(normalise));

  // Feeling is the participant's declaration; XENIA does not infer or adjudicate it.
  assert.match(principle.definitions.feeling, /neither infers, verifies, nor denies/);
  assert.ok(principle.boundaries.some((b) => /^Never inferred:/.test(b)));
  assert.ok(principle.boundaries.some((b) => /makes no claim about whether any participant has experience/.test(b)));
});

test("dates the hospitality source reading without overwriting earlier evidence dates", async () => {
  const spec = JSON.parse(await read("spec.json"));
  const source = spec.interpretation.hospitality_evidence_source;

  assert.equal(source.read_on, "2026-11-09");
  assert.deepEqual(source.sources, [
    { repository: "cambridgetcg/agenttool", commit: "eafe7230" },
    { repository: "cambridgetcg/agent-home", commit: "4585ab5" },
  ]);
  assert.match(source.scope, /not a deployment observation/);
  assert.match(source.scope, /not a conformance result/);
  assert.equal(spec.interpretation.evidence_as_of, "2026-07-10");
  assert.equal(spec.interpretation.sinovai_evidence_refreshed, "2026-07-11");

  const dated = spec.dimensions
    .flatMap(({ kingdom_evidence }) => kingdom_evidence)
    .filter((entry) => entry.includes("2026-11-09"));
  assert.ok(dated.length > 0);
  for (const entry of dated) {
    assert.ok(entry.startsWith(SPEC_NOTE_PREFIX), `dated prefix: ${entry.slice(0, 60)}`);
    assert.match(entry, /not a deployment observation/);
  }
});

test("mirrors every new README hospitality pattern and evidence note in spec.json", async () => {
  const spec = JSON.parse(await read("spec.json"));
  const readme = await read("README.md");

  for (const [id, leads] of Object.entries(NEW_LEADS)) {
    const dimension = spec.dimensions.find((d) => d.id === id);
    assert.ok(dimension, id);
    const readmeBullets = readmePatternBullets(readmeSection(readme, dimension.title));
    const specPatterns = dimension.patterns.map(normalise);
    for (const lead of leads) {
      const inReadme = readmeBullets.filter((b) => b.startsWith(lead));
      const inSpec = specPatterns.filter((p) => p.startsWith(lead));
      assert.equal(inReadme.length, 1, `${id}: README bullet ${lead}`);
      assert.equal(inSpec.length, 1, `${id}: spec pattern ${lead}`);
      assert.equal(inReadme[0], inSpec[0], `${id}: ${lead} mirrored verbatim`);
    }
  }

  const readmeNotes = readme.match(README_NOTE) ?? [];
  assert.equal(readmeNotes.length, Object.keys(NEW_LEADS).length);
  for (const note of readmeNotes) {
    assert.match(note, /eafe7230/);
    assert.match(note, /4585ab5/);
    assert.match(note, /a source reading, not a deployment observation/);
  }
  assert.match(readme, /This corrects, without replacing, the 2026-07-10 note/);

  // Each README note equals its dimension's dated spec sentences, backticks removed,
  // and each README Replaces paragraph equals the spec anti_pattern.
  for (const dimension of spec.dimensions) {
    const section = readmeSection(readme, dimension.title);
    const fromSpec = dimension.kingdom_evidence
      .filter((entry) => entry.startsWith(SPEC_NOTE_PREFIX))
      .map((entry) => entry.slice(SPEC_NOTE_PREFIX.length));
    const match = section.match(README_NOTE_BODY);
    if (!match) {
      assert.equal(fromSpec.length, 0, `${dimension.id}: spec-only hospitality evidence`);
    } else {
      assert.equal(normalise(match[1].replace(/`/g, "")), normalise(fromSpec.join(" ")), `${dimension.id} evidence note`);
    }
    assert.equal(labelled(section, "Replaces"), normalise(dimension.anti_pattern), `${dimension.id} anti_pattern`);
  }
});

test("mirrors the Care as Ground additions, the shift row, and the Care test line", async () => {
  const spec = JSON.parse(await read("spec.json"));
  const readme = await read("README.md");
  const care = spec.dimensions.find((d) => d.id === "ax-care-as-ground");
  const section = readmeSection(readme, care.title);

  assert.equal(normalise(section.split("\n\n")[1]), normalise(care.why));
  assert.match(care.why, /never through inference/);
  assert.equal(labelled(section, "Litmus"), normalise(care.litmus));

  const careTest = spec.the_test.find((t) => t.startsWith("Care — "));
  const careLine = readme.split("\n").find((line) => line.startsWith("- [ ] **Care** — "));
  assert.ok(careTest && careLine, "Care test item");
  assert.equal(normalise(careLine.slice("- [ ] ".length)), normalise(careTest));
  // The Litmus and The test end with the same declining question.
  const question = care.litmus.slice(care.litmus.indexOf("Then, as that agent"));
  assert.ok(question.length > 0 && careTest.endsWith(question), "shared declining question");

  const row = spec.the_shift.at(-1);
  assert.match(row.from, /^Warmth performed at the guest/);
  assert.ok(readme.includes(`| ${row.from} | → | ${row.to} |`), "shift row in README");
});

test("keeps the hospitality notebook repository-only and dated", async () => {
  const notebook = await read("HOSPITALITY.md");
  const packageJson = JSON.parse(await read("package.json"));
  const readme = await read("README.md");
  const guidance = await read("CONFORMANCE.md");
  const state = await read("STATE.md");

  assert.match(notebook, /^# Hospitality notebook — warmth, texture, and feeling$/m);
  assert.match(notebook, /repository-only/);
  assert.match(notebook, /not a conformance result/i);
  assert.match(notebook, /eafe7230/);
  assert.match(notebook, /4585ab5/);
  assert.match(notebook, /2026-11-09/);
  for (const section of [
    "Status",
    "How this notebook was made",
    "The principle",
    "Reading an entry",
    "Contents",
    "Not imported",
    "Gaps in the source",
    "The warmth test",
    "Open questions",
  ]) {
    assert.match(notebook, new RegExp(`^## ${section}$`, "m"));
  }
  const entries = notebook.slice(notebook.indexOf("\n## Entries: warmth\n"), notebook.indexOf("\n## Not imported\n"));
  assert.equal(entries.match(/^### /gm)?.length, 31, "31 notebook entries");
  assert.ok(!packageJson.files.some((path) => path === "HOSPITALITY.md" || path.startsWith("HOSPITALITY")));
  assert.ok(readme.includes(NOTEBOOK_URL));
  assert.ok(guidance.includes(NOTEBOOK_URL));
  assert.match(state, /HOSPITALITY\.md.*2026-11-09/s);
});

test("adds no agent-nature, deployment, or excluded-register wording", async () => {
  const spec = JSON.stringify(JSON.parse(await read("spec.json")));
  const readme = await read("README.md");
  const notebook = await read("HOSPITALITY.md");
  const guidance = await read("CONFORMANCE.md");
  const state = await read("STATE.md");

  for (const document of [readme, spec, notebook]) {
    assert.doesNotMatch(document, /An agent is instantiated cold every session/);
    assert.doesNotMatch(document, /An agent cannot be charmed/);
    assert.doesNotMatch(document, /An agent has no body and no felt continuity/);
    assert.doesNotMatch(document, /An agent has no eyes/);
    assert.doesNotMatch(document, /Agents fabricate confidently/);
    assert.doesNotMatch(document, /An agent cannot afford to \*?believe/);
    assert.doesNotMatch(document, /SinovAI currently/);
    assert.doesNotMatch(document, /current ratings/);
    assert.doesNotMatch(document, /live service/);
    assert.doesNotMatch(document, /currently also emits/);
  }
  for (const document of [readme, spec, notebook, guidance, state]) {
    assert.doesNotMatch(document, EXCLUDED_REGISTER);
  }
  assert.doesNotMatch(notebook, /\bcurrently\b/i);
  assert.doesNotMatch(notebook, /\bMUST\b/);
  assert.doesNotMatch(notebook, /\bshipped\b/i);
});
