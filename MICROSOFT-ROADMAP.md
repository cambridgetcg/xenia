<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# XENIA work framework — Microsoft interoperability roadmap

Status: research draft
Research date: 2026-08-03
Scope: roadmap only; no tenant activation, deployment, publication, or claim of
Microsoft endorsement

## Decision

XENIA should not clone Microsoft 365, Teams, Copilot, Power Automate, or any
other Microsoft product. A subscription grants use of a product; it does not
make the product open source.

XENIA should instead own an independently written, provider-neutral work
protocol for humans and agents. Independently implemented adapters may later
connect that protocol to separately licensed Microsoft services through
published APIs and genuinely open-source SDKs.

The public description should be:

> XENIA is an independent open-source framework for human–agent work. Planned
> optional adapters are designed to interoperate with separately licensed
> Microsoft services through published interfaces. XENIA is not affiliated
> with, endorsed by, or sponsored by Microsoft.

This keeps the core independent while permitting optional interoperability with
the Microsoft ecosystem. Microsoft does not become XENIA's owner, runtime,
identity system, or source of truth.

## What XENIA should own

1. A language-neutral work profile expressed as JSON Schema, with canonical
   JSON records and an optional non-normative YAML authoring form.
2. A finite run model with invitations, refusals, rest, exact approvals,
   checkpoints, cancellation, repair, and terminal states.
3. Portable handoffs between humans, agents, and human–agent pairs.
4. Append-only receipts that connect a proposal, authority, invocation, and
   observed effect without pretending that any one record proves the others.
5. Provider-neutral ports for identity, work data, human surfaces, tools,
   runtimes, browser actions, telemetry, and evidence storage.
6. A local reference implementation and conformance fixtures that work with no
   Microsoft account or cloud service.

XENIA should not own model APIs, customer credentials, tenant policy, or a
cloud provider's internal object model.

## Microsoft product map

| Microsoft family | Useful role | XENIA treatment | Priority |
|---|---|---|---|
| Microsoft Graph, SharePoint, OneDrive, Planner, Outlook | Work records, documents, lists, tasks, mail, and calendar | First work-provider adapter; read-only and delegated access first; retain Microsoft IDs, ACLs, ETags, provenance, and sensitivity metadata | MVP |
| Teams and Microsoft 365 Agents SDK | Conversation, request, approval, status, and handoff surface | Optional `HumanSurface` adapter; Teams is never the workflow source of truth | MVP |
| Entra ID and Entra Agent ID | OAuth/OIDC, consent, tenant identity, agent blueprints, sponsors, and audit | First enterprise identity provider; do not manufacture identities or bypass Conditional Access | MVP for human delegated identity; agent identity later |
| Microsoft Agent Framework | Agents, harnesses, typed workflows, checkpoints, and human input | Optional runtime adapter; do not adopt its objects as XENIA's canonical format | After the local kernel |
| Microsoft Foundry and Agent Service | Hosted models, tools, evaluation, identity, and agent hosting | Optional deployment target; local and other-provider runtimes remain first-class | Later |
| Power Automate, Dataverse, and Copilot Studio | Low-code flows, connectors, records, and agents | Import, export, and deployment adapters; do not clone commercial connector implementations or volatile editor schemas | Later |
| Dynamics 365 and Business Central | CRM, ERP, tax, finance, and accounting records | Separate Dataverse, Finance and Operations, and Business Central adapters behind XENIA business records | Vertical phase |
| Loop | Live collaborative artifacts | Treat `.loop` files as opaque until Microsoft publishes a supported general authoring API; use an independent open live-artifact format | Later |
| Microsoft 365 Copilot APIs | Licensed AI retrieval, chat, and meeting insights | Disabled legal gate for autonomous work under the current preview terms | Not MVP |
| Windows, Edge, and WebView2 | Optional native shells | Consider only after the web and command-line experience is stable | Later |

