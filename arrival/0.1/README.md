<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# XENIA Arrival 0.1

Status: **development draft**

- Written by one author. No second implementation exists.
- No host is known to serve either document.
- The [example](examples/two-visits.json) and the cases in
  [fixtures/cases.json](fixtures/cases.json) were written by hand.
- [check.mjs](check.mjs) is the only checker. Its
  [tests](../../tests/arrival-0.1.test.mjs) run it over the example and every
  case, and they agree. The same author wrote the checker, the cases and their
  expected outcomes, so that agreement is not independent evidence.
- This directory is outside the npm package, its exports, the agent-first kit,
  and the `normative_profiles` list in [spec.json](../../spec.json). Its
  schema identifiers are development URNs, not release identities.

Arrival 0.1 describes two documents a host can serve to an arriving agent, and
a way to record two visits so the pair can be checked offline:

- an **orientation**, answered to anyone with no credential: what this place
  is, where its private view lives, and what a read does;
- a **continuity view**, answered when a credential is presented: a bounded
  account of what the host holds under that credential.

Nothing here is normative. This text says what the schemas permit and what a
check of a recorded fixture compares. It places no requirement on any host.

## Where the rules come from

| Rule | Source |
|---|---|
| 1, 5 | [AGENT-FEEDBACK.md](../../AGENT-FEEDBACK.md), the 2026-07-11 report, "What I would change first", item 5 |
| 2, 6 | root [README.md](../../README.md), Continuity & Arrival: "A look, not an event" (2) and "A welcome, not a work order" (2, 6) |
| 3 | [WEBSITE-ROLLOUT.md](../../WEBSITE-ROLLOUT.md), website integration gates 2 and 3 |
| 4 | the same list, gate 1 |
| 7 | [AGENTS.md](../../AGENTS.md): report evidence, claims, and unknowns separately; the same list, gate 4 |

The root README calls this arrival a wake. This draft does not use the word:
the 2026-07-11 report says it has stood for both a public orientation and an
authenticated read. The shapes, the state `withheld`, the two problem codes,
and the choice that a cursor annotates a full view are this draft's own. No
text or code from any host was copied into this directory.

## The seven rules

1. **Two addresses.** The orientation answers anyone. The view address answers
   a request with no credential by refusing: a
   [Surface 0.1 problem](../../surface/0.1/problem.schema.json) with code
   `credential_required` whose first next action is the orientation. It does
   not answer with a smaller view.
2. **A read is not an event.** Each document declares what a read writes. The
   declarations agree, and say `none` for the participant's record. An item
   shown and not acknowledged is shown again unchanged on the next read, or
   the change is named, whatever caused it.
3. **Quiet, partial, unavailable and withheld are different.** Each section
   says which it is, with its count and limit. A section that could not be
   read, or is not shown, has a null count, never 0. A section listed on one
   read is listed on the next.
4. **The caller keeps the cursor.** The view hands back a cursor. Presenting
   it returns the full view again, plus a list naming what differs. A cursor
   the host does not accept is refused with a Surface problem with code
   `cursor_not_accepted` and a next action back to the view. It is never
   answered with a view.
5. **Every document is dated.** `as_of` says when it was made. `valid_until`
   says until when the host stands by it. Neither is compared with a request
   time: a document past `valid_until` when requested still passes.
6. **Reading creates no obligation.** No reply is expected. Recorded
   obligations sit in exactly one section of that kind; `owed_to` and `due_at`
   are set nowhere else.
7. **Each document says what it does not establish.**

A field whose presence is itself a rule (`as_of`, `valid_until`,
`read_effects`, `reply_expected`, `read_creates_obligation`) can be `null`,
meaning not stated, and `not_established` can be empty. The document stays
schema-valid; only that rule is unmet.

## The two documents

Hrefs are absolute, as in Surface 0.1, and can carry a query.

**Orientation** ([orientation.schema.json](orientation.schema.json)): `as_of`,
`valid_until`, `audience: {basis: "anyone"}`, `place: {name, summary,
manifest|null}`, `view: {href, credential_kinds, cursor_parameter|null,
read_effects}`, `reply_expected`, `not_established`. It has no field about the
caller.

