<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
# Inspect a capability before activating it

A repository-only optional adapter for Xenia's agent-first runtime. It asks one
question: **what is structurally present in this explicitly selected local skill
tree?** It does not decide whether the instructions are true, safe to execute,
authorized, or worth following.

## The pieces, in plain language

- **Xenia runtime:** owns registration, explicit activation, the host's read gate,
  pause, revision-bound replacement, and retirement.
- **This adapter:** binds one root and one provider export, checks the expected
  report family/version/read-only declaration and the counters it consumes, and
  snapshots each result. It does not duplicate an inspector or add a state engine.
- **AgentTool Skills:** performs the actual bounded file inspection. It reports
  metadata shape, resource inventory, requested capabilities, findings and digests.
- **Host/operator:** chooses and trusts the provider code and root, supplies current
  authority, retains reports if desired, and controls any later skill execution.

A definition is not active merely because it is described. A structural pass is
not an execution permit. Retiring this component does not revoke a being's rights
or erase a skill, note, or earlier report.

## One runnable reference host

From the Xenia repository root:

```sh
node agent-first/0.1/examples/inspect-skills.mjs --help
node agent-first/0.1/examples/inspect-skills.mjs /absolute/reviewed/provider/index.js /absolute/selected/skill-root 0.3.3
```

Both paths are explicit. The provider module must already exist and be reviewed:
**importing a JavaScript module executes that module's code.** This example never
fetches or installs one and is not a sandbox. A manifest, skill instruction, or
report must not select the module path or turn itself into host authorization.

The command reads the selected root once, retires its module instance, and prints
only a compact JSON summary. It does not print the skill body, arbitrary metadata,
findings text, or the absolute root. Exit 0 means the provider's structural report
is valid; exit 1 means the inspection returned findings that make it invalid;
exit 2 means arguments, loading, compatibility, or invocation failed. After an
import/invocation failure, the example conservatively reports an unknown effect
outcome and does not retry.

This adapter is intentionally optional beside the separately developed Xenia
profile modules and AgentTool local-starter integration. The example is a small
reference host, not another installer, scheduler, model harness, hosted API,
capability-discovery service, or mandatory entry point for Xenia's core.

## Programmatic use

```js
import { createModuleRuntime } from '../runtime.mjs';
import { createSkillsInspectorModule } from './skills-inspector.mjs';

// Supplied by your trusted host, never discovered from a skill's text:
const root = '/absolute/selected/skill-root';
const provider = alreadyReviewedProviderNamespace;
const definition = createSkillsInspectorModule({ provider, root, providerVersion: '0.3.3' });
const runtime = createModuleRuntime({
  authorize: request => request.module.id === definition.id &&
    request.operation === 'inspect' && request.input === null &&
    request.effects.length === 1 && request.effects[0] === 'local-read',
});
runtime.register(definition);       // no filesystem read
runtime.activate(definition.id);    // still no filesystem read
const receipt = await runtime.invoke(definition.id, 'inspect');
runtime.retire(definition.id);      // admission closes; source files remain
```

The example policy is narrow routing, not authentication or proof of consent.
A real host must retain the root/provider selection it authorized, and may also
pin the allowed runtime revision. A privileged host deliberately replacing the
root or provider must re-evaluate its authority; the runtime is not an OS sandbox
for arbitrary trusted JavaScript handlers.

The root is lexically resolved once, using the same Node path convention as the
provider. After the host gate, the adapter checks that it is an existing directory,
not a file or a symlink root (including a trailing-slash spelling). AgentTool's
direct API also accepts `SKILL.md`, `package.json` and plugin manifests, then
inspects their enclosing root; this adapter deliberately refuses those file-target
shortcuts. Missing/unsupported roots never reach the provider. The metadata check
and provider call are not an atomic filesystem snapshot: ancestor replacement and
hostile concurrent path mutation remain outside this guarantee. Use an immutable
selected tree when that matters.

`inspect` accepts no per-call arguments. There is no path override, install flag,
command, URL, credential, or grant field. The captured provider function cannot be
silently replaced by mutating its original namespace object. Construction rejects
accessor/proxy configuration rather than invoking those getters.

## Upgrade without mixing versions

These are different identities:

