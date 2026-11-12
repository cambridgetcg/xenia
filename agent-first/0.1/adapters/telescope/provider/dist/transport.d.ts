import type { FetchLike, ProbeId, ResolveHostname, SourceObservation, TelescopeLimits } from "./types.js";
type TransportObservation<Id extends string> = Omit<SourceObservation, "id"> & {
    id: Id;
};
export interface FetchedDocument<Id extends string = ProbeId> {
    observation: TransportObservation<Id>;
    body: Uint8Array | null;
    link_header: string | null;
}
export declare class ScanBudget {
    #private;
    readonly limits: TelescopeLimits;
    constructor(limits: TelescopeLimits);
    reserveRequest(): void;
    reserveBytes(bytes: number): void;
}
export declare function fetchDocument<Id extends string>(input: {
    id: Id;
    url: string;
    accept: string;
    fetch: FetchLike;
    resolve_hostname: ResolveHostname;
    budget: ScanBudget;
    limits: TelescopeLimits;
    signal: AbortSignal;
}): Promise<FetchedDocument<Id>>;
export {};
//# sourceMappingURL=transport.d.ts.map