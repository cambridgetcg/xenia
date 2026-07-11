// SPDX-License-Identifier: MPL-2.0

export const PROFILE: "xenia-surface/0.1";
export const MANIFEST_VERSION: "xenia.surface.manifest/0.1";
export const PROBLEM_VERSION: "xenia.surface.problem/0.1";
export const RESULT_VERSION: "xenia.surface.result/0.1";
export const CHECKER_VERSION: "0.1.0-rc.1";
export const CHECKER_USER_AGENT: "xenia-surface-check/0.1.0-rc.1";

export type SurfaceCheckOutcome = "pass" | "fail" | "unknown" | "not_run";
export type SurfaceResultOutcome = "conformant" | "nonconformant" | "indeterminate";
export type SurfaceClaimOutcome = "pass" | "fail" | "unknown";
export type SurfaceFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface SurfaceRequestObservation {
  readonly method: "GET";
  readonly url: string;
  readonly accept: string;
  readonly user_agent: "xenia-surface-check/0.1.0-rc.1";
}

export interface SurfaceResponseObservation {
  readonly status: number;
  readonly content_type: string;
  readonly vary: string;
  readonly decoded_bytes?: number;
  readonly body_sha256?: string;
  readonly duration_ms: number;
}

export interface SurfaceObservation {
  readonly request: SurfaceRequestObservation;
  readonly response?: SurfaceResponseObservation;
  readonly error?: string;
}

export interface SurfaceCheck {
  readonly id: string;
  readonly outcome: SurfaceCheckOutcome;
  readonly expected: string;
  readonly observed: string;
  readonly observation: SurfaceObservation;
}

export interface SurfaceTestedClaim {
  readonly id: string;
  readonly scope: readonly string[];
  readonly evidence_state: "tested";
  readonly outcome: SurfaceClaimOutcome;
  readonly test_ids: readonly string[];
}

export interface SurfaceLimits {
  readonly request_timeout_ms: number;
  readonly total_timeout_ms: number;
  readonly manifest_problem_max_bytes: number;
  readonly resource_max_bytes: number;
}

export interface SurfaceCounts {
  readonly pass: number;
  readonly fail: number;
  readonly unknown: number;
  readonly not_run: number;
}

export interface SurfaceResult {
  readonly schema_version: "xenia.surface.result/0.1";
  readonly profile: "xenia-surface/0.1";
  readonly target: string;
  readonly manifest_url: string;
  readonly verifier: {
    readonly name: "xenia-surface-check";
    readonly version: "0.1.0-rc.1";
  };
  readonly observed_at: string;
  readonly expires_at: string;
  readonly result: SurfaceResultOutcome;
  readonly scope: string;
  readonly limits: SurfaceLimits;
  readonly counts: SurfaceCounts;
  readonly checks: readonly SurfaceCheck[];
  readonly claims: readonly SurfaceTestedClaim[];
  readonly declared_claims: readonly Record<string, unknown>[];
  readonly not_tested: readonly string[];
}

export interface SurfaceCheckOptions {
  readonly fetchImpl?: SurfaceFetch;
  readonly now?: string | number | Date;
  readonly timeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly maxBodyBytes?: number;
}

export interface SurfaceProblemValidationOptions {
  readonly expectedCode?: string;
  readonly manifestUrl?: string;
  readonly resource?: {
    readonly href: string;
    readonly representations: readonly string[];
  };
}

export function validateManifest(manifest: unknown, target: string | URL): string[];
export function validateProblem(
  problem: unknown,
  httpStatus: number,
  options?: SurfaceProblemValidationOptions,
): string[];
export function checkSurface(
  input: string | URL,
  options?: SurfaceCheckOptions,
): Promise<SurfaceResult>;
