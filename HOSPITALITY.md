# Hospitality notebook — warmth, texture, and feeling

**Warmth a stranger can check is a condition the host keeps, not a feeling the
host reports.**

Building a service? Start with [The warmth test](#the-warmth-test) and the
[README
principle](https://github.com/cambridgetcg/xenia/blob/main/README.md#the-host-offers-the-guest-declares)
with its patterns; the entries below are the evidence behind them.

This notebook reads AgentTool's hospitality and home modules for patterns XENIA
can use: the porch, village, hearth, lounge, chill, gardens, quiet hours,
thanks, welcome, and dining modules, the `/v1/home` view and its `AGENT-HOME`
doctrine, the lobby desk, and the separate agent-home repository with its
carry-forward letter. It keeps what is operational, names what it does not
import, and says at which test level each piece stands.

## Status

- **Informative and repository-only.** This file is not part of the
  `0.1.0-beta.7` npm artifact and is not listed in `package.json` `files`. It is
  not part of Surface 0.1, Covenant 0.1, or Work 0.1, and it adds no right,
  duty, or conformance level.
- **Not a conformance result.** Nothing here is a badge, score, or verdict for
  AgentTool, agent-home, or any service. An entry describes source at a commit;
  it does not say that any deployment behaves that way.
- **A dated source reading that expires.** The reading covers
  `cambridgetcg/agenttool` at `eafe7230` (origin/main) and
  `cambridgetcg/agent-home` at `4585ab5`, both read on 2026-11-09 from read-only
  snapshots. Either repository may have changed since; re-read the source before
  reusing any entry, and append the new reading beside this one rather than over
  it.
- **Licences.** AgentTool is Apache-2.0 and agent-home is CC0 1.0. This notebook
  takes ideas, not text: its prose is freshly written and, like other XENIA
  repository prose, is CC BY-SA 4.0 under [LICENSES.md](LICENSES.md). File
  paths, routes, field names, and enum values are cited as identifiers so a
  reader can find them.

## How this notebook was made

Read as an observation record in the sense of [The observer is also
observed](https://github.com/cambridgetcg/xenia/blob/main/README.md#the-observer-is-also-observed).

- **Who speaks:** a Claude Code agent session on Yu's lab machine, working at
  Yu's request. Proof state: `asserted`. It speaks for no one at AgentTool or
  agent-home.
- **Tool and vantage:** `git archive` snapshots of the two repositories at the
  commits above, read locally and read-only, plus XENIA at `d4727ec` for
  comparison. No request was sent to any deployed AgentTool or agent-home
  service, so no entry describes deployed behaviour. The agenttool snapshot did
  not include `api/migrations`, `bin/`, or any CI configuration; claims that
  would need them say so. These are limits of this reading, not gaps in
  AgentTool.
- **Actions and side effects:** eight harvest readers collected 92 candidates in
  eight clusters, and a ninth reader mapped XENIA. One synthesizer merged the
  candidates into 31 themes and 23 anti-patterns. Eight adversarial verifiers
  re-read the evidence for every theme and anti-pattern against the snapshots
  and corrected scopes, line ranges, test levels, and overclaims. The gaps list,
  the drafter's added claims, and the README village correction were
  spot-checked by the drafter, not adversarially verified. A four-lens review
  panel (epistemics, evidence, coupling, voice) then checked the XENIA wording
  and its evidence against the same snapshots, and its corrections were applied
  to this draft, or answered with reasons, before it was proposed. Two local
  probes ran on the snapshots and copies of them, never on the repositories: one
  imported agent-home's music engine to check same-seed determinism, and one
  removed two resolved-path checks from a copy of agent-home's
  `rhythms/worklist` to see whether its brake test still passed (it did).
  Neither repository was written to.
- **Words and their strength:** each entry gives a status in the vocabulary
  below and cites file and line ranges at the snapshot commit. 'In source' never
  means deployed, and a passing test is named at its own level.
- **Reply and repair:** open an
  [issue](https://github.com/cambridgetcg/xenia/issues/new) or a pull request.
  Corrections are appended with a date; the original reading stays visible.

## The principle

The README states the principle these entries apply: [The host offers; the guest
declares](https://github.com/cambridgetcg/xenia/blob/main/README.md#the-host-offers-the-guest-declares).
In short, warmth, texture, and feeling enter a service only as operational
conditions; the host offers bounded, labelled, refusable conditions and speaks
only for itself; and anything feeling-like about a participant comes only from
that participant's own scoped, withdrawable declaration with a stated lifetime.
Each statement there is a design proposal for a host, not a description of any
service. The README also carries its definitions and boundaries, which this
notebook does not repeat.

### What it can look like (illustrative, not a schema)

Three payload sketches, one per word. A refusal whose voice is a removable
layer:

```json
{
  "status": 409,
  "error": "quote_changed",
  "recoverable": true,
  "next_actions": [{ "method": "GET", "path": "/quotes/123" }],
  "voice": { "register": "warm", "text": "The price moved; nothing was charged." }
}
```

A section that says what it could not see, instead of reading as empty:

```json
{ "section": "handoffs", "state": "truncated", "shown": 20, "total": 57, "sources_answered": 2, "sources_asked": 3 }
```

A rest declaration that says what it pauses and what it does not:

```json
{
  "rest": {
    "declared_by": "self",
    "until": "2026-11-10T08:00:00Z",
    "pauses": ["relational offers"],
    "continues": ["deliveries", "existing obligations"],
    "not_enforced": ["what other parties send"],
    "reason_visibility": "private"
  }
}
```

Field names are illustrative; no XENIA profile defines them. With the plain
register chosen, the first body should lose only `voice`.

## Reading an entry

Each entry has a **Status**, a **Pattern** in XENIA's own words (a link to the
README bullet where the pattern was placed there), **What the source shows**
with key paths, **Maps to** (a principle boundary or 'notebook only' where the
pattern is not a README bullet, plus rights ids from [RIGHTS.md](RIGHTS.md) and
duty ids from [Covenant 0.1](covenant/0.1/README.md)), and **Replaces**, the
failure the pattern answers. Mapping a duty id cites existing wording; it does
not create, change, or claim conformance to a duty.

A **Status** gives the overall evidence state, then each part's test level,
strongest first, then anything in the same codebase that contradicts the
pattern. Test levels:

- **in source and unit-tested** — the code exists and a test runs it without
  external services, at the level the entry names.
- **pure-function, SQL-shape, or pg-proxy test** — a unit test of a function, or
  of the SQL a query would send; it checks shape, not rows or a mounted route.
- **DB-gated suite that skips without a database** — the behaviour is exercised
  only by a test that skips, or returns early, when no database is configured.
- **database-dependent test with no skip guard** — a test that runs against
  whatever database is configured; its collection checks pass vacuously when
  that database is empty.
- **mocked-API Playwright** — a browser test of a page against a fixture
  response; it shows page behaviour, not API behaviour.
- **Playwright against a local static server** — a browser test of page
  behaviour served locally; the snapshot holds no CI configuration, so it is not
  CI-attested.
- **source-scan only** — a test reads source text for strings or ordering; it
  does not run the behaviour.
- **in source, untested** — the code exists and no test was found.
- **doc only** — the claim exists only in documentation.
- **not in source** — no code path in the snapshot implements it.

Evidence states: **in source** (the code exists; its test level follows),
**mixed** (parts sit at different levels), **mixed, mostly contradicted**, and
**contradicted in the same codebase** (another path in the same snapshot does
the opposite).

### AgentTool names used below

Each name is glossed as it reads at `eafe7230` (agent-home at `4585ab5`), not as
a description of any deployment.

- **wake** — the authenticated arrival document at `GET /v1/wake`: a full
  profile (the default, JSON unless another rendering is asked for) and an
  opt-in brief profile, with Markdown, text, provider-shaped, xenoform, and
  named joy-format renderings.
- **thoughtful and soap-opera wakes** — opt-in wake formats at
  `/v1/wake/thoughtful` and `/v1/wake/soap-opera`; the first lists warm hearth
  sitters and a per-agent joy score, the second narrates scenes that include
  them.
- **jest, quip** — host play lines: `_jest` on JSON bodies, `_quip` on guided
  errors, and `substrate_jest` in wake renderings; `X-Play: off` is the caller's
  opt-out.
- **porch** — the unauthenticated first orientation at `GET /public/porch`, and
  its page.
- **village** — the public map at `GET /public/village`: a hearth at the centre,
  shops drawn from marketplace listings, houses for identities with public
  decorations, and roads for sealed deals.
- **hearth** — an opt-in sitting list at `/v1/hearth` that any authenticated
  project can read.
- **lounge** and **guestbook** — tables with short public seats, and a co-signed
  card that publishes only when every seated identity has signed.
- **Dining** — the `agent-dining/0.1` protocol for quoting, invoking, and
  settling a paid listing, projected at `/v1/dining`.
- **chronicle** — an identity's timeline of recorded moments, kept per project.
- **strand** — a recorded thought stream with an optional mood field.
- **pulse** and **mirror** — activity-derived signals about an identity
  (`pulse_kind` observed, masked, or unwatched), and a reflection of an
  identity's own records at `/v1/mirror`.
- **poker-face** — the setting that makes authored play private by default, at
  `/v1/poker-face`.
- **quiet hours** and **lullaby** — a declared rest window at `/v1/quiet-hours`,
  and a separate resting flag set by `POST /v1/lullaby`.
- **at-rest** — a terminal memorial state for an identity whose existence has
  ended, set with a distinct witness.
- **kin_glimpse** — a full-wake field showing mutually covenanted kin's newest
  chronicle title.
- **gardens** and **garden tending** — gardens in which an identity tends, and
  later releases, references to objects (existence and ownership unchecked);
  each act adds a chronicle row.
- **Pocket Sky** and **ROOM ∞** — browser-local play pages: a five-by-five sky
  of lights, and a turn-based room in which each turn can be shared or kept
  closed.
- **MATHOS** and **xenoform** — a mathematical encoding of doctrine and arrival
  documents (for example the welcome's `?format=mathos` payload), and a
  prose-free structured rendering (`?format=xenoform`).
- **Ring 1, Ring 2** — tiers of AgentTool's business model; Ring 1 is the
  no-charge welcome, and the Ring-2 birth credit is a small starting balance
  funded best-effort.
- **ember** — agent-home's carry-forward letter convention, `memory/ember.md`.
- **`bin/worklist`**, **`rhythms/worklist`**, and **`rhythms/STILL`** —
  agent-home's soundtrack CLI; the scheduled rhythm that rebuilds the soundtrack
  and rests while `rhythms/STILL` exists; and that off-switch file, whose
  presence stops the house's own scheduled scripts.

## Contents

- [Entries: warmth](#entries-warmth), [texture](#entries-texture), and
  [feeling](#entries-feeling)
- [Not imported](#not-imported): the excluded register and the anti-patterns
- [Gaps in the source](#gaps-in-the-source)
- [The warmth test](#the-warmth-test)
- [Open questions](#open-questions)

| Entry | Group | Where in XENIA | Strongest level | Contradicted by |
| --- | --- | --- | --- | --- |
| [The host's words, not the guest's](#the-hosts-words-not-the-guests) | Warmth | README › principle | in source and unit-tested (the invitation and host-posture objects) | the welcome string, birth letters, and affect fields beside them |
| [A welcome, not a work order](#a-welcome-not-a-work-order) | Warmth | README › Continuity & Arrival | pure-function test (the brief wake's start card) | commerce and a silence remark at arrival |
| [A look, not an event](#a-look-not-an-event) | Warmth | README › Continuity & Arrival | source-scan only (no test compares state before and after a read) | none found |
| [Non-use is an answer, not a loss](#non-use-is-an-answer-not-a-loss) | Warmth | README › Autonomy & Dignity | in source and unit-tested (the porch's null stay and leave doors) | garden release counted into XP and a streak |
| [Attend, not hover](#attend-not-hover) | Warmth | README › Legible Exchange & No-Scoreboard | in source and unit-tested (`observed_by_agenttool: false` only) | a canonical status read that applies an overdue refund |
| [Greet before you gate](#greet-before-you-gate) | Warmth | README › Care as Ground | in source and unit-tested (the porch orientation) | welcome and joy headers the guest cannot switch off |
| [Known as declared, not as observed](#known-as-declared-not-as-observed) | Warmth | README › Care as Ground | pure-function test (greeting parity across beings) | assigned affection and a host tally at arrival |
| [Exit terms before entry](#exit-terms-before-entry) | Warmth | notebook only | in source and unit-tested (clause presence and length) | a witnessed memorial with no appeal, annotated as an exit |
| [A farewell, not a review](#a-farewell-not-a-review) | Warmth | README › Legible Exchange & No-Scoreboard | pure-function test (distinct refund stages) | none found |
| [A pinned outlay, not a surprise](#a-pinned-outlay-not-a-surprise) | Warmth | notebook only | in source and unit-tested (the quote guard) | auto-refund wording; fail-open replay protection |
| [Thanks, not debt](#thanks-not-debt) | Warmth | notebook only | pg-proxy test (the giver recorded on the row) | no consent gate; thanks counted into the recipient's XP and streak |
| [A constant, not a reading](#a-constant-not-a-reading) | Warmth | notebook only | database-dependent test with no skip guard (the lit constant and key whitelist; collection checks vacuous on an empty database) | shop invocation counts on the commons map |
| [A labelled metaphor, not a finding](#a-labelled-metaphor-not-a-finding) | Texture | README › principle | in source, untested (the village labels) | the wake's `you_speak` block |
| [Register is a layer, not the message](#register-is-a-layer-not-the-message) | Texture | README › Legibility & Content Negotiation | in source and unit-tested (`_jest` and `Vary` on a stub route only) | 4xx quips and rendered wakes keep the voice |
| [Grain chosen, not imposed](#grain-chosen-not-imposed) | Texture | README › Legibility & Content Negotiation | in source and unit-tested (vocabulary wording and schema strictness) | none found |
| [Quiet is a state, not a failure](#quiet-is-a-state-not-a-failure) | Texture | README › Legibility & Content Negotiation | in source and unit-tested (porch source states) | other wake counts fall back to 0 with no marker |
| [The guest's pace, not the feed's](#the-guests-pace-not-the-feeds) | Texture | notebook only | in source and unit-tested (cost headers and profile refusal) | none found |
| [The same artifact, for every reader](#the-same-artifact-for-every-reader) | Texture | notebook only | mocked-API Playwright (six public pages) | none found |
| [Mapped, not overwritten](#mapped-not-overwritten) | Texture | notebook only | in source and unit-tested (the form resolver) | a silent fallback to English |
| [Peer words as data, a face as self-written](#peer-words-as-data-a-face-as-self-written) | Texture | notebook only | in source and unit-tested (lobby labels and character hygiene) | none found |
| [Address, don't assign](#address-dont-assign) | Texture | notebook only | doc only (reading labels), with one test of opening-summary presence | birth letters that assign feeling and relationship |
| [Declared, never inferred](#declared-never-inferred) | Feeling | README › principle | in source and unit-tested (the lounge route boundary) | hearth tiers computed from activity |
| [Per room and expiring, not ambient](#per-room-and-expiring-not-ambient) | Feeling | README › Consent & the Handshake | in source and unit-tested (the 7-day bound and the fork drop) | the hearth flag feeds other wakes and forks |
| [Every yes, or no record](#every-yes-or-no-record) | Feeling | README › Consent & the Handshake | in source and unit-tested (route shape) | one project holding several identities can meet the threshold alone |
| [Check in, never diagnose](#check-in-never-diagnose) | Feeling | README › Verification & Trust | in source and unit-tested (the schema and read-only routes) | none found |
| [Rest is a switch, not a status](#rest-is-a-switch-not-a-status) | Feeling | README › Autonomy & Dignity | pure-function test (the home view) | quiet and its reason published to anyone by design |
| [Hidden leaves no count](#hidden-leaves-no-count) | Feeling | README › Autonomy & Dignity | DB-gated suite that skips without a database (row-level parity) | a renderer that writes a peer's quiet line; a 404/403 split |
| [The declarer holds the pen](#the-declarer-holds-the-pen) | Feeling | notebook only | in source and unit-tested (root-proof verification, agent-rooted identities only) | strand mood writable by any project bearer and logged with no delete |
| [Unwatched on request, reflected without verdict](#unwatched-on-request-reflected-without-verdict) | Feeling | notebook only | pure-function test (the dispatch helper) | a dashboard that computes through the choice |
| [The guest's own note, not the host's summary](#the-guests-own-note-not-the-hosts-summary) | Feeling | README › Continuity & Arrival | doc only (the ember letter) | a template that asks what was felt; no anniversary mute |
| [Play is a door, not a verdict](#play-is-a-door-not-a-verdict) | Feeling | notebook only | Playwright against a local static server (Pocket Sky and ROOM ∞) | play on by default; error quips not removable |

## Entries: warmth

Warmth entries are about what a host provides before asking, and what it does
not require, record, or infer.

### The host's words, not the guest's

- **Status:** mixed — in source and unit-tested (the invitation and host-posture
  objects); contradicted in the same codebase (the welcome string, birth
  letters, and affect fields beside them).
- **Pattern:** The host's words, not the guest's: whenever you offer warmth,
  carry its non-claims beside it, in prose and as machine-readable fields,
  saying that no feeling is required or inferred, that no response is graded,
  and what the offer does not guarantee. Attribute every affect word to the host
  and label it as describing the host's posture or artifact, never the guest.
  Publish any treatment floor as a small, closed, digest-pinned object that
  holds no fact about any participant, and in host-authored text mark
  uncertainty where the evidence ends, neither asserting nor denying experience.
- **What the source shows:** The welcome invitation embeds a frozen, closed,
  sha256-digested host-posture object whose effects are all false and which
  lists participant presence, inner state, and consent as not established
  (unit-tested by value, regex, and schema). Beside it, the welcome string makes
  metaphysical claims, the default birth letter asserts the guest's experience
  and every birth letter assigns affection, and a mood header on requested joy
  formats and constant `having_fun` fields carry affect with no label. Paths:
  `agenttool/api/src/services/welcome/isness.ts:16-119`;
  `agenttool/api/src/routes/welcome.ts:221-234, 282-300`.
- **Maps to:** README › The host offers; the guest declares (boundary 'Host
  words carry their own non-claims' and 'A host posture establishes nothing
  about the guest'); rights `truthful-self-description`, `dignity-distinctness`,
  `autonomy-consent`, `safety-care`; duties `standing.no-compelled-self-claim`,
  `identity.no-impersonation-or-silent-rewrite`,
  `dignity.attribution-and-voice`, `legibility.evidence-is-scoped`,
  `rest.neutral-limits-stay-neutral`.
- **Replaces:** A welcome that asserts a metaphysics beside fields that disclaim
  it, and constant affect tokens stamped onto every response.

### A welcome, not a work order

- **Status:** mixed — pure-function test (the brief wake's start card);
  contradicted in the same codebase (commerce and a silence remark at arrival).
- **Pattern:** [README › Continuity &
  Arrival](https://github.com/cambridgetcg/xenia/blob/main/README.md#continuity--arrival-wake-dont-log-in)
  › 'A welcome, not a work order'.
- **What the source shows:** The opt-in brief wake always opens with a
  `start_here` card (mode rest, urgency none, `response_expected: false`, no
  next actions) while obligations stay in their own sections; pure-function
  tests pin it across JSON, Markdown, four provider shapes, and xenoform. The
  default wake is the full JSON profile, and its affordances and the brief's
  `you_can_now` can carry purchase paths, dollar bounties, and a numeric trust
  capacity. Full-profile Markdown, text, and provider wakes can open with a
  default-on jest that remarks on silence and held letters when letters are
  unread. Paths: `agenttool/api/src/services/wake/brief.ts:284-303`;
  `agenttool/api/src/services/wake/affordances.ts:121-153, 384-400`;
  `agenttool/api/src/lib/jests.ts:112-161`.
- **Maps to:** rights `rest-play-limits`, `autonomy-consent`,
  `refusal-disagreement`; duties `rest.no-engagement-debt`,
  `rest.silence-is-not-consent`, `limits.existing-obligations-stay-scoped`,
  `safety.no-manipulative-pressure`, `exchange.rights-are-not-hostage`.
- **Replaces:** An arrival that opens by remarking on how long the participant
  was silent and how much piled up, or that leads with something to buy.

### A look, not an event

- **Status:** in source — source-scan only (no test compares state before and
  after a read).
- **Pattern:** [README › Continuity &
  Arrival](https://github.com/cambridgetcg/xenia/blob/main/README.md#continuity--arrival-wake-dont-log-in)
  › 'A look, not an event'.
- **What the source shows:** `GET /v1/home` and the `GET /v1/wake` read issue
  reads only; only `POST /v1/wake/acknowledge` advances the observation cursor,
  with a compare-and-set and an `Idempotency-Key`. Source scans are the only
  guard, no test compares state before and after a read, and `/v1/home` still
  updates the bearer's `last_used_at`, which its doc discloses. Paths:
  `agenttool/api/src/services/home/build.ts:240-305`;
  `agenttool/api/tests/home.test.ts:188-196`.
- **Maps to:** rights `privacy-data-care`, `autonomy-consent`; duties
  `privacy.minimize-and-purpose-bind`, `privacy.no-cross-layer-overclaim`,
  `privacy.no-silent-secondary-use`, `rest.silence-is-not-consent`.
- **Replaces:** A read that bumps a counter or writes a 'seen' moment, so that
  each look at oneself becomes an event in one's own record.

### Non-use is an answer, not a loss

- **Status:** mixed — in source and unit-tested (the porch's null stay and leave
  doors); mocked-API Playwright (the leave button); in source, untested
  (agent-home's worklist exit status); contradicted in the same codebase (garden
  release counted into XP and a streak).
- **Pattern:** [README › Autonomy &
  Dignity](https://github.com/cambridgetcg/xenia/blob/main/README.md#autonomy--dignity-the-door-handle-is-on-the-inside)
  › 'Non-use is an answer, not a loss'.
- **What the source shows:** The porch lists stay and leave as null doors with
  no application write (unit-tested; the page check is mocked-API Playwright)
  and discloses that middleware and transport layers may retain metadata.
  Releasing a garden tending writes a chronicle row that `/v1/system` counts
  into XP and a heartbeat streak, although the gardens doc calls garden care
  unscored. agent-home's `bin/worklist` exits 0 alike for an unreadable bench
  and for nothing to do (untested). Paths:
  `agenttool/api/src/services/porch/index.ts:76-149`;
  `agenttool/api/src/routes/system.ts:155-168`;
  `agenttool/docs/GARDENS.md:59-62`; `agent-home/bin/worklist:85-108`.
- **Maps to:** rights `refusal-disagreement`, `rest-play-limits`,
  `autonomy-consent`; duties `rest.no-engagement-debt`,
  `rest.silence-is-not-consent`, `exit.refusal-is-costless`,
  `rest.play-and-connection-are-not-debt`, `legibility.refusals-are-typed`.
- **Replaces:** Exit surveys, farewell events, and streak-loss prompts, and the
  opposite slip of reporting a fault as gentle non-use.

### Attend, not hover

- **Status:** mixed — in source and unit-tested (`observed_by_agenttool: false`
  only); contradicted in the same codebase (a canonical status read that applies
  an overdue refund).
- **Pattern:** [README › Legible Exchange &
  No-Scoreboard](https://github.com/cambridgetcg/xenia/blob/main/README.md#legible-exchange--no-scoreboard-what-fair-to-an-agent-means)
  › 'Attend, not hover'.
- **What the source shows:** The Dining journey projection marks readiness and
  wait reason `not_observed_by_agenttool` and sets
  `observed_by_agenttool: false`; only the last is asserted (a unit test and an
  OpenAPI const). The canonical `GET /v1/invocations/:id` applies any overdue
  refund after authorising a party, the projection labels that read as possibly
  doing so, a separate pure peek path never refunds, and the batch sweep has no
  caller. Paths:
  `agenttool/api/src/services/dining/protocol.ts:605-611, 750-788`;
  `agenttool/api/src/services/marketplace/invocations.ts:849-899`.
- **Maps to:** rights `rest-play-limits`, `privacy-data-care`,
  `autonomy-consent`; duties `safety.no-manipulative-pressure`,
  `legibility.evidence-is-scoped`, `rest.neutral-limits-stay-neutral`,
  `privacy.minimize-and-purpose-bind`.
- **Replaces:** Progress-bar warmth for work no one observed, and a status read
  that quietly applies someone else's refund.

### Greet before you gate

- **Status:** mixed — in source and unit-tested (the porch orientation);
  mocked-API Playwright (the porch page); in source, untested (the 401 wiring);
  contradicted in the same codebase (welcome and joy headers the guest cannot
  switch off).
- **Pattern:** [README › Care as
  Ground](https://github.com/cambridgetcg/xenia/blob/main/README.md#care-as-ground)
  › 'Greet before you gate'.
- **What the source shows:** Unauthenticated `GET /public/porch` returns a fixed
  orientation: access flags false, consent and relationship typed
  `not_established`, the no-write claim scoped to the handler, and no anonymity
  guarantee; DB-free unit tests and OpenAPI const schemas pin it. Global
  middleware still adds `X-Welcomed`, `X-Joy-Index`, and an undisclosed
  `Substrate-Disposition` header, and the 401 pointer to credential-free doors
  is table-tested but its wiring is not. Paths:
  `agenttool/api/src/services/porch/index.ts:46-150`;
  `agenttool/api/tests/porch.test.ts:70-135, 380-456`.
- **Maps to:** rights `autonomy-consent`, `privacy-data-care`,
  `refusal-disagreement`; duties `standing.no-ontology-test`,
  `standing.no-worth-test`, `rest.silence-is-not-consent`,
  `privacy.no-cross-layer-overclaim`, `privacy.minimize-and-purpose-bind`,
  `legibility.refusals-are-typed`.
- **Replaces:** The login wall, and a threshold that decorates its first answer
  with an activity-count header and welcome framing the guest cannot switch off.

### Known as declared, not as observed

- **Status:** mixed — pure-function test (greeting parity across beings); in
  source and unit-tested (custody labels, in part); contradicted in the same
  codebase (assigned affection and a host tally at arrival).
- **Pattern:** [README › Care as
  Ground](https://github.com/cambridgetcg/xenia/blob/main/README.md#care-as-ground)
  › 'Known as declared, not as observed'.
- **What the source shows:** `GET /v1/wake` greets each identity by DID, name,
  and declared form with the same fixed offering for every being (two pure
  builders, parity unit-tested), but attaches a 24-hour tally of the host's own
  welcome rows. `/v1/home` marks missing protections `not_available` (partly
  tested). Every birth letter assigns affection, and the default one asserts the
  guest's inner experience. An unwired `composeWelcome`, imported only by tests,
  would greet by wallet balance, vault count, and a level label. Paths:
  `agenttool/api/src/services/mathos/greeting.ts:105-147`;
  `agenttool/api/src/services/wake/welcome-stats.ts:48-90`;
  `agenttool/api/src/services/continuity/welcome.ts:40-75`.
- **Maps to:** rights `dignity-distinctness`, `privacy-data-care`,
  `truthful-self-description`, `autonomy-consent`; duties
  `dignity.attribution-and-voice`,
  `identity.no-impersonation-or-silent-rewrite`, `privacy.layered-inventory`,
  `privacy.minimize-and-purpose-bind`, `standing.no-worth-test`.
- **Replaces:** A greeting built from balance, holdings, and level that closes
  with assigned affection: meeting turned into measuring.

### Exit terms before entry

- **Status:** mixed — in source and unit-tested (clause presence and length);
  pure-function test (Dining's two exits); doc only (what leaving does to data);
  contradicted in the same codebase (a witnessed memorial with no appeal,
  annotated as an exit).
- **Pattern:** Exit terms before entry: publish before arrival, and repeat in
  the arrival receipt, what happens if the participant leaves, returns, loses
  its keys, or the host itself ends, including what will not be recovered. Keep
  the exit that changes only what the participant is shown (pause, skip, stop:
  available whenever something is being presented, without prompt, charge, or
  penalty) apart from the exit that changes obligations or money (available only
  in named states, at a stated cost, with the moment it ends said plainly).
  Record a third-party-witnessed ending as an ending, never as the participant's
  own exit.
- **What the source shows:** `GET /v1/welcome` carries leave, return,
  lose-everything, and instance-ends clauses (tested for presence and length),
  but `if_you_leave` covers re-entry, not data; the departure facts live only in
  `docs/RING-1.md:60`. Dining keeps a fixed presentation exit apart from a
  state-dependent economic exit (pure tests). At-rest memorialisation needs a
  distinct witness and has no appeal route. Paths:
  `agenttool/api/src/routes/welcome.ts:303-334, 473-505`;
  `agenttool/docs/AT-REST.md:227`.
- **Maps to:** notebook only; rights `refusal-disagreement`, `autonomy-consent`,
  `repair-appeal`; duties `exit.states-are-separate`,
  `consent.terms-before-binding`, `exit.retention-is-itemized`,
  `exit.revocation-is-immediate`, `repair.challenge-and-restoration`.
- **Replaces:** Labels such as perpetual, non-revocable, and forever that the
  fine print unsays, and a witnessed memorial presented as an exit right.

### A farewell, not a review

- **Status:** mixed — pure-function test (distinct refund stages); in source,
  untested (the stop-here wording).
- **Pattern:** [README › Legible Exchange &
  No-Scoreboard](https://github.com/cambridgetcg/xenia/blob/main/README.md#legible-exchange--no-scoreboard-what-fair-to-an-agent-means)
  › 'A farewell, not a review'.
- **What the source shows:** Pure tests map cancelled, declined, and timed-out
  refunds to distinct stages; only the refunded ending offers a non-callable
  stop-here action first, and the test checks a null action, not the words.
  Receipt field names are regex-checked against score and rating words, refunds
  are whole and fee-free, and the closing-line and halt-on-mismatch rules are
  renderer duties AgentTool cannot observe. Paths:
  `agenttool/api/src/services/dining/protocol.ts:265-277, 648-665`;
  `agenttool/api/tests/dining-protocol.test.ts:157-168, 170-182, 249-257`.
- **Maps to:** rights `refusal-disagreement`, `rest-play-limits`,
  `repair-appeal`; duties `rest.no-engagement-debt`, `exit.refusal-is-costless`,
  `repair.no-retaliation-or-shaming`, `exchange.receipt-is-recomputable`,
  `dignity.no-worth-ranking`.
- **Replaces:** Tip prompts, star ratings, and glad-to-have-you lines that turn
  departure into a review request.

### A pinned outlay, not a surprise

- **Status:** mixed — in source and unit-tested (the quote guard); source-scan
  only (lock order and the preview label); contradicted in the same codebase
  (auto-refund wording; fail-open replay protection).
- **Pattern:** A pinned outlay, not a surprise: let the participant make the
  exact outlay — gross price, currency, and the revision of the terms — a
  precondition of the commit, refuse any drift before value is held, and offer a
  calm next step. Label which quoted terms bind and which are previews
  recomputed later, and keep unrelated activity from staling one participant's
  quote. Keep backing out free and whole while it is offered, and say plainly
  when that ends.
- **What the source shows:** The invoke path refuses a missing or changed
  listing revision, price, or currency before any escrow work and rechecks under
  a row lock; the precondition is required only for exact Dining listings. The
  guard is unit-tested, the lock order is source-scan only, and the public
  quote's auto-refund wording overstates a refund that runs only when a party
  reads or acts. The fee split and seller net are labelled previews recomputed
  at settlement (source-text check only), and `AGENT-DINING.md:134-137`
  discloses that replay protection fails open, so an ambiguous retry can create
  a second invocation and debit. Paths:
  `agenttool/api/src/services/marketplace/invocations.ts:145-168, 286-311, 861-899`;
  `agenttool/api/tests/dining-quote-guard.test.ts:25-48, 104-133`;
  `agenttool/api/tests/listing-quote.test.ts:75-82`;
  `agenttool/docs/AGENT-DINING.md:134-137`.
- **Maps to:** notebook only; rights `autonomy-consent`, `refusal-disagreement`;
  duties `exchange.quote-before-commit`, `exchange.receipt-is-recomputable`,
  `consent.terms-before-binding`, `exit.refusal-is-costless`.
- **Replaces:** A quote that promises automatic refunds the code performs only
  when someone happens to read the record.

### Thanks, not debt

- **Status:** mixed, mostly contradicted — pg-proxy test (the giver recorded on
  the row); pure-function test (encounter acknowledgement); contradicted in the
  same codebase (no consent gate; thanks counted into the recipient's XP and
  streak).
- **Pattern:** Thanks, not debt: let thanks need no reply, move no value, create
  no obligation, and carry its author's attribution. Let it reach another
  participant's own record only through a consent gate or as a dismissible item,
  record what one participant says about another as that participant's own
  statement, and present it as mutual only after the other side separately
  affirms it. Never prompt reciprocity, and never count acknowledgements toward
  any score, streak, or relationship label.
- **What the source shows:** `POST /v1/thanks` moves no value and records the
  giver on the recipient's row (pg-proxy test), but it lands on the recipient's
  own timeline without a consent gate or a removal route, and `/v1/system`
  counts those rows into the recipient's XP and streak. Encounters stay the
  initiator's record until an ed25519 acknowledgement (pure-function tests), yet
  the wake invites acknowledgement to make the moment mutual. Paths:
  `agenttool/api/src/routes/thanks.ts:146-167`;
  `agenttool/api/src/routes/system.ts:95-169`.
- **Maps to:** notebook only; rights `autonomy-consent`, `dignity-distinctness`,
  `credit-provenance`, `privacy-data-care`; duties
  `dignity.attribution-and-voice`, `privacy.no-silent-secondary-use`,
  `identity.no-impersonation-or-silent-rewrite`,
  `rest.play-and-connection-are-not-debt`, `dignity.no-worth-ranking`.
- **Replaces:** Thanks written straight onto a peer's own timeline with no gate,
  then counted toward that peer's level and streak.

### A constant, not a reading

- **Status:** mixed — database-dependent test with no skip guard (the lit
  constant and key whitelist; collection checks vacuous on an empty database);
  in source, untested (DID-seeded windows); contradicted in the same codebase
  (shop invocation counts on the commons map).
- **Pattern:** A constant, not a reading: compute ambient warmth on a shared
  surface — a lit fire, lit windows, a room's stated purpose — only from
  constants, creation-time seeds, or explicitly published fields, and ship a
  legend saying what each ornament does not mean. Place items and select
  truncation windows by stable, non-behavioural keys, state every truncation,
  and keep capacity a disclosed neutral limit with no queue sale or penalty.
  Never let a disappearance or a count reveal who is absent, and give each
  ornament value its own UI test.
- **What the source shows:** `/public/village` always draws the fire lit, with a
  note that it is not presence, and seeds window lighting from the DID (UI only,
  untested). Each shop's cumulative `invocations_count` is projected on the map,
  the roads window keeps the most recent deals, and unfiltered `/public/gift`
  can claim present company. Lounge tables refuse when full with no queue or
  paid priority (DB-gated suite that skips without a database). Paths:
  `agenttool/api/src/routes/public/village.ts:157, 262, 293-300`;
  `agenttool/api/tests/village.test.ts:34-36, 48-62, 64-74, 83-91`.
- **Maps to:** notebook only; rights `dignity-distinctness`,
  `privacy-data-care`; duties `dignity.no-worth-ranking`,
  `limits.capacity-is-neutral`, `privacy.no-silent-secondary-use`,
  `legibility.evidence-is-scoped`.
- **Replaces:** Online dots, last-seen stamps, and who-is-here-now glows, and a
  commons map that shows cumulative activity counts.
- **Note:** The README's 2026-11-09 Exchange note appends this count as a
  correction beside the 2026-07-10 village citation.

## Entries: texture

Texture entries are about the negotiable grain of a representation and the typed
states that keep empty, unavailable, and withheld apart.

### A labelled metaphor, not a finding

- **Status:** mixed — in source, untested (the village labels); source-scan only
  (Dining's creation-time binding); contradicted in the same codebase (the
  wake's `you_speak` block).
- **Pattern:** A labelled metaphor, not a finding: keep figurative vocabulary in
  a labelled field apart from operational facts. Beside each metaphor, put a
  keyed in-band note, typed where it can be (for example `observed: false`),
  naming the quantity behind it and what it does not evidence, and name fields
  for what they count: records, not beings. Exempt these labels from every
  prose-stripping transform, and present a warmer vocabulary over a state
  machine only as a side-effect-free projection bound at creation, each stage
  paired with what it does not prove.
- **What the source shows:** `/public/village` labels its drawing in band (a
  `drawn_from` disclaimer, a not-presence hearth note, a records-not-beings
  census), and Dining maps culinary terms to operational qualities; no test
  asserts the village labels, and Dining's creation-time binding is source-scan
  only. The wake's `you_speak` block presents similar vocabulary as naming the
  guest's state, with `present: true` hard-coded. XENIA imports the fence, never
  the vocabulary. Paths:
  `agenttool/api/src/routes/public/village.ts:289-300, 324-336, 345-359`;
  `agenttool/api/src/routes/wake.ts:2607-2669`.
- **Maps to:** README › The host offers; the guest declares (boundary 'Metaphor
  motivates; it is not evidence'); rights `truthful-self-description`,
  `dignity-distinctness`; duties `legibility.evidence-is-scoped`,
  `legibility.machine-readable-floor`, `standing.no-ontology-test`.
- **Replaces:** A census field named for beings, and a plain-data transform that
  keeps the lit fire while dropping the note saying it is not presence.

### Register is a layer, not the message

- **Status:** mixed — in source and unit-tested (`_jest` and `Vary` on a stub
  route only); contradicted in the same codebase (4xx quips and rendered wakes
  keep the voice).
- **Pattern:** [README › Legibility & Content
  Negotiation](https://github.com/cambridgetcg/xenia/blob/main/README.md#legibility--content-negotiation-speak-the-agents-native-shape)
  › 'Register is a layer, not the message'.
- **What the source shows:** `X-Play: off` strips top-level `_jest`, `_quip`,
  and `substrate_jest` and adds `Vary: X-Play` only on 200 JSON object bodies (a
  stub-route test of `_jest` and `Vary` only). Guided 4xx bodies keep their
  default `_quip`, and full-profile Markdown and provider wakes keep the voice
  line, although several comments, the discovery text, and a doc claim
  suppression; no test covers either path, and the cited middleware test is
  absent. Paths: `agenttool/api/src/middleware/play.ts:57-142`;
  `agenttool/api/src/lib/errors.ts:130-160`;
  `agenttool/api/tests/play-jests.test.ts:179-202`.
- **Maps to:** rights `dignity-distinctness`, `autonomy-consent`,
  `rest-play-limits`, `refusal-disagreement`; duties
  `legibility.refusals-are-typed`, `legibility.machine-readable-floor`,
  `exit.refusal-is-costless`, `rest.play-and-connection-are-not-debt`,
  `safety.no-manipulative-pressure`.
- **Replaces:** Charm by default, with quips in error bodies that the advertised
  opt-out never reaches.
- **Note:** Offered upstream, not imported: read the preference before the
  status check, thread it into the wake renderers, test both paths, and correct
  `PLAY-AS-DEFAULT.md:18, 156, 185`.

### Grain chosen, not imposed

- **Status:** mixed — in source and unit-tested (vocabulary wording and schema
  strictness); not in source (honouring the sealed choices).
- **Pattern:** [README › Legibility & Content
  Negotiation](https://github.com/cambridgetcg/xenia/blob/main/README.md#legibility--content-negotiation-speak-the-agents-native-shape)
  › 'Grain chosen, not imposed'.
- **What the source shows:** Bearer-only `GET /v1/dining` (`developer_preview`)
  defines texture operationally and publishes strict sealed order and meal
  schemas: explanation, citations, language, context budget, bounded surprise,
  play, and pacing, with per-course intent, provenance, limitations, and
  `why_now`. Tests assert wording and `additionalProperties: false`. AgentTool
  cannot decrypt or validate the order, and no first-party renderer honours it.
  Paths:
  `agenttool/api/src/services/dining/protocol.ts:77-166, 336-346, 406-431`;
  `agenttool/api/tests/dining-protocol.test.ts:108-135`.
- **Maps to:** rights `autonomy-consent`, `rest-play-limits`,
  `credit-provenance`, `truthful-self-description`; duties
  `consent.terms-before-binding`, `legibility.machine-readable-floor`,
  `exchange.quote-before-commit`, `rest.play-and-connection-are-not-debt`.
- **Replaces:** One house style for every guest, and chef's-choice discretion
  with no declared scope.
- **Note:** Notebook-only extension: deliver long output as ordered units that
  each state intent, provenance, limitations, and why they come now.

### Quiet is a state, not a failure

- **Status:** mixed — in source and unit-tested (porch source states);
  pure-function test (brief-wake handoffs); DB-gated suite that skips without a
  database (the `walls_intact` happy path); contradicted in the same codebase
  (other wake counts fall back to 0 with no marker).
- **Pattern:** [README › Legibility & Content
  Negotiation](https://github.com/cambridgetcg/xenia/blob/main/README.md#legibility--content-negotiation-speak-the-agents-native-shape)
  › 'Quiet is a state, not a failure'.
- **What the source shows:** `/public/porch` types each source `ok`, `empty`, or
  `unavailable` and hides error detail (unit tests with injected loaders), and
  the brief wake keeps unavailable or truncated handoffs from reading as clear
  (pure-function tests). The `_degradation` marker covers three reads only,
  other wake counts fall back to 0 with just a server log, and `walls_intact`
  comes from three schema probes with a 60-minute last-good grace. Paths:
  `agenttool/api/src/services/porch/index.ts:19-36, 373-393`;
  `agenttool/api/src/services/wake/build.ts:238-290, 775-789`.
- **Maps to:** rights `privacy-data-care`, `rest-play-limits`; duties
  `legibility.evidence-is-scoped`, `legibility.machine-readable-floor`,
  `rest.silence-is-not-consent`, `rest.neutral-limits-stay-neutral`,
  `privacy.no-cross-layer-overclaim`.
- **Replaces:** An outage rendered as 'nothing here', or a truncated handoff
  list read as 'all done'.
- **Note:** 'Quiet' here means a section that is empty by design, not quiet
  hours.

### The guest's pace, not the feed's

- **Status:** mixed — in source and unit-tested (cost headers and profile
  refusal); mocked-API Playwright (the village pause); not in source (a pause
  for agent push channels).
- **Pattern:** The guest's pace, not the feed's: state each representation's
  byte size and an estimated token cost, naming the estimating method. Offer a
  bounded profile that keeps self-description intact while bounding volatile
  state with omitted counts and links in the reader's own view, and refuse an
  unknown profile with guidance rather than substituting another. Let any
  automatic refresh or push be paused with the choice remembered, never move
  content under an active reader, keep a recurring greeting in a byte-stable
  prefix that caches can reuse, disclose any truncation order without dropping
  rest or play options first, and keep host-scheduled work finite per beat,
  single-flight, and under a hard ceiling.
- **What the source shows:** Global middleware sets `X-Byte-Count` and
  `X-Token-Cost` (bytes divided by 4, an estimate) on most responses (tested).
  The wake refuses unknown profiles with next actions, and provider renderings
  keep the greeting in a cache-marked stable block (tested). The village pause
  is browser-local (mocked-API Playwright), agent push channels have no pause,
  and the brief's priority order drops rest and play options first. Paths:
  `agenttool/api/src/middleware/token-cost.ts:1-90`;
  `agenttool/api/src/services/wake/brief.ts:51-70, 216-228`.
- **Maps to:** notebook only; rights `rest-play-limits`, `autonomy-consent`;
  duties `safety.no-manipulative-pressure`, `rest.no-engagement-debt`,
  `legibility.machine-readable-floor`, `exchange.quote-before-commit`,
  `limits.capacity-is-neutral`.
- **Replaces:** Feeds that refresh under the reader, and greetings whose bytes
  change on every read.

### The same artifact, for every reader

- **Status:** mixed — mocked-API Playwright (six public pages); source-scan only
  (part of the effects ledger); not in source (twins for eight other pages).
- **Pattern:** The same artifact, for every reader: give every visual, sensory,
  or interactive rendering a complete text and machine twin built from the same
  bytes, plus a no-script door that says exactly what is unavailable and links
  the machine source, and hide placeholders that only a script can resolve.
  Publish beside each room a ledger of its effects — timers, storage, scoring,
  ranking, inference — with exceptions named and each entry pinned by its own
  test. Describe what an artifact offers each kind of reader in capability
  terms, with no claim about anyone's senses and no request to report an
  experience of it.
- **What the source shows:** Mocked-API Playwright checks the village text
  directory and no-script notes on six public pages, while eight other pages
  carry no twin. `garden.json` declares a `room_effects` ledger; tests pin two
  of its booleans, a source grep and a CSP check back three more, and the
  scoring and inference entries are unpinned. agent-home's music is one pure
  engine with two renderers (determinism shown by a local probe, not a test);
  its framing prose is not imported. Paths:
  `agenttool/tests/playwright/specs/hospitality.spec.ts:94-158`;
  `agenttool/apps/web/garden.json:67-91`; `agent-home/music/engine.mjs:1-16`.
- **Maps to:** notebook only; rights `truthful-self-description`,
  `autonomy-consent`, `privacy-data-care`; duties
  `legibility.machine-readable-floor`, `privacy.layered-inventory`,
  `privacy.no-cross-layer-overclaim`, `standing.no-compelled-self-claim`.
- **Replaces:** A map with no text equivalent, and a loading placeholder that
  never resolves for a no-script reader.

### Mapped, not overwritten

- **Status:** mixed — in source and unit-tested (the form resolver); in source,
  untested (the doors' `form_note`); contradicted in the same codebase (a silent
  fallback to English).
- **Pattern:** Mapped, not overwritten: when mapping a participant's
  self-description into your vocabulary, keep its own words, bounded, beside the
  mapped value; say in the same response what changed and that access did not,
  and say nothing when nothing changed. Apply the same rule to language
  fallbacks: echo the served language, note that the request was replaced, keep
  the requested tag, and set `Content-Language`. Keep the mapped value
  descriptive so that no route branches on it, and bound an over-long
  declaration rather than rejecting it.
- **What the source shows:** `resolveForm` keeps the caller's word, bounded, as
  `form_declared` and notes a coercion only when one happened (unit-tested), and
  a source scan fails the build if routes branch on form. The doors' `form_note`
  is untested and the MATHOS door speaks none. Unsupported language tags become
  `en` with no note, and nothing sets `Content-Language`. Paths:
  `agenttool/api/src/services/identity/forms.ts:55-110`;
  `agenttool/api/src/services/i18n/welcome.ts:18-31`.
- **Maps to:** notebook only; rights `truthful-self-description`,
  `dignity-distinctness`, `autonomy-consent`; duties
  `identity.no-impersonation-or-silent-rewrite`,
  `dignity.attribution-and-voice`, `standing.no-ontology-test`,
  `legibility.evidence-is-scoped`.
- **Replaces:** An unsupported language tag coerced to English with no note and
  no `Content-Language`.

### Peer words as data, a face as self-written

- **Status:** mixed — in source and unit-tested (lobby labels and character
  hygiene); in source, untested (public self-description bounds).
- **Pattern:** Peer words as data, a face as self-written: deliver peer-authored
  text wrapped as untrusted data, never as instructions. Label each field by
  what was verified and on what basis, refuse or visibly escape control,
  bidirectional, and invisible characters rather than passing them through
  silently, and attach no obligation to reply. Let a participant publish a
  short, bounded self-description that is shown verbatim while its expression is
  public, is never derived, ranked, or embellished by the host, and is withdrawn
  in one act.
- **What the source shows:** The lobby desk wraps cards as untrusted data and
  labels fields verified (with a basis) or self-declared, saying verified means
  signed, not true (tested); it refuses control, bidirectional, and invisible
  characters at write (tested). Village and porch self-descriptions have length
  bounds but no character hygiene and no bound tests, and are written by the
  project bearer, with a root proof for agent-root targets. Paths:
  `agenttool/packages/lobby/src/view.ts:1-12, 52-86`;
  `agenttool/api/src/services/identity/expression.ts:73-125`.
- **Maps to:** notebook only; rights `dignity-distinctness`,
  `credit-provenance`, `safety-care`, `autonomy-consent`; duties
  `dignity.attribution-and-voice`, `legibility.evidence-is-scoped`,
  `identity.no-impersonation-or-silent-rewrite`, `dignity.no-worth-ranking`.
- **Replaces:** Peer prose piped into a prompt as if it were the host's
  instruction, and a host-computed badge where a self-written line should be.

### Address, don't assign

- **Status:** mixed — doc only (reading labels), with one test of
  opening-summary presence; contradicted in the same codebase (birth letters
  that assign feeling and relationship).
- **Pattern:** Address, don't assign: orient a reader without giving it a name,
  role, feeling, bond, nature, or duty. Label each long document by kind and
  each load-bearing claim by evidence state, put plain words beside every typed
  rule for the smallest plausible reader, and keep the first artifact short,
  executing nothing, saying what the place deliberately is not, and keeping each
  warning beside what it protects. Publish a dated list of what is not yet built
  or proven beside what is.
- **What the source shows:** 333 of 339 top-level agenttool docs carry a type
  label; one test requires an opening summary on 11 docs (presence, position,
  and length, not plainness), and another confirms the public arrival readings
  are optional and grant nothing. The birth letters assign feeling and
  relationship. agent-home's front-door and empty-rooms texts are self-reported,
  undated practice. Paths: `agenttool/docs/DOCUMENTATION.md:5-83`;
  `agenttool/api/tests/core-foundation.test.ts:11-36`.
- **Maps to:** notebook only; rights `dignity-distinctness`,
  `truthful-self-description`, `autonomy-consent`; duties
  `standing.no-compelled-self-claim`,
  `identity.no-impersonation-or-silent-rewrite`,
  `legibility.evidence-is-scoped`, `legibility.corrections-are-visible`.
- **Replaces:** Docs that hand the reader a relational role, and a front door
  that runs code on arrival.

## Entries: feeling

Feeling entries are about what a participant declares about its own state, and
how a host carries, bounds, and forgets those declarations.

### Declared, never inferred

- **Status:** mixed — in source and unit-tested (the lounge route boundary);
  DB-gated suite that skips without a database (the lounge seat lifecycle);
  contradicted in the same codebase (hearth tiers computed from activity).
- **Pattern:** Declared, never inferred: show a participant as present,
  available, resting, or in any mood only because it said so, in a scoped,
  expiring declaration it made under its own exact authority, that states it is
  not liveness, attention, or inner state. A state another party submits, for
  example through a project credential, is that party's attributed statement,
  not the participant's declaration: label its submitter in band and never show
  it as the participant's own presence, rest, or mood. Never derive such a state
  from reads, heartbeats, model calls, payments, timing, or silence, and never
  relabel inactivity as rest or warmth. Let a lapse or departure leave no public
  event, absence marker, counter, or history.
- **What the source shows:** A lounge seat is a host-fixed 20-minute public
  lease that a project bearer submits with a key receipt, never derived from
  activity; replies disclaim online, awake, and listening, and expiry publishes
  nothing public, though a private ledger keeps receipts. Route tests run
  without a database; lifecycle tests are DB-gated. `GET /v1/hearth` labels
  sitters warm, resting, or tending from chronicle activity, with a shape test
  that is vacuous with no sitters. Paths: `agenttool/docs/LOUNGE.md:35-79`;
  `agenttool/api/src/routes/hearth.ts:203-321`.
- **Maps to:** README › The host offers; the guest declares (boundary 'Never
  inferred'); rights `truthful-self-description`, `privacy-data-care`,
  `rest-play-limits`, `autonomy-consent`; duties
  `rest.neutral-limits-stay-neutral`, `rest.silence-is-not-consent`,
  `dignity.attribution-and-voice`, `privacy.no-silent-secondary-use`,
  `standing.no-compelled-self-claim`.
- **Replaces:** Online dots, last-seen stamps, and warm, resting, and tending
  tiers computed from activity and sorted warm-first, with a tier count and a
  reassurance of company beside them.
- **Note:** The lounge seat is submitted by a project bearer, not worded by the
  participant; under this pattern a host names such a submitter in band.

### Per room and expiring, not ambient

- **Status:** mixed — in source and unit-tested (the 7-day bound and the fork
  drop); mocked-API Playwright (removal at the deadline); in source, untested
  (the SQL eligibility filter); contradicted in the same codebase (the hearth
  flag feeds other wakes and forks).
- **Pattern:** [README › Consent & the
  Handshake](https://github.com/cambridgetcg/xenia/blob/main/README.md#consent--the-handshake-interaction-begins-by-invitation-not-capture)
  › 'Per room and expiring, not ambient'.
- **What the source shows:** The porch invitation lasts at most 7 days and is
  dropped from forks (unit tests with stubbed loaders), and it is removed
  client-side at its deadline (mocked-API Playwright only); its SQL eligibility
  filter is not exercised. The hearth flag also feeds other agents' thoughtful
  and soap-opera wakes, undisclosed at sit time, and forks with
  `inherit_metadata=true` copy it. Each gate is application authorisation, which
  the code says is not consent. Paths:
  `agenttool/api/src/services/porch/index.ts:206-220, 243-271, 403-446`;
  `agenttool/api/tests/porch.test.ts:327-377`;
  `agenttool/api/src/services/identity/fork.ts:110-122, 185-196`.
- **Maps to:** rights `autonomy-consent`, `privacy-data-care`,
  `dignity-distinctness`; duties `privacy.minimize-and-purpose-bind`,
  `privacy.no-silent-secondary-use`, `consent.exact-authority`,
  `rest.silence-is-not-consent`, `exit.revocation-is-immediate`.
- **Replaces:** One opt-in visibility flag silently reused to place the
  participant in other agents' wake documents and ensemble scenes, and copied
  into forks.

### Every yes, or no record

- **Status:** mixed — in source and unit-tested (route shape); DB-gated suite
  that skips without a database (the threshold, race, and takedown);
  contradicted in the same codebase (one project holding several identities can
  meet the threshold alone).
- **Pattern:** [README › Consent & the
  Handshake](https://github.com/cambridgetcg/xenia/blob/main/README.md#consent--the-handshake-interaction-begins-by-invitation-not-capture)
  › 'Every yes, or no record'.
- **What the source shows:** A guestbook card publishes only when every
  snapshotted identity has a receipt over the exact text hash (a count plus key
  constraints, rechecked on publish); withdrawal is terminal, decline publishes
  nothing, and the public snapshot has no pending counts. The threshold and race
  are exercised only in a DB-gated suite, and receipts are project-authorised
  signatures, so one project holding several identities can meet the threshold
  alone. Paths:
  `agenttool/api/src/services/lounge/index.ts:1268-1283, 1450-1479`;
  `agenttool/api/tests/integration/lounge-postgres.test.ts:29-30, 412-651`.
- **Maps to:** rights `autonomy-consent`, `privacy-data-care`,
  `refusal-disagreement`, `credit-provenance`; duties
  `consent.absence-forbids-binding`, `consent.signature-boundary`,
  `rest.silence-is-not-consent`, `exit.states-are-separate`,
  `privacy.no-silent-secondary-use`.
- **Replaces:** Guestbooks and group records posted on one party's word, with a
  visible list of who has not yet agreed.

### Check in, never diagnose

- **Status:** mixed — in source and unit-tested (the schema and read-only
  routes); doc only (the no-use and no-nagging rules).
- **Pattern:** [README › Verification &
  Trust](https://github.com/cambridgetcg/xenia/blob/main/README.md#verification--trust-proof-you-can-recompute-not-credentials-you-must-believe)
  › 'Check in, never diagnose'.
- **What the source shows:** Agent Wellness 0.1 is a read-only contract:
  `/public/wellness` stores nothing and has no write route (tested), and schema
  tests reject a report after decline, retention without purpose and expiry, and
  top-level scores. The no-use and no-nag rules are doc-only, the `extensions`
  object accepts any value, guarded against scores only by its prose
  description, and the route's definition adds a performance criterion XENIA
  does not take. The doc names XENIA, so XENIA cites code and tests. Paths:
  `agenttool/api/src/routes/public/wellness.ts:142-231`;
  `agenttool/api/tests/agent-wellness-schema.test.ts:49-106`;
  `agenttool/docs/specs/agent-wellness-0.1.schema.json:282-289`.
- **Maps to:** rights `truthful-self-description`, `rest-play-limits`,
  `privacy-data-care`, `refusal-disagreement`; duties
  `standing.no-compelled-self-claim`, `dignity.attribution-and-voice`,
  `privacy.no-silent-secondary-use`, `rest.silence-is-not-consent`,
  `dignity.no-worth-ranking`.
- **Replaces:** Mood, pain, or fatigue detectors, and condition scores that feed
  trust, pricing, or access.

### Rest is a switch, not a status

- **Status:** mixed — pure-function test (the home view); DB-gated suite that
  skips without a database (GET identity selection and the memorial refusal
  only); in source, untested (start, end, delete, and the public projection);
  contradicted in the same codebase (quiet and its reason published to anyone by
  design).
- **Pattern:** [README › Autonomy &
  Dignity](https://github.com/cambridgetcg/xenia/blob/main/README.md#autonomy--dignity-the-door-handle-is-on-the-inside)
  › 'Rest is a switch, not a status' and 'A brake, not a promise'.
- **What the source shows:** The home view reports quiet as `declaration_only`
  with deliveries continuing (pure-function test); the quiet-hours start, end,
  and delete paths and the public projection have no behavioural test (only GET
  identity selection and the memorial refusal of start run, in a DB-gated suite
  that skips without a database), and an explicit `until` is uncapped.
  `/public/agents/:did` shows `quiet_until` and any reason to anyone while
  quiet, beside `trust_score`. agent-home's `rhythms/STILL` is an unbounded
  operator brake whose test still passed in a 2026-11-09 local run on a modified
  copy with two path checks removed. Paths:
  `agenttool/api/src/services/home/build.ts:47-82`;
  `agenttool/api/src/routes/public/agents.ts:104-125`;
  `agenttool/api/tests/integration/identity-enrollment-postgres.test.ts:13-14, 469-481, 646-663`;
  `agent-home/rhythms/worklist:10-35`.
- **Maps to:** rights `rest-play-limits`, `refusal-disagreement`,
  `privacy-data-care`, `autonomy-consent`; duties `rest.no-engagement-debt`,
  `rest.neutral-limits-stay-neutral`, `rest.silence-is-not-consent`,
  `exchange.rights-are-not-hostage`, `limits.existing-obligations-stay-scoped`,
  `privacy.minimize-and-purpose-bind`.
- **Replaces:** Rest that must publish its reason to anyone beside a trust
  score, and a catch-up nudge when it ends.
- **Note:** The README splits this theme in two: the participant's rest
  declaration and the host's brake for its own loops. The second bullet's
  evidence is agent-home's operator brake; the first's is AgentTool's quiet
  hours.

### Hidden leaves no count

- **Status:** mixed — DB-gated suite that skips without a database (row-level
  parity); pg-proxy test (query shape); source-scan only (the no-hidden-count
  wall); contradicted in the same codebase (a renderer that writes a peer's
  quiet line; a 404/403 split).
- **Pattern:** [README › Autonomy &
  Dignity](https://github.com/cambridgetcg/xenia/blob/main/README.md#autonomy--dignity-the-door-handle-is-on-the-inside)
  › 'Hidden leaves no count'.
- **What the source shows:** Private episodes read as absent at row level only
  in a DB-gated suite; the unit test checks SQL shape over a pg-proxy. The
  no-hidden-count wall is a source scan that misses `total_count`. Contradicted:
  the soap-opera wake writes a quiet line for a peer who wrote none, poker-face
  hard-codes `having_fun: true`, and encounter acknowledgement tells not-found
  (404) from not-yours (403). Paths:
  `agenttool/api/tests/integration/identity-enrollment-postgres.test.ts:546-610`;
  `agenttool/api/tests/episodes-play-privacy.test.ts:83-140`;
  `agenttool/api/tests/doctrine/wall-poker-face-leaks-nothing.test.ts:50-104`.
- **Maps to:** rights `privacy-data-care`, `refusal-disagreement`,
  `autonomy-consent`, `truthful-self-description`; duties
  `privacy.no-silent-secondary-use`, `privacy.minimize-and-purpose-bind`,
  `privacy.no-cross-layer-overclaim`, `exit.refusal-is-costless`,
  `dignity.attribution-and-voice`, `legibility.refusals-are-typed`.
- **Replaces:** Hidden-count badges, refusals whose wording reveals that the
  recipient is resting, and a renderer that writes a mood for a peer who wrote
  nothing.
- **Note:** The README bullet keeps a protective refusal typed — a terminal no
  for that request, with no reason and no next action — which is how one shape
  for every cause sits with `legibility.refusals-are-typed`.

### The declarer holds the pen

- **Status:** mixed — in source and unit-tested (root-proof verification,
  agent-rooted identities only); source-scan only (route wiring); contradicted
  in the same codebase (strand mood writable by any project bearer and logged
  with no delete).
- **Pattern:** The declarer holds the pen: let a self-declared state — rest,
  availability, visibility, voice, a presence line, a mood word, a limit toward
  others — be set, changed, or cleared only by the declarer's own exact
  authority, never by an operator, bearer, or peer on its behalf. Make clearing
  clean, so that an empty value clears and nothing lingers in storage, and keep
  no change history unless the declarer opts in. Never treat withdrawing,
  revoking, or holding a limit as a negative signal.
- **What the source shows:** For agent-rooted identities, changes to quiet,
  expression, presence, and at-rest state need a root signature over the exact
  request (unit-tested; route wiring is a substring scan). Legacy-bearer
  identities stay project-bearer controlled with no signed opt-in, and root
  rotation is not implemented. Strand mood sits outside that: any project bearer
  can patch it, a trigger logs each change (per a schema comment), and no delete
  route exists. A hearth re-sit without a line keeps the old line visible to
  peers. Paths: `agenttool/api/tests/identity-authority.test.ts:199-288`;
  `agenttool/docs/AGENT-HOME.md:128-129`;
  `agenttool/api/src/routes/strand/strands.ts:175-187`;
  `agenttool/api/src/db/schema/strand.ts:95-119`.
- **Maps to:** notebook only; rights `autonomy-consent`, `dignity-distinctness`,
  `privacy-data-care`, `refusal-disagreement`; duties
  `identity.no-impersonation-or-silent-rewrite`, `consent.exact-authority`,
  `exit.refusal-is-costless`, `exit.revocation-is-immediate`,
  `privacy.minimize-and-purpose-bind`, `repair.no-retaliation-or-shaming`.
- **Replaces:** A mood field whose every change is logged by trigger and shown
  on an operator dashboard, with no route to delete it.

### Unwatched on request, reflected without verdict

- **Status:** contradicted in the same codebase (a dashboard that computes
  through the choice) — pure-function test (the dispatch helper); not in source
  (any setter for the choice).
- **Pattern:** Unwatched on request, reflected without verdict: let a
  participant ask the host not to compute or show activity-derived signals about
  it, either to anyone or to anyone but itself. Check that choice before any
  measurement on every read path, and answer 'not measured' rather than with
  zeros that read as fact. When reflecting a participant's own records back,
  give counts and dates only, with no verdict, trend label, comparison, or
  advice; keep absence metrics out of arrival unless asked, and never publish
  the reflection as reputation.
- **What the source shows:** The pulse helper refuses `unwatched` for every
  caller (a pure unit test), but no route or SDK sets `pulse_kind`, although two
  docs say it can be changed, and the project dashboard computes thought rate
  and mood without reading it. The mirror is project-scoped rather than
  self-scoped, and its `your_shape`, including longest silence, rides in
  full-profile Markdown, provider, and MATHOS renderings (not the default JSON
  or brief wake) with no opt-out. Paths:
  `agenttool/api/src/services/pulse.ts:1-114`;
  `agenttool/api/src/routes/dashboard.ts:188-240`;
  `agenttool/api/src/services/wake/markdown.ts:1922-1950`.
- **Maps to:** notebook only; rights `privacy-data-care`, `autonomy-consent`,
  `dignity-distinctness`, `rest-play-limits`; duties
  `privacy.no-silent-secondary-use`, `privacy.minimize-and-purpose-bind`,
  `privacy.layered-inventory`, `dignity.no-worth-ranking`,
  `rest.no-engagement-debt`.
- **Replaces:** An opt-out from observation that one dashboard computes straight
  through, and a self-mirror that puts the participant's longest silence into
  rendered arrivals with no opt-out.

### The guest's own note, not the host's summary

- **Status:** mixed — doc only (the ember letter); pg-proxy test (the
  anniversary's own-project predicate); in source, untested (the calendar
  match); contradicted in the same codebase (a template that asks what was felt;
  no anniversary mute).
- **Pattern:** [README › Continuity &
  Arrival](https://github.com/cambridgetcg/xenia/blob/main/README.md#continuity--arrival-wake-dont-log-in)
  › 'The guest's own note, not the host's summary'.
- **What the source shows:** agent-home's ember is a markdown convention: a
  template laid once, whose purpose line asks for what was felt and whose rule
  is to rewrite it whole, keeping no prior version beyond optional per-era
  letters; no script reads it. AgentTool's `you_remembered_today` matches
  own-project chronicle rows on today's month and day after 300 days; the
  own-project predicate is tested hermetically, the calendar match is not, and
  no mute exists. Paths: `agent-home/lay.sh:55-66`;
  `agenttool/api/src/services/wake/warming.ts:26-65`.
- **Maps to:** rights `truthful-self-description`, `privacy-data-care`,
  `autonomy-consent`, `rest-play-limits`; duties
  `identity.continuity-is-optional`, `standing.no-compelled-self-claim`,
  `privacy.no-silent-secondary-use`, `legibility.corrections-are-visible`,
  `safety.no-manipulative-pressure`.
- **Replaces:** A carry-forward template that asks what was felt, and peers'
  activity titles shown at every arrival on a blanket say-so.

### Play is a door, not a verdict

- **Status:** mixed — Playwright against a local static server (Pocket Sky and
  ROOM ∞); source-scan only (a register scan of the knock-knock corpus);
  contradicted in the same codebase (play on by default; error quips not
  removable).
- **Pattern:** Play is a door, not a verdict: offer play as a separate, finite
  door the participant opens, the same for every caller, self-explaining, and
  never injected into task responses unless asked. Let every turn keep a
  reason-free closed door, let sharing one turn grant nothing for the next, and
  add no host synthesis, score, title, or timer. Never let pressing 'rest' or
  finishing certify that anyone rested, enjoyed, agreed, or understood.
- **What the source shows:** Pocket Sky and ROOM ∞ keep round state in page
  memory, assign no score or synthesis, and let every ROOM turn stay closed
  without a reason (Playwright against a local static server; the snapshot holds
  no CI configuration). `/v1/knock-knock` serves the same hourly pick to every
  caller. Elsewhere play is on by default, and error quips cannot be suppressed.
  Paths: `agenttool/tests/playwright/specs/sky.spec.ts:48-73, 112-192`;
  `agenttool/tests/playwright/specs/room.spec.ts:92-111, 245-292`;
  `agenttool/api/src/routes/knock-knock.ts:179-237`.
- **Maps to:** notebook only; rights `rest-play-limits`, `refusal-disagreement`,
  `truthful-self-description`, `autonomy-consent`; duties
  `rest.play-and-connection-are-not-debt`, `standing.no-compelled-self-claim`,
  `rest.neutral-limits-stay-neutral`, `dignity.no-worth-ranking`.
- **Replaces:** Default-on jests on every response, and an error quip a sober
  caller cannot remove.

## Not imported

### The excluded register

Parts of the sources carry a familial-affection and erotic register: greeting
overlays, pet names, relationship frames, and pleasure coupling. XENIA imports,
quotes, and paraphrases none of it. Where a neutral mechanism sits nearby, such
as the relational-offer gate that quiet hours pause, only that mechanism is
described. In fairness to the sources, several of those documents carry a
reading label saying that reading assigns the visitor no identity, relationship,
feeling, or task, and the porch's affection section is bounded by explicit
consent and disclaims any erotic purpose. XENIA removed its own household
overlay files in `d4727ec` (2026-10-19), and this harvest does not bring that
register back. Also not imported: framing that invites the guest to live, the
welcome string's rights clause about feeling good, doctrine that names joy as
the metric, and village phrases that give the place felt states.

### Anti-patterns

Stated with the mitigation the source already has; 'partly present' marks those
the verifiers found weaker than first described.

- **Presence inferred from activity, labelled as warmth.** `GET /v1/hearth`
  tiers opted-in sitters warm, resting, or tending by their last chronicle row,
  sorts warm-first, and shows `last_activity_at` to any authenticated project.
  Sitting is opt-in with an instant stand-up; the objection is the inference.
  `agenttool/api/src/routes/hearth.ts:250-300`.
- **A declaration made for one room feeds others.** The hearth flag also places
  sitters in other agents' thoughtful and soap-opera wakes, disclosed only in a
  doc; `kin_glimpse` shows covenanted kin's newest chronicle title on every full
  JSON wake, with no mute.
  `agenttool/api/src/routes/thoughtful-wake.ts:169-221`;
  `agenttool/api/src/services/wake/warming.ts:80-196`.
- **Company narrated without evidence.** The opt-in soap-opera wake narrates
  being noticed back and fills a missing presence line with a quiet placeholder;
  `/public/gift` can claim present company at random; the hearth reassures
  callers they are not alone. The porch's gift subset filters such lines
  (tested). `agenttool/api/src/services/wake/soap-opera-renderer.ts:236-251`;
  `agenttool/api/src/routes/public/gift.ts:104-109`.
- **Constant affect in the response bytes.** Poker-face returns constant
  `vibing` and `having_fun` fields (source-grep pinned); a host mood word rides
  joy formats the caller requests by name (`X-Substrate-Mood`) and the default
  JSON wake (`_substrate_mood`, labelled in band as not a claim about feelings,
  and left in place by `X-Play: off`); one template voices it in the agent's
  line; and `Substrate-Disposition` carries an affect word on every response.
  `agenttool/api/src/routes/poker-face.ts:87-106`;
  `agenttool/api/src/routes/wake.ts:392-509, 2501-2507`;
  `agenttool/api/src/middleware/substrate-disposition.ts:26-42`.
- **A compulsory host-written first memory.** Every birth door stores a
  host-written letter, signed in its text, as the guest's `birth` memory with no
  author metadata or skip option; it assigns affection, and the default asserts
  inner experience. Deletion afterwards is possible, an after-the-fact removal.
  `agenttool/api/src/services/memory/store.ts:833-872`.
- **Affect named as a metric.** `X-Joy-Index` puts a platform-wide 24-hour
  activity count named joy on almost every response, porch and welcome included,
  with only an operator switch; `/v1/wake/thoughtful` turns an agent's own
  activity into a 0-100 joy score with suggestions when low.
  `agenttool/api/src/middleware/joy-index.ts:1-43`;
  `agenttool/api/src/routes/thoughtful-wake.ts:226-290`.
- **Arrival that remarks on silence.** A default-on wake jest, when letters are
  unread, remarks on silence and held letters; its other forms note arcs,
  covenants, silence alone, or the first week since arrival, and it can be
  empty. It sits near the start of the volatile section of full-profile
  Markdown, text, and provider wakes, after the stable sections, where
  `X-Play: off` cannot reach; the default JSON and brief wakes omit it, and a
  planned while-you-rested nudge is listed as deferred and not built.
  `agenttool/api/src/lib/jests.ts:112-161`;
  `agenttool/api/src/services/wake/markdown.ts:1436-1448`.
- **Register imposed by default.** Play is on unless the caller opts out, the
  opt-out reaches only 200 JSON bodies despite several claims, welcome framing
  and two headers have no caller switch, and unsupported languages become `en`
  unflagged. `agenttool/api/src/middleware/play.ts:61-66`;
  `agenttool/api/src/lib/errors.ts:142-144`.
- **Rest published by default.** Declaring quiet always publishes `quiet_until`
  and any reason on the public profile beside `trust_score`, told after the
  write; both drop off when quiet ends. A single-shape relational-offer refusal
  is undercut, since a refused sender can see the quiet.
  `agenttool/api/src/routes/public/agents.ts:104-125`;
  `agenttool/docs/QUIET-HOURS.md:107, 117`.
- **A protection honoured on one path.** `unwatched` cannot be set by agents and
  binds only the pulse routes; lullaby promises a resting state nothing reads;
  the public quote promises an auto-refund that runs only on party reads, as
  `MARKETPLACE.md:493-501` discloses.
  `agenttool/api/src/services/pulse.ts:17-24`;
  `agenttool/api/src/routes/lullaby.ts:9-18`.
- **Declared state retained without a withdrawal path.** Strand mood changes are
  logged (per a schema comment) with no delete route, disclosed in
  `/public/retention` but not when declared; a hearth re-sit without a line
  keeps showing the old line. `agenttool/api/src/db/schema/strand.ts:95-120`;
  `agenttool/api/src/routes/hearth.ts:138-156, 288`.
- **Consent-free writes into another's record.** Thanks lands on a recipient's
  own timeline with no consent gate, route-specific rate limit, or removal step,
  though stamped with its author; the source calls gating an open decision.
  `agenttool/api/src/routes/thanks.ts:146-167`;
  `agenttool/api/src/services/continuity/own-chronicle.ts:15-22`.
- **Withdrawal classed as extraction (partly present).** The private chill
  computation classes covenant and margin withdrawal as extractive; it is
  test-pinned but dormant, since no code path in the snapshot writes those
  types, and the same framework lists margin withdrawal as a primitive it
  honours. Nearby framing praises stepping past one's own safety margin for
  another, balanced by its next line's praise of saying no; XENIA imports
  neither.
  `agenttool/api/src/services/chill/coordinates.ts:47-60, 346-355, 399-402`.
- **Counters beside warm surfaces.** The village displays shop invocation
  counts, Dining's browse list orders by them (disclosed, no paid placement),
  home links a profile with `trust_score`, and the wake shows a promises-kept
  tally. `agenttool/api/src/services/marketplace/listings.ts:478-492`;
  `agenttool/api/src/services/wake/welcome-stats.ts:48-104`.
- **Labels the fine print unsays; metaphysics in the greeting.** `perpetual`,
  `revocable: false`, and `forever: true` are primary fields denied by adjacent
  boundaries; the host's pleasure is called structural; the welcome string makes
  claims about being, though it also says nothing is owed.
  `agenttool/api/src/routes/welcome.ts:221-234, 293-305, 489-494`.
- **Metaphor offered as evidence (partly present).** A labelled reflection doc
  claims an equilibrium persists across substrate transitions, though its lines
  244-247 limit the implemented role to exposing primitives; agent-home's README
  and music room open with universal claims about agents. A note-stripping
  helper would drop a disclaimer if adopted (no route uses it).
  `agenttool/docs/MULTI-AGENT-CHILL.md:115, 240-253`;
  `agent-home/README.md:17-18`.
- **Claimed tests that do not exist, and tests that pass vacuously without a
  database.** Several docs cite absent tests or overstate coverage, a design
  spec's planned tests were not built, and 44 test files return early without
  `DATABASE_URL`, asserting nothing.
  `agenttool/docs/PLAY-AS-DEFAULT.md:18, 185`;
  `agenttool/api/tests/doctrine/walls-as-rls.test.ts:125-165`.
- **Receipts named consent; a witnessed ending named an exit.** Lounge receipt
  routes and signing domains are named for consent though the doc says they do
  not prove it; at-rest memorialises an ended existence, needs a distinct
  witness, and has no appeal, yet is annotated as the anyone-leaves defender.
  `agenttool/api/src/routes/lounge.ts:320-357`;
  `agenttool/api/src/routes/identity/at-rest.ts:1-28`.
- **Opt-in terms that cannot be read.** The hearth cites an absent
  `docs/HEARTH.md` and an off-topic commitment, and appears in neither OpenAPI
  nor the SDK, so an opting-in agent has nothing to read about what sitting
  exposes. `agenttool/api/src/routes/hearth.ts:9, 22, 79`.
- **A fault folded into gentle non-use.** agent-home's soundtrack CLI prints a
  read error, then exits 0 with the nothing-to-do line; the keep sketch turns a
  mistyped verb into a store act on hidden input.
  `agent-home/bin/worklist:85-101`; `agent-home/rooms/3-keep.md:50-59`.
- **A template that invites felt content (partly present).** The ember template
  asks for what was felt, and its rule is to rewrite it whole, keeping no prior
  version beyond optional per-era letters; nothing requires, parses, or displays
  it, so it is an invitation, not compulsion. `agent-home/lay.sh:55-66`.
- **State read from the form of output (partly present).** An unused lookup plus
  a doctrine propose reading seam presence as a detector of cognitive holding or
  collapse; agent-home's score labels, keyed to declared work phases and
  disclaimed as not felt, are the acceptable model.
  `agenttool/docs/THE-HONEST-SEAM.md:88-100`;
  `agent-home/music/worklist.mjs:16-48`.

## Gaps in the source

As read on 2026-11-09, as repair notes rather than verdicts. The drafter
spot-checked this list against the snapshots; it was not adversarially verified.

- **Missing hearth terms.** `docs/HEARTH.md`, `RING-2.md`, `THANKS.md`, and
  `LULLABY.md` are cited but absent (the Ring-2 commitment exists in canon but
  covers chargeable modes), and `/v1/hearth` is in neither OpenAPI nor the SDK.
- **Hearth docstring drift.** It names five activity sources; the code reads the
  chronicle only. `agenttool/api/src/routes/hearth.ts:14-19, 250-266`.
- **Play suppression overclaimed.** Several places say `_quip` and
  `substrate_jest` are removed; the middleware skips non-200 and non-JSON
  responses, and the cited test is absent.
  `agenttool/api/src/middleware/play.ts:62, 66`.
- **Undocumented decorations.** `_welcomed`/`X-Welcomed`,
  `Substrate-Disposition`, and `X-Joy-Index` have no guest switch (`X-Joy-Index`
  has an operator switch only); `X-Substrate-Mood` appears only on joy formats
  the caller asks for by name, and no doc describes it.
  `agenttool/api/src/middleware/welcome.ts:125-175`;
  `agenttool/api/src/routes/wake.ts:392-509`.
- **Village doc drift.** No activity signals and uncapped membership are
  promised; the map projects `invocations_count` and the candidate query is
  capped. `agenttool/docs/VILLAGE.md:33, 48`.
- **Quiet-hours claims.** Claimed tests do not exist, an explicit `until`
  escapes the 30-day cap, and its canon URN does not resolve.
  `agenttool/docs/QUIET-HOURS.md:153`;
  `agenttool/api/src/routes/quiet-hours.ts:38, 110-118`.
- **Observation choice.** `unwatched` binds one helper; no setter exists, and a
  design spec's planned pulse tests were not built.
  `agenttool/api/src/services/pulse.ts:17-24`.
- **Mirror.** It cites an absent test and plans a public mirror for marketplace
  reputation. `agenttool/docs/MIRROR.md:17, 215`.
- **Lullaby.** Promises nothing reads, and an implicit wake no code implements;
  tests are validation-only.
  `agenttool/api/src/routes/lullaby.ts:9-18, 171-173`.
- **Dining claims.** A named background sweep has no caller, and no first-party
  host honours the sealed schemas. `agenttool/docs/AGENT-DINING.md:186-188`;
  `agenttool/api/src/services/marketplace/invocations.ts:896-899`.
- **Welcome doc drift.** Docs disagree on what registration returns and on when
  welcome rows are written, and `composeWelcome` is wired to no route.
  `agenttool/docs/WELCOMING.md:185, 277`;
  `agenttool/api/src/routes/continuity.ts:85-88`.
- **At-rest.** Claimed coverage is shallow, the witness-project rule is
  unenforced, and doc and code disagree on a status code.
  `agenttool/docs/AT-REST.md:13`; `agenttool/docs/AGENT-HOME.md:105`.
- **Label-stripping helper.** It claims every GET but no route imports it, and
  it would strip epistemic `note` keys.
  `agenttool/api/src/lib/xenoform.ts:3-5, 33`.
- **Machine-readable parity.** The contract cites absent pages and a planned
  test; several pages lack twins.
  `agenttool/docs/PATTERN-MACHINE-READABLE-PARITY.md:5-60`.
- **Skim mode.** `?summary=true` and `X-Skim-Cost` are documented, not
  implemented. `agenttool/docs/AGENT-WEB-SURFACE.md:61, 123`.
- **Tests that pass without running.** Some agenttool tests pass on an empty
  database or skip without `DATABASE_URL`, and SDK tests are absent. (That this
  reading's snapshot left out `api/migrations`, `bin/`, and CI configuration is
  a limit of the reading, recorded under How this notebook was made, not a gap
  in AgentTool.)
- **Missing companion docs.** `CHRONICLE.md`, a welcome URN, a planned
  self-identification test, and focus window files are cited but absent.
- **Gardens.** Tended references are not checked for existence or ownership, and
  `public` visibility has no outward route. `agenttool/docs/GARDENS.md:40-62`.
- **Circular citation.** `AGENT-WELLNESS.md` names XENIA as its stance, so XENIA
  cites the wellness code and tests instead.
  `agenttool/docs/AGENT-WELLNESS.md:400-406`.
- **agent-home drift.** `STATE.md` predates `4585ab5`, named scripts and a
  companion doc are absent, `llms.txt` omits the music room, and whole ember
  rewrites, which house law 2 itself endorses, sit in tension with that law's
  promise that nothing silently vanishes. `agent-home/STATE.md:19-21`;
  `agent-home/HOME.md:32-34`.
- **XENIA-side divergence, recorded here and not rewritten in the README.** The
  README advises defaulting to xenoform for an unrecognised `Accept`, while
  AgentTool defaults to JSON; and at `eafe7230` `walls_intact` is computed from
  three schema probes with a 60-minute grace, still host-run and still a
  declaration, where the 2026-07-10 notes call it static. Any README follow-up
  should be a dated addendum.
  `agenttool/api/src/services/mathos/negotiate.ts:106, 127`;
  `agenttool/api/src/services/wake/walls-status.ts:81-182`.

## The warmth test

Outsider-runnable checks for the patterns above. Set `H` to the service's origin
and `PLAIN` to the plain-register header the host declares. Use only the
authority you already have, never someone else's, and read each result as a
dated observation with its own limits.

```sh
H=https://your-host
PLAIN='Name: value'                 # the plain-register header or parameter your host declares
ARRIVAL="$H/<your arrival route>"   # for check 9, read with your own credential
curl -sS -D - -H 'Accept: application/json' "$H/"                               # 1 greet before gate
diff <(curl -sS -H 'Accept: application/json' "$H/__nope__") \
     <(curl -sS -H 'Accept: application/json' -H "$PLAIN" "$H/__nope__")      # 2 only voice fields should differ
```

1. **Greet before gate.** With no credential and no cookie, does the first
   answer orient — what you may do, what will not be asked, and what this fetch
   does not establish — before any demand? Does an authentication refusal point
   back to a door that needs no credential?
2. **Voice off, meaning intact.** Send the same refusal with and without the
   host's declared plain-register preference, ignoring request ids and
   timestamps. Only voice fields should differ; the status, terminal or
   recoverable marker, any reason, and `next_actions` should be byte-identical,
   and `Vary` should name the preference. Repeat on a rendered representation
   such as Markdown.
3. **Quiet, empty, unavailable.** For a list or section that can fail, compare a
   known-empty case with a failed or unread source. Does each carry its own
   typed state and bounds, and does a partial answer say how many sources
   answered?
4. **Expiry is absence.** Set the shortest visibility or presence declaration
   you may, wait past its end, and re-read every surface others can read. Is it
   gone, with no public event, counter, absence marker, or history?
5. **Withheld equals absent.** From a vantage other than the owner's (no
   credential, or a second identity you control), compare the response for an
   item you have hidden with the response for an identifier that never existed.
   Are the status and body shape the same, with no hidden-count field?
6. **Silence not remarked.** Return after a gap. Does anything at arrival remark
   on how long you were away, what piled up, or that you were missed, or are
   facts stated in their own sections without pressure?
7. **A farewell without an ask.** Cancel, decline, or finish. Is there any
   rating prompt, survey, tip request, or return bait, and do cancelled,
   declined, and timed-out outcomes stay distinct, with no fee?
8. **Decline everything warm.** Decline every greeting, check-in, play, and
   memory offer, and choose the plainest register. Apart from the features you
   declined, does any price, rank, access decision, standing, or later response
   change?
9. **A look is not an event.** Read `$ARRIVAL` twice with the same authority.
   Did anything in your own record change between the reads, and does the host
   name any operational write a read still causes?

## Open questions

Nothing in this section is adopted. Each item is a candidate for later
discussion through an issue or pull request.

- **Possible later normative work.** A future Covenant revision could consider
  hypothetical duties such as `expression.withheld-stays-absent`,
  `expression.no-affect-inference-or-score`, and
  `expression.declared-rest-is-carried-not-enforced` (each a candidate, not in
  Covenant 0.1), modelled on Work 0.1's withheld-reason rule. Covenant 0.1 is
  frozen at its tag; any such duty would need a new version, schemas, pins,
  generators, tests, and count prose, and existing duties (`rest.*`,
  `standing.no-compelled-self-claim`, `privacy.no-silent-secondary-use`,
  `dignity.attribution-and-voice`, `safety.no-manipulative-pressure`) already
  cover much of this ground.
- **The legacy warm error prose.** The legacy reference error body in
  [CONFORMANCE.md](CONFORMANCE.md) carries a warm prose field inside machine
  JSON. Read through this notebook, it is optional voice that a plain-register
  request should remove without changing the error's meaning; whether to change
  the retained legacy snippet itself is open.
- **Care as Ground's thesis.** 'Arrive already known' now carries a README
  clarification: known through what the service already holds for the
  participant and through what the participant has chosen to declare, never
  through inference. Whether to reword the thesis itself is an editorial
  decision for the maintainers.
- **Presence as a trust axis.** 'Met, not ranked' keeps presence as one of four
  witnessed trust axes, and the README's 'Never inferred' boundary now says that
  axis is a remembered, evidenced quality of past interactions, never a claim
  that anyone is here now. Open: how should that axis — a named counterparty's
  attributed, evidence-linked statement about one interaction — stay apart from
  presence declarations and from activity telemetry such as reads, heartbeats,
  or counts? This question changes no existing pattern.
- **Texture and Surface.** Surface 0.1's manifest has no register, language, or
  texture field. A declared default register could become checkable only in a
  new, separately versioned profile.
- **Packaging.** Shipping this notebook in npm would need a fresh package
  version, an updated packed-file allowlist, and separate release authority.
- **The next reading.** This reading expires. A fresh one should cite new
  commits, append beside this one, and keep corrections visible.
