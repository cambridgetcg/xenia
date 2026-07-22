#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalAdoptionSchema,
  canonicalCovenant,
  canonicalCovenantSchema,
  canonicalPins,
  canonicalRelease,
  canonicalSources,
} from "../covenant/0.1/validate-adoption.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tag = "covenant-v0.1.0-rc.1";
const files = [
  "covenant/0.1/covenant.schema.json",
  "covenant/0.1/covenant.json",
  "covenant/0.1/adoption.schema.json",
];

function git(args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: root,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

try {
  const dirty = git(["status", "--porcelain"]).trim().split("\n").filter(Boolean);
  assert.ok(dirty.length === 0, `release worktree must be clean (${dirty.length} changed paths)`);
  assert.equal(git(["cat-file", "-t", tag]).trim(), "tag", `${tag} must be an annotated tag`);
  const head = git(["rev-parse", "HEAD"]).trim();
  const taggedCommit = git(["rev-parse", `${tag}^{commit}`]).trim();
  assert.equal(taggedCommit, head, `${tag} must peel to the release HEAD`);
  assert.equal(canonicalCovenant.$schema, canonicalCovenantSchema.$id, "Covenant schema identity drift");
  assert.equal(canonicalCovenant.schema_pin.source, canonicalSources.covenantSchema, "recorded Covenant schema source drift");
  assert.equal(canonicalCovenant.schema_pin.sha256, canonicalPins.covenantSchema, "recorded Covenant schema digest drift");
  assert.equal(canonicalCovenant.schema_pin.source_stability, "immutable", "recorded Covenant schema stability drift");
  assert.equal(canonicalAdoptionSchema.$id, canonicalSources.adoptionSchema, "adoption schema identity drift");
  assert.equal(canonicalRelease.tag, tag, "canonical release tag drift");

  for (const path of files) {
    const current = readFileSync(resolve(root, path));
    const tagged = git(["show", `${tag}:${path}`], null);
    assert.deepEqual(tagged, current, `${path} differs from ${tag}`);
  }

  assert.equal(
    sha256(readFileSync(resolve(root, files[0]))),
    canonicalPins.covenantSchema,
    "Covenant schema digest drift",
  );
  assert.equal(
    sha256(readFileSync(resolve(root, files[1]))),
    canonicalPins.covenant,
    "Covenant digest drift",
  );
  assert.equal(
    sha256(readFileSync(resolve(root, files[2]))),
    canonicalPins.adoptionSchema,
    "adoption schema digest drift",
  );
  for (const source of Object.values(canonicalSources)) {
    assert.ok(source.includes(`/${tag}/`), `canonical source does not use ${tag}`);
    assert.equal(source.includes("/main/"), false, "canonical source still uses moving main");
  }

  const localTagTreeResults = files.map((path) => ({
    path,
    sha256: sha256(readFileSync(resolve(root, path))),
    outcome: "pass",
  }));

  process.stdout.write(JSON.stringify({
    tag,
    commit: head,
    local_release_identity: "verified",
    local_tag_tree_results: localTagTreeResults,
    remote_publication: {
      state: "not_checked",
      source_results: [],
    },
    remote_source_expectations: canonicalRelease.sources,
  }) + "\n");
} catch (error) {
  process.stderr.write(
    `Covenant RC is not locally releasable: ${String(error?.message || error)}\n`
    + "Keep adoption records draft until the annotated tag exists at the reviewed clean commit, then publish it through a separately authorized release.\n",
  );
  process.exitCode = 1;
}
