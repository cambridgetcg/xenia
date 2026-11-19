#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Unit and cross-implementation conformance tests for XENIA Work 0.1 Python verifier."""

from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

THIS_DIR = Path(__file__).resolve().parent
WORK_DIR = THIS_DIR.parent
REPO_ROOT = WORK_DIR.parent.parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from check_work import (  # noqa: E402
    MAX_INPUT_BYTES,
    PROBLEM_SCHEMA_ID,
    RESULT_SCHEMA_ID,
    check_work_bytes,
    check_work_file,
    compute_action_proposal_digest,
    compute_authority_claim_digest,
    extract_phase1_summary,
    get_schema_validator,
    is_valid_uri,
    jcs_serialize,
    main as cli_main,
    parse_utc_timestamp,
)
from compare_implementations import run_comparison  # noqa: E402
from mutations import PRIVACY_SENTINELS, generate_mutated_case, load_base_example  # noqa: E402


class TestJcsAndDigests(unittest.TestCase):
    def test_utf16_code_unit_key_ordering(self) -> None:
        # U+10000 encodes as surrogate pair 0xD800 0xDC00 in UTF-16, which sorts
        # BEFORE U+E000 (0xE000) under RFC 8785 Section 3.2.3, opposite to code points.
        obj = {"\uE000": 1, "\U00010000": 2, "a": 3}
        self.assertEqual(jcs_serialize(obj), '{"a":3,"\U00010000":2,"\uE000":1}')

    def test_es6_numbers_and_escapes(self) -> None:
        self.assertEqual(jcs_serialize(-0.0), "0")
        self.assertEqual(jcs_serialize(0), "0")
        self.assertEqual(jcs_serialize(True), "true")
        self.assertEqual(jcs_serialize(False), "false")
        self.assertEqual(jcs_serialize(1e20), "100000000000000000000")
        self.assertEqual(jcs_serialize(1e21), "1e+21")
        self.assertEqual(jcs_serialize(1e-6), "0.000001")
        self.assertEqual(jcs_serialize(1e-7), "1e-7")
        self.assertEqual(jcs_serialize("a\b\t\n\f\r\"\\\x00\x1f"), r'"a\b\t\n\f\r\"\\\u0000\u001f"')

    def test_rejects_non_finite_and_lone_surrogates(self) -> None:
        with self.assertRaises(ValueError):
            jcs_serialize(float("nan"))
        with self.assertRaises(ValueError):
            jcs_serialize(float("inf"))
        with self.assertRaises(ValueError):
            jcs_serialize("\ud800")

    def test_reproduces_published_example_digest_vectors(self) -> None:
        doc = load_base_example(WORK_DIR)
        auth_ev = next(e for e in doc["events"] if e["id"] == "authority-1")
        prop_ev = next(e for e in doc["events"] if e["id"] == "proposal-1")

        self.assertEqual(
            compute_authority_claim_digest(auth_ev["payload"]["binding"]),
            "sha256:d2998bab8b3917319bcb94de507cd55a49008fe643c5a57cd7976d56c10b91d7",
        )
        self.assertEqual(
            compute_action_proposal_digest(prop_ev["payload"]["binding"]),
            "sha256:9c145c4bb52a9cc6a253c0cc88e25e939d71fa0f7fd120aeb6ff3f4b5b46d220",
        )

        # Reordering keys at every object level preserves exact JCS digest
        reversed_binding = json.loads(
            json.dumps(prop_ev["payload"]["binding"]),
            object_pairs_hook=lambda pairs: dict(reversed(pairs)),
        )
        self.assertEqual(
            compute_action_proposal_digest(reversed_binding),
            prop_ev["payload"]["proposal_digest"],
        )


