# Agent-first follow-up — four fixes and their integration

## Verdict

**The four original defects are fixed in their original paths. The requested four-file test run passed: 17 tests, 0 failures, 0 skipped/cancelled. One concrete integration blocker remains:** the new `context handoff --input` reader repeats the FIFO-open hang outside the repaired provider loader. It was reproduced in a bounded child process, not inferred solely from source. No other blocker/regression was found within this limited review.

Repository: `/Users/yuai/Projects/xenia`; observed HEAD: `7a6794e1e17dc80770a6ad4294d55cf7171e3de5`. These agent-first files are untracked working-tree implementation, not bytes attributed to that commit. The production/test hashes below were unchanged before the tests and after all probes (rechecked `2026-10-09T23:20:33.782005+00:00`). Existing dirty work was preserved. No source was edited.

## Remaining integration finding

### P2 — `context handoff` still hangs on a writerless FIFO input

`agent-first/0.1/context.mjs:10–23`, specifically line 13, calls `openSync(file, O_RDONLY | O_NOFOLLOW)` before `fstat().isFile()`, without `O_NONBLOCK` or a preceding nonregular-file check. `chosenText()` is reached at line 39, before root validation/provider loading. Its byte limit does not bound this synchronous open. A FIFO supplied as the explicitly selected `--input` therefore blocks the CLI instead of returning `INVALID_INPUT`. This is the same failure pattern as the repaired provider-loader finding, now in the added input path; it is not a failure of the repaired `loadReviewedStarter` path.

**Executed reproduction:** a disposable notes root was initialized using the real cached package; `status` supplied the expected hash; a regular-file handoff returned successfully. A FIFO was then created with `os.mkfifo`, without a writer, and supplied to the same actual CLI with the current handoff hash:

```sh
node /Users/yuai/Projects/xenia/agent-first/0.1/cli.mjs \
  context handoff --package "$PACKAGE" --dir "$TEMP_NOTES" \
  --input "$TEMP_FIFO" --expect "$CURRENT_SHA256"
```

A Python `Popen.communicate(timeout=2)` wrapper observed:

```json
{
  "regular_file_control": "returned",
  "fifo_without_writer": {
    "timed_out": true,
    "deadline_seconds": 2,
    "elapsed_seconds": 2.007,
    "exit_code_after_reap": -9,
    "stdout": "",
    "stderr": ""
  },
  "notes_unchanged": true,
  "provider_snapshots_remaining": []
}
```

The wrapper killed and reaped the child; the temporary fixture was removed. No write or disclosure was observed in the hanging invocation.

**Minimal repair direction, not performed:** apply the provider reader's regular-file precheck plus nonblocking-open/descriptor-type/bounded-read pattern to `chosenText`, retaining its UTF-8 and byte checks. Add a bounded POSIX CLI regression for a writerless `--input` FIFO, with a regular-file positive control and unchanged-notes assertion. The current context suite exercises regular input files, not this case.

## Verification of the four original fixes

| Original finding | Current implementation and observed evidence | Result |
| --- | --- | --- |
| Mutable gate input could differ from dispatched input | `runtime.mjs:43–48,119–145` detaches and deeply freezes the input before the gate; the immutable request and handler share that snapshot. The deferred-gate regression asserts immutability inside the callback, attempts gate/caller mutation, and compares the dispatched value with the inspected value. Existing admission/lifecycle tests also pass. | Fixed in the reviewed runtime. |
| Invalid provider FIFO could hang | `provider.mjs:47–61` performs `lstat` before open, adds `O_NONBLOCK`, verifies the descriptor type, bounds reads, and hashes the bytes subsequently snapshotted. The writerless provider `package.json` FIFO regression rejected promptly with `PROVIDER_PIN_MISMATCH` and left no snapshot. | Fixed in the provider loader; separate input-reader regression above remains. |
| Notes could be created inside provider code | `separateContextRoots` at `provider.mjs:14–35` canonicalizes roots and rejects notes containment. `cli.mjs:40–43` and `context.mjs:41–42` call it before importing **provider code**. Real-package tests reject direct and symlink-parent containment for context init and smoke, with no notes or provider snapshot created. External sibling notes work. | Fixed in both CLI paths. |
| Later verification/cleanup failure erased earlier operations | `command-state.mjs:7–24`, smoke phase tracking, and context command state preserve returned operations and cleanup state. Real writes followed by injected smoke readback/cleanup failures and context cleanup failure retain notes and do not report `not_attempted`. An additional combined verification-plus-cleanup failure probe preserved both failure boundaries (below). | Fixed in the reviewed command paths. |

## Exact executed scope

Environment: Node `v26.5.1`, macOS `15.7.3`, arm64. Working directory: `/Users/yuai`. The exact focused command was:

```sh
XENIA_STARTER_TEST_PACKAGE=/Users/yuai/.cache/sol/workspaces/20261009-170838-xenia-agent-first.6AOI4r/local-starter-release/extracted/package node --test /Users/yuai/Projects/xenia/tests/agent-first-runtime.test.mjs /Users/yuai/Projects/xenia/tests/agent-first-cli.test.mjs /Users/yuai/Projects/xenia/tests/agent-first-context.test.mjs /Users/yuai/Projects/xenia/tests/agent-first-boundaries.test.mjs
```