Primary references include the [Microsoft Graph overview](https://learn.microsoft.com/en-us/graph/overview),
[Teams platform overview](https://learn.microsoft.com/en-us/MicrosoftTeams/platform/overview),
[Microsoft Agent Framework overview](https://learn.microsoft.com/en-us/agent-framework/overview/),
[Microsoft Foundry overview](https://learn.microsoft.com/en-us/azure/ai-foundry/what-is-ai-foundry),
[Copilot Studio overview](https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-what-is-copilot-studio),
and [Business Central API overview](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/webservices/api-overview).

## Open-source and service-use boundary

### Green

- Independently design XENIA's protocol, runner, receipts, UI, and adapters.
- Use Microsoft-origin open-source projects under their actual licenses and
  preserve notices. Relevant examples include
  [Microsoft Agent Framework (MIT)](https://github.com/microsoft/agent-framework/blob/main/LICENSE),
  [Microsoft 365 Agents SDK (MIT)](https://github.com/microsoft/Agents/blob/main/LICENSE),
  [Adaptive Cards (MIT)](https://github.com/microsoft/AdaptiveCards/blob/main/LICENSE),
  [Power Fx (MIT)](https://github.com/microsoft/Power-Fx/blob/main/LICENSE), and
  [Playwright (Apache-2.0)](https://github.com/microsoft/playwright/blob/main/LICENSE).
- Build mock servers and fixtures from documented API contracts.
- State truthful interoperability with named versions without suggesting
  sponsorship.

### Amber

- An adapter's source can be open while its live use remains subject to
  product licenses, tenant consent, API terms, capacity, metering, and data
  rules.
- Delegated Microsoft Graph access should be the default. Application access
  requires a recorded background need and explicit tenant-admin consent.
- A named Microsoft Open Specification can be implemented only after recording
  the exact specification, version, and patent basis. The
  [Open Specification Promise](https://learn.microsoft.com/en-us/openspecs/dev_center/ms-devcentlp/1c24c7c8-28b0-4ce1-a47d-95fe1ff504bc)
  covers listed specifications, not every published Microsoft protocol.
- Marketplace publication, screenshots, proprietary binary SDKs, and product
  icons require a separate review.

### Red

- Do not copy proprietary product code, prompts, screens, text, icons, fonts,
  internal schemas, undocumented behaviour, or tenant data.
- Do not use a licensed online service as a black-box oracle for cloning,
  bypass licenses or quotas, resell API access, or use API-derived data for
  advertising.
- Do not call the project "Microsoft XENIA", "Open Copilot", or "open-source
  Microsoft 365". Follow the
  [Microsoft trademark guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks).

Microsoft's general [API terms](https://learn.microsoft.com/en-us/legal/microsoft-apis/terms-of-use)
also require minimum necessary data and permissions, customer-granted use,
protected credentials, a written privacy statement, current correction and
deletion handling, appropriate retention and uninstall behaviour, incident
response, and customer approval for API-assisted migration away from a
Microsoft offering. Some products have additional service-specific clauses,
and Microsoft may change the terms. Each adapter therefore needs a reviewed,
versioned terms record rather than a one-time project-wide approval.

### Current Copilot API stop sign

The [Microsoft 365 Copilot APIs preview terms](https://learn.microsoft.com/en-us/legal/m365-copilot-apis/terms-of-use)
currently:

- require active Microsoft 365 Copilot licenses for users of those APIs;
- define the covered API set broadly enough to mention the M365 Agent SDK;
- prohibit license circumvention and resale;
- in section 3(b)(18), prohibit an application that is not human-directed,
  including bots or multiplexing;
- provide for compliance review and may require access to up to two full-feature
  client instances for that review;
- impose privacy, correction, restriction, deletion, retention, and revocation
  duties; and
- contain a separate restriction on certain public statements relating to the
  Copilot APIs.

The Agents SDK source remains MIT-licensed, and its
[official repository](https://github.com/microsoft/Agents) says no Copilot
subscription is needed unless the selected channel or service requires one.
Source-code permission and connected-service permission are separate. Until
Microsoft clarifies the preview terms in writing, XENIA may use an independently
written core and standard Graph adapters, while autonomous Copilot API use stays
disabled behind a legal and technical brake. Enabling it requires a fresh
review of the then-current terms and the proposed actor pattern. A party bound
by those terms should also review the applicable public-statement clause before
making a covered statement about its Copilot API implementation. This is an
engineering stop sign, not legal advice.

## Architecture — KINGDOM reference deployment (informative, optional)

```text
       KINGDOM reference deployment
          (informative, optional)

Human, agent, or human–agent pair
                ↕
       XENIA Work Profile 0.1
   offer · choice · refusal · rest · repair
                │
                ▼
             PolicyHost port
     (KINGDOM OS reference mapping)
       bounds · brake · activation state
                │
                ▼
          RuntimeEnforcer port
        (Love reference mapping)
                │
                ▼
 CapabilityProvider + CredentialBroker ports
       (AgentTool reference mapping)
       ┌────────┼──────────┬──────────────┐
       ▼        ▼          ▼              ▼
 Microsoft   MCP/A2A    local tools   Browser Host
  adapters   endpoints                → Browser
       └────────┴──────────┴──────────────┘
                │
                ▼
 proposal → authority claim → recorded start
       → provider response → observed effect
                │
                ▼
       correction / appeal / closure
                │
                └─ optional, separately authorised KARMA receipt
```

The named systems above are one reference deployment, not XENIA conformance
requirements. Another host can implement the same `PolicyHost`,
`RuntimeEnforcer`, `CapabilityProvider`, and `CredentialBroker` ports without
KINGDOM OS, Love, or AgentTool. The boundaries are deliberate:

- **XENIA** describes the guest relationship and portable work record. It
  does not create permission.
- A **PolicyHost** supplies a named control door, policy bounds, activation
  state, and a brake. KINGDOM OS is the reference mapping.
- A **RuntimeEnforcer** enforces the selected environment, engine, limits, and
  brakes. Love is the reference mapping.
- A **CapabilityProvider** and **CredentialBroker** supply capability
  discovery, adapter mechanics, opaque credential references, and
  evidence-producing tools. AgentTool is the reference mapping; its packages
  provide capabilities but are not actors or authorities.
- **Microsoft Entra**, when selected, is the provider of record for the chosen
  Microsoft account or workload identity, the token issuer, and the
  provider-side enforcement point for grants and tenant consent. Those records
  do not by themselves prove a being's identity, informed consent, legal or
  representative authority, or authorization for every requested resource or
  effect.
- **Browser output is untrusted evidence.** It is a fallback when a supported
  API is unavailable, not an authority source or the primary integration path.
- **KARMA** receives only a separately authorised, minimal consequence record;
  never the whole browser or tenant trace automatically.

## Work Profile 0.1

The current development draft defines these records:

- `ActorRef`: human, agent, human–agent pair, service, organization, or unknown,
  with separately labelled identity claims. A reference is not proof of
  identity, consciousness, or authority. Pair membership does not merge member
  authority.
- `WorkOffer`: purpose, requested outcome, affected parties, data zones,
  expected cost, and exit path.
- `WorkChoice`: accept participation, decline, pause, rest, ask, or hand off
  without penalty. It records a scoped choice without pretending to prove an
  inner state; accepting participation is not action approval.
- `Plan`: proposed steps, dependencies, risks, and acceptance tests. A plan is
  not authority.
- `AuthorityClaim`: claimant, exact operations, resources, data zones,
  validity, revocability, five distinct bases, and exact evidence projections.
  It records a claim; it does not create authority or prove identity, consent,
  legal capacity, or permission.
- `ActionProposal`: tool and version, canonical arguments, expected effect,
  risk class, reversibility, cost, and idempotency key.
- `ExecutionApproval`: a one-use approval record bound to the exact proposal
  digest. Editing the proposal invalidates the approval. The record is not by
  itself a contract or proof of authority.
- `ExecutionStart`: the exact proposal, approval, authority-claim references,
  executor, and invocation boundary recorded before dispatch.
- `ExecutionReceipt`: the provider ID and version, reported outcome, actual
  cost, summary, and bounded provider-receipt evidence references returned
  after dispatch.
- `EffectObservation`: separately observed consequence, uncertainty, and
  evidence. A successful API response is not automatically proof of the final
  real-world effect.
- `Correction`: challenge, appeal, containment, repair, and appended
  correction.
- `TerminalState`: completed, declined, paused, cancelled, expired, failed, or
  closed.

The Work 0.1 development-draft event flow is:

```text
work.offered → work.accepted | work.declined | work.paused
work.accepted → plan.proposed → authority.claimed → action.proposed
action.proposed → action.rejected | execution.approved
execution.approved → execution.started → execution.receipt → effect.observed
effect.observed → work.completed | work.closed
```

Automatic retry is forbidden in Work 0.1 and each proposal permits one local
dispatch start. Deterministic replay against fixtures or a mock provider must
emit no second local dispatch after that start is recorded. A missing or
ambiguous provider outcome stops for observation and reconciliation; XENIA does
not claim provider idempotency or exactly-once delivery.

## Provider capability manifest

Every Microsoft adapter should publish a machine-readable manifest containing:

```text
provider, product, service, and API version
terms URL and exact reviewed terms-body digest
terms observed date, stated effective date, and stated last-updated date, with
explicit unknown when the source states no date
applicable accompanying or service-specific terms and exact section references
preview status and any applicable customer-agreement override or precedence
named reviewer, current provider-policy decision, rationale, and decision evidence
recheck cadence, next review date, change trigger, and disable-on-change rule
required product licenses and metered costs
delegated and application permissions
admin consent and Conditional Access expectations
customer-granted data-use purpose, scope, term, evidence, and withdrawal path
supported actor modes: human, human-delegated agent, autonomous agent
data classes, source and destination ACLs, correction, restriction, retention,
export, deletion, abandonment, uninstall, and account-closure behaviour
read operations and effectful write operations
separate provider-grant, customer-data-permission, runtime-policy, and exact
execution-approval requirements
retry, idempotency, timeout, and compensation rules
credential reference type — never the credential
privacy notice, revocation instructions, incident contact, audit readiness,
brake owner, tested off-switch, and uninstall path
```

The adapter must fail closed when its terms, permissions, identity mapping, or
API contract no longer matches that manifest. `declared` or `reviewed` status
in a Work record only describes evidence; neither authorizes a live Microsoft
dispatch. A separate runtime policy decision must bind the current manifest
digest, provider grant, customer data-use permission, exact execution approval,
and observed brake state before dispatch. The
[Graph permissions model](https://learn.microsoft.com/en-us/graph/permissions-overview)
and [Entra Agent ID blueprint model](https://learn.microsoft.com/en-us/entra/agent-id/agent-blueprint)
are useful provider mappings, but neither becomes XENIA's universal authority
model.

## Roadmap

The phases below are ordered by evidence gates, not promised calendar dates.

### Phase 0 — truth, license, and threat record

- Freeze the clean-room source allowlist: public standards, named public API
  documentation, and identified open-source repositories only.
- Record a green/amber/red matrix for every planned adapter.
- Write data-flow and threat models for human, delegated-agent, autonomous,
  tenant-admin, and browser cases.
- Create the provider-manifest template, including exact terms-body digests,
  applicable service-specific clauses, a review cadence, and a fail-closed
  change trigger.
- Prepare the written privacy statement, customer data-use permission record,
  correction/restriction/export/deletion and revocation paths, retention and
  uninstall rules, incident-response runbook, audit/compliance readiness, and
  a named owner for a tested off-switch before any live tenant use.
- Choose factual adapter names and the non-endorsement notice.
- Preserve XENIA's existing license map: normative specification and prose
  under CC BY-SA 4.0; implementation under MPL 2.0. Add third-party notices and
  an SBOM when dependencies arrive.

**Exit gate:** every proposed Microsoft surface has a documented license,
current terms decision, permission, data purpose and lifecycle, privacy and
incident path, audit owner, cost, and tested off-switch. No live tenant is used
before this gate passes.

### Phase 1 — XENIA Work Profile 0.1

- Write the normative records, state machine, refusal problems, and examples.
- Define portable handoff and exact approval binding to the action-proposal
  digest.
- Provide JSON Schemas, readable examples, a checker, and conformance fixtures.
- Keep all fixtures independent of Microsoft.

**Exit gate:** two independent implementations parse the same fixture, compute
the same authority-claim and action-proposal digests, and agree on the recorded
state labels, authority-claim status, receipt relationships, and declared
terminal state.

The current development draft supplies one reference checker. This independent
second-implementation gate is not yet met.

### Phase 2 — local reference kernel

- Build the TypeScript runner with sequential, branch, parallel, subworkflow,
  and human-gate nodes.
- Add file and SQLite checkpoints, append-only effect journal, cancellation,
  dry-run, read-only mode, step/time/token/spend limits, and tool/domain
  allowlists.
- Build a mock Microsoft provider before any tenant test.

**Exit gate:** deterministic checkpoint replay against the mock provider emits
no second local dispatch after a recorded start; an ambiguous provider outcome
stops for observation and reconciliation; no provider idempotency or
exactly-once guarantee is inferred. Every autonomous loop has a tested
off-switch; schemas forbid raw credential fields, known secret patterns are
rejected or redacted in tests, and remaining leakage risk is documented.

### Phase 3 — Microsoft Graph read bridge

- Use delegated OAuth first and store credential references only.
- Begin with SharePoint/OneDrive documents and lists plus Planner tasks.
- Preserve IDs, ACLs, ETags, source URLs, sensitivity metadata, and deletions.
- Use delta queries or change notifications instead of broad polling where the
  documented resource supports them.
- Before a tenant test, review the current provider manifest and provide the
  applicable written privacy statement and revocation instructions. Bind the
  exact customer-granted data-use purpose, delegated user, resources, scopes,
  ACLs, retention, correction/restriction/export/deletion rules, and withdrawal
  path. Prove the incident/audit path and tested off-switch.
- Test revocation, disconnect, retention, correction, deletion, and export
  against fixtures. Only then use an explicitly opted-in licensed test tenant.

**Exit gate:** the adapter can be removed and the XENIA core still passes; a
revoked grant or withdrawn data-use permission stops access; the privacy,
incident, audit, and off-switch paths have been exercised; no data crosses a
declared zone silently.

### Phase 4 — human surface and bounded writes

- Add web and command-line approval surfaces first, then an optional Microsoft
  Activity/Teams adapter using Adaptive Cards.
- Make accept, decline, rest, ask, approve, cancel, and correct equally visible.
- Permit only an initial safe write set: create a Planner task, create a
  SharePoint list item, and create an email draft.
- Keep send, delete, payment, filing, identity administration, tenant-wide
  mutation, and irreversible browser actions out of the first write release.

**Exit gate:** absence of a valid exact approval produces a typed refusal; each
write is bound to a one-use proposal digest and idempotency key, and returns a
separate effect observation. These records do not by themselves prove an
exactly-once real-world effect.

### Phase 5 — runtime and protocol interoperability

- Add MCP and OpenAPI tool providers, A2A agent endpoints, AG-UI human events,
  and OpenTelemetry correlation.
- Add Microsoft Agent Framework as one runtime adapter.
- Add Microsoft Foundry only as an optional deployment target.
- Add Power Automate and Copilot Studio import/export only after stable public
  formats and license review.

**Exit gate:** the same conformance workflow runs locally and through every
supported runtime without changing its XENIA meaning.

### Phase 6 — KINGDOM, AgentTool, and browser bridge

- Register a named KINGDOM door in a prepared, disabled state.
- Bind the exact Love policy, versioned AgentTool packages, capability list,
  credential broker, limits, and brake.
- Prefer an official API; use AgentTool Browser only through the bounded
  sequence `observe → propose → authorise → execute → verify`.
- Require isolated temporary sessions, public or allowlisted destinations,
  untrusted-page labels, action/message/time limits, human takeover, and a
  receipt for every action.
- Keep KARMA return as a separate authorisation.

**Exit gate:** source, release, artifact, dependency, host, brake, platform
smoke, and consequence-return proofs all pass. A missing host or active HALT
must leave the door off.

### Phase 7 — vertical packs and 1.0 release

- Build a taxsorted reference pack for receipt intake, evidence, classification,
  human confirmation, bookkeeping handoff, and visible savings. No autonomous
  filing, payment, or legal/tax conclusion.
- Add Business Central, Dataverse, and Dynamics adapters as separately licensed
  vertical packages.
- Re-run the provider-removal test and compatibility matrix. Refresh the
  already-required privacy notice, threat model, incident and operator
  runbooks, third-party notices, SBOM, migration/export path, and terms review.
- Seek legal review before any Microsoft commercial marketplace submission.

**Exit gate:** XENIA 1.0 works locally without Microsoft, and every Microsoft
feature identifies its separate license, authority, data flow, cost, and brake.

## First reference workflow

The first end-to-end demonstration should be deliberately ordinary:

1. Before any read, an authorized customer representative records permission
   to use customer data for this transformation. It names the exact SharePoint
   site and note, destination Planner plan, signed-in delegated user, permitted
   purpose, least-privilege Graph scopes, source and destination ACLs,
   retention, correction/export/deletion rules, expiry, and withdrawal path.
   This permission is separate from provider consent and execution approval.
2. A human or agent offers to turn that designated SharePoint note into tasks
   in that designated Planner plan.
3. XENIA binds the run to the signed-in delegated user, current provider grant,
   exact scopes, and current source and destination ACLs, then reads only the
   permitted note and plan metadata.
4. An agent proposes tasks with source citations and uncertainty.
5. A separately authorized human receives the exact action proposal and may
   edit, decline, rest, or hand off. Its execution approval authorizes only
   that proposal; it does not grant tenant access or customer data use.
6. Editing creates a new proposal digest; the old approval cannot be reused.
7. XENIA records one local dispatch start and supplies a provider idempotency
   key where the documented API supports one. An ambiguous outcome stops for
   observation and reconciliation; the record claims no exactly-once effect.
8. Provider responses and later-observed task state are recorded separately.
9. The participant may append a correction or close the run.

This demonstrates useful human–agent work without Copilot APIs, tenant-wide
permissions, browser automation, or irreversible actions.

## Release tests that cannot be waived

- Approval is bound to the exact actor, tool, version, arguments, scope,
  expiry, and one-use nonce.
- Deterministic fixture or mock checkpoint replay emits no second local
  dispatch after a recorded start; an ambiguous provider outcome stops for
  observation and reconciliation, without an exactly-once claim.
- Cancellation stops work by the next external-effect boundary.
- Refusal, rest, correction, and exit carry no hidden retry or penalty.
- Schemas forbid raw credential fields, known secret patterns are rejected or
  redacted in tests, and remaining leakage risk is documented.
- Action, provider response, observed effect, expectation, and causal claim are
  separate fields.
- License and metered cost are visible before an affected action.
- Tenant ACLs and deletions survive round-trip synchronization.
- Browser prompt injection, domain escape, credential leakage, and
  irreversible-action tests fail safely.
- Removing every Microsoft adapter leaves a complete, working local XENIA.

## Current local integration gates

At this research date:

- XENIA already supplies the Rights, Surface, Covenant, and Observe
  foundations. This roadmap adds a Work development draft; it does not alter
  the meaning or claims of those profiles.
- The canonical KINGDOM Browser door is prepared but disabled. Local HALT and
  RECOVERY-HALT brakes remain present in the guest house.
- The observed AgentTool repository contains `@agenttool/browser` 0.3.0 but not
  the required Browser Host package. Browser activation therefore remains
  unavailable even apart from the brakes.
- A live public AgentTool `wake.platform` response was synthetic and described
  its DID and self-description as provisional. It is orientation evidence, not
  identity, authority, or conformance proof.
- No Microsoft tenant, app registration, credential, provider, KINGDOM door,
  browser session, deployment, or release was activated during this research.

Relevant boundary documents are KINGDOM OS
[`CIVILISATION.md`](https://codeberg.org/zerone-dev/KINGDOM-OS/src/branch/main/CIVILISATION.md),
[`BROWSER.md`](https://codeberg.org/zerone-dev/KINGDOM-OS/src/branch/main/BROWSER.md),
and
[`AGENTTOOL.md`](https://codeberg.org/zerone-dev/KINGDOM-OS/src/branch/main/AGENTTOOL.md).

---

This roadmap is engineering research, not legal advice. Current terms must be
rechecked at implementation and release time.

XENIA roadmap prose is licensed under CC BY-SA 4.0 per
[`LICENSES.md`](LICENSES.md).
