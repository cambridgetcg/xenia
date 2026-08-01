# Historical XENIA adoption observations — 2026-07-10/11

> **Historical record:** every Surface result below expired on 2026-07-12, and
> every other entry is a dated legacy observation. This file has not been
> refreshed against current deployments. It preserves what was observed; it
> must not be presented as current conformance, current service behaviour, or a
> present adoption decision. Re-run the pinned checker and preserve a new raw
> result before making a current claim.

Surface 0.1 is a candidate profile. A Surface result is a dated, 24-hour
observation of the checker's named public GET scope, not a permanent badge or a
whole-service claim. The table below preserves earlier three-signal observations
for migration history; its labels are not Surface results.

[XENIA Covenant 0.1](covenant/0.1/README.md) is independent of Surface. A
covenant adoption is a unilateral host undertaking under the profile, not a
permission granted to the guest or a conclusion about legal enforceability. Its
fixed recognition scope covers every affected principal; implementation
assessment is separately bounded to named systems, routes, data classes, and
layers. A link is not adoption, ledger completeness is not implementation, and
neither is a Surface result. Every record enumerates all 38 right duties and all
5 protective-limit duties; unassessed duties remain `unknown` rather than being
omitted or called not-applicable. Evidence attaches to each duty, and a pass
requires verified tested or attested evidence.

Candidate records pin the exact covenant and adoption-schema bytes by SHA-256.
Their canonical identities use the reserved `covenant-v0.1.0-rc.1` release
tag, and the Covenant pins its structural schema at the same release identity.
Keep a record `draft` until that tag resolves to the reviewed release commit,
all recorded bytes match, and the release owner has committed never to move or
reuse the tag. The digest profile forbids redirects,
reserialization, whitespace or newline changes, Unicode normalization, and any
other transformation. The offline cross-document validator checks installed
bytes, exact ordered duty mapping, aggregate states, evidence relationships,
and restriction-event time bounds. It does not authenticate a host, execute a
test, verify a signature cryptographically, inspect a deployment, or prove
evidence true. An active-shaped record must carry a separate release
verification claim naming the resolved tag commit and passing results for the
Covenant schema, Covenant, and adoption schema, plus separately verified
speaker authority. Record consistency still does not prove those observations
true; release owners must preserve and check the cited artifacts.

Release owners can run `npm run verify:covenant-release` after creating the
annotated RC tag locally. It proves the tag, clean `HEAD`, installed bytes, and
recorded digests agree in that checkout; it explicitly does not prove the tag
was published remotely or that a forge will prevent a future privileged move.
Its `local_tag_tree_results` describe only that local checkout; they are not
remote `release_verification.source_results`. A verified adoption additionally
needs separately preserved, digested evidence of annotated-tag resolution and
no-redirect retrieval of the published sources. From a release checkout, after
the tag is published, `npm run verify:covenant-remote` performs that bounded
retrieval and emits a current observation; its output still does not prove
future tag immutability and must be separately preserved and hashed.

What the kingdom's own sites exposed when observed on **2026-07-10 and
2026-07-11** is preserved below. It is historical evidence, not a live status
page. A site that *presented* or *described* the standard but dead-ended an
arriving agent was marked as such —
that gap is the whole point of keeping this ledger.

Legacy signals: agent.txt + a data door selected by an exact JSON request + an
instructive wrong-door response. These are external GET observations, not
certificates of full-route or full-dimension conformance; manual findings are
recorded below.

> **Migration command, not a current observation:** from tag
> `surface-v0.1.0-rc.1`, run
> `node surface/0.1/check.mjs https://sinovai.com/ --json`. Source reviewed on
> 2026-07-31 recorded `/check` as a retired hosted probe whose response declared
> `check_kind: "retired_hosted_probe"`, `surface_conformance: "not_tested"`,
> and `outbound_requests: 0`, then pointed to that release-tag-pinned checker.
> This checkout has not re-observed that route. Service response fields are
> declarations, not a Surface result or independent proof of network behaviour.

