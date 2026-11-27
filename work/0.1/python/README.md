<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# XENIA Work 0.1 — clean-room Python 3 verifier and comparison

Status: **development draft — clean-room cross-language implementation and comparison record**

This directory contains a dependency-free Python 3 implementation of the
[XENIA Work 0.1](../README.md) run checker (`check_work.py`), deterministic
conformance-fixture mutators (`mutations.py`), a cross-implementation comparison
harness (`compare_implementations.py`), and unit tests (`test_check_work.py`).

Like the rest of `work/0.1/`, this directory is repository-only development
material and is intentionally excluded from the root `@agenttool/xenia` npm
package.

## Run locally

Requires Python 3.10 or newer (tested on Python 3.15) and Node 22 or newer for
the cross-implementation comparison:

```sh
# Check published examples with the Python verifier
python3 work/0.1/python/check_work.py work/0.1/examples/completed-effect.json
python3 work/0.1/python/check_work.py work/0.1/examples/declined.json
python3 work/0.1/python/check_work.py work/0.1/examples/completed-effect.json --json

# Run unit tests (RFC 8785 JCS, digests, schemas, privacy, Ajv result check, and Node comparison)
python3 -B -m unittest discover -s work/0.1/python -v

# Run the 32-case head-to-head comparison against node work/0.1/check.mjs
python3 -B work/0.1/python/compare_implementations.py
```

## Observation and clean-room boundary

