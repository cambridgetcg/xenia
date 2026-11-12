<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Motifs you can examine and run

From a normally prepared Xenia checkout:

```sh
npm run --silent xenia -- motifs study journey
```

This is one small connection inside the existing CLI, not another framework or
service. The broader `npm run --silent xenia -- motifs` map remains unchanged. These four
studies make part of its **legibility** motif tangible and contrast a terminal
response with its broader **exit** motif.

## Four questions

| Study | Question | Existing mechanism | What it hands on |
|---|---|---|---|
| `arrival` | What is here, and what remains unestablished? | `defineSurfaceManifest` and the manifest Response constructor | A declared resource and its available forms |
| `representation` | Can the same resource answer in the form actually requested? | `negotiateSurfaceResource` and the resource Response constructor | A selected form, or an explicit not-acceptable result |
| `recovery` | What relevant next read can be offered? | The native route-not-found and not-acceptable problem constructors | A discovery or representation proposal, not authority |
| `ending` | Can this interaction simply be complete? | `createSurfaceProblem` with explicit terminal/no-retry inputs | No next action; no invented participant decision |

These names are an interpretation of existing source, not four new normative
Xenia profiles. Each card names its sources, native mechanism, needs, outputs,
connections and limits. “Understanding” here is practical legibility: a reader
can ask what a piece does and how it relates to another, then run a bounded
example. It is not a claim about an inner state.

## One entry point; independently useful pieces

```sh
npm run --silent xenia -- motifs study
npm run --silent xenia -- motifs study show recovery
npm run --silent xenia -- motifs study run representation
npm run --silent xenia -- motifs study journey
```

`study` and `show` only describe. They need Node 22+ and the source files, not a
Surface build, AgentTool, a model, network access, credentials, a service or saved
study state. Source pointers are relative to this repository; copying metadata
does not copy the referenced sources.

`run` and `journey` use the existing compiled Surface library, the same ordinary
Xenia preparation already needed by the local reference demo. If it is missing,
the CLI reports `MOTIF_BUILD_REQUIRED`; it does not install or initialize anything.
Run the normal repository build when wanted. No new dependency is introduced.

Every study starts with its own small fixture. `ending` does not require a prior
arrival; `representation` does not require the journey to have run. No shared
session, ordering obligation or persistent state connects independent invocations.

Programmatic entry points in `motif-studies.mjs` are `listStudies`,
`describeStudy`, `runStudy`, `composeJourney`, and `studyCommand`. Descriptions
are detached copies. The native helper dependency is imported only for execution.

## The connection that actually runs

The combined study constructs and inspects these local values:

```text
wrong-door problem
    → discovery manifest
    → resource + unsupported representation
    → supported representation offered by that problem
    → the same authored message in another form
    → a clearly terminal ending
```

The resource parsed from the actual manifest Response becomes the actual input
to negotiation and recovery. The suggested `accept` value becomes the next local
fixture input. JSON and HTML retain the same authored fixture message; that is a
bounded comparison, not a general proof of semantic equivalence.

Connections are labelled **dataflow**, **comparison**, or **contrast**. The ending
is a counterpoint to recoverable guidance, not a consequence inferred from an HTML
response. No single “coherence” score collapses those different relations.

The `retryable: false` / `terminal: false` combination matters. An unchanged failed
request need not be automatically repeated, while a different supported request
can still be proposed. A proposal is not permission and is never a reason to route
around a denied operation. In this study no advertised URL is fetched at all.

## What is real, and what is a fixture

The native Xenia functions really execute. Their Response status, headers and
bodies are read back. The inputs are explicitly synthetic and the service is
unserved. This is **local value composition**, not an HTTP traffic trace, a router
test, an external observer, or a deployed-service conformance result.

A real host must still distinguish a genuine routing miss from an application's
handled semantic 404. This study exercises the problem constructor; it does not
make that routing decision for an application. The existing
[Cloudflare Worker example](../../examples/cloudflare-worker/README.md) illustrates
that separate host boundary.

No request is sent, suggested action executed, skill activated, external provider imported,
account opened, source file changed or participant enrolled by the study. Importing
Xenia's own code and writing the CLI result to stdout are ordinary program work;
this is not a claim that the surrounding host records nothing. Results belong to
the caller, who may save them separately.

The terminal fixture is a software value. It does not claim that a human refused,
that a module was retired, or that credentials, records or backups were erased.
Standing rights, technical permissions, representations, runtime lifecycle and
participant choices remain distinct.

## Develop, upgrade, or retire a piece

- Keep the question small and attach it to an actual mechanism. Add a source
  pointer and a test before presenting a new name as implemented.
- Keep descriptions readable before activation. Disclose execution dependencies
  and use a fixed local fixture before considering any external boundary.
- Run a study alone, then test the actual values it hands to its neighbors. A
  related source is not automatically a runtime dependency or a causal step.
- Reuse native helpers and their validation. If a helper contract changes, review
  the composition and assertions; do not manufacture the old expected result.
- To omit these studies, remove the optional dispatcher/help item and this study
  module. The broader motif map, module runtime, profiles and adapters are separate.
  There is no study state or background process to clean up; caller-retained output
  is not deleted.
- Keep this repository-only addition outside published package exports and profile
  versioning until a separately reviewed release is intended.

## Sources and checks

- [Surface implementation](../../src/surface-0.1.ts): exact constructors,
  negotiation and response headers used here.
- [Framework orientation](../../README.md#ai--agent-interaction--the-threshold):
  discovery, legibility, authority and evidence as distinct concerns.
- [Contribution practice](../../CONTRIBUTING.md#build-with-love): naive path,
  error path and useful continuation.
- [Rights baseline](../../RIGHTS.md): standing, refusal, limits and truthful
  self-description. The study neither changes nor automatically adopts it.
- [Broader motif map](motifs.json): conceptual neighbors, not a workflow engine.

Focused checks:

```sh
node --test tests/agent-first-motif-studies.test.mjs tests/agent-first-motifs.test.mjs tests/agent-first-cli.test.mjs
```

Tests exercise actual native helper values, representation exclusions, relevant
recovery links, a terminal boundary, dataflow and contrast, detached descriptions,
no fetch calls during the journey, the existing CLI, and a canonical temporary
copy with no build/provider and an absent HOME. Removing the optional study module
from that fixture leaves the core catalogue working. The existing CLI's arbitrary
symlink-entry behavior is not changed by this addition.

The normal full repository suite and both generated Covenant checks remain the
combined gate. Neither passing these checks nor reading this document establishes
whole-framework practice, identity, authority, consent or a live deployment.
