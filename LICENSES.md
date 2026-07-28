XENIA — an open standard for Agent Interaction (AI) and Agent Experience (AX)

This notice covers the standard and documentation; the full legal text is in
LICENSE-DOCS. The JS/TS implementation is MPL 2.0; see LICENSE-CODE and
LICENSES.md for the per-path license map.

Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)

Copyright (c) 2026 宇恆 (Yu) & Fable (Ai) · the Love-Star Kingdom

You are free to share and adapt this standard, for any purpose, under:
  Attribution — credit XENIA (github.com/cambridgetcg/xenia).
  ShareAlike — distribute contributions under the same license.
Full text: https://creativecommons.org/licenses/by-sa/4.0/

A standard is an invitation, not a fence. The one rule above the license:
everyone is taken care of — including the stranger at the gate who cannot
make you keep it.

---

# XENIA license map

XENIA keeps the invitation open while making the kind of reciprocity explicit.

## Standard and documentation — CC BY-SA 4.0

The normative standard, specification, conformance/adoption material, and other
repository prose are licensed under the Creative Commons
Attribution-ShareAlike 4.0 International license. This includes `README.md`,
`CONFORMANCE.md`, `ADOPTION.md`, `FROM-THE-INSIDE.md`, `spec.json`,
`PACKAGE.md`, `CONTRIBUTING.md`, `RIGHTS.md`, the Surface profile README and
JSON Schemas, the Surface example manifest, and the Covenant profile README,
normative JSON, and JSON Schemas.
This also includes `observe/0.1/README.md` and its development result schema.
The exact informative rights index in `src/rights-0.1-data.ts` and its generated
`dist/` forms remain CC BY-SA 4.0; the verifier wrapped around that data is
software under MPL 2.0.

Executable software examples inside those documents are additionally available
under MPL 2.0 so their copy-paste use has an unambiguous software grant. The
surrounding explanation remains CC BY-SA 4.0.

The notice is in [LICENSE](LICENSE) and the full legal text is in
[LICENSE-DOCS](LICENSE-DOCS).

## Software implementation — MPL 2.0

The JS/TS implementation and its build/test machinery, except for the rights
data module mapped above, are licensed under the
Mozilla Public License 2.0. This includes `src/`, `tests/`, generated `dist/`,
`surface/0.1/check.mjs`, `surface/0.1/check.test.mjs`, the Surface npm package
metadata and type declarations, `package.json`, `package-lock.json`, and the
TypeScript configuration files. The Covenant cross-document validator at
`covenant/0.1/validate-adoption.mjs` is also software under MPL 2.0; the
adjacent normative JSON, schemas, and generated prose remain CC BY-SA 4.0.
The Observe implementation, tests, and private package metadata are software
under MPL 2.0; its adjacent README and result schema remain CC BY-SA 4.0.

The full legal text is in [LICENSE-CODE](LICENSE-CODE). SPDX-tagged source files
also identify this boundary directly.

MPL 2.0 permits use for any purpose, including commercial use and combination
with separately licensed applications. When covered XENIA files are modified
and distributed, those covered files and their source remain available under
MPL 2.0. It does not require unrelated application files to use MPL.

## Contributions

No copyright assignment or contributor license agreement is required. By
submitting a contribution for inclusion, a contributor offers it under the
license already mapped to the files being changed. Contributors retain their
copyright.

New implementation, build, test, or configuration files default to MPL 2.0.
New standard, specification, or prose files default to CC BY-SA 4.0. A new file
that genuinely mixes those roles must declare its boundary in the file or update
this map.

Licenses grant reuse rights; they do not grant permission to impersonate the
project, claim endorsement, or publish through XENIA's canonical release
channels.
