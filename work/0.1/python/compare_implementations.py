#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Cross-implementation comparison harness for XENIA Work 0.1.

Runs the clean-room Python verifier (check_work.py) alongside the Node reference
checker (work/0.1/check.mjs, invoked strictly as an external black-box CLI
process) across the published examples, all 27 conformance fixture cases, and
malformed-input edge cases.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from typing import Any

from check_work import (
    RESULT_SCHEMA_ID,
    check_work_bytes,
    extract_phase1_summary,
    get_schema_validator,
)
from mutations import PRIVACY_SENTINELS, generate_mutated_case

FIXED_TIME = "2026-11-18T16:30:00Z"


def _run_node_checker_blackbox(raw_bytes: bytes, work_dir: Path) -> tuple[int, dict[str, Any]]:
    check_mjs = work_dir / "check.mjs"
    with tempfile.NamedTemporaryFile(suffix=".json", delete=True) as tmp:
        tmp.write(raw_bytes)
        tmp.flush()
        proc = subprocess.run(
            ["node", str(check_mjs), tmp.name, "--json"],
            capture_output=True,
            text=True,
            check=False,
        )
    if not proc.stdout.strip():
        raise RuntimeError(f"Node checker produced empty stdout (exit {proc.returncode}): {proc.stderr}")
    return proc.returncode, json.loads(proc.stdout)


