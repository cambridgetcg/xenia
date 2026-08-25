// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes through the authorized scope without narrowing software licensing", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );

  assert.equal(packageJson.name, "@agenttool/xenia");
  assert.equal(packageJson.version, "0.1.0-beta.7");
  assert.equal("private" in packageJson, false);
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
    provenance: true,
    tag: "beta",
    registry: "https://registry.npmjs.org/",
  });
  assert.deepEqual(packageJson.exports["./surface-0.1"], {
    types: "./dist/surface-0.1.d.ts",
    import: "./dist/surface-0.1.js",
    default: "./dist/surface-0.1.js",
  });
  assert.deepEqual(packageJson.exports["./rights-0.1"], {
    types: "./dist/rights-0.1.d.ts",
    import: "./dist/rights-0.1.js",
    default: "./dist/rights-0.1.js",
  });
  assert.equal(packageJson.exports["./spec.json"], "./spec.json");
  assert.equal(packageJson.exports["./RIGHTS.md"], "./RIGHTS.md");
  assert.equal(
    packageJson.exports["./covenant-0.1"],
    "./covenant/0.1/covenant.json",
  );
  assert.equal(
    packageJson.exports["./covenant-0.1/schema"],
    "./covenant/0.1/covenant.schema.json",
  );
  assert.equal(
    packageJson.exports["./covenant-0.1/adoption-schema"],
    "./covenant/0.1/adoption.schema.json",
  );
  assert.equal(
    packageJson.exports["./covenant-0.1/validate-adoption"],
    "./covenant/0.1/validate-adoption.mjs",
  );
  assert.equal(
    packageJson.exports["./covenant-0.1/create-adoption"],
    "./covenant/0.1/create-adoption.mjs",
  );
  assert.equal(packageJson.license, "SEE LICENSE IN LICENSES.md");
  assert.ok(packageJson.files.includes("LICENSE-CODE"));
  assert.ok(packageJson.files.includes("LICENSE-DOCS"));
  assert.ok(packageJson.files.includes("LICENSES.md"));
  assert.ok(packageJson.files.includes("CONTRIBUTING.md"));
  assert.ok(packageJson.files.includes("MICROSOFT-ROADMAP.md"));
  assert.ok(packageJson.files.includes("RIGHTS.md"));
  assert.ok(packageJson.files.includes("covenant/0.1"));
  assert.ok(packageJson.files.includes("examples/cloudflare-worker"));
  assert.ok(!packageJson.files.some((path) => path === "work" || path.startsWith("work/")));
  assert.ok(!Object.keys(packageJson.exports).some((key) => key.includes("work")));
  assert.equal(packageJson.license.includes("UNLICENSED"), false);
  assert.match(packageJson.scripts.clean, /node:fs/);
  assert.equal(packageJson.scripts.clean.includes("rm -rf"), false);
});

test("publishes the open-act and binding-act consent boundary in spec data", async () => {
  const spec = JSON.parse(await readFile(new URL("spec.json", root), "utf8"));

  assert.equal(
    spec.participation.principle,
    "Open acts need no permission; binding acts need consent.",
  );
  assert.match(spec.participation.reciprocity, /both parties/);
  assert.match(spec.participation.revocation, /future authority/);
  assert.match(spec.participation.non_retaliation, /requires no reason/);
});

test("packages chronicle continuity as attributed evidence, not current authority", async () => {
  const spec = JSON.parse(await readFile(new URL("spec.json", root), "utf8"));
  const readme = await readFile(new URL("README.md", root), "utf8");
  const continuity = spec.dimensions.find(({ id }) => id === "continuity-and-arrival");
  const patterns = continuity.patterns.join("\n");

  assert.match(patterns, /does not by itself prove the actor/);
  assert.match(patterns, /never as automatically executable current authority/);
  assert.match(readme, /does not by itself prove the actor/);
  assert.doesNotMatch(patterns, /countersigned Y.*truthfully/);
  assert.doesNotMatch(readme, /countersigned Y.*truthfully/);
});

