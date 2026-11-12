# Xenia motif journey implementation plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make four source-grounded Xenia motifs independently understandable and runnable, and connect their real native-function outputs in one offline study through the existing agent-first CLI.

**Architecture:** A small repository-only motif module holds source-linked descriptions and builds local values using existing Surface 0.1 functions. It does not implement another router, HTTP client, lifecycle runtime, conformance checker or authority system. The existing CLI retains its separately authored `motifs` map and gains one lazy `motifs study` branch; existing commands remain usable if that optional study module is absent.

**Tech Stack:** Node ESM, the existing built Xenia Surface helpers, Web-standard Response objects, node:test. No new dependencies, provider, server, account, credentials, network requests or installation.

---

## Source basis

- Tracked base: Xenia 7a6794e1e17dc80770a6ad4294d55cf7171e3de5; tracked source/prose/example diff initially empty.
- Existing agent-first CLI baseline SHA-256: 41521b6798f89ca486a3182278096af685d3238c094a79831ccf1dc277572203. Recheck before applying the small shared-file patch.
- Native APIs: defineSurfaceManifest; negotiateSurfaceResource; createSurfaceManifestResponse; createSurfaceResourceResponse; createSurfaceRouteNotFoundProblem; createSurfaceNotAcceptableProblem; createSurfaceProblem; createSurfaceProblemResponse.
- Source meanings: README's discovery and legibility sections; CONTRIBUTING's naive/error/continuation paths; RIGHTS' autonomy, truthful description and refusal/rest boundaries; Surface 0.1's separate normative contract.

## Motifs

- Arrival: make the available resources and limits legible without claiming they are hosted or verified.
- Representation: honor the requested form and exclusions without classifying the visitor by identity or kind.
- Recovery: a recoverable problem offers a relevant next read, not blame, permission, or an automatic retry.
- Ending: an explicit terminal result offers no next action and needs no invented human refusal or successful completion.

These names are an interpretation of existing mechanisms, not new normative profiles. Each description names its question, native mechanism, input/output, source and limits. Each study is a standalone local function exercise. A combined journey passes the same resource/manifest through the stages; it must label synthetic inputs and actual local helper execution, never simulated remote service evidence.

## Owned changes

Create:
- agent-first/0.1/motif-studies.mjs
- tests/agent-first-motif-studies.test.mjs
- agent-first/0.1/MOTIF-STUDIES.md

Modify only the narrow lazy dispatch/help surface in:
- agent-first/0.1/cli.mjs

Keep runtime, other adapters, profile schemas, normative rights, package versions/exports, schedules and accounts unchanged. No commit, push or publication.

## Test-first slices

1. RED→GREEN: independently descriptive, detached motif cards, sources and unknown-ID error. Metadata must not require a built Surface library or an AgentTool provider.
2. RED→GREEN per behavior: native arrival manifest; requested representation and q=0 exclusion; native 404/406 guidance; native terminal problem. Use actual helpers, not invented protocol output.
3. RED→GREEN: a bounded local-value journey connects actual outputs, preserves one resource across representation/recovery, and stops at the terminal result. No fetch, automatic execution of links or third-party callbacks.
4. RED→GREEN: existing CLI `motifs` list/show/run/journey commands, help, unknown input, and isolation from optional providers. Existing catalog/demo behavior stays intact. Metadata stays usable without build dependencies; removing the motif module leaves other CLI metadata working.
5. Source-linked guide: one entry point; what each motif does alone and with its neighbors; fixture/execution/interpretation distinctions; upgrade/retirement notes and limits.

## Concurrent-source and fixture adjustments

The shared CLI gained context commands, an informative `motifs.json` map and a root `xenia` script after initial inspection. The isolated dependency snapshot was rebased to preserve these contributions. This slice now owns `motif-studies.mjs`, its uniquely named test, and `MOTIF-STUDIES.md`; it only inserts the lazy `motifs study` dispatcher/help item into the CLI. The broader map remains byte-for-byte unchanged by this slice. A fuzzy patch against an obsolete single-line help list was caught as a syntax failure only in the isolated copy and replaced by a narrow insertion against the current list. No shared code was changed by that failed patch.

The independent metadata fixture uses a canonical temporary directory. On macOS, the existing CLI direct-entry guard compares a canonical module URL with argv, so the `/var` alias caused an empty successful exit in the copied fixture; canonicalizing only the fixture restored the intended test. This slice does not claim to fix or support arbitrary symlinked CLI entry paths.

## Verification and delivery

Run focused new tests, existing CLI tests, canonical npm test with the already reviewed optional Skills provider, both generated Covenant checks, and the real CLI journey. Capture exact candidate hashes and request bounded independent review. Preserve current shared edits, promote only the new owned files, apply only the checked CLI hunks, then rerun the combined gate. A review of earlier bytes cannot clear a later change.