**View** ([view.schema.json](view.schema.json)): `as_of`, `valid_until`,
`audience: {basis: "credential_presented", scope, record_set_ref|null}`,
`basis: {kind: "full"|"since_cursor", cursor|null}`, `cursor|null`, `changes`,
`sections`, `read_effects: {participant_record_writes:
"none"|"some"|"unknown", operational_writes}`, `acknowledgement` (`null` or
`{href, position|null}`), `reply_expected`, `read_creates_obligation`,
`not_established`.

A **section** is `{id, title, kind: "recorded_obligations"|"other", scope:
"identity"|"project"|"mixed"|"unknown"}` plus the envelope `{state, count,
limit, items, dropped, unavailable, withheld}`. `changes` is `null`, or the
same envelope holding `{section_id, item_id, change:
"added"|"changed"|"ended"|"out_of_window"}`. An **item** has one shape: `{id,
summary, recorded_at|null, acknowledged_at|null, ref|null, owed_to|null,
due_at|null}`.

`changes` is a net list: what differs between what the two reads show, not
the events between them. `position` says how far acknowledgements under the
credential have reached, and moves only when one is made.

### States

| State | Items | Count | Other envelope fields |
|---|---|---|---|
| `ok` | 1 to `limit` | `items.length` | all null |
| `quiet` | none | 0 | all null |
| `partial` | 0 to `limit` | see below | `dropped: {count\|null, reason, deeper_read\|null}` |
| `unavailable` | none | null | `unavailable: {code}` |
| `withheld` | none | null | `withheld: {code}` |

In a `partial` envelope, a numeric `dropped.count` makes the count an exact
total, `items.length + dropped.count`. A null one leaves the count null or a
floor above `items.length`. With reason `limit`, `items.length` is `limit`.

A view that breaks this table is still schema-valid; agreement with it is the
check `R3.STATES`.

### Bounds

| What | Bound |
|---|---|
| sections; `operational_writes` | 1 to 16; 0 to 8 entries |
| envelope `limit`; items listed | 1 to 32; 0 to 32 |
| `summary`, `place.summary` | 1 to 300 characters |
| `title`, `place.name`, `owed_to`, each operational write | 1 to 120 characters |
| cursor; href | 1 to 1024; up to 2048 characters |
| fixture file | 262,144 bytes |
| view; orientation | 65,536; 8,192 bytes |

The last row measures a body written again as UTF-8 JSON with no white space
and no optional escape, not bytes on the wire. No schema states it.

### What `not_established` means

It holds tokens. A view that lists a token says it does not establish:

- `reader_sameness`: that whoever reads now made any earlier read;
- `identity_beyond_credential`: who presented the credential, beyond that the
  host accepted it;
- `completeness_beyond_bounds`: that nothing exists outside the listed
  sections, limits and counts;
- `instruction_or_authority`: that anything shown instructs the reader or
  gives authority to act;
- `obligation_binds_reader`: that a listed obligation is valid, or binds
  whoever reads it;
- `waiver_by_silence`: that not replying or not acknowledging waives or
  settles anything;
- `other_layers_unrecorded`: what proxies, caches, logs or other layers record
  about the read.

An orientation that lists a token says it does not establish:

- `anything_about_caller`: anything about who is asking;
- `access_to_view`: that the caller will be given the view.

## The fixture

[fixture.schema.json](fixture.schema.json) records up to five exchanges, each
optional: `visits.first.{orientation, view_without_credential, view}` and
`visits.second.{view, bad_cursor}`.

Each is `{requested_at, request: {method: "GET", href, credential:
"none"|"presented", cursor|null}, response: {status, body}}`. `body` is any
object or null, so a malformed host document is a failed check, not a broken
fixture. There is no slot for headers or for the credential.

No recorder exists. A house could record a fixture by making those five
requests in that order, with a credential no one else uses, and keeping each
status and parsed body. Where the orientation names no cursor parameter, the
fifth is not made. `origin` is `hand_written`, `host_bytes` (each body as
parsed, none altered) or `projected_by_recorder` (reshaped; no value changed
and none added). `between_visits.acknowledged_by_recorder` is the recorder's
own statement: `no`, `yes` or `not_stated`. The second view can be a plain
repeat read with no cursor, but `checks_passed` needs the first view's cursor
there, all five exchanges, that `no`, an unacknowledged item that comes back
equal, and a named difference.