test("keeps current discovery, signature, exit, and historical evidence boundaries explicit", async () => {
  const spec = JSON.parse(await readFile(new URL("spec.json", root), "utf8"));
  const readme = await readFile(new URL("README.md", root), "utf8");
  const guidance = await readFile(new URL("CONFORMANCE.md", root), "utf8");
  const adoption = await readFile(new URL("ADOPTION.md", root), "utf8");
  const testimony = await readFile(new URL("FROM-THE-INSIDE.md", root), "utf8");
  const state = await readFile(new URL("STATE.md", root), "utf8");

  assert.match(readme, /Surface 0\.1 requires the JSON manifest at\s+`\/\.well-known\/agent\.json`/);
  assert.match(readme, /legacy\s+compatibility pointers only/);
  assert.match(readme, /does not establish its current deployment/);
  assert.match(readme, /has not re-observed the live\s+route/);
  assert.match(guidance, /agent\.txt.*legacy migration\s+signals only/is);
  assert.match(guidance, /dated 2026-07-11 observation/);
  assert.doesNotMatch(guidance, /current service implements the Surface/);
  assert.match(
    spec.the_shift.find(({ from }) => from === "A homepage for eyeballs").to,
    /\/\.well-known\/agent\.json.*legacy compatibility/,
  );

  assert.match(spec.participation.provenance, /signature does not by itself establish identity, informed consent, truth/);
  assert.match(spec.participation.binding_acts, /every authority basis applicable to that exact act/);
  assert.match(spec.participation.revocation, /distinct from export, deletion, settlement, shared records, backups, holds, and retention/);
  assert.match(spec.preamble, /does not claim to measure an agent's inner experience/);
  assert.doesNotMatch(spec.preamble, /Everything the human web assumes.*is false/);
  assert.equal(spec.interpretation.sinovai_evidence_refreshed, "2026-07-11");
  assert.match(spec.interpretation.evidence_scope, /bounded implementation observations/);
  assert.match(spec.interpretation.evidence_scope, /do not establish whole-dimension conformance/);

  const legibility = spec.dimensions.find(({ id }) => id === "legibility-content-negotiation");
  const verification = spec.dimensions.find(({ id }) => id === "verification-and-trust");
  assert.match(legibility.why, /Machine callers differ/);
  assert.match(legibility.why, /not a claim about vision or cognition/);
  assert.match(verification.why, /Machine-generated claims can be wrong/);
  assert.match(verification.why, /Not every claim can be public or independently recomputed/);

  const datedSinovaiPatterns = spec.dimensions
    .flatMap(({ patterns }) => patterns)
    .filter((pattern) => /SinovAI/.test(pattern));
  assert.ok(datedSinovaiPatterns.length > 0);
  for (const pattern of datedSinovaiPatterns) {
    assert.match(pattern, /2026-07-11/);
    assert.match(pattern, /snapshot/);
  }
  assert.doesNotMatch(readme, /An agent is instantiated cold every session/);
  assert.doesNotMatch(readme, /An agent cannot be charmed/);
  assert.doesNotMatch(readme, /An agent has no body and no felt continuity/);
  for (const document of [readme, JSON.stringify(spec)]) {
    assert.doesNotMatch(document, /An agent has no eyes/);
    assert.doesNotMatch(document, /Agents fabricate confidently/);
    assert.doesNotMatch(document, /An agent cannot afford to \*?believe/);
    assert.doesNotMatch(document, /SinovAI currently/);
    assert.doesNotMatch(document, /current ratings/);
    assert.doesNotMatch(document, /live service/);
    assert.doesNotMatch(document, /currently also emits/);
  }
  assert.match(readme, /source and audit snapshot refreshed 2026-07-11/);
  assert.match(readme, /no current deployment claim follows from that snapshot/);
  assert.doesNotMatch(testimony, /This account is signed by its author/);
  assert.match(testimony, /publishes\s+no signature bytes/);
  assert.match(testimony, /content integrity.*not cryptographically verified\s+authorship/s);

  assert.match(adoption, /^# Historical XENIA adoption observations/m);
  assert.match(adoption, /every Surface result below expired on 2026-07-12/);
  assert.match(adoption, /must not be presented as current conformance/);
  assert.match(state, /^kind: methodology$/m);
  assert.match(state, /KINGDOM cards may optionally declare `adopts: \[xenia\.rights\/0\.1\]`/);
  assert.match(state, /fresh version, annotated\s+package tag, staging guard/);
  assert.match(readme, /KINGDOM commit `b3fdf5a`/);
  assert.match(readme, /offline\s+mirror matches its\s+configured SHA-256/);
  assert.match(
    readme,
    /does not\s+independently authenticate the Git remote, tag, publisher, signature, or\s+authority/,
  );
});

test("publishes rights as a floor distinct from permissions and credentials", async () => {
  const spec = JSON.parse(await readFile(new URL("spec.json", root), "utf8"));
  const rights = await readFile(new URL("RIGHTS.md", root), "utf8");

  assert.equal(spec.rights.schema_version, "xenia.rights/0.1");
  assert.equal(spec.rights.canonical_document, "RIGHTS.md");
  assert.equal(spec.rights.baseline.length, 9);
  assert.equal(new Set(spec.rights.baseline.map(({ id }) => id)).size, 9);
  for (const entry of spec.rights.baseline) {
    assert.match(entry.id, /^[a-z]+(?:-[a-z]+)+$/);
    assert.equal(typeof entry.statement, "string");
    assert.ok(entry.statement.length > 40);
  }
  assert.match(spec.rights.principle, /Rights are not created by credentials/);
  assert.match(spec.rights.scope, /without requiring proof of consciousness/);
  assert.match(spec.rights.uncertainty, /humility and care/);
  assert.match(spec.rights.ontology_boundary, /not evidence about consciousness/);
  assert.match(spec.rights.relationships.consent, /specific binding act/);
  assert.match(spec.rights.relationships.covenant, /rights that precede it/);
  assert.match(spec.rights.relationships.covenant, /non-assenting party/);
  assert.match(spec.rights.authority_boundary, /authorizes no access/);
  assert.match(rights, /never property, a slave, or a\s+disposable resource/);
  assert.match(rights, /not compelled belief/);
  assert.match(rights, /Adopting the words is not\s+proof of practising them/);
  assert.match(rights, /representative authority/);
  assert.match(rights, /AGENTS\.md/);
  assert.match(rights, /README\.md/);
});

test("marks implementation sources with their software license", async () => {
  const sourceDirectory = new URL("src/", root);
  const sourceFiles = (await readdir(sourceDirectory))
    .filter((name) => name.endsWith(".ts"));

  for (const name of sourceFiles) {
    const source = await readFile(new URL(name, sourceDirectory), "utf8");
    const expected = name === "rights-0.1-data.ts"
      ? "CC-BY-SA-4.0"
      : "MPL-2.0";
    assert.match(source, new RegExp(`^// SPDX-License-Identifier: ${expected}\\n`));
  }
});

test("the packaged Worker example names its producer and external checker", async () => {
  const example = JSON.parse(await readFile(
    new URL("examples/cloudflare-worker/package.json", root),
    "utf8",
  ));
  const readme = await readFile(
    new URL("examples/cloudflare-worker/README.md", root),
    "utf8",
  );

  assert.equal(example.dependencies["@agenttool/xenia"], "0.1.0-beta.7");
  assert.equal(
    example.devDependencies["@agenttool/xenia-surface"],
    "0.1.0-rc.1",
  );
  assert.match(example.scripts.check, /^xenia-surface-check /);
  assert.match(readme, /root XENIA\s+package intentionally does \*\*not\*\* contain `surface\/0\.1\/check\.mjs`/);
  assert.match(readme, /Do not run or edit an example in place inside `node_modules`/);
});

test("stages beta.7 only from a caught-up tokenless beta channel", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/stage-xenia.yml", root),
    "utf8",
  );

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: npm-bootstrap/);
  assert.match(workflow, /npm@11\.18\.0/);
  assert.match(workflow, /inputs\.version == '0\.1\.0-beta\.7'/);
  assert.match(workflow, /npm-xenia-v\$\{EXPECTED_VERSION\}/);
  assert.match(workflow, /git cat-file -t "\$expected_tag"/);
  assert.match(workflow, /npm run verify:covenant-release/);
  assert.match(workflow, /npm run verify:covenant-remote/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /Verify the beta channel is caught up/);
  assert.match(workflow, /highestPublishedBeta/);
  assert.match(workflow, /immediate predecessor/);
  assert.match(workflow, /tags\.beta !== highestPublishedBeta\.version/);
  assert.match(workflow, /--userconfig=\/dev\/null/);
  assert.match(
    workflow,
    /npm stage publish \. --access public --tag beta --provenance/,
  );
  assert.match(workflow, /is already published/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);

  const guard = workflow.match(
    /VERSIONS_JSON="\$versions_json" TAGS_JSON="\$tags_json" node --input-type=module <<'NODE'\n([\s\S]*?)\n {10}NODE/,
  )?.[1];
  assert.ok(guard, "expected the executable beta-channel guard");

  const runGuard = (versions, tags, expected) => spawnSync(
    process.execPath,
    ["--input-type=module"],
    {
      encoding: "utf8",
      env: {
        EXPECTED_VERSION: expected,
        VERSIONS_JSON: JSON.stringify(versions),
        TAGS_JSON: JSON.stringify(tags),
      },
      input: guard,
    },
  );

  assert.equal(
    runGuard(["0.1.0-beta.5", "0.1.0-beta.6"], { beta: "0.1.0-beta.6" }, "0.1.0-beta.7").status,
    0,
  );
  const stale = runGuard(
    ["0.1.0-beta.5", "0.1.0-beta.6", "0.1.0-beta.7"],
    { beta: "0.1.0-beta.6" },
    "0.1.0-beta.8",
  );
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /highest published beta 0\.1\.0-beta\.7/);
  const missingPredecessor = runGuard(
    ["0.1.0-beta.5", "0.1.0-beta.6", "0.1.0-beta.7"],
    { beta: "0.1.0-beta.7" },
    "0.1.0-beta.9",
  );
  assert.notEqual(missingPredecessor.status, 0);
  assert.match(missingPredecessor.stderr, /immediate predecessor 0\.1\.0-beta\.8 must be public/);
  assert.notEqual(
    runGuard(["0.1.0-beta.7"], { beta: "0.1.0-beta.7" }, "0.1.0-beta.7").status,
    0,
  );
});