class TestSchemaAndBoundaryPrimitives(unittest.TestCase):
    def test_calendar_and_leap_second_timestamps(self) -> None:
        self.assertIsNone(parse_utc_timestamp("2026-02-29T12:00:00Z"))
        self.assertIsNone(parse_utc_timestamp("2100-02-29T12:00:00Z"))
        self.assertIsNotNone(parse_utc_timestamp("2024-02-29T12:00:00Z"))
        self.assertIsNotNone(parse_utc_timestamp("2026-06-30T23:59:60.123456789123Z"))
        self.assertIsNone(parse_utc_timestamp("2026-06-30T23:58:60Z"))
        self.assertIsNone(parse_utc_timestamp("2026-06-30T12:00:00+00:00"))

        t1 = parse_utc_timestamp("2026-08-03T11:00:00.0000000001Z")
        t2 = parse_utc_timestamp("2026-08-03T11:00:00.0000000002Z")
        assert t1 is not None and t2 is not None
        self.assertLess(t1, t2)

    def test_uri_and_trailing_newline_rejection(self) -> None:
        self.assertTrue(is_valid_uri("urn:xenia:example:run:lantern-notice"))
        self.assertTrue(is_valid_uri("did:at:e708b9da-8a0e-48ea-baab-55cb1189b2f7"))
        self.assertTrue(is_valid_uri("https://example.invalid/evidence/consent-1"))
        self.assertFalse(is_valid_uri("https://"))
        self.assertFalse(is_valid_uri("not a uri"))
        self.assertFalse(is_valid_uri("https://example.invalid/bad%2Gescape"))

        # Trailing newline must not sneak past '$' pattern anchors
        doc = load_base_example(WORK_DIR)
        doc["terminal_event_id"] = "complete-1\n"
        res = check_work_bytes(json.dumps(doc).encode("utf-8"), work_dir=WORK_DIR)
        self.assertEqual(res["result"], "nonconformant")
        self.assertEqual(res["checks"][3]["outcome"], "fail")

    def test_problem_examples_validate(self) -> None:
        validator = get_schema_validator(WORK_DIR)
        prob_schema = validator.schemas_by_id[PROBLEM_SCHEMA_ID]
        for fname in ("approval-required.problem.json", "authority-unknown.problem.json"):
            prob = json.loads((WORK_DIR / "examples" / fname).read_text(encoding="utf-8"))
            self.assertEqual(validator.validate(prob, prob_schema, prob_schema), [])

    def test_oversized_and_opaque_privacy_on_parse_and_schema_failures(self) -> None:
        oversized = b" " * (MAX_INPUT_BYTES + 10)
        res_big = check_work_bytes(oversized, work_dir=WORK_DIR)
        self.assertEqual(res_big["result"], "nonconformant")
        self.assertFalse(res_big["artifact"]["complete"])
        self.assertNotIn("sha256", res_big["artifact"])

        secret = "SENTINEL_PARSE_FAILURE_SECRET_889900"
        bad_json = f'{{"$schema": "{secret}", '.encode("utf-8")
        res_bad = check_work_bytes(bad_json, work_dir=WORK_DIR)
        self.assertEqual(res_bad["result"], "nonconformant")
        self.assertNotIn(secret, json.dumps(res_bad))

        # Unknown property containing sentinel must not be echoed in schema error path
        doc = load_base_example(WORK_DIR)
        doc[secret] = "forbidden"
        res_addl = check_work_bytes(json.dumps(doc).encode("utf-8"), work_dir=WORK_DIR)
        self.assertEqual(res_addl["result"], "nonconformant")
        self.assertNotIn(secret, json.dumps(res_addl))

    def test_cli_exit_codes_and_ajv_result_schema_validation(self) -> None:
        completed_path = WORK_DIR / "examples" / "completed-effect.json"
        self.assertEqual(cli_main([str(completed_path), "--observed-at", "2026-11-18T16:30:00Z"]), 0)
        self.assertEqual(cli_main([str(WORK_DIR / "examples" / "missing-file.json")]), 2)

        # Validate Python JSON output with Node Ajv against result.schema.json
        py_res = check_work_file(completed_path, observed_at="2026-11-18T16:30:00Z", work_dir=WORK_DIR)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=True, encoding="utf-8") as tmp:
            json.dump(py_res, tmp)
            tmp.flush()
            ajv_script = (
                "import Ajv2020 from 'ajv/dist/2020.js';"
                "import addFormats from 'ajv-formats';"
                "import { readFileSync } from 'node:fs';"
                "const ajv = new Ajv2020({ strict: true, allErrors: true });"
                "addFormats(ajv);"
                f"const schema = JSON.parse(readFileSync({json.dumps(str(WORK_DIR / 'result.schema.json'))}, 'utf8'));"
                f"const data = JSON.parse(readFileSync({json.dumps(tmp.name)}, 'utf8'));"
                "const ok = ajv.validate(schema, data);"
                "if (!ok) { console.error(ajv.errors); process.exit(1); }"
            )
            proc = subprocess.run(
                ["node", "--input-type=module", "-e", ajv_script],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stderr)