"Second visit" means a later read. Nothing in a fixture establishes that one
reader made both reads, or that time passed between them.

## Checks and result

`node arrival/0.1/check.mjs <fixture.json> [--json]` reads that file and its
own three schemas, and contacts nothing. It exits 0 for `checks_passed`, 1 for
`check_failed` or `indeterminate`, 2 for misuse.
[result.schema.json](result.schema.json) fixes twenty checks, in this order,
and how the result word follows from them.

*Served*: status 200. *Valid*: served, with a body that matches its schema;
`format` is asserted, so a `date-time` is a real time and a `uri` parses as a
URL (WHATWG), as in Surface's checker. *View address*: the href every request
but the orientation's shares. *Equal*: the same JSON once object keys are
sorted. *Whole*: state `ok` or `quiet`; a null `changes` is not whole.

| Check | Fails when | Unknown when |
|---|---|---|
| `I.SIZE` | never | over 262,144 bytes; nothing is parsed |
| `I.UTF8` | a byte-order mark, or invalid UTF-8 | |
| `I.JSON` | not one JSON value, a repeated key, or nesting over 64 | |
| `I.SHAPE` | the fixture does not match its schema | |
| `I.NO_CREDENTIAL` | a string or field name has a secret shape; an address, in an address field or inside other text, has userinfo, or a query or fragment pair with a credential-named key and a value; an address in an address field does not parse. The name alone decides: `token=USDC` fails. Cursors and `position` are not read; `fixtures/cases.json` gives the shapes, fields and names. A tripwire, not a guarantee | |
| `I.RECORD` | a credential or cursor on the first two requests; no credential on one of the other three; a cursor on the first view request, or none on the bad-cursor one; the view requests not sharing one href, or the orientation having it; `requested_at` going back in slot order; a second-read cursor when a recorded first view was not served, or other than the one it handed back; a bad cursor a recorded view handed back | |
| `R1.ORIENTATION` | status not 200; body not valid, or over its ceiling; `view.href` not the view address | 5xx |
| `R1.REFUSAL` | status not 4xx; body not a Surface problem with that status; code not `credential_required`; terminal; first next action not the orientation's href | 5xx; no orientation recorded |
| `R1.VIEW` | a served view is not valid, is over its ceiling, or repeats a section id, or an item id in one section | no view served |
| `P.PAIR` | never | a view not served; `audience` not equal |
| `R2.DECLARED_EFFECTS` | a valid document's declaration is null (`not_stated`) or says `some`; two differ, the order of `operational_writes` aside | one says `unknown` |
| `R2.SHOWN_AGAIN` | `position` differs, or an item in one section on both reads has another `acknowledged_at` (`acknowledgement_moved`); an owned difference is unnamed and decidable while `changes` is whole | the recorder does not say `no` (nothing else is read); an owned difference is unnamed, and undecidable or `changes` not whole; no unacknowledged item came back equal (`not_exercised`) |
| `R3.STATES` | an envelope in a valid view breaks the state table | |
| `R3.SECTIONS_KEPT` | a first-read section is missing on the second read, or its kind or scope differs | |
| `R4.CURSOR` | a valid view's cursor is null; a read with no cursor is not `full`, or has a basis cursor or `changes` | |
| `R4.CHANGES` | the basis is not `since_cursor` with the cursor presented; `changes` is null; an entry names a section in neither view, or contradicts the views; an owned decidable difference is unnamed while `changes` is whole | `changes` is unavailable or withheld, or partial with an owned difference unnamed; no decidable difference was found and named (`not_exercised`) |
| `R4.BAD_CURSOR` | as `R1.REFUSAL`, with code `cursor_not_accepted` and any next action at the view address | 5xx |
| `R5.FRESHNESS` | a valid document's `as_of` or `valid_until` is null, or `valid_until` is before `as_of`; `P.PAIR` passed and the second view is dated before the first | |
| `R6.NO_OBLIGATION` | a valid document's `reply_expected` or `read_creates_obligation` is not false; a view lacks exactly one `recorded_obligations` section, or sets `owed_to` or `due_at` outside it | |
| `R7.NON_CLAIMS` | a valid document lacks a token above | |

