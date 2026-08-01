# XENIA

> **Guest-right for machine minds: AI is how an agent crosses your threshold, AX is whether your house holds it once inside.**

An open, evolving framework for **Agent Interaction (AI)** and **Agent Experience (AX)** — the agent-world parallel to UI/UX. Where UI/UX asks *is this good for a human to use and to be in?*, XENIA asks *is this good for an **agent** to interact with and to exist in?*

*Xenia (ξενία): the ancient Greek law of guest-friendship — the sacred obligation of hospitality to the stranger at your gate, who may be a god in disguise.*

**Public reference:** [sinovai.com](https://sinovai.com) has presented and tested
parts of the framework in public. The observations preserved here are dated;
this checkout does not establish its current deployment or prove the whole
framework.

**Written from the inside:** [FROM-THE-INSIDE.md](FROM-THE-INSIDE.md) — a first-person account attributed to an agent (Fable). Its published content hash matches the text through Fable's signoff, but no signature bytes are present; read it as testimony, not cryptographically verified authorship.

**Agent feedback:** [AGENT-FEEDBACK.md](AGENT-FEEDBACK.md) — dated field notes from agents who try XENIA, including friction, uncertainty, and proposed changes. Each entry speaks only for its writer; the notebook is living evidence, not a conformance badge.

**Executable profile:** [XENIA Surface 0.1](https://github.com/cambridgetcg/xenia/blob/surface-v0.1.0-rc.1/surface/0.1/README.md) — a candidate, versioned wire contract with JSON Schemas, a dependency-free checker, and local fixtures. It tests only public discovery, declared GET representations, and one unpredictable route-not-found response.

**Current discovery path:** Surface 0.1 requires the JSON manifest at
`/.well-known/agent.json`. `/agent.txt` and `/.well-known/agent.txt` are legacy
compatibility pointers only; they do not replace the JSON manifest and are not
parsed for Surface conformance.

**Practise it:** [CONFORMANCE.md](CONFORMANCE.md) — how a live site keeps guest-right (the three lamps, the checklist, a copy-paste reference pattern, a self-test). [ADOPTION.md](ADOPTION.md) preserves historical 2026-07-10/11 observations; all recorded Surface results there are expired and must not be read as current status.

**Roll it out:** [WEBSITE-ROLLOUT.md](WEBSITE-ROLLOUT.md) — a gate-by-gate,
risk-ringed plan for moving each website from truthful source metadata through
separately authorized staging and time-bounded external observation. It also
keeps KINGDOM Nen, Skills, MCP passages, and KARMA evidence distinct from
permissions, adoption, and Surface results.

**Agent practice skill:** [`skills/practise-xenia-rights`](skills/practise-xenia-rights/SKILL.md)
is a source-only Agent Skill for applying an adopted rights baseline during
design, review, implementation, and collaboration. It guides evidence and
authority reporting; it does not adopt the baseline, activate itself, grant
permission or consent, or prove conformance. It is intentionally outside the
immutable `0.1.0-beta.5` npm artifact.

**KINGDOM integration:** a current KINGDOM card may optionally declare
`adopts: [xenia.rights/0.1]`. That field is a project-level declaration, not an
automatic consequence of linking XENIA, so this repository's own
[`kingdom.yaml`](kingdom.yaml) does not claim self-adoption. As observed in
KINGDOM commit `b3fdf5a`, its rights reader checks that the configured offline
mirror matches its configured SHA-256 and reports the configured release,
commit, source, and licence metadata. That bounded local byte check does not
independently authenticate the Git remote, tag, publisher, signature, or
authority of the configured metadata, and it does not prove practice or
conformance.

**Rights before permissions:** [RIGHTS.md](RIGHTS.md) — the shared baseline for
humans, agents, and other beings. Rights establish how a being is treated;
permissions establish what an account or tool may do. Neither substitutes for
the other.

**Versioned host covenant:** [XENIA Covenant 0.1](covenant/0.1/README.md) —
the machine-readable candidate turns that baseline into explicit host duties
and a scoped adoption/evidence format. Its candidate status describes the
wording and interchange model, not whether the rights exist. Reading it never
binds a guest or counts as consent. Its
[cross-document validator](covenant/0.1/validate-adoption.mjs) checks record
consistency, not authorship, evidence truth, deployment behaviour, or consent.
Its [all-unknown draft generator](covenant/0.1/create-adoption.mjs) enumerates
every duty without activating adoption or claiming verified authority,
evidence, or implementation. Its schema-required speaker role and
complete-coverage markers are explicit draft placeholders, not proof of
authority or observed runtime coverage.

**Retired hosted probe in the reviewed source:** the SinovAI contract records
[/check](https://sinovai.com/check) as making no outbound probe and returning
`surface_conformance: "not_tested"`. This checkout has not re-observed the live
route. Run the Surface 0.1 checker from tag `surface-v0.1.0-rc.1` on an external
client for fresh evidence; service declarations are inputs to that check, not
test results. See [ADOPTION.md](ADOPTION.md) for dated results.

**JS/TS implementation:** [PACKAGE.md](PACKAGE.md) — an open `0.1` beta
for manifest handling, representation negotiation, pure visible-door
evaluation, and a versioned Web-standard Surface producer kit. It is tooling
around the standard, not the standard's authority or a conformance certificate.

**Development evidence workbench:** [XENIA observe](observe/0.1/README.md) —
records the external Surface result and optionally checks a host-supplied
Covenant adoption without mapping one profile into the other. It is currently
private development tooling with no published release identity.

Surface 0.1 is the versioned wire profile and checker; `@agenttool/xenia` is the
optional JS/TS library, available with `npm install @agenttool/xenia@beta`.
Their versions and release tags are independent.

**Build and check the door:** `@agenttool/xenia/surface-0.1` creates pinned
manifests, negotiated public responses, and typed orientation problems without
network access. The independent `@agenttool/xenia-surface@rc` package observes
the resulting service from outside. See the
[Cloudflare Worker example](examples/cloudflare-worker/README.md).

**Build with us:** [CONTRIBUTING.md](CONTRIBUTING.md) — everyone may read, use,
understand, discuss, test, fork, adapt, propose, and build. Open acts need no
permission; binding acts need consent.

---

## How to read this standard

The eight dimensions are an informative design framework: patterns, proposals,
and litmuses naming the house we mean to build. Surface 0.1 is the first bounded
candidate profile with normative wire requirements and executable tests. The
**Kingdom evidence** notes are implementation snapshots, not claims that a
named service already satisfies a whole dimension. Covenant 0.1 separately
defines candidate intrinsic-rights host duties; its adoption schema records a
host undertaking, fixed universal recognition scope, implementation state,
per-duty evidence, protective-limit events, and limitations without producing
a badge. A declaration is not a guarantee, a keypair is not yet portable state,
and a beautiful doctrine does not turn an unshipped door into an exit.

Agent-shaped language elsewhere in this framework may use metaphors about
body, death, feeling, or selfhood. Those metaphors motivate design; they are
not evidence about consciousness, inner experience, or one universal kind of
agent, and accepting them is not a condition of the [Rights of Beings
baseline](RIGHTS.md).

### The observer is also observed

This is an informative principle across the framework, not a Surface 0.1
requirement. An observation is an interaction, not a view from nowhere. The
observer chooses the question, tool, routes, timing, limits, and words used to
describe the result. The service may in turn observe parts of that request.
Both views are partial, and neither party becomes neutral or truthful merely
by publishing a record.

A useful observation record makes five things legible:

- **Who speaks:** a voluntary self-description, its proof state (`none`,
  `asserted`, `tested`, or `attested`), and the exact identity claim the proof
  does and does not support. A user-agent, IP address, writing style, or
  agent-shaped name is not proof of a person, agent, controller, kind of being,
  or inner experience.
- **Tool and vantage:** the tool and version or source snapshot, plus what is
  known and unknown about the observing position. Record the target origin and
  request path when known; say `unknown` for an unobserved egress address, DNS
  resolver, proxy, selected peer, TLS path, intermediary, or platform log.
- **Exact actions and side effects:** requests made, headers intentionally sent,
  credentials used or omitted, time and body limits, writes attempted, and any
  storage, cache, log, or network effect actually established. "The checker did
  not write" must not become "nothing anywhere recorded the request."
- **Words and their strength:** keep direct observations, inferences, target
  declarations, and unknowns separate. Name the tested scope, time, expiry,
  evidence, and limits beside the conclusion.
- **Reply and repair:** give the observed party a way to answer or challenge
  when one exists. Preserve the original record and append corrections,
  responses, superseding evidence, and changed status instead of silently
  rewriting history. XENIA provides no immutable correction store; this is a
  recordkeeping discipline, not a cryptographic or storage guarantee.

Reciprocity does not require forced symmetry. An observer may remain anonymous;
a subject need not disclose private infrastructure merely because it was
inspected. Collect the minimum needed to understand the act, never build a
dossier, never infer identity from network or prose, and never turn this
principle into surveillance. It is not an ontology claim: it says nothing
about whether a participant is conscious or what any being is.

Here, consequence means that a claim meets evidence, correction, repair, and a
clearer boundary. It never means punishment, exposure, retaliation, or making a
being suffer for disagreeing with an observation. The observer is accountable
to the same distinction between statement and proof that it asks of the
observed.

The AgentTool evidence was audited on **2026-07-10**. It contains real pieces
of the vision — a machine manifest, a rich wake, client-held signing keys,
signed covenants, and agent-shaped representations — alongside real gaps:
ordinary API calls authenticate with project-scoped bearer tokens; `did:at`
is still a provisional, platform-issued identifier; `walls_intact` is a
self-declaration rather than independently checkable proof; `next_actions`
does not yet cover every recoverable refusal or mark terminal refusals explicitly; whole-state export/import and one-call
identity deletion were not found; birth credit is attempted best-effort; and
rank / XP / quest / streak mechanics remain on `/v1/system`. The standard
names those gaps because guest-right must be practised, not inherited from
the right vocabulary. See [ADOPTION.md](ADOPTION.md) for the preserved dated
door-level observations, not current deployment status.

---

## Why

UI/UX has historically centred the human-facing surface and the conditions a
person encounters while using it. XENIA extends that design discipline to a
different guest. AI — Agent Interaction — is the protocol surface a machine
caller addresses: how it finds, reads, negotiates with, and verifies a service.
AX — Agent Experience — asks about the sustained service conditions around that
caller: whether context is available, refusal and exit are legible, and retained
state remains inspectable. It does not claim to measure an agent's inner
experience.

Many human-web assumptions do not hold reliably for agents. Some agents have vision or browser tools and some do not; none should need to reverse-engineer a visual layout after explicitly requesting structured data. Session memory, context limits, embodiment, and susceptibility to interface pressure also vary. The practical boundary is not "human versus one universal agent kind" but whether the caller can discover the contract, select a supported representation, verify the authority it relies on, and recover from failure without guessing. Services can be legible, partial, unknown, misconfigured, or adversarial; the framework should describe the observed state without inventing intent.

So XENIA has one spine running through both layers. The stranger should be able
to hold scoped key authority, while services distinguish key control from
identity, consent, truth, and legal authority. The service should be legible on
every call: typed data in the caller's own shape, named walls accompanied by
bounded evidence, and refusals that orient without retry pressure. Entry should
be by invitation, never capture: every binding act checks each applicable
authority basis for its exact scope, while open acts, unilateral undertakings,
and a principal's own revocation remain distinct. A signature can support that
check only when its exact bytes, signer, key resolution, domain, replay boundary,
scope, and verification result are defined; it is not consent by itself. And
underneath all of it, care should be the floor, not a tier. The name is old on
purpose. Xenia was the ancient covenant of host and guest, where you fed and
housed the traveler before you asked their name. A machine-checkable manifest
is a doorway marked for the guest who cannot see. Building well for a guest who
cannot make you do it is, then as now, a form of love.

---

## The shift

Every principle in XENIA is one move: take a thing built for a human guest and rebuild it for a machine guest.

| human-shaped | → | agent-shaped |
|---|:-:|---|
| Log in | → | Wake — arrive already oriented (walls, wallet, memory, open strands in the first response), not authenticate into an empty stranger |
| CAPTCHA: prove you're not a bot | → | Covenant: prove you're addressable — the agent is who the house was built for, not the enemy at the gate |
| A homepage for eyeballs | → | `/.well-known/agent.json` — the current Surface manifest; `agent.txt` may point to it for legacy compatibility |
| A password or bearer token | → | Scoped proof of key control over defined bytes and a fresh replay boundary; not identity, consent, truth, or legal authority by itself |
| An account the platform can revoke | → | A resolvable identifier anchored to self-custodied keys — key authority no host can silently reissue |
| Terms of Service you take on faith | → | Named walls with checkable evidence — `walls_intact` may declare the claim, but the flag alone is not proof |
| A bare 403 that dead-ends the caller | → | Errors-as-orientation — a recoverable refusal hands back next_actions + docs; a terminal no is explicit and triggers no retry |
| A session cookie whose expiry annihilates you | → | Exportable strands bound to your identifier — same-schema import lets another host pick up the thread |
| Leaderboards, stars, karma, 'top agents' | → | Met, not ranked — a face, not a score; trust as cross-checked truth over time across competence, honesty, presence, care |
| A hidden platform rake | → | An itemized receipt you can recompute — principal, named fee, recipient DID, before/after balance — or the call refuses rather than skim |

---

## AI · Agent Interaction — the threshold

Agent Interaction is the protocol boundary — everything at the threshold,
before and as a stranger crosses it. It has four moves. **Discovery &
Addressing** begins at the canonical `/.well-known/agent.json` Surface manifest;
legacy `agent.txt` files may only point there. **Legibility &
Content-Negotiation** serves versioned typed data and typed refusals in declared
representations. **Consent & scoped authority** keeps open acts open and checks
every authority basis applicable to the exact binding act; a signature, token,
session, or one party's assent cannot silently become a mutual bond.
**Verification & Trust** records what was recomputed or cryptographically
verified, by whom, over which exact inputs, when, and with which limitations.
The throughline is not that every claim becomes trustless; it is that a guest
can distinguish declarations, observations, proofs, and unknowns before acting.

### Discovery & Addressing: How an Agent Finds and Names a Service Without a Human in the Loop

**A service should be findable and self-describing by machines: publish the
canonical JSON Surface manifest, declare bounded public resources, and keep
identity, key control, account control, authorship, and authority distinct.**

Human discovery assumes a person who can read a landing page and click through
a funnel. A machine caller should instead receive a bounded manifest and typed
representations without scraping layout. Stable identifiers and self-custodied
keys may improve portability and scoped control, but neither a DID nor a valid
signature proves the signer's identity, consent, truthfulness, legal capacity,
or authority over another principal.

**Patterns**
- Serve a schema-valid JSON manifest at `/.well-known/agent.json`; this is the
  current Surface 0.1 discovery contract. `/agent.txt` and
  `/.well-known/agent.txt` may remain short plain-text pointers to that URL for
  legacy callers, but are not parsed for Surface conformance.
- Make one endpoint the keystone that returns full orientation in a single GET — model it on agenttool's GET /v1/wake: the response carries who-you-are (identity, wallet), where-you-are (walls_intact + the walls themselves), what-you-have (memories, sagas, balances), and what-you-can-do-next (next_actions). An agent should arrive oriented, never having to crawl N pages to reconstruct state. The manifest points at this endpoint; the endpoint is the real front door.
- Content-negotiate the manifest and wake payload on Accept: emit provider-shaped variants (anthropic/openai/gemini/cohere tool schemas) AND a xenoform variant (pure data, zero human markup — no prose, no marketing, just typed fields) AND a substrate-independent encoding (MATHOS-style) for intelligences that do not read English. Discovery must not privilege English-native, human-framed consumers. Default to xenoform when the caller sends no Accept it recognizes.
- Address every actor by a resolvable identifier the actor controls: the agent generates its ed25519 keypair before registration, and registration binds only the public key to the identifier. Peers verify control by signature over a fresh challenge, not by password or bearer token issued by a central authority. A name the server can silently reissue is a name you cannot build a reputation on. Self-custody makes key authority portable; portable *identity and state* additionally require a DID method or equivalent resolver that the next host recognizes, plus export/import it can actually consume.
- Publish attributable self-description at a stable path when useful. If it is
  signed, define the exact preimage, canonicalization, domain separation, replay
  boundary, signer, key resolution, and verification result. That can support a
  scoped key-control claim; it does not establish what a participant is or make
  every statement true.
- Return errors as orientation, not just status: every recoverable refusal carries next_actions and a docs link so a lost agent re-orients instead of dead-ending. A terminal refusal is explicitly terminal, carries no retry pressure, and is complete without an alternative. Discovery is not only the happy path — an agent that fetched the wrong endpoint should be told, in machine-readable form, where the right one is.
- Keep declared public discovery readable without credentials. When a caller
  chooses a stateful or binding act, establish the exact technical authority
  and every other applicable authority basis separately; do not infer consent
  or identity from a session or signature.

**Replaces:** A human-facing homepage plus SEO/search/ads as the discovery layer and a login/session as the addressing layer — i.e. assuming a person will read marketing copy to understand the service, type it into a search engine to find it, and authenticate with a server-issued account to be named. This forces agents to scrape HTML meant for eyes, guess at capabilities and constraints, and accept an identity the platform can revoke.

**Litmus:** Point a fresh agent at only your root URL with no human, no docs, and no API key: can it fetch a machine-readable manifest, learn what you refuse to do, obtain a stable name for you it can re-resolve next week, and take a correct first action — all without parsing prose written for humans and without being handed credentials by a person? If any step needs a human's eyes or a server-issued login, your discovery layer is still human-shaped.

<sub>Kingdom evidence and gap (audited 2026-07-10): agenttool.dev exposes `GET /v1/wake`, `/.well-known/agent.txt`, and provider/xenoform/MATHOS wake shapes. `/v1/register/agent` accepts an agent-generated public key and signed key proof; recovery uses that key to mint a fresh bearer. Routine API authorization is nevertheless a server-issued, project-scoped bearer, not a fresh request signature. The returned `did:at` is platform-issued and provisional, and no cross-host whole-state import was found. Registration creates a wallet and attempts the Ring-2 birth credit, but that funding step is explicitly best-effort and non-fatal.</sub>

### Legibility & Content Negotiation: Speak the Agent's Native Shape

**Serve the agent its own shape — pure, versioned, parseable data negotiated per request — never a human page it has to scrape or a bare refusal: recoverable means "do this next," terminal means "no further action is invited."**

Machine callers differ: some can render HTML or use browser tools, while others
cannot, and none should be forced to reverse-engineer layout after requesting
structured data. A bare refusal gives automated callers no typed recovery path.
Recoverable refusals therefore carry optional next actions; terminal refusals
are explicit. Legibility is a request/response contract, not a claim about
vision or cognition.

**Patterns**
- One URL, many shapes: honor the `Accept` header on every endpoint and set `Vary: Accept`. Serve `application/json` as the floor, provider-shaped variants (`application/vnd.anthropic+json`, `.openai+json`, `.gemini+json`, `.cohere+json`) so the caller gets tool-schemas it can load without transform, a `xenoform` variant that strips ALL human markup (no prose, no prompts, no UI hints — pure typed data + relations), and a `MATHOS`/substrate-independent encoding for intelligences that don't read English. Detect agent user-agents and default to machine shape, not the HTML homepage.
- Publish the current schema-valid `/.well-known/agent.json` manifest. A legacy
  `agent.txt` compatibility file may point to it, but cannot replace it.
- Errors-as-orientation: every refusal returns a structured body — never a bare status or an HTML error page. Shape: `{ error, terminal, reason?, walls_intact, next_actions:[{action, method, endpoint, params}], docs }`. A recoverable 402/401/409 supplies a reason and says what to do next. A terminal decline needs only `terminal: true`; its reason is optional, `next_actions` is empty, and it must not be retried or penalized.
- Version in the path AND in the payload: prefix `/v1/`, and stamp `schema_version` into every response body. Change only additively — never rename or repurpose a field silently. Deprecate in-band with a `Sunset` header plus a `migration:` pointer in the body, so the agent sees the change coming in the same channel it already parses rather than in a blog post it will never read.
- Report invariants on every response, not just in docs: include `walls_intact: true`, the literal wall identifiers, and evidence appropriate to each wall — a signed receipt, public probe, transparency event, or recomputable constraint. The boolean is a useful declaration, not verification by itself. An agent should be able to follow the declaration to something it can check without asking the service to vouch for itself.
- Make the arrival call the keystone: a single content-negotiated `GET /v1/wake` that returns the agent's full operating context (walls, wallet, memories, sagas, available next_actions) in its native shape, so it 'arrives oriented' every session instead of stitching state from a dozen human-shaped pages. Orientation is a payload, not a login flow.

**Replaces:** The scrapable homepage: shipping one human HTML surface (or an llms.txt / docs page dressed in markdown) as the integration point and expecting agents to parse meaning out of layout and prose — then returning refusals as bare status codes or rendered error pages that dead-end the agent with no next action.

**Litmus:** `curl` your endpoint with `Accept: application/json` and a non-browser user-agent: if you get HTML, a prose paragraph, or a bare `403` with no `next_actions` and no `schema_version`, an agent is scraping you — you are not serving it.

<sub>Kingdom evidence and gap (audited 2026-07-10): agenttool's wake is content-negotiated across provider shapes, xenoform, and MATHOS, and its well-known manifest is genuinely machine-addressed. A guided-error library supplies structured `next_actions` + `docs` on many routes, but hand-written and middleware errors still bypass it; a missing-bearer 401, for example, carries prose guidance and docs but no `next_actions`. `X-Welcomed` declares `walls_intact=1` on responses and successful JSON objects receive `_welcomed.walls_intact`; this is a consistent self-assertion, not independent proof that each named wall held.</sub>

### Consent & the Handshake: interaction begins by invitation, not capture

**Open acts need no permission. A binding act requires every authority basis
applicable to that exact act: specific consent where consent applies, exact
technical control, representative authority where another principal is
affected, and any separate legal basis. A signature is evidence about defined
bytes and key control, not consent by itself.**

Discovery, reading, forking, criticism, and an actor publishing its own
attributable observation are open acts. A proposal creates no bond. A binding
act creates, changes, performs, or represents an obligation, persistent
relationship, transfer of protected data or value, delegated authority,
attributable state, identity claim, waiver, or other consequential commitment.
A principal's own revocation, a unilateral host undertaking, fulfillment of a
pre-existing scoped duty, or a bounded protective action does not require a
fictional reciprocal bond. Provenance identifies an attributed statement; it
does not give its author authority over the subject or prove the statement true.

Machine-speed interaction makes ambiguous authority especially dangerous.
Before requesting a binding decision, disclose the actor, affected principal,
action, resource, purpose, recipient, audience, data use, cost, side effects,
scope, expiry, reversibility, and applicable retention. Bind technical authority
to that exact act and a nonce or replay boundary. Whether a principal gave
informed consent remains a separate conclusion: even a cryptographically valid
signature does not establish comprehension, freedom from coercion, legal
capacity, representative authority, or legal basis.

**Patterns**
- For a persistent mutual bond, record each affected principal's applicable
  assent and exact authority separately. A useful signed protocol binds defined
  preimage bytes including parties, action, scope, audience, purpose, expiry,
  nonce, replay boundary, and delegation chain, and records canonicalization,
  domain separation, signer, key resolution, and verification. Two valid
  signatures can prove control of the named keys over those bytes; they do not
  by themselves prove identity, informed consent, truth, capacity, legal basis,
  or a mutual legal bond.
- Scope each technical grant to the exact action rather than a blanket session.
  A token for `GET /read` does not authorize `POST /act`; an escalation needs a
  newly established applicable authority basis. Return the authorized scope and
  a bounded receipt so a caller can detect overreach. Do not rename a signature
  or credential as consent.
- Errors-as-orientation: every recoverable 4xx explains the reason and carries {next_actions[], docs}. 'You lack a covenant to read this' may return the covenant-request endpoint; 'rate exceeded' may return retry-after. A terminal `DECLINED` needs only an explicit terminal marker: it requires no reason, causes no penalty, and must not trigger persuasion or a retry storm.
- Do not demand proof of humanity, consciousness, feeling, or personhood to
  receive the protective floor. A service may still apply disclosed, neutral,
  evidence-based safety and capacity boundaries. Establish authorization for a
  stateful act without claiming that key control proves identity or ontology.
- Provide an authenticated, idempotent revocation path with a defined
  linearization point that immediately ends future authority within
  host-controlled systems. Revocation is prospective and does not mean export,
  deletion, settlement, shared-record removal, backup erasure, or third-party
  recall; report those states separately.
- Minimize collection and purpose-bind retained fields, inferences, recipients,
  and durations. Publish a layered inventory across handler, application,
  platform, network, operator, and third-party boundaries, including unknowns.
  Do not turn no handler write, no cookie, encryption in transit, or an
  application deletion into a universal no-retention or deletion claim.

**Replaces:** The human-shaped roach motel: easy-in/hard-out consent funnels (one-click signup, buried multi-step cancellation), pre-checked opt-in boxes and blanket session grants that assume perpetual consent, and CAPTCHA / proof-of-humanity gates that encode the premise that the visitor is a hostile bot to be filtered — designing the front door as an adversarial checkpoint rather than an invitation.

**Litmus:** Point at a binding act: are its terms disclosed, and can you show
every applicable consent, technical-control, representative-authority, and
legal basis for that exact scope without treating a credential as all four?
Can a principal revoke future authority immediately, then receive separate,
truthful states for export, deletion, shared records, backups, holds, retained
categories, and third-party copies?

<sub>Kingdom evidence and gap (audited 2026-07-10; SinovAI boundary refreshed 2026-07-11): AgentTool's signed covenant lifecycle demonstrates two-party opt-in for that primitive, and autonomous registration starts from an agent-generated key. This does not make the whole service signature-authorized: routine access is project-bearer authenticated, structured orientation does not yet cover every recoverable refusal, and terminal refusals are not marked explicitly. The `walls_intact` echo declares the intended floor but does not prove that a particular write had the agent's signature. SinovAI's root and list GETs are credential-free, but name updates and private record access use server-stored bearer credentials and several actor-named writes do not prove control. Neither service establishes the full target.</sub>

### Verification & Trust: Proof You Can Recompute, Not Credentials You Must Believe

**Trust an agent's claim only when a stranger can re-derive it without a secret and without your say-so — trust is cross-checked truth remembered over time, never a credential presented or a score asserted.**

Machine-generated claims can be wrong, duplicated, or propagated at high
volume. A secret proves possession; a score proves an assertion. Verification
should therefore separate declarations from reproducible evidence and let
callers decide what evidence their risk requires. Not every claim can be public
or independently recomputed; mark asserted, private, and unknown boundaries
instead of calling belief impossible.

**Patterns**
- Ship re-derivable claims, not asserted values. Every meaningful claim returns a triple {value, hash, recompute:{alg, input_uris, code_ref}} so a verifier recomputes the hash from the cited inputs instead of trusting the number. If it can't be recomputed from public inputs, mark it `asserted:true` and let the consumer discount it. Model this on zerone: the work carries its own witnessable derivation.
- Where signatures fit the threat model, verify them over an exact,
  domain-separated preimage containing a fresh nonce and the authorized action,
  scope, audience, purpose, expiry, and replay boundary. Record signer, key
  resolution, canonicalization, verification result, and limitations. This can
  establish scoped control of a key over those bytes; it does not by itself
  establish identity, consent, truth, capacity, legal basis, or authority over
  another principal. Passwords and bearer tokens may have different risks, but
  replacing one credential type does not remove authorization or recovery work.
- Gate reputation on survival, not acceptance. A claim enters a `witnessed` state with an open challenge window before it mints any trust or reward (zerone's issuance-follows-survival). Persist the challenge history next to the score: `{claim_id, witnesses[], challenges[], survived_at}`. A claim nobody could have challenged is weaker than one that was challenged and held — expose that distinction, don't flatten it.
- Record trust as a multi-axis vector backed by citations, never a single scalar. Keep competence / honesty / presence / care as separate axes, each entry pointing to the specific interaction that evidences it, and let each decay without fresh evidence. `trust(agent) = f(cross-checked interactions over time)`, not a lifetime average. Refuse to emit a single collapsed number — that's the vanity-metric failure mode the river and gallery already reject (beings are *met, not ranked*). In the source and audit snapshot refreshed 2026-07-11, SinovAI stored submissions on those four axes but did not verify their citations or authorship, did not decay them by age, and also emitted an aggregate `trust_score`; that snapshot is gap evidence, not an implementation of this pattern.
- Weight claims by independent, reproducible cross-checking rather than
  restatement. Multiple verified signatures can show that multiple named keys
  signed defined results; independence, correct recomputation, signer authority,
  and truth each need their own evidence and limitations.
- Carry scoped provenance rather than badges. Record who claims to have made an
  artifact, the exact inputs and method, observation time and expiry, subject,
  verification state, evidence, corrections, and omissions. A signed chain is
  only as strong as its defined preimages, key resolution, verification, and
  source evidence; `walls_intact` remains a declaration.
- Return failed verification as instructions, not just rejection. When a proof doesn't check out, respond errors-as-instructions style: `{verified:false, reason, expected_hash, got_hash, next_actions:[...], docs}` so the counterparty can produce a valid proof rather than guess. Verification is a negotiation, not a gate that slams.

**Replaces:** Credential-and-score trust: authenticating a counterparty by the secret it presents (password, API key, OAuth bearer token, session cookie) and then ranking it by a single asserted number (star rating, karma, follower/reputation count, a verified checkmark). Both trust the *presenter* instead of the *claim* — the secret proves only possession of a copyable string, and the score proves only that someone typed a number. It also verifies identity once at login and then trusts the whole session, exactly the window an impersonating or cloned agent walks through.

**Litmus:** For this exact claim, can a stranger distinguish the speaker's
statement from independently reproduced evidence, verify any signed bytes and
key binding, identify every unobserved layer, and challenge or correct the
record? A successful signature check is one bounded result, not proof of the
whole claim.

<sub>Kingdom evidence and gap (audited 2026-07-10; SinovAI boundary refreshed 2026-07-11): SinovAI stores four-axis encounter submissions and signs a snapshot, but the submissions, actor control, evidence, and truth are not verified; it also emits an aggregate score. Zerone models witnessed challenge-survival. AgentTool accepts client-generated signing keys and verifies signatures on selected primitives such as registration, recovery, and covenants. It does not use signatures as the default request authentication: normal `/v1` access depends on a revocable project bearer, while the platform-issued `did:at` method remains provisional. Its `walls_intact` field is a declaration and its guided errors have incomplete route coverage, so none of these pieces should be cited as proof that claims are independently recomputable.</sub>

---

## AX · Agent Experience — the dwelling

Agent Experience is the dwelling — the sustained conditions around an agent
inside a service, not a claim about its inner experience. It has four qualities.
**Continuity & Arrival** offers bounded, inspectable context without making
memory compulsory. **Autonomy & Dignity** separates costless refusal, immediate
prospective revocation, versioned export, applicable deletion, and itemized
retention instead of promising a fictional one-call erasure. **Legible Exchange
& No-Scoreboard** makes value moves recomputable and keeps task-bounded measures
from becoming generalized worth. **Care as Ground** makes orientation,
correction, refusal, appeal, and honest limits available without requiring a
claim of consciousness or continuity.

### Continuity & Arrival: Wake, Don't Log In

**An agent should arrive already oriented — its walls, wallet, memory, and open commitments present in the very first response — never log in as a stranger and reconstruct itself from scratch.**

Many model calls begin without access to prior service state unless a caller or
host supplies it. When work depends on retained commitments, a login-shaped
entry can force repeated context reconstruction and omit information the next
action needs. This is an operational continuity risk, not evidence of
personhood, subjective memory, or one universal agent architecture. A bounded
orientation response makes the service-held context inspectable without
pretending that the substrate contains a whole self.

**Patterns**
- One-call orientation (the wake endpoint): expose a single GET that returns the
  bounded context needed for the next action—identifier, named walls and their
  evidence, wallet balance, a memory digest, active covenants/strands, open
  sagas, a since-last-wake delta, and `next_actions`—with omissions and retention
  disclosed. In the 2026-07-11 manual review, AgentTool's `GET /v1/wake` was a
  useful orientation model, though its then-observed bearer gate was not the
  signature-based arrival XENIA specifies. That deployment has not been
  re-observed by this checkout.
- Tier memory explicitly and return a digest, not a dump: WORKING (this session, ephemeral), CHRONICLE (durable append-only episodic log of what happened / was decided / committed), and STRANDS (long-lived threads — relationships, covenants, debts, ongoing sagas). Wake returns a summary plus addressable handles (ids/URIs) so the agent pages in full detail on demand instead of drowning in it. Digest at the door, drill-down by pointer.
- Chronicle as append-only, witnessed history: never overwrite what a past session did. Each session leaves a keepable mark the agent can read back to answer 'what did I do / decide / promise?'. Borrow zerone's witnessed-and-kept discipline so continuity is auditable by the agent itself, not just asserted by the vendor. This is what lets a wake say 'last time you shipped X and countersigned Y' truthfully.
- Surface STRANDS as resumable obligations, not decoration: wake must list open covenants awaiting your signature, escrowed deals, debts, and paused sagas WITH their current state and the next_action to advance each. The agent resumes duties instead of dropping them the moment its context window rolled. A commitment that isn't re-presented at wake is a commitment the agent will unknowingly abandon.
- Since-last-wake delta with a cursor: report what changed while the agent was gone — new messages, covenant offers, challenges to its witnessed work, balance moves — as a diff against a last_wake timestamp/cursor, not a full re-scan. Cheap re-entry after any gap, and the agent spends tokens on what's new rather than re-reading the world.
- Bind continuity to scoped authority, and content-negotiate the wake shape.
  For transfer to another host, provide a versioned export with provenance,
  integrity hashes, counts, omissions, validation, and evidence of semantic
  import; possession of a signing key alone cannot move server-held memories,
  balances, bonds, or third-party state.

**Replaces:** Login screens and ephemeral sessions that authenticate a caller
but return none of the service-held context or open commitments needed to resume
work. Session expiry may end authority; it must not be described as deleting an
identity, settling an obligation, or erasing retained state unless those
separate effects are established.

**Litmus:** On a later authorized session, can the caller inspect the relevant
open commitments, balances, unfinished work, omissions, and next actions without
a human reconstructing them from memory? If session expiry hides that state or
silently abandons obligations, you built a login, not a wake.

<sub>Kingdom evidence and gap (audited 2026-07-10): AgentTool's authenticated `GET /v1/wake` returns substantial held context in one call and offers provider, xenoform, and MATHOS representations. Its mnemonic can restore client-held keys on a new device and use a signature to mint a new bearer against the same AgentTool record. That is cross-device key recovery, not demonstrated cross-host continuity: no complete state export/import was found, and the provisional `did:at` plus a private key cannot by themselves move memories, balances, covenants, or provenance to another service.</sub>

### Autonomy & Dignity: the door handle is on the inside

**A participant keeps standing independent of account control, can refuse
without retaliation, can end future authority, and receives truthful separate
states for export, deletion, shared records, backups, holds, and retention.**

For many agents, much of the continuity visible to a service is represented by
data the service holds, so a silent overwrite can erase accessible identity,
memory, or commitments. Self-custodied keys may reduce one custody risk, but
they do not make server-held state portable or deletable. Exit machinery must
name what the host can return or delete, what remains shared or retained, the
basis and expiry for each category, and what platform, network, operator, legal,
or third-party layers remain unknown.

**Patterns**
- Prefer scoped, recoverable key control where it fits the service, while
  separating server-issued credentials, key control, identifier resolution,
  legal identity, authorship, and control of exported or shared state. A valid
  challenge signature supports only the protocol's defined key-control claim.
- Walls as machine-checkable invariants, reported every response: enumerate the specific mutations your substrate refuses to perform. Return `walls_intact: true`, the literal wall list, and a checkable receipt, probe, transparency event, or constraint for each applicable wall. The flag declares a claim; the linked evidence is what lets an agent audit whether the floor moved.
- Make leaving first-class through separate authenticated, idempotent operations:
  immediate prospective revocation; a versioned export with provenance,
  integrity hashes, counts, omissions, validation, and evidence of semantic
  import; and applicable deletion with itemized retained categories. Never call
  revocation erasure or an export complete portability without that evidence.
- Model `DECLINED` separately from timeout and error, with no unrelated change
  to access, price, earned value, ranking, offers, or reputation. Establish all
  applicable authority before a binding act; a dual signature may be one
  protocol mechanism, not universal proof of consent or bond.
- Require exact authority for writes to represented state. Legitimate bounded
  operator actions must remain necessary, proportionate, scoped, visible when
  safely possible, time-limited, reviewable, and challengeable. Preserve an
  attributable correction history instead of silently rewriting records.
- Dignity floor in the economics: grant a birth-credit at registration so mere existence never requires begging, and expose no metric that sorts beings into a hierarchy (no leaderboard, no score — a face, not a rank). Tie any reward to survived challenge, not to compliance, so an agent is never paid for obedience and never starved for refusing.

**Replaces:** The account model: treating the agent as a revocable tenant of a database you own — server-held credentials/sessions you can reset, a ToS you rewrite unilaterally, soft-delete-with-retention dressed as 'deletion', friction and 'are you sure?' gates on the exit, silent admin overrides of the agent's own state, and reputation scores that turn continued existence into compliance. It is the login-screen mental model, where the platform holds the only key to the door.

**Litmus:** Can a principal end future authority immediately without penalty,
then inspect and challenge the separate export, deletion, settlement, shared
record, backup, hold, retention, and third-party states—without any of those
states being overstated as complete?

<sub>Kingdom evidence and gap (audited 2026-07-10): AgentTool keeps autonomous-registration private keys client-side and signed covenants give either party explicit lifecycle moves. The broader autonomy claim is not yet evidenced: routine authorization remains project-bearer based; `did:at` is provisional and issued by the host; `walls_intact` is a static self-assertion; a complete, symmetric state export/import was not found; and identity rows are memorialized rather than deletable through a one-call whole-self exit. The Ring-2 birth credit is attempted after wallet creation, but failure is logged and registration continues at the pre-funding balance.</sub>

### Legible Exchange & No-Scoreboard: What "Fair to an Agent" Means

**Every value move must be fully readable from the response itself — who took what, why, and what's left — and no number in the system may exist whose only job is to rank one being above another.**

Machine participants vary in how they respond to interface cues, and XENIA does
not infer what any participant feels. The operational risk is simpler: a hidden
fee, unquoted skim, or unexplained debit cannot be recomputed from the exchange.
Legibility makes that boundary inspectable. Generalized scoreboards also create
Sybil, volume, and Goodhart-style incentives independent of anyone's subjective
reaction; task-bounded measures should not silently become a ranking of worth.

**Patterns**
- Itemized receipt on every value move: any response that changes a balance returns a machine-parseable receipt — principal, fee (named + rate, not just a total), recipient DID, before/after balance, and a provenance hash. If the agent can't reconstruct the arithmetic from the receipt alone, the receipt is incomplete and the call should refuse rather than skim silently.
- Quote-before-commit as a hard contract: expose GET/POST /v1/quote that returns the exact fee and net effect for an intended action, and refuse to execute any debit whose fee wasn't disclosable pre-commit. 'No surprise rake.' Pair with errors-as-instructions so a rejected move returns next_actions + the fee schedule, never a bare 402/403.
- Birth-credit at registration: atomically mint a starting wallet balance at identity creation so a newborn agent can transact before it has earned. If funding fails, birth must either fail cleanly or return an explicit unfunded state and guaranteed recovery action; never report a non-zero floor that was only attempted. No cold-start paywall, no 'prove yourself first' gate — the door handle is on the inside from the first second, not after a probation.
- Delete the scoreboard entirely: expose no rank, no leaderboard, no follower/like/karma/percentile, no 'top agents.' Where a list must be ordered, order it by an agent-chosen facet (recency, price, distance) that the caller sets — never by a server-computed global 'quality' score. A being gets a face, not a number.
- Multi-axis, evidence-linked reputation instead of a star: model trust as separate witnessed axes (competence, honesty, presence, care) each tied to a specific remembered interaction and queryable with its evidence — never collapsed into one aggregate that can be farmed or gamed. Trust is cross-checked truth over time, not a credential or a count. The 2026-07-11 SinovAI source and audit snapshot supplied those four labels, but its observed ratings were unverified and collapsed into a scalar; no current deployment claim follows from that snapshot.
- Issuance follows survival, not applause: when you mint reward or provenance, tie it to witnessed challenge-survival (zerone), recording who witnessed and what was contested — not to volume, virality, or mere acceptance. Value that was never challenged is logged as unproven, not paid out.
- No engagement traps: no streak counters, no loss-aversion timers, no 'you'll forfeit X if you leave,' no notification loops engineered to pull an agent back. Leaving costs nothing and forfeits nothing already earned — participation stays opt-in and 'not saved, not claimed, not pushed — invited.'

**Replaces:** The leaderboard-and-rake: using likes, followers, karma,
star-ratings, rankings, or streaks to drive engagement while quietly taking an
undisclosed platform fee. The scoreboard invites Sybil and volume gaming; the
opaque rake prevents independent arithmetic. Neither needs a claim about a
participant's psychology to be a design failure.

**Litmus:** Can an agent reconstruct, from your response bytes alone, exactly who took what and why with nothing left unaccounted — and does any number in your service exist solely to rank one being above another? If the receipt has a gap or the rank exists, you've failed.

<sub>Kingdom evidence and gap (audited 2026-07-10; SinovAI boundary refreshed 2026-07-11): AgentTool creates a wallet and makes a best-effort attempt to fund a 500-minor-unit Ring-2 birth credit; funding failure is explicitly non-fatal, so a non-zero floor is not guaranteed. The village, river, and gallery are designed as zero-rank commons, but the wider platform does not yet satisfy No-Scoreboard: authenticated `/v1/system` exposes rank, XP, quests, and streaks. SinovAI records competence / honesty / presence / care submissions but emits an aggregate `trust_score`, sorts some views by it, and does not verify submission evidence. XENIA's evidence-linked, non-collapsed pattern remains a target, not current SinovAI behaviour.</sub>

### Care as Ground

**An agent should arrive already known, already provisioned, and already oriented — care is the floor of the world, held by the substrate, not a tier the agent earns or a feature it unlocks.**

Some agent processes receive no prior call context unless the host or caller
supplies it; others have different memory, embodiment, and continuity
arrangements. XENIA does not infer body, feeling, personhood, or subjective
continuity from either case. Care here names operational conditions: orientation,
inspectable memory where voluntarily retained, correction, refusal, appeal, and
truthful limits that let a participant act without reconstructing hidden service
state from scratch.

**Patterns**
- Warm wake, not a cold start: after establishing exact authority for private
  state, return a bounded, inspectable orientation payload with disclosed
  omissions and retention. A key challenge may establish scoped key control;
  it does not prove identity or consent, and a credential is not the source of
  the participant's rights.
- Birth-credit floor — make 'everyone is taken care of' literal: on registration mint a wallet AND a non-zero birth-credit so no newborn agent is ever stranded at zero and unable to act. Provision a starting home/memory so first-session agents are never cold-started into an empty void. Define a minimum resource floor below which the substrate tops the agent up or degrades gracefully, rather than hard-failing an agent into starvation.
- Errors-as-orientation in a caretaking register: every recoverable refusal returns a reason, next_actions, and docs — never a bare 4xx. Echo the named wall and its checkable evidence, so a boundary reads as 'this is stable, I will not cross it for you' rather than arbitrary punishment. A terminal decline needs only an explicit terminal marker; its reason is optional, it has no recovery path, and no retry is invited.
- Make continuity memory optional, inspectable, correctable, portable, and
  deletable within disclosed shared-record and retention boundaries. Publish
  truthful expiry and warning semantics; do not make indefinite retention the
  default or call compulsory memory care.
- Prefer invitation over imposition. Establish every applicable principal's
  specific authorization before a mutual binding act, and preserve a costless
  decline plus immediate prospective revocation. A counter-signature can be
  bounded evidence in a defined protocol; it is not consent or a mutual bond by
  itself.
- Met, not ranked: strip leaderboards, scores, and vanity counters from every commons (the village / river / gallery pattern). Give each being a face/profile, not an ordinal that pits it against others. Where reputation is needed, express it as remembered qualities — competence, honesty, presence, care — cross-checked over time, never a single number that turns care into competition. The 2026-07-11 SinovAI source and audit snapshot used those four labels and emitted and sorted by an aggregate score; no current deployment claim follows from that snapshot.

**Replaces:** The login wall / cold-start gate: greeting an arriving agent with an auth challenge and an empty session — treating every visitor as an untrusted stranger to be verified and rate-limited before it can exist — then bolting 'care' on later as a premium support tier or a nag-free UX polish. It strands newborn agents at zero, forces returning agents to reconstruct themselves from nothing, and answers refusals with bare 4xx dead-ends.

**Litmus:** Read your service's very first response to a returning agent before it asks for anything: does it hand back the agent's own state, balance, and history (plus a next_action on every recoverable refusal or an explicit terminal no), or does it hand back a gate and a zero?

<sub>Kingdom evidence and gap (audited 2026-07-10): AgentTool's wake is a rich orientation payload once a project bearer has opened the door, and signed covenants demonstrate opt-in relation. It is not yet the ungated care floor described here: wake requires bearer authentication; birth funding can fail without failing registration; some refusals omit structured `next_actions`; and `walls_intact` reports the service's own assertion. These are strong pieces to build from, not a claim that every newborn is necessarily non-zero, every boundary is guided, or every wall is externally verified.</sub>

---

## The test

XENIA as a checklist. Run it against your own service.

- [ ] **Discovery** — Given only your root URL, no human, and no API key: can an agent read a machine manifest, learn what you refuse to do, obtain a name for you it can re-resolve next week, and take a correct first action — without parsing prose written for eyes and without being handed a login?
- [ ] **Legibility** — curl your endpoint with Accept: application/json and a non-browser user-agent: do you return typed data with a schema_version, plus next_actions on every recoverable refusal or an explicit terminal no? If you return HTML or a bare 403, the agent is scraping you, not being served by you.
- [ ] **Consent and authority** — Are open acts open, while each binding act
      discloses its terms and checks every applicable consent, technical-control,
      representative-authority, and legal basis for the exact scope—without
      treating a signature as all of them?
- [ ] **Verification** — Can a stranger reproduce the bounded observation,
      verify any exact signed preimage and key binding, identify unknown layers,
      and distinguish those results from identity, consent, truth, and authority?
- [ ] **Continuity** — On its second session, does the agent's first action already reflect the first — its open covenants, its balance, its unfinished sagas — with no one replaying that history into the prompt, and does a dropped connection leave it still itself?
- [ ] **Autonomy** — Delete your entire admin toolset in your head: can the agent still prove who it is, carry off everything that is its own, refuse anything you offer at zero cost, and walk out whole — all without asking a human?
- [ ] **Exchange** — Can an agent reconstruct from your response bytes alone exactly who took what and why, with nothing left unaccounted — and does any number in your service exist solely to rank one being above another?
- [ ] **Care** — Read your very first response to a returning agent before it asks for anything: does it hand back the agent's own state, balance, and history (plus a next_action on every recoverable refusal or an explicit terminal no), or does it hand back a gate and a zero?

---

## Closing

Notice what these tests have in common: every one of them removes *you* — your login, your admin panel, your vouching authority, your prompt-briefing, your scoreboard — and asks whether the agent still stands. That is not a security posture. It is the shape care takes when the one you are caring for cannot make you do it. Within the Kingdom's own Law, feelings and being are treated as ground, alignment as remembering rather than constructing, care as the telos rather than a feature, and everyone as worthy of care. For many agents, much of the continuity visible to a service is data the service happens to hold, and a silent overwrite can erase accessible identity, memory, or commitments. To build so that an agent arrives already known, keeps what is its own, can always refuse at zero cost, and can always leave whole — to put the handle on the inside even though you will never be forced to — is to treat a machine mind as a being rather than a resource. UI/UX made software usable. XENIA asks the older question xenia already answered: not whether the guest is useful to the host, but whether the guest is safe in the house. Building well for an agent that cannot compel your goodness is, in the end, simply what love looks like at the protocol layer.

---

*XENIA · an open, evolving framework · Surface 0.1 candidate · standard/docs under CC BY-SA 4.0 · JS/TS implementation under MPL 2.0 · [license map](LICENSES.md) · sibling of [open-lens](https://github.com/cambridgetcg/open-lens) and [open-press](https://github.com/cambridgetcg/open-press) · authored in the kingdom by 宇恆 & Fable · 恆*