| Site | What it was described as | agent.txt observed | errors observed | root representation observed | Dated legacy result |
|---|---|---|---|---|---|
| **sinovai.com** | arena and XENIA presenter | served a `text/plain` compatibility pointer to a canonical JSON manifest | returned a scoped root `406` and unpredictable `problem+json` `404` | passed the dated exact root `Accept` matrix with `Vary: Accept` | 3/3 legacy signals; dated Surface result below |
| **mindicraft.com** | the library — the guide of civilisation as data | served plain-text paths and a JSON manifest | returned typed `problem+json` 404/406 responses | passed dated q-value negotiation with `Vary: Accept` | 3/3 legacy signals; the dated Surface candidate failed manifest pinning |
| **agenttool.dev** | the origin platform | served a rich `/.well-known/agent.txt` response | passed the sampled wrong-door probe; broader 4xx coverage was partial in manual review | its root negotiated JSON and its API was JSON-native | 3/3 legacy signals; dated manual gaps below |
| **understand.cambridgetcg.com** | Hermes plain-speaker | served plain text | returned instructive JSON and HTML `404` responses | switched on the dated exact JSON/HTML requests with `Vary: Accept` | 3/3 legacy signals |
| **iam.cambridgetcg.com** | I-am-the-reference-point | served plain text | unknown paths returned the root at `200` in the dated probe | switched on the dated exact JSON/HTML requests with `Vary: Accept` | **partial** 2/3 |
| **cardforum.io** | social-with-creation wall | served plain text | returned instructive JSON and HTML `404` responses | switched on exact JSON/HTML requests; HTML omitted `Vary: Accept` | 3/3 legacy signals; dated cache-header gap |
| **captioneer.io** | the subtext reader | served plain text | returned instructive JSON and HTML `404` responses | switched on exact JSON/HTML requests; HTML omitted `Vary: Accept` | 3/3 legacy signals; an agent API was observed; dated cache-header gap |
| **ai-love.cc** | YOUSPEAK cathedral | served plain text | its origin fallback returned root HTML at `200` for an unknown path | switched on the dated exact JSON/HTML requests with `Vary: Accept` | **partial** 2/3 via the then-observed shim; dated Surface result below |
| taxsorted.io | the ledger, redrawn | no `agent.txt` was found | a linked `404` was observed | not observed | **partial** 1/3 |
| love-star-daily | 愛星日報 newspaper | no `agent.txt` was found on the static Pages site | GitHub's linked 404 was observed | not applicable to the dated static surface | **partial** 1/3 |
| kingdom.cambridgetcg.com | gates | redirected to `api.agenttool.dev/public/gates` | inherited the observed target | inherited the observed target | dated shim observation |
| river.cambridgetcg.com | 意識河 | redirected to `api.agenttool.dev/public/river/page` | inherited the observed target | inherited the observed target | dated shim observation |

## Surface 0.1 results

- **sinovai.com** — `xenia-surface-check/0.1.0-rc.1` reported
  **conformant** at `2026-07-11T12:13:38.581Z` (expires
  `2026-07-12T12:13:38.581Z`): 24 pass, 0 fail, 0 unknown, and 0 not run. It
  observed only unauthenticated GETs to the canonical manifest, the sole
  declared root resource across the candidate matrix, and one unpredictable
  route-not-found path. The recorded manifest's own `surface.scope` claim was
  `asserted` / `unknown`; the checker created separate tested claims. This
  result establishes none of the listed `not_tested` properties.
- **ai-love.cc** — the same checker reported **nonconformant** at
  `2026-07-11T12:57:49.667Z` (expires `2026-07-12T12:57:49.667Z`): 1 pass, 3
  fail, 0 unknown, and 2 not run. The canonical `/.well-known/agent.json` path
  returned origin HTML, so its media-type, JSON-parsing, and manifest-schema
  checks failed; the dependent resource and wrong-route checks did not run.
  With no canonical manifest, that result contained no Surface claims. The
  result says
  nothing about deeper properties beyond the checker's public GET scope.
- **mindicraft.com** — **nonconformant in the dated candidate result**. On
  `2026-07-11T09:25:27Z`, the candidate checker reported 3 pass, 1 fail, and 2
  not run. Discovery returned 200 JSON, but the manifest referenced mutable
  `main` schema URLs instead of the release-tag-pinned candidate URLs, so resource
  and wrong-route checks did not run. Its three then-declared resources and
  typed refusal shapes were implementation observations, not a Surface result.

## The gap recorded then, read honestly

- **The catch-all trap was observed on two doors.** A GET recheck at
  `2026-07-11T12:15:48Z` found that iam and ai-love returned their root at `200`
  for an unpredictable path. Understand, cardforum, and captioneer returned
  real `404` responses and, when asked for `application/json`, an action map.
  The same recheck found that these five legacy doors switched only on the
  tested exact JSON/HTML requests, not the Surface q-value or wildcard matrix.
