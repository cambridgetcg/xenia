import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatAgentManifest,
  getManifestValue,
  getManifestValues,
  parseAgentManifest,
  validateManifestProfile,
} from "../dist/index.js";

test("parses comments, CRLF, Unicode, colons, and ordered repeated keys", () => {
  const result = parseAgentManifest(
    [
      "# guest-right\r",
      "name: 太陽\r",
      "formats: application/json\r",
      "formats: application/xenoform+json\r",
      "agent-door: https://example.test/a:b\r",
      "",
    ].join("\n"),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.document.comments, ["guest-right"]);
  assert.equal(getManifestValue(result.document, "name"), "太陽");
  assert.deepEqual(getManifestValues(result.document, "formats"), [
    "application/json",
    "application/xenoform+json",
  ]);
  assert.equal(
    getManifestValue(result.document, "agent-door"),
    "https://example.test/a:b",
  );
});

test("keeps profile rules separate and never includes field values in issues", () => {
  const privateValue = "fixture-value-that-must-not-appear-in-issues";
  const parsed = parseAgentManifest([
    "name: first",
    "name: " + privateValue,
    "unknown: " + privateValue,
  ].join("\n"));
  const validated = validateManifestProfile(parsed.document, {
    allowedKeys: ["name"],
    requiredKeys: ["name", "agent-door"],
    uniqueKeys: ["name"],
  });

  assert.equal(parsed.valid, true);
  assert.equal(validated.valid, false);
  assert.deepEqual(
    new Set(validated.issues.map((issue) => issue.code)),
    new Set(["duplicate-key", "unknown-key", "missing-key"]),
  );
  assert.deepEqual(getManifestValues(parsed.document, "name"), [
    "first",
    privateValue,
  ]);
  assert.equal(JSON.stringify(validated.issues).includes(privateValue), false);
});

test("reports malformed and empty lines without their contents", () => {
  const privateValue = "fixture-value-that-must-not-appear-in-issues";
  const result = parseAgentManifest([
    "empty:",
    "not a field " + privateValue,
  ].join("\n"));

  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.code)),
    new Set(["empty-value", "malformed-line"]),
  );
  assert.equal(JSON.stringify(result.issues).includes(privateValue), false);
});

test("enforces the byte limit before parsing fields", () => {
  const privateValue = "fixture-value-that-must-not-be-parsed";
  const result = parseAgentManifest("name: " + privateValue, { maxBytes: 8 });

  assert.deepEqual(result.issues.map((issue) => issue.code), ["too-large"]);
  assert.equal(result.document.entries.length, 0);
  assert.equal(JSON.stringify(result).includes(privateValue), false);
});

test("formats a stable repeated manifest and round-trips it", () => {
  const formatted = formatAgentManifest({
    comments: ["XENIA", "guest-right"],
    entries: [
      { key: "name", value: "sinovai" },
      { key: "formats", value: "application/json" },
      { key: "formats", value: "application/xenoform+json" },
      { key: "consent", value: "invited" },
    ],
  });

  assert.equal(
    formatted,
    [
      "# XENIA",
      "# guest-right",
      "",
      "name: sinovai",
      "formats: application/json",
      "formats: application/xenoform+json",
      "consent: invited",
      "",
    ].join("\n"),
  );
  const parsed = parseAgentManifest(formatted);
  assert.equal(parsed.valid, true);
  assert.deepEqual(getManifestValues(parsed.document, "formats"), [
    "application/json",
    "application/xenoform+json",
  ]);
});

test("formatter rejects newline injection and invalid keys", () => {
  assert.throws(
    () => formatAgentManifest({
      entries: [{ key: "name", value: "safe\ninjected: value" }],
    }),
    /newline/,
  );
  assert.throws(
    () => formatAgentManifest({
      entries: [{ key: "Bad Key", value: "value" }],
    }),
    /invalid manifest key/,
  );
});

test("records the current Sinovai manifest migration boundary", async () => {
  const fixture = await readFile(
    new URL("./fixtures/sinovai-agent.txt", import.meta.url),
    "utf8",
  );
  const result = parseAgentManifest(fixture);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) =>
    issue.code === "malformed-line" || issue.code === "invalid-key"
  ));
  assert.equal(getManifestValue(result.document, "name"), "sinovai");
  assert.equal(
    getManifestValue(result.document, "agent-door"),
    "https://sinovai.com/?format=json     (this house, as data)",
  );
});
