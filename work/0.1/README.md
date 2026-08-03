<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# XENIA Work 0.1

Status: **development draft**

XENIA Work 0.1 describes one finite piece of work among humans, agents,
human–agent pairs, services, organizations, or participants whose kind is
unknown. It records what was offered, chosen, planned, claimed as authority,
proposed, approved or rejected, attempted, returned by a provider, observed,
corrected, appealed, and finally ended.

The profile is provider-neutral. A tool or provider is named by an identifier
and version; no Microsoft, cloud, model, agent framework, browser, identity
system, or transport owns the meaning of a XENIA run.

This directory is not a release. Its schema identifiers are development URNs,
not stable public release identities. Do not publish a conformance claim,
freeze an integration, or move durable records onto these identifiers as if
they were final.

## What is normative

For this development draft:

- [run.schema.json](run.schema.json) defines the permitted JSON shape for a
  finite run;
- [problem.schema.json](problem.schema.json) defines the permitted JSON shape
  for a typed work problem;
- [result.schema.json](result.schema.json) defines the permitted JSON shape for
  a reference-checker result; and
- the requirements stated with **MUST**, **MUST NOT**, **SHOULD**, and **MAY**
  in this document define lifecycle, digest, interpretation, and operational
  boundaries that JSON Schema cannot express by itself.

The schemas validate structure. The reference checker performs additional
cross-record checks. Neither a Work document, schema validity, an
`execution.started` record, nor a passing checker result authorizes dispatch.
None authenticates a speaker, verifies cited evidence, proves consent or
authority, executes a plan, observes a provider, or establishes that an effect
occurred.

Examples, diagrams, explanations, and suggested implementation techniques are
informative unless they restate an explicit requirement.

## The rights floor

Read the shared [Rights of Beings baseline](../../RIGHTS.md). A service that
makes the separate [XENIA Covenant 0.1](../../covenant/0.1/README.md)
undertaking also has the duties recorded there. A Work record does not create
those rights, activate a Covenant adoption, or prove that either is practised.

Within this profile:

- an offer is an invitation, not a bond;
- silence, timeout, execution, a credential, or schema validity is not
  acceptance or consent;
- acceptance of work is not approval of a later external action;
- a plan is not authority;
- membership in a human-agent pair does not merge or transfer either member's
  identity, consent, credentials, or authority;
- an authority record is a scoped claim, not proof merely because it exists or
  has a digest;
- declining and pausing allow a reason to be withheld and carry no unrelated
  penalty;
- handoff does not silently transfer authority;
- uncertain required authority stops a binding action;
- correction and appeal append to the history instead of silently replacing
  it; and
- rest, refusal, handoff, revocation, and repair MUST NOT be held hostage for
  unrelated payment, engagement, obedience, or explanation.

## One finite run

A Work 0.1 document is a completed finite segment, not a live mutable session.
It always contains a terminal state and the event that established that state.

A new segment that continues an eligible pause uses `continuation`. It names
the prior run, the SHA-256 digest of the exact prior document bytes, the prior
terminal event, the prior `paused` state, and the recorded
`continuation_allowed: true` choice. A new segment received through handoff
instead uses `source_handoff`, which names the source run, the SHA-256 digest of
the exact source document bytes, and the source handoff event. A document MUST
NOT contain both fields. The source document remains unchanged.

These fields are artifact bindings, not proof by themselves. A consumer that
relies on either one MUST obtain the complete source bytes, recompute the
artifact digest, and check the named run and event. The reference checker does
not fetch or validate a source artifact.

The top-level record contains:

- a stable `run_id`, title, and purpose;
- creation and last-update times;
- one terminal state and its `terminal_event_id`;
- hard limits and an event-based cancellation boundary;
- a `record_data_zone_id` for the complete document and its metadata;
- the actors named in the run;
- declared data zones;
- bounded evidence references;
- an ordered event ledger; and
- `not_established`, which keeps important unknowns and non-claims visible.

The profile limits a run to 256 events, 32 actors, 32 data zones, 128 evidence
references, 64 plan steps, 32 external effects, seven days of elapsed time, and
one attempt per action. A particular run may choose lower limits. Two event
slots are always reserved for post-terminal correction or appeal. The terminal
event MUST occur no later than `max_events - repair_event_reserve`.
`max_elapsed_ms` runs from `created_at` through the final appended event at
`updated_at`, including any reserved repair event. An implementation MUST
enforce the recorded limits before each new event and before each external
effect; recording a limit does not enforce it by itself.

