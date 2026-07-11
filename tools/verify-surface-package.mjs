#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tsc = join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const temporary = await mkdtemp(join(tmpdir(), "xenia-surface-package-"));

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

try {
  await run(npm, ["test", "--workspace", "@agenttool/xenia-surface"]);
  const packed = await run(npm, [
    "pack",
    "--workspace",
    "@agenttool/xenia-surface",
    "--pack-destination",
    temporary,
    "--ignore-scripts",
    "--json",
    "--silent",
  ]);
  const [artifact] = JSON.parse(packed.stdout);
  assert.equal(artifact.name, "@agenttool/xenia-surface");
  assert.equal(artifact.version, "0.1.0-rc.1");

  const expectedFiles = [
    "LICENSE",
    "LICENSE-CODE",
    "LICENSE-DOCS",
    "LICENSES.md",
    "README.md",
    "check.mjs",
    "example-manifest.json",
    "index.d.mts",
    "manifest.schema.json",
    "package.json",
    "problem.schema.json",
    "result.schema.json",
  ];
  assert.deepEqual(
    artifact.files.map(({ path }) => path).sort(),
    expectedFiles,
    "the packed file allowlist changed",
  );

  const checkerEntry = artifact.files.find(({ path }) => path === "check.mjs");
  assert.ok((checkerEntry.mode & 0o111) !== 0, "the installed checker must be executable");

  const packageDirectory = join(temporary, "consumer");
  await mkdir(packageDirectory);
  await writeFile(
    join(packageDirectory, "package.json"),
    `${JSON.stringify({ name: "xenia-surface-consumer", private: true, type: "module" }, null, 2)}\n`,
  );

  const tarball = join(temporary, artifact.filename);
  await run(npm, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarball,
  ], { cwd: packageDirectory });

  const installedPackage = JSON.parse(
    await readFile(join(packageDirectory, "node_modules", "@agenttool", "xenia-surface", "package.json"), "utf8"),
  );
  assert.equal(installedPackage.dependencies, undefined);
  assert.equal(installedPackage.optionalDependencies, undefined);
  assert.equal(installedPackage.peerDependencies, undefined);
  assert.equal(installedPackage.bundledDependencies, undefined);
  for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
    assert.equal(installedPackage.scripts?.[lifecycle], undefined, `${lifecycle} must stay absent`);
  }

  const importCheck = [
    "import { CHECKER_VERSION, checkSurface, validateManifest } from '@agenttool/xenia-surface';",
    "if (CHECKER_VERSION !== '0.1.0-rc.1') throw new Error('version drift');",
    "if (!Array.isArray(validateManifest({}, 'https://example.com/'))) throw new Error('API drift');",
    "const result = await checkSurface('https://example.com', { now: 0, fetchImpl: async () => { throw new TypeError('offline fixture'); } });",
    "if (result.observed_at !== '1970-01-01T00:00:00.000Z' || result.result !== 'indeterminate') throw new Error('checker drift');",
    "for (const name of ['manifest', 'problem', 'result']) {",
    "  const url = import.meta.resolve(`@agenttool/xenia-surface/${name}.schema.json`);",
    "  const schema = JSON.parse(await (await import('node:fs/promises')).readFile(new URL(url), 'utf8'));",
    "  if (!schema.$id) throw new Error(`${name} schema is missing its pinned id`);",
    "}",
  ].join("\n");
  await run(process.execPath, ["--input-type=module", "--eval", importCheck], { cwd: packageDirectory });

  const bin = join(
    packageDirectory,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "xenia-surface-check.cmd" : "xenia-surface-check",
  );
  const help = await run(bin, ["--help"], { cwd: packageDirectory });
  assert.match(help.stdout, /^Usage: xenia-surface-check /);
  assert.equal(help.stderr, "");

  await writeFile(
    join(packageDirectory, "consumer.ts"),
    [
      "import { checkSurface, type SurfaceResult } from '@agenttool/xenia-surface';",
      "const result: Promise<SurfaceResult> = checkSurface('https://example.com');",
      "void result;",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(packageDirectory, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        lib: ["ES2024", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
        target: "ES2024",
      },
      include: ["consumer.ts"],
    }, null, 2)}\n`,
  );
  await run(tsc, ["-p", "tsconfig.json"], { cwd: packageDirectory });

  console.log(
    JSON.stringify({
      package: `${artifact.name}@${artifact.version}`,
      files: artifact.entryCount,
      packed_bytes: artifact.size,
      unpacked_bytes: artifact.unpackedSize,
      consumer: "passed",
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
