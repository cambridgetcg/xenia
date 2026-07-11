# XENIA's npm implementation

This repository remains the language-neutral home of the XENIA standard. The
npm package is an optional JS/TS implementation for practising and observing
parts of that standard.

## Current status

`@sinovai/xenia` is a **private local prototype**. Its name, software license,
public schema, and first semantic version are not release decisions yet.
`private: true` is intentional: local builds and tarball inspection are welcome;
publication is not.

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

## Publication gates

Before removing `private: true`:

1. Confirm control of the `@sinovai` npm scope.
2. Choose a software license for implementation code while retaining
   CC-BY-SA-4.0 for the standard/specification.
3. Reconcile and version the manifest and instructional-error schemas.
4. Add a machine-readable standard version and JSON Schema to `spec.json`; it
   remains outside the package tarball until that contract is intentional.
5. Restore readable Sinovai source/build/tests before making it a package
   consumer.
6. Inspect the packed tarball, bootstrap the first release manually with 2FA,
   then configure trusted/staged publishing with provenance.
