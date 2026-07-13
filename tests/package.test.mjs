// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes through the authorized scope without narrowing software licensing", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );

  assert.equal(packageJson.name, "@agenttool/xenia");
  assert.equal(packageJson.version, "0.1.0-beta.4");
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
  assert.equal(packageJson.license, "SEE LICENSE IN LICENSES.md");
  assert.ok(packageJson.files.includes("LICENSE-CODE"));
  assert.ok(packageJson.files.includes("LICENSE-DOCS"));
  assert.ok(packageJson.files.includes("LICENSES.md"));
  assert.ok(packageJson.files.includes("CONTRIBUTING.md"));
  assert.ok(packageJson.files.includes("RIGHTS.md"));
  assert.ok(packageJson.files.includes("covenant/0.1"));
  assert.ok(packageJson.files.includes("examples/cloudflare-worker"));
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
    assert.match(source, /^\/\/ SPDX-License-Identifier: MPL-2\.0\n/);
  }
});

test("stages beta.4 through a tokenless overwrite-guarded workflow", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/stage-xenia.yml", root),
    "utf8",
  );

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: npm-bootstrap/);
  assert.match(workflow, /npm@11\.18\.0/);
  assert.match(workflow, /inputs\.version == '0\.1\.0-beta\.4'/);
  assert.match(workflow, /npm-xenia-v\$\{EXPECTED_VERSION\}/);
  assert.match(
    workflow,
    /npm stage publish \. --access public --tag beta --provenance/,
  );
  assert.match(workflow, /is already published/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});
