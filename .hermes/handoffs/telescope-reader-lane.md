# File-disjoint XENIA / Telescope contribution

This is a coordination proposal, not an acknowledged lease or authority transfer.

An active peer session is building the shared runtime, native Xenia modules, Local Starter adapter and CLI. This lane leaves `agent-first/0.1/runtime.mjs`, `modules.mjs`, `cli.mjs`, the Local Starter adapter, root package metadata and their tests untouched.

Owned contribution paths:
- `agent-first/0.1/adapters/telescope/`
- `agent-first/0.1/adapters/telescope/test/` during RED–GREEN work; a root `tests/agent-first-telescope.test.mjs` shim only after the owned suite is GREEN, so peer gates are not deliberately left red.
- this handoff and the Telescope-lane plan

Intended seam: `createTelescopeSurfaceModule()` returns the definition shape already accepted by `createModuleRuntime`: id/version/contract/title/motif/description/source/operations. Operation `recognize` is pure and accepts JSON input `{manifest_text: string}`, converting it to UTF-8 bytes for the provider. This matches the shared runtime’s bounded JSON-only contract. Registration stays inert; the shared runtime owns activation, revision, policy, upgrade and retirement.

The adapter uses AgentTool's actual `parseXeniaSurfaceManifestEvidence`, not a copied parser implementation. Source baseline: AgentTool GitHub main `91a6aecfeb95dc73c8a5dd4005dbf3c539295493`; Telescope declares 0.2.3, Apache-2.0, no runtime dependencies. This is source-pinned local integration evidence, not a new package release or live-service claim.

The adapter enforces a 65,536-byte limit before the parser, exposes bounded recognition/counts rather than publisher prose, and keeps schema validation, conformance, evidence verification, consent and authority unestablished. It performs no URL fetch, credential lookup, model call, publication or persistence. Injected code remains trusted host code, not a sandboxed capability.

A provider preparation task owns only a private build directory outside this repository; it must not edit peer-owned files. The contribution will be tested through the shared runtime and against actual compiled upstream source. Core/CLI ownership remains with the peer; any CLI link is a proposed follow-up through that existing entry point, not permission to overwrite it.
