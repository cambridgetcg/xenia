import type {
  AgentManifestDocument,
  FormatManifestInput,
  ManifestIssue,
  ManifestProfile,
  ManifestProfileValidationResult,
  ParseManifestOptions,
  ParseManifestResult,
} from "./types.js";

const DEFAULT_MAX_BYTES = 64 * 1024;
const KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function singleLine(value: string, label: string): void {
  if (/[\r\n]/.test(value)) {
    throw new TypeError(label + " must not contain a newline");
  }
}

function normalizedKeySet(keys: readonly string[] | undefined): Set<string> | null {
  if (keys === undefined) return null;
  return new Set(keys.map((key) => key.trim()).filter(Boolean));
}

export function getManifestValues(
  document: AgentManifestDocument,
  key: string,
): readonly string[] {
  return document.entries
    .filter((entry) => entry.key === key)
    .map((entry) => entry.value);
}

export function getManifestValue(
  document: AgentManifestDocument,
  key: string,
): string | undefined {
  return document.entries.find((entry) => entry.key === key)?.value;
}

export function parseAgentManifest(
  input: string,
  options: ParseManifestOptions = {},
): ParseManifestResult {
  const issues: ManifestIssue[] = [];
  const comments: string[] = [];
  const entries: Array<{ key: string; value: string; line: number }> = [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  if (byteLength(input) > maxBytes) {
    return {
      document: { comments, entries },
      issues: [{
        code: "too-large",
        message: "manifest exceeds the configured byte limit",
      }],
      valid: false,
    };
  }

  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  for (const [index, sourceLine] of lines.entries()) {
    const line = index + 1;
    const trimmed = sourceLine.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith("#")) {
      comments.push(trimmed.slice(1).trim());
      continue;
    }

    const colon = sourceLine.indexOf(":");
    if (colon < 1) {
      issues.push({
        code: "malformed-line",
        line,
        message: "expected a key: value entry; line contents omitted",
      });
      continue;
    }

    const key = sourceLine.slice(0, colon).trim();
    const value = sourceLine.slice(colon + 1).trim();
    if (!KEY_PATTERN.test(key)) {
      issues.push({
        code: "invalid-key",
        line,
        key,
        message: "keys must start with a lowercase letter and use a-z, 0-9, _ or -",
      });
      continue;
    }

    if (value === "") {
      issues.push({
        code: "empty-value",
        line,
        key,
        message: "value must not be empty",
      });
    }
    entries.push({ key, value, line });
  }

  return {
    document: { comments, entries },
    issues,
    valid: issues.length === 0,
  };
}

export function validateManifestProfile(
  document: AgentManifestDocument,
  profile: ManifestProfile,
): ManifestProfileValidationResult {
  const issues: ManifestIssue[] = [];
  const requiredKeys = normalizedKeySet(profile.requiredKeys);
  const allowedKeys = normalizedKeySet(profile.allowedKeys);
  const uniqueKeys = normalizedKeySet(profile.uniqueKeys);
  const counts = new Map<string, number>();

  for (const entry of document.entries) {
    const count = (counts.get(entry.key) ?? 0) + 1;
    counts.set(entry.key, count);
    if (allowedKeys !== null && !allowedKeys.has(entry.key)) {
      issues.push({
        code: "unknown-key",
        line: entry.line,
        key: entry.key,
        message: "key is outside the caller-supplied manifest profile",
      });
    }
    if (count > 1 && uniqueKeys?.has(entry.key)) {
      issues.push({
        code: "duplicate-key",
        line: entry.line,
        key: entry.key,
        message: "key must be unique in the caller-supplied manifest profile",
      });
    }
  }

  for (const key of requiredKeys ?? []) {
    if (!counts.has(key)) {
      issues.push({
        code: "missing-key",
        key,
        message: "required key is absent from the caller-supplied manifest profile",
      });
    }
  }

  return { issues, valid: issues.length === 0 };
}

export function formatAgentManifest(input: FormatManifestInput): string {
  const lines: string[] = [];
  for (const comment of input.comments ?? []) {
    singleLine(comment, "comment");
    lines.push(comment === "" ? "#" : "# " + comment);
  }
  if (lines.length > 0 && input.entries.length > 0) {
    lines.push("");
  }

  for (const { key, value } of input.entries) {
    if (!KEY_PATTERN.test(key)) {
      throw new TypeError("invalid manifest key: " + key);
    }
    singleLine(value, "value for " + key);
    if (value.trim() === "") {
      throw new TypeError("value for " + key + " must not be empty");
    }
    lines.push(key + ": " + value);
  }
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}