`record_data_zone_id` MUST resolve to one declared data zone. That zone states
the intended classification, purpose, audience, and retention for the complete
Work document, including identifiers, event text, evidence metadata, and
embedded literal inputs. Every declared data zone is itself metadata in the
document, even when no event references it. The record zone MUST be at least as
restrictive as every non-public declared zone. Classification order is
`public`, `internal`, `confidential`, then `restricted`. A named-actor record
audience MUST be a subset of each protected declared audience; a public record
audience cannot contain actor-bounded material. `ephemeral` is the shortest
retention; an `until` date MUST be no later than the protected material's date.
Different external retention policies are not assumed comparable merely by name. A
checker result, its artifact digest, terminal metadata, logs, and diagnostics
MUST be handled at least as restrictively as the input document. The
declaration is not encryption, access control, deletion, or proof that handling
matched it.

### Event ledger

Events are ordered by `sequence`, beginning at 1. The first event MUST be
`work.offered` and MUST set `previous_event_id` to `null`. Every later event
MUST increment the sequence by one and name the immediately preceding event.
Event IDs MUST be unique within the run. Actor, data-zone, evidence, plan,
authority, proposal, approval, execution, receipt, correction, and appeal
references MUST resolve to the exact earlier item expected by their field.

All events MUST name an actor declared in `actors`. Actor IDs, evidence IDs,
and data-zone IDs MUST be unique in their respective arrays. Event times MUST
not move backwards. `created_at` MUST equal the first event time, and
`updated_at` MUST equal the final event time.

`previous_event_id` makes the order explicit. It is not a cryptographic hash
chain. An implementation that needs tamper-evident or signed storage needs a
separate, stated mechanism and MUST NOT describe this field as proof of
immutability.

Some bindings copy an exact projection of a top-level record so its meaning
does not depend on a mutable ID lookup:

- a data-zone projection contains `id`, `classification`, `purpose`,
  `audience`, and `retention`; and
- an evidence projection contains `id`, `kind`, `digest`, `observed_at`,
  `recorded_by_actor_id`, `scope`, and the evidence zone's complete data-zone
  projection.

The copied projection MUST match the corresponding top-level declaration.
Fields outside the projection are not silently included: in particular, an
evidence projection does not include the top-level locator or description.
Where a projection occurs inside an authority or action binding, that
projection is covered by the binding digest. Equality fixes the recorded
metadata; it does not verify the cited bytes, the recorder, the observation,
or the truth of the claim.

Only `correction.appended` and `appeal.appended` MAY follow the event named by
`terminal_event_id`. They do not reopen the run, change its terminal state, or
erase an earlier event. They consume the remaining event capacity, of which at
least two slots were reserved, and remain inside `max_events` and
`max_elapsed_ms`. Further work, or repair after the event or elapsed-time limit
is exhausted, requires a new run; Work 0.1 does not define a separate cross-run
repair-link field.

### Terminal states

The top-level state and terminal event MUST agree:

| `terminal_state` | terminal event |
|---|---|
| `completed` | `work.completed` |
| `declined` | `work.declined` |
| `paused` | `work.paused` |
| `cancelled` | `work.cancelled` |
| `expired` | `work.expired` |
| `failed` | `work.failed` |
| `closed` | `work.closed` |

`work.completed` names the acceptance tests said to be satisfied. This is a
scoped completion statement, not independent proof. `work.closed` is the
honest catch-all when there was no action, an effect remains unknown, an
observed effect differs from the proposal, or another limitation prevents a
stronger terminal statement.

Expiry is recorded by an event; wall-clock passage does not silently rewrite
an existing document. Cancellation becomes effective before the next external
effect. It does not undo an effect that already crossed that boundary.

## Lifecycle

A full external-action path is:

```text
work.offered
  → work.accepted
  → plan.proposed
  → authority.claimed
  → action.proposed
      ├─ action.rejected → a new proposal or a terminal event
      └─ execution.approved
           → execution.started
           → execution.receipt
           → effect.observed
           → work.completed | work.closed
```

Other finite paths end in `work.declined`, `work.paused`, `work.cancelled`,
`work.expired`, or `work.failed`.

Before acceptance, an offered participant may also record `work.asked`, hand
the work off, or end the segment by declining, pausing, or resting.

