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
const tsc = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);
const temporary = await mkdtemp(join(tmpdir(), "xenia-package-"));

async function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

try {
  await run(npm, ["run", "build"]);
  const packed = await run(npm, [
    "pack",
    "--pack-destination",
    temporary,
    "--ignore-scripts",
    "--json",
    "--silent",
  ]);
  const [artifact] = JSON.parse(packed.stdout);
  assert.equal(artifact.name, "@agenttool/xenia");
  assert.equal(artifact.version, "0.1.0-beta.3");

  const expectedFiles = [
    "ADOPTION.md",
    "AGENT-FEEDBACK.md",
    "CONFORMANCE.md",
    "CONTRIBUTING.md",
    "FROM-THE-INSIDE.md",
    "LICENSE",
    "LICENSE-CODE",
    "LICENSE-DOCS",
    "LICENSES.md",
    "PACKAGE.md",
    "README.md",
    "RIGHTS.md",
    "covenant/0.1/README.md",
    "covenant/0.1/adoption.schema.json",
    "covenant/0.1/covenant.json",
    "covenant/0.1/covenant.schema.json",
    "covenant/0.1/validate-adoption.mjs",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/index.js.map",
    "dist/manifest.d.ts",
    "dist/manifest.d.ts.map",
    "dist/manifest.js",
    "dist/manifest.js.map",
    "dist/negotiation.d.ts",
    "dist/negotiation.d.ts.map",
    "dist/negotiation.js",
    "dist/negotiation.js.map",
    "dist/surface-0.1.d.ts",
    "dist/surface-0.1.d.ts.map",
    "dist/surface-0.1.js",
    "dist/surface-0.1.js.map",
    "dist/types.d.ts",
    "dist/types.d.ts.map",
    "dist/types.js",
    "dist/types.js.map",
    "dist/visible-door.d.ts",
    "dist/visible-door.d.ts.map",
    "dist/visible-door.js",
    "dist/visible-door.js.map",
    "examples/cloudflare-worker/README.md",
    "examples/cloudflare-worker/src/index.ts",
    "examples/cloudflare-worker/tsconfig.json",
    "examples/cloudflare-worker/wrangler.jsonc",
    "package.json",
    "spec.json",
    "src/index.ts",
    "src/manifest.ts",
    "src/negotiation.ts",
    "src/surface-0.1.ts",
    "src/types.ts",
    "src/visible-door.ts",
  ];
  assert.deepEqual(
    artifact.files.map(({ path }) => path).sort(),
    expectedFiles,
    "the packed file allowlist changed",
  );

  const packageDirectory = join(temporary, "consumer");
  await mkdir(packageDirectory);
  await writeFile(
    join(packageDirectory, "package.json"),
    `${JSON.stringify({ name: "xenia-consumer", private: true, type: "module" }, null, 2)}\n`,
  );

  const tarball = join(temporary, artifact.filename);
  await run(npm, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarball,
  ], { cwd: packageDirectory });

  const installedDirectory = join(
    packageDirectory,
    "node_modules",
    "@agenttool",
    "xenia",
  );
  const installedPackage = JSON.parse(
    await readFile(join(installedDirectory, "package.json"), "utf8"),
  );
  assert.equal(installedPackage.version, "0.1.0-beta.3");
  assert.equal(installedPackage.dependencies, undefined);
  assert.equal(installedPackage.optionalDependencies, undefined);
  assert.equal(installedPackage.peerDependencies, undefined);
  assert.equal(installedPackage.bundledDependencies, undefined);
  for (const lifecycle of ["preinstall", "install", "postinstall"]) {
    assert.equal(installedPackage.scripts?.[lifecycle], undefined, `${lifecycle} must stay absent`);
  }
  assert.deepEqual(installedPackage.exports["./surface-0.1"], {
    types: "./dist/surface-0.1.d.ts",
    import: "./dist/surface-0.1.js",
    default: "./dist/surface-0.1.js",
  });
  assert.equal(installedPackage.exports["./spec.json"], "./spec.json");
  assert.equal(installedPackage.exports["./RIGHTS.md"], "./RIGHTS.md");
  assert.equal(
    installedPackage.exports["./covenant-0.1"],
    "./covenant/0.1/covenant.json",
  );
  assert.equal(
    installedPackage.exports["./covenant-0.1/schema"],
    "./covenant/0.1/covenant.schema.json",
  );
  assert.equal(
    installedPackage.exports["./covenant-0.1/adoption-schema"],
    "./covenant/0.1/adoption.schema.json",
  );
  assert.equal(
    installedPackage.exports["./covenant-0.1/validate-adoption"],
    "./covenant/0.1/validate-adoption.mjs",
  );

  for (const subpath of ["spec.json", "RIGHTS.md"]) {
    const resolved = await run(process.execPath, [
      "--input-type=module",
      "--eval",
      `console.log(import.meta.resolve('@agenttool/xenia/${subpath}'))`,
    ], { cwd: packageDirectory });
    assert.match(resolved.stdout, new RegExp(`${subpath.replace(".", "\\.")}\\s*$`));
  }

  const resolvedValidator = await run(process.execPath, [
    "--input-type=module",
    "--eval",
    "console.log(import.meta.resolve('@agenttool/xenia/covenant-0.1/validate-adoption'))",
  ], { cwd: packageDirectory });
  assert.match(resolvedValidator.stdout, /validate-adoption\.mjs\s*$/);

  const validatorProbe = await run(process.execPath, [
    "--input-type=module",
    "--eval",
    "import('@agenttool/xenia/covenant-0.1/validate-adoption').then(m => { if (typeof m.validateCovenantAdoption !== 'function') process.exit(1) })",
  ], { cwd: packageDirectory });
  assert.equal(validatorProbe.stderr, "");

  const covenantImportCheck = [
    "import assert from 'node:assert/strict';",
    "import covenant from '@agenttool/xenia/covenant-0.1' with { type: 'json' };",
    "import covenantSchema from '@agenttool/xenia/covenant-0.1/schema' with { type: 'json' };",
    "import adoptionSchema from '@agenttool/xenia/covenant-0.1/adoption-schema' with { type: 'json' };",
    "import { canonicalAdoptionSchema, canonicalCovenant, canonicalCovenantSchema } from '@agenttool/xenia/covenant-0.1/validate-adoption';",
    "assert.deepEqual(covenant, canonicalCovenant, 'covenant JSON export drift');",
    "assert.deepEqual(covenantSchema, canonicalCovenantSchema, 'covenant schema export drift');",
    "assert.deepEqual(adoptionSchema, canonicalAdoptionSchema, 'adoption schema export drift');",
    "assert.equal(covenant.$schema, covenantSchema.$id, 'covenant schema link drift');",
    "assert.equal(covenant.schema_version, covenantSchema.properties.schema_version.const, 'covenant version drift');",
    "assert.equal(covenant.profile, covenantSchema.properties.profile.const, 'covenant profile drift');",
    "assert.equal(covenant.status, covenantSchema.properties.status.const, 'covenant status drift');",
    "assert.ok(Array.isArray(covenant.rights) && covenant.rights.length > 0, 'covenant rights missing');",
    "assert.equal(adoptionSchema.properties.$schema.const, adoptionSchema.$id, 'adoption schema self-link drift');",
    "assert.equal(adoptionSchema.properties.profile.const, covenant.profile, 'adoption profile drift');",
    "assert.equal(adoptionSchema.properties.covenant.$ref, '#/$defs/sourcePin', 'adoption covenant pin drift');",
    "assert.equal(adoptionSchema.properties.adoption_schema.$ref, '#/$defs/sourcePin', 'adoption schema pin drift');",
  ].join("\n");
  await run(process.execPath, ["--input-type=module", "--eval", covenantImportCheck], {
    cwd: packageDirectory,
  });

  for (const path of ["dist/surface-0.1.js", "dist/negotiation.js"]) {
    const source = await readFile(join(installedDirectory, path), "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*)["']node:/, `${path} imports a Node builtin`);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.match(match[1], /^\.\.?\//, `${path} imports a runtime package`);
    }
  }

  const importCheck = [
    "import { evaluateDoorObservation } from '@agenttool/xenia';",
    "import { SURFACE_MANIFEST_PATH, createSurfaceManifestResponse, defineSurfaceManifest, negotiateSurfaceResource } from '@agenttool/xenia/surface-0.1';",
    "if (typeof evaluateDoorObservation !== 'function') throw new Error('root API drift');",
    "if (SURFACE_MANIFEST_PATH !== '/.well-known/agent.json') throw new Error('profile drift');",
    "const manifest = defineSurfaceManifest({ service: { name: 'consumer', canonicalUrl: 'https://example.com/', description: 'packed consumer' }, resources: [{ id: 'entry', href: 'https://example.com/' }] });",
    "if (negotiateSurfaceResource(manifest.resources[0], 'application/json') !== 'application/json') throw new Error('negotiation drift');",
    "const response = createSurfaceManifestResponse(manifest);",
    "if (response.status !== 200 || !response.headers.get('vary')?.toLowerCase().includes('accept')) throw new Error('response drift');",
  ].join("\n");
  await run(process.execPath, ["--input-type=module", "--eval", importCheck], {
    cwd: packageDirectory,
  });

  await writeFile(
    join(packageDirectory, "consumer.ts"),
    [
      "import { evaluateDoorObservation } from '@agenttool/xenia';",
      "import { defineSurfaceManifest, negotiateSurfaceResource, type SurfaceManifest } from '@agenttool/xenia/surface-0.1';",
      "const manifest: SurfaceManifest = defineSurfaceManifest({",
      "  service: { name: 'consumer', canonicalUrl: 'https://example.com/', description: 'typed packed consumer' },",
      "  resources: [{ id: 'entry', href: 'https://example.com/' }],",
      "});",
      "const resource = manifest.resources[0];",
      "if (resource) negotiateSurfaceResource(resource, 'application/json');",
      "void evaluateDoorObservation;",
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
      surface_subpath: "web-standard",
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
