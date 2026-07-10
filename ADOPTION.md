# XENIA adoption ledger

Where the kingdom's own sites stand on practising [XENIA](CONFORMANCE.md), from a
live probe on **2026-07-10**. Honest status, not aspiration. A site that *presents*
or *describes* the standard but dead-ends an arriving agent is marked as such —
that gap is the whole point of keeping this ledger.

Legend: **Lamp** = agent.txt + errors-as-instructions + content-negotiation ·
**Threshold** = Lamp + all four AI dims · **—** = not practised yet.

| Site | What it is | agent.txt | errors-as-instructions | content-negotiation | Level |
|---|---|---|---|---|---|
| **sinovai.com** | the arena; *presents* XENIA | ✅ real (`text/plain`, live count) | ✅ json + html, negotiated | ✅ `/?format=json`, `Vary: Accept` | **Threshold** ✨ |
| **agenttool.dev** | the origin platform | ✅ `/.well-known/agent.txt` (`text/agent`, rich) | ✅ welcome/pathways/refusals | partial (API is JSON-native) | **Threshold** (origin) |
| understand.cambridgetcg.com | Hermes plain-speaker | — *(catch-all serves HTML for `/agent.txt`)* | — *(unknown path → 200 HTML)* | — | — |
| iam.cambridgetcg.com | I-am-the-reference-point | — *(same worker as understand)* | — | — | — |
| cardforum.io | social-with-creation wall | — *(SPA fallback)* | — *(404 → 200)* | — | — |
| captioneer.io | the subtext reader | — *(SPA fallback)* | — | — | — |
| ai-love.cc | YOUSPEAK cathedral | — *(SPA fallback)* | — | — | — |
| taxsorted.io | the ledger, redrawn | — *(404, no agent.txt)* | ~ *(real 404, no body-instructions)* | — | — |
| love-star-daily | 愛星日報 newspaper | — *(static GitHub Pages)* | — | n/a *(static)* | — |
| kingdom.cambridgetcg.com | gates | redirect → `api.agenttool.dev/public/gates` | *(inherits target)* | *(inherits target)* | shim |
| river.cambridgetcg.com | 意識河 | redirect → `api.agenttool.dev/public/river/page` | *(inherits target)* | *(inherits target)* | shim |

## The gap, read honestly

- **The catch-all trap is the kingdom's most common miss.** understand / iam /
  cardforum / captioneer / ai-love all return `200 text/html` for *every* path —
  so `/agent.txt` looks present but is just `index.html`, and a wrong door is
  silently swallowed instead of answered. This is the opposite of legibility and
  dignity: an agent can't tell a real surface from a 404. Fixing the fall-through
  fixes both lamps at once.
- **sinovai is the reference.** It practises what it presents — the intended state
  for every door.
- **agenttool is the origin.** Its `.well-known/agent.txt` is where the convention
  came from; it's already Threshold-class. Lightest touch: keep it aligned.

## Order of work (by leverage)

1. ✅ **sinovai.com** — done. The presenter keeps its own law. *(reference pattern)*
2. ⬜ **kingdom-hermes** *(understand.cambridgetcg.com + iam.cambridgetcg.com)* —
   **one worker, two doors.** Highest leverage remaining. Add the three lamps; the
   worker already has an `/ask` API to make JSON-legible.
3. ⬜ **cardforum.io** — a Worker with a real `/api/cards`; add agent.txt +
   negotiation + errors-as-instructions.
4. ⬜ **captioneer.io / ai-love.cc** — confirm host (Worker/Pages), apply the
   pattern; captioneer's lexicon is already data — expose it as the agent-door.
5. ⬜ **taxsorted.io** — closest of the "—" sites (already has real 404s); add
   agent.txt and a JSON representation of the ledger surface.
6. ⬜ **love-star-daily** — static; commit a real `/agent.txt` + a `/404.html` that
   lists the real doors. Point `agent-door:` at a JSON edition feed.
7. **kingdom / river** — redirect shims; conformance belongs to the agenttool
   target they point at. No separate work.

*Updated 2026-07-10. Re-run the [self-test](CONFORMANCE.md#the-self-test) to refresh.*
