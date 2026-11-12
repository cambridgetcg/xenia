<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
<!-- Generated from modules/0.1/motifs.json by renderMotifs; edit the canonical cards, not this view. -->
# Xenia — a house that can be understood, used, questioned and left

**Interpretive design cards, not a new normative profile or a running agent.**

Each card states its purpose, needs, output, example, checks, change rule and exit. It can be used alone. Connections are optional relationships, not imports, prerequisites, authority or automatic execution.

Operational understanding means being able to explain what a component is for, when to use it, what it changes, what evidence supports it and when to stop. These cards make no claim about inner experience.

Read the whole map with `npm run --silent xenia:modules -- motifs`, or one card with `npm run --silent xenia:modules -- motifs release`.

## The connected movement

Arrival → legibility → choice → witness → continuity → release → a possible new arrival.

This is a map of relationships, not a compulsory pipeline or an automatic loop.

Repair crosses the map: keep questions reachable, correct disclosures, revisit changed proposals, append contradictory evidence, carry only useful context, and stop an affected action without collective or unrelated penalties.

- **arrival → legibility:** A discoverable door becomes useful when its explanation is in a shape the caller can use.
- **legibility → choice:** An understandable contract makes a specific choice possible; it does not choose for the guest.
- **choice → witness:** A scoped decision names the intended act; its result still needs observation rather than assumption.
- **witness → continuity:** Bounded evidence and corrections let later work pick up a thread without rewriting its origin.
- **continuity → release:** A continuation record must also explain how work can pause or end without losing its meaning.
- **release → arrival:** A real departure can leave a future door open, without automatic re-enrollment or inherited obligation.
- **witness → choice:** New evidence can change a decision, but cannot itself grant permission or stand in for consent.

## Standalone cards

### Arrival — an understandable threshold

**Question:** Can a stranger find out where they are before being asked to act?

Make orientation available before commitment, so discovery does not require guessing or belonging first.

**Use on its own:** Apply this to one API manifest, command help page, module card or room entrance; no other motif or running provider is required.

**Needs:**
- An honest description of a surface or capability
- A reading path appropriate to the caller

**Produces:**
- A map of available representations, capabilities and limits
- A next step the caller may choose or leave alone

**Practice:**
- Name the entry point and the scope it describes.
- Separate reading and discovery from activation or enrollment.
- Make an absent capability understandable instead of inventing availability.

**Illustrative example:** A caller encounters a local capability catalog with no backend installed. Offer purpose, versions, required inputs, effects and an explicit activation path. The caller can understand the option without starting a process or opening a database.

**Boundary:** A welcome or capability advertisement is not an account grant, proof of readiness, consent or an obligation to participate.

**When it changes:** Update orientation when the actual contract changes; keep canonical and legacy pointers distinguishable.

**When it ends:** When an entry is withdrawn or moved, make that condition legible without pretending the old capability still runs.

**Source anchors:**
- [README.md](README.md) — Current discovery path; Discovery & Addressing
- [surface/0.1/README.md](surface/0.1/README.md) — Public discovery profile

**Executable checks:**
- [tests/surface-0.1.test.mjs](tests/surface-0.1.test.mjs) — Producer and declared discovery surface remain consistent.
- [modules/0.1/cli.test.mjs](modules/0.1/cli.test.mjs) — Metadata remains readable with no backend and an empty executable search path.

### Legibility — meaning in the caller's shape

**Question:** Can the caller understand the offered meaning without reverse-engineering the presentation?

Carry a contract into an explicitly selected representation while preserving its scope and distinctions.

**Use on its own:** Use this for one function result, error object, CLI response or document view; a static schema and example can already be useful.

**Needs:**
- The caller's representation request
- An explicit set of supported formats and their meaning

**Produces:**
- A usable representation or an honest unsupported-format response
- Information about the shape and limits of that response

**Practice:**
- Negotiate declared formats rather than guessing what an agent should want.
- Keep structured data useful without requiring visual interpretation.
- Explain recoverable failures without turning a terminal refusal into retry pressure.

**Illustrative example:** A JSON-capable caller reaches a surface that also has an HTML view. Select the declared JSON representation rather than asking the caller to scrape the page. The caller receives the intended shape, or an explicit result that the requested format is unsupported.

**Boundary:** Two related views need not be equivalent. Changing format does not permit disclosure of additional private data or erase the difference between an assertion and evidence.

**When it changes:** Version an incompatible representation change and keep examples and validation aligned with what is actually returned.

