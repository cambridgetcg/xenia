import type {
  NegotiatedVisibleDoorRepresentation,
  VisibleDoorNegotiationInput,
} from "./types.js";

interface MediaRange {
  readonly type: string;
  readonly subtype: string;
  readonly quality: number;
}

interface Preference {
  readonly quality: number;
  readonly specificity: number;
}

const MEDIA_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function parseQuality(parameters: readonly string[]): number {
  const qualityParameter = parameters.find((parameter) =>
    parameter.trim().toLowerCase().startsWith("q=")
  );
  if (qualityParameter === undefined) return 1;
  const value = Number(qualityParameter.split("=", 2)[1]);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

function parseAccept(header: string): MediaRange[] {
  const ranges: MediaRange[] = [];
  for (const part of header.split(",")) {
    const [mediaType = "", ...parameters] = part.split(";");
    const components = mediaType.trim().toLowerCase().split("/");
    if (components.length !== 2) continue;
    const [type = "", subtype = ""] = components;
    if (
      !MEDIA_TOKEN_PATTERN.test(type)
      || !MEDIA_TOKEN_PATTERN.test(subtype)
    ) continue;
    ranges.push({
      type,
      subtype,
      quality: parseQuality(parameters),
    });
  }
  return ranges;
}

function jsonSpecificity(range: MediaRange): number {
  if (range.type === "*" && range.subtype === "*") return 0;
  if (range.type !== "application") return -1;
  if (range.subtype === "json") return 3;
  if (range.subtype === "*+json") return 2;
  if (range.subtype.endsWith("+json")) return 3;
  if (range.subtype === "*") return 1;
  return -1;
}

function htmlSpecificity(range: MediaRange): number {
  if (range.type === "*" && range.subtype === "*") return 0;
  if (range.type !== "text") return -1;
  if (range.subtype === "html") return 3;
  if (range.subtype === "*") return 1;
  return -1;
}

function bestPreference(
  ranges: readonly MediaRange[],
  specificityFor: (range: MediaRange) => number,
): Preference {
  let best: Preference = { quality: 0, specificity: -1 };
  for (const range of ranges) {
    const specificity = specificityFor(range);
    if (specificity < 0) continue;
    if (
      specificity > best.specificity
      || (specificity === best.specificity && range.quality > best.quality)
    ) {
      best = { quality: range.quality, specificity };
    }
  }
  return best;
}

export function negotiateVisibleDoorRepresentation(
  input: VisibleDoorNegotiationInput = {},
): NegotiatedVisibleDoorRepresentation {
  const explicitFormat = input.format?.trim().toLowerCase();
  if (explicitFormat === "json") return "json";
  if (explicitFormat === "html") return "html";
  if (explicitFormat) return "not-acceptable";

  const accept = input.accept?.trim();
  if (!accept) return "html";
  const ranges = parseAccept(accept);
  const json = bestPreference(ranges, jsonSpecificity);
  const html = bestPreference(ranges, htmlSpecificity);

  if (json.quality === 0 && html.quality === 0) return "not-acceptable";
  if (json.quality > html.quality) return "json";
  return "html";
}

export function mergeVary(
  current: string | null | undefined,
  ...additions: readonly string[]
): string {
  const values: string[] = [];
  const seen = new Set<string>();
  const parts = [current ?? "", ...additions]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of parts) {
    if (value === "*") return "*";
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
      throw new TypeError("invalid Vary field name");
    }
    const normalized = value.toLowerCase();
    if (!seen.has(normalized)) {
      values.push(value);
      seen.add(normalized);
    }
  }
  return values.join(", ");
}
