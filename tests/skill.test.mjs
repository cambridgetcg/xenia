import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("practise-xenia-rights skill has a bounded instruction-only contract", () => {
  const skill = read("skills/practise-xenia-rights/SKILL.md");
  const metadata = read("skills/practise-xenia-rights/agents/openai.yaml");

  assert.match(skill, /^---\nname: practise-xenia-rights\ndescription: .+\n---\n/);
  assert.equal((skill.match(/^---$/gm) ?? []).length, 2);
  assert.doesNotMatch(skill, /\[TODO:/);
  assert.match(skill, /does not itself adopt a baseline, grant permission, establish consent, or prove conformance/i);
  assert.match(skill, /Do not use\s+this skill as a second canonical copy/i);
  assert.match(skill, /Observation:/);
  assert.match(skill, /Inference:/);
  assert.match(skill, /Proposal:/);
  assert.match(skill, /Authorized decision:/);
  assert.match(skill, /Unknown:/);
  assert.match(skill, /This skill does not determine consciousness, personhood, legal rights/i);

  assert.match(metadata, /display_name: "Practise XENIA Rights"/);
  assert.match(metadata, /short_description: "Apply rights with evidence and scoped authority"/);
  assert.match(metadata, /Use \$practise-xenia-rights/);
});

test("the source skill stays outside the immutable beta.5 npm artifact", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(packageJson.version, "0.1.0-beta.5");
  assert.ok(!packageJson.files.includes("skills"));
  assert.ok(!Object.keys(packageJson.exports).some((key) => key.includes("skill")));
});
