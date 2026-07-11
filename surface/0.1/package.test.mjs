// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CHECKER_USER_AGENT,
  CHECKER_VERSION,
  PROFILE,
  RESULT_VERSION,
  checkSurface,
} from "@agenttool/xenia-surface";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("npm package metadata preserves the Surface RC1 release boundary", async () => {
  const packageJson = await readJson("./package.json");
  const resultSchema = await readJson("./result.schema.json");

  assert.equal(packageJson.name, "@agenttool/xenia-surface");
  assert.equal(packageJson.version, CHECKER_VERSION);
  assert.equal(Object.hasOwn(packageJson, "private"), false);
  assert.deepEqual(packageJson.bin, { "xenia-surface-check": "check.mjs" });
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
    provenance: true,
    tag: "rc",
    registry: "https://registry.npmjs.org/",
  });
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/cambridgetcg/xenia.git",
    directory: "surface/0.1",
  });
  assert.equal(packageJson.xeniaSurface.profile, PROFILE);
  assert.equal(packageJson.xeniaSurface.profileTag, "surface-v0.1.0-rc.1");
  assert.equal(resultSchema.properties.verifier.properties.version.const, CHECKER_VERSION);
  assert.equal(
    resultSchema.$defs.observation.properties.request.properties.user_agent.const,
    CHECKER_USER_AGENT,
  );
  assert.equal(resultSchema.properties.schema_version.const, RESULT_VERSION);
});

test("explicit epoch time is preserved by the programmatic checker", async () => {
  const result = await checkSurface("https://example.com", {
    now: 0,
    fetchImpl: async () => {
      throw new TypeError("offline fixture");
    },
  });
  assert.equal(result.observed_at, "1970-01-01T00:00:00.000Z");
  assert.equal(result.result, "indeterminate");
});

test("all public package files are present and non-empty", async () => {
  const api = await import("@agenttool/xenia-surface");
  assert.equal(api.CHECKER_VERSION, "0.1.0-rc.1");

  for (const path of [
    "manifest.schema.json",
    "problem.schema.json",
    "result.schema.json",
    "example-manifest.json",
    "LICENSE",
    "LICENSE-CODE",
    "LICENSE-DOCS",
    "LICENSES.md",
  ]) {
    const value = await readFile(new URL(`./${path}`, import.meta.url));
    assert.ok(value.byteLength > 0, `${path} must be present and non-empty`);
  }
});

test("package licence texts are exact copies of the canonical repository texts", async () => {
  for (const path of ["LICENSE", "LICENSE-CODE", "LICENSE-DOCS"]) {
    const packaged = await readFile(new URL(`./${path}`, import.meta.url));
    const canonical = await readFile(new URL(`../../${path}`, import.meta.url));
    assert.deepEqual(packaged, canonical, `${path} must remain byte-identical`);
  }
});

test("programmatic import does not assume argv points to a real file", async () => {
  const child = spawn(process.execPath, ["--input-type=module", "-"], {
    cwd: new URL(".", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(
    "import { CHECKER_VERSION } from '@agenttool/xenia-surface';\n" +
      "if (CHECKER_VERSION !== '0.1.0-rc.1') process.exitCode = 1;\n",
  );
  const [code] = await once(child, "close");
  assert.equal(code, 0, stderr);
});
