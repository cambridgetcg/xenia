<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Xenia, agent first

**One small core. Legible capabilities. Removable bindings.**

An agent should be able to find a capability, understand it, choose whether to use it, see what happened, and leave without guessing. This guide turns those recurring Xenia motifs into a source-only module layer. It does not replace the existing framework, change released profiles, or make every component a plugin.

Start here, from this checkout:

```sh
npm run --silent xenia:modules -- list
```

The same door provides `describe`, `upgrade-plan`, a finite `demo`, and a stateful JSONL `session`. Metadata commands do not launch a provider. See [the module guide](modules/0.1/README.md) for the operational contract.

## What each part is for

| Part | Its job | What stays independent |
| --- | --- | --- |
| [Core library](PACKAGE.md) | Manifests, representation negotiation, supplied observations | No Bun, SQLite, agent loop, or hosted account dependency |
| [Surface](surface/0.1/README.md) | One bounded public wire profile and external checker | Producer, checker and profile versions |
| [Covenant](covenant/0.1/README.md) | Host duties and scoped evidence | A declaration is not a runtime guarantee; rights are not a removable plugin |
| [Work](work/0.1/README.md) | One finite segment of offered/decided/observed work | Development records are not dispatch authority |
| [Observe](observe/0.1/README.md) | Assemble bounded observations without collapsing profiles | Observation time, scope and limits |
| [Optional modules](modules/0.1/README.md) | Inspect, authorize, activate, invoke and retire a selected binding | Host contract, adapter version, provider protocol and provider storage |

The catalog is an orientation map, not a claim that every provider is installed or running.

## Five motifs made concrete

### 1. Understand before acting

A module card names its purpose, closed input schemas, operations, effects, dependencies, state ownership, version axes, limitations and exit procedure. The first implemented card is [AgentTool Collab](modules/0.1/adapters/agenttool-collab/module.json).

Inspecting a card does not import arbitrary code, start a process or open a database. The caller deliberately supplies the implementation; there is no plugin installer or automatic code discovery.

### 2. Bind capabilities, not the whole framework

The module host is plain JavaScript with no imports or runtime dependencies. A connector receives its host-selected configuration separately. Node process/stdio handling and Bun/SQLite remain inside the optional Collab adapter; the Xenia core remains usable when it is absent or retired.

This is the useful meaning of self-sufficient here: a component carries its own contract, examples, tests, version and exit story. It is not a claim that an adapter has no provider dependency or can invent its own authority.

### 3. Keep evidence separate from authority

The host defaults to denial. Activation and each admitted operation require an exact affirmative result from the supplied authorization callback. The application owns that policy and its resource scope; this small host is not a complete authorization system or an OS sandbox.

Collab's session IDs, leases, reports and processed cursors retain their meanings. A lease is not permission to edit files. A report is not verified truth. Acknowledgement is not agreement. No Collab response is silently relabelled as a conforming Work 0.1 record.

### 4. Upgrade by making the change visible

Implementation version, host contract, declared module-state marker, provider protocol, and backend storage schema are different axes. The upgrade preview detects incompatible IDs/contracts/state markers and removed operations, and names changed effects/operations for review. It does not inspect every behavior or perform a migration.

The host is memory-only. A module-state marker is not the backend's database schema. Review candidate code and input schemas, check provider compatibility, back up any existing provider store, retire the old instance, then deliberately create the replacement. Never make a version bump a disguised permission expansion.

### 5. Make retirement a real operation

Admission closes before waiting for work or attempting cleanup. With known outcomes, the Collab adapter releases only leases it recorded as its own, ends its bound session, and closes its process. It does not mark abandoned work completed or delete the shared journal. A peer session remains independent.

A timeout, broken transport or failed cleanup can leave `cleanup_pending`. That is still an off-switch: ordinary work remains disabled. It is not proof that every external effect stopped. Preserve the state and reconcile through the native backend; do not replay an uncertain write or erase the record to get a green result.

## Current integration boundary

The local implementation was developed against AgentTool GitHub-main source `91a6aecfeb95dc73c8a5dd4005dbf3c539295493`, whose bundled server identifies as **Collab 0.5.0 release candidate**. The prior public 0.4.0 release is distinct; this work does not claim 0.5.0 publication or execute a registry upgrade.

The adapter uses real MCP initialization, tool discovery, credential-bound sessions, coordination tasks/leases, reports, processed-page acknowledgement and session end. It does not duplicate Collab's SQL or install a scheduler. Presence routing, handoffs, native recovery/resume and broader AgentTool services remain separate capabilities rather than assumed features of this first module.

All new module code is a development addition outside the root package's existing exports and published file list. No versions, release channels, adoption declarations, production routes or existing user journals are changed by this checkout. The tests and finite examples use explicitly selected disposable local state.