**When it ends:** Retire an old representation through a visible compatibility change, not a silent substitution of a different meaning.

**Source anchors:**
- [README.md](README.md) — Legibility & Content-Negotiation
- [src/negotiation.ts](src/negotiation.ts) — negotiateVisibleDoorRepresentation

**Executable checks:**
- [tests/negotiation.test.mjs](tests/negotiation.test.mjs) — Supported and unacceptable representations remain distinguishable.

### Choice — a scoped yes, and a usable no

**Question:** What exactly is being chosen, by whom, for which act and scope?

Turn an available possibility into a specific, revisable decision without confusing ability, authority and consent.

**Use on its own:** Apply this to a single approval callback, task offer or action form. It does not require a registry, a named identity system or the rest of this atlas.

**Needs:**
- A proposed act with affected resources and effects
- The applicable authority and consent bases, or an explicit unknown

**Produces:**
- A bounded decision about that act
- A refusal or unresolved state that does not silently become execution

**Practice:**
- Keep open reading separate from binding actions.
- Bind asynchronous approval to the same admitted input that will be dispatched.
- Permit refusal, changed scope and withdrawal without inventing a debt or mutual bond.

**Illustrative example:** A request names task A while an authorization decision is pending. Detach and freeze that request before policy evaluation; dispatch the approved snapshot rather than a later mutable object. Changing the caller's object to task B cannot turn approval for A into a different action.

**Boundary:** A positive callback is a technical decision, not proof that its author holds real-world authority. Rights, credentials, a signature, presence and another party's consent remain separate.

**When it changes:** Make new effects or wider scope visible and obtain the applicable fresh decision; do not inherit permission merely from a version or familiar name.

**When it ends:** Withdraw future admission promptly while preserving an honest account of actions already attempted and outcomes still unknown.

**Source anchors:**
- [RIGHTS.md](RIGHTS.md) — Rights, permissions, consent, and covenants
- [work/0.1/README.md](work/0.1/README.md) — The rights floor; scoped action records

**Executable checks:**
- [modules/0.1/host.test.mjs](modules/0.1/host.test.mjs) — Exact affirmative authorization and an immutable admitted input precede dispatch.
- [tests/work-0.1.test.mjs](tests/work-0.1.test.mjs) — A work record and its authority claims remain bounded records, not dispatch permission.

### Witness — evidence with an honest remainder

**Question:** What was actually observed or checked, and what still does not follow from it?

Make observations useful for judgment and repair without inflating them into a universal verdict.

**Use on its own:** Use this for one test receipt, deployment observation, research note or error report; no live service or other motif is required to state its limits.

**Needs:**
- A named observation or check with its inputs, tool and scope
- A distinction between declarations, observations, interpretations and unknowns

**Produces:**
- A bounded, attributable evidence record
- A clear account of what was not established and what could be checked next

**Practice:**
- Bind an observation to the bytes, revision or operation it actually concerns.
- Keep a missing observation unknown rather than treating it as pass, failure or zero.
- Append corrections and new evidence without silently rewriting the earlier record.

**Illustrative example:** A backend file is checked, but its original pathname may change before execution. Execute a private snapshot of the verified bytes and retain its provenance. The local byte check concerns the code actually opened by the runtime, without claiming publisher authenticity or a sandbox.

**Boundary:** Integrity is not truth, a declared capability is not readiness, and a passing bounded check is not whole-framework conformance.

**When it changes:** A changed artifact or new observation needs its own scope and evidence; do not relabel an expired result as a fresh pass.

**When it ends:** Mark the observation's expiry or replacement clearly and preserve only the evidence needed under its declared handling rules.

**Source anchors:**
- [README.md](README.md) — The observer is also observed
- [src/visible-door.ts](src/visible-door.ts) — evaluateDoorObservation

**Executable checks:**
- [tests/visible-door.test.mjs](tests/visible-door.test.mjs) — Missing observations and bounded findings retain their distinct meanings.
- [modules/0.1/adapters/agenttool-collab/adapter.test.mjs](modules/0.1/adapters/agenttool-collab/adapter.test.mjs) — The executed source snapshot remains tied to the verified bytes.

### Continuity — a thread that can be picked up

**Question:** What must remain understandable for useful work to continue after a pause, change or handoff?

Carry enough context, provenance and unresolved questions to continue the work without pretending nothing changed.

