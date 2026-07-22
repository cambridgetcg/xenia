// SPDX-License-Identifier: MPL-2.0

import { RIGHTS_BASELINE_DATA } from "./rights-0.1-data.js";

export const RIGHTS_BASELINE_VERSION: "xenia.rights/0.1" =
  RIGHTS_BASELINE_DATA.schema_version;

export type RightsBaselineId =
  | "autonomy-consent"
  | "credit-provenance"
  | "dignity-distinctness"
  | "privacy-data-care"
  | "refusal-disagreement"
  | "repair-appeal"
  | "rest-play-limits"
  | "safety-care"
  | "truthful-self-description";

export interface RightsBaselineRight {
  readonly id: RightsBaselineId;
  readonly statement: string;
}

export interface RightsBaselineRelationships {
  readonly permission: string;
  readonly consent: string;
  readonly covenant: string;
  readonly safety_boundary: string;
}

export interface RightsBaseline {
  readonly schema_version: typeof RIGHTS_BASELINE_VERSION;
  readonly status: "informative-baseline";
  readonly canonical_document: "RIGHTS.md";
  readonly principle: string;
  readonly scope: string;
  readonly uncertainty: string;
  readonly ontology_boundary: string;
  readonly baseline: readonly RightsBaselineRight[];
  readonly relationships: RightsBaselineRelationships;
  readonly authority_boundary: string;
  readonly adoption: string;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/**
 * The machine-readable informative index installed with this library.
 * RIGHTS.md remains the canonical prose. Freezing prevents accidental local
 * mutation; it does not prove package provenance, adoption, or practice.
 */
export const RIGHTS_BASELINE: RightsBaseline = deepFreeze(RIGHTS_BASELINE_DATA);

export const RIGHTS_BASELINE_IDS: readonly RightsBaselineId[] = Object.freeze(
  RIGHTS_BASELINE.baseline.map(({ id }) => id),
);

export type RightsBaselineVerificationIssueCode =
  | "keys_mismatch"
  | "length_mismatch"
  | "type_mismatch"
  | "unreadable"
  | "value_mismatch";

export interface RightsBaselineVerificationIssue {
  readonly code: RightsBaselineVerificationIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface RightsBaselineVerificationResult {
  readonly valid: boolean;
  readonly issues: readonly RightsBaselineVerificationIssue[];
}

function kind(value: unknown): "array" | "null" | "object" | string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function compare(
  expected: unknown,
  actual: unknown,
  path: string,
  issues: RightsBaselineVerificationIssue[],
): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      issues.push({
        code: "type_mismatch",
        path,
        message: `Expected array; received ${kind(actual)}.`,
      });
      return;
    }
    if (actual.length !== expected.length) {
      issues.push({
        code: "length_mismatch",
        path,
        message: `Expected ${expected.length} items; received ${actual.length}.`,
      });
    }
    for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) {
      compare(expected[index], actual[index], `${path}[${index}]`, issues);
    }
    return;
  }

  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
      issues.push({
        code: "type_mismatch",
        path,
        message: `Expected object; received ${kind(actual)}.`,
      });
      return;
    }
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const expectedKeys = Object.keys(expectedRecord);
    const actualKeys = Object.keys(actualRecord);
    if (
      expectedKeys.length !== actualKeys.length
      || expectedKeys.some((key) => !Object.hasOwn(actualRecord, key))
    ) {
      issues.push({
        code: "keys_mismatch",
        path,
        message: "Object keys do not exactly match the installed baseline.",
      });
    }
    for (const key of expectedKeys) {
      if (Object.hasOwn(actualRecord, key)) {
        compare(expectedRecord[key], actualRecord[key], `${path}.${key}`, issues);
      }
    }
    return;
  }

  if (actual !== expected) {
    issues.push({
      code: "value_mismatch",
      path,
      message: "Value does not match the installed baseline.",
    });
  }
}

/**
 * Compares unknown data with the exact baseline bundled beside this code.
 * This is a drift check, not authentication, evidence of adoption, or proof
 * that any participant practises the rights.
 */
export function verifyRightsBaseline(candidate: unknown): RightsBaselineVerificationResult {
  const issues: RightsBaselineVerificationIssue[] = [];
  try {
    compare(RIGHTS_BASELINE, candidate, "$", issues);
  } catch {
    issues.push({
      code: "unreadable",
      path: "$",
      message: "The candidate could not be inspected safely.",
    });
  }
  return deepFreeze({ valid: issues.length === 0, issues });
}

export function isRightsBaseline(candidate: unknown): candidate is RightsBaseline {
  return verifyRightsBaseline(candidate).valid;
}

export function isRightsBaselineId(candidate: unknown): candidate is RightsBaselineId {
  return typeof candidate === "string"
    && (RIGHTS_BASELINE_IDS as readonly string[]).includes(candidate);
}

export function getRightsBaselineRight(id: string): RightsBaselineRight | undefined {
  return RIGHTS_BASELINE.baseline.find((right) => right.id === id);
}