### Offer, acceptance, refusal, questions, rest, pause, and handoff

`work.offered` discloses the requested outcome, affected actors, data zones,
estimated cost, and available exit choices. It MUST offer `decline` plus at
least three other choices listed by the schema. None is selected by default.
`exit_options` is an allowlist, not decoration. Before acceptance, only an
offered participant may choose one, and the corresponding option MUST be
listed: `ask` for `work.asked`, `decline` for `work.declined`, `pause` or
`rest` for the matching `work.paused` kind, `handoff` for `work.handed_off`,
and `cancel` for `work.cancelled`.
After acceptance, a participant's cancellation, pause, rest, question, or
handoff is recorded by the actor that accepted the work and is not conditional
on the earlier offer allowlist.

`work.accepted` records participation only within the stated
`participation_scope`. It does not approve an action or manufacture provider
permission.

`work.declined`, `work.paused`, `work.cancelled`, and `authority.withdrawn`
explicitly distinguish a supplied reason from a withheld reason. A withheld
reason MUST remain absent; a service MUST NOT infer, generate, or demand one.
`no_penalty: true` on the work-choice events is a profile undertaking, not
evidence that every surrounding system honoured it.

`work.asked` records the question, its intended recipients and data zone, and
bounded reply and cancellation references. It is not terminal and carries
`no_penalty: true`. It records neither an answer nor permission to proceed;
the run still needs an explicit later choice and terminal event.

Rest uses `work.paused` with `kind: "rest"`; an ordinary pause uses
`kind: "pause"`. Both are terminal for that finite segment. Either may permit
a later continuation without requiring a reason.

`work.handed_off` carries its own handoff ID, an explicit purpose, constraints,
plan event IDs, authority event IDs and digests, exact evidence and data-zone
projections, budget, deadline, deliverables, acceptance tests, and reply and
cancellation references. It MUST set both `authority_transfer` and
`credentials_transfer` to `false`. The recipient is not bound by the handoff.
If it chooses to continue, its new run records `source_handoff` with the exact
source artifact digest, then makes its own offer and establishes any authority
it needs.

### Plans

A plan names deterministic, agent, human-gate, or subworkflow steps and their
dependencies. Step IDs MUST be unique. Dependencies MUST name steps in the
same plan and MUST form an acyclic graph. A superseding plan names the earlier
plan event; it does not rewrite it. Every plan records
`authority_created: false`: planning never manufactures authority.

The profile records a plan but does not schedule or execute it. Runtime choice,
parallelism, checkpoint storage, model prompting, and subworkflow mechanics are
outside this profile.

### Authority claims

Every `authority.claimed` event contains an exact `binding` and its digest. The
binding names the run, claim event, claimant, executor, purpose, operations,
resources, exact data-zone projections, validity window, revocability, and
these five distinct bases:

1. `technical_control`;
2. `affected_party_consent`;
3. `representative_authority`;
4. `legal_basis`; and
5. `provider_permission`.

Each basis MUST occur exactly once. It names the actors to whom that basis is
said to apply and carries exact evidence projections rather than bare evidence
IDs. A basis may be `not_applicable`; it MUST not be omitted. A
`not_applicable` basis has evidence state `none` and no evidence. `tested` and
`attested` require at least one projected evidence record. Evidence state and
outcome remain separate. `asserted`, `tested`, and `attested` describe the
record's evidence claim; the labels, digest, recorder ID, scope, and timestamp
do not make the evidence authentic, timely, independent, complete, or true.
An execution MUST have at least one applicable basis with outcome `pass`; a
claim whose five bases are all `not_applicable` cannot authorize execution.

`subject_actor_ids` makes affected-party and representative claims
attributable, but an implementation still has to decide which bases apply to
which affected people. An empty list is not universal consent. A passing
`affected_party_consent` basis MUST use `consent_record` evidence for exactly
the affected subjects and the exact proposed action scope: purpose, operation,
target, data zones, and expected effect. Technical control, representative
authority, legal basis, or provider permission evidence is not affected-party
consent. Each relied-on consent evidence record and its projected binding MUST
therefore carry matching `consent_subject_actor_ids` and structured
`action_scope`; the free-text `scope` field is descriptive, not sufficient.

