#!/usr/bin/env node

// SPDX-License-Identifier: MPL-2.0

import { pathToFileURL } from "node:url";

import {
  canonicalAdoptionSchema,
  canonicalCovenant,
  canonicalDigestProfile,
  canonicalPins,
  canonicalRelease,
  canonicalSources,
} from "./validate-adoption.mjs";

const UNKNOWN_LIMITATION = "No implementation conclusion is drawn for this duty.";
const UNKNOWN_SCOPE_LIMITATION =
  "All implementation, runtime, platform, network, operator, legal, and third-party behaviour remains unobserved.";

function nonempty(value, label, maximum) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > maximum
  ) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

function canonicalHostUrl(value) {
  const parsed = new URL(nonempty(value, "canonicalUrl", 2_000));
  const loopback = parsed.protocol === "http:"
    && (parsed.hostname === "localhost"
      || parsed.hostname === "[::1]"
      || /^127(?:\.[0-9]{1,3}){3}$/.test(parsed.hostname));
  if (parsed.protocol !== "https:" && !loopback) {
    throw new TypeError("canonicalUrl must use HTTPS, except for an HTTP loopback development origin");
  }
  if (parsed.username || parsed.password) {
    throw new TypeError("canonicalUrl must not contain credentials");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new TypeError("canonicalUrl must be an origin URL with no path, query, or fragment");
  }
  return parsed.href;
}

function absoluteSpeakerUrl(value) {
  const parsed = new URL(nonempty(value, "speakerId", 2_000));
  if (parsed.username || parsed.password) {
    throw new TypeError("speakerId must not contain credentials");
  }
  return parsed.href;
}

function canonicalTime(value) {
  const text = nonempty(value, "reviewedAt", 100);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("reviewedAt must be a valid date-time");
  }
  return new Date(timestamp).toISOString();
}

function digestProfile() {
  return { ...canonicalDigestProfile };
}

function noEvidence() {
  return {
    state: "none",
    verification: "not_applicable",
    artifacts: [],
  };
}

function assessmentScope(hostName) {
  return {
    coverage: "complete",
    systems: [hostName],
    routes: [],
    data_classes: [],
    layers: ["unknown"],
    unobserved: [UNKNOWN_SCOPE_LIMITATION],
  };
}

function unknownRequirement(requirement) {
  return {
    requirement_id: requirement.id,
    outcome: "unknown",
    evidence: noEvidence(),
    limitations: [UNKNOWN_LIMITATION],
  };
}

/**
 * Create a schema-shaped draft that enumerates every Covenant 0.1 duty while
 * claiming no implementation, evidence, release verification, or speaker
 * authority. The caller must review and replace unknowns before activation.
 */
export function createUnknownCovenantAdoption({
  hostName,
  canonicalUrl,
  speakerId,
  reviewedAt = new Date().toISOString(),
}) {
  const name = nonempty(hostName, "hostName", 160);
  const hostUrl = canonicalHostUrl(canonicalUrl);
  const speaker = absoluteSpeakerUrl(speakerId ?? new URL("#operator", hostUrl).href);
  const reviewed = canonicalTime(reviewedAt);

  return {
    $schema: canonicalAdoptionSchema.$id,
    schema_version: "xenia.covenant.adoption/0.1",
    profile: canonicalCovenant.profile,
    adoption_schema: {
      source: canonicalSources.adoptionSchema,
      sha256: canonicalPins.adoptionSchema,
      source_stability: "immutable",
      digest_profile: digestProfile(),
    },
    covenant: {
      source: canonicalSources.covenant,
      sha256: canonicalPins.covenant,
      source_stability: "immutable",
      digest_profile: digestProfile(),
    },
    release_verification: {
      state: "unverified",
      tag: canonicalRelease.tag,
      source_results: [],
      artifacts: [],
      limitations: [
        "The reserved release tag and source bytes have not been independently observed for this draft.",
      ],
    },
    host: {
      name,
      canonical_url: hostUrl,
    },
    recognition_scope: {
      rights_origin: "intrinsic_not_host_granted",
      protected_subjects: "every_affected_principal_at_the_host_boundary",
      eligibility_conditions: [],
    },
    declaration: {
      status: "draft",
      kind: "unilateral_host_undertaking",
      statement:
        "This all-unknown draft is not an active host undertaking and draws no implementation conclusion. Review authority, scope, release verification, and every duty before activation.",
      reviewed_at: reviewed,
      system_scope: {
        systems: [name],
        layers: ["unknown"],
        exclusions: [UNKNOWN_SCOPE_LIMITATION],
      },
      speaker: {
        id: speaker,
        role: "authorized_representative",
        authority_state: "unverified",
        authority_evidence: [],
      },
      guest_acceptance_required: false,
    },
    ledger_coverage: "all_profile_duties_enumerated",
    rights: canonicalCovenant.rights.map((right) => ({
      right_id: right.id,
      service_obligation_state: "unknown",
      assessment_scope: assessmentScope(name),
      requirement_results: right.requirements.map(unknownRequirement),
      limitations: [UNKNOWN_LIMITATION],
    })),
    protective_limit_results: canonicalCovenant.protective_limits.map((limit) => ({
      requirement_id: limit.id,
      outcome: "unknown",
      assessment_scope: assessmentScope(name),
      evidence: noEvidence(),
      limitations: [UNKNOWN_LIMITATION],
      restriction_events: [],
    })),
    non_claims: {
      schema_is_not_implementation_evidence: true,
      ledger_completeness_is_not_implementation: true,
      guest_assent_is_not_established: true,
      host_authorship_or_authority_is_not_established_by_schema: true,
      release_publication_or_immutability_is_not_established_by_schema: true,
      no_conformance_badge: true,
      ontology_or_legal_status_is_not_determined: true,
    },
  };
}

function usage() {
  return [
    "Usage: node covenant/0.1/create-adoption.mjs --host-name <name> --canonical-url <origin> [options]",
    "",
    "Options:",
    "  --speaker-id <uri>    Absolute draft speaker URI (default: <origin>#operator)",
    "  --reviewed-at <time>   Review timestamp (default: current time)",
    "  --help                 Show this message",
    "",
    "Prints an all-unknown draft to stdout. It does not write files, activate an",
    "adoption, verify authority or release sources, or establish implementation.",
  ].join("\n");
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") return { help: true };
    const key = {
      "--host-name": "hostName",
      "--canonical-url": "canonicalUrl",
      "--speaker-id": "speakerId",
      "--reviewed-at": "reviewedAt",
    }[arg];
    if (key === undefined) throw new TypeError(`unknown option: ${arg}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TypeError(`${arg} requires a value`);
    }
    if (options[key] !== undefined) throw new TypeError(`${arg} may appear only once`);
    options[key] = value;
    index += 1;
  }
  if (options.hostName === undefined || options.canonicalUrl === undefined) {
    throw new TypeError("--host-name and --canonical-url are required");
  }
  return options;
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;
if (invokedPath === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      const adoption = createUnknownCovenantAdoption(options);
      process.stdout.write(`${JSON.stringify(adoption, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    process.exitCode = 1;
  }
}
