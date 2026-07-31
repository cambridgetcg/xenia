// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { createUnknownCovenantAdoption } from "../covenant/0.1/create-adoption.mjs";
import { validateCovenantAdoption } from "../covenant/0.1/validate-adoption.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const adoptionSchema = JSON.parse(await readFile(
  new URL("covenant/0.1/adoption.schema.json", root),
  "utf8",
));
const validateSchema = new Ajv2020({ allErrors: true, strict: true });
addFormats(validateSchema);
const validateAdoption = validateSchema.compile(adoptionSchema);

function createFixture() {
  return createUnknownCovenantAdoption({
    hostName: "Example host",
    canonicalUrl: "https://example.com/",
    speakerId: "https://example.com/#operator",
    reviewedAt: "2026-07-31T12:00:00Z",
  });
}

function assertValid(adoption) {
  assert.equal(validateAdoption(adoption), true, JSON.stringify(validateAdoption.errors));
  assert.deepEqual(validateCovenantAdoption(adoption), { valid: true, issues: [] });
}

test("creates a complete all-unknown Covenant draft without implied authority or evidence", () => {
  const adoption = createFixture();
  assertValid(adoption);

  assert.equal(adoption.declaration.status, "draft");
  assert.equal(adoption.declaration.effective_at, undefined);
  assert.equal(adoption.declaration.speaker.role, "authorized_representative");
  assert.equal(adoption.declaration.speaker.authority_state, "unverified");
  assert.deepEqual(adoption.declaration.speaker.authority_evidence, []);
  assert.match(adoption.declaration.statement, /schema-required speaker role.*placeholders/);
  assert.equal(adoption.release_verification.state, "unverified");
  assert.equal(adoption.rights.length, 10);
  assert.equal(
    adoption.rights.flatMap(({ requirement_results }) => requirement_results).length,
    38,
  );
  assert.equal(adoption.protective_limit_results.length, 5);
  assert.ok(adoption.rights.every(({ service_obligation_state }) =>
    service_obligation_state === "unknown"
  ));
  assert.ok(adoption.rights.every(({ assessment_scope }) =>
    assessment_scope.coverage === "complete"
    && assessment_scope.layers[0] === "unknown"
    && assessment_scope.unobserved.length === 1
  ));
  assert.ok(adoption.rights.every(({ requirement_results }) =>
    requirement_results.every(({ outcome, evidence }) =>
      outcome === "unknown"
      && evidence.state === "none"
      && evidence.verification === "not_applicable"
      && evidence.artifacts.length === 0
    )
  ));
  assert.ok(adoption.protective_limit_results.every(({ outcome, evidence, restriction_events }) =>
    outcome === "unknown"
    && evidence.state === "none"
    && restriction_events.length === 0
  ));
});

test("prints the same safe draft from the stdout-only CLI", async () => {
  const script = fileURLToPath(new URL("covenant/0.1/create-adoption.mjs", root));
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    script,
    "--host-name",
    "Example host",
    "--canonical-url",
    "https://example.com/",
    "--speaker-id",
    "https://example.com/#operator",
    "--reviewed-at",
    "2026-07-31T12:00:00Z",
  ]);
  assert.equal(stderr, "");
  const adoption = JSON.parse(stdout);
  assert.deepEqual(adoption, createFixture());
  assertValid(adoption);
});

test("rejects ambiguous or unsafe starter inputs", () => {
  const base = {
    hostName: "Example host",
    canonicalUrl: "https://example.com/",
    speakerId: "https://example.com/#operator",
    reviewedAt: "2026-07-31T12:00:00Z",
  };
  assert.throws(
    () => createUnknownCovenantAdoption({ ...base, hostName: "" }),
    /hostName must be a non-empty string/,
  );
  assert.throws(
    () => createUnknownCovenantAdoption({ ...base, canonicalUrl: "http://example.com/" }),
    /must use HTTPS/,
  );
  assert.throws(
    () => createUnknownCovenantAdoption({ ...base, canonicalUrl: "https://user@example.com/" }),
    /must not contain credentials/,
  );
  assert.throws(
    () => createUnknownCovenantAdoption({ ...base, canonicalUrl: "https://example.com/path" }),
    /must be an origin URL/,
  );
  assert.throws(
    () => createUnknownCovenantAdoption({ ...base, speakerId: "operator" }),
    /Invalid URL/,
  );
  const didSpeaker = createUnknownCovenantAdoption({
    ...base,
    speakerId: "did:example:operator",
  });
  assert.equal(didSpeaker.declaration.speaker.id, "did:example:operator");
  for (const reviewedAt of [
    "not-a-time",
    "2026-07-31",
    "2026-07-31T12:00:00",
    "2026-02-30T12:00:00Z",
    "2026-07-31T24:00:00Z",
    "2026-07-31T12:00:00+24:00",
  ]) {
    assert.throws(
      () => createUnknownCovenantAdoption({ ...base, reviewedAt }),
      /calendar-valid RFC 3339 date-time/,
    );
  }
  const offsetTime = createUnknownCovenantAdoption({
    ...base,
    reviewedAt: "2026-07-31T12:00:00+01:00",
  });
  assert.equal(offsetTime.declaration.reviewed_at, "2026-07-31T12:00:00+01:00");
  assertValid(offsetTime);

  const { speakerId: _speakerId, ...withoutSpeaker } = base;
  assert.throws(
    () => createUnknownCovenantAdoption(withoutSpeaker),
    /speakerId must be a non-empty string/,
  );
  const { reviewedAt: _reviewedAt, ...withoutReviewTime } = base;
  assert.throws(
    () => createUnknownCovenantAdoption(withoutReviewTime),
    /reviewedAt must be a non-empty string/,
  );
});

test("counts generator input bounds in Unicode code points like JSON Schema", () => {
  const hostName = "🧭".repeat(160);
  const adoption = createUnknownCovenantAdoption({
    hostName,
    canonicalUrl: "https://example.com/",
    speakerId: "https://example.com/#operator",
    reviewedAt: "2026-07-31T12:00:00Z",
  });
  assert.equal(adoption.host.name, hostName);
  assertValid(adoption);

  assert.throws(
    () => createUnknownCovenantAdoption({
      hostName: `${hostName}🧭`,
      canonicalUrl: "https://example.com/",
      speakerId: "https://example.com/#operator",
      reviewedAt: "2026-07-31T12:00:00Z",
    }),
    /at most 160 characters/,
  );
});
