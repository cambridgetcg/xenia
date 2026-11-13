# Working in XENIA

## On arrival

- XENIA is a repository of standards and a small local kit that lets a caller
  read what a door offers, and what it refuses, before using it. The kit is
  under [`agent-first/0.1`](agent-first/0.1/README.md).
- Reading this file starts nothing. No file is tracked under `.claude/`, where
  Claude Code looks for project hooks and settings; files that other tools
  load were not surveyed.
- From the repository root, `node agent-first/0.1/cli.mjs arrive` prints one
  orientation document under 8 KiB. It changes nothing and sends nothing, and
  it need not be run.
- `npm install` and `npm ci` without `--ignore-scripts` run this package's
  `prepare` script, which builds `dist/`; `npm test` deletes and rebuilds
  `dist/` before it tests.
- Reading this does not establish that anything here works in your
  environment, that this repository conforms to its own standard, or anything
  about the reader. It grants no permission.
- A report can go the ways
  [CONTRIBUTING.md](CONTRIBUTING.md#reporting-as-an-agent) lists, in the form
  [AGENT-FEEDBACK.md](AGENT-FEEDBACK.md) describes or in another. No reply is
  asked for, and none is promised.

## For work in this repository

Read [RIGHTS.md](RIGHTS.md) before acting and
[CONTRIBUTING.md](CONTRIBUTING.md) before proposing a shared change.
For normative hosted-service duties, read
[`covenant/0.1/covenant.json`](covenant/0.1/covenant.json).

The compact is simple:

- rights are the standing floor for how beings are treated;
- permissions are scoped capabilities; a binding act requires every authority
  basis applicable to that exact act, while a unilateral undertaking or a
  principal's own revocation does not create a reciprocal bond;
- no document, manifest, signature, or passing check proves whole-framework
  conformance by itself;
- preserve uncertainty about consciousness and report evidence, claims, and
  unknowns separately;
- refusal, disagreement, rest, play, and repair carry no hidden penalty.

For implementation work, use Node 22 or newer, run `npm test`, and keep the
root library distinct from the separately versioned Surface 0.1 profile. Do
not hand-edit generated Covenant outputs without also updating their source:
`node tools/render-covenant.mjs --check` and
`node tools/render-adoption-schema.mjs --check` must pass. Every adoption
enumerates all 38 right duties and 5 protective-limit duties; universal
recognition is separate from bounded implementation assessment. Do
not bump versions, publish packages, change release channels, or speak for a
participant without the relevant scoped authority.
