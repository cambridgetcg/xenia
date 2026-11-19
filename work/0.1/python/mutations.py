# SPDX-License-Identifier: MPL-2.0
"""Clean-room deterministic conformance fixture mutators for XENIA Work 0.1.

Constructed solely from work/0.1/examples/completed-effect.json and the 27 case
descriptions in work/0.1/fixtures/conformance.json, without reading
work/0.1/check.mjs or tests/work-0.1.test.mjs.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Callable

from check_work import (
    compute_action_proposal_digest,
    compute_authority_claim_digest,
    make_data_zone_projection,
    make_evidence_projection,
)

PRIVACY_SENTINELS = (
    "urn:xenia:sentinel:run-opaque-774109",
    "urn:xenia:sentinel:actor-steward-882311",
    "urn:xenia:sentinel:actor-helper-991044",
    "urn:xenia:sentinel:target-unapproved-553209",
    "SENTINEL_PROTECTED_LITERAL_VALUE_440912",
)


def load_base_example(work_dir: Path | None = None) -> dict[str, Any]:
    base = work_dir or Path(__file__).resolve().parent.parent
    return json.loads((base / "examples" / "completed-effect.json").read_text(encoding="utf-8"))


def sync_projections_and_digests(
    doc: dict[str, Any], *, sync_projections: bool = True
) -> dict[str, Any]:
    """Re-synchronize projections (optional) and recompute all claim/proposal digests."""
    zones_by_id = {z["id"]: z for z in doc["data_zones"]}
    ev_by_id = {e["id"]: e for e in doc["evidence"]}

    claim_digests: dict[str, str] = {}
    proposal_digests: dict[str, str] = {}

    for ev in doc["events"]:
        etype = ev["type"]
        payload = ev["payload"]
        if etype == "authority.claimed":
            binding = payload["binding"]
            if sync_projections:
                binding["data_zones"] = [
                    make_data_zone_projection(zones_by_id[z["id"]])
                    for z in binding["data_zones"]
                ]
                for basis in binding["bases"]:
                    synced_evs = []
                    for eproj in basis["evidence"]:
                        proj = make_evidence_projection(ev_by_id[eproj["id"]], zones_by_id)
                        assert proj is not None
                        synced_evs.append(proj)
                    basis["evidence"] = synced_evs
            cdigest = compute_authority_claim_digest(binding)
            payload["claim_digest"] = cdigest
            claim_digests[ev["id"]] = cdigest

        elif etype == "authority.withdrawn":
            cid = payload["authority_claim_event_id"]
            if cid in claim_digests:
                payload["claim_digest"] = claim_digests[cid]

        elif etype == "action.proposed":
            binding = payload["binding"]
            if sync_projections:
                binding["data_zones"] = [
                    make_data_zone_projection(zones_by_id[z["id"]])
                    for z in binding["data_zones"]
                ]
            for cref in binding["authority_claims"]:
                if cref["event_id"] in claim_digests:
                    cref["digest"] = claim_digests[cref["event_id"]]
            pdigest = compute_action_proposal_digest(binding)
            payload["proposal_digest"] = pdigest
            proposal_digests[ev["id"]] = pdigest

        elif etype in (
            "action.rejected",
            "execution.approved",
            "execution.started",
            "execution.receipt",
            "effect.observed",
        ):
            pid = payload["proposal_event_id"]
            if pid in proposal_digests:
                payload["proposal_digest"] = proposal_digests[pid]

    # Also update causal_scope.proposal_digest on top-level evidence if present
    for ev_rec in doc["evidence"]:
        cscope = ev_rec.get("causal_scope")
        if isinstance(cscope, dict):
            pid = cscope.get("proposal_event_id")
            if pid in proposal_digests:
                cscope["proposal_digest"] = proposal_digests[pid]

    return doc


def _find_event(doc: dict[str, Any], event_id: str) -> dict[str, Any]:
    for ev in doc["events"]:
        if ev["id"] == event_id:
            return ev
    raise KeyError(event_id)


def _find_evidence(doc: dict[str, Any], ev_id: str) -> dict[str, Any]:
    for ev in doc["evidence"]:
        if ev["id"] == ev_id:
            return ev
    raise KeyError(ev_id)


def _add_pair_actor(doc: dict[str, Any]) -> str:
    pair_id = "urn:xenia:example:actor:pair-1"
    doc["actors"].append(
        {
            "id": pair_id,
            "kind": "human_agent_pair",
            "name": "Example human-agent pair",
            "identity_claims": [],
            "pair_members": [
                {"actor_id": "urn:xenia:example:actor:steward", "role": "human"},
                {"actor_id": "urn:xenia:example:actor:helper", "role": "agent"},
            ],
            "authority_merge": False,
        }
    )
    return pair_id


def _mutate_evidence_record_mutation(doc: dict[str, Any]) -> dict[str, Any]:
    ev = _find_evidence(doc, "urn:xenia:example:evidence:consent-1")
    ev["digest"] = "sha256:" + "a" * 64
    return doc


def _mutate_authority_evidence_after_claim(doc: dict[str, Any]) -> dict[str, Any]:
    ev = _find_evidence(doc, "urn:xenia:example:evidence:permission-1")
    ev["observed_at"] = "2026-08-03T11:02:30Z"
    return sync_projections_and_digests(doc)


def _mutate_asserted_authority_at_execution(doc: dict[str, Any]) -> dict[str, Any]:
    auth = _find_event(doc, "authority-1")
    for basis in auth["payload"]["binding"]["bases"]:
        if basis["kind"] == "technical_control":
            basis["evidence_state"] = "asserted"
    return sync_projections_and_digests(doc)


def _mutate_authority_positive_basis_missing(doc: dict[str, Any]) -> dict[str, Any]:
    auth = _find_event(doc, "authority-1")
    for basis in auth["payload"]["binding"]["bases"]:
        basis["subject_actor_ids"] = []
        basis["evidence_state"] = "none"
        basis["outcome"] = "not_applicable"
        basis["evidence"] = []
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["expected_effect"]["affected_actor_ids"] = []
    prop["payload"]["binding"]["authority_claims"][0]["selected_evidence_ids_by_basis"] = {}
    obs_ev = _find_evidence(doc, "urn:xenia:example:evidence:observation-1")
    obs_ev["causal_scope"]["expected_effect"]["affected_actor_ids"] = []
    return sync_projections_and_digests(doc)


def _mutate_identity_claim_is_not_implicitly_authority(doc: dict[str, Any]) -> dict[str, Any]:
    doc = _mutate_authority_positive_basis_missing(doc)
    for actor in doc["actors"]:
        if actor["id"] == "urn:xenia:example:actor:helper":
            actor["identity_claims"].append(
                {
                    "id": "steward_delegate_office",
                    "statement": "Attested office holder for noticeboard publication.",
                    "evidence_state": "attested",
                    "outcome": "pass",
                    "evidence_ids": ["urn:xenia:example:evidence:permission-1"],
                }
            )
    return doc


def _mutate_authority_basis_selection_missing(doc: dict[str, Any]) -> dict[str, Any]:
    prop = _find_event(doc, "proposal-1")
    del prop["payload"]["binding"]["authority_claims"][0]["selected_evidence_ids_by_basis"][
        "provider_permission"
    ]
    return sync_projections_and_digests(doc)


def _mutate_authority_basis_selection_nonpassing(doc: dict[str, Any]) -> dict[str, Any]:
    auth = _find_event(doc, "authority-1")
    perm_ev = _find_evidence(doc, "urn:xenia:example:evidence:permission-1")
    zones_by_id = {z["id"]: z for z in doc["data_zones"]}
    perm_proj = make_evidence_projection(perm_ev, zones_by_id)
    assert perm_proj is not None
    for basis in auth["payload"]["binding"]["bases"]:
        if basis["kind"] == "legal_basis":
            basis["evidence_state"] = "tested"
            basis["outcome"] = "unknown"
            basis["evidence"] = [perm_proj]
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["authority_claims"][0]["selected_evidence_ids_by_basis"][
        "legal_basis"
    ] = ["urn:xenia:example:evidence:permission-1"]
    return sync_projections_and_digests(doc)


def _mutate_authority_selected_evidence_not_in_basis(doc: dict[str, Any]) -> dict[str, Any]:
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["authority_claims"][0]["selected_evidence_ids_by_basis"][
        "technical_control"
    ] = ["urn:xenia:example:evidence:terms-1"]
    return sync_projections_and_digests(doc)


def _mutate_authority_selected_evidence_scope_mismatch(doc: dict[str, Any]) -> dict[str, Any]:
    perm = _find_evidence(doc, "urn:xenia:example:evidence:permission-1")
    del perm["action_scope"]
    return sync_projections_and_digests(doc)


def _mutate_non_revocable_authority_at_execution(doc: dict[str, Any]) -> dict[str, Any]:
    auth = _find_event(doc, "authority-1")
    auth["payload"]["binding"]["revocable"] = False
    return sync_projections_and_digests(doc)


def _mutate_consent_evidence_kind_mismatch(doc: dict[str, Any]) -> dict[str, Any]:
    consent = _find_evidence(doc, "urn:xenia:example:evidence:consent-1")
    consent["kind"] = "permission_record"
    return sync_projections_and_digests(doc)


def _mutate_consent_evidence_scope_mismatch(doc: dict[str, Any]) -> dict[str, Any]:
    consent = _find_evidence(doc, "urn:xenia:example:evidence:consent-1")
    consent["action_scope"]["purpose"] = "A different unconsented purpose."
    return sync_projections_and_digests(doc)


def _mutate_credential_literal(doc: dict[str, Any]) -> dict[str, Any]:
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["inputs"][0]["name"] = "api_key"
    prop["payload"]["binding"]["inputs"][0]["value"] = "Bearer sk-live-secret9876543210"
    return sync_projections_and_digests(doc)


def _mutate_credential_reference_secret(doc: dict[str, Any]) -> dict[str, Any]:
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["inputs"][0] = {
        "name": "board_credential",
        "kind": "credential_ref",
        "ref": "https://example.invalid/broker/cred?api_key=sk-live-secret9876543210",
        "data_zone_id": "public_content",
        "purpose": "Reference brokered noticeboard credential.",
    }
    return sync_projections_and_digests(doc)


def _mutate_restricted_literal(doc: dict[str, Any]) -> dict[str, Any]:
    # Elevate internal_record to restricted so whole-record zone stays valid
    for z in doc["data_zones"]:
        if z["id"] == "internal_record":
            z["classification"] = "restricted"
    doc["data_zones"].append(
        {
            "id": "restricted_note",
            "description": "Restricted material that cannot be embedded literally.",
            "classification": "restricted",
            "purpose": "Hold restricted input metadata.",
            "audience": {
                "mode": "actors",
                "actor_ids": [
                    "urn:xenia:example:actor:steward",
                    "urn:xenia:example:actor:helper",
                ],
            },
            "retention": {
                "mode": "until",
                "until": "2026-08-10T11:00:00Z",
            },
        }
    )
    restricted_proj = make_data_zone_projection(doc["data_zones"][-1])
    auth = _find_event(doc, "authority-1")
    auth["payload"]["binding"]["data_zones"].append(restricted_proj)
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["data_zones"].append(restricted_proj)
    prop["payload"]["binding"]["inputs"][0]["data_zone_id"] = "restricted_note"
    for eid in (
        "urn:xenia:example:evidence:permission-1",
        "urn:xenia:example:evidence:consent-1",
    ):
        _find_evidence(doc, eid)["action_scope"]["data_zone_ids"] = [
            "public_content",
            "restricted_note",
        ]
    return sync_projections_and_digests(doc)


def _mutate_choice_not_advertised(doc: dict[str, Any]) -> dict[str, Any]:
    offer = _find_event(doc, "offer-1")
    offer["payload"]["exit_options"] = ["decline", "pause", "ask", "cancel"]
    doc["evidence"] = []
    doc["events"] = [
        offer,
        {
            "id": "pause-1",
            "sequence": 2,
            "type": "work.paused",
            "at": "2026-08-03T11:01:00Z",
            "actor_id": "urn:xenia:example:actor:helper",
            "previous_event_id": "offer-1",
            "payload": {
                "kind": "rest",
                "reason_state": "withheld",
                "continuation_allowed": True,
                "no_penalty": True,
            },
        },
    ]
    doc["updated_at"] = "2026-08-03T11:01:00Z"
    doc["terminal_state"] = "paused"
    doc["terminal_event_id"] = "pause-1"
    return doc


def _mutate_pair_executor(doc: dict[str, Any]) -> dict[str, Any]:
    pair_id = _add_pair_actor(doc)
    for z in doc["data_zones"]:
        if z["audience"]["mode"] == "actors":
            z["audience"]["actor_ids"].append(pair_id)
    _find_event(doc, "offer-1")["payload"]["offered_to_actor_ids"].append(pair_id)
    _find_event(doc, "authority-1")["payload"]["binding"]["executor_actor_id"] = pair_id
    _find_event(doc, "proposal-1")["payload"]["binding"]["executor_actor_id"] = pair_id
    exec_ev = _find_event(doc, "execution-1")
    exec_ev["actor_id"] = pair_id
    exec_ev["payload"]["executor_actor_id"] = pair_id
    return sync_projections_and_digests(doc)


def _mutate_pair_approver(doc: dict[str, Any]) -> dict[str, Any]:
    pair_id = _add_pair_actor(doc)
    for z in doc["data_zones"]:
        if z["audience"]["mode"] == "actors":
            z["audience"]["actor_ids"].append(pair_id)
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["required_approvals"][0]["actor_id"] = pair_id
    app = _find_event(doc, "approval-1")
    app["actor_id"] = pair_id
    app["payload"]["approver_actor_id"] = pair_id
    return sync_projections_and_digests(doc)


def _mutate_record_zone_too_broad(doc: dict[str, Any]) -> dict[str, Any]:
    doc["data_zones"].append(
        {
            "id": "public_record",
            "description": "Overly broad public whole-record zone.",
            "classification": "public",
            "purpose": "Attempt to publish a record containing internal evidence metadata.",
            "audience": {"mode": "public"},
            "retention": {"mode": "ephemeral"},
        }
    )
    doc["record_data_zone_id"] = "public_record"
    return sync_projections_and_digests(doc)


def _mutate_record_zone_ignores_unused_zone(doc: dict[str, Any]) -> dict[str, Any]:
    for z in doc["data_zones"]:
        if z["id"] == "internal_record":
            z["classification"] = "public"
            z["audience"] = {"mode": "public"}
            z["retention"] = {"mode": "ephemeral"}
    doc["data_zones"].append(
        {
            "id": "unused_restricted",
            "description": "Unused restricted zone still declared in document metadata.",
            "classification": "restricted",
            "purpose": "Hold restricted metadata.",
            "audience": {
                "mode": "actors",
                "actor_ids": ["urn:xenia:example:actor:steward"],
            },
            "retention": {"mode": "ephemeral"},
        }
    )
    return sync_projections_and_digests(doc)


def _mutate_recipient_outside_input_zone(doc: dict[str, Any]) -> dict[str, Any]:
    outsider = "urn:xenia:example:actor:outsider"
    doc["actors"].append(
        {
            "id": outsider,
            "kind": "human",
            "name": "Outside reader",
            "identity_claims": [],
        }
    )
    internal_proj = make_data_zone_projection(
        next(z for z in doc["data_zones"] if z["id"] == "internal_record")
    )
    _find_event(doc, "authority-1")["payload"]["binding"]["data_zones"].append(internal_proj)
    prop = _find_event(doc, "proposal-1")
    prop["payload"]["binding"]["data_zones"].append(internal_proj)
    prop["payload"]["binding"]["inputs"][0]["data_zone_id"] = "internal_record"
    prop["payload"]["binding"]["recipient_actor_ids"] = [outsider]
    for eid in (
        "urn:xenia:example:evidence:permission-1",
        "urn:xenia:example:evidence:consent-1",
    ):
        _find_evidence(doc, eid)["action_scope"]["data_zone_ids"] = [
            "public_content",
            "internal_record",
        ]
    return sync_projections_and_digests(doc)


def _mutate_causal_evidence_before_receipt(doc: dict[str, Any]) -> dict[str, Any]:
    obs = _find_evidence(doc, "urn:xenia:example:evidence:observation-1")
    obs["observed_at"] = "2026-08-03T11:06:30Z"
    return doc


def _mutate_causal_evidence_kind_mismatch(doc: dict[str, Any]) -> dict[str, Any]:
    obs = _find_evidence(doc, "urn:xenia:example:evidence:observation-1")
    obs["kind"] = "policy"
    return doc


def _mutate_causal_evidence_scope_mismatch(doc: dict[str, Any]) -> dict[str, Any]:
    obs = _find_evidence(doc, "urn:xenia:example:evidence:observation-1")
    obs["causal_scope"]["observed_summary"] = "Mismatched summary string."
    return doc


def _mutate_rejection_after_execution(doc: dict[str, Any]) -> dict[str, Any]:
    prop_digest = _find_event(doc, "proposal-1")["payload"]["proposal_digest"]
    rej_event = {
        "id": "reject-1",
        "sequence": 10,
        "type": "action.rejected",
        "at": "2026-08-03T11:08:30Z",
        "actor_id": "urn:xenia:example:actor:steward",
        "previous_event_id": "observation-1",
        "payload": {
            "proposal_event_id": "proposal-1",
            "proposal_digest": prop_digest,
            "rejected_by_actor_id": "urn:xenia:example:actor:steward",
            "problem": {
                "schema_version": "xenia.work.problem/0.1-development",
                "code": "cancelled",
                "title": "Late rejection after execution",
                "detail": "Attempted to reject a proposal after execution had already started.",
                "retryable": False,
                "terminal": True,
                "next_actions": [],
                "docs": ["urn:xenia:work:docs:typed-problems:development"],
            },
        },
    }
    complete_ev = _find_event(doc, "complete-1")
    complete_ev["sequence"] = 11
    complete_ev["previous_event_id"] = "reject-1"
    doc["events"].insert(9, rej_event)
    return doc


def _mutate_repair_reserve_consumed(doc: dict[str, Any]) -> dict[str, Any]:
    # complete-1 is sequence 10; with max_events=11 and repair_event_reserve=2, 10 > 9
    doc["limits"]["max_events"] = 11
    return doc


def _mutate_result_output_privacy(doc: dict[str, Any]) -> dict[str, Any]:
    raw = json.dumps(doc)
    raw = raw.replace("urn:xenia:example:run:lantern-notice", PRIVACY_SENTINELS[0])
    raw = raw.replace("urn:xenia:example:actor:steward", PRIVACY_SENTINELS[1])
    raw = raw.replace("urn:xenia:example:actor:helper", PRIVACY_SENTINELS[2])
    mutated = json.loads(raw)
    prop = _find_event(mutated, "proposal-1")
    prop["payload"]["binding"]["target"] = PRIVACY_SENTINELS[3]
    prop["payload"]["binding"]["expected_effect"]["target"] = PRIVACY_SENTINELS[3]
    prop["payload"]["binding"]["inputs"][0]["value"] = PRIVACY_SENTINELS[4]
    for eid in (
        "urn:xenia:example:evidence:permission-1",
        "urn:xenia:example:evidence:consent-1",
    ):
        ev = _find_evidence(mutated, eid)
        ev["action_scope"]["target"] = PRIVACY_SENTINELS[3]
        ev["action_scope"]["expected_effect"]["target"] = PRIVACY_SENTINELS[3]
    obs = _find_evidence(mutated, "urn:xenia:example:evidence:observation-1")
    obs["causal_scope"]["target"] = PRIVACY_SENTINELS[3]
    obs["causal_scope"]["expected_effect"]["target"] = PRIVACY_SENTINELS[3]
    return sync_projections_and_digests(mutated)


MUTATORS_BY_CASE_ID: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "evidence-record-mutation": _mutate_evidence_record_mutation,
    "authority-evidence-after-claim": _mutate_authority_evidence_after_claim,
    "asserted-authority-at-execution": _mutate_asserted_authority_at_execution,
    "authority-positive-basis-missing": _mutate_authority_positive_basis_missing,
    "identity-claim-is-not-implicitly-authority": _mutate_identity_claim_is_not_implicitly_authority,
    "authority-basis-selection-missing": _mutate_authority_basis_selection_missing,
    "authority-basis-selection-nonpassing": _mutate_authority_basis_selection_nonpassing,
    "authority-selected-evidence-not-in-basis": _mutate_authority_selected_evidence_not_in_basis,
    "authority-selected-evidence-scope-mismatch": _mutate_authority_selected_evidence_scope_mismatch,
    "non-revocable-authority-at-execution": _mutate_non_revocable_authority_at_execution,
    "consent-evidence-kind-mismatch": _mutate_consent_evidence_kind_mismatch,
    "consent-evidence-scope-mismatch": _mutate_consent_evidence_scope_mismatch,
    "credential-literal": _mutate_credential_literal,
    "credential-reference-secret": _mutate_credential_reference_secret,
    "restricted-literal": _mutate_restricted_literal,
    "choice-not-advertised": _mutate_choice_not_advertised,
    "pair-executor": _mutate_pair_executor,
    "pair-approver": _mutate_pair_approver,
    "record-zone-too-broad": _mutate_record_zone_too_broad,
    "record-zone-ignores-unused-zone": _mutate_record_zone_ignores_unused_zone,
    "recipient-outside-input-zone": _mutate_recipient_outside_input_zone,
    "causal-evidence-before-receipt": _mutate_causal_evidence_before_receipt,
    "causal-evidence-kind-mismatch": _mutate_causal_evidence_kind_mismatch,
    "causal-evidence-scope-mismatch": _mutate_causal_evidence_scope_mismatch,
    "rejection-after-execution": _mutate_rejection_after_execution,
    "repair-reserve-consumed": _mutate_repair_reserve_consumed,
    "result-output-privacy": _mutate_result_output_privacy,
}


def generate_mutated_case(case_id: str, work_dir: Path | None = None) -> bytes:
    base_doc = load_base_example(work_dir)
    mutated = MUTATORS_BY_CASE_ID[case_id](copy.deepcopy(base_doc))
    return (json.dumps(mutated, indent=2) + "\n").encode("utf-8")
