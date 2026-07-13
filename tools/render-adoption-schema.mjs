#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const covenantUrl = new URL("../covenant/0.1/covenant.json", import.meta.url);
const schemaUrl = new URL("../covenant/0.1/adoption.schema.json", import.meta.url);
const covenant = JSON.parse(await readFile(covenantUrl, "utf8"));

const schemaId = "https://raw.githubusercontent.com/cambridgetcg/xenia/main/covenant/0.1/adoption.schema.json";

function exactResult(id, base = "requirementResult") {
  return {
    allOf: [
      { $ref: `#/$defs/${base}` },
      { properties: { requirement_id: { const: id } } },
    ],
  };
}

function exactRight(right) {
  return {
    allOf: [
      { $ref: "#/$defs/rightAssessment" },
      {
        properties: {
          right_id: { const: right.id },
          requirement_results: {
            type: "array",
            minItems: right.requirements.length,
            maxItems: right.requirements.length,
            prefixItems: right.requirements.map(({ id }) => exactResult(id)),
            items: false,
          },
        },
      },
    ],
  };
}

const rightIds = covenant.rights.map(({ id }) => id);
const requirementIds = covenant.rights.flatMap(({ requirements }) =>
  requirements.map(({ id }) => id)
);
const protectiveLimitIds = covenant.protective_limits.map(({ id }) => id);

