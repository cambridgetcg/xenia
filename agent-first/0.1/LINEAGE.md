<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Where the other module host went

**This is a note, not code.** Two module hosts were written for Xenia from the same base (commit 7a6794e) and were never merged. One is this kit, `agent-first/0.1`. The other is `modules/0.1`. This branch keeps one host, the kit's [runtime.mjs](runtime.mjs), one command line and one npm script (`npm run --silent xenia -- <command>`). `modules/0.1` is superseded by it and is not in this branch.

## Where it is kept

| Branch | Revision | What it holds |
|---|---|---|
| `origin/hermes/agent-first-modules` | beed37a (`beed37ac9b1d8282c8566aa657572578d953ffc6`) | `modules/0.1` as found: `host.mjs`, `cli.mjs`, `catalog.json`, a motif atlas (`motifs.json`, `motifs.mjs`), and the Collab adapter under `adapters/agenttool-collab/` (`adapter.mjs`, `module.json`, `stdio.mjs`), each with its tests. Its `package.json` has the scripts `xenia:modules` and `test:modules`. |
| `origin/hermes/agent-first-modules-compose` | 4119d4d (`4119d4dec7f6b198f5538bef75912e8fb511c842`) | A fork of the same folder with a composition layer added: `composition.mjs`, `composition-cli.mjs`, `motifs/*.mjs`, one example plan, and the commands `compose` and `compose-demo`. It is without `motifs.json` and `MOTIFS.md`, and its Collab card (`module.json`) declares one effect fewer. Its adapter and its stdio port have the same bytes as the first branch. |

Where a checkout knows those branches, `git show origin/hermes/agent-first-modules:modules/0.1/README.md` prints that host's own guide. Nothing here deletes either branch, and nothing in this kit loads a file from them.

## What was carried over

- **The bounded stdio port.** [adapters/agenttool-collab/stdio.mjs](adapters/agenttool-collab/stdio.mjs) is that lineage's `stdio.mjs`, unchanged below its header comment, and [its test file](../../tests/agent-first-collab-stdio.test.mjs) is that lineage's, with the import path changed. No shell, a size limit each way, a time limit on each request, no retry.
- **The Collab adapter**, as a port: [adapters/agenttool-collab/index.mjs](adapters/agenttool-collab/index.mjs) from `adapter.mjs`. Kept: the digest check before use; a private read-only copy of the checked bytes, which is what runs; the Bun flags and the short environment; the `initialize` and `tools/list` handshake; the rule that only an anchor this module has read is acknowledged; the remembered leases; release, then end, when it closes.
- **The module card**, as data: [adapters/agenttool-collab/card.json](adapters/agenttool-collab/card.json) from `module.json`. The eight operations and their closed input schemas are kept; `open` became an operation of its own.
- **A session over JSON Lines.** [session.mjs](session.mjs) is new code on this kit's runtime. From the other host's `session` it takes the form (one request per line, one answer per line, `inspect`, `activate`, `invoke`, `retire`), default-deny admission, and a deadline that ends a wait and stops no code.
- **A card the host enforces.** The other lineage's card carried closed schemas; here [schema.mjs](schema.mjs) checks an input against the card before the gate is asked.
- **Two ends that are not called success.** The other host had the states `outcome_unknown` and `cleanup_pending`. Here they are not states of the host: the adapter stops sending writes after an outcome it does not know, and a session's last line says what was and was not cleaned up.

## What was changed on the way

- The adapter passed three backend codes on as refusals and called every other failure uncertain, which ended the whole module. Here a refusal of the backend is passed on only where it was read, place by place, in the pinned bundle (see the card's `backend_reading`); everything else stays unknown, and reads stay available.
- The bundle's digest and the server version were in the caller's config. Here the kit's own [agenttool.lock.json](agenttool.lock.json) pins them.
- Admission was one flag for everything (`--allow-local-state`). Here it is a list of operations (`--allow`), and effects are declared for each operation.
- The copy of the bundle was kept after retirement. Here it is removed at the end.
- A line over the size limit ended the other session. Here it is answered and the session goes on. `pause` and `resume` come from this kit's runtime.

## What was not carried over

- **`host.mjs`**, the other host itself: one module for each host, its seven states, and `planUpgrade`.
- **`upgrade-plan`**, the command that compared two descriptors. This kit's `upgrade` is a call a programmatic host makes; no command or session request reaches it.
- **`demo`**, the other host's finite exercise against a real Collab bundle. The kit has a command of the same name that does something else: it runs the local reference tools and starts no backend.
- **`list` and `describe`**, and the other host's `catalog.json`. The kit's `catalog` and `explain` answer for this kit.
- **The motif atlas** (`motifs.json`, `motifs.mjs`, and the `MOTIFS.md` rendered from it). The kit has its own [motifs.json](motifs.json).
- **composition**, all of it: the fork's plan runner, its motif modules, its example and its two commands.
- **The scripts `xenia:modules` and `test:modules`.**
- **The opt-in tests against a real bundle** (`XENIA_COLLAB_BUNDLE`). No test in this branch starts or reads a real Collab bundle or journal.

Neither lineage has renew, recover, handoff, review or completion for a task.

## Not established

- That the two branches still exist on the remote, or are still at those revisions: they are given as this checkout knew them on 2026-11-16, and nothing was fetched for this note. Where git has those two commits, a test checks that they hold what is written here and compares the stdio port's code; where it does not, that part of the test is left out. No test checks where the branches point.
- That the port behaves as the original did. The adapter was rewritten for another runtime and has been run against a stand-in backend only.
- That nothing of value was left behind. What is listed under "not carried over" was read, not used; whether any of it should come back is a decision this note does not make.
