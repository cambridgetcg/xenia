# XENIA Surface 0.1

Status: **candidate profile**

Surface 0.1 is the smallest part of XENIA that an unfamiliar agent can test
from outside a service without credentials. It makes four things exact:

1. where the machine manifest lives;
2. how a bounded list of public GET resources negotiates JSON;
3. how an unpredictable wrong route explains failure;
4. how service claims distinguish assertion, test, and attestation.

Everything else remains outside this profile. A Surface 0.1 pass is not proof
of identity, authorization, consent, privacy, retention, continuity,
portability, economic fairness, or the absence of rankings on untested routes.

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** below name normative
requirements. A checker may report only what it observed.

## 1. Discovery

A service MUST publish a JSON manifest at:

```text
/.well-known/agent.json
```

The response MUST:

- return `200`;
- use `application/json`;
- match [manifest.schema.json](manifest.schema.json);
- use `schema_version: xenia.surface.manifest/0.1`.

Public Surface URLs MUST use HTTPS. The checker permits plaintext HTTP only for
loopback hosts so implementations can run local fixtures without pretending
that an unauthenticated public manifest is safe from network rewriting.
URL strings MUST use lowercase `https://`, or `http://` with `localhost`, an
IPv4 address in `127.0.0.0/8`, or `[::1]`. They MUST NOT embed user credentials.
The candidate schema URLs are pinned to tag `surface-v0.1.0-rc.1`. The project
will not move or reuse that tag; Git hosting does not make a tag physically
immutable, so this is a release policy as well as a URL choice.

`/agent.txt` and `/.well-known/agent.txt` MAY remain as small compatibility
pointers. When present, they SHOULD contain the canonical JSON manifest URL.
They are not parsed for Surface 0.1 conformance.

## 2. Representations

The manifest declares between one and eight same-origin public GET resources.
Resource IDs MUST be unique. Each `href` MUST omit queries and fragments, list
`application/json`, and name a default media type from its own representations.
The checker tests every declared resource with this exact matrix:

| `Accept` request | Required response |
|---|---|
| `application/json` | `2xx application/json` object with non-empty `schema_version` |
| `text/html;q=0, application/json;q=1` | a JSON response with the same shape requirements |
| `application/*;q=1, text/html;q=0.2` | a JSON response with the same shape requirements |
| `*/*` | the declared default representation |
| `text/html` | `2xx text/html` when declared; otherwise a `406` XENIA problem |
| `application/json;q=0.2, text/html;q=1` | `2xx text/html`; sent only when HTML is declared |
| `application/json;q=0, */*;q=1` | `2xx text/html` when declared; otherwise a `406` XENIA problem |
| `application/x-xenia-unsupported` | a `406` XENIA problem |

Every response in the matrix MUST send `Vary: Accept`. Each JSON or problem
body MUST be valid UTF-8. A `406` problem MUST offer at least one action back
to the same resource with method `GET` and one of its declared media types.

This matrix exercises quality values, wildcards, and an explicit `q=0`; a pass
does not establish parser behavior for every possible `Accept` string. Surface
0.1 does not separately probe a physically absent header because Node Fetch
adds `*/*`, so it makes no claim about that unobserved wire case.

The checker does not infer anything about routes absent from `resources`.

`?format=json` MAY exist as a convenience alias. It does not replace correct
`Accept` handling.

## 3. Problems

The checker generates a fresh, unadvertised same-origin route for every run. A
GET to that path with `Accept: application/problem+json` MUST:

- return `404`;
- use `application/problem+json`;
- send `Vary: Accept`;
- match [problem.schema.json](problem.schema.json).

A problem follows the HTTP Problem Details shape, adds a stable code, states
whether retrying unchanged may work, and links its documentation. It MUST
either offer at least one typed `next_action` or explicitly set
`terminal: true`, never both. Here, terminal means the service advertises no safe
machine-callable recovery for this response. It does not mean that recovery is
impossible forever.

Passing this one probe does not establish that every error in the service has
the same shape. The checker reports the exact path it tested.

