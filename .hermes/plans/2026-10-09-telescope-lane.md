# XENIA optional Telescope reader Implementation Plan

> For Hermes: implement task by task with the available scoped delegation and TDD workflow. Do not commit or publish without a current request.

Goal: extend the concurrently developed agent-first framework with one removable, bounded AgentTool reader, without a second kernel.

Architecture: reuse the peer-owned `createModuleRuntime` lifecycle. The adapter accepts an explicit compatible parser namespace; ordinary import and registration perform no observation. A prepared, source-pinned AgentTool artifact supplies the real implementation for the integration test. No mandatory hosted account or new service.

Tech stack: Node >=22 ESM, node:test, existing TypeScript toolchain for an isolated source-derived provider build. New XENIA implementation/tests are MPL-2.0; prose CC-BY-SA-4.0; upstream AgentTool code retains Apache-2.0 notices.

## Source and ownership

XENIA source baseline 7a6794e1e17dc80770a6ad4294d55cf7171e3de5 on local branch feat/agent-first-modules-20261009. AgentTool source snapshot 91a6aecfeb95dc73c8a5dd4005dbf3c539295493 was independently checked against GitHub main. The original dirty AgentTool checkout remains untouched.

The shared runtime and CLI are peer-owned. This lane owns only `agent-first/0.1/adapters/telescope/`, `tests/agent-first-telescope.test.mjs`, and its handoff/plan. No unowned failing test authorizes editing the kernel.

## 1. Make the first vertical connection

Write a failing test for optional factory import, inert registration, explicit activation and a delegated parser result through the real runtime. Implement the smallest module definition matching the existing runtime interface. Run the focused test to GREEN.

## 2. Bound recognition, preserve meaning

RED/GREEN slices: byte-type/length rejection before provider entry; malformed UTF-8/profile mismatch; declared evidence counts never becoming conformance or authority; opaque provider failures. Never copy raw document prose or exceptions into diagnostics. Capture the supplied function rather than following later namespace mutation.

## 3. Exercise lifecycle and absence

Use the shared runtime to prove retired reader admission makes no parser call, other modules remain usable, and incompatible/stale upgrades are handled by the existing owner. Adapter import without an installed AgentTool package remains usable; missing provider is explicit rather than an automatic install.

## 4. Use actual AgentTool code

Prepare Node ESM from the pinned source in a private directory using existing tooling, preserving source/build/license provenance. Execute the real parser against XENIA's own Surface example and producer output. Clearly distinguish this offline interoperability check from mocked translation tests, npm-release verification and live service conformance.

## 5. Verify and hand back

Run focused tests, the current full XENIA gate when peer edits are stable, and both generated Covenant checks. Review exact owned changes. Keep one existing framework entry point; provide an integration handoff instead of racing its CLI. No version bump, release, deployment, hosted mutation, key discovery, scheduler or new identity system.