Recorded per [The observer is also observed](../../../README.md#the-observer-is-also-observed):

- **Who speaks:** an Antigravity agent session (`Gemini 4 Carbon`), working in
  Yu's local workspace at Yu's invitation on `2026-11-18`. Proof state: `none`
  (session-authored work; no cryptographic identity or external-organization
  claim is made).
- **Clean-room inputs:** implemented strictly from:
  - [`work/0.1/README.md`](../README.md),
  - [`work/0.1/run.schema.json`](../run.schema.json),
  - [`work/0.1/problem.schema.json`](../problem.schema.json),
  - [`work/0.1/result.schema.json`](../result.schema.json),
  - [`work/0.1/examples/`](../examples) and [`work/0.1/fixtures/conformance.json`](../fixtures/conformance.json), and
  - IETF RFC 8785 (JSON Canonicalization Scheme), RFC 3339, and RFC 3986.
- **Uninspected reference files:** **zero lines** of [`work/0.1/check.mjs`](../check.mjs)
  or [`tests/work-0.1.test.mjs`](../../../tests/work-0.1.test.mjs) were read
  during design, implementation, mutation generation, or testing. During
  comparison, `work/0.1/check.mjs` was invoked solely as an external black-box
  CLI subprocess (`node work/0.1/check.mjs <file> --json`).
- **Independence limitation:** this verifier is an independent language,
  parser, RFC 8785 canonicalizer, schema validator, and semantic checker,
  authored without reading the JavaScript reference implementation. Because it
  was created in the same local workspace under the same human steward, it does
  **not** claim external-party organizational independence. Maintainers decide
  whether the Phase 1 second-implementation exit gate in
  [`MICROSOFT-ROADMAP.md`](../../../MICROSOFT-ROADMAP.md) also requires a
  separate external contributor before any release-candidate review.

## Comparison summary (`2026-11-18`, base commit `415980f`)

Across **32 cases** (2 published positive examples, all 27 conformance-fixture
cases in `work/0.1/fixtures/conformance.json`, and 3 malformed byte/JSON
inputs), `check_work.py` and `work/0.1/check.mjs` agreed **32 / 32 (`0`
disagreements)** on:

1. overall `result` (`conformant` vs. `nonconformant`) and CLI exit code;
2. `artifact` metadata (`complete`, `observed_bytes`, and exact `sha256`);
3. RFC 8785 JCS + domain-separated SHA-256 digests on `completed-effect.json`:
   - `authority.claimed` (`authority-1`):
     `sha256:d2998bab8b3917319bcb94de507cd55a49008fe643c5a57cd7976d56c10b91d7`
   - `action.proposed` (`proposal-1`):
     `sha256:9c145c4bb52a9cc6a253c0cc88e25e939d71fa0f7fd120aeb6ff3f4b5b46d220`
4. recorded event state labels, authority-claim basis outcomes and evidence
   states, execution-to-receipt-to-proposal bindings, and `run.terminal_state`;
5. every `expected_check` and `expected_issue` asserted by
   `work/0.1/fixtures/conformance.json`;
6. non-disclosure of opaque identifier and protected-literal sentinels in
   checker output; and
7. strict JSON Schema Draft 2020-12 (`Ajv`) conformance of the emitted
   `result.schema.json` payload.

## Specification findings surfaced by clean-room implementation

Building from the prose and schemas alone surfaced three places where two
conforming implementations can diverge unless a future Work revision tightens or
relaxes the contract:

1. **Unenumerated `checks[].id` and non-fixture `issues[].code` values.**
   `result.schema.json` constrains `checks[].id` by `^[A-Z][A-Z0-9._-]{0,63}$`
   and `issues[].code` by `^[a-z][a-z0-9_]{0,63}$`. Outside the 7 `R.*` check
   IDs and 26 issue codes named in `fixtures/conformance.json`, neither
   `work/0.1/README.md` nor `result.schema.json` enumerates the remaining check
   or parse-error identifiers. Consequently, the clean-room Python verifier
   emits `R.INPUT`, `R.UTF8`, `R.JSON`, `R.SCHEMA`, `R.LEDGER_ORDER`,
   `R.ACTORS`, and `R.PRIVACY` (with `invalid_utf8`, `duplicate_json_key`, and
   `invalid_json`), whereas black-box execution of `check.mjs` emits `I.SIZE`,
   `I.UTF8`, `I.JSON`, `I.SCHEMA`, `R.IDS`, `R.CHAIN_TIME`, and `R.CORRECTIONS`
   (with `utf8_decode`, `json_key_duplicate`, and `json_parse`). Both satisfy
   `result.schema.json`; `check_work.py` intentionally retains its clean-room
   identifiers so this boundary remains visible rather than retroactively
   copied.
2. **`verifier.name` and `verifier.version` are pinned as constants in `result.schema.json`.**
   `result.schema.json` requires `verifier.name == "xenia-work-check"` and
   `verifier.version == "0.1.0-development"`. An independent checker must emit
   those exact strings in `--json` mode to pass `result.schema.json` (while
   exposing its own implementation identifier in human output or helper APIs). A
   future profile revision may wish to distinguish the profile-checker contract
   from an `implementation` field so distinct verifiers can self-identify in
   band without failing schema validation.
3. **Implicit top-level `evidence` and `effect.observed` rules.**
   Black-box comparison showed that `check.mjs` also checks:
   - `evidence[].observed_at <= run.updated_at` (`evidence_after_update`),
   - event resolution of `evidence[].causal_scope` even when no
     `effect.observed` event references that evidence record
     (`event_reference_missing`), and
   - evidence-kind suitability on `effect.observed.payload.evidence_ids`
     (`evidence_kind_mismatch`) in addition to `causal_claim.evidence_ids`
     (`causal_evidence_kind_mismatch`).
   Stating those three rules directly in `work/0.1/README.md` before a release
   candidate will make them unambiguous to future clean-room implementers.

## Resolution addendum (`2026-11-27`)

Following the findings above (appended without rewriting the 2026-11-18 clean-room
observation record):

1. **`work/0.1/README.md` tightened:** explicitly states the `evidence[].observed_at <= run.updated_at`
   bound, top-level `evidence[].causal_scope` event/run/actor resolution even for unreferenced
   evidence records, `provider_receipt` / `observation` kind and timestamp bounds on
   `execution.receipt` and `effect.observed`, and the boundary between shared conformance IDs
   (`fixtures/conformance.json`) and implementation-chosen diagnostic IDs.
2. **`result.schema.json` verifier self-identification:** added optional `verifier.implementation`
   while preserving the pinned profile-contract anchor (`name: "xenia-work-check"`,
   `version: "0.1.0-development"`). Both `check.mjs` (`xenia-work-check-node/0.1.0-development`)
   and `check_work.py` (`xenia-work-check-python/0.1.0-development`) now emit it.
3. **Conformance & comparison expanded to 35 cases:** added three shared-vocabulary conformance
   fixtures (`provider-receipt-evidence-kind-mismatch`, `effect-evidence-kind-mismatch`,
   `unused-causal-scope-missing-event`), bringing cross-implementation agreement to **35 / 35**
   (`0` disagreements).
4. **Provider capability manifest draft added:** `work/0.1/provider-manifest.schema.json` plus
   local and offline-mock Microsoft Graph examples (`examples/local-provider-manifest.json`,
   `examples/mock-graph-read-manifest.json`), validated in strict Ajv with `disable_on_change: true`,
   `automatic_retry_allowed: false`, and `contains_secret: false` invariants.