The generated route-not-found probe is never terminal. It MUST return exactly
one `discover` action pointing to `/.well-known/agent.json` with method `GET`
and accept type `application/json`.

## 4. Claims

Every entry in `manifest.claims` MUST name an `outcome` and one of three
evidence states:

- `asserted`: the service says this; no supporting test or attestation is
  supplied;
- `tested`: the service supplies metadata for a probe or audit it says observed
  the scoped behavior;
- `attested`: the service supplies metadata it labels as a signature or receipt
  binding.

The outcome is `pass`, `fail`, or `unknown`. Evidence state and outcome are
separate axes; an attested report may still record a failed test.

`tested` and `attested` claims MUST carry evidence. An attested claim MUST have
at least one `signature` or `receipt` evidence item. Surface 0.1 does not define
the signed preimage, canonicalization, domain separation, key resolution, or
receipt verification protocol. It therefore does not establish that a declared
binding is cryptographically valid, or that the statement or inputs are true.
Verified attestation belongs in a later cryptographic profile.

Claim IDs MUST be unique. Every evidence expiry MUST be later than its
observation time. Evidence timestamps MUST use uppercase UTC form
`YYYY-MM-DDTHH:mm:ss[.fraction]Z`.

The checker copies service claims into `declared_claims`. It creates separate
`tested` claims from direct probes and never calls its unsigned output
`attested`. It validates the shape of declared evidence metadata but does not
fetch or cryptographically verify that evidence in Surface 0.1; both `tested`
and `attested` labels in `declared_claims` remain service declarations.

The manifest MUST list important boundaries in `not_covered`. Silence is not a
claim of completion.

## 5. Checker result

Run the dependency-free checker with Node 22 or newer:

```sh
node surface/0.1/check.mjs https://example.com
node surface/0.1/check.mjs https://example.com --json
```

The JSON result matches [result.schema.json](result.schema.json) and records the
exact method, URL, `Accept`, and `User-Agent` used for each observation:

- `conformant`: every required observation passed;
- `nonconformant`: at least one required observation definitely failed;
- `indeterminate`: nothing definitely failed, but a timeout, network failure,
  body limit, or dependent check prevented a complete observation.

A result expires after 24 hours. It is a reproducible observation of the named
public GET scope, not a permanent badge.

The checker uses a 5-second request timeout, a 20-second total timeout, 65,536-byte
limits for manifests and problems, a 1,000,000-byte resource limit, no credentials, and
no writes. Every result records the effective limits. It is intended as a local command. A hosted version needs its own
private-network, redirect, DNS-rebinding, concurrency, and abuse boundaries.

The checker itself has no runtime dependency. Install the RC as a development
tool and run it outside the service being observed:

```sh
npm install --save-dev @agenttool/xenia-surface@rc
npx xenia-surface-check https://example.com --json
```

The package also exposes the checker and hand validators to Node programs:

```js
import { checkSurface, validateManifest } from "@agenttool/xenia-surface";
```

The three schemas and example manifest have explicit JSON export paths, such
as `@agenttool/xenia-surface/manifest.schema.json`. The npm release is the
distribution wrapper for the checker and profile pinned by the immutable
`surface-v0.1.0-rc.1` Git tag; packaging does not move or replace those schema
identifiers.

This is a Node 22+ external checker, not a hosted scanning service or a Worker
runtime library. A maximum-size manifest can require more outbound requests
than a Workers Free-plan invocation permits, and hosting it would require
additional private-network, redirect, DNS-rebinding, concurrency, and abuse
controls. The service being checked may itself run on Cloudflare.

The test suite uses Ajv to cross-check emitted documents against the published
JSON Schemas:

```sh
npm install
npm test
```

## Files

- [manifest.schema.json](manifest.schema.json): discovery contract
- [problem.schema.json](problem.schema.json): structured refusal contract
- [result.schema.json](result.schema.json): checker output contract
- [example-manifest.json](example-manifest.json): smallest complete example
- [check.mjs](check.mjs): executable external probe
- [check.test.mjs](check.test.mjs): local fixtures for pass and failure cases