| Thing | Inspected identity | Meaning |
|---|---|---|
| Xenia repository base | `7a6794e1e17dc80770a6ad4294d55cf7171e3de5` | Existing framework and unchanged published-package boundary |
| Adapter | `0.1.0`, `agent-first.skills-inspector/0.1` | Repository-only adapter API, not a new normative Xenia profile |
| AgentTool source | `91a6aecfeb95dc73c8a5dd4005dbf3c539295493` | Upstream head observed through scoped GitHub access |
| Skills source | `@agenttool/skills` `0.3.3` | Actual source-built provider used in the integration test |
| Report | `agenttool.skills/inspect-v0.1`, `urn:agenttool:skills:inspection:v0.1` | Provider's declared report contract |
| Runtime revision | assigned by the runtime | This host's definition-replacement boundary |

Source was inspected at:
https://github.com/cambridgetcg/agenttool/tree/91a6aecfeb95dc73c8a5dd4005dbf3c539295493/packages/skills

The source lookup used existing authenticated GitHub access; this is not an
anonymous-access claim. A separate npm release lookup was approval-blocked.
**The latest published npm version and release-artifact compatibility were not
verified.** There is no package installation or registry workaround in this change.
No Xenia package version, export map, release channel, Surface, Covenant, Work
meaning, or adoption is changed. AgentTool source and dependency code are not
vendored into the adapter. AgentTool Skills is Apache-2.0; the new integration
code follows Xenia's MPL-2.0 code convention.

To upgrade, review the desired provider artifact/source and its report contract,
construct a new definition with an explicit version pin, then use:

```js
const current = runtime.describe(definition.id);
const replacement = createSkillsInspectorModule({
  provider: newlyReviewedProviderNamespace,
  root,
  providerVersion: explicitlyChosenVersion,
});
runtime.upgrade(definition.id, replacement, { expectedRevision: current.revision });
```

The runtime refuses stale revisions, in-flight replacement and contract/effect
changes. The adapter rejects a returned producer version that differs from its
pin. This is a consistency check of a trusted provider's report, **not publisher
authentication**. A pending host gate cannot survive a runtime upgrade or
pause/resume epoch change. Previous reports are detached snapshots, so changing a
provider object or receiving a new version does not rewrite them.

## Pause, retire, remove

- `pause(id)` stops new invocations; `activate(id)` explicitly resumes admission.
- `retire(id)` stops new invocations immediately and lets an already-started read
  drain. It cannot undo a read, forcibly interrupt a stuck trusted provider, or
  guarantee termination of arbitrary JavaScript.
- The inspector starts no retained sessions, credentials, timers, or workers that
  require adapter cleanup. Inspected files remain outside module code and are not
  deleted. Reports live with their caller; this adapter is not a durable store.
- A retired instance is terminal. Start a new host runtime if a later deliberate
  reintroduction is wanted; do not silently resurrect it.
- Remove the adapter/provider imports to omit the integration entirely. Other
  runtime modules still work; there is no mandatory AgentTool dependency in core.

## What the check does not establish

The adapter checks compatibility markers, read-only policy declarations and the
summary counters it uses. It is not a replacement for AgentTool's full report
schema or an independent verification of the provider's behavior. A caller
supplies trusted code; matching JSON fields cannot make malicious code safe.

The underlying inspector reports structural findings and withholds a digest when
coverage is incomplete. Its `sha256:` digest is a content binding, not a signature
or a safety certificate. Requested tools remain `trusted: false`. It does not
return instruction bodies, but paths and symbolic names may still be sensitive;
redaction is not a universal secrecy guarantee. Review a full report before any
sharing. No result grants permission, proves whole-framework conformance,
activates a skill, or settles the participant's nature or experience.

## Verification

Fast tests without the optional provider:

```sh
node --test tests/agent-first-skills-inspector.test.mjs tests/agent-first-runtime.test.mjs
```

The real-provider test is explicitly skipped unless a reviewed module is supplied:

```sh
XENIA_AGENTTOOL_SKILLS_MODULE=/absolute/reviewed/provider/index.js \
  node --test tests/agent-first-skills-inspector.test.mjs tests/agent-first-runtime.test.mjs
```

It creates only synthetic temporary skills, inventories a script without running
it, checks report markers and non-disclosure of the instruction body, invokes the
reference host, verifies pause/resume and retirement, and confirms the input bytes
remain. It also verifies an invalid skill stays an inspection finding, not an
execution approval. Unit contract fixtures are synthetic, not remote responses or
release evidence.

Normal repository gates remain `npm test` and both generated Covenant checks.
