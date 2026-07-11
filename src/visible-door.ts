import { getManifestValue, parseAgentManifest } from "./manifest.js";
import type {
  DoorLamp,
  DoorLampState,
  DoorObservation,
  DoorObservationReport,
  ObservedDoorLevel,
  ObservedSignal,
  ProbeResponseSample,
  ProbeSample,
} from "./types.js";

const INSPECTION_BODY_LIMIT = 64 * 1024;
const ACTION_NODE_LIMIT = 512;
const ACTION_DEPTH_LIMIT = 16;
const MANIFEST_REFERENCE_KEYS = new Set([
  "agent-door",
  "covenant",
  "discover",
  "human-door",
  "register",
  "schema",
  "wake",
]);
const LIMITS = Object.freeze([
  "GET-only public-door evidence",
  "heuristic visible-door checks, not a versioned manifest-profile validation",
  "does not establish identity custody or consent",
  "does not establish state portability or deletion",
  "does not inspect authenticated error paths",
  "does not establish economics, continuity, care, or full XENIA conformance",
]);

function isResponse(sample: ProbeSample): sample is ProbeResponseSample {
  return sample.kind === "response"
    && Number.isInteger(sample.status)
    && sample.status >= 100
    && sample.status <= 599;
}

function bodyOf(sample: ProbeSample): string {
  return isResponse(sample)
    ? (sample.body ?? "").slice(0, INSPECTION_BODY_LIMIT).trim()
    : "";
}

