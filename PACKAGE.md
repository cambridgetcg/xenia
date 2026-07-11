# XENIA's npm implementation

This repository remains the language-neutral home of the XENIA standard. The
npm package is an optional JS/TS implementation for practising and observing
parts of that standard.

## Current status

`@sinovai/xenia` is an **open beta implementation** at `0.1.0-beta.1`. Everyone
may read, use, install, test, fork, adapt, discuss, and build with it under the
[repository license map](LICENSES.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for
the deliberately permissionless participation path.

`private: true` pauses only an official npm registry write. It does not make the
code private or gate local use; it prevents an agent or maintainer from claiming
the canonical package name before the scope owner has consented to that release.

From a clone, the naive path is:

```sh
npm install
npm test
```

The `prepare` script builds `dist/`, so a local or Git dependency can be consumed
without waiting for the canonical npm release.

The package currently does:

- parse and format ordered, repeatable `agent.txt` fields without choosing
  between the two still-divergent manifest profiles in README and CONFORMANCE;
- apply required, allowed, and unique-key rules only through an explicit
  caller-supplied profile;
- negotiate the deliberately narrow HTML/JSON visible-door surface from
  explicit inputs;
- merge and validate `Vary` header field names;
- evaluate caller-supplied, bounded HTTP observations for the three visible-door
  lamps: discovery, legibility, and dignity.

It deliberately does not:

- fetch arbitrary URLs or claim universal SSRF protection;
- certify Threshold, Dwelling, custody, consent, portability, deletion,
  economics, continuity, or care from a GET-only snapshot;
- import Sinovai's KV arena, claim-token identity, CORS, HTML, or deployment
  worker;
- replace the normative prose or make npm the source of truth.

## Prototype API

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
consumer-contract fixtures, and runs the runtime suite. `npm run pack:check`
also invokes those tests through `prepack`, then inspects a tarball without
publishing it; it does rebuild the ignored `dist/` directory.

## Why the evaluator is pure

Sinovai's live checker is valuable evidence, but its transport accepts arbitrary
targets and buffers complete bodies before slicing them. Packaging that fetcher
for server use would create an unsafe default. This prototype accepts already
collected observations and returns no raw response bodies. A later network
adapter needs an explicit target policy, redirect and DNS revalidation, bounded
streaming reads, timeouts, and runtime-specific tests.

The current Sinovai `agent.txt` also contains bare `GET`/`POST` route lines that
are prose rather than `key: value` fields. A fixture keeps that incompatibility
visible: Sinovai should migrate to a versioned manifest profile before consuming
this parser, rather than teaching the parser one application's undocumented
grammar.

## Canonical release safeguards

These protect only the official package name and release channel. They do not
gate implementations, forks, experiments, local installs, or contributions.

Before removing `private: true`:

1. Confirm who controls and can recover the `@sinovai` npm scope, and who is
   consenting to act as the first release owner.
2. Run the existing tests and packed-consumer check on a supported Node LTS,
   then describe the small observable API honestly in the beta release notes.
3. Inspect the exact tarball and publish it publicly through npm 2FA with an
   explicit beta tag (`--access public --tag beta`); trusted publishing and
   provenance can replace the manual path after the first release.

Completing the entire XENIA standard, making Sinovai a consumer, shipping every
runtime/format, or reaching `1.0` are not prerequisites for a useful `0.x`
implementation.