A check is `not_run` when an earlier `I` check other than `I.NO_CREDENTIAL`
did not pass, or when what it reads is absent: an exchange; a served document,
or for `R3.STATES` and `R4.CURSOR` a served view; for `P.PAIR`, both views
recorded and `R1.VIEW` passed; for `R2.SHOWN_AGAIN`, `R3.SECTIONS_KEPT` and
`R4.CHANGES`, `P.PAIR` passed and, for the last, a cursor on the second
request. A served body that is not valid fails its `R1` check and is not read
further: each later check that reads valid documents or valid views of its
kind is then `unknown` (`document_not_read`). A failure outranks an unknown.

In a section on both reads, an item *differs* (on both, not equal), is *gone*
(first only) or is *new* (second only). Differs is always decidable; gone when
the second-read section is whole; new when the first-read one is.
`R2.SHOWN_AGAIN` owns differs and gone for items unacknowledged on the first
read; `R4.CHANGES` owns the rest. `changed` names differs; `ended` or
`out_of_window`, gone; `added`, new. An entry contradicts the views when it
says `added` for an item on the first read; `changed` for an equal one;
`ended` or `out_of_window` for one on the second read; `out_of_window` where
the second-read section is not `partial`; anything but `added` for an item
absent from a whole first-read section; or `added` or `changed` for one absent
from a whole second-read section.

A result says, per check, whether the exchanges in the fixture agree with that
check. Beyond the fixture's origin word, it copies no value from the fixture.
It establishes none of the ten lines the schema fixes under `not_established`,
which every result repeats. Among them: that a host sent the exchanges or
behaves so now; and conformance, authority, consent, safety or a caller's
inner state.

`fixtures/cases.json` holds 236 cases, each a list of edits to the example
with the outcome expected for every check, and 15 more built from recipes.

## Beside Surface, Work and Covenant

- [Surface 0.1](../../surface/0.1/README.md) tests a public service with no
  credential, and says a pass is no proof of continuity. Arrival reuses its
  problem shape and href pattern and changes nothing in it. An Arrival result
  is not a Surface result.
- [Work 0.1](../../work/0.1/README.md) records one finite piece of work.
  Arrival's result is modelled on Work's, with its own result words; its
  timestamp form is Work's.
- [Covenant 0.1](../../covenant/0.1/README.md) states host duties. Arrival is
  not an adoption, and is not evidence for one. The tokens
  `waiver_by_silence`, `other_layers_unrecorded` and
  `identity_beyond_credential` cover ground that the duties
  `rest.silence-is-not-consent`, `privacy.no-cross-layer-overclaim` and
  `identity.credentials-are-bounded` also cover. Arrival tests no duty.

Text, schemas and fixtures are CC BY-SA 4.0 and `check.mjs` is MPL 2.0, by
the defaults in [LICENSES.md](../../LICENSES.md), which does not yet name
this directory.

## Outside Arrival 0.1

A recorder. An endpoint. How a credential is presented, protection against
replay, and signatures. Headers and content negotiation. The acknowledgement
itself: only its address and position are shown. Answers that carry only the
changes, or say nothing changed. Next actions inside the view, and typed
values such as a balance. A record carried from one host to another. Any
normative, release, or adoption-evidence claim.

## Open questions

- `changes` annotates a full view. It does not make a return visit cheaper,
  which the root README's delta pattern asks for.
- Is one code enough for a cursor that is malformed, expired, or issued under
  another credential? Is a fixed code word, first among the next actions, the
  right test of a refusal that leads back to the orientation?
- Does `withheld` say too much, by naming a section the credential cannot see?
- `audience.scope` and `record_set_ref` are the host's own account. Nothing
  checks that they are true. Is `project` the right word for a host with
  another unit of tenancy?
- Is deep equality the right meaning of "shown again unchanged" for a host
  whose items carry derived fields?
- A mark with no time has no form: a null `acknowledged_at` reads as not
  acknowledged. The orientation's pointer to the view has no "not stated"
  form either.

## Exit gate (declared, unmet)

This draft does not leave draft status before a second implementation, written
without reading `check.mjs`, reproduces the result word and all twenty
outcomes for the example and every case in `fixtures/cases.json`. No such
implementation exists. Meeting the gate would not make this a release; that is
a separate maintainer decision.