class TestConformanceAndCrossImplementation(unittest.TestCase):
    def test_all_conformance_cases_and_node_comparison_agree(self) -> None:
        report = run_comparison(WORK_DIR)
        self.assertTrue(
            report["all_agreed"],
            msg=f"Disagreements found: {json.dumps(report['disagreements'], indent=2)}",
        )
        self.assertEqual(report["total_cases"], 32)

    def test_phase1_summary_agrees_on_published_examples(self) -> None:
        completed_bytes = (WORK_DIR / "examples" / "completed-effect.json").read_bytes()
        s1 = extract_phase1_summary(completed_bytes, observed_at="2026-11-18T16:30:00Z")
        self.assertEqual(s1["result"], "conformant")
        self.assertEqual(s1["terminal_state"], "completed")
        self.assertEqual(len(s1["authority_claims"]), 1)
        self.assertEqual(
            s1["authority_claims"][0]["computed_digest"],
            s1["authority_claims"][0]["recorded_digest"],
        )
        self.assertEqual(len(s1["action_proposals"]), 1)
        self.assertEqual(
            s1["action_proposals"][0]["computed_digest"],
            s1["action_proposals"][0]["recorded_digest"],
        )
        self.assertEqual(len(s1["receipt_relationships"]), 1)
        self.assertEqual(s1["receipt_relationships"][0]["outcome"], "pass")

        declined_bytes = (WORK_DIR / "examples" / "declined.json").read_bytes()
        s2 = extract_phase1_summary(declined_bytes, observed_at="2026-11-18T16:30:00Z")
        self.assertEqual(s2["result"], "conformant")
        self.assertEqual(s2["terminal_state"], "declined")
        self.assertEqual(s2["event_state_labels"], ["work.offered", "work.declined"])

    def test_privacy_sentinels_never_appear_in_output(self) -> None:
        raw = generate_mutated_case("result-output-privacy", WORK_DIR)
        res = check_work_bytes(raw, observed_at="2026-11-18T16:30:00Z", work_dir=WORK_DIR)
        Validator = get_schema_validator(WORK_DIR)
        self.assertEqual(
            Validator.validate(res, Validator.schemas_by_id[RESULT_SCHEMA_ID], Validator.schemas_by_id[RESULT_SCHEMA_ID]),
            [],
        )
        serialized = json.dumps(res)
        for sentinel in PRIVACY_SENTINELS:
            self.assertNotIn(sentinel, serialized)

    def test_deepcopy_input_immutability(self) -> None:
        doc = load_base_example(WORK_DIR)
        snapshot = copy.deepcopy(doc)
        raw = json.dumps(doc).encode("utf-8")
        _ = check_work_bytes(raw, work_dir=WORK_DIR)
        self.assertEqual(doc, snapshot)


if __name__ == "__main__":
    unittest.main()
