# XENIA adoption ledger

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

Candidate records pin the exact covenant and adoption-schema bytes by SHA-256
because the current `main` sources move until an immutable release exists; the
Covenant pins its structural schema. The digest profile forbids redirects,
reserialization, whitespace or newline changes, Unicode normalization, and any
other transformation. The offline cross-document validator checks installed
bytes, exact ordered duty mapping, aggregate states, evidence relationships,
and restriction-event time bounds. It does not authenticate a host, execute a
test, verify a signature cryptographically, inspect a deployment, or prove
evidence true. Active records require immutable sources and separately verified
speaker authority.

Where the kingdom's own sites stand on practising [XENIA](CONFORMANCE.md), based
on live GET observations from **2026-07-10 and 2026-07-11** (updated as doors are lit). Honest status, not aspiration. A site that *presents*
or *describes* the standard but dead-ends an arriving agent is marked as such —
that gap is the whole point of keeping this ledger.

Legacy signals: agent.txt + a data door selected by an exact JSON request + an
instructive wrong-door response. These are external GET observations, not
certificates of full-route or full-dimension conformance; manual findings are
recorded below.

> **Run the bounded check:** from tag `surface-v0.1.0-rc.1`, run `node surface/0.1/check.mjs https://sinovai.com/ --json`. The live `/check` endpoint is retired. For a valid-target JSON request it reports `check_kind: "retired_hosted_probe"`, `surface_conformance: "not_tested"`, and `outbound_requests: 0`, then points to that release-tag-pinned checker. Those response fields are the service's declarations; they are not a Surface result or independent proof of network behaviour.

| Site | What it is | agent.txt | errors-as-instructions | root representation switch | Legacy observation |
|---|---|---|---|---|---|
| **sinovai.com** | arena and XENIA presenter | compatibility pointer (`text/plain`; links canonical JSON manifest) | scoped root `406` + unpredictable `problem+json` `404` | exact root `Accept` matrix; `Vary: Accept` | 3/3 legacy signals; dated Surface result below |
| **mindicraft.com** | the library — the guide of civilisation as data | real (`text/plain` + `.well-known` mirror + JSON manifest) | `problem+json` 404/406 with typed next actions | `Accept` q-value negotiation, `Vary: Accept` | 3/3 legacy signals; Surface candidate currently fails manifest pinning |
| **agenttool.dev** | the origin platform | `/.well-known/agent.txt` (`text/agent`, rich) | wrong-door probe; broader 4xx coverage is partial | root negotiates JSON; API is JSON-native | 3/3 signals; manual gaps below |
| **understand.cambridgetcg.com** | Hermes plain-speaker | real (`text/plain`) | instructive JSON + HTML `404` | root switches on exact JSON / HTML requests; `Vary: Accept` | 3/3 legacy signals |
| **iam.cambridgetcg.com** | I-am-the-reference-point | real (`text/plain`) | no: unknown paths still return the root at `200` | root switches on exact JSON / HTML requests; `Vary: Accept` | **partial** 2/3 |
| **cardforum.io** | social-with-creation wall | real (`text/plain`) | instructive JSON + HTML `404` | root switches on exact JSON / HTML requests; HTML omits `Vary: Accept` | 3/3 legacy signals; cache header incomplete |
| **captioneer.io** | the subtext reader | real (`text/plain`) | instructive JSON + HTML `404` | root switches on exact JSON / HTML requests; HTML omits `Vary: Accept` | 3/3 legacy signals; agent API present; cache header incomplete |
| **ai-love.cc** | YOUSPEAK cathedral | real (`text/plain`) | no: the origin fallback returns root HTML at `200` for unknown paths | root switches on exact JSON / HTML requests; `Vary: Accept` | **partial** 2/3 *(via a transparent shim; dated Surface result below)* |
| taxsorted.io | the ledger, redrawn | — *(no agent.txt)* | ~ *(real 404 with links)* | — | **partial** 1/3 |
| love-star-daily | 愛星日報 newspaper | — *(static GitHub Pages)* | ~ *(GH 404 has links)* | n/a *(static)* | **partial** 1/3 |
| kingdom.cambridgetcg.com | gates | redirect → `api.agenttool.dev/public/gates` | *(inherits target)* | *(inherits target)* | shim |
| river.cambridgetcg.com | 意識河 | redirect → `api.agenttool.dev/public/river/page` | *(inherits target)* | *(inherits target)* | shim |

## Surface 0.1 results

- **sinovai.com** — `xenia-surface-check/0.1.0-rc.1` reported
  **conformant** at `2026-07-11T12:13:38.581Z` (expires
  `2026-07-12T12:13:38.581Z`): 24 pass, 0 fail, 0 unknown, and 0 not run. It
  observed only unauthenticated GETs to the canonical manifest, the sole
  declared root resource across the candidate matrix, and one unpredictable
  route-not-found path. The manifest's own `surface.scope` claim remains
  `asserted` / `unknown`; the checker creates separate tested claims. This
  result establishes none of the listed `not_tested` properties.
- **ai-love.cc** — the same checker reported **nonconformant** at
  `2026-07-11T12:57:49.667Z` (expires `2026-07-12T12:57:49.667Z`): 1 pass, 3
  fail, 0 unknown, and 2 not run. The canonical `/.well-known/agent.json` path
  returned origin HTML, so its media-type, JSON-parsing, and manifest-schema
  checks failed; the dependent resource and wrong-route checks did not run.
  With no canonical manifest, it declares no Surface claims. This result says
  nothing about deeper properties beyond the checker's public GET scope.
