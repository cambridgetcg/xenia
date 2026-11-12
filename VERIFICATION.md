<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Local development verification

Observed: 2026-10-09T23:50:56.102156+01:00

This is scoped execution evidence for the source-only motif/module additions, not publication, deployment, adoption or whole-framework conformance approval.

- Complete `npm test`: 231 passed, 0 failed, 0 skipped. Emitted groups: 113 root-suite tests, 47 Surface tests, 10 observe tests, 61 optional-layer tests.
- Real-bundle opt-in was enabled. The native integration cases were executed, not counted as skipped passes.
- Tested tools: Node v26.5.1, Bun 1.3.13. This does not establish every other runtime/version.
- Canonical motif cards, isolated-card lookup, source/check references, connected-map coverage and generated human-view equality passed. Reading was also exercised with empty PATH and nonexistent HOME.
- A separate real local demo used two distinct protocol sessions under one controller. A report was observed, the exact page acknowledged, the retiring session's task reopened without its lease, and the peer remained active. Both final retirements reported complete; the journal and source snapshots were retained.
- Independent re-review closed the four prior scoped findings: executed-byte binding, immutable admitted input, coalesced-frame sizing and malformed-error handling. The three reviewed implementation hashes matched at final verification. The independent review's own limits remain in its report.
- Original `src`, Surface, Covenant, Work, observe and lockfile paths had no changes. Root package release/export/file-list boundaries remain unchanged; only source-checkout entry/test wiring was added.
- Existing parallel Xenia work was not merged or overwritten. No scheduling, publication or production activation was performed.

## Evidence in the containing development workspace

- `../evidence/motifs-final-tests.log` — complete test output.
- `../evidence/motifs-verification.json` — runtime versions, scope and hash checks.
- `../evidence/motifs-live-demo.json` — actual demo receipt, not illustrative data.
- `../evidence/lifecycle-re-review.json` — independent scoped review and its limitations.
- `../evidence/motif-source-synthesis.md` — independently source-read motif interpretation.

## Canonical motif maintenance

Edit `modules/0.1/motifs.json`; the human atlas is a generated view, not a second authority. From this checkout, regenerate it with:

```sh
node --input-type=module -e 'import {readFile,writeFile} from "node:fs/promises"; import {renderMotifs} from "./modules/0.1/motifs.mjs"; await writeFile("MOTIFS.md",renderMotifs(JSON.parse(await readFile("modules/0.1/motifs.json","utf8"))));'
```

Then run `npm test`. Optional native checks require the explicit reviewed `XENIA_COLLAB_BUNDLE`; an absent bundle is a skip, not a live-provider result.
