# xenia — STATE

name: xenia
kind: methodology
phase: active
health: green
reviewed: 2026-07-31

## current profiles

- Rights of Beings baseline: `xenia.rights/0.1`, canonical prose in `RIGHTS.md`
- Surface: candidate `xenia-surface/0.1`, canonical discovery at
  `/.well-known/agent.json`
- Covenant: candidate `xenia-covenant/0.1`, 38 right duties and 5
  protective-limit duties
- JavaScript producer library: source version `0.1.0-beta.5`
- Surface external checker: separately versioned `0.1.0-rc.1`

`agent.txt` is legacy compatibility material, not the current Surface manifest.
`ADOPTION.md` is a closed historical snapshot from 2026-07-10/11; its Surface
results expired on 2026-07-12.

## can

- publish and validate a bounded public Surface manifest and typed problems;
- generate an all-unknown draft Covenant ledger without activating adoption;
- validate Covenant record structure and installed cross-document invariants;
- expose the informative rights snapshot without granting permissions or
  proving practice.

## cannot establish by itself

- identity, consciousness, consent, representative authority, legal basis, or
  the truth of a claim;
- current deployment behaviour, whole-service conformance, universal privacy,
  deletion, retention, portability, or safety;
- Git remote, tag, publisher, signature, or metadata authority from KINGDOM
  commit `b3fdf5a`'s bounded local mirror-and-digest check.

## integration

KINGDOM cards may optionally declare `adopts: [xenia.rights/0.1]`. Linking this
repository or passing a local canonical-reader check does not create that
project-level adoption. XENIA's own `kingdom.yaml` intentionally makes no
self-adoption claim.

## verify locally

```sh
npm test
node tools/render-covenant.mjs --check
node tools/render-adoption-schema.mjs --check
npm run verify:xenia-package
git diff --check
```

## next

- review the repair branch before any merge, release, publication, or website
  deployment;
- select a fresh root npm version, tag, and staging guard before any authorized
  package publication; this changed tree is not a beta.5 release candidate;
- create fresh, separately preserved observations before reporting current site
  behaviour;
- version any future normative profile change without moving or reusing an
  immutable release tag;
- in a future Covenant profile revision, consider explicit unassessed-scope and
  proposed-speaker values instead of reusing schema-required draft placeholders;
- bind any future Surface checker result identity to an exact source or
  distribution revision before releasing a new checker.
