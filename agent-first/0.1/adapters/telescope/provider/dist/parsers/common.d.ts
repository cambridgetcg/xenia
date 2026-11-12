import type { TelescopeLimits } from "../types.js";
export interface ParseSuccess<T> {
    ok: true;
    value: T;
    warnings: string[];
}
export interface ParseFailure {
    ok: false;
    code: string;
}
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;
export declare function parseFailure(code: string): ParseFailure;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function readBoundedString(value: unknown, maxLength?: number): string | null;
export declare function isExactSemver(value: string): boolean;
export declare function isNpmPackageName(value: string): boolean;
export declare function decodeUtf8(body: Uint8Array): ParseResult<string>;
export declare function parseJsonBody(body: Uint8Array, limits: TelescopeLimits): ParseResult<unknown>;
//# sourceMappingURL=common.d.ts.map