A `human_agent_pair` lists at least one human-role member and one agent-role
member and MUST set `authority_merge: false`. A human or agent role MUST match
the referenced actor's declared kind. Pair membership never combines the
members' authority, credentials, approvals, identity claims, or consent.
Authority and approval must name the exact actor that holds or gives them.

`authority.withdrawn` ends future reliance on the named claim and digest.
Withdrawal does not need counterparty acceptance. An executor MUST NOT start
an action when a required basis is failed, unknown, expired, not yet valid, or
withdrawn. Work 0.1 execution MUST rely only on authority claims whose binding
sets `revocable: true`; a non-revocable claim may be recorded but cannot
authorize execution. A previously completed external effect is reported
separately; it is not erased by withdrawal.

### Action proposals and exact approval

An `action.proposed` binding discloses the executor, exact tool and version,
operation, target, inputs, purpose, recipients, data zones, expected effect,
possible side effects, risk, maximum cost, required licenses and terms,
idempotency key, authority claims, required approvers, nonces, expiries, and
retry policy. Its data zones are exact projections, so their classification,
purpose, audience, and retention are covered by the proposal digest.
Each input names one of those zones. The zone projection is the single source
of truth for that input's audience; an implementation MUST NOT invent a
second, narrower or broader audience from the input name, kind, or locator.
Every actor named in `recipient_actor_ids` MUST be permitted by every action
input's zone audience. A public audience permits any recipient; an
actor-bounded audience MUST name every recipient.

Every action requires one or more exact approvals. `execution.approved` MUST
repeat the proposal event ID and digest and MUST match one required actor,
nonce, and unexpired approval request. All required approvals MUST exist before
`execution.started`. Changing any proposal binding field creates a new event,
digest, nonces, and approvals; an old approval MUST NOT be reused.

`action.rejected` is final for that proposal. Its typed problem may explain a
recoverable path, but it creates no retry pressure. A changed action is a new
proposal. A rejection MUST NOT coexist with an `execution.approved`,
`execution.started`, `execution.receipt`, or `effect.observed` event for that
proposal, whether the conflicting event appears before or after the rejection.

Automatic retry is forbidden in Work 0.1. Both the run limit and each proposal
set the maximum to one attempt. An idempotency key is a correlation and replay
boundary; it does not make a provider operation idempotent. Runtime atomicity
and provider behavior remain separate responsibilities.

### License and terms disclosure

License state is `declared`, `reviewed`, `unknown`, or `not_applicable`.
`declared` identifies the licenses and exact observed terms bytes by locator,
digest, and observation time. `reviewed` adds the reviewing actor and exact
review-evidence projections. These states mean only that the record contains
an attributable declaration or review. Neither means that a license is valid,
compatible, sufficient, current, accepted, or complied with, and neither is a
legal opinion. An action whose applicable license or terms remain `unknown`
MUST NOT start. Provider policy and any required legal or organizational review
remain separate gates.

### Invocation, provider response, and effect

`execution.started` MUST be appended before dispatching the external action.
It binds the exact proposal, approvals, authority claims, executor, and one
execution ID. It is a record made by a separately authorized runtime at the
dispatch boundary, not an instruction to a tool; the Work document cannot
establish that the runtime had that authorization. A runtime MUST separately
authenticate its caller, apply its own policy, verify the still-current
authority and exact approvals, and enforce limits immediately before dispatch.
Finding an `execution.started` event in supplied JSON MUST NOT cause dispatch
or replay.

`execution.receipt` records what the named provider returned, including its
version, stated outcome, actual cost, summary, and any provider-receipt
evidence. Run ceilings, estimates, handoff budgets, and proposals use
`maximum_amount`; a known receipt uses the exact reported `amount`. An actual
amount is still a recorded provider claim, not proof of settlement or a final
invoice. A provider response of `pass` is not automatically proof of the
proposed real-world effect.

`effect.observed` is separate. One or more observations may record that the
effect was confirmed, not observed, contradicted, or remains unknown, together
with evidence state, scoped evidence, limitations, and a separately labelled
causal claim. `confirmed` requires `tested` or `attested` evidence state and at
least one evidence reference. This is still a bounded record claim: an
observation does not become authority over an affected actor, and an asserted
causal relationship does not become tested merely by repetition.
Evidence for a `tested` or `attested` causal claim MUST be relevant to that
causal relationship, recorded after the referenced provider response, and
recorded no later than the observation. Earlier consent or permission evidence
does not establish causation. Each relied-on evidence record MUST carry a
structured `causal_scope` binding the run, proposal and digest, execution,
receipt, target, expected effect, and observed outcome and summary.

