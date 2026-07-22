// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = new URL("./", import.meta.url);
const root = new URL("../../", directory);

test("keeps Observe private until a separately authorized release exists", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", directory), "utf8"));
  const rootPackage = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageJson.name, "@agenttool/xenia-observe");
  assert.equal(packageJson.version, "0.1.0-dev");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.publishConfig, undefined);
  assert.deepEqual(packageJson.bin, { xenia: "observe.mjs" });
  assert.deepEqual(packageJson.dependencies, {
    "@agenttool/xenia-surface": "0.1.0-rc.1",
    ajv: "8.20.0",
    "ajv-formats": "3.0.1",
  });
  assert.ok(rootPackage.workspaces.includes("observe/0.1"));
});

test("publishes no badge or whole-framework result in its development contract", async () => {
  const schema = JSON.parse(await readFile(new URL("result.schema.json", directory), "utf8"));
  const readme = await readFile(new URL("README.md", directory), "utf8");
  assert.equal(schema.$id, "urn:xenia:observe:result:0.1-development");
  assert.equal(schema.properties.status.const, "development-draft");
  assert.equal(
    schema.properties.interpretation.properties.whole_xenia_conformance_claimed.const,
    false,
  );
  assert.match(readme, /does not turn Surface GET observations into Covenant duty/);
  assert.match(readme, /not a published release identity/);
  assert.doesNotMatch(JSON.stringify(schema), /score|badge|certif/i);
});
