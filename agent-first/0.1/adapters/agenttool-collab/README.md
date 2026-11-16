<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# The Collab adapter

**Status: repository-only development. Tested against a stand-in backend only.** This folder puts one AgentTool Collab journal on this device behind nine operations of the kit runtime, as the module `agenttool.collab`. The backend is a separate program (Apache-2.0) that this kit does not contain, download or build. Every test here runs a stand-in written in this repository; none starts, reads or writes a real Collab server, bundle or journal. So nothing in this folder shows that the adapter works with the real bundle.

| File | What it is |
|---|---|
| [card.json](card.json) | The module's card, as data (MPL-2.0, like the `module.json` it was ported from): each operation's input schema, example, what comes back, refusals and a `does` list; the config keys; the limits; what the end writes; and `backend_reading`, how the backend's refusals were read. The adapter builds its module from this file, and `catalog` and `explain` read the same file. |
| [index.mjs](index.mjs) | The adapter (MPL-2.0): the config check, `open`, the eight other operations, what the binding remembers, and the end. |
| [stdio.mjs](stdio.mjs) | The bounded JSON-RPC port the adapter speaks through (MPL-2.0). |

## How it is reached

```sh
npm run --silent xenia -- explain agenttool.collab
npm run --silent xenia -- session --collab-config /absolute/path/collab.json --allow agenttool.collab:open,agenttool.collab:status
```

`explain agenttool.collab` prints the card and starts nothing. `catalog` and `arrive` list the adapter with `bound: false`. Only `session --collab-config <absolute-file>` binds it; a session without the flag loads no code from this folder (the card is read as data, for the catalog). Binding reads the config file, the card and the pin, and starts nothing and writes nothing. Every operation declares effects, so each runs only when the session's `--allow` list names it. `invoke`, which has no gate, answers `HOST_GATE_REQUIRED` and points to `help session`.

A programmatic host calls `createCollabBinding({configPath})` and hands the result to `runSession` as a binding: `{module, look, close, deadlines, at_end, bound_to}`. `bindCollab({config, configSha256, pin, card, connect})` is the inner function; it takes the transport, which is how the tests hand it a stand-in.

## The config file

One JSON object in a regular file of at most 16384 bytes, read strictly (valid UTF-8, no byte-order mark, no repeated key), with these keys and no others. Nothing has a default except `timeoutMs`.

| Key | What it is |
|---|---|
| `bundlePath` | The file that holds the pinned bundle bytes. It is read, and never changed or run from there. |
| `bunPath` | A Bun executable. Its version is not pinned or checked. |
| `databasePath` | The journal file. |
| `homeDir` | A private folder that becomes the backend's `HOME` and working directory, and holds the copy of the bundle while a session runs. Created if missing; when it cannot be created and nothing was made, `open` declines `home_dir_unavailable`. Not the user's home, and not a folder that holds it, compared as folders as well as by spelling. |
| `workspace` | An existing directory, apart from `homeDir` and from the folder of `databasePath`: none is the other, inside it or around it. Folders are compared by device and inode as well as by spelling, so another case or a second path to the same folder is not apart from it. |
| `actor` | A display label for the native session: 1 to 200 characters, no control character, no space at either end. It is not an identity. |
| `journal` | `new`: nothing may be at `databasePath` yet. `existing`: a regular file must be there. |
| `timeoutMs` | Optional, 100 to 9000, default 8000: how long one request to the backend may take. |

Every path is absolute and in its plain form, at most 512 characters; the five paths and the actor, written as one JSON list, are at most 2048 bytes together, so that `inspect` can always show them. A config that cannot be used is one `session_not_started` line that names the rule and, where there is one, the key. It never repeats a value from the file.

**Which bundle may run is not the caller's to state.** The pin is the `collab` entry of [agenttool.lock.json](../../agenttool.lock.json): the sha256 of the bundle, and the server name, version and protocol it must state. The lock says what that pin is: release-candidate bytes, with no download known to this kit. A match says the bytes are those bytes; it is not a publisher's signature.

## What `open` does

1. It reads the file at `bundlePath` and compares its sha256 with the pin; it checks `bunPath`, `homeDir`, the workspace and the journal against the config. Up to here nothing is written, and each thing found wrong is a declared refusal: `pin_mismatch`, `bundle_unavailable`, `bun_unavailable`, `home_dir_unavailable`, `workspace_unavailable`, `journal_exists`, `journal_missing`. After one of these `open` can be asked again.
2. It creates `homeDir` if it is missing and, in it, one new private folder holding a read-only copy of the checked bytes. The copy is what runs, not a second reading of `bundlePath`. When `homeDir` cannot be created, the first folder that was missing is looked at again: still not there, it is the refusal `home_dir_unavailable`, and `open` can be asked again; there, it is a failure like those below.
3. It starts the copy with the program at `bunPath`: no shell, working directory `homeDir`, and four environment variables: `PATH` as this process has it, `HOME` set to `homeDir`, `AGENTOOL_COLLAB_DB` set to `databasePath`, `GIT_OPTIONAL_LOCKS` set to `0`.
4. It sends `initialize` and `tools/list`, compares the server's name, version and protocol with the pin, and compares the input bounds each tool states with the card. A backend that states narrower bounds than the card is not used.
5. It starts one native session for the configured actor.