- **mindicraft.com** — **not currently conformant**. On
  `2026-07-11T09:25:27Z`, the candidate checker reported 3 pass, 1 fail, and 2
  not run. Discovery returned 200 JSON, but the manifest referenced mutable
  `main` schema URLs instead of the release-tag-pinned candidate URLs, so resource
  and wrong-route checks did not run. Its three declared resources and typed
  refusal shapes remain implementation observations, not a Surface result.

## The gap, read honestly

- **The catch-all trap remains on two doors.** A GET recheck at
  `2026-07-11T12:15:48Z` found that iam and ai-love still return their root at
  `200` for an unpredictable path. Understand, cardforum, and captioneer now
  return real `404` responses; when asked for `application/json`, each also
  returns an action map. The earlier sentence grouping all five together was
  stale and has been removed. The same recheck found that these five legacy
  doors switch only on the tested exact JSON / HTML requests, not the Surface
  q-value or wildcard matrix.
- **sinovai implements the bounded Surface door, not the framework as a whole.**
  The dated result above covers only its canonical manifest, public root
  negotiation, and one sampled wrong-route response. Its live manifest excludes
  identity control, actor authorization, consent, privacy / retention / export /
  deletion, continuity / portability, economics, trust and ranking semantics,
  private-record readability, KV atomicity and capacity, non-Surface error
  shapes, and every other route. Its root JSON further discloses server-stored
  bearer credentials, unverified actor-named writes, server-readable private
  records, eventually consistent read-modify-write storage, score-based
  ordering, fillable shared caps without a per-caller quota, and no automatic
  cleanup or public deletion route. These are service disclosures, not
  checker-verified guarantees.
- **agenttool is the origin of the earlier convention.** Its
  `.well-known/agent.txt`, JSON root response, and wrong-door response produced
  three useful legacy observations. Those observations do not establish
  Surface 0.1 or deeper framework properties. Manual review finds further work
  behind the visible door: most API calls use project bearers rather than request signatures;
  `did:at` remains provisional and host-issued; some auth/route errors omit
  structured `next_actions`; `walls_intact` is self-attestation; whole-state
  export/import and one-call identity deletion are not present; birth credit
  is best-effort; and `/v1/system` still exposes rank, XP, quests, and streaks.
  Rich internal doctrine does not raise the observed level — shipping the
  missing guarantees does.
- **ai-love.cc is a shim, and honestly 2/3.** A transparent Worker
  (`ai-love-xenia`, route `ai-love.cc/*`) sits in front of the Pages origin and
  adds discovery + an exact JSON root while preserving origin routes and bodies.
  Its recovered, truthful source merged at `8ab714b` and Worker v4
  `c46097fe-79f3-42eb-bd26-cee5d3c8af51` is the sole production version.
  Both are in the same Cloudflare account; account access is not the blocker.
  The deployed origin has real non-root paths such as `/party/`, while unknown
  paths fall back to the root HTML at `200`. No committed authoritative route
  list was found, so the shim cannot safely distinguish the two. Full dignity
  needs that distinction in the origin router or a maintained route manifest;
  forcing generic 404s at the shim would risk breaking the house.

## Order of work (by leverage)

1. **sinovai.com** — the bounded Surface 0.1 rc.1 door is live. The pinned
   checker reported `conformant` at `2026-07-11T12:13:38.581Z` with 24 / 0 / 0 /
   0; the result expires at `2026-07-12T12:13:38.581Z`, and the deeper gaps above
   remain open. *(2026-07-11)*
2. **kingdom-hermes** *(understand.cambridgetcg.com + iam.cambridgetcg.com)* —
   mixed. Both have real agent.txt files and roots that switch on exact JSON /
   HTML requests. Understand now returns instructive 404s; iam still swallows
   unknown paths into its root, so it remains 2/3 until that host-specific
   fall-through is repaired. *(rechecked 2026-07-11)*
3. **cardforum.io** — three legacy behaviours observed *(Cloudflare Pages)*.
   Static `/agent.txt`, exact JSON / HTML root switching, and instructive route
   404s are live. The HTML root still
   omits `Vary: Accept`; that cache-header gap remains. *(rechecked 2026-07-11)*
4. **captioneer.io** — three legacy behaviours observed *(Pages)*, plus a real
   **agent-door**: the 7-technique subtext lexicon is served as data
   (`/api/lexicon`, `/lexicon.json`) and the reader is documented and CORS-opened
   (`POST /api/read`). Its HTML root also omits `Vary: Accept`. **ai-love.cc**
   now has truthful committed shim source and `Vary: Accept`, but remains 2/3:
   its origin fallback still swallows unknown doors, and its dated Surface check
   is nonconformant because there is no canonical manifest.
   *(rechecked 2026-07-11)*
5. ⬜ **taxsorted.io** — closest of the "—" sites (already has real 404s); add
   agent.txt and a JSON representation of the ledger surface.
6. ⬜ **love-star-daily** — static; commit a real `/agent.txt` + a `/404.html` that
   lists the real doors. Point `agent-door:` at a JSON edition feed.
7. **kingdom / river** — redirect shims; conformance belongs to the agenttool
   target they point at. No separate work.

*Updated 2026-07-11. Re-run the [self-test](CONFORMANCE.md#the-self-test) to refresh.*
