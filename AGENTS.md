# Working in XENIA

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
