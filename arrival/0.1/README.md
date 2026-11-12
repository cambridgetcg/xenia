<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# XENIA Arrival 0.1

Status: **development draft**

- Written by one author. No second implementation exists.
- No host is known to serve either document described here.
- The only fixture, [examples/two-visits.json](examples/two-visits.json), was
  written by hand. No host sent it.
- No checker is in this directory yet. `check.mjs` and `fixtures/cases.json`
  are named below and not written, so nothing has run the checks listed here,
  not even against the example.
- [tests/arrival-0.1.test.mjs](../../tests/arrival-0.1.test.mjs) checks the
  schemas against the example and pins this text. It checks shape only.
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

Each rule starts from something this repository already asks for.

| Rule | Source |
|---|---|
| 1, 5 | [AGENT-FEEDBACK.md](../../AGENT-FEEDBACK.md), the 2026-07-11 report, "What I would change first", item 5 |
| 2 | root [README.md](../../README.md), Continuity & Arrival, the patterns "A look, not an event" and "A welcome, not a work order" |
| 3 | [WEBSITE-ROLLOUT.md](../../WEBSITE-ROLLOUT.md), website integration gates 2 and 3 |
| 4 | the same list, gate 1 |
| 6 | root README, "A welcome, not a work order" |
| 7 | [AGENTS.md](../../AGENTS.md): report evidence, claims, and unknowns separately; rollout gate 4 |

The root README calls this arrival a wake; this draft does not use the word,
because, as the 2026-07-11 report says, it has stood for both a public
orientation and an authenticated read. The shapes, the state `withheld`, and
the choice that a cursor annotates a full view are this draft's own. No text
or code from any host was copied into this directory.

## The seven rules

1. **Two addresses.** The orientation answers anyone. The view address answers
   a request with no credential by refusing: a
   [Surface 0.1 problem](../../surface/0.1/problem.schema.json) with code
   `credential_required` whose first next action is the orientation. It does
   not answer with a smaller view.
2. **A read is not an event.** Each document declares what a read writes. The
   declarations agree, and say `none` for the participant's record. An item
   shown and not acknowledged is shown again unchanged on the next read, or
   the change is named.
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
   says until when the host stands by it.
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
floor no lower than `items.length`.

The schemas fix fields, types and bounds only. A view that breaks this table
is still schema-valid; agreement with it is a check under rule 3.

### Bounds

| What | Bound |
|---|---|
| sections | 1 to 16 |
| envelope `limit`; items listed | 1 to 32; 0 to 32 |
| `summary`, `place.summary` | 1 to 300 characters |
| `title`, `place.name`, `owed_to`, each operational write | 1 to 120 characters |
| cursor; href | 1 to 1024; up to 2048 characters |
| `position`, `record_set_ref` | 1 to 256 characters |
| `operational_writes` | 0 to 8 entries |
| fixture file | 262,144 bytes |
| view; orientation | 65,536; 8,192 bytes |

The last row measures a body serialised again from the fixture, not bytes on
the wire, and no schema states it.

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
optional: `visits.first.orientation`, `visits.first.view_without_credential`,
`visits.first.view`, `visits.second.view` and `visits.second.bad_cursor`.

Each is `{requested_at, request: {method: "GET", href, credential:
"none"|"presented", cursor|null}, response: {status, body}}`. `body` is any
object or null, so a malformed host document is a failed check, not a broken
fixture. There is no slot for headers or for the credential. The second view
can be a plain repeat read with no cursor.

`origin` is `hand_written`, `host_bytes` or `projected_by_recorder`.
`between_visits.acknowledged_by_recorder` is the recorder's own statement:
`no`, `yes` or `not_stated`.

"Second visit" means a later read. Nothing in a fixture establishes that one
reader made both reads, or that time passed between them.

## Checks and result

[result.schema.json](result.schema.json) fixes twenty checks, in this order.