From step 2 on, with that one exception, a failure is not a refusal: it is answered `OPERATION_FAILED` with an unknown effect, a backend that was started is stopped, the step reached is kept for `inspect`, and `open` is not run a second time in that binding, whatever step it reached. Once the binding's end has begun, every operation is declined before anything is sent: `open` as `already_open`, the others as `not_open`.

**The workspace and git.** Read in the pinned bundle, not observed: when a native session starts and when a task is claimed, the backend runs git. Where the workspace is inside a git repository it takes that repository's top level as the root it works at, and where there is a commit it reads the untracked files there to hash them. So `open` also refuses, as `workspace_unavailable`, when the nearest folder at the workspace or above it that holds an entry named `.git` is not apart from `homeDir` and the journal's folder. The adapter looks at names; it does not run git, so it can name a folder git itself would not use.

## The operations

| Operation | Declares | What it does |
|---|---|---|
| `open` | local-read, local-write | The steps above, once for each binding. |
| `status` | local-read | Task counts and the active native sessions of the workspace. |
| `task-get` | local-read | One task: its status, version and lease. |
| `next` | local-read, local-write | The next page of journal events after the session's cursor. It does not acknowledge; the backend stamps the session as seen, which is why it declares a write. |
| `acknowledge` | local-read, local-write | Moves the session's cursor to the anchor of the page this binding last read, and no other. |
| `report` | local-read, local-write | Appends one observation, inference or proposal. A decision cannot be sent from here. |
| `task-create` | local-read, local-write | Appends one coordination task. |
| `task-claim` | local-read, local-write | Claims an open task at the version last read, with the backend's default lease. The binding keeps at most 4 claims. |
| `task-release` | local-read, local-write | Releases a claim this binding made. It does not complete the task. |

Each operation's card carries a closed input schema, tightened to the backend's input rules as read in the pinned bundle. The runtime holds every input to it before the gate is asked, so an input the card does not allow reaches neither the gate nor the backend. There is no renew, recover, handoff, review or completion here.

## Refusals, and what stays unknown

A refusal is declared (`DECLINED`, `not_applied`) only in two cases.

- **The adapter's own, raised before anything is sent**: the seven `open` refusals above and `already_open`; `not_open`; `busy` (one call at a time); `backend_not_running`; `earlier_outcome_unknown` (writes only); `unobserved_anchor`; `lease_not_held_by_module`; `lease_limit`; `text_too_long`; `request_too_large`. Each operation lists the codes it can answer with, and the card words each code once.
- **The backend's**, only when the card lists the code for that operation, the answer has the plain refusal shape, and the key a success carries is not in it.

**Which of the backend's refusals are listed is a reading, not an observation.** The pinned bundle was read as text, and never run. For each operation, the tool it calls and each candidate code, every place that can raise the code was looked for, called as this adapter calls the tool: after `open`, in a bound native session, with no `actor` argument. A code is listed only when every such place comes before the commit of the journal change. The card keeps the result with each entry, as `sites` (the raising line and its stage), and says how it was read under `backend_reading`; the full table, with the lines each place is reached through and what was left out, is in [the record for this step](../../../../.hermes/verification/guest-side-step5.json).

| Operation | Tool | Codes passed on |
|---|---|---|
| `acknowledge` | `collab_cursor_ack` | `cursor_version_conflict`, `session_auth_failed` |
| `report` | `collab_report_append` | `idempotency_conflict`, `session_auth_failed`, `task_not_found` |
| `task-create` | `collab_task_create` | `idempotency_conflict`, `session_auth_failed` |
| `task-get` | `collab_task_get` | `task_not_found` |
| `task-claim` | `collab_task_claim` | `idempotency_conflict`, `recovery_required`, `session_auth_failed`, `task_blocked`, `task_claimed`, `task_completed`, `task_not_found`, `version_conflict` |
| `task-release` | `collab_task_release` | `idempotency_conflict`, `lease_expired`, `lease_not_active`, `lease_not_holder`, `session_auth_failed`, `task_not_found`, `version_conflict` |
| `open`, `status`, `next` | | none |

What the reading found that a caller should know:

- **Most places are inside a transaction, after its first write.** The tool writes a guard row, then checks, then raises. That nothing of it stays rests on the rollback, which is done by the Bun program's SQLite binding. That binding is not in the bundle, and Bun is not pinned. Each meaning says so.
- **A claim runs git before most of its refusals.** Each `task-claim` meaning says the backend had run git, or may have.
- **`next` passes nothing on.** Its tool checks the session twice, and the second check comes after its first transaction has committed. So a session the backend no longer accepts is `session_auth_failed`, declined, on the other writes, and unknown on `next`, after which the binding sends no more writes.
- **An answer with the refusal shape can come after a commit.** Read in the bundle: after a write commits, the backend tightens file modes, and after an acknowledgement it rewrites the credential file; a failure there is answered like any refusal, with a code of its own. This is why the shape alone is never enough, and why a code the card does not list stays unknown.
- **A refused release leaves the claim in `look.claims`**, where it still counts toward the 4. Once a lease has run out the backend refuses its release (`lease_expired`) and this adapter has no recover; at the end of the session the release is sent once more, and the end is reported as not complete.

