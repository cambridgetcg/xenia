# Agent-first current implementation — bounded review

## Verdict and evidence boundary

**The four authorized suites pass (14/14), but the source has four narrow correctness/privacy gaps below.** Findings are source-derived; the proposed failure regressions were **not executed**. No source was edited.

Repository: `/Users/yuai/Projects/xenia`; HEAD observed: `7a6794e1e17dc80770a6ad4294d55cf7171e3de5`. The reviewed agent-first files are untracked work, not that commit's implementation. Read `AGENTS.md`, `RIGHTS.md`, and `CONTRIBUTING.md` first. Production/test hashes were unchanged across initial inspection, the focused run, and the pre-report recheck. Parent must compare current hashes before acting; this is not approval of subsequent edits.

## Findings and minimal regressions

### 1. Approval can describe different input from the operation (P1, conditional on a mutating gate)

`agent-first/0.1/runtime.mjs:120–131` snapshots caller input, then gives `authorize` a **separate mutable clone**, while dispatching the first snapshot. Thus a gate which redacts/normalizes its copy before presenting or checking it can approve one payload while `op.run` receives another. For example, replacing a private `handoff.text` with public text in the approval copy does not stop the private original reaching `writeHandoff`. This requires gate-side mutation, not merely caller mutation; the latter is correctly fenced.

The existing runtime test at lines 138–145 actually requires a successful gate-side assignment and proves the original value is dispatched. It verifies detachment, not immutable approval binding.

**Small fix/regression:** make the approval input deeply immutable before entering the callback, bound to the same values dispatched; do not silently treat policy edits as sanitization. In the existing runtime suite, assert nested immutability *inside* a deferred gate, attempt mutation there and from the original caller, then verify the handler receives exactly the inspected payload. Adjust the current mutation-accepting assertion rather than merely freezing after authorization.

### 2. An invalid provider FIFO hangs before it can be rejected (P2)

`agent-first/0.1/provider.mjs:20–25` calls synchronous `openSync(..., O_RDONLY | O_NOFOLLOW)` **before** checking `fstat().isFile()`. A FIFO named `package.json` (or another allowlisted member reached after matching predecessors), with no writer, blocks the event loop in `openSync`. `realpathSync` and `O_NOFOLLOW` do not reject that file type. Consequently the advertised refusal of an invalid provider need not complete. This does not require executable malicious module code.

**Small fix/regression:** reject nonregular files before opening and use nonblocking open where supported, retaining the descriptor/type/hash checks. Add a POSIX-only case to the existing CLI suite, using a disposable FIFO and a bounded child process: loading must reject promptly, execute no provider code, and leave no snapshot. The current malformed-package test only exercises an ordinary file whose hash mismatches.

### 3. Notes can be created inside the provider installation (P2, stated separation requirement)

`agent-first/0.1/cli.mjs:37–48` resolves `--package` and `--dir` independently without checking overlap. `adapters/local-starter.mjs:8–16` only requires an absolute notes path. The pinned public provider's `initStarter` creates any new child under an existing parent (`dist/core.mjs:160–180`). Therefore `--dir <packageDir>/private-notes` is accepted and writes plaintext notes into the provider distribution. The loader's private code snapshot does not change that chosen destination. This contradicts the task's “plaintext notes outside provider code” boundary; no actual disclosure is claimed.

**Small fix/regression:** at the CLI boundary that knows both roots, reject canonical containment before import/init, including a notes parent reached through a symlink. In the existing CLI suite, use a disposable valid pinned package and choose a new child inside it; assert rejection and no created notes. Retain an external sibling-directory positive control. No generic storage abstraction is needed.

### 4. Smoke failures can report `not_attempted` after successful writes (P2)

`agent-first/0.1/cli.mjs:48–64,84–87` performs init and handoff writes, then can throw `new ModuleError('VERIFICATION_FAILED')` with its default `started=false`. A direct readback error or `provider.dispose()` failure instead becomes `CLI_FAILED`, also `started=false`. The printed error then says `operation_started:false, effect_outcome:'not_attempted'` although notes may already have been created and replaced. Even though `retryable:false` prevents an explicit retry recommendation, this is materially incorrect recovery evidence.

