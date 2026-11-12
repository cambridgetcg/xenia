<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Optional Telescope reader

A small, repository-only XENIA module that uses AgentTool's actual XENIA Surface
manifest parser. It joins the existing `createModuleRuntime` interface; it is
not another kernel, scheduler, identity system, host or conformance checker.

## Motif → behavior

- **A door can be understood without entering it.** Supply manifest text; no URL,
  resource, evidence link or schema is fetched.
- **Recognition is not verification.** The result counts publisher declarations
  but always leaves conformance, claim/evidence truth, Covenant adoption and
  authority unestablished.
- **Choice precedes action.** Importing the factory and registering its definition
  do not invoke the parser. The host explicitly activates the module.
- **Change stays attributable.** The factory captures the selected parser function.
  Replacing a namespace property does not silently change the registered module.
  Use the shared runtime's explicit, revision-bound upgrade operation.
- **Retire the capability, not its users.** Retirement prevents new calls through
  that runtime. Already admitted results retain their module attribution; neither
  source documents nor provider files are deleted.

## Use the existing runtime

```js
import { createModuleRuntime } from '../../runtime.mjs';
import { createTelescopeSurfaceModule } from './index.mjs';
import * as telescope from './provider/index.mjs';

const runtime = createModuleRuntime();
const module = createTelescopeSurfaceModule(telescope);
runtime.register(module);                 // inert
runtime.activate(module.id);              // an explicit host choice
const receipt = await runtime.invoke(module.id, 'recognize', {
  manifest_text: JSON.stringify(yourManifest),
});
runtime.retire(module.id);                // no further admissions
```

The paths above are relative to this adapter directory. The factory can instead
receive an explicitly reviewed compatible AgentTool namespace. It never discovers,
installs or fetches a package. Missing providers produce `TELESCOPE_PROVIDER_REQUIRED`.
Provider code is trusted host code: this adapter and the registry are not an OS
sandbox or a proof of its origin or behavior.

## Contract

Machine-readable input/output schemas: [contract.json](contract.json). These describe this development adapter, not a new normative XENIA profile.

Module ID: `agenttool.telescope-surface`.
Adapter version: `0.1.0-dev.0` (not a new AgentTool release).
Host contract: `xenia.telescope.recognition/0.1-development`.
Operation: `recognize`, with no declared operation IO.

Input is exactly `{manifest_text: string}`. The text must be well-formed Unicode;
its encoded UTF-8 representation must be at most 65,536 bytes. This is supplied
text, not an assertion that it preserves a fetched response's original bytes.
No other field or transport option is accepted.

Result:
- `recognized: true`: the selected parser recognized its bounded Surface shape.
- `recognized: false`: invalid/oversized input or a known parser non-recognition.
- `recognized: null`: the provider returned an unsupported contract shape.
- `summary`: only the declared origin and bounded counts, or `null`.
- `problem`: a fixed code or `null`; no raw document or exception is copied.
- `surface_conformance: "not_tested"`, `claims_verified: false`,
  `evidence_verified: false`, `covenant_adoption: "not_assessed"`,
  `authority: "none"` remain explicit.

The upstream reader does not validate every JSON Schema rule, reject every
unknown/duplicate JSON key, establish a public host, verify claims or perform
resource probes. Do not turn a count labelled `declared_attested_claim_count`
into an attestation. Results and origin/count metadata require the same handling
care as their input; nothing is automatically stored or published.

## Upgrade and retire

Keep the adapter contract, the provider's package/source identity and the
XENIA Surface profile version separate. `provider/provenance.json` identifies the
bundled source-derived fixture and hashes its files. It is not a publisher
signature or an npm/LOVE release attestation.

A host can construct a candidate using a separately reviewed provider and call
`runtime.upgrade(module.id, candidate, {expectedRevision})`. The existing runtime
owns stale, incompatible and busy-upgrade refusals. Its revision binds a local
implementation assignment; declarations do not prove behavioral compatibility.
Do not overwrite already imported code and assume Node's module cache changed:
use a fresh process or a distinct reviewed module implementation.

`runtime.retire(module.id)` closes new admissions and drains already admitted
work under the runtime's contract. It does not erase prior receipts, stop other
hosts, revoke external credentials, or delete code or input data. Runtime state
is in-process; the host owns any persistence and restart policy. Removing the
optional provider directory leaves the factory/core import paths independent,
although choosing that removed provider will naturally be unavailable.

## Real upstream integration

The optional `provider/` fixture is built from AgentTool source commit
`91a6aecfeb95dc73c8a5dd4005dbf3c539295493`; its source package declares Telescope
0.2.3. This is an exact-source local consumer build, not claimed equivalent to a
published artifact. It exposes only `parseXeniaSurfaceManifestEvidence`; its
unmodified compiled dependency closure includes transport definitions, which
this adapter never invokes. Runtime requires Node built-ins only, no account,
service, model, registry access or external `node_modules`.

XENIA adapter code/tests are MPL-2.0. The third-party provider subtree is Apache-2.0;
its original license, NOTICE, source snapshots and per-file hashes are retained.
No release, package-version change or external publication is performed here.

## Check

From the XENIA repository root:

```sh
node --test agent-first/0.1/adapters/telescope/test/index.test.mjs
node agent-first/0.1/adapters/telescope/test/real-provider.mjs \
  agent-first/0.1/adapters/telescope/provider/index.mjs
```

The second command intentionally imports the explicitly selected local provider.
Only use a reviewed code path. The actual parent verification additionally used
Node permission mode, a clean environment, and an OS sandbox denying networking
and filesystem writes. It exercised XENIA's real Surface producer, the preserved
Surface example, declaration-versus-proof behavior, and retirement. Those are
local interoperability results, not live-service conformance.