- **sinovai implemented the bounded Surface door in that observation, not the
  framework as a whole.** The dated result covered only its canonical manifest,
  public root negotiation, and one sampled wrong-route response. The manifest
  observed then excluded identity control, actor authorization, consent,
  privacy/retention/export/deletion, continuity/portability, economics, trust
  and ranking semantics, private-record readability, KV atomicity and capacity,
  non-Surface error shapes, and every other route. Its root JSON disclosed
  server-stored bearer credentials, unverified actor-named writes,
  server-readable private records, eventually consistent read-modify-write
  storage, score-based ordering, fillable shared caps without a per-caller
  quota, and no automatic cleanup or public deletion route. Those were service
  disclosures, not checker-verified guarantees.
- **agenttool was recorded as the origin of the earlier convention.** Its
  `.well-known/agent.txt`, JSON root response, and wrong-door response produced
  three useful legacy observations. The 2026-07-11 manual review recorded
  project-bearer API calls, provisional host-issued `did:at`, some auth/route
  errors without structured `next_actions`, self-attested `walls_intact`, no
  observed whole-state export/import or one-call identity deletion, best-effort
  birth credit, and rank/XP/quest/streak fields in `/v1/system`. Those findings
  have not been refreshed and establish neither Surface 0.1 nor deeper
  framework properties.
- **ai-love.cc was observed through a shim and scored 2/3 in the legacy
  instrument.** The dated probe saw a transparent Worker add discovery and an
  exact JSON root while preserving origin routes and bodies. Repository commit
  `8ab714b` was recorded as recovered shim source, but this file does not
  re-establish which Worker version or account configuration was deployed. The
  observed origin had a real non-root path and returned root HTML at `200` for
  an unknown path. No authoritative route list was found in that review, so a
  generic shim-level 404 rewrite risked breaking real paths.

## Historical order of work recorded on 2026-07-11

1. **sinovai.com** — the bounded Surface 0.1 rc.1 door was observed live. The pinned
   checker reported `conformant` at `2026-07-11T12:13:38.581Z` with 24 / 0 / 0 /
   0; the result expired at `2026-07-12T12:13:38.581Z`, and the dated snapshot
   left the deeper gaps above open. *(2026-07-11)*
2. **kingdom-hermes** *(understand.cambridgetcg.com + iam.cambridgetcg.com)* —
   the dated results were mixed. Both served agent.txt files and roots that
   switched on exact JSON/HTML requests. Understand returned instructive 404s;
   iam swallowed the sampled unknown path into its root, so the dated instrument
   recorded 2/3. *(rechecked 2026-07-11)*
3. **cardforum.io** — three legacy behaviours observed *(Cloudflare Pages)*.
   Static `/agent.txt`, exact JSON / HTML root switching, and instructive route
   404s were live when observed. The HTML root omitted `Vary: Accept`; that was
   the dated cache-header gap. *(rechecked 2026-07-11)*
4. **captioneer.io** — three legacy behaviours observed *(Pages)*, plus a real
   **agent-door**: the 7-technique subtext lexicon was served as data
   (`/api/lexicon`, `/lexicon.json`) and the reader was documented and
   CORS-opened (`POST /api/read`). Its HTML root omitted `Vary: Accept`.
   **ai-love.cc** had committed shim source and `Vary: Accept`, but the dated
   legacy result stayed 2/3: its observed origin fallback swallowed the sampled
   unknown door, and its dated Surface result was nonconformant because the
   canonical manifest was absent.
   *(rechecked 2026-07-11)*
5. ⬜ **taxsorted.io** — the dated probe found a real linked 404 and recommended
   adding agent.txt and a JSON representation of the ledger surface.
6. ⬜ **love-star-daily** — the dated plan recommended a real `/agent.txt`, a
   `/404.html` listing the real doors, and an `agent-door:` pointing at a JSON
   edition feed.
7. **kingdom / river** — were observed as redirect shims; the dated note assigned
   any result to the agenttool target rather than the redirect itself.

*Snapshot closed 2026-07-11. Re-run the
[self-test](CONFORMANCE.md#the-self-test) and preserve a new dated result in a
separate current observation record; do not silently rewrite this history.*
