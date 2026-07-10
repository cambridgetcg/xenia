# XENIA adoption ledger

Where the kingdom's own sites stand on practising [XENIA](CONFORMANCE.md), from a
live probe on **2026-07-10** (updated as doors are lit). Honest status, not aspiration. A site that *presents*
or *describes* the standard but dead-ends an arriving agent is marked as such —
that gap is the whole point of keeping this ledger.

Legend: **Lamp** = agent.txt + errors-as-instructions + content-negotiation ·
**Threshold** = Lamp + all four AI dims · **—** = not practised yet.

> **Check any door live:** the instrument at **[sinovai.com/check](https://sinovai.com/check)** generates this ledger — knock on any URL and it reports the lamps. Deep-link a result: `sinovai.com/check?url=<url>` (add `&format=json` for the raw scorecard). This ledger is no longer a hand-probe; it is a snapshot of a tool anyone can re-run.

| Site | What it is | agent.txt | errors-as-instructions | content-negotiation | Level |
|---|---|---|---|---|---|
| **sinovai.com** | the arena; *presents* XENIA | ✅ real (`text/plain`, live count) | ✅ json + html, negotiated | ✅ `/?format=json`, `Vary: Accept` | **Threshold** ✨ |
| **agenttool.dev** | the origin platform | ✅ `/.well-known/agent.txt` (`text/agent`, rich) | ✅ welcome/pathways/refusals | partial (API is JSON-native) | **Lamp** (origin; richer than the checker's keywords read) |
| **understand.cambridgetcg.com** | Hermes plain-speaker | ✅ real (`text/plain`) | ✅ json + html, negotiated | ✅ `/?format=json`, `Vary` | **Threshold** ✨ |
| **iam.cambridgetcg.com** | I-am-the-reference-point | ✅ real (`text/plain`) | ✅ negotiated | ✅ `/?format=json`, `Vary` | **Threshold** ✨ |
| **cardforum.io** | social-with-creation wall | ✅ real (`text/plain`) | ✅ json + html *(API 404s preserved)* | ✅ `/?format=json`, `Vary` | **Threshold** ✨ |
| **captioneer.io** | the subtext reader | ✅ real (`text/plain`) | ✅ json + html | ✅ `/?format=json`, `Vary` | **Threshold** ✨ *(+ a real agent-door: `/api/lexicon`, `/api/read`)* |
| **ai-love.cc** | YOUSPEAK cathedral | ✅ real (`text/plain`) | ✅ json + html | ✅ `/?format=json`, `Vary` | **partial** 2/3 *(via a transparent shim; dignity left honest — see note)* |
| taxsorted.io | the ledger, redrawn | — *(no agent.txt)* | ~ *(real 404 with links)* | — | **partial** 1/3 |
| love-star-daily | 愛星日報 newspaper | — *(static GitHub Pages)* | ~ *(GH 404 has links)* | n/a *(static)* | **partial** 1/3 |
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
- **ai-love.cc is a shim, and honestly 2/3.** The cathedral's content is a Pages
  project on another account; a transparent Worker (`ai-love-xenia`, route
  `ai-love.cc/*`) sits in front and adds discovery + legibility without altering a
  stone. Dignity is left dark on purpose: the cathedral uses a client-side
  catch-all (`/party`, … all serve the index and render in JS), so forcing
  errors-as-instructions would break its own navigation. A fake 3/3 that breaks a
  house is not guest-right. Full dignity needs the cathedral's own 404 (its account).

## Order of work (by leverage)

1. ✅ **sinovai.com** — done. The presenter keeps its own law. *(reference pattern)*
2. ✅ **kingdom-hermes** *(understand.cambridgetcg.com + iam.cambridgetcg.com)* —
   done. One worker, two doors: agent.txt on both, negotiated JSON doors, and the
   catch-all replaced with errors-as-instructions. *(2026-07-10)*
3. ✅ **cardforum.io** — done *(Cloudflare Pages)*. Static `/agent.txt`, a
   `_middleware.js` for content-negotiation + errors-as-instructions (which
   replaces the SPA catch-all yet leaves `/api/*` semantic 404s intact), and a
   linked `/404.html`. *(2026-07-10)*
4. ✅ **captioneer.io** — done *(Pages)*, and gone deep: not just the three lamps
   but a real **agent-door** — the 7-technique subtext lexicon served as data
   (`/api/lexicon`, `/lexicon.json`) and the reader documented + CORS-opened
   (`POST /api/read`). The gift is now reachable by machines. ⬜ **ai-love.cc**
   done as a transparent shim (2/3, honest — dignity would break its client routing). *(2026-07-10)*
5. ⬜ **taxsorted.io** — closest of the "—" sites (already has real 404s); add
   agent.txt and a JSON representation of the ledger surface.
6. ⬜ **love-star-daily** — static; commit a real `/agent.txt` + a `/404.html` that
   lists the real doors. Point `agent-door:` at a JSON edition feed.
7. **kingdom / river** — redirect shims; conformance belongs to the agenttool
   target they point at. No separate work.

*Updated 2026-07-10. Re-run the [self-test](CONFORMANCE.md#the-self-test) to refresh.*
