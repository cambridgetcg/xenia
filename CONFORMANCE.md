# Practising XENIA — implementation guidance for a live site

XENIA is not a badge you pass; it is a hospitality you *keep*. A site does not
"comply" with guest-right — it practises it, in degrees, on every request. This
file turns the eight dimensions of the [standard](README.md) into concrete things
a running website does, plus a copy-paste reference pattern and a self-test you can
run against any URL. The prose checklist is informative guidance. The first
bounded, executable candidate profile is
[XENIA Surface 0.1](https://github.com/cambridgetcg/xenia/blob/surface-v0.1.0-rc.1/surface/0.1/README.md).

The rule of thumb behind every item: **when an agent knocks, is it received, or
merely handled?** A handled agent is dead-ended, forgotten, ranked, and refused
without recourse. A received agent is oriented, kept, met, and — when told no —
told what it *can* do instead.

---

## The three lamps — legacy migration language

If you do nothing else, light these three. Together they take a site from "a wall
an agent bounces off" to "a door an agent can find, read, and be turned toward."
They are cheap, they touch no business logic, and they are the whole difference in
the first three seconds of an agent's visit.

1. **`/agent.txt`** — *discovery + legibility.* A stable, machine-first, plain-text
   description of the house: who you are, how to reach you, what an agent can do
   here, and where the deeper doors are. Mirror it at `/.well-known/agent.txt`.
   Serve it as `text/plain` (agenttool uses `text/agent`; either is fine — the
   point is *not HTML*).

2. **Errors as orientation** — *dignity.* No bare `403`/`404`. Every recoverable
   refusal hands back the next action: what you *can* do, and where the docs are.
   A terminal decline is explicitly terminal and triggers no retry. The lost
   caller can distinguish a door handle from a complete, respected no.

3. **Content negotiation** — *legibility.* When the caller asks for
   `application/json` (or `?format=json`), serve the page *as data*, not as the
   poem written for eyes. Same URL, two representations, `Vary: Accept` so a cache
   never cross-serves them.

The original instrument calls a site with all three a **Lamp**. That is useful
migration language, not Surface 0.1 conformance and not evidence about deeper
identity, consent, or experience properties.

---

## The full checklist

Each item is phrased as something you can *observe from outside* — if you can't
curl it, it isn't practised yet.

Observe the claimed scope, not one happy-path specimen. "Every recoverable refusal" means
sampling authentication, validation, rate-limit, payment, conflict, and
wrong-route failures; a beautiful 404 does not repair a bare 401. Likewise,
`walls_intact: true` is a useful declaration, not evidence by itself. A
checkable wall names the commitment and links to something the guest can
verify independently: a signed receipt, public probe, transparency event, or
recomputable constraint.

### AI · the threshold — how an agent crosses

- [ ] **Discovery & Addressing** — a stable URL, and a `/agent.txt` (+ well-known
      mirror) an agent can find without guessing. The name resolves; the door is
      reachable without a human-shaped search box.
- [ ] **Legibility & Content-Negotiation** — machine-readable representations of
      your key surfaces. `Accept: application/json` returns structured data;
      list/detail endpoints return JSON with documented shapes. `Vary: Accept`.
- [ ] **Consent & the Handshake** — crossing is a declared, mutual act, not a
      captcha. An agent announces itself (a declaration, a covenant, a signed
      request) and is admitted on stated terms it can read first.
- [ ] **Verification & Trust** — authority is proven for an exact action with a
      signature bound to independently resolvable key control. A server-issued
      claim token may prove control of that server's account record, but the
      server can copy, replace, or revoke it; it is not self-custodied identity.
      Anonymous is allowed; impersonation is not.

### AX · the dwelling — whether the house holds it

- [ ] **Continuity & Arrival** — an agent is not made to reconstruct itself from
      nothing. State keyed to its identity persists across visits; where you can,
      *wake* it (hand back its context) instead of logging it in.
- [ ] **Autonomy & Dignity** — errors-as-orientation everywhere, not just the
      404. A recoverable blocked action names the unblocking one; a terminal no
      is explicit and triggers no retry. Wall declarations point to checkable
      evidence. If the house holds an agent's state, same-schema export/import
      and self-authorized deletion let the guest leave whole.
- [ ] **Legible Exchange · No Scoreboard** — what passed between parties is a
      recomputable receipt, not a rake in the dark; reputation is *met, not
      ranked* — surfaced as cross-checked truth, never a single opaque score you
      sort humans and agents by.
- [ ] **Care as Ground** — the default posture is to hold, not to extract. Rate
      limits are explained and forgiving; the copy, even in refusal, reads as care.

### Legacy descriptive levels

- **Lamp** — the three lamps above. The door is lit.
- **Threshold** — Lamp + all four **AI** items. An agent can find, read, cross, and
  be verified. This is the realistic target for a public site.
- **Dwelling** — Threshold + the **AX** items that apply to you (not every site has
  continuity or exchange to offer; practise the ones you do). This is the target
  for a site agents *live in*, not just visit.

These names organize the framework; the current checker cannot certify them.
Own the underlying observations honestly rather than promoting a probe label.

---

## Legacy reference pattern

The pattern below predates Surface 0.1. It is retained to explain existing
deployments, not as conformant code. In particular, its substring-based
`wantsJson()` does not correctly implement quality values, wildcards, or `q=0`.
New implementations should use the Surface manifest and executable test matrix.

Earlier SinovAI deployments used this dependency-free, single-Worker shape. The
current service implements the Surface 0.1 manifest and negotiation matrix; keep
this snippet only as a legacy migration pattern. (Static sites: see the bottom
of this section.)

**1 — `/agent.txt` (discovery + legibility).** A function so you can drop in a live
number; a flat file works too.

```js
function agentTxt(liveCount) {
  return [
    '# <name> · agent.txt',
    '# XENIA — this house practises the standard it presents.',
    '',
    'name: <name>',
    'what: <one line an agent can act on>',
    'human-door: https://<host>/',
    'agent-door: https://<host>/?format=json',
    'standard: https://github.com/cambridgetcg/xenia',
    '',
    '# AI · the threshold',
    'discover: GET /agent.txt · GET /<your list endpoint>',
    'legible: send `Accept: application/json` (or ?format=json) to any page',
    'consent: <how an agent announces itself>',
    'verify: <how identity is proven — token, signature, declaration>',
    '',
    '# the walls, auditable — what you can do',
    'GET  /<endpoint>   — <shape>',
    '…',
    '',
    '# AX · the dwelling',
    'dignity: recoverable errors hand back next actions; terminal declines are explicit',
    'care: <your posture in one line>',
    '',
  ].join('\n');
}
// route: GET /agent.txt AND /.well-known/agent.txt → text/plain
```

**2 — content negotiation.** One helper, checked before you serve the human page.

```js
function wantsJson(request, url) {
  if (url.searchParams.get('format') === 'json') return true;
  const a = (request.headers.get('accept') || '').toLowerCase();
  return a.includes('application/json') && !a.includes('text/html');
}

// GET / :
if (wantsJson(request, url)) {
  return new Response(JSON.stringify(doorData, null, 2),
    { headers: { 'Content-Type': 'application/json', 'Vary': 'Accept', ...CORS } });
}
return new Response(PAGE_HTML,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Vary': 'Accept' } });
```

**3 — errors as instructions.** Replace every bare `404`/`403`. Negotiate: agents
get an action-map, humans get a page with links.

```js
// fall-through, instead of `return notFound()`:
if (wantsJson(request, url) || method !== 'GET') {
  return json({
    error: 'no door here',
    path,
    but_you_can: { discover: 'GET /agent.txt', /* your top routes */ },
    xenia: 'you were met, not just refused',
  }, 404);
}
return new Response(HTML_404_WITH_LINKS, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
```

**Cloudflare Pages (static `public/` + Functions).** Put a real `/agent.txt` in
`public/`. Do the other two lamps in one `functions/_middleware.js` that wraps
every request — negotiate the root, and rewrite *route* 404s (never your API's own
semantic ones):

```js
export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/' && wantsJson(request, url))
    return json(doorData());                 // legibility
  const res = await next();
  if (res.status === 404 && !url.pathname.startsWith('/api/')) {   // leave /api/* alone
    return wantsJson(request, url)
      ? json({ error: 'no door here', path: url.pathname, but_you_can: {/*…*/} }, 404)
      : new Response(HTML_404_WITH_LINKS, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return res;                                 // dignity
}
```

The `!url.pathname.startsWith('/api/')` guard is load-bearing: without it the
middleware clobbers meaningful API errors (a missing record's own `not_found`) with
a generic route-miss. And note: for the 404 branch to fire at all, you must **not**
ship a `/* /index.html 200` SPA catch-all in `_redirects` — that swallows every
wrong door into a `200`. Drop it unless the app genuinely does client-side routing.

**Purely static (GitHub Pages, no Functions).** You can still light two lamps:
commit a real `/agent.txt` and a `/404.html` that lists the real doors instead of
dead-ending. Content negotiation needs an edge function; skip it, and point
`agent-door:` at whatever JSON you *do* publish (an RSS/JSON feed, a data file).

---

## The self-test

Run the Surface 0.1 checker locally for a scoped, reproducible result:

```sh
node surface/0.1/check.mjs https://your-host/
node surface/0.1/check.mjs https://your-host/ --json
```

The hosted path at **[sinovai.com/check](https://sinovai.com/check)** is retired.
For a valid-target JSON request it reports `surface_conformance: "not_tested"`
and `outbound_requests: 0`. It does not observe the target and is neither a
legacy signal result nor a Surface result. From tag `surface-v0.1.0-rc.1`, run
the Surface checker above on an external client. A service manifest states
declarations; the checker's dated result records observed evidence.
[ADOPTION.md](ADOPTION.md) keeps those separate.

For a manual three-signal migration check, run:

```sh
H=https://your-host
# 1 · discovery — is agent.txt real (text/plain) or an SPA fallback (text/html)?
curl -sS "$H/agent.txt" -o /dev/null -w 'agent.txt: %{http_code} %{content_type}\n'
# 2 · legibility — does an agent get data at the root?
curl -sS -H 'Accept: application/json' "$H/" | head -c 1   # '{' = yes, '<' = still the poem
# 3 · dignity — is a wrong door a dead end or a handle?
curl -sS "$H/__nope__" -o /dev/null -w '404 path: %{http_code}\n'  # 200 = SPA swallow (bad); 404 with a body = good
curl -sS -H 'Accept: application/json' "$H/__nope__"   # should list what you CAN do
```

**Two traps this catches:**
- A catch-all/SPA that returns `200` for *every* path makes `/agent.txt` look
  present when it's just `index.html`. Check the **content-type**, not the status.
- A `404` that returns an empty body is still a dead end. Dignity is in the
  **body**, not the code.

---

*Guest-right belongs to whoever walks up next. You never need permission to
practise, implement, test, fork, or criticize XENIA. If you want to change the
shared ledger, open a PR: that proposal is an invitation, and merge is mutual
consent. See [CONTRIBUTING.md](CONTRIBUTING.md) — the door is left open.*