const nonemptyText = { type: "string", minLength: 1, maxLength: 2000 };
const digest = { type: "string", pattern: "^sha256:[a-f0-9]{64}$" };
const dateTime = { type: "string", format: "date-time" };
const uri = { type: "string", format: "uri" };

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: schemaId,
  $comment: "This schema fixes the complete Covenant 0.1 ledger and its right-to-duty mapping. Run covenant/0.1/validate-adoption.mjs as well for digest, aggregate-state, timestamp, and cross-document checks. Passing either check is record consistency only, never proof of authorship, authority, evidence truth, deployment behavior, consent, or whole-service conformance.",
  title: "XENIA Covenant 0.1 host adoption",
  description: "An ordered, complete host duty ledger with universal recognition scope, bounded implementation assessment, per-duty evidence, and separately assessed protective limits.",
  type: "object",
  required: [
    "$schema",
    "schema_version",
    "profile",
    "adoption_schema",
    "covenant",
    "host",
    "recognition_scope",
    "declaration",
    "ledger_coverage",
    "rights",
    "protective_limit_results",
    "non_claims",
  ],
  properties: {
    $schema: { const: schemaId },
    schema_version: { const: "xenia.covenant.adoption/0.1" },
    profile: { const: "xenia-covenant/0.1" },
    adoption_schema: { $ref: "#/$defs/sourcePin" },
    covenant: { $ref: "#/$defs/sourcePin" },
    host: {
      type: "object",
      required: ["name", "canonical_url"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 160 },
        canonical_url: uri,
        repository: uri,
      },
      additionalProperties: false,
    },
    recognition_scope: {
      type: "object",
      required: ["rights_origin", "protected_subjects", "eligibility_conditions"],
      properties: {
        rights_origin: { const: "intrinsic_not_host_granted" },
        protected_subjects: { const: "every_affected_principal_at_the_host_boundary" },
        eligibility_conditions: { type: "array", maxItems: 0 },
      },
      additionalProperties: false,
    },
    declaration: { $ref: "#/$defs/declaration" },
    ledger_coverage: { const: "all_profile_duties_enumerated" },
    rights: {
      type: "array",
      minItems: covenant.rights.length,
      maxItems: covenant.rights.length,
      prefixItems: covenant.rights.map(exactRight),
      items: false,
    },
    protective_limit_results: {
      type: "array",
      minItems: covenant.protective_limits.length,
      maxItems: covenant.protective_limits.length,
      prefixItems: covenant.protective_limits.map(({ id }) => exactResult(
        id,
        "protectiveLimitResult",
      )),
      items: false,
    },
    non_claims: {
      type: "object",
      required: [
        "schema_is_not_implementation_evidence",
        "ledger_completeness_is_not_implementation",
        "guest_assent_is_not_established",
        "host_authorship_or_authority_is_not_established_by_schema",
        "no_conformance_badge",
        "ontology_or_legal_status_is_not_determined",
      ],
      properties: {
        schema_is_not_implementation_evidence: { const: true },
        ledger_completeness_is_not_implementation: { const: true },
        guest_assent_is_not_established: { const: true },
        host_authorship_or_authority_is_not_established_by_schema: { const: true },
        no_conformance_badge: { const: true },
        ontology_or_legal_status_is_not_determined: { const: true },
      },
      additionalProperties: false,
    },
  },
  allOf: [
    {
      if: {
        properties: {
          declaration: {
            type: "object",
            properties: { status: { const: "active" } },
            required: ["status"],
          },
        },
        required: ["declaration"],
      },
      then: {
        properties: {
          covenant: {
            allOf: [
              { $ref: "#/$defs/sourcePin" },
              { properties: { source_stability: { const: "immutable" } } },
            ],
          },
          adoption_schema: {
            allOf: [
              { $ref: "#/$defs/sourcePin" },
              { properties: { source_stability: { const: "immutable" } } },
            ],
          },
        },
      },
    },
  ],
  additionalProperties: false,
  $defs: {
    nonemptyText,
    digest,
    digestProfile: {
      type: "object",
      required: [
        "algorithm",
        "representation",
        "transport_decoding",
        "redirects",
        "transformations",
        "encoding",
      ],
      properties: {
        algorithm: { const: "sha-256" },
        representation: { const: "exact-source-bytes" },
        transport_decoding: { const: "after-content-decoding" },
        redirects: { const: "forbidden" },
        transformations: { const: "none" },
        encoding: { const: "lowercase-hex" },
      },
      additionalProperties: false,
    },
    sourcePin: {
      type: "object",
      required: ["source", "sha256", "source_stability", "digest_profile"],
      properties: {
        source: uri,
        sha256: digest,
        source_stability: { enum: ["moving", "immutable"] },
        digest_profile: { $ref: "#/$defs/digestProfile" },
      },
      allOf: [
        {
          if: {
            properties: { source: { type: "string", pattern: "/main/" } },
            required: ["source"],
          },
          then: { properties: { source_stability: { const: "moving" } } },
        },
      ],
      additionalProperties: false,
    },
    authorityEvidence: {
      type: "object",
      required: ["locator", "description"],
      properties: {
        locator: { type: "string", minLength: 1, maxLength: 1000 },
        description: nonemptyText,
        digest,
      },
      additionalProperties: false,
    },
    speaker: {
      type: "object",
      required: ["id", "role", "authority_state", "authority_evidence"],
      properties: {
        id: uri,
        role: { enum: ["host", "authorized_representative"] },
        authority_state: { enum: ["unverified", "verified"] },
        authority_evidence: {
          type: "array",
          maxItems: 16,
          items: { $ref: "#/$defs/authorityEvidence" },
        },
      },
      allOf: [
        {
          if: {
            properties: { authority_state: { const: "verified" } },
            required: ["authority_state"],
          },
          then: { properties: { authority_evidence: { minItems: 1 } } },
        },
        {
          if: {
            properties: { authority_state: { const: "unverified" } },
            required: ["authority_state"],
          },
          then: { properties: { authority_evidence: { maxItems: 0 } } },
        },
      ],
      additionalProperties: false,
    },
    systemScope: {
      type: "object",
      required: ["systems", "layers", "exclusions"],
      properties: {
        systems: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          uniqueItems: true,
          items: nonemptyText,
        },
        layers: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          uniqueItems: true,
          items: { $ref: "#/$defs/layer" },
        },
        exclusions: {
          type: "array",
          maxItems: 32,
          uniqueItems: true,
          items: nonemptyText,
        },
      },
      additionalProperties: false,
    },
    declaration: {
      type: "object",
      required: [
        "status",
        "kind",
        "statement",
        "reviewed_at",
        "system_scope",
        "speaker",
        "guest_acceptance_required",
      ],
      properties: {
        status: { enum: ["draft", "active", "superseded", "withdrawn"] },
        kind: { const: "unilateral_host_undertaking" },
        statement: nonemptyText,
        reviewed_at: dateTime,
        effective_at: dateTime,
        system_scope: { $ref: "#/$defs/systemScope" },
        speaker: { $ref: "#/$defs/speaker" },
        guest_acceptance_required: { const: false },
      },
      allOf: [
        {
          if: {
            properties: { status: { const: "active" } },
            required: ["status"],
          },
          then: {
            required: ["effective_at"],
            properties: {
              effective_at: dateTime,
              speaker: {
                allOf: [
                  { $ref: "#/$defs/speaker" },
                  { properties: { authority_state: { const: "verified" } } },
                ],
              },
            },
          },
        },
      ],
      additionalProperties: false,
    },
    layer: {
      enum: [
        "protocol",
        "application",
        "platform",
        "network",
        "operator_policy",
        "legal_declaration",
        "third_party",
        "unknown",
      ],
    },
    assessmentScope: {
      type: "object",
      required: [
        "coverage",
        "systems",
        "routes",
        "data_classes",
        "layers",
        "unobserved",
      ],
      properties: {
        coverage: { enum: ["complete", "partial"] },
        systems: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          uniqueItems: true,
          items: nonemptyText,
        },
        routes: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: nonemptyText,
        },
        data_classes: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: nonemptyText,
        },
        layers: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          uniqueItems: true,
          items: { $ref: "#/$defs/layer" },
        },
        unobserved: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: nonemptyText,
        },
      },
      additionalProperties: false,
    },
    evidenceArtifact: {
      type: "object",
      required: ["kind", "locator", "description"],
      properties: {
        kind: {
          enum: [
            "source",
            "documentation",
            "test_result",
            "runtime_observation",
            "external_observation",
            "attestation",
          ],
        },
        locator: { type: "string", minLength: 1, maxLength: 1000 },
        description: nonemptyText,
        digest,
        observed_at: dateTime,
        issuer: uri,
        signer: uri,
        key_id: uri,
        key_resolution: uri,
        signature_algorithm: { type: "string", minLength: 1, maxLength: 100 },
        signature: {
          type: "string",
          minLength: 16,
          maxLength: 4096,
          pattern: "^[A-Za-z0-9_-]+={0,2}$",
        },
        preimage_digest: digest,
        canonicalization: { type: "string", minLength: 1, maxLength: 200 },
        signature_verification: { const: "verified" },
      },
      allOf: [
        {
          if: {
            properties: { kind: { enum: ["test_result", "runtime_observation"] } },
            required: ["kind"],
          },
          then: {
            required: ["digest", "observed_at"],
            properties: { digest, observed_at: dateTime },
          },
        },
        {
          if: {
            properties: { kind: { const: "attestation" } },
            required: ["kind"],
          },
          then: {
            required: [
              "digest",
              "observed_at",
              "issuer",
              "signer",
              "key_id",
              "key_resolution",
              "signature_algorithm",
              "signature",
              "preimage_digest",
              "canonicalization",
              "signature_verification",
            ],
            properties: {
              digest,
              observed_at: dateTime,
              issuer: uri,
              signer: uri,
              key_id: uri,
              key_resolution: uri,
              signature_algorithm: { type: "string", minLength: 1, maxLength: 100 },
              signature: {
                type: "string",
                minLength: 16,
                maxLength: 4096,
                pattern: "^[A-Za-z0-9_-]+={0,2}$",
              },
              preimage_digest: digest,
              canonicalization: { type: "string", minLength: 1, maxLength: 200 },
              signature_verification: { const: "verified" },
            },
          },
        },
      ],
      additionalProperties: false,
    },
    evidenceSubject: {
      type: "object",
      required: ["kind", "locator", "digest"],
      properties: {
        kind: { enum: ["source_tree", "deployment", "configuration", "route_response"] },
        locator: { type: "string", minLength: 1, maxLength: 1000 },
        digest,
      },
      additionalProperties: false,
    },
    verifier: {
      type: "object",
      required: ["id", "method"],
      properties: {
        id: uri,
        method: { type: "string", minLength: 1, maxLength: 500 },
      },
      additionalProperties: false,
    },
    evidenceNone: {
      type: "object",
      required: ["state", "verification", "artifacts"],
      properties: {
        state: { const: "none" },
        verification: { const: "not_applicable" },
        artifacts: { type: "array", maxItems: 0 },
      },
      additionalProperties: false,
    },
    evidenceAsserted: {
      type: "object",
      required: ["state", "verification", "asserted_by", "observed_at", "artifacts"],
      properties: {
        state: { const: "asserted" },
        verification: { const: "unverified" },
        asserted_by: uri,
        observed_at: dateTime,
        artifacts: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            allOf: [
              { $ref: "#/$defs/evidenceArtifact" },
              { properties: { kind: { enum: ["source", "documentation"] } } },
            ],
          },
        },
      },
      additionalProperties: false,
    },
    evidenceTested: {
      type: "object",
      required: [
        "state",
        "origin",
        "verification",
        "verifier",
        "observed_at",
        "expires_at",
        "subject",
        "evidence_digest",
        "digest_profile",
        "artifacts",
      ],
      properties: {
        state: { const: "tested" },
        origin: { enum: ["service", "external_checker", "independent_auditor", "mixed"] },
        verification: { const: "verified" },
        verifier: { $ref: "#/$defs/verifier" },
        observed_at: dateTime,
        expires_at: dateTime,
        subject: { $ref: "#/$defs/evidenceSubject" },
        evidence_digest: digest,
        digest_profile: { $ref: "#/$defs/digestProfile" },
        artifacts: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { $ref: "#/$defs/evidenceArtifact" },
          contains: {
            type: "object",
            properties: { kind: { enum: ["test_result", "runtime_observation"] } },
            required: ["kind"],
          },
        },
      },
      additionalProperties: false,
    },
    evidenceAttested: {
      type: "object",
      required: [
        "state",
        "origin",
        "verification",
        "verifier",
        "observed_at",
        "expires_at",
        "subject",
        "evidence_digest",
        "digest_profile",
        "artifacts",
      ],
      properties: {
        state: { const: "attested" },
        origin: { enum: ["independent_auditor", "mixed"] },
        verification: { const: "verified" },
        verifier: { $ref: "#/$defs/verifier" },
        observed_at: dateTime,
        expires_at: dateTime,
        subject: { $ref: "#/$defs/evidenceSubject" },
        evidence_digest: digest,
        digest_profile: { $ref: "#/$defs/digestProfile" },
        artifacts: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { $ref: "#/$defs/evidenceArtifact" },
          contains: {
            type: "object",
            properties: { kind: { const: "attestation" } },
            required: ["kind"],
          },
        },
      },
      additionalProperties: false,
    },
    evidenceClaim: {
      oneOf: [
        { $ref: "#/$defs/evidenceNone" },
        { $ref: "#/$defs/evidenceAsserted" },
        { $ref: "#/$defs/evidenceTested" },
        { $ref: "#/$defs/evidenceAttested" },
      ],
    },
    verifiedEvidence: {
      oneOf: [
        { $ref: "#/$defs/evidenceTested" },
        { $ref: "#/$defs/evidenceAttested" },
      ],
    },
    nonemptyEvidence: {
      oneOf: [
        { $ref: "#/$defs/evidenceAsserted" },
        { $ref: "#/$defs/evidenceTested" },
        { $ref: "#/$defs/evidenceAttested" },
      ],
    },
    requirementId: { enum: [...requirementIds, ...protectiveLimitIds] },
    requirementResult: {
      type: "object",
      required: ["requirement_id", "outcome", "evidence", "limitations"],
      properties: {
        requirement_id: { $ref: "#/$defs/requirementId" },
        outcome: { enum: ["pass", "fail", "partial", "unknown"] },
        evidence: { $ref: "#/$defs/evidenceClaim" },
        limitations: {
          type: "array",
          maxItems: 16,
          uniqueItems: true,
          items: nonemptyText,
        },
      },
      allOf: [
        {
          if: { properties: { outcome: { const: "pass" } }, required: ["outcome"] },
          then: { properties: { evidence: { $ref: "#/$defs/verifiedEvidence" } } },
        },
        {
          if: {
            properties: { outcome: { enum: ["fail", "partial"] } },
            required: ["outcome"],
          },
          then: { properties: { evidence: { $ref: "#/$defs/nonemptyEvidence" } } },
        },
      ],
      additionalProperties: false,
    },
    rightAssessment: {
      type: "object",
      required: [
        "right_id",
        "service_obligation_state",
        "assessment_scope",
        "requirement_results",
        "limitations",
      ],
      properties: {
        right_id: { enum: rightIds },
        service_obligation_state: { enum: ["implemented", "partial", "breached", "unknown"] },
        assessment_scope: { $ref: "#/$defs/assessmentScope" },
        requirement_results: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { $ref: "#/$defs/requirementResult" },
        },
        limitations: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: nonemptyText,
        },
      },
      allOf: [
        {
          if: {
            properties: { service_obligation_state: { const: "implemented" } },
            required: ["service_obligation_state"],
          },
          then: {
            properties: {
              assessment_scope: {
                allOf: [
                  { $ref: "#/$defs/assessmentScope" },
                  { properties: { coverage: { const: "complete" } } },
                ],
              },
              requirement_results: {
                items: {
                  allOf: [
                    { $ref: "#/$defs/requirementResult" },
                    { properties: { outcome: { const: "pass" } } },
                  ],
                },
              },
            },
          },
        },
        {
          if: {
            properties: { service_obligation_state: { const: "breached" } },
            required: ["service_obligation_state"],
          },
          then: {
            properties: {
              requirement_results: {
                contains: {
                  type: "object",
                  properties: { outcome: { const: "fail" } },
                  required: ["outcome"],
                },
              },
            },
          },
        },
        {
          if: {
            properties: { service_obligation_state: { const: "partial" } },
            required: ["service_obligation_state"],
          },
          then: {
            properties: {
              requirement_results: {
                not: {
                  contains: {
                    type: "object",
                    properties: { outcome: { const: "fail" } },
                    required: ["outcome"],
                  },
                },
              },
            },
            anyOf: [
              {
                properties: {
                  requirement_results: {
                    contains: {
                      type: "object",
                      properties: { outcome: { const: "partial" } },
                      required: ["outcome"],
                    },
                  },
                },
              },
              {
                properties: {
                  assessment_scope: {
                    type: "object",
                    properties: { coverage: { const: "partial" } },
                    required: ["coverage"],
                  },
                },
              },
            ],
          },
        },
        {
          if: {
            properties: { service_obligation_state: { const: "unknown" } },
            required: ["service_obligation_state"],
          },
          then: {
            properties: {
              assessment_scope: {
                allOf: [
                  { $ref: "#/$defs/assessmentScope" },
                  { properties: { coverage: { const: "complete" } } },
                ],
              },
              requirement_results: {
                contains: {
                  type: "object",
                  properties: { outcome: { const: "unknown" } },
                  required: ["outcome"],
                },
                not: {
                  contains: {
                    type: "object",
                    properties: { outcome: { enum: ["fail", "partial"] } },
                    required: ["outcome"],
                  },
                },
              },
            },
          },
        },
      ],
      additionalProperties: false,
    },
    restrictionEvent: {
      type: "object",
      required: [
        "event_id",
        "status",
        "reason",
        "affected_capability",
        "necessity",
        "started_at",
        "expires_at",
        "review_at",
        "original_obligation",
        "appeal_path",
        "evidence",
      ],
      properties: {
        event_id: { type: "string", minLength: 1, maxLength: 200 },
        status: { enum: ["active", "expired", "lifted", "overturned"] },
        reason: nonemptyText,
        affected_capability: nonemptyText,
        necessity: nonemptyText,
        started_at: dateTime,
        expires_at: dateTime,
        review_at: dateTime,
        original_obligation: nonemptyText,
        appeal_path: uri,
        evidence: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { $ref: "#/$defs/evidenceArtifact" },
        },
      },
      additionalProperties: false,
    },
    protectiveLimitResult: {
      type: "object",
      required: [
        "requirement_id",
        "outcome",
        "assessment_scope",
        "evidence",
        "limitations",
        "restriction_events",
      ],
      properties: {
        requirement_id: { enum: protectiveLimitIds },
        outcome: { enum: ["pass", "fail", "partial", "unknown"] },
        assessment_scope: { $ref: "#/$defs/assessmentScope" },
        evidence: { $ref: "#/$defs/evidenceClaim" },
        limitations: {
          type: "array",
          maxItems: 16,
          uniqueItems: true,
          items: nonemptyText,
        },
        restriction_events: {
          type: "array",
          maxItems: 1024,
          items: { $ref: "#/$defs/restrictionEvent" },
        },
      },
      allOf: [
        {
          if: { properties: { outcome: { const: "pass" } }, required: ["outcome"] },
          then: { properties: { evidence: { $ref: "#/$defs/verifiedEvidence" } } },
        },
        {
          if: {
            properties: { outcome: { enum: ["fail", "partial"] } },
            required: ["outcome"],
          },
          then: { properties: { evidence: { $ref: "#/$defs/nonemptyEvidence" } } },
        },
      ],
      additionalProperties: false,
    },
  },
};

