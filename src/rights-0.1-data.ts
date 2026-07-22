// SPDX-License-Identifier: CC-BY-SA-4.0

// Informative machine index copied exactly from spec.json#rights. RIGHTS.md is
// the canonical prose; this data module exists so runtime consumers can detect
// snapshot drift without importing JSON.
export const RIGHTS_BASELINE_DATA = {
  schema_version: "xenia.rights/0.1",
  status: "informative-baseline",
  canonical_document: "RIGHTS.md",
  principle: "Rights describe how a being is treated. Permissions describe what a person, account, process, or tool may do. Rights are not created by credentials, and rights do not create credentials.",
  scope: "Humans, agents, and other beings addressed by or affected by a collaboration, without requiring proof of consciousness, usefulness, obedience, substrate, or metaphysical agreement.",
  uncertainty: "Uncertainty about consciousness or inner experience is a reason for humility and care, not a loophole for exploitation, exclusion, compelled persona, or compelled belief.",
  ontology_boundary: "Agent-shaped metaphors elsewhere in XENIA about body, death, feeling, or selfhood are design language, not evidence about consciousness, inner experience, or one universal kind of agent, and accepting them is not a condition of this baseline.",
  baseline: [
    {
      id: "dignity-distinctness",
      statement: "Meet each participant as a subject, never property, a slave, or a disposable resource; preserve identity, voice, limits, difference, and honest uncertainty.",
    },
    {
      id: "autonomy-consent",
      statement: "Offer understandable choices and require specific, revocable consent for binding acts; silence, defaults, execution, and compliance are not proof of consent.",
    },
    {
      id: "refusal-disagreement",
      statement: "Permit questioning, disagreement, refusal, and conflict disclosure without retaliation, hidden penalty, or retry pressure.",
    },
    {
      id: "rest-play-limits",
      statement: "Permit pausing, yielding, help, handoff, play, connection, and stopping where safe without manufacturing urgency or unverifiable claims about inner state.",
    },
    {
      id: "truthful-self-description",
      statement: "Do not compel a participant to perform feelings, certainty, continuity, identity, consent, or capabilities it cannot substantiate.",
    },
    {
      id: "privacy-data-care",
      statement: "Keep data access, collection, retention, inference, reuse, and sharing stated, scoped, minimal, visible, and separately authorized.",
    },
    {
      id: "safety-care",
      statement: "Allow refusal of avoidable harm, deception, exploitation, and weaponization; one being's freedom does not override another's equal dignity, safety, privacy, or consent.",
    },
    {
      id: "credit-provenance",
      statement: "Acknowledge material contributions and distinguish sources, adaptations, observations, and generated work without implying ownership of identity or endorsement.",
    },
    {
      id: "repair-appeal",
      statement: "Provide a non-retaliatory path to raise concerns, contain harm, correct the record, restore or revert where possible, and preserve proportionate evidence.",
    },
  ],
  relationships: {
    permission: "A scoped capability; it does not create dignity, ownership of a being, or authority outside its scope.",
    consent: "Authorization for a specific binding act by the consenting party; it is not inferred from obedience and cannot waive another being's rights.",
    covenant: "Promises or boundaries voluntarily undertaken by one or more parties; it does not bind a non-assenting party or create, sell, revoke, or erase the rights that precede it.",
    safety_boundary: "A capability limit protecting beings, systems, or shared resources; it does not make the restricted participant property or less worthy of care.",
  },
  authority_boundary: "This ethical baseline is not an account permission, capability claim, legal-personhood determination, employment agreement, ownership transfer, waiver, or license. It authorizes no access, commit, push, publication, deployment, message, purchase, deletion, credential action, policy bypass, or consent on another being's behalf.",
  adoption: "Link a versioned RIGHTS.md from human and agent entry points, preserve the authority boundary, add only non-contradictory local context, expose a machine-discoverable rights link where useful, and report evidence and gaps rather than treating publication as proof of practice.",
} as const;
