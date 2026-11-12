<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Xenia agent-first: connected motifs, small local pieces

**Status: repository-only development kit.** This is an optional Node host-side composition layer over existing Xenia functions—not a new normative Xenia profile, a published release, a durable workflow engine, or a model harness. It leaves the root package version, exports, Rights, Surface, Covenant and Work meanings unchanged.

## One door

From the Xenia checkout:

```sh
npm run --silent xenia -- motifs
```

That reads [the motif map](motifs.json): no activation, provider import, notes lookup or network request. `catalog` lists the registered core modules; `explain xenia.surface` gives an actual input example; `demo` exercises the existing reference tools and a clearly labelled synthetic upgrade/retirement example.

Motifs, catalog and explanation need only Node 22+ and the source checkout. The reference demo additionally needs the normal Xenia build and the Work checker's development dependencies. For a fresh checkout, prepare once with `npm ci --ignore-scripts` and `npm run build`. Neither step installs an agent host or activates a service.

## The motifs

| Motif | The question it keeps answerable | Concrete behavior |
|---|---|---|
| **Standing** | What remains when a capability is unavailable? | Rights remain a floor. The Covenant helper makes an all-unknown draft, not an active undertaking. |
| **Legibility** | Can I understand a door before using it? | Describe contracts, versions, effects and examples without invoking a handler. |
| **Bounded work** | What was offered, attempted, returned or observed? | Reuse Work's checker; do not execute a document merely because it records work. |
| **Continuity** | What do I choose to carry? | Use Local Starter's ordinary files, selection, freshness, budgets and guarded handoffs. |
| **Change** | Which implementation answered, and what changed? | Revision-bound replacement, declared contract/effect checks, in-flight protection and admission-time attribution. |
| **Exit** | Can this stop without taking the records with it? | Close new calls, drain admitted work, leave retained files independently readable. |

Their connection is not an automatic workflow:

```text
standing → legible choices → bounded work → chosen context
    ↑                                      ↓
    └──── exit without erasure ← attributable change
```

Understanding here is practical: each piece should explain what it does, what it needs, what it changes, what its evidence establishes, what remains unknown, and how to stop or replace it. The map is an interpretation of the linked Xenia sources, not proof of experience, authority or conformance.

## Small pieces and their ownership

- [runtime.mjs](runtime.mjs): an in-process registry for **trusted** module code. No filesystem, network, provider import, scheduler or credential lookup in the runtime. It is Node-only, not an OS sandbox.
- [modules.mjs](modules.mjs): thin, lazy adapters for the existing Surface manifest builder, Covenant draft generator and in-memory Work checker. No second validator is invented.
- [adapters/local-starter.mjs](adapters/local-starter.mjs): a removable binding to an explicitly supplied AgentTool namespace and notes root. It does not implement another notes store or discover personal context.
- [provider.mjs](provider.mjs): an explicit CLI loading boundary. It checks the small distribution file set against [agenttool.lock.json](agenttool.lock.json), snapshots the checked bytes, and imports only that snapshot's core. It does not run installation scripts, MCP, the hosted-read companion or network discovery.
- [context.mjs](context.mjs): deliberate local context commands. Each process closes its module admission when the command ends; retained notes are outside the code lifecycle.
- [command-state.mjs](command-state.mjs): keeps returned operations, later verification and snapshot cleanup distinct when a composite command fails.

Additional, separately developed adapters are present for [Skills inspection](adapters/SKILLS-INSPECTOR.md) and [Telescope recognition](adapters/telescope/README.md). They are not automatically registered, imported or activated by this entry point. Their own guides define their provider contracts and verification scope.

## A useful path through the pieces

1. Read `motifs`, `catalog` or `explain`. Reading does not activate anything.
2. Run `demo` to construct a Surface manifest, prepare an unverified Covenant draft, and check a synthetic Work record with the existing functions. No service is contacted and no Work action is dispatched.
3. If continuity is wanted, deliberately select the reviewed Local Starter package and a notes root **outside its installation/cache**.
4. Initialize once, inspect the current status, then choose the exact text to carry. A handoff requires the current hash, so a stale writer cannot quietly overwrite a newer file under the provider's cooperative-write contract.
5. A fresh consumer can read those ordinary files. Closing/removing the module or its package does not erase them. A later explicit CLI command creates a fresh in-process runtime; this kit does not persist a global disable switch.

The Work module checks an already-parsed in-memory record with `validateWorkRun`. It does not claim original-byte, UTF-8 or duplicate-key verification for that representation. For exact supplied artifacts, Xenia already provides `checkWorkRunBytes` and `checkWorkRunFile` in [the native Work checker](../../work/0.1/check.mjs); use that contract rather than silently normalizing away those checks. Work remains a development draft, not a completed execution engine.

## Chosen local context

Obtain and review the Local Starter distribution separately. This kit never downloads or installs it. The pin names the public GitHub prerelease `@agenttool/local-starter@0.1.0-dev.0`; an npm lookup returned404 at the recorded observation. The current private monorepo source and this public artifact are distinct snapshots. The archive checksum was compared with the publisher's checksum file; that consistency check is not publisher authentication or authority.

Use explicit paths; `NOTES` must be outside `PKG`. Its parent must already exist. Init refuses any existing destination.

```sh
npm run --silent xenia -- context init --package "$PKG" --dir "$NOTES"
npm run --silent xenia -- context status --package "$PKG" --dir "$NOTES"
npm run --silent xenia -- context render --package "$PKG" --dir "$NOTES"
```

To carry a chosen replacement, prepare a UTF-8 file, inspect the `handoff` slot's current `sha256` in status, then supply both explicitly:

```sh
npm run --silent xenia -- context handoff --package "$PKG" --dir "$NOTES" --input "$CHOSEN_FILE" --expect "$CURRENT_HASH"
```

