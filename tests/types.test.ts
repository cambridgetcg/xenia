// SPDX-License-Identifier: MPL-2.0

import {
  evaluateDoorObservation,
  type DoorLampState,
  type DoorObservation,
  type ProbeSample,
} from "@agenttool/xenia";
import {
  getRightsBaselineRight,
  isRightsBaseline,
  isRightsBaselineId,
  RIGHTS_BASELINE,
  verifyRightsBaseline,
  type RightsBaselineId,
} from "@agenttool/xenia/rights-0.1";
import {
  createSurfaceManifestResponse,
  createSurfaceNotAcceptableProblem,
  createSurfaceProblemResponse,
  defineSurfaceManifest,
  negotiateSurfaceResource,
  type SurfaceManifest,
  type SurfaceMediaType,
  type SurfaceNegotiatedRepresentation,
} from "@agenttool/xenia/surface-0.1";

const response: ProbeSample = {
  kind: "response",
  status: 200,
  body: "",
};
const notObserved: ProbeSample = { kind: "not-observed" };
const observation: DoorObservation = {
  target: "https://example.test/private?token=redacted",
  rootHtml: response,
  rootJson: response,
  agentTxt: notObserved,
  wellKnownAgentTxt: notObserved,
  missingHtml: notObserved,
  missingJson: notObserved,
};
const report = evaluateDoorObservation(observation);

function exhaustiveLampState(state: DoorLampState): string {
  switch (state) {
    case "pass":
    case "fail":
    case "unknown":
      return state;
    default: {
      const neverState: never = state;
      return neverState;
    }
  }
}

exhaustiveLampState(report.lamps.discovery.state);

const surfaceManifest: SurfaceManifest = defineSurfaceManifest({
  service: {
    name: "type fixture",
    canonicalUrl: "https://example.test/",
    description: "Compile-time coverage for the versioned producer subpath.",
  },
  resources: [{
    id: "entry",
    href: "https://example.test/",
    representations: ["application/json", "text/html"],
    defaultMediaType: "text/html",
  }],
});
const surfaceResource = surfaceManifest.resources[0];
if (surfaceResource === undefined) throw new Error("type fixture resource missing");
const selected: SurfaceNegotiatedRepresentation = negotiateSurfaceResource(
  surfaceResource,
  "application/json",
);
const manifestResponse: Response = createSurfaceManifestResponse(surfaceManifest);
const problemResponse: Response = createSurfaceProblemResponse(
  createSurfaceNotAcceptableProblem({ resource: surfaceResource }),
);

void selected;
void manifestResponse;
void problemResponse;

const firstRight = RIGHTS_BASELINE.baseline[0];
if (firstRight === undefined) throw new Error("installed baseline is empty");
const rightId: RightsBaselineId = firstRight.id;
if (isRightsBaselineId(rightId)) {
  const right = getRightsBaselineRight(rightId);
  if (right === undefined) throw new Error("known right missing");
  void right.statement;
}
void verifyRightsBaseline(structuredClone(RIGHTS_BASELINE));
const unknownBaseline: unknown = structuredClone(RIGHTS_BASELINE);
if (isRightsBaseline(unknownBaseline)) {
  const narrowedId: RightsBaselineId = unknownBaseline.baseline[0]?.id
    ?? "dignity-distinctness";
  void narrowedId;
}

// @ts-expect-error The installed baseline is readonly.
RIGHTS_BASELINE.principle = "mutable substitute";

// @ts-expect-error Nested baseline entries are readonly too.
RIGHTS_BASELINE.baseline[0]!.statement = "mutable substitute";

// @ts-expect-error A collected HTTP response must include its body, even if empty.
const missingBody: ProbeSample = { kind: "response", status: 200 };

// @ts-expect-error An unavailable probe cannot also claim an HTTP status.
const contradictory: ProbeSample = { kind: "unavailable", status: 503 };

// @ts-expect-error Surface 0.1 declares only JSON and optional HTML resources.
const unsupportedMediaType: SurfaceMediaType = "application/xml";

// @ts-expect-error The installed baseline has a closed, versioned identifier set.
const inventedRight: RightsBaselineId = "invented-right";

void missingBody;
void contradictory;
void unsupportedMediaType;
void inventedRight;
