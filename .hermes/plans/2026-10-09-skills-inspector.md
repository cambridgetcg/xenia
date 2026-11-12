# Optional AgentTool Skills Inspector Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add one removable, host-root-bound Skills-inspection module beside Xenia's existing agent-first work, reusing the real AgentTool inspector rather than implementing another scanner.

**Architecture:** Xenia retains its existing small in-process lifecycle runtime. A separately imported adapter accepts an explicitly supplied trusted provider namespace and one absolute local root, and calls only the provider's read-only inspector after explicit activation and the runtime's host gate. Core operation does not import or require AgentTool. A reference example makes the same vertical path executable.

**Tech Stack:** Node ESM and node:test; AgentTool source at 91a6aecfeb95dc73c8a5dd4005dbf3c539295493, Skills source 0.3.3; existing local Bun/YAML tooling for an isolated source-built integration fixture.

---

## Baselines and ownership

- Xenia upstream was checked with the selected GitHub identity: 7a6794e1e17dc80770a6ad4294d55cf7171e3de5.
- AgentTool upstream was checked through the same scoped API: 91a6aecfeb95dc73c8a5dd4005dbf3c539295493. The older dirty AgentTool working tree is not the source baseline.
- npm version lookup was approval-blocked. Do not retry it or acquire that denied registry evidence through another transport. Published-version compatibility remains unverified. No installations, account changes or network integration calls are needed for this source-based slice.
- Existing Xenia runtime/modules/local-starter/CLI work belongs to another concurrent workstream. Do not overwrite or claim it. Work in this detached worktree; promote only new, uniquely owned files after checking shared state.
- Runtime copied as the existing baseline, SHA-256 29b65b032faa663cfee031aea56cd3d66d991c55ebfd75061848201e65005b03. Its eight tests passed before this addition.
- A concurrent core update was observed and copied for re-verification, without editing the shared runtime: SHA-256 ae3c4c56abd9769cea223012242652a2c44d79e004e7536b11eb4c4f1e8d3b6a. It changes initial state to `registered` and bounds JSON inputs; adapter tests now target that actual baseline.
- No commits, pushes, publications, version bumps, schema/adoption changes, schedules or live permissions changes.

## Motifs

1. Legibility before activation: a module describes the question it answers, selected input and effect scope.
2. An inspection is not an instruction: files and requested capabilities are reported, never activated by reading.
3. Change without silent replacement: adapter version, provider version, report contract and runtime revision remain distinct.
4. Exit without erasure: retire admission, preserve reports and the inspected files; unrelated modules still work.
5. Self-sufficiency without duplication: Xenia works alone; the optional provider supplies an existing capability when deliberately attached.

## Task 1 — chosen, inert module

Create `tests/agent-first-skills-inspector.test.mjs`; first RED requires missing `agent-first/0.1/adapters/skills-inspector.mjs` and asserts inert construction/registering, a legible description, explicit activation and host authorization before the provider is called. Then implement only the new factory and run GREEN.

Public shape: `createSkillsInspectorModule({ provider, root, providerVersion })` returns a definition compatible with the existing runtime. One operation, `inspect`, no per-invocation root replacement. Provider is explicitly supplied, not discovered from environment or a manifest. Never execute selected skills or copy their instruction bodies into guidance.

## Task 2 — argument, report and upgrade boundaries

Add RED/GREEN slices for absent/incompatible provider, relative/NUL roots, unsupported invocation inputs, copied provider reports, and mismatched report family/schema/version/read-only policy. Treat header compatibility checks as such, not full schema validation, authenticity or safety proof. Use exact declared provider-version matching; never silently relabel a receipt from another version.

Exercise pause/resume, revision-bound replacement, retirement during a deferred provider read, denied further calls and independence of another module. Preserve source files and attributable old result values. Use the actual runtime, not a second state machine.

## Task 3 — real source-built provider and example

Build only the pinned inspector into the private parent scratch directory with existing local tools, with no dependency installation or publication. Reuse existing YAML dependency read-only. Supply that real module explicitly to the integration test; use only synthetic local fixtures. Verify a valid fixture, findings from an invalid fixture, no skill-script execution, bounded reporting, unchanged input bytes, and retirement while the data remains readable.

Create `agent-first/0.1/examples/inspect-skills.mjs` as a small explicit reference host, not another platform/installer. It accepts an already reviewed provider module path and one selected absolute inspection root. It exposes only a compact JSON summary and typed failure, not the instruction body or a safe-to-execute verdict.

## Task 4 — explain and close

Create `agent-first/0.1/adapters/SKILLS-INSPECTOR.md`: one quick start, motif, contract, source pin, license, effects/non-claims, version distinctions, lifecycle, upgrade/retirement and test commands. No undocumented hosted API or released-package claims.

Run focused tests, the real-provider integration, the canonical `npm test`, and both generated Covenant checks. Obtain an independent review of the owned diff. Recheck current shared runtime compatibility, then copy only uniquely owned files into `/Users/yuai/Projects/xenia`; do not race edits to core/CLI/package.json. Report the source-based boundary and any deferred release verification explicitly.