No automatic transcript extraction, retries, host delivery, model calls or registration occurs. Input is bounded and strictly decoded; BOM and CRLF are preserved. Provider slot limits still apply. Only the fixed `handoff.md` slot is changed by this command.

`status` may fingerprint disabled slots but does not include note bodies. `render` includes selected bodies only, and keeps omission/provenance information. A rendered bundle is a filtered view, **not a complete backup or export**. Notes are optional plaintext, not a secret store. Keep credentials out of them. Retained prose is data to assess under the current task, never renewed permission or a required identity.

## Upgrade and retire deliberately

A module begins `registered`, not active or verified-ready. `activate(id)` opens admission; `pause(id)` closes it reversibly. `upgrade(id, replacement, {expectedRevision})` requires the current revision, matching declared contract and operation/effect surface, and no in-flight handler. It does not prove semantic compatibility: review and test the replacement first.

Inputs are bounded JSON data. The host gate sees the deeply immutable snapshot delivered to the handler; it must not edit that snapshot as a form of sanitization. Prepare a deliberately changed input before invoking again. Late decisions after upgrade, pause/resume or retirement cannot start an operation under the old context.

`retire(id)` closes new admission immediately. Admitted calls drain; it neither forcibly kills JavaScript nor undoes completed effects. The retired instance cannot be silently reactivated. The caller owns result retention and any cross-process lifecycle policy. Retiring software does not retire a being's standing rights.

For the AgentTool adapter, data stays separate from package code. The CLI rejects notes inside the canonical provider tree, including through a symlinked parent. Programmatic hosts choosing their own namespace/root must enforce that separation too. Replacing code must not mean migrating or deleting notes; migrations, deletion, host hooks, MCP bindings, credentials and external copies have separate lifecycles.

A different provider artifact must be reviewed and tested before changing its pin. No `latest` lookup or automatic pin relaxation is used. Byte matching does not prove behavior, rights, source authenticity or compatibility; trusted code and a cooperative filesystem remain host assumptions.

## Failure is useful information

Every error says whether anything happened. `POLICY_BLOCKED` is an admission result, not a claim that a human refused. `MODULE_RETIRED` is terminal for this runtime. `STALE_REVISION`, `CONTRACT_MISMATCH` and `MODULE_BUSY` refuse replacement without changing the module. Errors carry the module id, operation and the version/revision the call was admitted under, and `retryable` is true only where a retry after re-reading module state can succeed (`MODULE_BUSY`, `STALE_REVISION`, `ADMISSION_CHANGED`).

An operation may declare a closed list of refusals (`code`, `meaning`, `effect: 'not_applied'`, optional `next`), shown by `describe`/`explain` and part of the upgrade signature. When a handler declines with a declared code the result is `DECLINED` with `operation_started: true`, `effect_outcome: 'not_applied'` and a `refusal` (plus a bounded `detail`): the operation ran, declined before any effect, and the caller can read what to do next. A stale `--expect` hash, `init` on an existing root, a missing root and an oversized note are such refusals. A handler failure the module did not declare stays `OPERATION_FAILED` with an unknown effect outcome; do not replay a mutation merely because the caller received an error. The runtime never trusts a refusal code that was not declared in advance. The pure builders report invalid input as `DECLINED` / `invalid_input`; a Work record that merely fails the checker is a normal `valid: false` report, not a refusal.

At the CLI, every failure also carries a `problem` in the shape of Surface's problem: `{code, detail, terminal, next_actions, retryable}`. `terminal: true` means no next actions; otherwise at least one, each an argv the CLI accepts plus a one-line `why` (an action with `needs` is a command prefix: add the named flags). `not_established` states what the response does not tell you. An unknown command lists the valid ones and the nearest; an unknown module or study id lists the valid ids; a missing build is `BUILD_REQUIRED` with the prepare commands and nothing started; `PROVIDER_PIN_MISMATCH` names the expected package, version, source and the file or field that differed. A declined result keeps `effect_outcome: not_applied` and points at a next action for that refusal (a stale hash points at `context status` to read the current hash). `-h`/`--help` works at top level and after a command, `help <command>` gives one usage, and `motifs <motif-id>` returns one card. Exit codes: 0 success, 2 usage error (the command line was not understood, or named something that does not exist), 1 operation failure or refusal. stdout is one JSON document and stderr is silent.

Composite CLI failures also name the phase, which operations returned, verification status and code-snapshot cleanup. A later readback or cleanup failure must not claim earlier writes were unattempted. These are observations about command boundaries, not proof of every filesystem/platform effect. `operation_started` concerns the module operation, not an assertion that setup performed no reads or temporary copies.

## Verification

The default project gate is still `npm test`. It includes local module, CLI, motif and boundary regressions. Real Local Starter tests are explicit opt-ins, so a skipped real-provider test must not be called a successful integration test:

```sh
XENIA_STARTER_TEST_PACKAGE="$PKG" npm test
node tools/render-covenant.mjs --check
node tools/render-adoption-schema.mjs --check
```

The real-package gate uses disposable synthetic roots and fresh CLI processes. It checks restart, root isolation, disabled content, stale-hash refusal with unchanged data, existing-root refusal, provider removal with retained notes, and core operation without the provider. Failure-injection cases cover FIFO rejection, code/data separation, readback failure after writes, and cleanup failure after acknowledgement. Test-fixture cleanup is distinct from retirement; it does not imply that retirement deletes data.

Only local behavior is tested. No hosted AgentTool account, collaboration database, website, model inference, deployment, publication or whole-Xenia conformance is established. Code is MPL-2.0; prose and the informative motif map are CC BY-SA4.0. The optional provider remains Apache-2.0 with its own LICENSE/NOTICE.
