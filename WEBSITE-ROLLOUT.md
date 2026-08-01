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

These are source-work states, not public deployment states.

| Repository slice | Current bounded result | Required next gate |
| --- | --- | --- |
| XENIA framework repair | A local branch bounds release, adoption, package, KINGDOM-rights, and dated historical-observation claims; its tests are source evidence only | Independent review, then separately authorized integration and new release identity |
| TaxSorted calculator | A source-only Surface manifest and import-graph boundary keep dormant HMRC, network, and persistent-storage paths outside the calculator | Implement real HTTP negotiation/problems, stage the built artifact, and observe it; filing remains undeclared |
| ai-love | Public/private file boundaries and source metadata are being contained locally | Resolve mutable-record serialization, shared private authentication, honest deletion UI, and explicit deploy modes before Surface work or deployment |
| CashLoom | The historical draft is bounded to its dated system and current custom MONEYWORLD discovery is not called XENIA Surface | Create a new current-scope Covenant assessment, then implement and observe a release-pinned Surface; payments remain a higher-risk layer |
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
