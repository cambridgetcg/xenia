# Motif composition implementation plan

> For Hermes: implement vertical RED/GREEN slices; use isolated workers for native verification and independent review. No automatic commits or publication.

Goal: turn existing Xenia motifs into independently callable capabilities and wire them through the existing module host, without another runtime.

Architecture: extend `modules/0.1/host.mjs`'s existing admission/lifecycle contract. Keep Surface, Covenant, Work, and optional Collab implementations native. Add data-only finite composition with links, DAG validation, bounded parallelism, and per-host serialization. The existing `xenia:modules` CLI remains the only front door. Metadata and plans do not activate anything.

Workspace: this private snapshot of `/Users/yuai/Projects/xenia-agent-first/xenia`. Integration back is conditional on original-file checksum comparison using the adjacent `xenia-baseline.json`. Do not overwrite concurrent changes. Do not modify the separate `/Users/yuai/Projects/xenia` runtime or dirty AgentTool checkout.

1. Add a failing native Surface motif test in `modules/0.1/motifs.test.mjs`; run it. Implement `motifs/surface.mjs`, the small pure connector seam, and `motifs.mjs` using `createModuleHost`. Build root TypeScript locally and rerun.
2. Add native Covenant/Work motif tests, run RED, implement separate motif files calling their existing functions, run GREEN. Keep profile, root-package, and module versions distinct.
3. Add one failing output-to-input composition test in `composition.test.mjs`; implement `composition.mjs` with strict bounded plain-JSON input, closed graph schema, known operations, explicit links and cycle checks before invocation. No evaluation/imports named in a plan.
4. Add RED/GREEN tests for parallel independent nodes, serialization of a shared host, multiple host instances, cancellation, failed dependencies, no retries, missing output paths, unsafe keys, invalid graphs, and uncertain outcomes. Preflight before effects; drain already admitted work and leave honest receipts.
5. Add CLI RED/GREEN tests. Extend `cli.mjs` minimally with `motifs`, `invoke`, `compose` (preview by default, explicit `--run`), and a finite `compose-demo`. Retain current list/session/demo behavior and explicit Collab configuration/authorization.
6. Execute native Collab-backed graph in a new private DB; retain journal and safe report, never bearer content. Independent workers cover a broader native lifecycle and AgentTool fundamentals.
7. Run original + new tests, root `npm test`, both generated Covenant checks, and real Collab seam tests. Run independent review, fix regressions with reproducer-first tests, then compare source checksums before narrow integration and rerun delivered entry points.

Acceptance: isolated motif imports work; native results are connected, not simulated; plan order can be rearranged; concurrency scales down/up within 1–8; repeated instances and optional Collab can be swapped via explicit host bindings; no installs, model calls, external publication, payments, hidden activation, implicit cursor acknowledgement or mutation retry. Errors distinguish not-started work from unknown outcomes. Retirement preserves native records.

Coverage limit: current GitHub main SHA was observed, but its source download was blocked and is not retried. Installed Collab 0.5.0 and existing local source are the tested versions; do not claim latest-upstream coverage.
