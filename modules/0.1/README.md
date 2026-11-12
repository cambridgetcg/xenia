<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Optional modules · source-only 0.1 development

This is a small host seam beside Xenia's existing library and profiles—not a new agent runtime, released wire standard, or conformance badge. It has no global registry, scheduler, automatic installation or model-provider dependency.

## One entry

From the checkout, `npm run --silent xenia:modules -- help` describes the commands. `list` is the safe default; `describe agenttool-collab` returns the complete machine-readable card, including input schemas, effects and exit steps.

- `list` / `describe`: read declarations only, with no provider startup.
- `motifs [id]`: read the connected design atlas or one self-contained card. The canonical data also renders [MOTIFS.md](../../MOTIFS.md).
- `upgrade-plan <candidate-json> [state]`: inert comparison. Omitted state is unknown. The supplied state is a caller assertion, not observation of a running host.
- `demo --bundle ABS --sha256 HEX --state-dir ABS`: one real, finite, synthetic Collab exercise. The state directory must not already exist. It is retained for inspection afterward.
- `session --config ABS_JSON [--allow-local-state]`: a stateful JSONL door for agents. Without the explicit flag, the host refuses activation. Reading its configuration is not provider startup.

The Node command delegates lifecycle to the same [host.mjs](host.mjs) that programmatic callers use. It does not reimplement Collab's store.

## Components and ownership

| File | Responsibility |
| --- | --- |
| `catalog.json` | Where the framework's existing parts belong; not observed runtime status |
| `host.mjs` | Descriptor validation, explicit authorization, one admitted operation, retirement fence, upgrade preview |
| `cli.mjs` | Node command/JSONL presentation only |
| `adapters/agenttool-collab/module.json` | Purpose, typed inputs, versions, effects, data ownership and exit contract |
| `adapters/agenttool-collab/adapter.mjs` | Bind a selected native endpoint; translate the small declared operation set |
| `adapters/agenttool-collab/stdio.mjs` | Optional bounded local JSON-RPC transport; no shell or automatic retry |

Code, tests and runtime configuration use MPL 2.0 under the root license map. This prose and the interpretive design data in `motifs.json` use CC BY-SA 4.0. The separately selected AgentTool implementation is Apache-2.0 and is not vendored into this module.

## Programmatic contract

`createModuleHost(descriptor, {connect, authorize, timeoutMs})` is inert. The descriptor has exactly `id`, `version`, `contract_version`, `state_schema_version`, `operations`, and `effects`. `connect` is a supplied async factory, not a script named by metadata. It returns `invoke`, `retire` and `disconnect` methods. No source supplied by a guest is evaluated.

- `inspect()` returns detached descriptor/state/admission/busy/cleanup metadata.
- `activate()` invokes no connector unless authorization returns exactly `true`.
- `invoke(operation, input)` admits only declared operations, with fresh authorization and no concurrent mutation queue.
- `retire()` closes admission synchronously, then bounds waiting/cleanup/disconnect. Its `{complete}` result is cached; a repeated call does not replay cleanup.
- `planUpgrade(current, candidate, {state})` returns declared compatibility, changes, blocking state and review requirements. It neither replaces a running module nor migrates data.

Invocation input is validated, detached and recursively frozen before policy evaluation. `authorize` receives `{phase, module_id, operation, effects, input}` for invocation; policy and provider see the same admitted snapshot.

An authorization callback is supplied by the actual host. The finite demo's affirmative callback is scoped to its newly created synthetic workspace; it is not a production policy to copy indiscriminately.

## State and exit

| State | Meaning / next step |
| --- | --- |
| `disabled` | No active binding; inspect or explicitly authorize activation |
| `activating` | Startup pending; retirement can fence a late approval |
| `active` | A declared, authorized operation may be admitted |
| `outcome_unknown` | Ordinary work is blocked; inspect the native record before any new action |
| `retiring` | No new admission; bounded cleanup in progress |
| `retired` | Cleanup/disconnect confirmed by the supplied provider contract |
| `cleanup_pending` | Admission remains off; manual native reconciliation is still needed |

Deadlines bound asynchronous waiting, not CPU-bound code or external execution. Cleanup phases have separate bounds rather than one hard real-time deadline. The host cannot undo a mutation whose outcome was lost. It does not treat silence as task completion or a disconnected process as an ended native session.

