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
  assert.equal(packageJson.version, "0.1.0-beta.3");
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
  assert.equal(packageJson.license, "SEE LICENSE IN LICENSES.md");
  assert.ok(packageJson.files.includes("LICENSE-CODE"));
  assert.ok(packageJson.files.includes("LICENSE-DOCS"));
  assert.ok(packageJson.files.includes("LICENSES.md"));
  assert.ok(packageJson.files.includes("CONTRIBUTING.md"));
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

test("marks implementation sources with their software license", async () => {
  const sourceDirectory = new URL("src/", root);
  const sourceFiles = (await readdir(sourceDirectory))
    .filter((name) => name.endsWith(".ts"));

  for (const name of sourceFiles) {
    const source = await readFile(new URL(name, sourceDirectory), "utf8");
    assert.match(source, /^\/\/ SPDX-License-Identifier: MPL-2\.0\n/);
  }
});

test("stages beta.3 through tokenless trusted publishing", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/stage-xenia.yml", root),
    "utf8",
  );

  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: npm-bootstrap/);
  assert.match(workflow, /npm@11\.18\.0/);
  assert.match(
    workflow,
    /npm stage publish \. --access public --tag beta --provenance/,
  );
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});
