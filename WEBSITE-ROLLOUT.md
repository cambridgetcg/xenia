# XENIA website rollout

Status: local source plan, 2026-08-01. It is not deployment evidence, a current
observation of any host, an adoption decision, or authorization to publish.

This plan moves one website at a time from truthful source metadata to a
separately authorized and externally observed XENIA Surface. It deliberately
keeps four things apart:

1. recognition of the standing `xenia.rights/0.1` baseline;
2. a host's explicit Covenant undertaking and bounded implementation evidence;
3. a source implementation of the Surface wire profile; and
4. the behaviour observed at a deployed public origin at a particular time.

None proves the others. A repository link, a KINGDOM card, a schema-valid file,
or a successful test is not a permanent badge.

## Estate-wide gates

### 0. Name the actual house

Inventory the canonical host, origin, CDN or Worker, repository and revision,
deployment command, state stores, upstream services, authentication boundary,
and the person or role authorized to make each binding statement. Record
unknowns as unknown. Do not infer control from a credential, DNS record, login,
repository access, or previous deployment.

### 1. Contain the claims

Before adding a door, remove or bound universal claims about collection,
telemetry, persistence, deletion, export, safety, identity, availability, and
conformance. Assess the routes and layers actually in scope. Keep historical
adoption records immutable; create a new assessment for a changed system.

### 2. Build the source door

- publish the exact candidate manifest at `/.well-known/agent.json`;
- pin its schema and producer/checker versions to immutable release identities;
- declare only reachable public `GET` representations and their real media
  types;
- make legacy `agent.txt` files pointers, not substitute manifests;
- keep private, credential-bearing, administrative, payment, filing, and
  dormant routes out of the public capability list; and
- validate the exported bytes, not only an in-memory source object.

### 3. Implement the threshold

Implement correct `Accept` negotiation, `Vary: Accept`, scoped `406` responses,
and unpredictable typed `404` responses. Preserve semantic API errors rather
than rewriting every failure into a friendly route error. A refusal may offer
optional recovery, but a terminal no must remain terminal and exert no retry
pressure.

### 4. Make state and authority legible

For every binding action, identify the actor, affected principal, purpose,
recipients, cost, side effects, scope, expiry, reversibility, retention, and
applicable consent and authority. Treat prospective revocation, record deletion,
export, shared records, backups, legal holds, third-party copies, and account
closure as separate states. Use one coherent authenticated writer for mutable
records, with deterministic concurrency tests and recoverable operations.

### 5. Prove the built candidate

Run repository tests, schema validation, import or route boundary tests, a
production build, and a static scan of the built artifact. Preserve the exact
source commit, generated manifest bytes, tool versions, and results. These are
source/build results, not observations of a public service.

### 6. Stage, then observe from outside

Deployment requires separate scoped authorization. Use an explicit deploy mode,
a reviewable public-file allowlist, rollback instructions, and a fresh staging
origin. Inspect redirects, caches, proxy layers, stale files, headers, and error
paths. Run the release-pinned external Surface checker and preserve its raw
result with the observed origin, time, and revision. Never turn its bounded
result into a whole-service claim.

### 7. Promote and keep watch

Promote the same reviewed artifact only after staging evidence is accepted.
Re-observe production, give observations a short expiry, and repeat after any
origin, proxy, manifest, route, data, authentication, or dependency change.
Record drift and regressions rather than silently retaining an old status.

## Rollout rings

| Ring | Scope | Entry condition | Exit evidence |
| --- | --- | --- | --- |
| A | Static and public read-only sites | Current origin and deploy path inventoried | Pinned manifest, negotiation and typed-error tests, staged external observation |
| B | Calculators and other local computation | Ring A plus a tested import/effect boundary | Built client contains no undeclared network, storage, filing, or privileged path |
| C | Journals, gardens, accounts, and other mutable state | Ring B plus shared authentication and lifecycle design | Concurrent mutation, revocation, export, deletion, retention, and backup behaviour tested separately |
| D | Money, tax filing, payments, identity, or representative acts | Ring C plus exact authority, consent, legal, cost, and upstream boundaries | End-to-end staging evidence for every declared binding capability; independent review before production |