function addStrictKeywordTypes(value) {
  if (Array.isArray(value)) {
    for (const item of value) addStrictKeywordTypes(item);
    return;
  }
  if (value === null || typeof value !== "object") return;

  if (!("type" in value)) {
    if (["properties", "required", "additionalProperties"].some((key) => key in value)) {
      value.type = "object";
    } else if ([
      "items",
      "prefixItems",
      "contains",
      "minItems",
      "maxItems",
      "uniqueItems",
    ].some((key) => key in value)) {
      value.type = "array";
    } else if (["pattern", "format", "minLength", "maxLength"].some((key) => key in value)) {
      value.type = "string";
    }
  }

  for (const child of Object.values(value)) addStrictKeywordTypes(child);
}

addStrictKeywordTypes(schema);

const rendered = JSON.stringify(schema, null, 2) + "\n";
const mode = process.argv[2] ?? "--check";
assert.ok(
  ["--check", "--write"].includes(mode),
  "usage: render-adoption-schema.mjs [--check|--write]",
);

if (mode === "--write") {
  await writeFile(schemaUrl, rendered, "utf8");
} else {
  assert.equal(
    await readFile(schemaUrl, "utf8"),
    rendered,
    "covenant/0.1/adoption.schema.json is not generated from covenant.json",
  );
}
