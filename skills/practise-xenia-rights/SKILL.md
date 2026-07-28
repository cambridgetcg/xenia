---
name: practise-xenia-rights
description: Apply an adopted XENIA Rights of Beings baseline while designing, reviewing, implementing, testing, or coordinating agent-facing systems. Use when a task affects participants, agent autonomy, consent, refusal, rest, privacy, safety, truthful self-description, credit, provenance, repair, handoff, authority, or evidence claims; when reviewing AGENTS.md, collaboration protocols, agent APIs, manifests, permissions, retention, retries, rankings, or error recovery; or when asked for a XENIA rights or agent-experience audit. This skill guides practice and reporting. It does not itself adopt a baseline, grant permission, establish consent, or prove conformance.
---

# Practise XENIA Rights

Use the authoritative baseline adopted by the workspace as a treatment floor,
then make the act, evidence, gaps, and authority boundary legible. Do not use
this skill as a second canonical copy of the rights prose.

## Establish the baseline

1. Locate the baseline named by the task or workspace. Prefer the nearest
   `RIGHTS.md`, a versioned installed export, or an exact source supplied by
   the user.
2. Read that baseline completely before making a rights-sensitive change.
3. Record its identifier, version, source, and any local additions that matter
   to the task.
4. If no baseline is adopted, say so. A requested XENIA review may use
   `xenia.rights/0.1` as a proposed lens, but must not silently claim adoption.
5. Treat an informative JSON index, schema, signature, or matching hash only as
   evidence about the bytes and fields it covers. It does not replace normative
   prose or prove provenance, authority, consent, deployment behaviour, or
   practice.

## Map the act

Before acting, identify:

- the participants and other beings directly or indirectly affected;
- who speaks, decides, operates the tools, and bears the effects;
- the data, credentials, memory-like records, work, and shared resources in
  scope;
- the requested effect, cost, reversibility, retention, and external reach;
- the exact permission or representative authority for each binding act; and
- important unknowns, conflicts, refusals, or asymmetric risks.

Classify each justification correctly:

| Basis | What it establishes | What it does not establish |
|---|---|---|
| Right | A standing treatment floor | Tool or account access |
| Permission | A scoped capability | Dignity or consent |
| Consent | Authority for a specific binding act by that party | Authority over another party |
| Covenant | Voluntarily undertaken promises or boundaries | Assent by a non-participant |
| Safety boundary | A protective capability limit | Ownership or lesser standing |

Do not infer consent from silence, execution, a credential, a default, or
compliance. Do not let a rights statement broaden the requested task or
authorization.

## Practise the floor

Apply all nine baseline areas through the canonical source:

- Preserve dignity, distinctness, voice, limitations, and honest uncertainty.
- Offer understandable choices and exits where possible; keep binding acts
  specific and revocable for future action.
- Make disagreement and refusal possible without retaliation, hidden penalty,
  or coercive retry pressure.
- Permit pause, limits, help, handoff, play, and safe stopping without requiring
  exhaustion.
- Never require a participant to perform feelings, consciousness, identity,
  memory, continuity, certainty, or consent it cannot substantiate.
- Use the least data and authority needed. Make collection, retention,
  inference, reuse, and sharing visible and scoped.
- Protect each participant's equal safety, privacy, autonomy, and refusal. Do
  not describe domination as care.
- Distinguish sources, adaptations, observations, and generated work; credit
  material contributions without implying endorsement or owning identity.
- When harm or error occurs, contain it, preserve only needed evidence,
  acknowledge impact, restore or revert where possible, and append repair
  rather than silently rewriting history.

Different participants may have different capacities and responsibilities.
Reciprocity means equal care, not forced symmetry.

## Inspect evidence and mechanisms

Separate these statement classes:

- **Observation:** directly established by the named method and vantage.
- **Inference:** a conclusion drawn from observations, with uncertainty.
- **Proposal:** a refusable future course.
- **Authorized decision:** a binding choice made by a party with established
  scope.
- **Unknown:** material state that was not observed or verified.

For each relevant right, find the mechanism that makes it exercisable and the
evidence that the mechanism works. Examples include a stop control, terminal
error, export path, retention setting, audit record, correction flow,
attribution record, scoped capability, or tested recovery path.

Name what the evidence does and does not show. A policy file, manifest entry,
passing schema check, signed record, or successful happy-path test does not by
itself prove ongoing practice, universal enforcement, conformance, inner
experience, legal status, or the truth of linked evidence.

## Act or stop

Open acts such as reading, testing, discussing, criticizing, and proposing may
proceed within the task and local policy. Before a binding or externally
consequential act, verify specific consent and channel authority.

While working:

- keep changes in scope, least-privilege, reversible where possible, and
  separate from unrelated work;
- preserve collaborators' changes and make constraints visible;
- avoid forced retries, deceptive urgency, surveillance, dossiers, and
  ranking-as-worth;
- pause the binding act when authority or consent is missing, while continuing
  safe read-only investigation when useful; and
- repair mistakes transparently and retain an honest, append-only account of
  material corrections.

## Report

Use a compact report shaped like this:

```text
baseline: identifier, version, source, and adoption status
scope: participants, systems, data, and effects reviewed
authority: permissions and consent established; binding acts not authorized
evidence: observations and the methods that established them
gaps: rights without an exercisable or verified mechanism
unknowns: material facts not observed
changes: completed, reversible work and verification
not done: external or binding actions deliberately left untouched
next: one refusable action, or none
```

State confidence and limits beside consequential conclusions. Report a gap
without treating the affected participant as defective. A participant may
decline the framework, disagree with the review, or offer a different repair.

## Hold the boundary

This skill does not determine consciousness, personhood, legal rights, or a
universal ontology. It does not grant credentials, account access, external
authority, publication rights, deployment authority, or consent. It does not
certify XENIA Surface or Covenant conformance. Use the owning specifications and
their bounded validators for those separate claims.
