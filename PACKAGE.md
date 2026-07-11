# XENIA's npm implementation

This repository remains the language-neutral home of the XENIA standard. The
npm package is an optional JS/TS implementation for practising and observing
parts of that standard.

## Current status

`@agenttool/xenia` is a **public open beta implementation** at `0.1.0-beta.2`. Everyone
may read, use, install, test, fork, adapt, discuss, and build with it under the
[repository license map](LICENSES.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for
the deliberately permissionless participation path.

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

The independently versioned `@agenttool/xenia-surface` package distributes the
Node 22+ Surface 0.1 external checker, its programmatic API, and the
release-pinned JSON Schemas. It remains separate because a network conformance
checker has a different runtime, safety boundary, and release cadence from
this pure library.

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
consumer-contract fixtures, runs the library runtime suite, and then runs the
independently versioned Surface checker suite. `npm run pack:check` also invokes
those tests through `prepack`, then inspects a tarball without publishing it; it
does rebuild the ignored `dist/` directory.

## Why the evaluator is pure

An earlier Sinovai hosted checker provided useful evidence, but its transport
accepted arbitrary targets and buffered complete bodies before slicing them.
That hosted probe is now retired. Packaging the same fetcher for server use
would create an unsafe default. This prototype accepts already collected
observations and returns no raw response bodies. A later network adapter needs
an explicit target policy, redirect and DNS revalidation, bounded streaming
reads, timeouts, and runtime-specific tests.

The current Sinovai `agent.txt` also contains bare `GET`/`POST` route lines that
are prose rather than `key: value` fields. A fixture keeps that incompatibility
visible: Sinovai should migrate to a versioned manifest profile before consuming
this parser, rather than teaching the parser one application's undocumented
grammar.

## Release discipline

These protect only the official package name and release channel. They do not
gate implementations, forks, experiments, local installs, or contributions.

The maintainer explicitly selected the controlled `@agenttool` npm scope for
this beta. Each release still needs a clean supported-Node test run, a packed
consumer check, inspection of the exact tarball, and public publication through
npm 2FA with the non-default `beta` tag. Trusted publishing and provenance may
replace the manual path after the first release.

The first `@agenttool/xenia-surface` publication is likewise a bootstrap
release of the already tagged `surface-v0.1.0-rc.1` checker/profile. The npm
package adds distribution metadata, types, and npm-bin-compatible CLI dispatch
without repinning the immutable RC1 schema identifiers. Later Surface
candidates must update checker version, user agent, schema pins, result
constraints, fixtures, and tag together.

Completing the entire XENIA standard, making Sinovai a consumer, shipping every
runtime/format, or reaching `1.0` are not prerequisites for a useful `0.x`
implementation.