Observed exit **0**; runner totals: **17 tests, 17 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**, duration `709.00325 ms`. Every opt-in case ran.

- **Runtime:** inert registration/activation, revision-compatible upgrades and attribution, retirement/draining/other-module independence, explicit authorization, deferred-gate invalidation, copied declarations/effect contracts, deeply immutable gate input, opaque operation errors, bounded JSON inputs.
- **CLI:** catalog/explain/demo through child processes, core profile outputs and synthetic lifecycle, refusal of an unreviewed provider before its marker code executes.
- **Context:** real pinned-package init/status/handoff/render in fresh CLI processes; exact CRLF readback; stale-hash no-write; disabled-memory exclusion; separate-root isolation; existing-root init refusal; provider removal with notes retained; provider-independent demo/catalog still usable.
- **Boundaries:** provider FIFO refusal; direct/symlink-parent notes overlap refusal; smoke readback and cleanup fault injection after real writes; context init cleanup fault injection after the operation returns.

Additional executed probes, separate from the 17-test total:

1. **Input FIFO probe** described above, with a real-package regular-file handoff control. This failed the nonblocking expectation and is the sole remaining finding.
2. **Successful real-package smoke:** exit `0`, retirement `retired`, new invocation blocked, notes preserved, zero provider snapshots remaining in its private temporary root.
3. **Simultaneous smoke readback and snapshot-disposal faults:** temporary `--import` hooks changed only the child process's filesystem methods. Actual real-package init/handoff/render completed; final readback and snapshot removal then threw. Exit `1`; the error projection was exactly:

```json
{
  "code": "VERIFICATION_FAILED",
  "operation_started": true,
  "effect_outcome": "unknown",
  "retryable": false,
  "phase": "verification",
  "returned_operations": ["init", "status", "handoff", "render"],
  "verification": "failed",
  "snapshot_cleanup": "failed"
}
```

Notes remained; private injected exception text was absent. The intentionally failed disposal left one snapshot, accurately reported as failed cleanup; the parent fixture cleanup removed it and the notes afterward. Both supplemental temporary fixture roots were confirmed removed.

## Evidence limits and write boundary

This is **local synthetic execution using the cached real `@agenttool/local-starter` package**, plus in-memory/runtime fixtures and deliberate child-process fault injection. All five cached provider files matched the lock before and after execution. The package was not freshly fetched; archive/publication freshness was not independently checked.

No network, installs, builds, hosted service, host-session delivery, live account integration, model call, or whole-framework verification was performed. Existing built Surface output and installed dependencies supported the local demo; their source/build freshness was not established. No other test suites were run, including modules/starter/motifs or the separately owned Skills/Telescope suites. Passing these checks does not establish authority, consent, identity/subjective continuity, a sandbox, or whole-framework conformance.

Inspected the five requested production files and all four requested test files; also read the local starter adapter, core module composition, lock, package test scripts, repository instructions/rights/contribution guidance, and prior review for narrowly relevant integration context. No source, configuration, job, skill, or unowned implementation was edited. Synthetic files and child processes were disposable and cleaned. **This report is the sole durable artifact written by this review.**

## Current SHA-256 manifest

Paths are relative to `/Users/yuai/Projects/xenia`. Hashes were unchanged across the test/probe run.

### Production and integration dependencies

| File | SHA-256 |
| --- | --- |
| `agent-first/0.1/runtime.mjs` | `18f1f840145d267ee94544a7804bad35f8ac492d4a9f9ece188ac3fb69bed43e` |
| `agent-first/0.1/provider.mjs` | `cefbffc1d46d874a30e1bed83fbdcc56a8b0e2911a91cc9cfe9def08ebfb6af7` |
| `agent-first/0.1/cli.mjs` | `59c90e64537f9cb3e972f64ca1009876a55cbe40f483aeb43bcf8181656a0fcc` |
| `agent-first/0.1/context.mjs` | `95a3434bf47d14cb1ed61cdf90e3fd5446ce6f9345537ea4e2c05ee72538e0ea` |
| `agent-first/0.1/command-state.mjs` | `591c062a9eae15d29d3149b2c0821e365e19864d330a779b9db89c653a2c4fc0` |
| `agent-first/0.1/modules.mjs` | `dd868f09f9cd15d040386b671442eda4ac4c4429826897004f449aa355df1701` |
| `agent-first/0.1/adapters/local-starter.mjs` | `cdf8a3801ec0758afca205efb5ad8d796ceac032ece9aa801dfe80bd87ff09c2` |
| `agent-first/0.1/agenttool.lock.json` | `8d60a87303ae6ea53178f74364478f71ce841356440e6789426bd1e0b53bb6bb` |

### Executed test files

| File | SHA-256 |
| --- | --- |
| `tests/agent-first-runtime.test.mjs` | `17b10bdf92d0297300b0c763e57adde123d86749a9416c750c60b8ded85cffe1` |
| `tests/agent-first-cli.test.mjs` | `e3e1d62de49d4041c68dd2f43472d30765b6768b4490be42279437f7bb03d170` |
| `tests/agent-first-context.test.mjs` | `0f9be5a7f2267e1dd5a7b04d070082bc93044e5f82ea9bfcd1a37a7b44dc3f17` |
| `tests/agent-first-boundaries.test.mjs` | `ecd296188995793aec69825859cdfe9139412e093011078832357ae84e937a52` |