def run_comparison(work_dir: Path | None = None) -> dict[str, Any]:
    base = work_dir or Path(__file__).resolve().parent.parent
    validator = get_schema_validator(base)
    result_schema = validator.schemas_by_id[RESULT_SCHEMA_ID]

    conformance_manifest = json.loads(
        (base / "fixtures" / "conformance.json").read_text(encoding="utf-8")
    )

    records: list[dict[str, Any]] = []
    disagreements: list[dict[str, Any]] = []

    # 1. Positive published examples
    for name in ("completed-effect.json", "declined.json"):
        raw = (base / "examples" / name).read_bytes()
        py_res = check_work_bytes(raw, observed_at=FIXED_TIME, work_dir=base)
        py_sum = extract_phase1_summary(raw, observed_at=FIXED_TIME)
        node_rc, node_res = _run_node_checker_blackbox(raw, base)

        py_schema_errs = validator.validate(py_res, result_schema, result_schema)
        node_schema_errs = validator.validate(node_res, result_schema, result_schema)

        agree = (
            py_res["result"] == "conformant"
            and node_res["result"] == "conformant"
            and node_rc == 0
            and py_res["artifact"] == node_res["artifact"]
            and py_res["run"] == node_res["run"]
            and len(py_schema_errs) == 0
            and len(node_schema_errs) == 0
        )
        entry = {
            "id": f"example:{name}",
            "kind": "positive_example",
            "agree": agree,
            "python_result": py_res["result"],
            "node_result": node_res["result"],
            "artifact_sha256": py_res["artifact"].get("sha256"),
            "terminal_state": py_res["run"].get("terminal_state"),
            "phase1_summary": py_sum,
            "python_check_ids": [c["id"] for c in py_res["checks"]],
            "node_check_ids": [c["id"] for c in node_res["checks"]],
            "python_result_schema_valid": len(py_schema_errs) == 0,
            "node_result_schema_valid": len(node_schema_errs) == 0,
        }
        records.append(entry)
        if not agree:
            disagreements.append(entry)

    # 2. All 27 conformance fixture mutations
    for case in conformance_manifest["cases"]:
        cid = case["id"]
        exp_res = case["expected_result"]
        exp_check = case["expected_check"]
        exp_issue = case["expected_issue"]

        raw = generate_mutated_case(cid, base)
        py_res = check_work_bytes(raw, observed_at=FIXED_TIME, work_dir=base)
        node_rc, node_res = _run_node_checker_blackbox(raw, base)

        py_schema_errs = validator.validate(py_res, result_schema, result_schema)
        node_schema_errs = validator.validate(node_res, result_schema, result_schema)

        py_failed_checks = [c["id"] for c in py_res["checks"] if c["outcome"] == "fail"]
        node_failed_checks = [c["id"] for c in node_res["checks"] if c["outcome"] == "fail"]
        py_issues = [i["code"] for i in py_res["issues"]]
        node_issues = [i["code"] for i in node_res["issues"]]

        privacy_ok = True
        if cid == "result-output-privacy":
            py_dump = json.dumps(py_res)
            node_dump = json.dumps(node_res)
            privacy_ok = not any(s in py_dump or s in node_dump for s in PRIVACY_SENTINELS)

        agree = (
            py_res["result"] == exp_res
            and node_res["result"] == exp_res
            and node_rc == 1
            and py_res["artifact"] == node_res["artifact"]
            and py_res["run"] == node_res["run"]
            and exp_check in py_failed_checks
            and exp_check in node_failed_checks
            and exp_issue in py_issues
            and exp_issue in node_issues
            and privacy_ok
            and len(py_schema_errs) == 0
            and len(node_schema_errs) == 0
        )
        entry = {
            "id": cid,
            "kind": "conformance_mutation",
            "expected_result": exp_res,
            "expected_check": exp_check,
            "expected_issue": exp_issue,
            "agree": agree,
            "python_result": py_res["result"],
            "node_result": node_res["result"],
            "artifact_sha256": py_res["artifact"].get("sha256"),
            "python_failed_checks": py_failed_checks,
            "node_failed_checks": node_failed_checks,
            "python_issues": py_issues,
            "node_issues": node_issues,
            "privacy_ok": privacy_ok,
            "python_result_schema_valid": len(py_schema_errs) == 0,
            "node_result_schema_valid": len(node_schema_errs) == 0,
        }
        records.append(entry)
        if not agree:
            disagreements.append(entry)

    # 3. Malformed byte / parse boundaries
    malformed_cases = [
        ("malformed:invalid-utf8", b'{"run_id": "\xff\xfe"}'),
        ("malformed:duplicate-key", b'{"a": 1, "a": 2}'),
        ("malformed:truncated-json", b'{"$schema": "urn:xenia:work:run:0.1:development-draft"'),
    ]
    for mid, raw in malformed_cases:
        py_res = check_work_bytes(raw, observed_at=FIXED_TIME, work_dir=base)
        node_rc, node_res = _run_node_checker_blackbox(raw, base)
        py_schema_errs = validator.validate(py_res, result_schema, result_schema)
        node_schema_errs = validator.validate(node_res, result_schema, result_schema)
        agree = (
            py_res["result"] == "nonconformant"
            and node_res["result"] == "nonconformant"
            and node_rc == 1
            and py_res["artifact"] == node_res["artifact"]
            and py_res["run"] == node_res["run"]
            and len(py_schema_errs) == 0
            and len(node_schema_errs) == 0
        )
        entry = {
            "id": mid,
            "kind": "malformed_input",
            "agree": agree,
            "python_result": py_res["result"],
            "node_result": node_res["result"],
            "python_failed_checks": [c["id"] for c in py_res["checks"] if c["outcome"] == "fail"],
            "node_failed_checks": [c["id"] for c in node_res["checks"] if c["outcome"] == "fail"],
            "python_issues": [i["code"] for i in py_res["issues"]],
            "node_issues": [i["code"] for i in node_res["issues"]],
            "python_result_schema_valid": len(py_schema_errs) == 0,
            "node_result_schema_valid": len(node_schema_errs) == 0,
        }
        records.append(entry)
        if not agree:
            disagreements.append(entry)

    return {
        "total_cases": len(records),
        "agreed_cases": len(records) - len(disagreements),
        "disagreement_count": len(disagreements),
        "all_agreed": len(disagreements) == 0,
        "disagreements": disagreements,
        "records": records,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compare Python and Node Work 0.1 checkers.")
    parser.add_argument("--json", action="store_true", help="Print full JSON comparison report.")
    args = parser.parse_args(argv)

    report = run_comparison()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(
            f"Work 0.1 cross-implementation comparison: "
            f"{report['agreed_cases']}/{report['total_cases']} cases agreed "
            f"({report['disagreement_count']} disagreements)"
        )
        for rec in report["records"]:
            mark = "PASS" if rec["agree"] else "DIFF"
            print(f"  [{mark}] {rec['id']}: py={rec['python_result']} node={rec['node_result']}")
            if not rec["agree"]:
                print(f"         details: {json.dumps(rec)}")

    return 0 if report["all_agreed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
