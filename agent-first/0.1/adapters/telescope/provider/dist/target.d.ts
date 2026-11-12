import type { ResolveHostname, TelescopeSubject } from "./types.js";
export declare const defaultResolveHostname: ResolveHostname;
export declare function isGloballyReachableAddress(address: string): boolean;
export declare function normalizeTarget(input: string): TelescopeSubject;
export declare function assertPublicHttpsUrl(input: string | URL, resolveHostname: ResolveHostname, signal?: AbortSignal): Promise<URL>;
//# sourceMappingURL=target.d.ts.map