**Small fix/regression:** preserve the smoke's completed/attempted mutation phase when reporting later verification or cleanup failures; distinguish cleanup from operation failure without deleting retained notes or replaying writes. Add an existing-CLI-suite case that injects failure only at the final handoff readback (after real disposable init/write), and another at snapshot disposal. Assert retained notes and no `not_attempted` claim. Keep this reporting fix local to the smoke rather than changing every runtime error into a started operation.

## What already holds

- Definitions/operation functions are copied; ordinary descriptions do not activate modules. Empty-effect core modules work without AgentTool.
- Positive authorization is required for declared local I/O. Admission epoch/revision rechecks fence approvals resolving after retirement, upgrade, or pause/resume.
- Running operations prevent upgrades; retirement closes new admission, drains admitted operations, preserves their version attribution, and leaves other modules usable. No additional race blocker was found in those paths.
- The provider loader checks the fixed file set and package identity, hashes bytes read from descriptors, and imports an owned snapshot rather than reopening the mutable original code path. The inspected public import graph is `core.mjs → files.mjs → Node builtins`; no install script/MCP bundle is needed.
- Trusted in-process modules, declaration compatibility and checksum consistency are not a sandbox, semantic compatibility proof, identity/consent proof, Work execution, or whole-framework conformance. These are intentional limits, not additional findings.

## Tests actually run

On Node `v26.5.1`, from `/Users/yuai/Projects/xenia`:

```sh
node --test tests/agent-first-runtime.test.mjs tests/agent-first-modules.test.mjs tests/agent-first-starter.test.mjs tests/agent-first-cli.test.mjs
```

Observed exit **0**: **14 tests passed, 0 failed, 0 skipped/cancelled**. This was the only test command executed. It includes provider-independent CLI/catalog/demo, core profile adapters, runtime admission/lifecycle, a fake starter adapter, and malformed-package refusal. It does **not** exercise a successful pinned-provider import/lifecycle or the new failure cases above.

No builds, installs, network, full suite, additional probes, real smoke, or concurrent skills-inspector/telescope tests were run. Existing built Surface output was used by the authorized suites; source/build freshness was not established. Separately, read/hash inspection of the cached public package below matched all five loader pins; this is not execution or a fresh release/publication check. The suites' own temporary malformed-provider fixture was cleaned by their `finally`. This report is the sole durable write made by the reviewer.

## SHA-256 manifest of reviewed production bytes

Paths in this table are relative to `/Users/yuai/Projects/xenia`:

| File | SHA-256 |
| --- | --- |
| `agent-first/0.1/runtime.mjs` | `ae3c4c56abd9769cea223012242652a2c44d79e004e7536b11eb4c4f1e8d3b6a` |
| `agent-first/0.1/provider.mjs` | `b598b522ba646bf61bc55818a73f56d4158936d1eebfda9b848df170865d68ad` |
| `agent-first/0.1/modules.mjs` | `dd868f09f9cd15d040386b671442eda4ac4c4429826897004f449aa355df1701` |
| `agent-first/0.1/adapters/local-starter.mjs` | `cdf8a3801ec0758afca205efb5ad8d796ceac032ece9aa801dfe80bd87ff09c2` |
| `agent-first/0.1/cli.mjs` | `c8499f46c0b7de3ead489783d32b6ee6f2f38cd2cf7f4d049eeef40ef3b4a9ef` |
| `agent-first/0.1/agenttool.lock.json` | `8d60a87303ae6ea53178f74364478f71ce841356440e6789426bd1e0b53bb6bb` |

Supplementary public-provider source inspection: root `/Users/yuai/.cache/sol/workspaces/20261009-170838-xenia-agent-first.6AOI4r/local-starter-release/extracted/package`:

| File | SHA-256 |
| --- | --- |
| `package.json` | `8be3e51f4015da21768f24c08e6a85201fe2e7812caf20a6c42431890b81de93` |
| `dist/core.mjs` | `ad330358b3fa985d7cc1360876510bc3483007b51e7b406fe182786290855668` |
| `dist/files.mjs` | `123f432fa57fd7c83e5744b623d4e8394a81bb835f01e5f90a503805e944769f` |

`LICENSE` and `NOTICE` were hash-checked (not substantively reviewed) against the lock and matched. Concurrent adapters and their provider bundles were not reviewed or modified.
