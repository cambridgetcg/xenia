import type { DiscoveryAdapter, FetchLike, ResolveHostname, TelescopeLimits } from "./types.js";
declare const XENIA_SURFACE_PROFILE = "xenia-surface/0.1";
declare const XENIA_SURFACE_MANIFEST_VERSION = "xenia.surface.manifest/0.1";
export interface XeniaSurfaceManifestSummary {
    schema_version: typeof XENIA_SURFACE_MANIFEST_VERSION;
    profile: typeof XENIA_SURFACE_PROFILE;
    service_canonical_origin: string;
    resource_count: number;
    html_resource_count: number;
    declared_claim_count: number;
    declared_asserted_claim_count: number;
    declared_tested_claim_count: number;
    declared_attested_claim_count: number;
    declared_pass_claim_count: number;
    declared_fail_claim_count: number;
    declared_unknown_claim_count: number;
    not_covered_count: number;
}
export type XeniaSurfaceManifestParseResult = {
    ok: true;
    value: XeniaSurfaceManifestSummary;
} | {
    ok: false;
    code: "invalid_utf8" | "invalid_json" | "json_complexity_limit" | "xenia_surface_manifest_not_object" | "xenia_surface_profile_mismatch" | "xenia_surface_manifest_shape_unrecognized";
};
export interface XeniaSurfaceAdapterOptions {
    fetch?: FetchLike;
    resolve_hostname?: ResolveHostname;
}
/**
 * Recognizes the release-pinned Surface 0.1 markers and only the bounded fields
 * Telescope reports. This is deliberately not the XENIA Surface conformance
 * checker and does not validate or follow declared evidence.
 */
export declare function parseXeniaSurfaceManifestEvidence(body: Uint8Array, limits?: TelescopeLimits): XeniaSurfaceManifestParseResult;
/**
 * Creates one opt-in Telescope discovery adapter for the canonical XENIA
 * Surface 0.1 manifest path. It makes no declared resource, problem-route,
 * evidence, Covenant, authorization, or action request.
 */
export declare function createXeniaSurfaceAdapter(options?: XeniaSurfaceAdapterOptions): DiscoveryAdapter;
export {};
//# sourceMappingURL=xenia-surface.d.ts.map