function mediaTypeOf(sample: ProbeSample): string {
  if (!isResponse(sample)) return "";
  return (sample.contentType ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function hasJsonContentType(sample: ProbeSample): boolean {
  return /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/i.test(mediaTypeOf(sample));
}

function hasManifestContentType(sample: ProbeSample): boolean {
  return mediaTypeOf(sample) === "text/plain" || mediaTypeOf(sample) === "text/agent";
}

function successful(sample: ProbeSample): sample is ProbeResponseSample {
  return isResponse(sample) && sample.status >= 200 && sample.status < 300;
}

function errorStatus(sample: ProbeSample): sample is ProbeResponseSample {
  return isResponse(sample) && sample.status >= 400 && sample.status < 600;
}

function parsedStructuredJson(
  sample: ProbeSample,
): { readonly valid: boolean; readonly value?: object } {
  const body = bodyOf(sample);
  if (body === "") return { valid: false };
  try {
    const value: unknown = JSON.parse(body);
    return value !== null && typeof value === "object"
      ? { valid: true, value }
      : { valid: false };
  } catch {
    return { valid: false };
  }
}

function hasVaryAccept(sample: ProbeSample): boolean {
  if (!isResponse(sample)) return false;
  return (sample.vary ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === "accept" || value === "*");
}

function manifestIsReal(
  sample: ProbeSample,
  missingBodies: ReadonlySet<string>,
): boolean {
  const body = bodyOf(sample);
  if (
    !successful(sample)
    || !hasManifestContentType(sample)
    || body === ""
    || /<!doctype|<html/i.test(body)
    || missingBodies.has(body)
  ) {
    return false;
  }

  const parsed = parseAgentManifest(body);
  return parsed.valid
    && parsed.document.entries.length >= 2
    && (getManifestValue(parsed.document, "name")?.trim() ?? "") !== ""
    && parsed.document.entries.some((entry) =>
      MANIFEST_REFERENCE_KEYS.has(entry.key)
      && (
        /https?:\/\/[^\s]+/i.test(entry.value)
        || /(?:^|\s)(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\s+\/\S+/i.test(entry.value)
        || /^(?:\/|\.\/|\.\.\/)\S+/.test(entry.value.trim())
      )
    );
}

function actionableReference(value: unknown): boolean {
  return typeof value === "string"
    && /^(?:https?:\/\/|\/|\.\/|\.\.\/)/.test(value.trim());
}

function actionableInstruction(value: unknown): boolean {
  if (typeof value === "string") {
    const action = value.trim();
    return actionableReference(action)
      || /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\s+\/\S+/i.test(action)
      || /^(?:contact|discover|open|retry|visit)$/i.test(action);
  }
  return false;
}

function actionableJsonValue(root: unknown): boolean {
  if (actionableInstruction(root)) return true;
  const pending: Array<{ readonly depth: number; readonly value: unknown }> = [
    { depth: 0, value: root },
  ];
  let visited = 0;

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index];
    if (item === undefined || ++visited > ACTION_NODE_LIMIT) return false;
    if (
      item.depth > ACTION_DEPTH_LIMIT
      || item.value === null
      || typeof item.value !== "object"
    ) continue;

    if (Array.isArray(item.value)) {
      for (const nested of item.value) {
        pending.push({ depth: item.depth + 1, value: nested });
      }
      continue;
    }

    for (const [key, nested] of Object.entries(item.value)) {
      if (
        /^(?:endpoint|href|path|url)$/i.test(key)
        && actionableReference(nested)
      ) return true;
      if (
        /^(?:action|contact|discover|open|retry|visit)$/i.test(key)
        && actionableInstruction(nested)
      ) return true;
      if (nested !== null && typeof nested === "object") {
        pending.push({ depth: item.depth + 1, value: nested });
      }
    }
  }
  return false;
}

function guidedJsonError(sample: ProbeSample): boolean {
  if (!errorStatus(sample) || !hasJsonContentType(sample)) return false;
  const parsed = parsedStructuredJson(sample);
  if (!parsed.valid || parsed.value === undefined || Array.isArray(parsed.value)) {
    return false;
  }
  const value = parsed.value as Record<string, unknown>;
  const alternative = value.but_you_can;
  return (
    (
      Array.isArray(value.next_actions)
      && value.next_actions.some(actionableJsonValue)
    )
    || (
      alternative !== null
      && typeof alternative === "object"
      && !Array.isArray(alternative)
      && actionableJsonValue(alternative)
    )
    || actionableReference(value.docs)
  );
}

function guidedHtmlError(sample: ProbeSample): boolean {
  if (!errorStatus(sample) || mediaTypeOf(sample) !== "text/html") return false;
  const body = bodyOf(sample);
  const hrefs = [...body.matchAll(/href\s*=\s*(["'])(.*?)\1/gi)]
    .map((match) => match[2] ?? "");
  const actionableLink = hrefs.some((href) =>
    /(?:^|\/)agent\.txt(?:[/?#]|$)|(?:^|\/)docs?(?:[/?#]|$)|(?:^|\/)api(?:[/?#]|$)|[?&]format=json/i.test(href)
  );
  const machineAction = /data-(?:next-action|agent-door)=["'][^"']+["']/i.test(body);
  return actionableLink || machineAction;
}

function lamp(
  state: DoorLampState,
  details: Readonly<Record<DoorLampState, string>>,
): DoorLamp {
  return { state, detail: details[state] };
}

function observedLevel(states: readonly DoorLampState[]): ObservedDoorLevel {
  const lampsLit = states.filter((state) => state === "pass").length;
  if (lampsLit === states.length) return "lamp";
  if (lampsLit > 0) return "partial";
  if (states.includes("unknown")) return "indeterminate";
  return "unlit";
}

function manifestSignals(
  samples: readonly ProbeSample[],
): {
  readonly consentDocumented: ObservedSignal;
  readonly verificationDocumented: ObservedSignal;
} {
  if (samples.length === 0) {
    return {
      consentDocumented: "unknown",
      verificationDocumented: "unknown",
    };
  }
  const documents = samples.map((sample) =>
    parseAgentManifest(bodyOf(sample)).document
  );
  const consent = documents.some((document) =>
    getManifestValue(document, "consent")?.trim()
  );
  const verification = documents.some((document) =>
    (
      getManifestValue(document, "verify")
      ?? getManifestValue(document, "verification")
    )?.trim()
  );
  return {
    consentDocumented: consent ? "present" : "absent",
    verificationDocumented: verification ? "present" : "absent",
  };
}

function signalFromSamples(
  samples: readonly ProbeSample[],
  present: boolean,
): ObservedSignal {
  if (present) return "present";
  return samples.every(isResponse) ? "absent" : "unknown";
}

function sanitizeTarget(target: string): string {
  try {
    const url = new URL(target);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : "invalid-target";
  } catch {
    return "invalid-target";
  }
}

export function evaluateDoorObservation(
  observation: DoorObservation,
): DoorObservationReport {
  const missingBodies = new Set([
    bodyOf(observation.missingHtml),
    bodyOf(observation.missingJson),
  ].filter(Boolean));
  const agentTxtReal = manifestIsReal(observation.agentTxt, missingBodies);
  const wellKnownReal = manifestIsReal(
    observation.wellKnownAgentTxt,
    missingBodies,
  );
  const discoveryState: DoorLampState = agentTxtReal || wellKnownReal
    ? "pass"
    : isResponse(observation.agentTxt)
        && isResponse(observation.wellKnownAgentTxt)
      ? "fail"
      : "unknown";

  const rootJson = parsedStructuredJson(observation.rootJson);
  const htmlObserved = isResponse(observation.rootHtml);
  const jsonObserved = isResponse(observation.rootJson);
  const htmlValid = successful(observation.rootHtml)
    && mediaTypeOf(observation.rootHtml) === "text/html"
    && hasVaryAccept(observation.rootHtml);
  const jsonValid = successful(observation.rootJson)
    && hasJsonContentType(observation.rootJson)
    && rootJson.valid
    && hasVaryAccept(observation.rootJson);
  const knownLegibilityFailure = (htmlObserved && !htmlValid)
    || (jsonObserved && !jsonValid)
    || (
      htmlObserved
      && jsonObserved
      && bodyOf(observation.rootJson) === bodyOf(observation.rootHtml)
    );
  const legibilityState: DoorLampState = knownLegibilityFailure
    ? "fail"
    : htmlObserved && jsonObserved
      ? "pass"
      : "unknown";

  const guidedHtml = isResponse(observation.missingHtml)
    ? guidedHtmlError(observation.missingHtml)
    : null;
  const guidedJson = isResponse(observation.missingJson)
    ? guidedJsonError(observation.missingJson)
    : null;
  const dignityState: DoorLampState = guidedHtml === false || guidedJson === false
    ? "fail"
    : guidedHtml === true && guidedJson === true
      ? "pass"
      : "unknown";

  const documented = manifestSignals([
    ...(agentTxtReal ? [observation.agentTxt] : []),
    ...(wellKnownReal ? [observation.wellKnownAgentTxt] : []),
  ]);
  const states = [discoveryState, legibilityState, dignityState] as const;

  return {
    target: sanitizeTarget(observation.target),
    observedDoorLevel: observedLevel(states),
    lampsLit: states.filter((state) => state === "pass").length,
    lamps: {
      discovery: lamp(discoveryState, {
        pass: agentTxtReal
          ? "real /agent.txt manifest observed"
          : "real /.well-known/agent.txt manifest observed",
        fail: "no distinct plain-text agent manifest observed",
        unknown: "one or more manifest probes were unavailable or not observed",
      }),
      legibility: lamp(legibilityState, {
        pass: "the root returned distinct structured JSON with cache-safe negotiation",
        fail: "the negotiated machine representation was absent, invalid, primitive, identical to HTML, or missing Vary: Accept",
        unknown: "one or more root representations were unavailable or not observed",
      }),
      dignity: lamp(dignityState, {
        pass: "both sampled wrong-door representations returned actionable recovery paths",
        fail: "a sampled wrong-door representation was not an actionable error",
        unknown: "one or more wrong-door representations were unavailable or not observed",
      }),
    },
    observedSignals: {
      consentDocumented: documented.consentDocumented,
      verificationDocumented: documented.verificationDocumented,
      varyAccept: signalFromSamples(
        [observation.rootHtml, observation.rootJson],
        hasVaryAccept(observation.rootHtml) || hasVaryAccept(observation.rootJson),
      ),
      wellKnownManifestPresent: signalFromSamples(
        [observation.wellKnownAgentTxt],
        wellKnownReal,
      ),
    },
    limits: LIMITS,
  };
}