### Correction and appeal

A correction names the events it challenges or repairs. It may clarify,
contain, repair, or tombstone an unsafe external reference while retaining the
original attributable event. A tombstone tells consumers not to follow or
display a referenced item; it does not pretend that every copy was deleted.

An appeal names the events challenged, the requested repair, and evidence.
Neither correction nor appeal changes an action proposal, approval, authority
claim, execution, or terminal state in place. Any new binding act follows the
ordinary offer and authority path in a new event or run.

## Exact digest rules

Every digest uses SHA-256 and is written as `sha256:` followed by 64 lowercase
hexadecimal characters.

### Authority claim digest

For `authority.claimed.payload.claim_digest`:

1. take exactly `authority.claimed.payload.binding`;
2. serialize it with the JSON Canonicalization Scheme in RFC 8785;
3. encode the ASCII string `xenia.work.authority-claim/0.1` followed by one
   newline byte (`0x0a`);
4. append the UTF-8 canonical JSON bytes directly after that newline;
5. calculate SHA-256; and
6. prefix the lowercase hexadecimal result with `sha256:`.

In compact notation:

```text
sha256(UTF-8("xenia.work.authority-claim/0.1\n") || JCS(binding))
```

### Action proposal digest

For `action.proposed.payload.proposal_digest`, use the same procedure with the
action binding and its own domain:

```text
sha256(UTF-8("xenia.work.action-proposal/0.1\n") || JCS(binding))
```

Rejection, approval, execution, receipt, and effect-observation records MUST
repeat the matching proposal digest exactly. Authority references MUST repeat
the matching authority claim digest exactly.

JCS canonicalization makes member order and insignificant JSON whitespace
irrelevant. It does not encrypt the binding, hide its contents, authenticate a
speaker, or prove that a claim is true.

### Referenced-byte and artifact digests

An evidence digest and a license-terms digest are SHA-256 over the exact
referenced bytes. For an HTTP representation, hash the body after transport
content-decoding, follow no redirect, and perform no JSON reserialization,
newline change, Unicode normalization, or other transformation. The digest
identifies those bytes only; it does not verify the locator, source, issuer,
observation, legal meaning, or statement that cites them.

An artifact digest in `continuation`, `source_handoff`, or a checker result is
SHA-256 over the complete supplied Work document bytes, without
reserialization or normalization. It binds one byte sequence; it does not
authenticate its author or prove the source record's claims.

## Typed problems

A Work problem gives a stable code, title, detail, retry statement, terminal
statement, optional next events, and documentation. A terminal problem MUST
set `retryable: false` and offer no next action. A recoverable problem MUST
offer at least one typed next event.

Here, `terminal` means that the problem advertises no safe machine-callable
recovery. It does not silently close the containing run. `retryable: true`
means only that trying the unchanged operation may be safe while an unused
declared attempt remains; it never asks for, schedules, or permits an automatic
retry. Work 0.1 allows only one action attempt, so a problem returned after
dispatch normally cannot advertise an unchanged retry in the same run.

Implementations SHOULD use these codes when the stated condition applies:

| code | condition |
|---|---|
| `approval_required` | a required exact approval is absent |
| `approval_mismatch` | approval actor, nonce, digest, or proposal does not match |
| `authority_missing` | a required scoped authority claim is absent |
| `authority_unknown` | an applicable authority basis remains unknown |
| `authority_expired` | the claim is outside its recorded validity window |
| `authority_withdrawn` | the claim was withdrawn before execution |
| `limit_reached` | a declared finite limit prevents further work |
| `effect_unknown` | the provider response or real-world effect remains unknown |
| `cancelled` | cancellation stopped future work at the declared boundary |

The [approval-required](examples/approval-required.problem.json) and
[authority-unknown](examples/authority-unknown.problem.json) files are
informative examples of recoverable refusals.

Next actions are optional invitations, not commands, consent, permission, or a
reason to retry automatically. A participant may still decline, pause, rest,
ask, hand off, cancel, correct, or appeal where the run permits it.

Problems appear directly in `work.failed` and `action.rejected` events. They
are record shapes, not a complete HTTP API or transport contract.

## Reference development checker

From the repository root, check one finite run with:

