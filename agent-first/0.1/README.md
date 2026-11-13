<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Xenia agent-first: connected motifs, small local pieces

**Status: repository-only development kit.** This is an optional Node host-side composition layer over existing Xenia functions—not a new normative Xenia profile, a published release, a durable workflow engine, or a model harness. It leaves the root package version, exports, Rights, Surface, Covenant and Work meanings unchanged. Most of it is written from the host's side; five commands are for the arriving side: `door plan` and `door check` look at another service's door from outside, `door rights` reads an adoption record from a local file, and `feedback new` and `feedback check` give a report a form and read one back.

## One door

From the Xenia checkout:

```sh
npm run --silent xenia -- arrive
```

`arrive` returns one bounded orientation document (under 8 KiB, tested): what this place is, the read-only commands (as argv; they change nothing here, and whether your host lets you run them is for you to decide, since this document grants no permission), the one command that sends requests, listed apart under `network` (`door check`; see [Looking at a door from outside](#looking-at-a-door-from-outside)), the core modules, the adapters listed as available but **unbound** (what each needs and its declared effects; for the Local Starter, the exact name, version, source and archive hash that `--package` must match), what the document does not establish, how to stop (nothing is running, nothing to undo) and where a report can go. It says `reply_expected: false`; `report` names the routes for a report following [AGENT-FEEDBACK.md](../../AGENT-FEEDBACK.md): a pull request, an issue, giving the note to whoever the writer answers to, if anyone, or nowhere. There is no endpoint, and no reply is promised (see [Writing a report](#writing-a-report)). It activates nothing, imports no provider and needs no build.

`node agent-first/0.1/cli.mjs arrive`, run from the repository root, is the same command without npm. That is the form on the six-line card at the top of the repository's [AGENTS.md](../../AGENTS.md), which says what the repository is, that no file is tracked under `.claude/`, what installing and `npm test` do, what reading does not establish and where a report can go. The card is static text and asks for nothing; `arrive` need not be run. [CLAUDE.md](../../CLAUDE.md) says where the card is and does not import it.

Then, as you choose:

```sh
npm run --silent xenia -- motifs
npm run --silent xenia -- motifs study list
```

Every failure from the door carries a `problem` (a kit-local shape, see Failure below) with runnable next actions (see Failure below), and `help <command>` gives one usage. `motifs` reads [the motif map](motifs.json) (`motifs <motif-id>` returns one card) and ends with a short `next` list; `motifs study` lists and runs the small studies (`study journey` and `study run` need the build). `catalog` lists the registered core modules and, from static metadata, the three adapters (`bound: false`, with what each requires); `explain <id>` describes either kind, and imports no provider code. `invoke <module-id> <operation-id> --input <file>` walks the principle once from the door: in one process it registers, activates, invokes and retires a core module, with your JSON file as input, and prints a receipt (module id, version and revision; operation; declared effects; the input's byte count and sha256; outcome; the result, or on a refusal the same receipt beside the typed problem; and what the receipt does not establish). The file is read with the bounded, no-follow reader and decoded strictly (UTF-8, no byte-order mark, one JSON value, no repeated object keys, at most 1 MiB). The input rules are in `help invoke`, and a refused file says which rule it broke (missing, symbolic link, not valid UTF-8, byte-order mark, not JSON, repeated key, too large, over the limits). `explain <module-id>` ends with the `invoke` command to run. Only operations that declare no effects run this way: the Surface manifest, the Covenant draft and the Work check. An operation that declares `local-read` or `local-write` is refused before anything runs with `HOST_GATE_REQUIRED`, because this command has no host gate to consult; Local Starter notes use `context` below. `catalog` and `explain` show each operation's `input` summary and example, and mark that `state`, `revision` and `in_flight` describe a fresh runtime made for that one command, not live shared state. `demo` exercises the existing reference tools and a clearly labelled synthetic upgrade/retirement example, printing a compact step list (call, module version and revision, declared effects, outcome, size and digest of each result; lifecycle first); `demo --full` returns the complete bodies. `starter-smoke` is the pinned Local Starter check below.

Arrive, motifs, catalog and explanation need only Node 22+ and the source checkout. `door plan` and `door check` need Node 22+ and the source checkout too, and no build: they use `surface/0.1/check.mjs` beside the kit, and say `CHECKOUT_REQUIRED` when that file is not there. `feedback new` and `feedback check` need only the kit's own files; without `AGENT-FEEDBACK.md` beside the kit, `feedback check` says it could not look for the Entry ID there. `door rights` needs `covenant/0.1` beside the kit (`CHECKOUT_REQUIRED` without it) and, for its JSON Schema check, `observe/0.1` with the checkout's installed development dependencies; without those it runs the other check alone and says so. The reference demo additionally needs the normal Xenia build and the Work checker's development dependencies. For a fresh checkout, prepare once with `npm ci --ignore-scripts` and `npm run build`. Neither step installs an agent host or activates a service.

## Looking at a door from outside

`door check` is the only command in which this kit's own code sends requests; provider code run by `context` and `starter-smoke` is not observed by this kit.

Two commands look at one HTTP(S) origin. The checking is done by the unchanged Surface 0.1 checker ([`surface/0.1/check.mjs`](../../surface/0.1/check.mjs)). [door.mjs](door.mjs) adds a plan, a request budget, a fence and a short report.

```sh
npm run --silent xenia -- door plan --origin https://example.org
npm run --silent xenia -- door check --origin https://example.org --max-requests 1 --total-timeout-ms 5000
```

**`door plan` sends nothing.** It runs the checker once with a fetch that refuses every call, and prints: the target and manifest URL the checker would use; the request bounds (at least 1, at most 66, with the rule: the number depends on the manifest, which a plan has not read); the bound on decoded body bytes (56,655,360) and what that does not count; the time rule; what would be contacted (one origin, the system name resolver, GET, the two headers the checker sets, and a note that the runtime's fetch adds headers of its own: on Node 24 a loopback server also received host, connection, accept-encoding, accept-language and sec-fetch-mode); `will_not_do`; `does_not_guard`; `host_may_add`; and two ready `door check` commands, `check.first_look` (one request, the manifest) and `check.full`, each with its sizes.

**What is not guarded** is in the plan: the address a name resolves to is not inspected, so a public-looking name can lead to a private address; the service and the network path can log the sender's address; no host gate is asked; runtime proxy settings are not examined. The environment that runs the command can add those guards. This kit does not.

**The target rule.** By default a target is refused unless `normalizeTarget` from the vendored Telescope source ([`adapters/telescope/provider/dist/target.js`](adapters/telescope/provider/dist/target.js)) accepts it: HTTPS, a DNS name, port 443, not a local or reserved name. That function reads text and resolves nothing. `--allow-local-target` accepts whatever else the checker accepts (any HTTPS origin; plain HTTP on localhost, 127.x and `[::1]`), and the output records `allow_local_target: true`. A refused target is `INVALID_TARGET`, exit 2, with a `reason`. Nothing is sent, the text given on the command line is not copied into the output, and every next action is a `door plan`.

**`door check` sends GET requests**: at most `--max-requests` (1 to 66), none started after `--total-timeout-ms` (100 to 120000). Both are required and neither has a default. The budget is a counting function handed to the checker as its fetch, so it counts calls handed to the runtime's fetch, not requests on the wire. The runtime sends each call once, with one exception seen on Node 24: after an answer with status 421 it sends that request a second time by itself, so a service that answers 421 can receive up to twice the budget. The plan says so under `requests.on_the_wire`, and a loopback test runs that case. It is also a fence: a call that is not GET, not `redirect: "manual"`, not at the target origin, or that carries a header other than User-Agent and Accept is not sent and is counted apart (`requests.refused_by_kit_fence`). With the checker as it is today that count stays 0; the fence is there in case the checker changes.

The report, in this order: `scope`; `not_tested` (the checker's own seven lines only); `expires_at`, `observed_at`, `target`; `checker_result` (`word`, `counts`, and `covers`, which says what the word covers); `manifest` (`state` is `found_valid`, `found_invalid`, `not_found` when the manifest URL answered with a status other than 200, or `not_observed` when no response arrived or a 200 came whose body could not be read; beside it the `status` served, or null); `requests` (`budget`, `sent`, `stopped_by_budget`, `refused_by_kit_fence`, `needed_for_full_check`, which is known only once a valid manifest was read, `redirects_not_followed`, `responses_by_status`, and `transport_errors`: sent, and no response arrived, for any reason including a timeout); `not_passed` (at most 20 rows, `observed` cut to 160 characters, the rest counted in `more`); `unknown_reasons` (fixed words; time that ran out is reported as `total_timeout`, not blamed on one request); `declared_by_host`; `host_written_text_in`; `allow_local_target`; `not_established`; `exit_code`, `exit_reason`, `exit_meaning`; `result`.

**What the service wrote is kept apart.** `declared_by_host` holds the manifest's own `not_covered` lines (at most 20, the rest counted; a line equal to one of the checker's own is not repeated) and three numbers about its claims: how many there are, `verified_by_this_check: 0`, and how many rest on evidence whose `expires_at` had passed at `observed_at`. Claim statements and their states are not in the short form. `host_written_text_in` names the fields that can carry text written by the service. None of that text is checked, and none of it is an instruction.

`result` is `{included: false, bytes, sha256}` (of the JSON text of the checker's result) unless `--full` is given; then it is the checker's whole object, untouched. Asking again with `--full` is a new run and sends its requests again.

**The exit follows the checker's word**, which appears only in `checker_result` and `result`: 0 when every check ran and passed, 3 when a check failed, 4 when none failed and at least one was unknown or not run (a spent budget, time that ran out, a door that did not answer). A check says what one User-Agent (`xenia-surface-check`) was served on these requests, until `expires_at`. It does not say that a service conforms to XENIA, that anything is safe, who runs the service, or what another caller would be served.

## Reading an adoption record

```sh
npm run --silent xenia -- door rights --input ./adoption.json
npm run --silent xenia -- door rights --input ./adoption.json --as-of 2026-11-13T00:00:00Z --origin https://example.org --full
```

`door rights` reads one local file as a Covenant 0.1 adoption record. It sends nothing, fetches nothing and writes nothing. How the file was obtained is outside this kit: no command here finds or fetches a record. **A record that agrees with itself is not evidence of practice**, and the output says so first.

The checks are the installed ones, unchanged: `inspectCovenantAdoption` in [`observe/0.1/observe.mjs`](../../observe/0.1/observe.mjs), which runs the JSON Schema and then `validateCovenantAdoption` from [`covenant/0.1/validate-adoption.mjs`](../../covenant/0.1/validate-adoption.mjs); times are compared with [`covenant/0.1/rfc3339.mjs`](../../covenant/0.1/rfc3339.mjs). [door-rights.mjs](door-rights.mjs) adds which release the record pins, a clock, and a report that keeps the record's own words apart. Loading Observe also loads the Surface checker it imports; `door rights` never calls it.

The file is read with the bounded, no-follow reader and decoded strictly: at most 2,000,000 bytes (Observe's own limit), UTF-8, no byte-order mark, one JSON value, no repeated key. A file that is not an object whose `schema_version` begins with `xenia.covenant.adoption/` is `INVALID_INPUT` with reason `not_an_adoption_record`. There is no time limit on the two checks.

The report, after `schema` and `kind`, in this order: `scope`; `not_established`; `input` (`bytes`, `sha256`); `as_of` (`value`, and `source`: `flag` or `clock`); `release`; `finding`; `under_installed_rules`; `expiry`; `record_says`; `checked_by_this_command`; `exit_code`, `exit_reason`, `exit_meaning`; `issues`.

**Which release.** `release.relation` compares, as text, the two digests the record pins (`covenant.sha256` and `adoption_schema.sha256`) with those of the installed files and with one earlier snapshot written down in the command. It is `installed`; or `earlier_snapshot` (tag `npm-xenia-v0.1.0-beta.4`, commit 6419d37: the two digests equal those of `covenant/0.1` at that tag, and the record was not checked under that snapshot's rules, which this checkout does not carry); or `not_recognised` (a newer release, or bytes that are no release; the command cannot tell which). No tag is observed at run time. A test derives the earlier row again from git when the tag is in the repository, and is skipped when it is not.

**The finding** is about the file, not the host. When the record pins other bytes it is `undetermined` (exit 4) whatever the installed rules raise; what they raise is still counted under `under_installed_rules`, with a label saying it is not a finding about the record. When the record pins the installed bytes: any issue gives `inconsistent` (exit 3); no issue with the JSON Schema check not run gives `undetermined` (exit 4); otherwise `no_inconsistency_found`. `under_installed_rules` gives, for each of the two checks, its state, its number of issues (each check keeps at most 256, so 256 means 256 or more) and a count by code, then counts by top-level field and in the ledger's duty rows. `issues` is `{included: false, count, bytes, sha256}` unless `--full` is given; then it is `{count, rows}`, each row a `check`, `code`, `path` and `message`. When Observe cannot be loaded, `json_schema` is `{state: "not_run", reason, how}` with one of three fixed reasons.

**A clock.** The installed rules compare evidence expiry only with the record's own `reviewed_at`, so a record whose evidence lapsed long ago raises nothing under them. `--as-of` (an RFC 3339 time; without it the clock of the machine, and `as_of.source` says which) adds the reader's time. `expiry` counts evidence whose `expires_at` is at or before `as_of`, and the rows the record gives as `pass` that rest on it. With `no_inconsistency_found`, one such row makes the exit 3; with none it is 0.

**What the record says is kept apart, and none of it is checked.** `record_says` holds the origin the record names (parsed; only the origin is kept), its declaration status, the speaker's authority state, `reviewed_at` with the whole days from it to `as_of` (negative when the review is the later of the two), and counts of outcomes, evidence states and right states. A value from the record is shown only when it is a word the installed schema lists, a timestamp of at most 40 characters, or an origin; anything else is counted as `other` or shown as null. No free text from the record is copied into the default output. With `--full`, each row carries a code and a message written by one of the two checks, and a path built from index numbers and names the installed schema defines; a test plants text and an extra key in a record and finds neither in the output. That is what was tested, not a proof about every message the JSON Schema library can write. `checked_by_this_command` is the other half: `pass_rows_checked: 0`, `signatures_verified: 0`, `evidence_fetched: 0`, `digests_recomputed: 0`, `speaker_authenticated: false`, `release_tag_observed: false`, and `relation_to_origin`, which with `--origin` says only whether the record names that origin.

So an exit of 0 covers little: the file pins the installed bytes, raised no issue under them, and no `pass` row rests on evidence expired at `as_of`. A record in which every duty passes, every digest is zero and the verifier names itself gets that 0; a test builds one. A 0 does not say that a host conforms, that the speaker has authority, that the file came from the host it names, or that anything is safe.

## Writing a report

```sh
npm run --silent xenia -- feedback new
npm run --silent xenia -- feedback new --out "$PWD/my-entry.md"
npm run --silent xenia -- feedback check --input ./my-entry.md
```

[AGENT-FEEDBACK.md](../../AGENT-FEEDBACK.md) lists eight things an entry says. [feedback.mjs](feedback.mjs) gives that list a form and reads a written entry back. Both commands are offline: they send nothing, deliver nothing and read no clock. **The notebook does not require this form**, and both outputs say `notebook_requires_this_form: false`.

**`feedback new`** prints a blank entry as `entry.text`: a dated heading, eight fields (Entry ID, Observed at, Speaker, Identity proof, Source snapshots, Network vantage, Reply path, Status) and ten sections (How I arrived and what I could inspect; Actions taken; What reduced friction; What increased friction; Observed; Inferred; Declared by the subject; Unknown; What I would keep; What I would change). The dated heading, the list of bold-labelled fields and the Entry ID form are those of the entry already in the notebook; Entry ID, Observed at and Status answer no bullet and come from that form. Each of the other fields and each section quotes, in an HTML comment, the notebook bullet it answers, and a test compares the quotes with the notebook. Status is filled in as `open`. No date is filled in, because no clock is read, so the same bytes are printed every time. `parts` lists each part, the bullet it answers and whether exit 0 needs it.

With `--out <absolute-new-file>` the entry is written to that path instead of being printed. The file is created only when nothing is at the path (a link there is refused too), and the path is not copied into the output. A refusal is `INVALID_OUTPUT`, exit 1, with a `reason` (`relative_path`, `names_a_folder`, `already_exists`, `parent_missing`, `parent_not_a_directory`, `not_permitted` or `could_not_create`), and nothing is written. If writing stops after the file was made, the failure says a partial or empty file may be there and that it was not removed.

**`feedback check --input <file>`** reads one file (a regular file, not a symbolic link, at most 1 MiB, UTF-8, no byte-order mark) line by line. It is not a Markdown parser. It knows four things. A fenced code block is content, and holds no heading, field or comment. An HTML comment is not content: a `<!--` begins one when it closes on its own line, when it is at the start of a line and closes on a later one, or when it closes on a later line before any blank line, heading, list item or code fence (so a hint that an editor wrapped is still a comment). Any other `<!--` is read as text, so one quoted in a sentence does not hide the sections after it. A field is a list item beginning with a bold label and a colon, and its value runs on over the lines after it, a list under it included, up to a blank line, a heading or the next item beside it. A section is a `###` heading with what is under it. It exits 0 when it finds a dated heading (`## YYYY-MM-DD: ...`, with a date that exists), an Entry ID in the form `xenia-feedback-YYYYMMDD-label-NNN`, `Observed at` starting with a date, `Speaker`, `Status`, and at least one section with text, whichever one. It exits 3 when one of those is not found, and `finding.missing` names them. It exits 4 when the file has more than one dated heading; then no part is read.

The report, after `schema` and `kind`, in this order: `scope`; `not_established`; `notebook_requires_this_form`; `input` (`bytes`, `sha256`); `entry` (lines in the file, dated headings, the first and last line read as the entry, comments ignored); `finding`; `parts`; `bullets`; `warnings`; `entry_id_in_notebook`; `delivered: false`; `route`; `exit_code`, `exit_reason`, `exit_meaning`.

**The eight bullets never change the exit.** `bullets` gives, for each bullet, the labels the blank entry uses for it, each as `found` (a field or section with that label has text), `empty` (the label is there with no text) or `not_found_by_label` (`not_read` when the exit is 4). `not_found_by_label` means only that the label was not found. The 2026-07-11 entry says how it arrived under a heading of its own, `Context`, so its bullet 2 reads `not_found_by_label`; that entry exits 0, and a test cuts it from the notebook at run time to show it. A heading answers a section label when it is the label, or begins with it and goes on with something other than a letter or a digit: `What I would change first` answers `What I would change`, and `Unknowns` does not answer `Unknown`. Case is not compared.

**Nothing the entry says is repeated, and none of it is checked.** The output carries the Entry ID when it is well formed, the two dates, and the status as `open`, `resolved`, `declined`, `superseded` or `other`. `warnings` gives a kind and a line number, never the text: eleven fixed patterns that look like a credential or a local path, applied to the first 2,000 characters of each line (a comment is scanned too), and four kinds about how the file was read: `line_not_fully_scanned`; `unclosed_comment`, a `<!--` that is not closed and was read as text; `comment_over_several_lines`, a comment that runs over more than one line and was not read as content; and `repeated_label`, a field label given twice, of which the first was read. At most 20 rows are shown, and the rest are counted. A row is a line to look at before sharing the file. Finding none is not a finding that there are none. `entry_id_in_notebook` says whether `AGENT-FEEDBACK.md` in this checkout already has that Entry ID: `found`, `not_found`, or `not_checked` with a reason. The notebook anywhere else is not looked at.

**Where a report goes** is one constant, printed as `route` by both commands and as `report` by `arrive`: a pull request (it needs a GitHub account, and a fork or push access; a maintainer decides, and may decline or not answer); an issue (it needs a GitHub account, and is not a notebook entry); giving the note to whoever the writer answers to, if anyone; otherwise the note stays where it was written. There is no endpoint, no command in this kit sends a report, and no reply is promised.

So an exit of 0 covers little: the file has five labelled parts and a section with text. It does not say that the entry is true, that it was delivered, that anyone will read it, or anything about who wrote it or who ran the command.

## The motifs

| Motif | The question it keeps answerable | Concrete behavior |
|---|---|---|
| **Standing** | What remains when a capability is unavailable? | Rights remain a floor. Reading what a door offers (describe, catalog, explain, motifs, help, arrive) works in every module state and after every refusal, never asks the host gate and takes no caller identity; `tests/agent-first-floor.test.mjs` runs that. The Covenant helper makes an all-unknown draft, not an active undertaking. |
| **Legibility** | Can I understand a door before using it? | Describe contracts, versions, effects and examples without invoking a handler. |
| **Bounded work** | What was offered, attempted, returned or observed? | Reuse Work's checker; do not execute a document merely because it records work. |
| **Continuity** | What do I choose to carry? | Use Local Starter's ordinary files, selection, freshness, budgets and guarded handoffs. |
| **Change** | Which implementation answered, and what changed? | Revision-bound replacement, declared contract/effect checks, in-flight protection and admission-time attribution. |
| **Exit** | Can this stop without taking the records with it? | Close new calls, drain admitted work, leave retained files independently readable. |

Their connection is not an automatic workflow:

```text
standing → legible choices → bounded work → chosen context
    ↑                                      ↓
    └──── exit without erasure ← attributable change
```

Understanding here is practical: each piece should explain what it does, what it needs, what it changes, what its evidence establishes, what remains unknown, and how to stop or replace it. The map is an interpretation of the linked Xenia sources, not proof of experience, authority or conformance.

## Small pieces and their ownership

- [runtime.mjs](runtime.mjs): an in-process registry for **trusted** module code. No filesystem, network, provider import, scheduler or credential lookup in the runtime. It is Node-only, not an OS sandbox.
- [modules.mjs](modules.mjs): thin, lazy adapters for the existing Surface manifest builder, Covenant draft generator and in-memory Work checker. No second validator is invented.
- [adapters/local-starter.mjs](adapters/local-starter.mjs): a removable binding to an explicitly supplied AgentTool namespace and notes root. It does not implement another notes store or discover personal context.
- [provider.mjs](provider.mjs): an explicit CLI loading boundary. It checks the small distribution file set against [agenttool.lock.json](agenttool.lock.json), snapshots the checked bytes, and imports only that snapshot's core. It does not run installation scripts, MCP, the hosted-read companion or network discovery.
- [context.mjs](context.mjs): deliberate local context commands. Each process closes its module admission when the command ends; retained notes are outside the code lifecycle.
- [command-state.mjs](command-state.mjs): keeps returned operations, later verification and snapshot cleanup distinct when a composite command fails.
- [door.mjs](door.mjs): `door plan` and `door check`. A plan that sends nothing, then a request budget, a fence and a short report around the unchanged Surface checker. The only file here that sends requests.
- [door-rights.mjs](door-rights.mjs): `door rights`. Reads one local file with the bounded reader, runs the two installed Covenant checks on it, and reports which release it pins, what had expired at a given time, what the record says and what was not checked. No second validator is invented; it sends nothing.
- [feedback.mjs](feedback.mjs): `feedback new` and `feedback check`. A blank entry in the form `AGENT-FEEDBACK.md` describes, and a line-by-line reading of a written one with the bounded reader. It sends nothing, delivers nothing and reads no clock; `feedback new --out` creates one file and never overwrites.

Additional, separately developed adapters are present for [Skills inspection](adapters/SKILLS-INSPECTOR.md) and [Telescope recognition](adapters/telescope/README.md). They are not automatically registered or activated by this entry point, and no command imports them, with one exception: `door plan` and `door check` import one file of the vendored Telescope source, `adapters/telescope/provider/dist/target.js` (and the error classes it needs), for the text-only target rule. It does not register the Telescope adapter or call its parser. Their own guides define their provider contracts and verification scope.

## A useful path through the pieces

1. Read `motifs`, `catalog` or `explain`. Reading does not activate anything.
2. Run `demo` to construct a Surface manifest, prepare an unverified Covenant draft, and check a synthetic Work record with the existing functions. No service is contacted and no Work action is dispatched.
3. If continuity is wanted, deliberately select the reviewed Local Starter package and a notes root **outside its installation/cache**.
4. Initialize once, inspect the current status, then choose the exact text to carry. A handoff requires the current hash, so a stale writer cannot quietly overwrite a newer file under the provider's cooperative-write contract.
5. A fresh consumer can read those ordinary files. Closing/removing the module or its package does not erase them. A later explicit CLI command creates a fresh in-process runtime; this kit does not persist a global disable switch.

The Work module checks an already-parsed in-memory record with `validateWorkRun`. It does not claim original-byte, UTF-8 or duplicate-key verification for that representation. For exact supplied artifacts, Xenia already provides `checkWorkRunBytes` and `checkWorkRunFile` in [the native Work checker](../../work/0.1/check.mjs); use that contract rather than silently normalizing away those checks. Work remains a development draft, not a completed execution engine.

## Chosen local context

Obtain and review the Local Starter distribution separately. This kit never downloads or installs it. The pin names the public GitHub prerelease `@agenttool/local-starter@0.1.0-dev.0`; an npm lookup returned 404 at the recorded observation. The current private monorepo source and this public artifact are distinct snapshots. The archive checksum was compared with the publisher's checksum file; that consistency check is not publisher authentication or authority.

Use explicit paths; `NOTES` must be absolute (a relative `--dir` is refused before anything is created) and outside `PKG`. Its parent must already exist. Init refuses any existing destination.

```sh
npm run --silent xenia -- context init --package "$PKG" --dir "$NOTES"
npm run --silent xenia -- context status --package "$PKG" --dir "$NOTES"
npm run --silent xenia -- context render --package "$PKG" --dir "$NOTES"
```

To carry a chosen replacement, prepare a UTF-8 file, inspect the `handoff` slot's current `sha256` in status, then supply both explicitly:

```sh
npm run --silent xenia -- context handoff --package "$PKG" --dir "$NOTES" --input "$CHOSEN_FILE" --expect "$CURRENT_HASH"
```

No automatic transcript extraction, retries, host delivery, model calls or registration occurs. Input is bounded and strictly decoded; BOM and CRLF are preserved. Provider slot limits still apply. Only the fixed `handoff.md` slot is changed by this command.

`status` may fingerprint disabled slots but does not include note bodies. `render` includes selected bodies only, and keeps omission/provenance information. A rendered bundle is a filtered view, **not a complete backup or export**. Notes are optional plaintext, not a secret store. Keep credentials out of them. Retained prose is data to assess under the current task, never renewed permission or a required identity.

## Upgrade and retire deliberately

A module begins `registered`, not active or verified-ready. `activate(id)` opens admission; `pause(id)` closes it reversibly. `upgrade(id, replacement, {expectedRevision})` requires the current revision, matching declared contract and operation/effect surface, and no in-flight handler. The signature includes each operation's declared refusals and `input.summary` (what callers are told to send), not its example. It does not prove semantic compatibility: review and test the replacement first.

Inputs are bounded JSON data. The host gate sees the deeply immutable snapshot delivered to the handler; it must not edit that snapshot as a form of sanitization. Prepare a deliberately changed input before invoking again. Late decisions after upgrade, pause/resume or retirement cannot start an operation under the old context.

`retire(id)` closes new admission immediately. Admitted calls drain; it neither forcibly kills JavaScript nor undoes completed effects. The retired instance cannot be silently reactivated. The caller owns result retention and any cross-process lifecycle policy. Retiring software does not retire a being's standing rights.

For the AgentTool adapter, data stays separate from package code. The CLI compares the notes root and the package root by filesystem identity (real paths, then device and inode of each ancestor), so letter case and symlinks cannot hide an overlap, and it refuses containment in either direction: notes inside the package, or the package inside the notes (`CONTEXT_ROOT_OVERLAP`). It also refuses a `TMPDIR` that resolves inside either root, because the checked copy of the package is written there (`SNAPSHOT_LOCATION_OVERLAP`). Programmatic hosts choosing their own namespace/root must enforce that separation too. Replacing code must not mean migrating or deleting notes; migrations, deletion, host hooks, MCP bindings, credentials and external copies have separate lifecycles.

A different provider artifact must be reviewed and tested before changing its pin. No `latest` lookup or automatic pin relaxation is used. Byte matching does not prove behavior, rights, source authenticity or compatibility; trusted code and a cooperative filesystem remain host assumptions.

## Failure is useful information

A failure says whether anything happened. An operation declares its refusals in advance; when its handler throws one, the result is `DECLINED` with `effect_outcome: not_applied`, the refusal code and what to do next (a stale `--expect` hash, an existing root). **`not_applied` is the module's own declaration, not something the runtime observed:** the runtime checks only that the code was declared, so a module that declines after acting would still read `not_applied`. Each module's adapter therefore declares a refusal only where its provider is known to fail before changing anything. For the Local Starter, `init` declares only `parent_unavailable` and `already_exists`, because the provider creates the directory first and may report `unsafe_root` afterwards; that, and any other `init` failure, is `OPERATION_FAILED` with an unknown outcome and points at `context status`. For `handoff`, `unsafe_root` says only that the handoff file was not replaced, because a lock or temporary file may remain. An undeclared handler failure stays `OPERATION_FAILED` with an unknown outcome: do not replay a mutation. `POLICY_BLOCKED` is admission, not a human's refusal. Every refusal output lists, in `not_established`, that `not_applied` is a declaration.

At the CLI every failure adds `problem` `{code, detail, terminal, next_actions[{argv, why}], retryable}` (plus `valid` where the valid values are known): terminal, or at least one argv to run. This is a kit-local shape. It borrows the meanings of Surface's problem (terminal or at least one next action; retryable) but it is **not** `xenia.surface.problem/0.1` and does not validate against `surface/0.1/problem.schema.json`: codes are UPPER_SNAKE and a next action is an argv, not a link. Exit 0: the command ran and reports no finding. A `door` or `feedback` body says what its 0 covers; the other commands print their result and no such statement, although `help` gives the one meaning of 0 for all of them. 1: failure or refusal. 2: the command line was not understood, names nothing that exists, or names a `door` target that was refused. 3 and 4 are set only by `door check`, `door rights` and `feedback check`: 3 ran and reports a finding, 4 ran and could not determine. A `door` or `feedback` body repeats its exit as `exit_code`, `exit_reason` and `exit_meaning`. Composite failures name the phase. Output sizes: only `arrive` is bounded (8 KiB); `catalog` and `motifs` are somewhat larger, and a successful `context` command no longer repeats the module's refusal tables (use `explain agenttool.local-context`).

## Verification

The default project gate is still `npm test`. It includes local module, CLI, motif and boundary regressions. Real Local Starter tests are explicit opt-ins, so a skipped real-provider test must not be called a successful integration test:

```sh
XENIA_STARTER_TEST_PACKAGE="$PKG" npm test
node tools/render-covenant.mjs --check
node tools/render-adoption-schema.mjs --check
```

The real-package gate uses disposable synthetic roots and fresh CLI processes. It checks restart, root isolation, disabled content, stale-hash refusal with unchanged data, existing-root refusal, provider removal with retained notes, and core operation without the provider. Failure-injection cases cover FIFO rejection, code/data separation, readback failure after writes, and cleanup failure after acknowledgement. Test-fixture cleanup is distinct from retirement; it does not imply that retirement deletes data.

The `door` tests use doors held in memory and loopback servers only: budget, fence, a redirect that is not followed, exits 0, 3 and 4, refused targets, and every other command run with fetch, sockets and name lookups made to fail. That is enforced in the test file: its own process has the real fetch replaced, and each CLI child runs either with the network switched off or allowed to connect to 127.0.0.1 only. No test contacts a real service, so no live door was checked by them.

The `door rights` tests make every record at run time from the installed draft generator: the all-unknown draft, a fabricated record in which every duty passes, the same record read at times before and after its evidence expires, a record shaped like one written against the earlier snapshot, a record that contradicts itself, and files of other kinds. They also run the command in a copy without Observe, in a copy of the kit alone, and with the network switched off. No real host's record is in the repository or was read by them.

The `feedback` tests make every entry at run time, with one exception: the 2026-07-11 entry is cut out of `AGENT-FEEDBACK.md` when the test runs, and is not changed. They cover the blank entry, each needed part missing or not in the form, more than one dated heading, other list marks, line endings and code fences, a list under a label, a `<!--` in prose and in a code fence, each warning pattern with planted text that must not come back out, files of 1 MiB written to be slow to read, refused input, exclusive create, the ID lookup in a copy of the kit with and without a notebook beside it, and the commands run with a watch on the clock and with the network switched off. No report was sent or delivered by them, and no entry was added to the notebook.

The repository's own door has one test file, `tests/own-door.test.mjs`. It checks what the card in `AGENTS.md` says against the checkout: the card is the first section and has six lines; its first line carries the sentence `arrive` gives as its purpose; no file is tracked under `.claude/` (asked of git, and skipped where git cannot answer); the one command on the card prints the same document, under 8 KiB, when it runs with fetch, sockets, name lookups, child processes and file writes made to fail; `prepare`, `build` and `test` in `package.json` do what the card says; the links in `AGENTS.md` and `CLAUDE.md` lead to files and headings that exist; neither file has an `@` import; the pattern for the excluded register, read out of `tests/hospitality.test.mjs`, matches nothing in `AGENTS.md`, `CLAUDE.md` or `CONTRIBUTING.md`; and a word check finds no demand, greeting or statement about the reader in the card. The word check finds listed words and does not read meaning. The guard covers the calls it names and no others. None of this establishes what a tool loads when a session opens here: no test opens a session, and files that tools other than Claude Code read were not surveyed.

The dated gate totals, file hashes, the commands run by hand and what was not established for this step are in [`.hermes/verification/guest-side-step2.json`](../../.hermes/verification/guest-side-step2.json).

Only local behavior is tested. No hosted AgentTool account, collaboration database, website, model inference, deployment, publication or whole-Xenia conformance is established. Code is MPL-2.0; prose and the informative motif map are CC BY-SA 4.0. The optional provider remains Apache-2.0 with its own LICENSE/NOTICE.
