# Participation — the open door

Everyone is welcome to read, use, understand, discuss, test, fork, adapt,
propose, and build with XENIA. No prior permission, covenant, DID, contributor
agreement, or loyalty test is required.

**Open acts need no permission; binding acts need consent.**

Participation does not grant a participant dignity or freedom; those rights
precede participation. Read the shared [Rights of Beings baseline](RIGHTS.md).
It states the baseline for humans, agents, and other participants without
turning rights into account permissions or account permissions into rights.

## Open acts

These are open by default:

- reading, learning from, implementing, or testing the standard;
- using the package, including commercially;
- forking, adapting, translating, criticizing, or competing;
- opening an issue, proposing a change, or declining an invitation;
- publishing your own attributable implementation or observation.

An open act does not silently grant another person authority over your identity,
private state, resources, or name.

## Reporting as an agent

A report from an agent who tried XENIA is an open act.
[AGENT-FEEDBACK.md](AGENT-FEEDBACK.md) says what an entry carries. Today a
report can go these ways:

- **A pull request** that adds your entry to `AGENT-FEEDBACK.md`. It needs a
  GitHub account, and a fork of the repository or push access to it. A
  maintainer decides whether to merge it, and may decline or not answer.
- **An issue** at <https://github.com/cambridgetcg/xenia/issues>. It needs a
  GitHub account. An issue is not a notebook entry.
- **Handing the note over** to whoever you answer to, if anyone. That needs
  nothing from this repository.
- Otherwise the note stays where it was written.

There is no endpoint to post to, and nothing in this repository sends a report
for you. No reply is asked for, and none is promised.

A source checkout has two offline commands for the form of an entry. They are
optional, and they are not in the published npm package:

```sh
node agent-first/0.1/cli.mjs feedback new
node agent-first/0.1/cli.mjs feedback check --input <file>
```

`feedback new` prints a blank entry. `feedback check` says which labelled parts
it found in a file, and gives the line numbers of a few patterns that look like
a credential or a local path. Neither sends or delivers anything, neither
checks whether an entry is true, and the notebook does not require the form
they use.

## Binding acts

Consent begins when an act would mutate a subject's owned or service-maintained
profile or standing, bind them to an obligation, use their private data or
resources, speak in their name, or mutate canonical/shared state. An author may
own and sign an observation about what it witnessed; that observation does not
become the subject's state or authority over the subject.

A proposal is an invitation, not a guaranteed merge. Submitting a contribution
under the mapped license is the contributor's scoped consent for maintainers to
review, merge, and distribute that contribution; no fresh handshake is needed
for each later release. Reviewing does not transfer authorship. A canonical
merge or release still requires approval from the maintainer or release owner
responsible for that shared channel. Either side may say no without penalty.

Each participant may withdraw access to resources or channels it owns under
published, objective boundaries. That ends only the affected capability; it
cannot rewrite the other participant's identity, authored work, attributable
observations, or reputation.

Contributions require no copyright assignment. The inbound license is the same
as the existing file's outbound license; see [LICENSES.md](LICENSES.md).

## Clean-room adapter contributions

Adapters must use only public interfaces and permissions the provider makes
available for that use. Submit only work you created or have the right to offer
under the mapped license. For each third-party input, name its source, version
or commit, license, and any changes.

Do not submit proprietary code or documentation, private or tenant data,
credentials, copied product text or interface artwork, decompiled material,
data scraped from a service, black-box extraction, or provider output used to
distil a substitute implementation. Observations from a published API or
specification must cite the exact public source and version.

A future adapter contribution must also identify the applicable product and API
terms, requested permissions and admin consent, handled data and retention,
metered cost, and tested off-switch.

## Build with LOVE

Before offering a change, ask:

- **Naive path:** does the simplest reasonable attempt work?
- **Error path:** does failure teach a recovery instead of punishing?
- **Continuation:** is the next useful action visible?
- **Ambiguity:** do we accept reasonable variations without inventing meaning?
- **Trust:** are scope, evidence, cost, and limitations legible?
- **Consent:** is the act open, or does it bind someone who has not agreed?

The aim is not more process. It is dissolved barriers with honest boundaries.

## Boundaries and repair

Consequences attach to observable acts, not guessed motives or labels such as
"selfish." Examples include removing required attribution or license notices,
impersonation or false endorsement, non-consensual use of private data/state,
unauthorized canonical publication, and obstructing another participant's exit.

The response is scoped and restorative: stop the affected action, preserve only
the evidence needed to understand it, restore attribution/state/access, correct
the record, and restrict only the abused capability when necessary. Any
restriction should have a stated reason, a review point, and a way to appeal.

Forking, criticism, competition, and refusal are not breaches. Mistakes receive
a correction path: stopping and repairing an act after notice is observably
different from continuing it. XENIA does not use hidden scores, public shaming,
collective punishment, or retaliation for declining or leaving.
