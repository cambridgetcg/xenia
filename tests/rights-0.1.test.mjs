// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getRightsBaselineRight,
  isRightsBaseline,
  isRightsBaselineId,
  RIGHTS_BASELINE,
  RIGHTS_BASELINE_IDS,
  RIGHTS_BASELINE_VERSION,
  verifyRightsBaseline,
} from "../dist/rights-0.1.js";

const root = new URL("../", import.meta.url);
const spec = JSON.parse(await readFile(new URL("spec.json", root), "utf8"));

function assertDeeplyFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeeplyFrozen(nested);
}

test("exports the exact informative rights index without becoming a second canon", () => {
  assert.equal(RIGHTS_BASELINE_VERSION, "xenia.rights/0.1");
  assert.deepEqual(RIGHTS_BASELINE, spec.rights);
  assert.deepEqual(
    RIGHTS_BASELINE_IDS,
    spec.rights.baseline.map(({ id }) => id),
  );
  assertDeeplyFrozen(RIGHTS_BASELINE);
  assertDeeplyFrozen(RIGHTS_BASELINE_IDS);
});

test("looks up only installed baseline identifiers", () => {
  assert.equal(isRightsBaselineId("repair-appeal"), true);
  assert.equal(isRightsBaselineId("invented-right"), false);
  assert.equal(
    getRightsBaselineRight("repair-appeal")?.statement,
    spec.rights.baseline.at(-1).statement,
  );
  assert.equal(getRightsBaselineRight("invented-right"), undefined);
});

test("verifies exact baseline data while reporting drift without overclaiming", () => {
  const copy = structuredClone(spec.rights);
  const before = JSON.stringify(copy);
  assert.deepEqual(verifyRightsBaseline(copy), { valid: true, issues: [] });
  assert.equal(isRightsBaseline(copy), true);
  assert.equal(JSON.stringify(copy), before);

  const reorderedKeys = Object.fromEntries(Object.entries(copy).reverse());
  assert.equal(verifyRightsBaseline(reorderedKeys).valid, true);

  const reorderedRights = structuredClone(copy);
  reorderedRights.baseline.reverse();
  assert.equal(verifyRightsBaseline(reorderedRights).valid, false);

  copy.baseline[0].statement = "A shorter substitute.";
  copy.unstated_guarantee = true;
  const drift = verifyRightsBaseline(copy);
  assert.equal(drift.valid, false);
  assert.equal(isRightsBaseline(copy), false);
  assert.ok(drift.issues.some(({ code, path }) =>
    code === "value_mismatch" && path === "$.baseline[0].statement"
  ));
  assert.ok(drift.issues.some(({ code, path }) =>
    code === "keys_mismatch" && path === "$"
  ));
  assert.equal(Object.isFrozen(drift), true);
  assert.equal(Object.isFrozen(drift.issues), true);
  assert.ok(drift.issues.every(Object.isFrozen));
});

test("rejects malformed and unreadable candidates without throwing", () => {
  assert.equal(verifyRightsBaseline(null).valid, false);
  assert.equal(verifyRightsBaseline([]).valid, false);
  assert.equal(isRightsBaselineId({ id: "repair-appeal" }), false);

  const hostile = {};
  Object.defineProperty(hostile, "schema_version", {
    enumerable: true,
    get() {
      throw new Error("do not escape");
    },
  });
  const result = verifyRightsBaseline(hostile);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(({ code }) => code === "unreadable"));
});