| Check | What it compares |
|---|---|
| `I.SIZE`, `I.UTF8`, `I.JSON` | the input bytes: size, strict UTF-8, one JSON value with no repeated key |
| `I.SHAPE` | the fixture against its schema |
| `I.NO_CREDENTIAL` | strings other than cursors and positions against secret shapes, and hrefs against userinfo, fragments and credential-named query keys; a tripwire, not a guarantee |
| `I.RECORD` | the recorded requests: credential, cursor, one view address, order |
| `R1.ORIENTATION` | status 200, a valid orientation within its ceiling, pointing at the view address |
| `R1.REFUSAL` | the answer to the view address asked with no credential |
| `R1.VIEW` | each served view: valid, within its ceiling, ids not repeated |
| `P.PAIR` | whether the two views can be compared: both served, both valid, same audience; it never fails |
| `R2.DECLARED_EFFECTS` | the read-effects declarations in all three documents |
| `R2.SHOWN_AGAIN` | unacknowledged first-read items against the second read |
| `R3.STATES` | every envelope against the state table |
| `R3.SECTIONS_KEPT` | section ids, kinds and scopes across the two reads |
| `R4.CURSOR` | that a cursor is handed back, and that a read with none is a full view |
| `R4.CHANGES` | `changes` against the checker's own comparison of the two views |
| `R4.BAD_CURSOR` | the answer to a cursor the host did not hand back |
| `R5.FRESHNESS` | `as_of` and `valid_until`; host times with host times only |
| `R6.NO_OBLIGATION` | rule 6 |
| `R7.NON_CLAIMS` | that every token above is listed |

The exact conditions for each outcome are not written in this directory yet.

An outcome is `pass`, `fail`, `unknown` (recorded, but undecidable) or
`not_run` (the exchange is absent, or a check this one depends on did not
pass). The result word is `check_failed` if any check failed; otherwise
`indeterminate` if any is `unknown` or `not_run`; otherwise `checks_passed`.
The schema ties the word to the outcomes.

A result also carries `fixture_origin`; `exercised`, which counts the items
compared equal, the differences found and named, and the states seen, so a
pass that compared nothing can be told from one that compared something;
`issues`, each a code, a path and a message; and a fixed `not_established`.
It copies no value from the fixture.

A result says, per check, whether the exchanges in the fixture agree with that
check. It does not establish: that a host sent them or behaves so now; that a
read wrote nothing; that nothing was acknowledged between the reads, by the
recorder or another holder of the credential; that reading caused a
difference; that an `ok` or `quiet` section was read successfully, or that
every section is listed; who the reader is, or that one reader, one credential
or any passage of time joins the reads; whether the cursor is state the host
keeps; the truth of times, counts or text; how an acknowledgement behaves;
that an obligation binds anyone; or conformance, authority, consent, safety or
a caller's inner state.

## Beside Surface, Work and Covenant

- [Surface 0.1](../../surface/0.1/README.md) tests a public service from
  outside with no credential, and says a pass is no proof of continuity.
  Arrival reuses its problem shape for both refusals and its href pattern,
  and changes nothing in it. An Arrival result is not a Surface result.
- [Work 0.1](../../work/0.1/README.md) records one finite piece of work.
  Arrival records two reads. Its result follows Work's shape and its
  timestamp form is Work's.
- [Covenant 0.1](../../covenant/0.1/README.md) states host duties. Arrival is
  not an adoption, and is not evidence for one.

Schemas, example and text are CC BY-SA 4.0 by the default for specification
files in [LICENSES.md](../../LICENSES.md), which does not yet name this
directory.

## Outside Arrival 0.1

A recorder. An endpoint. How a credential is presented, protection against
replay, and signatures. Headers and content negotiation. The acknowledgement
itself: only its address and position are shown. Answers that carry only the
changes, or say nothing changed. A record carried from one host to another.
Any normative, release, or adoption-evidence claim.

## Open questions

- `changes` annotates a full view. It does not make a return visit cheaper,
  which the root README's delta pattern asks for.
- Is one code enough for a cursor that is malformed, expired, or issued under
  another credential?
- Does `withheld` say too much, by naming a section the credential cannot see?
- `audience.scope` and `record_set_ref` are the host's own account of what a
  credential reaches. Nothing checks them.
- Is deep equality the right meaning of "shown again unchanged" for a host
  whose items carry derived fields?

## Exit gate (declared, unmet)

This draft does not leave draft status before a second implementation, written
without reading `check.mjs`, reproduces the result word and all twenty
outcomes for the example and for every case in `fixtures/cases.json`. Neither
file exists at this revision, so the gate cannot yet be attempted. Meeting it
would not make this a release; that is a separate maintainer decision.