Everything else that fails after a call was sent is answered `OPERATION_FAILED` with an unknown effect: a refusal the card does not list, a JSON-RPC error, an answer that cannot be read, a frame over 1 MiB, a backend that ends or does not answer within `timeoutMs`. After such a failure of a write the binding sends no more writes, and never sends that one again. A read that fails latches nothing. `status`, `task-get` and `inspect` stay available while the backend runs, so a caller can read what the journal holds before deciding anything. Nothing the backend wrote in a refusal or an error is passed on.

`inspect` of the module shows `look`, from memory only: the step `open` reached, whether the backend was running when the binding last asked, the call in flight, calls whose outcome is unknown and why, the native ids, the claims, the tasks last seen and the last page read. It also shows `bound_to`: the paths and the actor from the config, the sha256 of the config file, and the pin.

**Two clocks.** A request to the backend has `timeoutMs`; a call in a session has a deadline. When the request timeout comes first, the backend is stopped and the call is answered as failed with an unknown effect. When the session's deadline comes first, the call is answered `DEADLINE_EXCEEDED` and runs on; until it settles every other call is declined as `busy`, and `look` shows how it ended. Neither clock keeps the backend from finishing a write it had begun.

## The end

The module's row in `session_start` carries `at_end`, so a caller reads it before sending anything: what the binding writes when the session ends, without the gate being asked.

- If `open` returned, the backend is still running and no call has an outcome that is unknown or still pending, the binding reads each task it has claimed and releases the claim, then ends its native session, which removes that session's credential file. A release the backend does not confirm stops it there: the session is not ended, and the task is named as left.
- Otherwise it sends nothing.
- In every case a backend process that was started is closed, and the copy of the bundle under `homeDir` is removed.

`session_end` then says what was done, what was not, and what the binding knows it left: the native session id and workspace id, the tasks whose claims were not released, the credential folder. The journal, the workspace and `homeDir` are never removed, and what else the backend wrote is reported as not surveyed.

## Not established

- That the adapter works with the real bundle. Every test runs a stand-in backend written in this repository ([tests/fixtures/agent-first-collab-standin.cjs](../../../../tests/fixtures/agent-first-collab-standin.cjs)), which was written from a reading of the pinned bundle and never checked against it.
- That a refusal marked `not_applied` was observed to change nothing. For the adapter's own refusals it is how the code is written. For the backend's it was read in the pinned bundle, by hand: a place that was missed could make a written change read as not applied, and no test here can find such a miss, because none reads the bundle.
- That the backend undoes what a refused call had begun. That is left to the Bun program at `bunPath`.
- That Bun or git is a particular program or version: the file at `bunPath` and the git on `PATH` are run as they are found.
- That a deadline or a timeout stops code.
- Anything about who is calling, or whether they may. The adapter is not an operating-system sandbox: the backend is local code that runs with this user's rights.

## Where it came from

The adapter, the card and the port come from this project's other lineage: `modules/0.1/adapters/agenttool-collab/` at `origin/hermes/agent-first-modules` (beed37a), with the same adapter and port bytes at `origin/hermes/agent-first-modules-compose` (4119d4d). Same project. Under that lineage's licence map code, tests and runtime configuration were MPL-2.0, and so was `module.json`; the ported files here keep MPL-2.0, `card.json` with them. What else that lineage held, and what was not carried over, is in [LINEAGE.md](../../LINEAGE.md).

- [stdio.mjs](stdio.mjs) is that lineage's file, unchanged below its header comment, and [tests/agent-first-collab-stdio.test.mjs](../../../../tests/agent-first-collab-stdio.test.mjs) is its test file with only the import path changed.
- [index.mjs](index.mjs) is a port of `adapter.mjs`. Carried over: the digest check before use; the private read-only copy of the checked bytes; the Bun flags and the short environment; the `initialize` and `tools/list` handshake; the task view; the rule that only an observed anchor is acknowledged; the remembered leases; release-then-end at the end. Changed: it runs on the kit runtime; its input checks are the schemas on the card; the digest and the server version come from the kit's lock and not from the caller; the refusal handling above; the copy of the bundle is removed at the end.
- [card.json](card.json) is a port of `module.json`: the eight operations, their schemas and limits, with `open` made an operation of its own and each operation given effects, what comes back and what it refuses. It is MPL-2.0, as `module.json` was; its prose (meanings, `does`, `backend_reading`) is under the same licence as the rest of the file.

Tests: [tests/agent-first-collab.test.mjs](../../../../tests/agent-first-collab.test.mjs) and [tests/agent-first-collab-stdio.test.mjs](../../../../tests/agent-first-collab-stdio.test.mjs).
