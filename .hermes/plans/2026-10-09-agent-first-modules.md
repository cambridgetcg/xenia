# Xenia agent-first modules implementation plan

Goal: an understandable, runtime-neutral module seam and one operational optional AgentTool Collab connector, with explicit activation, upgrade planning, and retirement. Complete a bounded local implementation; no deployment, package publication, version bump, adoption activation, remote mission or personal database.

## Baselines

- Xenia: current GitHub main 7a6794e1e17dc80770a6ad4294d55cf7171e3de5, isolated clone at this directory on hermes/agent-first-modules.
- AgentTool: current GitHub main 91a6aecfeb95dc73c8a5dd4005dbf3c539295493, selected source snapshot at ../agenttool. The actual self-contained Collab MCP bundle initialized as version 0.5.0 with 33 tools. This is a release candidate, not a claim that 0.5.0 is published.
- Existing Xenia npm test passed its library, Surface and observe suites. Original Xenia, AgentTool and SinovAI worktrees remain outside write scope. No credentials are needed for the disposable integration exercises.

## Architecture and motifs

1. Understand before acting: one catalog/descriptor names purpose, operations, versions, effects, ownership, examples and off-switch. Inspecting it does not start a process.
2. Independent contracts: core library, Surface, Covenant, Work, module host, connector package, MCP and store schema are separate version axes. No additions to released profile schemas or root package exports.
3. Evidence is not authority: an explicit host authorization callback gates activation and invocation. Claims, processing acknowledgement and runtime observations remain distinct.
4. Finite work: no scheduler, agent spawning, automatic action retry or hidden polling. Transport requests are bounded. Unknown mutation outcomes disable new work and require reconciliation.
5. Exit without confiscation: retirement disables admission first, resolves only this module's owned coordination leases where safely established, ends its bound session and closes its process. Preserve the journal; report cleanup_pending instead of inventing completion.

## Files and ownership

- modules/0.1/host.mjs and host.test.mjs: pure descriptor/lifecycle/upgrade-plan module; bounded implementation worker owns these only.
- modules/0.1/catalog.json, cli.mjs, cli.test.mjs: parent-owned agent-facing catalog and one Node command.
- modules/0.1/adapters/agenttool-collab/{adapter.mjs,stdio.mjs,*.test.mjs,module.json}: parent-owned optional connector, using the public MCP protocol and the exact supplied local bundle. Core has no Bun/SQLite/MCP dependency.
- modules/0.1/README.md and AGENT-FIRST.md: concise lifecycle guide, examples, version and retirement table. Parent-owned.
- package.json: add explicit source-development scripts only; preserve package version, published files/exports and existing verification gates.
- README.md: one source-only module-guide link, no release/conformance claim.
- ../evidence/: baseline, real transport schema snapshot, execution/review receipts. Never include session bearer files in model-visible reports.

## Vertical acceptance slices

1. Pure module inspection: write a failing test; implement only descriptor/host inspection; demonstrate no connection/authorization side effects on import or registration.
2. Activation/invocation: explicit affirmative authorization only; reject duplicate activation and concurrent action admission; separate disabled/refused/failed/unknown states. Unknown outcome never authorizes replay.
3. Retirement: disable before awaiting pending work; bounded drain/cleanup; cancellation or failure cannot reactivate the host. Distinguish completed cleanup from pending manual reconciliation; do not erase evidence.
4. Upgrade preview: compare exact module/host-contract/state-schema/operation/effect declarations. Reject incompatible IDs/contracts/state migrations; require review for changed effects and candidate code, and require current retirement before replacement. Do not implement a generic migration engine.
5. Real Collab seam: test first, then lazy stdio initialization, schema discovery, bound session, create/claim/report/observe/ack/release/end against a disposable explicit database. Scope all calls to returned workspace/session IDs. Acknowledgement uses the processed page anchor, never the later journal head. Never pass presence IDs as coordination credentials.
6. CLI and catalog: one JSON entry via npm run xenia:modules -- <command>; list/describe/upgrade-plan work offline with no connector. Explicit demo uses a caller-selected bundle/hash/state directory and creates only synthetic local coordination state.
7. Verify the full Xenia suite, focused module tests, actual two-session communication/cleanup, unchanged core/profile identities and packaging exclusions. Complete a scoped fresh review and inspect its evidence before reporting integration complete.

## Boundaries and limits

Source-only development addition; not Work 0.1 conformance, complete lifecycle automation, hosted collaboration, deployment or a published package. No automatic install, provider selection, credential discovery or current-personal-store access. A module retirement is removal of a software capability, not participant deletion. Generic transport cancellation cannot prove a remote mutation was cancelled. Public module state contains no token or absolute credential-file path. Dependent live leases with uncertain outcomes require explicit recovery using the native backend, not destructive SQL or forced completion.

Development dependencies for the unchanged root tests are reused from the identical local Xenia baseline via an ignored node_modules link; no installation or global configuration change is part of this work. The real Collab gate requires Bun >=1.3 for its pinned self-contained bundle, independently of the dependency-free module host.
