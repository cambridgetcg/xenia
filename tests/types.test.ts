// SPDX-License-Identifier: MPL-2.0

import {
  evaluateDoorObservation,
  type DoorLampState,
  type DoorObservation,
  type ProbeSample,
} from "@agenttool/xenia";
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

// @ts-expect-error A collected HTTP response must include its body, even if empty.
const missingBody: ProbeSample = { kind: "response", status: 200 };

// @ts-expect-error An unavailable probe cannot also claim an HTTP status.
const contradictory: ProbeSample = { kind: "unavailable", status: 503 };

// @ts-expect-error Surface 0.1 declares only JSON and optional HTML resources.
const unsupportedMediaType: SurfaceMediaType = "application/xml";

void missingBody;
void contradictory;
void unsupportedMediaType;