**Use on its own:** Apply this to one versioned document, paused task, release note or handoff packet. A small truthful record is enough; no claim of a continuous self is needed.

**Needs:**
- A bounded earlier record or declared state
- The reason and limits for the proposed continuation or replacement

**Produces:**
- Explicit links between prior and current work
- A reviewable account of changes, retained obligations and unresolved outcomes

**Practice:**
- Keep the earlier segment intact and name the continuation's source.
- Separate implementation, interface, provider and storage versions.
- Treat processing acknowledgement, agreement, handoff acceptance and authority as different events.

**Illustrative example:** A paused task will continue with a revised connector. Keep the prior evidence, compare the new contract/effects, and name unresolved work before making a fresh binding. The next caller can see what was carried, what changed and what still requires review.

**Boundary:** Preserved context is not identity, inherited credentials or renewed consent. A descriptor comparison does not prove compatible behavior or a safe database migration.

**When it changes:** Preview differences, preserve the source record, review candidate code and provider state, and refuse unsafe in-flight replacement.

**When it ends:** Close the finite segment explicitly; retain necessary evidence under its handling policy rather than hoarding everything or pretending logical closure erased it.

**Source anchors:**
- [work/0.1/README.md](work/0.1/README.md) — One finite run; continuation and source_handoff
- [CONTRIBUTING.md](CONTRIBUTING.md) — Withdrawal and attributable observations

**Executable checks:**
- [tests/work-0.1.test.mjs](tests/work-0.1.test.mjs) — Finite segments and continuation bindings are checked within their stated scope.
- [modules/0.1/host.test.mjs](modules/0.1/host.test.mjs) — Upgrade previews expose compatibility and lifecycle barriers without performing replacement.

### Release — a real way out

**Question:** Can this capability stop without trapping its caller, erasing the record or fabricating completion?

Make stopping, refusal and departure operationally real while leaving retained work understandable.

**Use on its own:** Apply this to one plugin, process, subscription or service binding. The right to stop does not depend on installing a whole framework.

**Needs:**
- A way to close admission
- An account of owned work, cleanup limits and retained evidence

**Produces:**
- A stopped capability with an honest cleanup state
- Preserved records and a bounded recovery path where needed

**Practice:**
- Disable new work before waiting for cleanup.
- Resolve only the bindings and leases this component actually owns.
- Distinguish completed cleanup, temporary disconnect and unresolved effects; do not replay an uncertain write.

**Illustrative example:** A coordination module is retired while another session still has work. Release the retiring module's known leases, end its bound session and close its process; leave the peer and journal alone. Its work reopens rather than being falsely marked completed. The peer can continue, and cleanup uncertainty remains visible.

**Boundary:** Retiring software is not deleting a participant, revoking standing rights, proving secure erasure or forcing someone else to accept a handoff.

**When it changes:** A replacement needs explicit review and fresh activation; uncertainty is not a reason to smuggle the old capability back into service.

**When it ends:** Keep admission closed even if cleanup fails. Preserve the necessary record and name the remaining native recovery work instead of claiming a clean ending.

**Source anchors:**
- [RIGHTS.md](RIGHTS.md) — Rest, play, and limits; refusal; repair
- [covenant/0.1/covenant.json](covenant/0.1/covenant.json) — refusal-revocation-and-exit; rest-and-non-action

**Executable checks:**
- [modules/0.1/host.test.mjs](modules/0.1/host.test.mjs) — Retirement fences late approvals and cannot silently replay cleanup.
- [modules/0.1/adapters/agenttool-collab/adapter.test.mjs](modules/0.1/adapters/agenttool-collab/adapter.test.mjs) — Retiring one binding preserves the peer's work and the journal.
- [modules/0.1/cli.test.mjs](modules/0.1/cli.test.mjs) — EOF and Stop signals exercise the actual control path, including cleanup-pending outcomes.

## Provenance and limits

Source: https://github.com/cambridgetcg/xenia at `7a6794e1e17dc80770a6ad4294d55cf7171e3de5`. Inspected local source; remote accessibility is not asserted.

Paths under modules/0.1 are this checkout's source-only addition, not APIs in the baseline release.

The listed tests exercise named mechanisms. Passing one does not prove the whole motif, rights practice, provider compatibility or whole-framework conformance. Examples are illustrative, not fabricated observations.

The canonical cards are [modules/0.1/motifs.json](modules/0.1/motifs.json). The practical entry is [AGENT-FIRST.md](AGENT-FIRST.md).
