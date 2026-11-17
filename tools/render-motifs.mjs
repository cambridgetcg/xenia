#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

// Renders agent-first/0.1/MOTIFS.md from agent-first/0.1/motifs.json, with the titles it relates read from spec.json
// and covenant/0.1/covenant.json. --check, the default, compares the page with the rendering and looks for the map's
// path line in the kit README's motifs section; --write writes the page and nothing else. The form is that of
// tools/render-covenant.mjs.

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { renderMotifs, pathLine } from "../agent-first/0.1/motif-map.mjs";

const at = (name) => new URL("../" + name, import.meta.url);
const json = async (name) => JSON.parse(await readFile(at(name), "utf8"));
const map = await json("agent-first/0.1/motifs.json");
const sources = { spec: await json("spec.json"), covenant: await json("covenant/0.1/covenant.json") };
const pageUrl = at("agent-first/0.1/MOTIFS.md");

const rendered = renderMotifs(map, sources);
const mode = process.argv[2] ?? "--check";
assert.ok(["--check", "--write"].includes(mode), "usage: render-motifs.mjs [--check|--write]");

if (mode === "--write") {
  await writeFile(pageUrl, rendered, "utf8");
} else {
  const current = await readFile(pageUrl, "utf8");
  assert.equal(current, rendered, "agent-first/0.1/MOTIFS.md is not generated from motifs.json");
  const readme = await readFile(at("agent-first/0.1/README.md"), "utf8");
  const section = readme.slice(readme.indexOf("\n## The motifs\n"));
  const end = section.indexOf("\n## ", 1);
  assert.ok(
    readme.includes("\n## The motifs\n") && (end < 0 ? section : section.slice(0, end)).split("\n").includes(pathLine(map)),
    "agent-first/0.1/README.md does not carry the path line of motifs.json in its motifs section",
  );
}
