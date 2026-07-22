# XENIA observe 0.1 development workbench

`xenia observe` records a bounded Surface result beside an optional Covenant
adoption record. It does not turn Surface GET observations into Covenant duty
outcomes, score a host, certify a being, or claim whole-XENIA conformance.

This workspace is deliberately private and marked `development-draft`. Its
local URN is not a published release identity. A separately authorized release
must choose and freeze a public version before anybody relies on it as a stable
interchange contract.

From this repository:

```sh
npm run xenia:observe -- observe https://example.com/ \
  --out ./evidence/example
```

Optionally check a host-supplied adoption without modifying it:

```sh
npm run xenia:observe -- observe https://example.com/ \
  --adoption ./rights-adoption.json \
  --out ./evidence/example-with-adoption \
  --json
```

The output directory must not exist. The workbench writes a complete sibling
temporary directory and then renames it into place. It refuses a directory
already present in normal local use; the preflight and final checks are not a
distributed lock and do not eliminate every concurrent filesystem race.
Supplied adoption input is read once through one open file handle, rejects
invalid UTF-8, and is bounded to 2,000,000 bytes. The
bundle files are created owner-readable/writable by default.

The bundle contains:

- `surface-result.json` — the unchanged Surface checker result;
- `adoption.json` — only when supplied, copied as exact input bytes;
- `observe-result.json` — hashes and separate validation states.

Exit `0` means the bundle was recorded and any supplied adoption was
schema-valid, cross-document consistent, and named the same target origin.
Exit `1` means the bundle was still recorded but the supplied adoption failed
one of those record checks. A Surface `nonconformant` or `indeterminate` result
is still successful evidence collection. Exit `2` means misuse or an incomplete
bundle, in which case no final output directory is intentionally left behind.

Shape and semantic validation do not authenticate the speaker, fetch pinned
sources, execute cited tests, verify signatures, inspect deployment behavior,
or establish that evidence is true.