```sh
node work/0.1/check.mjs <run.json>
```

The checker validates the current development schemas and the cross-record
relationships it implements, including ordering, references, bounded counts,
terminal-state agreement, repair reserve, projection equality, digest
recomputation, authority lifetime, exact approval, single execution, and
separation of receipt from effect observation.

A passing result means only that the supplied bytes were consistent with the
bounded development checks performed by that checker version. It is not a
release, certification, adoption, provider test, signature verification,
security audit, legal opinion, dispatch authorization, or whole-XENIA
conformance result. The checker does not fetch a continuation, handoff,
evidence, terms, or provider resource and never dispatches an action.

Checker output is not automatically public. It contains an artifact digest,
terminal metadata, and possibly paths or diagnostic text derived from a
sensitive record. A consumer MUST treat it at least as restrictively as the
input record's `record_data_zone_id` declaration and MUST NOT publish it merely
because `result` is `conformant`.

## Security and privacy boundaries

- Literal inputs are stored in the run. They **MUST NOT** contain passwords,
  tokens, private keys, session cookies, or other credentials. Use a
  `credential_ref`; the secret remains in a separately authorized broker.
- Confidential or restricted input MUST be externalized as an `artifact_ref`
  or `credential_ref`, not copied into a literal. References and their metadata
  can still be sensitive.
- A credential reference is still sensitive metadata. It MUST reveal no secret
  value. It is an opaque broker identifier, not a fetch URL, and MUST NOT carry
  secret material or URI user information (`userinfo`), query, or fragment
  components. It SHOULD be scoped to the run, purpose, audience, and shortest
  useful lifetime.
- Artifact and evidence locators may reveal names, tenants, paths, query data,
  or internal topology. Use the least revealing stable reference and disclose
  it only inside an appropriate data zone.
- Consumers MUST NOT fetch evidence, artifact, policy, terms, reply, cancel, or
  tool references blindly. Network adapters need protocol, destination,
  redirect, DNS-rebinding, private-network, size, timeout, content-type, and
  concurrency controls.
- A data-zone declaration records intended classification, purpose, audience,
  and retention. `audience.mode: "public"` means intentionally public;
  `audience.mode: "actors"` names the intended declared actors. Neither is
  encryption or access control. `ephemeral` describes the application-layer
  undertaking; it does not prove deletion from logs, platforms, networks,
  backups, operators, or third parties.
- Exact projections deliberately repeat sensitive metadata inside authority,
  action, handoff, or license records. Duplication does not make it public or
  create permission to disclose it.
- `unknown` cost, license, authority, reversibility, or effect state is useful
  truth. It MUST NOT be silently converted to a favourable value. A binding
  action whose applicable terms or authority remain unknown MUST stop.
- Risk labels are scoped planning claims, not measures of a participant's
  worth, trustworthiness, or standing.
- Approval nonces and digests prevent only the reuse that an implementation
  actually checks. Distributed races require atomic one-use consumption.
- Cancellation and pause stop future work at the stated boundary. They do not
  undo sent messages, disclosed data, provider writes, or other earlier
  effects.
- Logs, checker errors, traces, and exported fixtures MUST NOT echo credential
  values or unnecessary protected input data.

## Outside Work 0.1

This profile does not define or establish:

- consciousness, personhood, identity, legal capacity, employment, ownership,
  or a participant's inner state;
- authentication, key control, informed consent, representative authority,
  legal basis, or provider permission merely from a record or credential;
- signature formats, key resolution, signer authority, or cryptographic
  attestation verification;
- a workflow runtime, model, prompt format, scheduler, queue, checkpoint store,
  browser driver, human interface, or provider adapter;
- credential storage, token issuance, tenant policy, or access-control
  enforcement;
- immutable storage, distributed consensus, exactly-once execution, provider
  idempotency, compensation, or reversal;
- the truth, independence, completeness, or causal force of evidence;
- a provider's final real-world effect from its response alone;
- universal privacy, confidentiality, retention, deletion, portability,
  safety, availability, cost, license validity, or terms compliance;
- XENIA Surface conformance, Covenant adoption, or whole-framework conformance;
  or
- affiliation with or endorsement by any provider whose service is referenced.

Work 0.1 records a bounded account of work. It keeps invitation, participation,
authority, approval, execution, response, observation, and repair separate so
an implementation can be useful without pretending that one record proves all
the others.
