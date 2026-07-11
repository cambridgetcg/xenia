// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps registry consent separate from open software licensing", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );

  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, "SEE LICENSE IN LICENSES.md");
  assert.ok(packageJson.files.includes("LICENSE-CODE"));
  assert.ok(packageJson.files.includes("LICENSE-DOCS"));
  assert.ok(packageJson.files.includes("LICENSES.md"));
  assert.ok(packageJson.files.includes("CONTRIBUTING.md"));
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
