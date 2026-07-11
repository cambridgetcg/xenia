// SPDX-License-Identifier: MPL-2.0

export type ManifestIssueCode =
  | "duplicate-key"
  | "empty-value"
  | "invalid-key"
  | "malformed-line"
  | "missing-key"
  | "too-large"
  | "unknown-key";

export interface ManifestIssue {
  readonly code: ManifestIssueCode;
  readonly message: string;
  readonly line?: number;
  readonly key?: string;
}

export interface AgentManifestDocument {
  readonly comments: readonly string[];
  readonly entries: readonly ManifestEntry[];
}

export interface ManifestEntry {
  readonly key: string;
  readonly value: string;
  readonly line: number;
}

export interface ManifestField {
  readonly key: string;
  readonly value: string;
}

export interface ParseManifestOptions {
  readonly maxBytes?: number;
}

export interface ManifestProfile {
  readonly requiredKeys?: readonly string[];
  readonly allowedKeys?: readonly string[];
  readonly uniqueKeys?: readonly string[];
}

export interface ParseManifestResult {
  readonly document: AgentManifestDocument;
  readonly issues: readonly ManifestIssue[];
  readonly valid: boolean;
}

export interface ManifestProfileValidationResult {
  readonly issues: readonly ManifestIssue[];
  readonly valid: boolean;
}

export interface FormatManifestInput {
  readonly comments?: readonly string[];
  readonly entries: readonly ManifestField[];
}

export type NegotiatedVisibleDoorRepresentation =
  | "html"
  | "json"
  | "not-acceptable";

export interface VisibleDoorNegotiationInput {
  readonly accept?: string | null;
  readonly format?: string | null;
}

export interface ProbeResponseSample {
  readonly kind: "response";
  readonly status: number;
  readonly body: string;
  readonly contentType?: string;
  readonly vary?: string;
}

export interface ProbeUnavailableSample {
  readonly kind: "unavailable";
}

export interface ProbeNotObservedSample {
  readonly kind: "not-observed";
}

export type ProbeSample =
  | ProbeNotObservedSample
  | ProbeResponseSample
  | ProbeUnavailableSample;

export interface DoorObservation {
  readonly target: string;
  readonly rootHtml: ProbeSample;
  readonly rootJson: ProbeSample;
  readonly agentTxt: ProbeSample;
  readonly wellKnownAgentTxt: ProbeSample;
  readonly missingHtml: ProbeSample;
  readonly missingJson: ProbeSample;
}

export type ObservedDoorLevel =
  | "indeterminate"
  | "lamp"
  | "partial"
  | "unlit";

export type DoorLampState = "fail" | "pass" | "unknown";

export interface DoorLamp {
  readonly state: DoorLampState;
  readonly detail: string;
}

export type ObservedSignal = "absent" | "present" | "unknown";

export interface DoorObservedSignals {
  readonly consentDocumented: ObservedSignal;
  readonly verificationDocumented: ObservedSignal;
  readonly varyAccept: ObservedSignal;
  readonly wellKnownManifestPresent: ObservedSignal;
}

export interface DoorObservationReport {
  readonly target: string;
  readonly observedDoorLevel: ObservedDoorLevel;
  readonly lampsLit: number;
  readonly lamps: {
    readonly discovery: DoorLamp;
    readonly legibility: DoorLamp;
    readonly dignity: DoorLamp;
  };
  readonly observedSignals: DoorObservedSignals;
  readonly limits: readonly string[];
}