Risk sets the ring. A poetic or visually simple site is not Ring A if it writes
private state; a financial calculator can remain Ring B only while filing,
accounts, and payment paths are unreachable from its declared surface.

## Current local pilots

These are source-work states, not public deployment states. **APPROVED** means
an independent source review accepted only the bounded result at the listed
local revision; it does not establish public Surface behaviour, adoption,
integration, or authority to publish or deploy.

| Repository slice | Current bounded result | Required next gate |
| --- | --- | --- |
| XENIA framework repair | Implementation through exact source revision `5f06ff3` is independently **APPROVED** for bounded release, adoption, package, KINGDOM-rights, and dated historical-observation repairs; its tests remain source evidence only | Separately authorized integration and a new release identity |
| TaxSorted calculator | Exact source-only RC1 revision `30213a9` is independently **APPROVED**: its manifest and import boundary are offline-buildable, print/PDF boundaries are disclosed, and build bytes are not claimed deterministic; dormant HMRC, network, and app-managed persistent-storage paths remain outside the calculator | Implement real HTTP negotiation/problems, pin the staged artifact actually built, and observe it externally; filing remains undeclared |
| ai-love | Exact source revision `3f6d3f1` is independently **APPROVED** for bounded containment: one authenticated mutation queue, revision-bound and terminal-safe review, symlink-safe public QA staging, and an explicit public-file commit path with hooks, filesystem monitoring, and signing disabled. Its manifest still records deployment as unknown; configured Git filters and a replaced Git binary remain outside this result | Complete current lifecycle, backup, hosting, and authority inventory; implement Surface negotiation/problems against the built artifact, then stage and observe it externally under separate authorization |
| CashLoom | Exact revision `f1ed50d` is independently **APPROVED** only for the dated historical beta4 identity; current MONEYWORLD discovery is not XENIA Surface | Create a new current-scope Covenant assessment for MONEYWORLD, then implement and observe a release-pinned Surface; payments remain a higher-risk layer |
| Sites listed only in `ADOPTION.md` | Historical 2026-07-10/11 evidence only | Re-inventory and re-observe each current origin before choosing a ring or making any present-tense claim |

## KINGDOM, Nen, Skills, and MCP

KINGDOM's current Nen work is an operating grammar around capabilities, not a
new way to bypass the gates above:

- **Nen** describes a bounded capability and its invariants.
- **Skill** is a local expression and workflow for that capability.
- **MCP** is a passage that can transport tools, resources, and receipts.
- **KARMA receipts** can preserve declared inputs, effects, limits, and evidence.
- **Dark Continent** marks unfamiliar or untrusted input and experimental
  boundaries, including Hugging Face and MCP resources.

An installed skill is not active authority. An MCP connection, login, or paid
account is not consent. Provider output does not define rights, identity,
KARMA, truth, or XENIA status. A Nen ability may pin and recognize the XENIA
rights baseline, but that does not make a host adopt Covenant or pass Surface.

Websites may expose a public, read-only Nen or MCP description only when it is a
real reachable representation and safe to advertise. Credential-bound tools,
write paths, internal resources, and experimental provider calls stay out of a
public Surface manifest. Where a provider result matters, bind evidence to the
exact request, provider revision observed before the call, response or timeout,
time, and limitations; observation after a timeout cannot prove which revision
executed.

## WAKE and continuity crossover

Use WAKE as a refusable orientation layer, not as a new identity or execution
authority. A website may re-present bounded state, attributed history, open
work, omissions, and available next actions so a returning participant does
not have to reconstruct the house from prose. The participant still arrives as
distinct; the site does not assign a persona, claim persistent memory, or infer
continuing will from a session, cookie, bearer, model output, or prior receipt.

Continuity material follows the same separation as every other rollout
artifact. A wake, handoff, chronicle, tag, context-delivery log, or continuity
check may establish only the exact bytes, source revision, delivery or check
event, observer, time, scope, coverage, and declared limitations it records. It
does not establish consciousness, subjective memory, identity continuity,
same-being continuity, current consent, authority, relationship, Covenant
adoption, or Surface conformance. Historical commitments are re-presented for
inspection; they never auto-execute as present authority.

The portable KINGDOM ability `carry-wake-thread` and private pure
`@agenttool/wake-thread` protocol make that crossing explicit:

