# XENIA's npm implementation

This repository remains the language-neutral home of the XENIA standard. The
npm package is an optional JS/TS implementation for practising and observing
parts of that standard.

## Current status

`@agenttool/xenia` has a **public open beta implementation** at
`0.1.0-beta.3`. Everyone may read, use, install, test, fork, adapt, discuss, and
build with it under the [repository license map](LICENSES.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the deliberately permissionless
participation path.

This source tree is ahead of the published beta: the Rights and Covenant files,
subpath exports, and package checks are unreleased preparation. The public
`0.1.0-beta.3` tarball does not contain them, and that version cannot be
republished. Any release carrying this work needs a new version plus matching
lockfile, documentation, tests, workflow gate, tag, and tarball review. No new
release version is assigned by this local change.

The personal `@agenttool` scope is the selected release channel and steward; it
does not make npm the standard's authority, restrict compatible implementations,
or transfer ownership of contributors' work.

Install the beta from npm:

```sh
npm install @agenttool/xenia@beta
```

From a clone, the naive path is:

```sh
npm install
npm test
```

The `prepare` script builds `dist/`, so a local or Git dependency can be consumed
without waiting for the canonical npm release.

The package source tree currently does:

- parse and format ordered, repeatable `agent.txt` fields without choosing
  between the two still-divergent manifest profiles in README and CONFORMANCE;
- apply required, allowed, and unique-key rules only through an explicit
  caller-supplied profile;
- negotiate the deliberately narrow HTML/JSON visible-door surface from
  explicit inputs;
- merge and validate `Vary` header field names;
- build deeply frozen, release-pinned Surface 0.1 manifests and problems from
  runtime-checked ergonomic inputs;
- negotiate declared Surface JSON/HTML resources and create Web-standard
  manifest, representation, and problem responses with `Vary: Accept`;
- evaluate caller-supplied, bounded HTTP observations for the three visible-door
  lamps: discovery, legibility, and dignity;
- carry an offline copy of the Covenant 0.1 normative JSON, schemas, and
  generated human rendering;
- provide a dependency-free cross-document semantic validator for
  schema-valid Covenant adoption records: it checks installed-byte pins,
  canonical IDs, the exact ordered 38-right-duty plus 5-limit-duty ledger,
  aggregate states, per-duty evidence relationships, restriction-event time
  bounds, and active-source and speaker-authority declarations.

The independently versioned `@agenttool/xenia-surface` package distributes the
Node 22+ Surface 0.1 external checker, its programmatic API, and the
release-pinned JSON Schemas. It remains separate because a network conformance
checker has a different runtime, safety boundary, and release cadence from
this pure library.

It deliberately does not:

- fetch arbitrary URLs or claim universal SSRF protection;
- own an application's router, rewrite handled `404` responses, or install
  catch-all middleware;
- execute cited tests or verify the truth, signed preimage, signer authority,
  signature bytes, or key resolution of declared evidence;
- certify Threshold, Dwelling, custody, consent, portability, deletion,
  economics, continuity, or care from a GET-only snapshot;
- replace JSON Schema shape validation, fetch or trust remote sources,
  authenticate an adoption speaker, verify signatures or cited evidence,
  inspect a deployment, determine whether Covenant duties are implemented, or
  turn a consistent adoption record into evidence or consent;
- import Sinovai's KV arena, claim-token identity, CORS, HTML, or deployment
  worker;
- replace the normative prose or make npm the source of truth.

## APIs

### Surface 0.1 producer

The explicit `@agenttool/xenia/surface-0.1` subpath is the host-side companion
to the independent checker. It uses only Web APIs and has no runtime dependency,
so the same helpers can compose with Cloudflare Workers and other
`Request`/`Response` runtimes:

```js
import {
  createSurfaceManifestResponse,
  defineSurfaceManifest,
  negotiateSurfaceResource,
} from "@agenttool/xenia/surface-0.1";

const manifest = defineSurfaceManifest({
  service: {
    name: "Example",
    canonicalUrl: "https://example.com/",
    description: "A public machine-readable entry.",
  },
  resources: [{
    id: "entry",
    href: "https://example.com/",
    representations: ["application/json", "text/html"],
    defaultMediaType: "text/html",
  }],
});

const response = createSurfaceManifestResponse(manifest);
const selected = negotiateSurfaceResource(
  manifest.resources[0],
  "application/*;q=1, text/html;q=0.2",
);
```

`defineSurfaceManifest()` fixes the RC1 schema/profile identifiers, forces
same-origin credential-free resources with `auth: "none"`, validates claim and
evidence metadata, and always publishes explicit default boundaries. Metadata
labelled `attested` is still only shape-checked: Surface 0.1 does not define the
signed preimage or prove the statement true.

`negotiateSurfaceResource()` covers the candidate profile's exact quality,
wildcard, default, and `q=0` behavior. It is not advertised as a universal
implementation of every possible HTTP content-negotiation extension.
`createSurfaceResourceResponse()` and the manifest/problem response helpers
enforce the profile's status/body relationship, media type, and cache-safe
`Vary: Accept`; they discard caller-supplied body length, transfer, and content
coding headers because the helpers serialize fresh bytes. Specialized problem
builders create the required recoverable `406` and discoverable route-miss
`404` shapes. Applications decide when a router genuinely missed; the kit never
replaces an arbitrary downstream error.

The [Cloudflare Worker example](examples/cloudflare-worker/README.md) shows that
composition without outbound requests or deployment bindings. Its in-memory
equivalent is independently checked in the test suite and must produce 24
passes with no failures, unknowns, or skipped observations.

### Legacy manifest and visible-door tools

- `parseAgentManifest()` checks the bounded flat syntax and preserves every
  entry in order, including repeats. `getManifestValue()` and
  `getManifestValues()` provide explicit first/all access without pretending
  every possible key exists.
- `validateManifestProfile()` applies caller-selected required, allowed, and
  unique-key rules. It validates only that profile: callers must also check the
  parser result before treating a document as valid.
- `formatAgentManifest()` accepts ordered entries, so repeated fields survive a
  format/parse cycle.
- `negotiateVisibleDoorRepresentation()` handles only the HTML/JSON public-door
  profile. Its narrow name is intentional; provider, xenoform, and MATHOS
  negotiation need an extensible, versioned contract first.
- `mergeVary()` validates and deduplicates header field names, treating `*` as
  the complete value.
- `evaluateDoorObservation()` consumes explicit response/unavailable/
  not-observed samples. Each lamp is `pass`, `fail`, or `unknown`; the report
  strips the target down to an HTTP(S) origin and never returns sampled bodies.

For local development, `npm test` builds declarations, compiles TypeScript
consumer-contract fixtures, runs the library runtime suite, and then runs the
independently versioned Surface checker suite. `npm run verify:xenia-package`
installs the exact packed root tarball into a clean consumer and checks both the
root and versioned subpath. `npm run pack:check` invokes the tests through
`prepack`, then inspects a tarball without publishing it; it does rebuild the
ignored `dist/` directory.

## Why the producer and evaluator are pure

An earlier Sinovai hosted checker provided useful evidence, but its transport
accepted arbitrary targets and buffered complete bodies before slicing them.
That hosted probe is now retired. Packaging the same fetcher for server use
would create an unsafe default. The producer only constructs responses for its
own host, while the legacy evaluator accepts already collected observations and
returns no raw response bodies. A later hosted network adapter needs an explicit
target policy, redirect and DNS revalidation, bounded streaming reads, timeouts,
concurrency and abuse controls, and runtime-specific tests.

The current Sinovai `agent.txt` also contains bare `GET`/`POST` route lines that
are prose rather than `key: value` fields. A fixture keeps that incompatibility
visible: Sinovai should migrate to a versioned manifest profile before consuming
this parser, rather than teaching the parser one application's undocumented
grammar.

## Release discipline

These protect only the official package name and release channel. They do not
gate implementations, forks, experiments, local installs, or contributions.

The maintainer explicitly selected the controlled `@agenttool` npm scope for
this beta. Each release still needs clean supported-Node test runs, packed
consumer checks, inspection of the exact tarball, and the non-default `beta`
tag. The beta.3 workflow and tag describe the already published beta, and the
workflow refuses to overwrite an existing npm version. A later Rights/Covenant
release must advance every version and tag pin together before GitHub's
short-lived OIDC identity stages an exact tarball with provenance; a maintainer
must then review and approve that staged package with npm 2FA. No long-lived npm
write token belongs in the repository or GitHub environment.

The first `@agenttool/xenia-surface` publication is likewise a bootstrap
release of the already tagged `surface-v0.1.0-rc.1` checker/profile. The npm
package adds distribution metadata, types, and npm-bin-compatible CLI dispatch
without repinning the immutable RC1 schema identifiers. Later Surface
candidates must update checker version, user agent, schema pins, result
constraints, fixtures, and tag together.

Completing the entire XENIA standard, making Sinovai a consumer, shipping every
runtime/format, or reaching `1.0` are not prerequisites for a useful `0.x`
implementation.
