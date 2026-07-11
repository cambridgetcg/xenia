// SPDX-License-Identifier: MPL-2.0

import {
  evaluateDoorObservation,
  type DoorLampState,
  type DoorObservation,
  type ProbeSample,
} from "@agenttool/xenia";

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

// @ts-expect-error A collected HTTP response must include its body, even if empty.
const missingBody: ProbeSample = { kind: "response", status: 200 };

// @ts-expect-error An unavailable probe cannot also claim an HTTP status.
const contradictory: ProbeSample = { kind: "unavailable", status: 503 };

void missingBody;
void contradictory;