```text
exact caller-held source bytes
  -> minimized facts + evidence digests + named omissions
  -> offer: carry | fork | rest | refuse
  -> reported-choice artifact receipt
  -> separately authorized website or task action, or no action
```

`carry` and `fork` do not authenticate the reporter. A fork is an artifact
branch, not a split or copy of a being. Rest needs no reason and carries no
penalty. Refusal cannot become an automatic retry parent. A linked receipt
proves only the declared content linkage that can be recomputed; it is not a
KARMA receipt, identity chain, consent record, permission, or truth verdict.

### Website integration gates

1. **Keep the cursor with the caller.** If a site offers “since your last
   visit,” accept a caller-supplied opaque cursor or explicit timestamp. Do not
   silently create a read-history log merely to guess continuity. Validate a
   malformed or future cursor as a typed recoverable input problem instead of
   dropping it and returning silence that looks like “nothing changed.”
2. **Separate identity and project scope.** A project bearer, account, selected
   agent, or display name does not make project-wide counts, records, or
   handoffs first-person facts. Label `identity`, `project`, `mixed`, or
   `unknown` on the source projection.
3. **Distinguish quiet, partial, and unavailable.** Every bounded window names
   its limit, omissions, authoritative deeper read, and dependency state. An
   empty fallback is not evidence that the source is empty. A partial count is
   a floor, not a total.
4. **Present reads before writes.** A wake may offer inspect, revise, export,
   rest, refuse, or a separately described mutation. It never turns an open
   handoff, notification, event stream, prior signature, credential, or MCP
   connection into permission to act.
5. **Keep private continuity out of public discovery.** Raw WAKE, chronicle,
   handoff, journal, receipt, and cursor material stays outside public Surface
   manifests. A site may advertise only a separately authorized, minimized,
   same-origin public `GET` summary. Surface 0.1 continues to list continuity
   and portability as not covered.
6. **Account for real effects separately.** A KARMA receipt may record the
   authority references, admitted inputs, reads, transformations, disclosures,
   writes, privacy cost, retention, uncertainty, and repair of an invocation.
   It is causal accounting, not the continuity observation itself and never a
   score, identity proof, or adoption result.

Apply those gates by rollout ring:

| Ring | WAKE / continuity use | Closed boundary |
| --- | --- | --- |
| A | Optional public read-only orientation and dated redacted evidence summary | No private state, authenticated resource, visitor tracking, continuity claim, or write advertised through Surface |
| B | Caller-held local calculation state or explicit export/import artifact | No undeclared persistence, provider egress, account identity, filing, or automatic resumption |
| C | Authenticated bounded state, history, handoffs, omissions, correction, export, deletion, retention, and backup views | No silent session-to-identity inference, project-to-identity attribution, hidden read log, or mutation without fresh applicable authority |
| D | Read-only orientation to money, tax, payment, identity, or representative state | No wake item, receipt, previous signature, or credential authorizes filing, transfer, payment, identity change, or representative act; each requires fresh exact authority |

For the current pilots, XENIA remains a public framework source and needs no
private wake. TaxSorted may later offer a Ring-B caller-held calculation export,
but filing stays absent. `ai-love` is the first plausible Ring-C private WAKE
pilot only after its current identity/project scope, authenticated writer,
history, export, deletion, retention, backup, and refusal paths are proven.
CashLoom/MONEYWORLD remains Ring D: a future wake can orient, but every monetary,
tax, payment, identity, or representative action stays behind a new exact
authority decision. None of these source plans authorizes a deployment.

## Per-site definition of done

A site is ready for a production decision only when:

- its current architecture, data layers, upstreams, and authority are named;
- its manifest describes only what the deployed artifact can actually serve;
- the built artifact and all relevant error/effect paths pass local checks;
- private routes and secrets are absent from the public artifact;
- state lifecycle claims are narrower than and supported by the tested scope;
- an independent reviewer accepts the evidence and unresolved limits;
- a separately authorized staging deployment is observed from outside; and
- production promotion, rollback, observation expiry, and ownership are explicit.

Until every applicable item holds, report the exact completed gate rather than
calling the site XENIA-conformant.