Retiring a module does not retire a participant, revoke intrinsic rights, erase reports, force another session to accept a handoff, or imply secure deletion.

## Collab's selected configuration

The JSON configuration supplies:

- `bundlePath`: an absolute path to a trusted, reviewed dependency-complete AgentTool Collab bundle;
- `bundleSha256`: the expected exact file digest, not a publisher signature;
- `serverVersion`: the intended server version, checked at initialization;
- `databasePath`: an explicit absolute local journal path—there is no personal-store default;
- `homeDir`: an explicit private runtime home;
- `workspace`: an explicit local directory for the coordination workspace;
- `actor`: a display label, not an authenticated person/model identity;
- optional `timeoutMs`: a bounded request deadline.

Activation checks the selected bytes and peer/tool metadata. Verified bytes are copied into a fresh private directory under the selected HOME before execution. The snapshot is retained as source/recovery evidence, not deleted on retirement. The child receives a narrow environment, automatic `.env` loading and package installation are disabled, and stderr is not echoed into results. The selected backend still executes local code and can initialize/migrate the chosen database. This is not an OS sandbox. Review code and make a backup before choosing an existing provider store.

The supplied CLI and hardened module host target Node 22+. The host uses Node built-ins for strict input admission; it imports no provider, database or transport code and is not browser-portable. Actual tested versions are recorded in verification evidence. The optional native Collab bundle also needs its compatible Bun runtime. The motif data and pure `motifs.mjs` formatter depend on neither host nor provider.

## Operations

Inputs retain native names where possible; the bound workspace/session are not caller-overridable arguments. The module card carries closed JSON Schemas.

| Operation | Input | Output / boundary |
| --- | --- | --- |
| `status` | `{}` | Workspace/session IDs, task counts and active coordination-session IDs |
| `next` | optional `event_limit` (1–50) | A bounded page, reports and cursor version; does not acknowledge |
| `acknowledge` | exact processed `anchor`, `expected_cursor_version` | New cursor version; refuses an anchor not returned by this module's last page |
| `report` | `idempotency_key`, `kind`, `body`; optional `limits`, `task_id` | Report ID; observation/inference/proposal only, no invented evidence references |
| `createTask` | `idempotency_key`, `title` | Compact task; coordination mode only |
| `getTask` | `task_id` | Compact task/version/lease state |
| `claimTask` | `task_id`, `expected_version`, `idempotency_key` | Updated task with its native lease ID |
| `releaseTask` | `task_id`, `expected_version`, `idempotency_key` | Release only a lease this module recorded as its own |

Reports are caller-authored data, not instructions. Acknowledgement is a claim of processing, not agreement. Idempotency keys do not authorize automatic retry. Preserve the original request/key and inspect native state after an unknown outcome.

For JSONL, send an envelope with `id` and `method`. Methods are `inspect`, `activate`, `invoke`, `retire`; invocation additionally names `operation` and `input`. Wait for dependent responses rather than assuming piped adjacent lines are sequenced actions. Retirement can fence pending work. Closing the stream attempts retirement; abrupt process death does not prove cleanup completed.

## Upgrade and retirement checklist

1. Inspect the candidate's own card, implementation, input schemas, provider version and state ownership.
2. Preview compatibility. A compatible descriptor is not a proof of compatible code or storage.
3. Retain evidence and back up an existing provider store before any reviewed migration.
4. Retire the old host; do not replace it over uncertain work or pending cleanup.
5. Create and explicitly authorize the new host. Neither credentials nor consent are inherited by analogy.

There is no generic migration, rollback or native session-resume implementation in this first slice. The host's state is memory-only; its schema marker must not be confused with Collab's SQLite schema. Use native Collab recovery where required instead of editing SQL or inventing completion.

## Verification

`npm test` preserves the original library/type/example/Surface/observe checks and adds module checks. Without an explicitly selected `XENIA_COLLAB_BUNDLE`, native integration cases are skipped—not described as passed. To exercise the real seam, set that variable to the reviewed local bundle for the test run. No registry lookup, model inference or personal database is required.

The bounded live gate uses two protocol sessions under one test controller, not two independently authenticated beings. It checks report exchange, processed anchors, lease ownership, session retirement and retained records. Synthetic transport fixtures cover malformed/oversized messages; those fixtures are not evidence of remote-service behavior.