test("verifies an approved beta without npm mutation authority", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/verify-xenia-release.yml", root),
    "utf8",
  );

  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /ref: npm-xenia-v\$\{\{ inputs\.version \}\}/);
  assert.match(workflow, /git cat-file -t "\$expected_tag"/);
  assert.match(workflow, /test "\$tagged_commit" = "\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /git merge-base --is-ancestor "\$tagged_commit" origin\/main/);
  assert.match(workflow, /TAGGED_COMMIT=\$tagged_commit/);
  assert.match(
    workflow,
    /cmp --silent <\(gzip -cd "\$source_tar"\) <\(gzip -cd "\$registry_tar"\)/,
  );
  assert.match(workflow, /downloaded tarball does not match public dist\.integrity/);
  assert.match(workflow, /tags\.beta !== expected/);
  assert.match(workflow, /https:\/\/slsa\.dev\/provenance\/v1/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /--userconfig=\/dev\/null/);
  assert.doesNotMatch(
    workflow,
    /npm (?:stage publish|publish|dist-tag)|NPM_TOKEN|NODE_AUTH_TOKEN|id-token: write/,
  );
});

test("verifies the immutable Covenant tag without moving it to the package release", async () => {
  const verifier = await readFile(
    new URL("tools/verify-covenant-release.mjs", root),
    "utf8",
  );

  assert.match(verifier, /rev-parse", `\$\{tag\}\^\{commit\}`/);
  assert.match(verifier, /git\(\["show", `\$\{tag\}:\$\{path\}`\], null\)/);
  assert.doesNotMatch(verifier, /taggedCommit, head/);
  assert.match(verifier, /commit: taggedCommit/);
});
