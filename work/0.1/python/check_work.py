#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Independent clean-room Python 3 verifier for XENIA Work 0.1 (development draft).

Implemented strictly from:
  - work/0.1/README.md
  - work/0.1/run.schema.json
  - work/0.1/problem.schema.json
  - work/0.1/result.schema.json
  - RFC 8785 (JSON Canonicalization Scheme)

Zero lines of work/0.1/check.mjs were read during implementation.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
from typing import Any

PROFILE = "xenia-work/0.1-development"
RUN_SCHEMA_ID = "urn:xenia:work:run:0.1:development-draft"
PROBLEM_SCHEMA_ID = "urn:xenia:work:problem:0.1:development-draft"
RESULT_SCHEMA_ID = "urn:xenia:work:result:0.1:development-draft"
RESULT_SCHEMA_VERSION = "xenia.work.result/0.1-development"
VERIFIER_NAME = "xenia-work-check"
VERIFIER_VERSION = "0.1.0-development"
IMPLEMENTATION_ID = "xenia-work-check-python/0.1.0-development"

AUTHORITY_CLAIM_DOMAIN = b"xenia.work.authority-claim/0.1\n"
ACTION_PROPOSAL_DOMAIN = b"xenia.work.action-proposal/0.1\n"

MAX_INPUT_BYTES = 1_048_576
MAX_ISSUES = 256
MAX_SAFE_INT = 9_007_199_254_740_991

SCOPE_TEXT = (
    "Structural and interchange validation of one supplied XENIA Work 0.1 run "
    "document; no external system or evidence was contacted."
)
OUTPUT_HANDLING_TEXT = (
    "Treat this result at least as restrictively as the input record; artifact "
    "digests and terminal metadata may remain sensitive."
)
NOT_ESTABLISHED = (
    "actor identity, consciousness, personhood, or legal status",
    "informed consent, legal basis, provider permission, or representative authority beyond internal record consistency",
    "that an invocation or external effect occurred",
    "the truth, authenticity, or causal force of evidence, receipts, observations, or claims",
    "privacy, security, Covenant duties, or whole-XENIA conformance",
    "that this checker result is safe to publish or sufficient to authorize dispatch",
)

TERMINAL_EVENT_BY_STATE = {
    "completed": "work.completed",
    "declined": "work.declined",
    "paused": "work.paused",
    "cancelled": "work.cancelled",
    "expired": "work.expired",
    "failed": "work.failed",
    "closed": "work.closed",
}
TERMINAL_EVENT_TYPES = frozenset(TERMINAL_EVENT_BY_STATE.values())

REQUIRED_AUTHORITY_BASES = (
    "technical_control",
    "affected_party_consent",
    "representative_authority",
    "legal_basis",
    "provider_permission",
)

CLASSIFICATION_RANK = {
    "public": 0,
    "internal": 1,
    "confidential": 2,
    "restricted": 3,
}

CAUSAL_EVIDENCE_KINDS = frozenset({"observation", "test_result", "attestation"})

CHECK_SPECS = (
    ("R.INPUT", "Input is complete and does not exceed 1048576 bytes."),
    ("R.UTF8", "Input bytes decode as strict UTF-8."),
    ("R.JSON", "Input parses as a single JSON object without duplicate keys or non-finite numbers."),
    ("R.SCHEMA", "Document conforms to the XENIA Work 0.1 run and problem JSON Schemas."),
    ("R.LEDGER_ORDER", "Event sequence numbers, previous-event links, timestamps, and declared IDs are ordered and unique."),
    ("R.TERMINAL", "Top-level terminal state matches the terminal event and only repair events follow."),
    ("R.LIMITS_PLAN", "Finite run limits, repair reserve, and plan DAG invariants hold."),
    ("R.ACTORS", "Actor declarations and human-agent pair membership boundaries hold."),
    ("R.REFERENCES", "Cross-record references and immutable data-zone and evidence projections resolve and match."),
    ("R.STATE", "Whole-record zone restrictiveness, input credential/privacy rules, audiences, and choice transitions hold."),
    ("R.DIGESTS", "RFC 8785 JCS authority-claim and action-proposal digests match all recorded bindings."),
    ("R.AUTHORITY", "Scoped authority claims, consent bases, revocability, and proposal-selected evidence scopes hold."),
    ("R.APPROVALS", "Exact one-use execution approvals match required nonces, actors, digests, and expiries."),
    ("R.EXECUTION", "Single-attempt execution start and provider receipt bindings hold."),
    ("R.EFFECTS", "Effect observations and tested/attested causal evidence bindings hold."),
    ("R.PROBLEMS", "Typed problems and proposal rejection exclusivity invariants hold."),
    ("R.PRIVACY", "Checker output omits opaque identifiers, secret-shaped strings, and protected input values."),
)

CREDENTIAL_NAME_RE = re.compile(
    r"(?:^|[._-])(?:password|passwd|passphrase|secret|client_secret|private_key|"
    r"api_key|apikey|access_token|refresh_token|id_token|auth_token|bearer|"
    r"session_cookie|session_key|cookie|credential)(?:$|[._-])",
    re.IGNORECASE,
)

SECRET_VALUE_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z0-9 _-]+-----"),
    re.compile(r"\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*", re.IGNORECASE),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{12,}|ya29\.[A-Za-z0-9._-]{12,})\b"),
    re.compile(
        r"(?:^|[?&;\s])(?:password|passwd|secret|client_secret|api_key|apikey|"
        r"access_token|refresh_token|auth_token|private_key|session_id|sessionid)"
        r"\s*[:=]\s*\S+",
        re.IGNORECASE,
    ),
)

URI_CHARS_RE = re.compile(r"\A[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+\Z")
BAD_PCT_RE = re.compile(r"%(?![0-9A-Fa-f]{2})")
URI_SCHEME_RE = re.compile(r"\A([A-Za-z][A-Za-z0-9+.-]*):(.*)\Z", re.DOTALL)
RFC3339_UTC_RE = re.compile(
    r"\A(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z\Z"
)


# ---------------------------------------------------------------------------
# Strict JSON equality & RFC 8785 JSON Canonicalization Scheme (JCS)
# ---------------------------------------------------------------------------


def json_equal(a: Any, b: Any) -> bool:
    """Compare two parsed JSON values without Python's bool/int coercion."""
    if type(a) is not type(b):
        return False
    if isinstance(a, dict):
        if a.keys() != b.keys():
            return False
        return all(json_equal(a[k], b[k]) for k in a)
    if isinstance(a, list):
        if len(a) != len(b):
            return False
        return all(json_equal(x, y) for x, y in zip(a, b))
    return a == b


def _contains_lone_surrogate(text: str) -> bool:
    return any(0xD800 <= ord(ch) <= 0xDFFF for ch in text)


def _jcs_escape_string(text: str) -> str:
    if _contains_lone_surrogate(text):
        raise ValueError("Lone UTF-16 surrogate is not valid in JCS strings.")
    out: list[str] = ['"']
    for ch in text:
        code = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif code == 0x08:
            out.append("\\b")
        elif code == 0x09:
            out.append("\\t")
        elif code == 0x0A:
            out.append("\\n")
        elif code == 0x0C:
            out.append("\\f")
        elif code == 0x0D:
            out.append("\\r")
        elif code < 0x20:
            out.append(f"\\u{code:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _es6_number_to_string(value: int | float) -> str:
    """Format an IEEE-754 double per RFC 8785 / ECMAScript Number::toString."""
    if isinstance(value, bool):
        raise TypeError("Boolean is not a JSON number.")
    if isinstance(value, int):
        if value < -MAX_SAFE_INT or value > MAX_SAFE_INT:
            raise ValueError("Integer exceeds IEEE-754 safe integer range.")
        return str(value)
    if not math.isfinite(value):
        raise ValueError("Non-finite float is forbidden in JCS.")
    # Pack/unpack as IEEE-754 binary64 and handle -0.0
    packed = struct.pack(">d", value)
    num = struct.unpack(">d", packed)[0]
    if num == 0.0:
        return "0"
    sign = "-" if num < 0 else ""
    abs_num = abs(num)
    # Python's repr(float) uses David Gay's shortest round-trip dtoa, matching ES6
    # significand digits; we only need exact ES6 decimal vs exponential formatting.
    sci = repr(abs_num).lower()
    if "e" in sci:
        mantissa, exp_str = sci.split("e", 1)
        digits = mantissa.replace(".", "")
        exp = int(exp_str)
        # exponent of leading digit
        k = len(digits)
        n = exp + 1
    else:
        if "." in sci:
            int_part, frac_part = sci.split(".", 1)
            if int_part == "0":
                stripped = frac_part.lstrip("0")
                zeros = len(frac_part) - len(stripped)
                digits = stripped.rstrip("0") or "0"
                n = -zeros
            else:
                combined = (int_part + frac_part).rstrip("0")
                digits = combined
                n = len(int_part)
        else:
            digits = sci.rstrip("0") or "0"
            n = len(sci)
        k = len(digits)

    if k <= n <= 21:
        return f"{sign}{digits}{'0' * (n - k)}"
    if 0 < n <= 21:
        return f"{sign}{digits[:n]}.{digits[n:]}"
    if -6 < n <= 0:
        return f"{sign}0.{'0' * (-n)}{digits}"
    exp_sign = "+" if (n - 1) >= 0 else "-"
    exp_val = abs(n - 1)
    if k == 1:
        return f"{sign}{digits}e{exp_sign}{exp_val}"
    return f"{sign}{digits[0]}.{digits[1:]}e{exp_sign}{exp_val}"


def jcs_serialize(value: Any) -> str:
    """Serialize a JSON-compatible Python value to RFC 8785 canonical JSON text."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _es6_number_to_string(value)
    if isinstance(value, str):
        return _jcs_escape_string(value)
    if isinstance(value, list):
        return "[" + ",".join(jcs_serialize(item) for item in value) + "]"
    if isinstance(value, dict):
        # RFC 8785 Section 3.2.3: sort property names by UTF-16 code units.
        sorted_items = sorted(
            value.items(),
            key=lambda kv: kv[0].encode("utf-16-be"),
        )
        parts: list[str] = []
        for k, v in sorted_items:
            if not isinstance(k, str):
                raise TypeError("Object key must be a string.")
            parts.append(f"{_jcs_escape_string(k)}:{jcs_serialize(v)}")
        return "{" + ",".join(parts) + "}"
    raise TypeError("Unsupported value type for JCS serialization.")


def jcs_canonicalize(value: Any) -> bytes:
    return jcs_serialize(value).encode("utf-8")


def compute_authority_claim_digest(binding: dict[str, Any]) -> str:
    digest = hashlib.sha256(AUTHORITY_CLAIM_DOMAIN + jcs_canonicalize(binding)).hexdigest()
    return f"sha256:{digest}"


def compute_action_proposal_digest(binding: dict[str, Any]) -> str:
    digest = hashlib.sha256(ACTION_PROPOSAL_DOMAIN + jcs_canonicalize(binding)).hexdigest()
    return f"sha256:{digest}"


def compute_artifact_digest(raw_bytes: bytes) -> str:
    return f"sha256:{hashlib.sha256(raw_bytes).hexdigest()}"


# ---------------------------------------------------------------------------
# Strict RFC 3339 UTC timestamp & RFC 3986 URI helpers
# ---------------------------------------------------------------------------


class ParsedTimestamp:
    """Exact UTC timestamp supporting leap seconds and arbitrary fractional precision."""

    __slots__ = ("raw", "epoch_ns_floor", "extra_frac", "leap_second")

    def __init__(self, raw: str, epoch_seconds: int, frac_digits: str, leap_second: bool) -> None:
        self.raw = raw
        padded_ns = (frac_digits[:9]).ljust(9, "0")
        self.epoch_ns_floor = epoch_seconds * 1_000_000_000 + int(padded_ns)
        self.extra_frac = frac_digits[9:].rstrip("0")
        self.leap_second = leap_second

    def _cmp_tuple(self) -> tuple[int, int, str]:
        return (self.epoch_ns_floor, 1 if self.leap_second else 0, self.extra_frac)

    def __lt__(self, other: ParsedTimestamp) -> bool:
        return self._cmp_tuple() < other._cmp_tuple()

    def __le__(self, other: ParsedTimestamp) -> bool:
        return self._cmp_tuple() <= other._cmp_tuple()

    def __gt__(self, other: ParsedTimestamp) -> bool:
        return self._cmp_tuple() > other._cmp_tuple()

    def __ge__(self, other: ParsedTimestamp) -> bool:
        return self._cmp_tuple() >= other._cmp_tuple()

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ParsedTimestamp):
            return False
        return self._cmp_tuple() == other._cmp_tuple()

    def elapsed_exceeds_ms(self, earlier: ParsedTimestamp, max_elapsed_ms: int) -> bool:
        diff_ns = self.epoch_ns_floor - earlier.epoch_ns_floor
        limit_ns = max_elapsed_ms * 1_000_000
        if diff_ns > limit_ns:
            return True
        if diff_ns < limit_ns:
            return False
        # Exact boundary at nanosecond level: inspect remaining fractional digits
        if self.leap_second and not earlier.leap_second:
            return True
        return self.extra_frac > earlier.extra_frac


def parse_utc_timestamp(value: Any) -> ParsedTimestamp | None:
    if not isinstance(value, str) or len(value) > 40:
        return None
    m = RFC3339_UTC_RE.match(value)
    if not m:
        return None
    year = int(m.group(1))
    month = int(m.group(2))
    day = int(m.group(3))
    hour = int(m.group(4))
    minute = int(m.group(5))
    second = int(m.group(6))
    frac = m.group(7) or ""

    is_leap_year = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days_in_month = (0, 31, 29 if is_leap_year else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    if month < 1 or month > 12 or day < 1 or day > days_in_month[month]:
        return None
    leap_second = hour == 23 and minute == 59 and second == 60
    if not leap_second and (hour > 23 or minute > 59 or second > 59):
        return None

    # Civil-from-days formula (Howard Hinnant) for proleptic Gregorian calendar
    adj_year = year - (1 if month <= 2 else 0)
    era = adj_year // 400
    yoe = adj_year - era * 400
    adj_month = month + (9 if month <= 2 else -3)
    doy = (153 * adj_month + 2) // 5 + day - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    days_since_epoch = era * 146097 + doe - 719468
    sec = 59 if leap_second else second
    epoch_seconds = days_since_epoch * 86400 + hour * 3600 + minute * 60 + sec
    return ParsedTimestamp(value, epoch_seconds, frac, leap_second)


def is_valid_uri(value: Any) -> bool:
    if not isinstance(value, str) or not value or _contains_lone_surrogate(value):
        return False
    if not URI_CHARS_RE.match(value) or BAD_PCT_RE.search(value):
        return False
    m = URI_SCHEME_RE.match(value)
    if not m:
        return False
    scheme, rest = m.group(1).lower(), m.group(2)
    if not rest:
        return False
    # Split off fragment and query
    hier_and_query = rest.split("#", 1)[0]
    hier = hier_and_query.split("?", 1)[0]
    if hier.startswith("//"):
        authority_and_path = hier[2:]
        slash_idx = authority_and_path.find("/")
        authority = authority_and_path if slash_idx == -1 else authority_and_path[:slash_idx]
        if "@" in authority:
            userinfo, hostport = authority.rsplit("@", 1)
            if userinfo == "" and hostport == "":
                return False
        else:
            hostport = authority
        if not hostport:
            return False
        if hostport.startswith("["):
            close = hostport.find("]")
            if close <= 1:
                return False
            tail = hostport[close + 1 :]
            if tail and not re.match(r"\A:[0-9]*\Z", tail):
                return False
        else:
            if ":" in hostport:
                host, port = hostport.rsplit(":", 1)
                if not host or not re.match(r"\A[0-9]*\Z", port):
                    return False
    elif scheme in ("http", "https"):
        return False
    if scheme == "urn":
        # RFC 8141 basic NID:NSS check
        if not re.match(r"\A[A-Za-z0-9][A-Za-z0-9-]{0,31}:[^\s?#]+\Z", hier):
            return False
    if scheme == "did":
        if not re.match(r"\A[a-z0-9]+:[A-Za-z0-9._:%-]+\Z", hier):
            return False
    return True


# ---------------------------------------------------------------------------
# Pure-stdlib Draft 2020-12 JSON Schema Validator for Work 0.1 Schemas
# ---------------------------------------------------------------------------


def _compile_ecma_pattern(pattern: str) -> re.Pattern[str]:
    """Adapt JSON Schema ECMA-262 anchors so trailing '$' does not allow '\\n'."""
    adapted = pattern
    if adapted.startswith("^"):
        adapted = r"\A" + adapted[1:]
    if adapted.endswith("$") and not adapted.endswith(r"\$"):
        adapted = adapted[:-1] + r"\Z"
    return re.compile(adapted)


class SchemaValidator:
    def __init__(self, schemas_by_id: dict[str, dict[str, Any]]) -> None:
        self.schemas_by_id = schemas_by_id
        self._regex_cache: dict[str, re.Pattern[str]] = {}

    def _pattern(self, raw: str) -> re.Pattern[str]:
        compiled = self._regex_cache.get(raw)
        if compiled is None:
            compiled = _compile_ecma_pattern(raw)
            self._regex_cache[raw] = compiled
        return compiled

    def _resolve_ref(
        self, ref: str, root_schema: dict[str, Any]
    ) -> tuple[Any, dict[str, Any]]:
        if ref in self.schemas_by_id:
            target = self.schemas_by_id[ref]
            return target, target
        if ref.startswith("#/"):
            node: Any = root_schema
            for part in ref[2:].split("/"):
                unescaped = part.replace("~1", "/").replace("~0", "~")
                node = node[unescaped]
            return node, root_schema
        raise KeyError(f"Unresolvable schema $ref: {ref}")

    def validate(
        self,
        instance: Any,
        schema: Any,
        root_schema: dict[str, Any],
        path: str = "",
    ) -> list[tuple[str, str]]:
        errors: list[tuple[str, str]] = []
        self._check(instance, schema, root_schema, path or "/", errors)
        return errors

    def _matches_quiet(
        self, instance: Any, schema: Any, root_schema: dict[str, Any]
    ) -> bool:
        probe: list[tuple[str, str]] = []
        self._check(instance, schema, root_schema, "/", probe)
        return len(probe) == 0

    def _check(
        self,
        instance: Any,
        schema: Any,
        root_schema: dict[str, Any],
        path: str,
        errors: list[tuple[str, str]],
    ) -> None:
        if len(errors) >= MAX_ISSUES:
            return
        if isinstance(schema, bool):
            if not schema:
                errors.append((path, "Value is disallowed by boolean false schema."))
            return

        if "$ref" in schema:
            target, next_root = self._resolve_ref(schema["$ref"], root_schema)
            self._check(instance, target, next_root, path, errors)
            if len(errors) >= MAX_ISSUES:
                return

        expected_type = schema.get("type")
        if expected_type is not None:
            if not self._check_type(instance, expected_type):
                errors.append((path, f"Value does not match required schema type '{expected_type}'."))
                return

        if "const" in schema and not json_equal(instance, schema["const"]):
            errors.append((path, "Value does not match schema constant."))

        if "enum" in schema and not any(json_equal(instance, item) for item in schema["enum"]):
            errors.append((path, "Value is not one of the permitted schema enum values."))

        if isinstance(instance, str):
            if _contains_lone_surrogate(instance):
                errors.append((path, "String contains a lone UTF-16 surrogate."))
            if "minLength" in schema and len(instance) < schema["minLength"]:
                errors.append((path, "String is shorter than schema minLength."))
            if "maxLength" in schema and len(instance) > schema["maxLength"]:
                errors.append((path, "String exceeds schema maxLength."))
            if "pattern" in schema and not self._pattern(schema["pattern"]).search(instance):
                errors.append((path, "String does not match schema pattern."))
            fmt = schema.get("format")
            if fmt == "date-time" and parse_utc_timestamp(instance) is None:
                errors.append((path, "String is not a valid RFC 3339 UTC timestamp."))
            elif fmt == "uri" and not is_valid_uri(instance):
                errors.append((path, "String is not a valid RFC 3986 URI."))

        if isinstance(instance, int) and not isinstance(instance, bool):
            if "minimum" in schema and instance < schema["minimum"]:
                errors.append((path, "Integer is below schema minimum."))
            if "maximum" in schema and instance > schema["maximum"]:
                errors.append((path, "Integer exceeds schema maximum."))

        if isinstance(instance, list):
            if "minItems" in schema and len(instance) < schema["minItems"]:
                errors.append((path, "Array has fewer items than schema minItems."))
            if "maxItems" in schema and len(instance) > schema["maxItems"]:
                errors.append((path, "Array exceeds schema maxItems."))
            if schema.get("uniqueItems"):
                seen: set[bytes] = set()
                for item in instance:
                    canon = jcs_canonicalize(item)
                    if canon in seen:
                        errors.append((path, "Array contains duplicate items."))
                        break
                    seen.add(canon)
            prefix_items = schema.get("prefixItems")
            start_idx = 0
            if isinstance(prefix_items, list):
                for idx, sub in enumerate(prefix_items):
                    if idx < len(instance):
                        child_path = f"{path.rstrip('/')}/{idx}"
                        self._check(instance[idx], sub, root_schema, child_path, errors)
                start_idx = len(prefix_items)
            if "items" in schema:
                items_schema = schema["items"]
                for idx in range(start_idx, len(instance)):
                    child_path = f"{path.rstrip('/')}/{idx}"
                    self._check(instance[idx], items_schema, root_schema, child_path, errors)
            if "contains" in schema:
                min_contains = schema.get("minContains", 1)
                matches = sum(
                    1
                    for item in instance
                    if self._matches_quiet(item, schema["contains"], root_schema)
                )
                if matches < min_contains:
                    errors.append((path, "Array does not satisfy schema contains requirement."))

        if isinstance(instance, dict):
            if "maxProperties" in schema and len(instance) > schema["maxProperties"]:
                errors.append((path, "Object exceeds schema maxProperties."))
            req = schema.get("required")
            if isinstance(req, list):
                for key in req:
                    if key not in instance:
                        errors.append((f"{path.rstrip('/')}/{_escape_ptr(key)}", "Required property is missing."))
            props = schema.get("properties", {})
            addl = schema.get("additionalProperties", True)
            for idx_key, (key, val) in enumerate(instance.items()):
                # Avoid echoing arbitrary unknown property names if they could carry sentinels
                if key in props:
                    child_path = f"{path.rstrip('/')}/{_escape_ptr(key)}"
                    self._check(val, props[key], root_schema, child_path, errors)
                elif addl is False:
                    errors.append((f"{path.rstrip('/')}/$unknown_{idx_key}", "Additional property is not permitted."))
                elif isinstance(addl, dict):
                    child_path = f"{path.rstrip('/')}/$prop_{idx_key}"
                    self._check(val, addl, root_schema, child_path, errors)

        if "allOf" in schema:
            for sub in schema["allOf"]:
                self._check(instance, sub, root_schema, path, errors)

        if "anyOf" in schema:
            if not any(self._matches_quiet(instance, sub, root_schema) for sub in schema["anyOf"]):
                errors.append((path, "Value does not satisfy any schema in anyOf."))

        if "oneOf" in schema:
            matched_subs = [
                sub for sub in schema["oneOf"] if self._matches_quiet(instance, sub, root_schema)
            ]
            if len(matched_subs) != 1:
                # Drill into discriminating subschema if obvious (e.g. by type/state/kind/mode)
                drilled = False
                if len(matched_subs) == 0 and isinstance(instance, dict):
                    for disc in ("type", "state", "kind", "mode"):
                        if disc in instance:
                            for sub in schema["oneOf"]:
                                sub_disc = sub.get("properties", {}).get(disc, {})
                                if "const" in sub_disc and json_equal(instance[disc], sub_disc["const"]):
                                    self._check(instance, sub, root_schema, path, errors)
                                    drilled = True
                                    break
                                if "enum" in sub_disc and any(
                                    json_equal(instance[disc], e) for e in sub_disc["enum"]
                                ):
                                    self._check(instance, sub, root_schema, path, errors)
                                    drilled = True
                                    break
                        if drilled:
                            break
                if not drilled:
                    errors.append((path, "Value must match exactly one schema branch in oneOf."))

        if "not" in schema:
            if self._matches_quiet(instance, schema["not"], root_schema):
                errors.append((path, "Value matched a forbidden schema constraint."))

        if "if" in schema:
            if self._matches_quiet(instance, schema["if"], root_schema):
                if "then" in schema:
                    self._check(instance, schema["then"], root_schema, path, errors)
            elif "else" in schema:
                self._check(instance, schema["else"], root_schema, path, errors)

    @staticmethod
    def _check_type(instance: Any, expected: str) -> bool:
        if expected == "object":
            return isinstance(instance, dict)
        if expected == "array":
            return isinstance(instance, list)
        if expected == "string":
            return isinstance(instance, str)
        if expected == "boolean":
            return isinstance(instance, bool)
        if expected == "integer":
            return isinstance(instance, int) and not isinstance(instance, bool)
        if expected == "number":
            return isinstance(instance, (int, float)) and not isinstance(instance, bool) and math.isfinite(instance)
        if expected == "null":
            return instance is None
        return False


def _escape_ptr(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


# ---------------------------------------------------------------------------
# Schema Loading
# ---------------------------------------------------------------------------


def _default_work_dir() -> Path:
    return Path(__file__).resolve().parent.parent


_VALIDATOR_CACHE: SchemaValidator | None = None


def get_schema_validator(work_dir: Path | None = None) -> SchemaValidator:
    global _VALIDATOR_CACHE
    if work_dir is None and _VALIDATOR_CACHE is not None:
        return _VALIDATOR_CACHE
    base = work_dir or _default_work_dir()
    run_schema = json.loads((base / "run.schema.json").read_text(encoding="utf-8"))
    problem_schema = json.loads((base / "problem.schema.json").read_text(encoding="utf-8"))
    result_schema = json.loads((base / "result.schema.json").read_text(encoding="utf-8"))
    validator = SchemaValidator(
        {
            run_schema["$id"]: run_schema,
            problem_schema["$id"]: problem_schema,
            result_schema["$id"]: result_schema,
        }
    )
    if work_dir is None:
        _VALIDATOR_CACHE = validator
    return validator


# ---------------------------------------------------------------------------
# Strict JSON Loader (rejecting duplicate keys and non-finite constants)
# ---------------------------------------------------------------------------


class DuplicateKeyError(ValueError):
    pass


def _strict_object_pairs_hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for k, v in pairs:
        if _contains_lone_surrogate(k):
            raise ValueError("Lone surrogate in object key.")
        if k in obj:
            raise DuplicateKeyError("Duplicate object key.")
        obj[k] = v
    return obj


def _reject_parse_constant(_token: str) -> Any:
    raise ValueError("Non-finite JSON constant is forbidden.")


def _strict_parse_int(token: str) -> int:
    val = int(token)
    if val < -MAX_SAFE_INT or val > MAX_SAFE_INT:
        raise ValueError("Integer outside IEEE-754 safe integer range.")
    return val


def _strict_parse_float(token: str) -> float:
    val = float(token)
    if not math.isfinite(val):
        raise ValueError("Float overflow to infinity.")
    return val


def parse_strict_json(text: str) -> Any:
    return json.loads(
        text,
        object_pairs_hook=_strict_object_pairs_hook,
        parse_constant=_reject_parse_constant,
        parse_int=_strict_parse_int,
        parse_float=_strict_parse_float,
    )


# ---------------------------------------------------------------------------
# Projections & Privacy Helpers
# ---------------------------------------------------------------------------


def make_data_zone_projection(zone: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": zone["id"],
        "classification": zone["classification"],
        "purpose": zone["purpose"],
        "audience": zone["audience"],
        "retention": zone["retention"],
    }


def make_evidence_projection(
    ev: dict[str, Any], zones_by_id: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    zone = zones_by_id.get(ev["data_zone_id"])
    if zone is None:
        return None
    proj: dict[str, Any] = {
        "id": ev["id"],
        "kind": ev["kind"],
        "digest": ev["digest"],
        "observed_at": ev["observed_at"],
        "recorded_by_actor_id": ev["recorded_by_actor_id"],
        "scope": ev["scope"],
        "data_zone": make_data_zone_projection(zone),
    }
    for optional_key in ("consent_subject_actor_ids", "action_scope", "causal_scope"):
        if optional_key in ev:
            proj[optional_key] = ev[optional_key]
    return proj


def make_proposal_action_scope(proposal_binding: dict[str, Any]) -> dict[str, Any]:
    return {
        "run_id": proposal_binding["run_id"],
        "purpose": proposal_binding["purpose"],
        "operation": proposal_binding["operation"],
        "target": proposal_binding["target"],
        "data_zone_ids": [z["id"] for z in proposal_binding["data_zones"]],
        "expected_effect": proposal_binding["expected_effect"],
    }


def looks_like_credential_literal(name: str, value: Any) -> bool:
    if CREDENTIAL_NAME_RE.search(name):
        return True
    if isinstance(value, str):
        return any(rx.search(value) for rx in SECRET_VALUE_PATTERNS)
    return False


def looks_like_secret_locator(locator: str) -> bool:
    if "?" in locator or "#" in locator:
        return True
    m = URI_SCHEME_RE.match(locator)
    if m and m.group(2).startswith("//"):
        authority = m.group(2)[2:].split("/", 1)[0]
        if "@" in authority:
            return True
    if any(rx.search(locator) for rx in SECRET_VALUE_PATTERNS):
        return True
    # Check secret-shaped tokens in URI path/NSS segments
    if re.search(
        r"(?:[:/])(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|"
        r"xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{12,}|bearer[:_]|password[:_]|secret[:_])",
        locator,
        re.IGNORECASE,
    ):
        return True
    return False


# ---------------------------------------------------------------------------
# Core Verifier
# ---------------------------------------------------------------------------


def _utc_now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class _RunCheckTracker:
    def __init__(self) -> None:
        self.outcomes: dict[str, str] = {cid: "not_run" for cid, _ in CHECK_SPECS}
        self.observed: dict[str, str] = {
            cid: "Check was not run because an earlier prerequisite layer failed."
            for cid, _ in CHECK_SPECS
        }
        self.issues: list[dict[str, str]] = []
        self.check_fail_counts: dict[str, int] = {cid: 0 for cid, _ in CHECK_SPECS}

    def start(self, check_id: str, pass_msg: str) -> None:
        self.outcomes[check_id] = "pass"
        self.observed[check_id] = pass_msg

    def fail(self, check_id: str, code: str, path: str, message: str) -> None:
        self.outcomes[check_id] = "fail"
        self.check_fail_counts[check_id] += 1
        count = self.check_fail_counts[check_id]
        self.observed[check_id] = (
            f"1 validation issue recorded in {check_id}."
            if count == 1
            else f"{count} validation issues recorded in {check_id}."
        )
        if len(self.issues) < MAX_ISSUES:
            self.issues.append(
                {
                    "code": code,
                    "path": path,
                    "message": message,
                }
            )


def check_work_bytes(
    raw_bytes: bytes,
    *,
    complete: bool = True,
    observed_at: str | None = None,
    work_dir: Path | None = None,
) -> dict[str, Any]:
    """Validate raw bytes of one XENIA Work 0.1 run document without external I/O."""
    now = observed_at or _utc_now_str()
    if parse_utc_timestamp(now) is None:
        raise ValueError("observed_at must be a valid uppercase UTC RFC 3339 timestamp.")

    tracker = _RunCheckTracker()
    validator = get_schema_validator(work_dir)
    run_schema = validator.schemas_by_id[RUN_SCHEMA_ID]

    # 1. R.INPUT
    if not complete or len(raw_bytes) > MAX_INPUT_BYTES:
        observed_len = min(len(raw_bytes), MAX_INPUT_BYTES)
        artifact_obj: dict[str, Any] = {
            "complete": False,
            "observed_bytes": observed_len,
        }
        tracker.start("R.INPUT", "Input bytes are complete and within limit.")
        tracker.fail(
            "R.INPUT",
            "input_too_large",
            "/",
            "Input exceeds max_input_bytes (1048576) or could not be read completely.",
        )
        return _finalize_result(tracker, artifact_obj, {"state": "unavailable"}, now)

    artifact_obj = {
        "complete": True,
        "observed_bytes": len(raw_bytes),
        "sha256": compute_artifact_digest(raw_bytes),
    }
    tracker.start("R.INPUT", f"Observed {len(raw_bytes)} complete bytes within limit.")

    # 2. R.UTF8
    tracker.start("R.UTF8", "Input bytes decoded as valid UTF-8.")
    try:
        text = raw_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        tracker.fail("R.UTF8", "invalid_utf8", "/", "Input bytes are not valid UTF-8.")
        return _finalize_result(tracker, artifact_obj, {"state": "unavailable"}, now)

    # 3. R.JSON
    tracker.start("R.JSON", "Input parsed as a JSON object without duplicate keys.")
    try:
        doc = parse_strict_json(text)
    except DuplicateKeyError:
        tracker.fail("R.JSON", "duplicate_json_key", "/", "JSON input contains a duplicate object key.")
        return _finalize_result(tracker, artifact_obj, {"state": "unavailable"}, now)
    except Exception:
        tracker.fail("R.JSON", "invalid_json", "/", "Input text is not a valid Work JSON value.")
        return _finalize_result(tracker, artifact_obj, {"state": "unavailable"}, now)

    if not isinstance(doc, dict):
        tracker.fail("R.JSON", "root_not_object", "/", "Root JSON value must be an object.")
        return _finalize_result(tracker, artifact_obj, {"state": "unavailable"}, now)

    terminal_state = doc.get("terminal_state")
    run_meta: dict[str, Any] = (
        {"state": "available", "terminal_state": terminal_state}
        if isinstance(terminal_state, str) and terminal_state in TERMINAL_EVENT_BY_STATE
        else {"state": "unavailable"}
    )

    # 4. R.SCHEMA
    tracker.start("R.SCHEMA", "Run document matches XENIA Work 0.1 JSON Schemas.")
    schema_errors = validator.validate(doc, run_schema, run_schema, "")
    for err_path, err_msg in schema_errors:
        tracker.fail("R.SCHEMA", "schema_violation", err_path, err_msg)
    if tracker.outcomes["R.SCHEMA"] == "fail":
        return _finalize_result(tracker, artifact_obj, run_meta, now, doc=doc)

    # From here on, doc satisfies run.schema.json and problem.schema.json shapes.
    _check_semantics(doc, tracker)
    return _finalize_result(tracker, artifact_obj, run_meta, now, doc=doc)


def _check_semantics(doc: dict[str, Any], tracker: _RunCheckTracker) -> None:
    for cid, _ in CHECK_SPECS[4:-1]:
        tracker.start(cid, f"All bounded {cid} invariants passed.")

    actors: list[dict[str, Any]] = doc["actors"]
    data_zones: list[dict[str, Any]] = doc["data_zones"]
    evidence_list: list[dict[str, Any]] = doc["evidence"]
    events: list[dict[str, Any]] = doc["events"]
    limits: dict[str, Any] = doc["limits"]

    created_ts = parse_utc_timestamp(doc["created_at"])
    updated_ts = parse_utc_timestamp(doc["updated_at"])
    expires_ts = parse_utc_timestamp(limits["expires_at"])
    assert created_ts is not None and updated_ts is not None and expires_ts is not None

    # --- 5. R.LEDGER_ORDER ---
    actors_by_id: dict[str, dict[str, Any]] = {}
    for idx, actor in enumerate(actors):
        aid = actor["id"]
        if aid in actors_by_id:
            tracker.fail("R.LEDGER_ORDER", "duplicate_actor_id", f"/actors/{idx}/id", "Duplicate actor ID.")
        else:
            actors_by_id[aid] = actor
        claim_ids: set[str] = set()
        for cidx, claim in enumerate(actor["identity_claims"]):
            cid = claim["id"]
            if cid in claim_ids:
                tracker.fail(
                    "R.LEDGER_ORDER",
                    "duplicate_identity_claim_id",
                    f"/actors/{idx}/identity_claims/{cidx}/id",
                    "Duplicate identity claim ID on actor.",
                )
            claim_ids.add(cid)

    zones_by_id: dict[str, dict[str, Any]] = {}
    for idx, zone in enumerate(data_zones):
        zid = zone["id"]
        if zid in zones_by_id:
            tracker.fail("R.LEDGER_ORDER", "duplicate_data_zone_id", f"/data_zones/{idx}/id", "Duplicate data zone ID.")
        else:
            zones_by_id[zid] = zone

    evidence_by_id: dict[str, dict[str, Any]] = {}
    for idx, ev in enumerate(evidence_list):
        eid = ev["id"]
        if eid in evidence_by_id:
            tracker.fail("R.LEDGER_ORDER", "duplicate_evidence_id", f"/evidence/{idx}/id", "Duplicate evidence ID.")
        else:
            evidence_by_id[eid] = ev

    events_by_id: dict[str, tuple[int, dict[str, Any]]] = {}
    event_timestamps: list[ParsedTimestamp] = []
    for idx, event in enumerate(events):
        ev_id = event["id"]
        if ev_id in events_by_id:
            tracker.fail("R.LEDGER_ORDER", "duplicate_event_id", f"/events/{idx}/id", "Duplicate event ID.")
        else:
            events_by_id[ev_id] = (idx, event)

        expected_seq = idx + 1
        if event["sequence"] != expected_seq:
            tracker.fail(
                "R.LEDGER_ORDER",
                "event_sequence_mismatch",
                f"/events/{idx}/sequence",
                "Event sequence must start at 1 and increment by 1.",
            )
        if idx == 0:
            if event["type"] != "work.offered":
                tracker.fail(
                    "R.LEDGER_ORDER",
                    "first_event_not_offer",
                    "/events/0/type",
                    "First event must be work.offered.",
                )
            if event["previous_event_id"] is not None:
                tracker.fail(
                    "R.LEDGER_ORDER",
                    "first_event_previous_not_null",
                    "/events/0/previous_event_id",
                    "First event must set previous_event_id to null.",
                )
        else:
            if event["previous_event_id"] != events[idx - 1]["id"]:
                tracker.fail(
                    "R.LEDGER_ORDER",
                    "previous_event_mismatch",
                    f"/events/{idx}/previous_event_id",
                    "Event previous_event_id must name the immediately preceding event.",
                )

        ev_ts = parse_utc_timestamp(event["at"])
        assert ev_ts is not None
        if event_timestamps and ev_ts < event_timestamps[-1]:
            tracker.fail(
                "R.LEDGER_ORDER",
                "event_time_regression",
                f"/events/{idx}/at",
                "Event timestamps must not move backwards.",
            )
        event_timestamps.append(ev_ts)

    if event_timestamps:
        if created_ts != event_timestamps[0]:
            tracker.fail(
                "R.LEDGER_ORDER",
                "created_at_mismatch",
                "/created_at",
                "created_at must equal the first event timestamp.",
            )
        if updated_ts != event_timestamps[-1]:
            tracker.fail(
                "R.LEDGER_ORDER",
                "updated_at_mismatch",
                "/updated_at",
                "updated_at must equal the final event timestamp.",
            )

    # --- 6. R.TERMINAL ---
    term_id = doc["terminal_event_id"]
    term_entry = events_by_id.get(term_id)
    expected_term_type = TERMINAL_EVENT_BY_STATE[doc["terminal_state"]]
    term_idx: int | None = None
    if term_entry is None:
        tracker.fail(
            "R.TERMINAL",
            "terminal_event_missing",
            "/terminal_event_id",
            "terminal_event_id does not resolve to an event in the run.",
        )
    else:
        term_idx, term_ev = term_entry
        if term_ev["type"] != expected_term_type:
            tracker.fail(
                "R.TERMINAL",
                "terminal_state_mismatch",
                f"/events/{term_idx}/type",
                "Terminal event type does not match top-level terminal_state.",
            )
        for idx, ev in enumerate(events):
            if idx < term_idx and ev["type"] in TERMINAL_EVENT_TYPES:
                tracker.fail(
                    "R.TERMINAL",
                    "multiple_terminal_events",
                    f"/events/{idx}/type",
                    "A terminal event appeared before terminal_event_id.",
                )
            elif idx > term_idx and ev["type"] not in ("correction.appended", "appeal.appended"):
                tracker.fail(
                    "R.TERMINAL",
                    "post_terminal_event_forbidden",
                    f"/events/{idx}/type",
                    "Only correction.appended and appeal.appended may follow terminal_event_id.",
                )

    if "continuation" in doc and doc["continuation"]["prior_run_id"] == doc["run_id"]:
        tracker.fail(
            "R.TERMINAL",
            "self_continuation_forbidden",
            "/continuation/prior_run_id",
            "Continuation prior_run_id must name a distinct earlier run.",
        )
    if "source_handoff" in doc and doc["source_handoff"]["source_run_id"] == doc["run_id"]:
        tracker.fail(
            "R.TERMINAL",
            "self_handoff_forbidden",
            "/source_handoff/source_run_id",
            "Source handoff source_run_id must name a distinct earlier run.",
        )

    # --- 7. R.LIMITS_PLAN ---
    max_events = limits["max_events"]
    repair_reserve = limits["repair_event_reserve"]
    if len(events) > max_events:
        tracker.fail(
            "R.LIMITS_PLAN",
            "max_events_exceeded",
            "/events",
            "Total events exceed limits.max_events.",
        )
    if term_idx is not None:
        term_seq = events[term_idx]["sequence"]
        if term_seq > max_events - repair_reserve:
            tracker.fail(
                "R.LIMITS_PLAN",
                "repair_reserve_consumed",
                f"/events/{term_idx}/sequence",
                "Terminal event consumes slots reserved for post-terminal repair.",
            )
    if updated_ts.elapsed_exceeds_ms(created_ts, limits["max_elapsed_ms"]):
        tracker.fail(
            "R.LIMITS_PLAN",
            "max_elapsed_exceeded",
            "/updated_at",
            "Run elapsed time exceeds limits.max_elapsed_ms.",
        )
    if expires_ts < created_ts:
        tracker.fail(
            "R.LIMITS_PLAN",
            "expires_before_created",
            "/limits/expires_at",
            "limits.expires_at must not precede created_at.",
        )

    exec_started_count = sum(1 for ev in events if ev["type"] == "execution.started")
    if exec_started_count > limits["max_external_effects"]:
        tracker.fail(
            "R.LIMITS_PLAN",
            "max_external_effects_exceeded",
            "/events",
            "Recorded execution.started events exceed limits.max_external_effects.",
        )

    plans_by_event_id: dict[str, tuple[int, dict[str, Any], set[str]]] = {}
    for idx, ev in enumerate(events):
        if ev["type"] == "plan.proposed":
            payload = ev["payload"]
            steps = payload["steps"]
            if len(steps) > limits["max_plan_steps"]:
                tracker.fail(
                    "R.LIMITS_PLAN",
                    "max_plan_steps_exceeded",
                    f"/events/{idx}/payload/steps",
                    "Plan step count exceeds limits.max_plan_steps.",
                )
            step_ids: set[str] = set()
            deps_map: dict[str, list[str]] = {}
            for sidx, step in enumerate(steps):
                sid = step["id"]
                if sid in step_ids:
                    tracker.fail(
                        "R.LIMITS_PLAN",
                        "duplicate_plan_step_id",
                        f"/events/{idx}/payload/steps/{sidx}/id",
                        "Plan step IDs must be unique within a plan.",
                    )
                step_ids.add(sid)
                deps_map[sid] = step["depends_on"]
            for sidx, step in enumerate(steps):
                for didx, dep_id in enumerate(step["depends_on"]):
                    if dep_id not in step_ids:
                        tracker.fail(
                            "R.LIMITS_PLAN",
                            "unknown_plan_dependency",
                            f"/events/{idx}/payload/steps/{sidx}/depends_on/{didx}",
                            "Plan dependency must name a step in the same plan.",
                        )
            if _has_cycle(deps_map):
                tracker.fail(
                    "R.LIMITS_PLAN",
                    "plan_dependency_cycle",
                    f"/events/{idx}/payload/steps",
                    "Plan step dependencies must form an acyclic graph.",
                )
            plans_by_event_id[ev["id"]] = (idx, ev, step_ids)

    # --- 8. R.ACTORS ---
    pair_actor_ids: set[str] = set()
    for idx, actor in enumerate(actors):
        if actor["kind"] == "human_agent_pair":
            pair_actor_ids.add(actor["id"])
            seen_members: set[str] = set()
            for midx, member in enumerate(actor["pair_members"]):
                mid = member["actor_id"]
                role = member["role"]
                if mid == actor["id"]:
                    tracker.fail(
                        "R.ACTORS",
                        "pair_self_membership",
                        f"/actors/{idx}/pair_members/{midx}/actor_id",
                        "A human-agent pair cannot list itself as a member.",
                    )
                if mid in seen_members:
                    tracker.fail(
                        "R.ACTORS",
                        "duplicate_pair_member",
                        f"/actors/{idx}/pair_members/{midx}/actor_id",
                        "Pair member actor_id must not be repeated.",
                    )
                seen_members.add(mid)
                target_actor = actors_by_id.get(mid)
                if target_actor is None:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_actor_reference",
                        f"/actors/{idx}/pair_members/{midx}/actor_id",
                        "Pair member actor_id does not resolve to a declared actor.",
                    )
                else:
                    if role == "human" and target_actor["kind"] != "human":
                        tracker.fail(
                            "R.ACTORS",
                            "pair_member_role_mismatch",
                            f"/actors/{idx}/pair_members/{midx}/role",
                            "Human pair role must reference an actor of kind human.",
                        )
                    elif role == "agent" and target_actor["kind"] != "agent":
                        tracker.fail(
                            "R.ACTORS",
                            "pair_member_role_mismatch",
                            f"/actors/{idx}/pair_members/{midx}/role",
                            "Agent pair role must reference an actor of kind agent.",
                        )

    # --- 9. R.REFERENCES & Top-level Projection Cache ---
    expected_zone_proj: dict[str, dict[str, Any]] = {
        zid: make_data_zone_projection(z) for zid, z in zones_by_id.items()
    }
    expected_ev_proj: dict[str, dict[str, Any]] = {}

    for idx, actor in enumerate(actors):
        for cidx, claim in enumerate(actor["identity_claims"]):
            for eidx, eid in enumerate(claim["evidence_ids"]):
                if eid not in evidence_by_id:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_evidence_reference",
                        f"/actors/{idx}/identity_claims/{cidx}/evidence_ids/{eidx}",
                        "Identity claim evidence_id does not resolve to declared evidence.",
                    )

    for idx, zone in enumerate(data_zones):
        aud = zone["audience"]
        if aud["mode"] == "actors":
            for aidx, aid in enumerate(aud["actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_actor_reference",
                        f"/data_zones/{idx}/audience/actor_ids/{aidx}",
                        "Data zone audience actor_id does not resolve to a declared actor.",
                    )

    for idx, ev in enumerate(evidence_list):
        ev_obs_ts = parse_utc_timestamp(ev["observed_at"])
        if ev_obs_ts is not None and ev_obs_ts > updated_ts:
            tracker.fail(
                "R.LEDGER_ORDER",
                "evidence_after_update",
                f"/evidence/{idx}/observed_at",
                "Top-level evidence observed_at cannot exceed run updated_at.",
            )
        if ev["recorded_by_actor_id"] not in actors_by_id:
            tracker.fail(
                "R.REFERENCES",
                "unknown_actor_reference",
                f"/evidence/{idx}/recorded_by_actor_id",
                "Evidence recorded_by_actor_id does not resolve to a declared actor.",
            )
        if ev["data_zone_id"] not in zones_by_id:
            tracker.fail(
                "R.REFERENCES",
                "unknown_data_zone_reference",
                f"/evidence/{idx}/data_zone_id",
                "Evidence data_zone_id does not resolve to a declared data zone.",
            )
        else:
            proj = make_evidence_projection(ev, zones_by_id)
            if proj is not None:
                expected_ev_proj[ev["id"]] = proj
        if "consent_subject_actor_ids" in ev:
            for sidx, sid in enumerate(ev["consent_subject_actor_ids"]):
                if sid not in actors_by_id:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_actor_reference",
                        f"/evidence/{idx}/consent_subject_actor_ids/{sidx}",
                        "Consent subject actor_id does not resolve to a declared actor.",
                    )
        if "action_scope" in ev:
            ascope = ev["action_scope"]
            for zidx, zid in enumerate(ascope["data_zone_ids"]):
                if zid not in zones_by_id:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_data_zone_reference",
                        f"/evidence/{idx}/action_scope/data_zone_ids/{zidx}",
                        "Action scope data_zone_id does not resolve to a declared data zone.",
                    )
            for aidx, aid in enumerate(ascope["expected_effect"]["affected_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_actor_reference",
                        f"/evidence/{idx}/action_scope/expected_effect/affected_actor_ids/{aidx}",
                        "Action scope affected_actor_id does not resolve to a declared actor.",
                    )
        if "causal_scope" in ev:
            cscope = ev["causal_scope"]
            if cscope.get("run_id") != doc["run_id"]:
                tracker.fail(
                    "R.REFERENCES",
                    "evidence_causal_scope_run_mismatch",
                    f"/evidence/{idx}/causal_scope/run_id",
                    "Causal scope run_id must match this run's run_id.",
                )
            for field_name, expected_type in (
                ("proposal_event_id", "action.proposed"),
                ("execution_event_id", "execution.started"),
                ("receipt_event_id", "execution.receipt"),
            ):
                ref_entry = events_by_id.get(cscope[field_name])
                if ref_entry is None or ref_entry[1]["type"] != expected_type:
                    tracker.fail(
                        "R.REFERENCES",
                        "event_reference_missing",
                        f"/evidence/{idx}/causal_scope/{field_name}",
                        "Causal scope event reference does not resolve to a matching event in the run.",
                    )
            for aidx, aid in enumerate(cscope["expected_effect"]["affected_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail(
                        "R.REFERENCES",
                        "unknown_actor_reference",
                        f"/evidence/{idx}/causal_scope/expected_effect/affected_actor_ids/{aidx}",
                        "Causal scope affected_actor_id does not resolve to a declared actor.",
                    )

    record_zone_id = doc["record_data_zone_id"]
    record_zone = zones_by_id.get(record_zone_id)
    if record_zone is None:
        tracker.fail(
            "R.REFERENCES",
            "unknown_record_data_zone",
            "/record_data_zone_id",
            "record_data_zone_id does not resolve to a declared data zone.",
        )
    else:
        _check_record_zone_restrictiveness(record_zone, data_zones, tracker)

    # Helper checks for projections
    def verify_zone_proj(proj: dict[str, Any], path: str) -> None:
        exp = expected_zone_proj.get(proj["id"])
        if exp is None:
            tracker.fail("R.REFERENCES", "unknown_data_zone_reference", f"{path}/id", "Projected data zone ID is not declared.")
        elif not json_equal(proj, exp):
            tracker.fail("R.REFERENCES", "data_zone_binding_mismatch", path, "Data zone projection differs from top-level declaration.")

    def verify_ev_proj(proj: dict[str, Any], path: str) -> None:
        if proj["id"] not in evidence_by_id:
            tracker.fail("R.REFERENCES", "unknown_evidence_reference", f"{path}/id", "Projected evidence ID is not declared.")
            return
        exp = expected_ev_proj.get(proj["id"])
        if exp is None or not json_equal(proj, exp):
            tracker.fail("R.REFERENCES", "evidence_binding_mismatch", path, "Evidence projection differs from top-level declaration.")

    # --- Event-by-event walk covering R.REFERENCES, R.STATE, R.DIGESTS, R.AUTHORITY, R.APPROVALS, R.EXECUTION, R.EFFECTS, R.PROBLEMS ---
    offers_by_id: dict[str, tuple[int, dict[str, Any]]] = {}
    accepted_actor_id: str | None = None
    accepted_offer_id: str | None = None
    cancelled_at_idx: int | None = None

    authority_claims_by_id: dict[str, tuple[int, dict[str, Any], str]] = {}
    withdrawn_claim_ids: dict[str, int] = {}

    proposals_by_id: dict[str, tuple[int, dict[str, Any], str]] = {}
    rejected_proposals: dict[str, list[int]] = {}
    approvals_by_id: dict[str, tuple[int, dict[str, Any]]] = {}
    approvals_by_proposal: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    executions_by_id: dict[str, tuple[int, dict[str, Any]]] = {}
    executions_by_proposal: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    used_execution_uris: set[str] = set()
    receipts_by_id: dict[str, tuple[int, dict[str, Any]]] = {}
    receipts_by_execution: dict[str, list[int]] = {}
    receipts_by_proposal: dict[str, list[int]] = {}
    observations_by_proposal: dict[str, list[int]] = {}

    for idx, ev in enumerate(events):
        ev_type = ev["type"]
        ev_id = ev["id"]
        ev_actor = ev["actor_id"]
        ev_ts = event_timestamps[idx]
        payload = ev["payload"]
        p_base = f"/events/{idx}/payload"

        if ev_actor not in actors_by_id:
            tracker.fail("R.REFERENCES", "unknown_actor_reference", f"/events/{idx}/actor_id", "Event actor_id is not declared.")

        if ev_type == "work.offered":
            offers_by_id[ev_id] = (idx, ev)
            for aidx, aid in enumerate(payload["offered_to_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/offered_to_actor_ids/{aidx}", "Offered actor_id is not declared.")
            for aidx, aid in enumerate(payload["affected_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/affected_actor_ids/{aidx}", "Affected actor_id is not declared.")
            for zidx, zid in enumerate(payload["data_zone_ids"]):
                if zid not in zones_by_id:
                    tracker.fail("R.REFERENCES", "unknown_data_zone_reference", f"{p_base}/data_zone_ids/{zidx}", "Offer data_zone_id is not declared.")

        elif ev_type == "work.accepted":
            oid = payload["offer_event_id"]
            offer_entry = offers_by_id.get(oid)
            if offer_entry is None:
                tracker.fail("R.REFERENCES", "unknown_offer_reference", f"{p_base}/offer_event_id", "offer_event_id must reference an earlier work.offered event.")
            else:
                _, offer_ev = offer_entry
                if ev_actor not in offer_ev["payload"]["offered_to_actor_ids"]:
                    tracker.fail("R.STATE", "unoffered_acceptance", f"/events/{idx}/actor_id", "Only an offered participant may accept the offer.")
                if accepted_offer_id is not None:
                    tracker.fail("R.STATE", "duplicate_acceptance", f"/events/{idx}/type", "Work participation was already accepted in this segment.")
                else:
                    accepted_offer_id = oid
                    accepted_actor_id = ev_actor

        elif ev_type == "work.declined":
            oid = payload["offer_event_id"]
            offer_entry = offers_by_id.get(oid)
            if offer_entry is None:
                tracker.fail("R.REFERENCES", "unknown_offer_reference", f"{p_base}/offer_event_id", "offer_event_id must reference an earlier work.offered event.")
            else:
                _, offer_ev = offer_entry
                if accepted_actor_id is not None:
                    tracker.fail("R.STATE", "decline_after_acceptance", f"/events/{idx}/type", "work.declined applies before acceptance; use cancel or pause after acceptance.")
                if ev_actor not in offer_ev["payload"]["offered_to_actor_ids"]:
                    tracker.fail("R.STATE", "unoffered_choice_actor", f"/events/{idx}/actor_id", "Before acceptance, only an offered participant may decline.")
                if "decline" not in offer_ev["payload"]["exit_options"]:
                    tracker.fail("R.STATE", "choice_not_advertised", f"/events/{idx}/type", "Offer did not advertise 'decline' in exit_options.")

        elif ev_type == "work.asked":
            for aidx, aid in enumerate(payload["to_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/to_actor_ids/{aidx}", "Question recipient actor_id is not declared.")
            if payload["data_zone_id"] not in zones_by_id:
                tracker.fail("R.REFERENCES", "unknown_data_zone_reference", f"{p_base}/data_zone_id", "Question data_zone_id is not declared.")
            _check_participant_choice(
                ev_actor,
                "ask",
                accepted_actor_id,
                offers_by_id,
                f"/events/{idx}",
                tracker,
            )

        elif ev_type == "work.paused":
            choice_kind = payload["kind"]  # "pause" or "rest"
            _check_participant_choice(
                ev_actor,
                choice_kind,
                accepted_actor_id,
                offers_by_id,
                f"/events/{idx}",
                tracker,
            )

        elif ev_type == "work.cancelled":
            cancelled_at_idx = idx if cancelled_at_idx is None else cancelled_at_idx
            _check_participant_choice(
                ev_actor,
                "cancel",
                accepted_actor_id,
                offers_by_id,
                f"/events/{idx}",
                tracker,
            )

        elif ev_type == "work.handed_off":
            for aidx, aid in enumerate(payload["to_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/to_actor_ids/{aidx}", "Handoff recipient actor_id is not declared.")
            for pidx, pid in enumerate(payload["plan_event_ids"]):
                if pid not in plans_by_event_id:
                    tracker.fail("R.REFERENCES", "unknown_plan_reference", f"{p_base}/plan_event_ids/{pidx}", "Handoff plan_event_id must reference an earlier plan.proposed event.")
            for cidx, cref in enumerate(payload["authority_claims"]):
                centry = authority_claims_by_id.get(cref["event_id"])
                if centry is None:
                    tracker.fail("R.REFERENCES", "unknown_authority_reference", f"{p_base}/authority_claims/{cidx}/event_id", "Handoff authority claim must reference an earlier authority.claimed event.")
                elif cref["digest"] != centry[2]:
                    tracker.fail("R.DIGESTS", "authority_claim_digest_mismatch", f"{p_base}/authority_claims/{cidx}/digest", "Handoff authority claim digest does not match computed claim_digest.")
            for eidx, eproj in enumerate(payload["evidence"]):
                verify_ev_proj(eproj, f"{p_base}/evidence/{eidx}")
            for zidx, zproj in enumerate(payload["data_zones"]):
                verify_zone_proj(zproj, f"{p_base}/data_zones/{zidx}")
            _check_participant_choice(
                ev_actor,
                "handoff",
                accepted_actor_id,
                offers_by_id,
                f"/events/{idx}",
                tracker,
            )

        elif ev_type == "plan.proposed":
            sup_id = payload.get("supersedes_plan_event_id")
            if sup_id is not None:
                sup_entry = plans_by_event_id.get(sup_id)
                if sup_entry is None or sup_entry[0] >= idx:
                    tracker.fail("R.REFERENCES", "unknown_plan_reference", f"{p_base}/supersedes_plan_event_id", "supersedes_plan_event_id must reference an earlier plan.proposed event.")

        elif ev_type == "authority.claimed":
            binding = payload["binding"]
            b_path = f"{p_base}/binding"
            if binding["run_id"] != doc["run_id"]:
                tracker.fail("R.REFERENCES", "authority_run_id_mismatch", f"{b_path}/run_id", "Authority binding run_id must match the containing run_id.")
            if binding["claim_event_id"] != ev_id:
                tracker.fail("R.REFERENCES", "authority_event_id_mismatch", f"{b_path}/claim_event_id", "Authority binding claim_event_id must match event id.")
            if binding["claimant_actor_id"] not in actors_by_id:
                tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/claimant_actor_id", "Authority claimant_actor_id is not declared.")
            if binding["executor_actor_id"] not in actors_by_id:
                tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/executor_actor_id", "Authority executor_actor_id is not declared.")
            elif binding["executor_actor_id"] in pair_actor_ids:
                tracker.fail("R.AUTHORITY", "pair_execution_unsupported", f"{b_path}/executor_actor_id", "A composite human_agent_pair cannot act as an execution principal.")

            seen_zone_ids: set[str] = set()
            for zidx, zproj in enumerate(binding["data_zones"]):
                if zproj["id"] in seen_zone_ids:
                    tracker.fail("R.AUTHORITY", "duplicate_authority_data_zone", f"{b_path}/data_zones/{zidx}/id", "Duplicate data zone projection in authority claim.")
                seen_zone_ids.add(zproj["id"])
                verify_zone_proj(zproj, f"{b_path}/data_zones/{zidx}")

            valid_from_ts = parse_utc_timestamp(binding["valid_from"])
            claim_exp_ts = parse_utc_timestamp(binding["expires_at"])
            assert valid_from_ts is not None and claim_exp_ts is not None
            if claim_exp_ts < valid_from_ts:
                tracker.fail("R.AUTHORITY", "authority_validity_inverted", f"{b_path}/expires_at", "Authority expires_at must not precede valid_from.")

            seen_basis_kinds: set[str] = set()
            for bidx, basis in enumerate(binding["bases"]):
                bkind = basis["kind"]
                if bkind in seen_basis_kinds:
                    tracker.fail("R.AUTHORITY", "duplicate_authority_basis", f"{b_path}/bases/{bidx}/kind", "Each of the five authority bases must appear exactly once.")
                seen_basis_kinds.add(bkind)
                for sidx, sid in enumerate(basis["subject_actor_ids"]):
                    if sid not in actors_by_id:
                        tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/bases/{bidx}/subject_actor_ids/{sidx}", "Basis subject_actor_id is not declared.")
                for eidx, eproj in enumerate(basis["evidence"]):
                    verify_ev_proj(eproj, f"{b_path}/bases/{bidx}/evidence/{eidx}")
                    ev_obs_ts = parse_utc_timestamp(eproj["observed_at"])
                    if ev_obs_ts is not None and ev_obs_ts > ev_ts:
                        tracker.fail(
                            "R.AUTHORITY",
                            "authority_evidence_after_claim",
                            f"{b_path}/bases/{bidx}/evidence/{eidx}/observed_at",
                            "Authority evidence was observed after the authority claim that relies on it.",
                        )

                # Consent-specific rules apply to every evidence record in a passing affected_party_consent basis
                if bkind == "affected_party_consent" and basis["outcome"] == "pass":
                    subjects = set(basis["subject_actor_ids"])
                    if not subjects:
                        tracker.fail(
                            "R.AUTHORITY",
                            "consent_evidence_scope_mismatch",
                            f"{b_path}/bases/{bidx}/subject_actor_ids",
                            "A passing affected_party_consent basis cannot use an empty subject list.",
                        )
                    for eidx, eproj in enumerate(basis["evidence"]):
                        if eproj["kind"] != "consent_record":
                            tracker.fail(
                                "R.AUTHORITY",
                                "consent_evidence_kind_mismatch",
                                f"{b_path}/bases/{bidx}/evidence/{eidx}/kind",
                                "Passing affected_party_consent must use consent_record evidence.",
                            )
                        ev_subjects = eproj.get("consent_subject_actor_ids")
                        ascope = eproj.get("action_scope")
                        if (
                            ev_subjects is None
                            or set(ev_subjects) != subjects
                            or ascope is None
                            or ascope["run_id"] != binding["run_id"]
                            or ascope["purpose"] != binding["purpose"]
                            or ascope["operation"] not in binding["operations"]
                            or ascope["target"] not in binding["resources"]
                            or not set(ascope["data_zone_ids"]).issubset(seen_zone_ids)
                            or not set(ascope["expected_effect"]["affected_actor_ids"]).issubset(subjects)
                        ):
                            tracker.fail(
                                "R.AUTHORITY",
                                "consent_evidence_scope_mismatch",
                                f"{b_path}/bases/{bidx}/evidence/{eidx}",
                                "Consent evidence must carry matching consent_subject_actor_ids and bound action_scope.",
                            )

            if seen_basis_kinds != set(REQUIRED_AUTHORITY_BASES):
                tracker.fail("R.AUTHORITY", "missing_authority_basis", f"{b_path}/bases", "Authority claim must include all five distinct authority bases.")

            computed_claim_digest = compute_authority_claim_digest(binding)
            if payload["claim_digest"] != computed_claim_digest:
                tracker.fail(
                    "R.DIGESTS",
                    "authority_claim_digest_mismatch",
                    f"{p_base}/claim_digest",
                    "claim_digest does not match RFC 8785 JCS SHA-256 digest of binding.",
                )
            authority_claims_by_id[ev_id] = (idx, ev, computed_claim_digest)

        elif ev_type == "authority.withdrawn":
            cid = payload["authority_claim_event_id"]
            centry = authority_claims_by_id.get(cid)
            if centry is None:
                tracker.fail("R.REFERENCES", "unknown_authority_reference", f"{p_base}/authority_claim_event_id", "authority_claim_event_id must reference an earlier authority.claimed event.")
            else:
                if payload["claim_digest"] != centry[2]:
                    tracker.fail("R.DIGESTS", "authority_claim_digest_mismatch", f"{p_base}/claim_digest", "Withdrawn claim_digest does not match authority claim digest.")
                withdrawn_claim_ids.setdefault(cid, idx)

        elif ev_type == "action.proposed":
            binding = payload["binding"]
            b_path = f"{p_base}/binding"
            if binding["run_id"] != doc["run_id"]:
                tracker.fail("R.REFERENCES", "proposal_run_id_mismatch", f"{b_path}/run_id", "Proposal binding run_id must match the containing run_id.")
            if binding["proposal_event_id"] != ev_id:
                tracker.fail("R.REFERENCES", "proposal_event_id_mismatch", f"{b_path}/proposal_event_id", "Proposal binding proposal_event_id must match event id.")

            plan_entry = plans_by_event_id.get(binding["plan_event_id"])
            if plan_entry is None:
                tracker.fail("R.REFERENCES", "unknown_plan_reference", f"{b_path}/plan_event_id", "Proposal plan_event_id must reference an earlier plan.proposed event.")
            elif binding["plan_step_id"] not in plan_entry[2]:
                tracker.fail("R.REFERENCES", "unknown_plan_step_reference", f"{b_path}/plan_step_id", "Proposal plan_step_id is not declared in the referenced plan.")

            if binding["executor_actor_id"] not in actors_by_id:
                tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/executor_actor_id", "Proposal executor_actor_id is not declared.")
            elif binding["executor_actor_id"] in pair_actor_ids:
                tracker.fail("R.AUTHORITY", "pair_execution_unsupported", f"{b_path}/executor_actor_id", "A composite human_agent_pair cannot act as an execution principal.")

            for ridx, rid in enumerate(binding["recipient_actor_ids"]):
                if rid not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/recipient_actor_ids/{ridx}", "Proposal recipient_actor_id is not declared.")
            for aidx, aid in enumerate(binding["expected_effect"]["affected_actor_ids"]):
                if aid not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/expected_effect/affected_actor_ids/{aidx}", "Expected effect affected_actor_id is not declared.")

            prop_zones_by_id: dict[str, dict[str, Any]] = {}
            for zidx, zproj in enumerate(binding["data_zones"]):
                if zproj["id"] in prop_zones_by_id:
                    tracker.fail("R.STATE", "duplicate_proposal_data_zone", f"{b_path}/data_zones/{zidx}/id", "Duplicate data zone projection in action proposal.")
                prop_zones_by_id[zproj["id"]] = zproj
                verify_zone_proj(zproj, f"{b_path}/data_zones/{zidx}")

            seen_input_names: set[str] = set()
            for iidx, inp in enumerate(binding["inputs"]):
                iname = inp["name"]
                if iname in seen_input_names:
                    tracker.fail("R.STATE", "duplicate_input_name", f"{b_path}/inputs/{iidx}/name", "Action input names must be unique within a proposal.")
                seen_input_names.add(iname)

                izone_id = inp["data_zone_id"]
                izone = prop_zones_by_id.get(izone_id)
                if izone is None:
                    tracker.fail("R.REFERENCES", "unknown_input_data_zone", f"{b_path}/inputs/{iidx}/data_zone_id", "Action input data_zone_id must appear in proposal data_zones.")
                else:
                    if inp["kind"] == "literal" and izone["classification"] in ("confidential", "restricted"):
                        tracker.fail(
                            "R.STATE",
                            "literal_protected_data",
                            f"{b_path}/inputs/{iidx}",
                            "Confidential or restricted data cannot be carried as a literal action input.",
                        )
                    if izone["audience"]["mode"] == "actors":
                        allowed_recipients = set(izone["audience"]["actor_ids"])
                        for ridx, rid in enumerate(binding["recipient_actor_ids"]):
                            if rid not in allowed_recipients:
                                tracker.fail(
                                    "R.STATE",
                                    "recipient_out_of_data_zone_audience",
                                    f"{b_path}/recipient_actor_ids/{ridx}",
                                    "Action recipient is outside an input data zone's declared audience.",
                                )

                if inp["kind"] == "literal":
                    if looks_like_credential_literal(iname, inp["value"]):
                        tracker.fail(
                            "R.STATE",
                            "credential_literal_forbidden",
                            f"{b_path}/inputs/{iidx}",
                            "Literal action input resembles credential material; use credential_ref.",
                        )
                elif inp["kind"] == "credential_ref":
                    if looks_like_secret_locator(inp["ref"]):
                        tracker.fail(
                            "R.STATE",
                            "credential_ref_secret_forbidden",
                            f"{b_path}/inputs/{iidx}/ref",
                            "Credential reference locator must be an opaque broker identifier without secret material, userinfo, query, or fragment.",
                        )

            lic = binding["license"]
            if lic["state"] == "reviewed":
                if lic["reviewed_by_actor_id"] not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/license/reviewed_by_actor_id", "License reviewed_by_actor_id is not declared.")
                for eidx, eproj in enumerate(lic["review_evidence"]):
                    verify_ev_proj(eproj, f"{b_path}/license/review_evidence/{eidx}")

            for cidx, cref in enumerate(binding["authority_claims"]):
                centry = authority_claims_by_id.get(cref["event_id"])
                if centry is None:
                    tracker.fail("R.REFERENCES", "unknown_authority_reference", f"{p_base}/binding/authority_claims/{cidx}/event_id", "Proposal authority claim must reference an earlier authority.claimed event.")
                else:
                    _, claim_ev, claim_digest = centry
                    if cref["digest"] != claim_digest:
                        tracker.fail("R.DIGESTS", "authority_claim_digest_mismatch", f"{b_path}/authority_claims/{cidx}/digest", "Proposal authority claim digest does not match claim_digest.")
                    claim_bases = {
                        b["kind"]: b for b in claim_ev["payload"]["binding"]["bases"]
                    }
                    for bkind, selected_ids in cref["selected_evidence_ids_by_basis"].items():
                        basis_obj = claim_bases.get(bkind)
                        basis_ev_ids = (
                            {e["id"] for e in basis_obj["evidence"]}
                            if basis_obj is not None
                            else set()
                        )
                        for sidx, sel_id in enumerate(selected_ids):
                            if sel_id not in basis_ev_ids:
                                tracker.fail(
                                    "R.REFERENCES",
                                    "authority_selected_evidence_not_in_basis",
                                    f"{b_path}/authority_claims/{cidx}/selected_evidence_ids_by_basis/{bkind}/{sidx}",
                                    "Selected evidence ID does not appear in the named basis of the referenced authority claim.",
                                )

            seen_req_nonces: set[str] = set()
            seen_req_actors: set[str] = set()
            for aidx, req_app in enumerate(binding["required_approvals"]):
                app_actor = req_app["actor_id"]
                if app_actor not in actors_by_id:
                    tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{b_path}/required_approvals/{aidx}/actor_id", "Required approver actor_id is not declared.")
                elif app_actor in pair_actor_ids:
                    tracker.fail("R.APPROVALS", "pair_approval_unsupported", f"{b_path}/required_approvals/{aidx}/actor_id", "A composite human_agent_pair cannot act as an approval principal.")
                if req_app["nonce"] in seen_req_nonces:
                    tracker.fail("R.APPROVALS", "duplicate_approval_nonce", f"{b_path}/required_approvals/{aidx}/nonce", "Required approval nonces must be unique.")
                seen_req_nonces.add(req_app["nonce"])
                if app_actor in seen_req_actors:
                    tracker.fail("R.APPROVALS", "duplicate_required_approver", f"{b_path}/required_approvals/{aidx}/actor_id", "Duplicate required approver actor in proposal.")
                seen_req_actors.add(app_actor)

            computed_prop_digest = compute_action_proposal_digest(binding)
            if payload["proposal_digest"] != computed_prop_digest:
                tracker.fail(
                    "R.DIGESTS",
                    "proposal_digest_mismatch",
                    f"{p_base}/proposal_digest",
                    "proposal_digest does not match RFC 8785 JCS SHA-256 digest of binding.",
                )
            proposals_by_id[ev_id] = (idx, ev, computed_prop_digest)

        elif ev_type == "action.rejected":
            pid = payload["proposal_event_id"]
            pentry = proposals_by_id.get(pid)
            if payload["rejected_by_actor_id"] not in actors_by_id:
                tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/rejected_by_actor_id", "rejected_by_actor_id is not declared.")
            elif payload["rejected_by_actor_id"] != ev_actor:
                tracker.fail("R.PROBLEMS", "rejector_actor_mismatch", f"{p_base}/rejected_by_actor_id", "rejected_by_actor_id must match event actor_id.")
            if pentry is None:
                tracker.fail("R.REFERENCES", "unknown_proposal_reference", f"{p_base}/proposal_event_id", "proposal_event_id must reference an earlier action.proposed event.")
            elif payload["proposal_digest"] != pentry[2]:
                tracker.fail("R.DIGESTS", "proposal_digest_mismatch", f"{p_base}/proposal_digest", "Rejection proposal_digest does not match proposal digest.")
            rejected_proposals.setdefault(pid, []).append(idx)
            _check_problem_semantics(payload["problem"], f"{p_base}/problem", tracker)

        elif ev_type == "work.failed":
            _check_problem_semantics(payload["problem"], f"{p_base}/problem", tracker)

        elif ev_type == "execution.approved":
            pid = payload["proposal_event_id"]
            pentry = proposals_by_id.get(pid)
            approver = payload["approver_actor_id"]
            if approver not in actors_by_id:
                tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/approver_actor_id", "approver_actor_id is not declared.")
            if approver in pair_actor_ids or ev_actor in pair_actor_ids:
                tracker.fail("R.APPROVALS", "pair_approval_unsupported", f"{p_base}/approver_actor_id", "A composite human_agent_pair cannot act as an approval principal.")
            if approver != ev_actor:
                tracker.fail("R.APPROVALS", "approval_mismatch", f"{p_base}/approver_actor_id", "approver_actor_id must match event actor_id.")

            if pentry is None:
                tracker.fail("R.REFERENCES", "unknown_proposal_reference", f"{p_base}/proposal_event_id", "proposal_event_id must reference an earlier action.proposed event.")
            else:
                _, prop_ev, prop_digest = pentry
                if payload["proposal_digest"] != prop_digest:
                    tracker.fail("R.DIGESTS", "proposal_digest_mismatch", f"{p_base}/proposal_digest", "Approval proposal_digest does not match proposal digest.")
                req_list = prop_ev["payload"]["binding"]["required_approvals"]
                matched_req = next(
                    (
                        r
                        for r in req_list
                        if r["actor_id"] == approver and r["nonce"] == payload["nonce"]
                    ),
                    None,
                )
                if matched_req is None:
                    tracker.fail("R.APPROVALS", "approval_mismatch", p_base, "Approval actor and nonce do not match any required_approvals entry on the proposal.")
                else:
                    req_exp_ts = parse_utc_timestamp(matched_req["expires_at"])
                    if req_exp_ts is not None and ev_ts > req_exp_ts:
                        tracker.fail("R.APPROVALS", "approval_expired", f"/events/{idx}/at", "Approval occurred after the required approval expiry.")
                    prior_apps = approvals_by_proposal.get(pid, [])
                    if any(a["payload"]["nonce"] == payload["nonce"] for _, a in prior_apps):
                        tracker.fail("R.APPROVALS", "approval_nonce_reused", f"{p_base}/nonce", "Approval nonce was already consumed.")
                approvals_by_proposal.setdefault(pid, []).append((idx, ev))
            approvals_by_id[ev_id] = (idx, ev)

        elif ev_type == "execution.started":
            pid = payload["proposal_event_id"]
            pentry = proposals_by_id.get(pid)
            exec_actor = payload["executor_actor_id"]
            if exec_actor not in actors_by_id:
                tracker.fail("R.REFERENCES", "unknown_actor_reference", f"{p_base}/executor_actor_id", "executor_actor_id is not declared.")
            if exec_actor in pair_actor_ids or ev_actor in pair_actor_ids:
                tracker.fail("R.AUTHORITY", "pair_execution_unsupported", f"{p_base}/executor_actor_id", "A composite human_agent_pair cannot act as an execution principal.")
            if exec_actor != ev_actor:
                tracker.fail("R.EXECUTION", "executor_actor_mismatch", f"{p_base}/executor_actor_id", "executor_actor_id must match event actor_id.")
            if payload["execution_id"] in used_execution_uris:
                tracker.fail("R.EXECUTION", "duplicate_execution_id", f"{p_base}/execution_id", "execution_id must be unique within the run.")
            used_execution_uris.add(payload["execution_id"])

            if accepted_actor_id is None:
                tracker.fail("R.EXECUTION", "execution_before_acceptance", f"/events/{idx}/type", "Execution cannot start before work.accepted.")
            if cancelled_at_idx is not None and cancelled_at_idx < idx:
                tracker.fail("R.EXECUTION", "execution_after_cancellation", f"/events/{idx}/type", "Execution cannot start after work.cancelled.")
            if ev_ts > expires_ts:
                tracker.fail("R.EXECUTION", "execution_after_run_expiry", f"/events/{idx}/at", "Execution cannot start after limits.expires_at.")

            if pentry is None:
                tracker.fail("R.REFERENCES", "unknown_proposal_reference", f"{p_base}/proposal_event_id", "proposal_event_id must reference an earlier action.proposed event.")
            else:
                _, prop_ev, prop_digest = pentry
                prop_binding = prop_ev["payload"]["binding"]
                if payload["proposal_digest"] != prop_digest:
                    tracker.fail("R.DIGESTS", "proposal_digest_mismatch", f"{p_base}/proposal_digest", "Execution proposal_digest does not match proposal digest.")
                if exec_actor != prop_binding["executor_actor_id"]:
                    tracker.fail("R.EXECUTION", "executor_actor_mismatch", f"{p_base}/executor_actor_id", "Execution executor_actor_id does not match proposal executor_actor_id.")
                if executions_by_proposal.get(pid):
                    tracker.fail("R.EXECUTION", "multiple_execution_attempts", f"/events/{idx}/type", "Work 0.1 permits at most one execution start per action proposal.")
                executions_by_proposal.setdefault(pid, []).append((idx, ev))

                _check_execution_approvals_and_authority(
                    idx,
                    ev,
                    ev_ts,
                    prop_ev,
                    prop_digest,
                    approvals_by_id,
                    authority_claims_by_id,
                    withdrawn_claim_ids,
                    tracker,
                )
            executions_by_id[ev_id] = (idx, ev)

        elif ev_type == "execution.receipt":
            xid = payload["execution_event_id"]
            pid = payload["proposal_event_id"]
            xentry = executions_by_id.get(xid)
            pentry = proposals_by_id.get(pid)
            if xentry is None:
                tracker.fail("R.REFERENCES", "unknown_execution_reference", f"{p_base}/execution_event_id", "execution_event_id must reference an earlier execution.started event.")
            if pentry is None:
                tracker.fail("R.REFERENCES", "unknown_proposal_reference", f"{p_base}/proposal_event_id", "proposal_event_id must reference an earlier action.proposed event.")
            elif payload["proposal_digest"] != pentry[2]:
                tracker.fail("R.DIGESTS", "proposal_digest_mismatch", f"{p_base}/proposal_digest", "Receipt proposal_digest does not match proposal digest.")
            if xentry is not None:
                if xentry[1]["payload"]["proposal_event_id"] != pid:
                    tracker.fail("R.EXECUTION", "receipt_proposal_mismatch", f"{p_base}/proposal_event_id", "Receipt proposal_event_id does not match the referenced execution.started event.")
                if receipts_by_execution.get(xid):
                    tracker.fail("R.EXECUTION", "duplicate_execution_receipt", f"/events/{idx}/type", "Multiple execution.receipt events recorded for one execution.")
                receipts_by_execution.setdefault(xid, []).append(idx)
            for eidx, eid in enumerate(payload["provider_receipt_evidence_ids"]):
                ev_obj = evidence_by_id.get(eid)
                if ev_obj is None:
                    tracker.fail("R.REFERENCES", "unknown_evidence_reference", f"{p_base}/provider_receipt_evidence_ids/{eidx}", "Receipt evidence ID is not declared.")
                else:
                    if ev_obj["kind"] != "provider_receipt":
                        tracker.fail(
                            "R.REFERENCES",
                            "evidence_kind_mismatch",
                            f"{p_base}/provider_receipt_evidence_ids/{eidx}",
                            "Provider-receipt evidence must have kind provider_receipt.",
                        )
                    ev_obs_ts = parse_utc_timestamp(ev_obj["observed_at"])
                    if ev_obs_ts is not None and ev_obs_ts > ev_ts:
                        tracker.fail("R.EXECUTION", "receipt_evidence_after_receipt", f"{p_base}/provider_receipt_evidence_ids/{eidx}", "Receipt evidence was observed after the receipt event.")
                    if xentry is not None and ev_obs_ts is not None:
                        start_ts = event_timestamps[xentry[0]]
                        if start_ts is not None and ev_obs_ts < start_ts:
                            tracker.fail(
                                "R.EXECUTION",
                                "provider_receipt_evidence_before_execution",
                                f"{p_base}/provider_receipt_evidence_ids/{eidx}",
                                "Provider-receipt evidence cannot predate its execution start.",
                            )
            receipts_by_id[ev_id] = (idx, ev)
            receipts_by_proposal.setdefault(pid, []).append(idx)

        elif ev_type == "effect.observed":
            xid = payload["execution_event_id"]
            rid = payload["receipt_event_id"]
            pid = payload["proposal_event_id"]
            xentry = executions_by_id.get(xid)
            rentry = receipts_by_id.get(rid)
            pentry = proposals_by_id.get(pid)

            if xentry is None:
                tracker.fail("R.REFERENCES", "unknown_execution_reference", f"{p_base}/execution_event_id", "execution_event_id must reference an earlier execution.started event.")
            if rentry is None:
                tracker.fail("R.REFERENCES", "unknown_receipt_reference", f"{p_base}/receipt_event_id", "receipt_event_id must reference an earlier execution.receipt event.")
            if pentry is None:
                tracker.fail("R.REFERENCES", "unknown_proposal_reference", f"{p_base}/proposal_event_id", "proposal_event_id must reference an earlier action.proposed event.")
            elif payload["proposal_digest"] != pentry[2]:
                tracker.fail("R.DIGESTS", "proposal_digest_mismatch", f"{p_base}/proposal_digest", "Effect observation proposal_digest does not match proposal digest.")

            if xentry is not None and rentry is not None:
                if rentry[1]["payload"]["execution_event_id"] != xid or xentry[1]["payload"]["proposal_event_id"] != pid:
                    tracker.fail("R.EFFECTS", "observation_lineage_mismatch", p_base, "Effect observation execution, receipt, and proposal references do not agree.")

            for eidx, eid in enumerate(payload["evidence_ids"]):
                ev_obj = evidence_by_id.get(eid)
                if ev_obj is None:
                    tracker.fail("R.REFERENCES", "unknown_evidence_reference", f"{p_base}/evidence_ids/{eidx}", "Observation evidence ID is not declared.")
                else:
                    if ev_obj["kind"] != "observation":
                        tracker.fail(
                            "R.REFERENCES",
                            "evidence_kind_mismatch",
                            f"{p_base}/evidence_ids/{eidx}",
                            "Effect-observation evidence must have kind observation.",
                        )
                    ev_obs_ts = parse_utc_timestamp(ev_obj["observed_at"])
                    if ev_obs_ts is not None and ev_obs_ts > ev_ts:
                        tracker.fail("R.EFFECTS", "observation_evidence_after_event", f"{p_base}/evidence_ids/{eidx}", "Observation evidence was recorded after the effect.observed event.")
                    if rentry is not None and ev_obs_ts is not None:
                        receipt_ts_obs = event_timestamps[rentry[0]]
                        if receipt_ts_obs is not None and ev_obs_ts < receipt_ts_obs:
                            tracker.fail(
                                "R.EFFECTS",
                                "effect_evidence_before_receipt",
                                f"{p_base}/evidence_ids/{eidx}",
                                "Effect-observation evidence cannot predate its provider receipt.",
                            )

            causal = payload["causal_claim"]
            for eidx, eid in enumerate(causal["evidence_ids"]):
                if eid not in evidence_by_id:
                    tracker.fail("R.REFERENCES", "unknown_evidence_reference", f"{p_base}/causal_claim/evidence_ids/{eidx}", "Causal claim evidence ID is not declared.")

            if causal["state"] in ("tested", "attested"):
                if not causal["evidence_ids"]:
                    tracker.fail("R.EFFECTS", "causal_evidence_missing", f"{p_base}/causal_claim/evidence_ids", "Tested or attested causal claims must cite at least one evidence record.")
                receipt_ts = event_timestamps[rentry[0]] if rentry is not None else None
                expected_cscope = (
                    {
                        "run_id": doc["run_id"],
                        "proposal_event_id": pid,
                        "proposal_digest": payload["proposal_digest"],
                        "execution_event_id": xid,
                        "receipt_event_id": rid,
                        "target": pentry[1]["payload"]["binding"]["target"],
                        "expected_effect": pentry[1]["payload"]["binding"]["expected_effect"],
                        "observed_outcome": payload["outcome"],
                        "observed_summary": payload["summary"],
                    }
                    if pentry is not None
                    else None
                )
                for eidx, eid in enumerate(causal["evidence_ids"]):
                    ev_obj = evidence_by_id.get(eid)
                    if ev_obj is None:
                        continue
                    if ev_obj["kind"] not in CAUSAL_EVIDENCE_KINDS:
                        tracker.fail(
                            "R.EFFECTS",
                            "causal_evidence_kind_mismatch",
                            f"{p_base}/causal_claim/evidence_ids/{eidx}",
                            "Tested or attested causal claim relies on evidence unrelated to observation, testing, or attestation.",
                        )
                    ev_obs_ts = parse_utc_timestamp(ev_obj["observed_at"])
                    if ev_obs_ts is not None:
                        if receipt_ts is not None and ev_obs_ts <= receipt_ts:
                            tracker.fail(
                                "R.EFFECTS",
                                "causal_evidence_before_receipt",
                                f"{p_base}/causal_claim/evidence_ids/{eidx}",
                                "Tested or attested causal claim relies on evidence not recorded after the provider receipt.",
                            )
                        if ev_obs_ts > ev_ts:
                            tracker.fail(
                                "R.EFFECTS",
                                "causal_evidence_after_observation",
                                f"{p_base}/causal_claim/evidence_ids/{eidx}",
                                "Causal evidence cannot be recorded after the effect observation.",
                            )
                    cscope = ev_obj.get("causal_scope")
                    if expected_cscope is not None and (cscope is None or not json_equal(cscope, expected_cscope)):
                        tracker.fail(
                            "R.EFFECTS",
                            "causal_evidence_scope_mismatch",
                            f"{p_base}/causal_claim/evidence_ids/{eidx}",
                            "Causal evidence causal_scope does not bind the exact proposal, execution, receipt, target, and observed outcome.",
                        )
            observations_by_proposal.setdefault(pid, []).append(idx)

        elif ev_type in ("correction.appended", "appeal.appended"):
            for tidx, tid in enumerate(payload["target_event_ids"]):
                tentry = events_by_id.get(tid)
                if tentry is None or tentry[0] >= idx:
                    tracker.fail(
                        "R.REFERENCES",
                        "invalid_repair_target",
                        f"{p_base}/target_event_ids/{tidx}",
                        "Correction or appeal target_event_ids must reference strictly earlier events.",
                    )
            for eidx, eid in enumerate(payload["evidence_ids"]):
                if eid not in evidence_by_id:
                    tracker.fail("R.REFERENCES", "unknown_evidence_reference", f"{p_base}/evidence_ids/{eidx}", "Repair evidence_id is not declared.")

    # Post-loop cross-event exclusivity for action.rejected (README lines 428-430)
    for pid, rej_indices in rejected_proposals.items():
        conflicting = (
            [i for i, _ in approvals_by_proposal.get(pid, [])]
            + [i for i, _ in executions_by_proposal.get(pid, [])]
            + receipts_by_proposal.get(pid, [])
            + observations_by_proposal.get(pid, [])
        )
        if conflicting:
            for r_idx in rej_indices:
                tracker.fail(
                    "R.PROBLEMS",
                    "rejection_after_execution",
                    f"/events/{r_idx}",
                    "action.rejected cannot coexist with approval, execution, receipt, or observation for the same proposal.",
                )


def _check_execution_approvals_and_authority(
    exec_idx: int,
    exec_ev: dict[str, Any],
    exec_ts: ParsedTimestamp,
    prop_ev: dict[str, Any],
    prop_digest: str,
    approvals_by_id: dict[str, tuple[int, dict[str, Any]]],
    authority_claims_by_id: dict[str, tuple[int, dict[str, Any], str]],
    withdrawn_claim_ids: dict[str, int],
    tracker: _RunCheckTracker,
) -> None:
    payload = exec_ev["payload"]
    p_base = f"/events/{exec_idx}/payload"
    prop_id = prop_ev["id"]
    prop_binding = prop_ev["payload"]["binding"]

    # License gate at execution (README line 444-445)
    if prop_binding["license"]["state"] == "unknown":
        tracker.fail(
            "R.AUTHORITY",
            "unknown_license_at_execution",
            f"{p_base}/proposal_event_id",
            "An action whose applicable license or terms remain unknown cannot start execution.",
        )

    # Approval checks
    satisfied_approvals: set[tuple[str, str]] = set()
    for aidx, app_id in enumerate(payload["approval_event_ids"]):
        app_entry = approvals_by_id.get(app_id)
        if app_entry is None or app_entry[0] >= exec_idx:
            tracker.fail(
                "R.REFERENCES",
                "unknown_approval_reference",
                f"{p_base}/approval_event_ids/{aidx}",
                "approval_event_ids must reference earlier execution.approved events.",
            )
            continue
        app_payload = app_entry[1]["payload"]
        if app_payload["proposal_event_id"] != prop_id or app_payload["proposal_digest"] != prop_digest:
            tracker.fail(
                "R.APPROVALS",
                "approval_mismatch",
                f"{p_base}/approval_event_ids/{aidx}",
                "Referenced approval event does not match executed proposal and digest.",
            )
            continue
        satisfied_approvals.add((app_payload["approver_actor_id"], app_payload["nonce"]))

    for req_app in prop_binding["required_approvals"]:
        if (req_app["actor_id"], req_app["nonce"]) not in satisfied_approvals:
            tracker.fail(
                "R.APPROVALS",
                "approval_required",
                f"{p_base}/approval_event_ids",
                "One or more required exact approvals are missing at execution start.",
            )

    # Authority checks
    prop_claim_refs = {c["event_id"]: c for c in prop_binding["authority_claims"]}
    exec_claim_ids = payload["authority_claim_event_ids"]
    if set(exec_claim_ids) != set(prop_claim_refs.keys()):
        tracker.fail(
            "R.AUTHORITY",
            "authority_claim_set_mismatch",
            f"{p_base}/authority_claim_event_ids",
            "Execution authority_claim_event_ids must match the proposal's authority_claims.",
        )

    expected_ascope = make_proposal_action_scope(prop_binding)
    prop_zone_ids = {z["id"] for z in prop_binding["data_zones"]}
    affected_actors = set(prop_binding["expected_effect"]["affected_actor_ids"])

    for cidx, cid in enumerate(exec_claim_ids):
        centry = authority_claims_by_id.get(cid)
        if centry is None or centry[0] >= exec_idx:
            tracker.fail(
                "R.REFERENCES",
                "unknown_authority_reference",
                f"{p_base}/authority_claim_event_ids/{cidx}",
                "authority_claim_event_ids must reference earlier authority.claimed events.",
            )
            continue

        _, claim_ev, _ = centry
        c_binding = claim_ev["payload"]["binding"]
        c_path = f"{p_base}/authority_claim_event_ids/{cidx}"

        if not c_binding["revocable"]:
            tracker.fail(
                "R.AUTHORITY",
                "non_revocable_authority_at_execution",
                c_path,
                "Execution cannot rely on an authority claim with revocable set to false.",
            )
        w_idx = withdrawn_claim_ids.get(cid)
        if w_idx is not None and w_idx < exec_idx:
            tracker.fail(
                "R.AUTHORITY",
                "authority_withdrawn",
                c_path,
                "Referenced authority claim was withdrawn before execution started.",
            )

        vf_ts = parse_utc_timestamp(c_binding["valid_from"])
        ce_ts = parse_utc_timestamp(c_binding["expires_at"])
        if vf_ts is not None and ce_ts is not None and not (vf_ts <= exec_ts <= ce_ts):
            tracker.fail(
                "R.AUTHORITY",
                "authority_expired",
                c_path,
                "Execution timestamp falls outside the authority claim validity window.",
            )

        if c_binding["executor_actor_id"] != payload["executor_actor_id"]:
            tracker.fail("R.AUTHORITY", "authority_executor_mismatch", c_path, "Authority executor_actor_id does not match execution executor.")
        if c_binding["purpose"] != prop_binding["purpose"]:
            tracker.fail("R.AUTHORITY", "authority_purpose_mismatch", c_path, "Authority purpose does not match proposal purpose.")
        if prop_binding["operation"] not in c_binding["operations"]:
            tracker.fail("R.AUTHORITY", "authority_operation_mismatch", c_path, "Proposal operation is not authorized by the authority claim.")
        if (
            prop_binding["target"] not in c_binding["resources"]
            or prop_binding["expected_effect"]["target"] not in c_binding["resources"]
        ):
            tracker.fail("R.AUTHORITY", "authority_resource_mismatch", c_path, "Proposal or expected-effect target is outside authority claim resources.")

        claim_zone_ids = {z["id"] for z in c_binding["data_zones"]}
        if not prop_zone_ids.issubset(claim_zone_ids):
            tracker.fail("R.AUTHORITY", "authority_data_zone_mismatch", c_path, "Proposal data zones exceed the authority claim data zones.")

        bases_by_kind = {b["kind"]: b for b in c_binding["bases"]}
        passing_kinds = {k for k, b in bases_by_kind.items() if b["outcome"] == "pass"}
        failing_or_unknown = {k for k, b in bases_by_kind.items() if b["outcome"] in ("fail", "unknown")}

        if not passing_kinds:
            tracker.fail(
                "R.AUTHORITY",
                "authority_positive_basis_missing",
                c_path,
                "Execution requires at least one passing positive authority basis.",
            )
        if failing_or_unknown:
            tracker.fail(
                "R.AUTHORITY",
                "authority_basis_unresolved",
                c_path,
                "Execution cannot proceed when an authority basis outcome is fail or unknown.",
            )

        for k in passing_kinds:
            b_obj = bases_by_kind[k]
            if b_obj["evidence_state"] not in ("tested", "attested"):
                tracker.fail(
                    "R.AUTHORITY",
                    "asserted_authority_at_execution",
                    c_path,
                    "Execution cannot rely on a merely asserted or unverified passing authority basis.",
                )

        if affected_actors:
            consent_basis = bases_by_kind["affected_party_consent"]
            if consent_basis["outcome"] == "pass":
                if not affected_actors.issubset(set(consent_basis["subject_actor_ids"])):
                    tracker.fail(
                        "R.AUTHORITY",
                        "consent_evidence_scope_mismatch",
                        c_path,
                        "Affected-party consent subjects do not cover all proposal affected actors.",
                    )
                for ev_proj in consent_basis["evidence"]:
                    if not json_equal(ev_proj.get("action_scope"), expected_ascope):
                        tracker.fail(
                            "R.AUTHORITY",
                            "consent_evidence_scope_mismatch",
                            c_path,
                            "Consent record action_scope does not match the exact proposed action scope.",
                        )

        cref = prop_claim_refs.get(cid)
        if cref is not None:
            selected_map: dict[str, list[str]] = cref["selected_evidence_ids_by_basis"]
            for sel_kind in selected_map:
                if sel_kind not in passing_kinds:
                    tracker.fail(
                        "R.AUTHORITY",
                        "authority_basis_selection_nonpassing",
                        c_path,
                        "Executed proposal selected evidence from a basis whose outcome is not pass.",
                    )
            for pass_kind in REQUIRED_AUTHORITY_BASES:
                if pass_kind in passing_kinds and pass_kind not in selected_map:
                    tracker.fail(
                        "R.AUTHORITY",
                        "authority_basis_selection_missing",
                        c_path,
                        "Executed proposal omitted selected_evidence_ids_by_basis for a passing basis.",
                    )
            for sel_kind, sel_ids in selected_map.items():
                b_obj = bases_by_kind.get(sel_kind)
                if b_obj is None:
                    continue
                ev_by_id_in_basis = {e["id"]: e for e in b_obj["evidence"]}
                for sel_id in sel_ids:
                    ev_proj = ev_by_id_in_basis.get(sel_id)
                    if ev_proj is None:
                        continue
                    if not json_equal(ev_proj.get("action_scope"), expected_ascope):
                        tracker.fail(
                            "R.AUTHORITY",
                            "authority_selected_evidence_scope_mismatch",
                            c_path,
                            "Proposal-selected authority evidence action_scope omits or differs from the six proposal-derived scope fields.",
                        )
                        if sel_kind == "affected_party_consent":
                            tracker.fail(
                                "R.AUTHORITY",
                                "consent_evidence_scope_mismatch",
                                c_path,
                                "Consent record action_scope does not bind the exact proposed action scope.",
                            )


def _check_record_zone_restrictiveness(
    record_zone: dict[str, Any],
    all_zones: list[dict[str, Any]],
    tracker: _RunCheckTracker,
) -> None:
    rec_rank = CLASSIFICATION_RANK[record_zone["classification"]]
    rec_aud = record_zone["audience"]
    rec_ret = record_zone["retention"]

    for idx, zone in enumerate(all_zones):
        if zone["id"] == record_zone["id"]:
            continue
        z_rank = CLASSIFICATION_RANK[zone["classification"]]
        z_aud = zone["audience"]
        z_ret = zone["retention"]

        if zone["classification"] != "public" and rec_rank < z_rank:
            tracker.fail(
                "R.STATE",
                "record_zone_classification_too_broad",
                f"/data_zones/{idx}/classification",
                "Whole-record data zone classification must be at least as restrictive as every declared non-public zone.",
            )

        if z_aud["mode"] == "actors":
            if rec_aud["mode"] == "public":
                tracker.fail(
                    "R.STATE",
                    "record_zone_audience_too_broad",
                    f"/data_zones/{idx}/audience",
                    "Public whole-record audience cannot contain actor-bounded declared zones.",
                )
            elif not set(rec_aud["actor_ids"]).issubset(set(z_aud["actor_ids"])):
                tracker.fail(
                    "R.STATE",
                    "record_zone_audience_too_broad",
                    f"/data_zones/{idx}/audience",
                    "Whole-record actor audience must be a subset of every protected actor-bounded zone.",
                )

        if zone["classification"] != "public":
            if not _retention_at_least_as_restrictive(rec_ret, z_ret):
                tracker.fail(
                    "R.STATE",
                    "record_zone_retention_too_broad",
                    f"/data_zones/{idx}/retention",
                    "Whole-record retention must be at least as restrictive as every non-public declared zone.",
                )


def _retention_at_least_as_restrictive(
    rec_ret: dict[str, Any], prot_ret: dict[str, Any]
) -> bool:
    if rec_ret["mode"] == "ephemeral":
        return True
    if prot_ret["mode"] == "ephemeral":
        return False
    if rec_ret["mode"] == "until" and prot_ret["mode"] == "until":
        rec_until = parse_utc_timestamp(rec_ret["until"])
        prot_until = parse_utc_timestamp(prot_ret["until"])
        return rec_until is not None and prot_until is not None and rec_until <= prot_until
    if rec_ret["mode"] == "external_policy" and prot_ret["mode"] == "external_policy":
        return rec_ret["policy_ref"] == prot_ret["policy_ref"]
    return False


def _check_participant_choice(
    actor_id: str,
    option_name: str,
    accepted_actor_id: str | None,
    offers_by_id: dict[str, tuple[int, dict[str, Any]]],
    path: str,
    tracker: _RunCheckTracker,
) -> None:
    if accepted_actor_id is None:
        if not offers_by_id:
            return
        # Latest offer in segment
        _, latest_offer = max(offers_by_id.values(), key=lambda item: item[0])
        offer_payload = latest_offer["payload"]
        if actor_id not in offer_payload["offered_to_actor_ids"]:
            tracker.fail(
                "R.STATE",
                "unoffered_choice_actor",
                f"{path}/actor_id",
                "Before acceptance, only an offered participant may exercise an exit choice.",
            )
        if option_name not in offer_payload["exit_options"]:
            tracker.fail(
                "R.STATE",
                "choice_not_advertised",
                path,
                "Participant recorded an exit choice that the offer did not advertise.",
            )
    else:
        if actor_id != accepted_actor_id:
            # Allow offering host to cancel before next external effect? Spec line 248-250:
            # "After acceptance, a participant's cancellation, pause, rest, question, or
            # handoff is recorded by the actor that accepted the work"
            if option_name != "cancel":
                tracker.fail(
                    "R.STATE",
                    "unaccepted_participant_choice",
                    f"{path}/actor_id",
                    "After acceptance, participant choices are recorded by the actor that accepted the work.",
                )


def _check_problem_semantics(
    problem: dict[str, Any], path: str, tracker: _RunCheckTracker
) -> None:
    if problem["terminal"]:
        if problem["retryable"] or len(problem["next_actions"]) != 0:
            tracker.fail(
                "R.PROBLEMS",
                "terminal_problem_invalid",
                path,
                "A terminal problem must set retryable to false and offer no next_actions.",
            )
    else:
        if len(problem["next_actions"]) < 1:
            tracker.fail(
                "R.PROBLEMS",
                "recoverable_problem_missing_actions",
                path,
                "A non-terminal problem must offer at least one typed next_action.",
            )


def _has_cycle(deps_map: dict[str, list[str]]) -> bool:
    state: dict[str, int] = {}  # 0=unvisited, 1=visiting, 2=done

    def dfs(node: str) -> bool:
        st = state.get(node, 0)
        if st == 1:
            return True
        if st == 2:
            return False
        state[node] = 1
        for nxt in deps_map.get(node, ()):
            if nxt in deps_map and dfs(nxt):
                return True
        state[node] = 2
        return False

    return any(dfs(n) for n in deps_map)


def _collect_sensitive_sentinels(doc: dict[str, Any] | None) -> set[str]:
    """Collect opaque identifiers and non-public/literal values that must never appear in output."""
    if not isinstance(doc, dict):
        return set()
    sentinels: set[str] = set()
    rid = doc.get("run_id")
    if isinstance(rid, str) and len(rid) >= 8:
        sentinels.add(rid)
    for actor in doc.get("actors", ()) if isinstance(doc.get("actors"), list) else ():
        if isinstance(actor, dict) and isinstance(actor.get("id"), str):
            sentinels.add(actor["id"])
    for ev in doc.get("evidence", ()) if isinstance(doc.get("evidence"), list) else ():
        if isinstance(ev, dict):
            for key in ("id", "ref"):
                if isinstance(ev.get(key), str):
                    sentinels.add(ev[key])
    for event in doc.get("events", ()) if isinstance(doc.get("events"), list) else ():
        if not isinstance(event, dict):
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        binding = payload.get("binding")
        if isinstance(binding, dict):
            if isinstance(binding.get("target"), str):
                sentinels.add(binding["target"])
            for res in binding.get("resources", ()) if isinstance(binding.get("resources"), list) else ():
                if isinstance(res, str):
                    sentinels.add(res)
            for inp in binding.get("inputs", ()) if isinstance(binding.get("inputs"), list) else ():
                if isinstance(inp, dict):
                    for k in ("value", "ref"):
                        v = inp.get(k)
                        if isinstance(v, str) and len(v) >= 6:
                            sentinels.add(v)
    return sentinels


def _finalize_result(
    tracker: _RunCheckTracker,
    artifact_obj: dict[str, Any],
    run_meta: dict[str, Any],
    observed_at: str,
    doc: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # 17. R.PRIVACY self-audit over emitted checks and issues
    if tracker.outcomes["R.JSON"] == "pass":
        tracker.start("R.PRIVACY", "Checker diagnostics omit opaque identifiers and protected input values.")
        sentinels = _collect_sensitive_sentinels(doc)
        leaked = False
        for issue in tracker.issues:
            text_blob = f"{issue['path']} {issue['message']}"
            if any(s in text_blob for s in sentinels) or any(
                rx.search(text_blob) for rx in SECRET_VALUE_PATTERNS
            ):
                leaked = True
                break
        if leaked:
            tracker.fail("R.PRIVACY", "checker_output_leak", "/", "Checker diagnostic unexpectedly echoed an input value.")

    checks_list: list[dict[str, str]] = []
    counts = {"pass": 0, "fail": 0, "unknown": 0, "not_run": 0}
    for cid, expected_desc in CHECK_SPECS:
        outcome = tracker.outcomes[cid]
        counts[outcome] += 1
        checks_list.append(
            {
                "id": cid,
                "outcome": outcome,
                "expected": expected_desc,
                "observed": tracker.observed[cid],
            }
        )

    if counts["fail"] > 0:
        overall = "nonconformant"
    elif counts["unknown"] > 0 or counts["not_run"] > 0:
        overall = "indeterminate"
    else:
        overall = "conformant"

    return {
        "$schema": RESULT_SCHEMA_ID,
        "schema_version": RESULT_SCHEMA_VERSION,
        "profile": PROFILE,
        "artifact": artifact_obj,
        "verifier": {
            "name": VERIFIER_NAME,
            "version": VERIFIER_VERSION,
            "implementation": IMPLEMENTATION_ID,
        },
        "observed_at": observed_at,
        "result": overall,
        "scope": SCOPE_TEXT,
        "output_handling": OUTPUT_HANDLING_TEXT,
        "limits": {
            "max_input_bytes": MAX_INPUT_BYTES,
            "max_issues": MAX_ISSUES,
        },
        "counts": counts,
        "checks": checks_list,
        "issues": tracker.issues,
        "run": run_meta,
        "not_established": list(NOT_ESTABLISHED),
    }


def check_work_file(
    file_path: str | Path,
    *,
    observed_at: str | None = None,
    work_dir: Path | None = None,
) -> dict[str, Any]:
    path = Path(file_path)
    with path.open("rb") as fh:
        chunk = fh.read(MAX_INPUT_BYTES + 1)
    if len(chunk) > MAX_INPUT_BYTES:
        return check_work_bytes(
            chunk[:MAX_INPUT_BYTES],
            complete=False,
            observed_at=observed_at,
            work_dir=work_dir,
        )
    return check_work_bytes(chunk, complete=True, observed_at=observed_at, work_dir=work_dir)


# ---------------------------------------------------------------------------
# Phase 1 Exit-Gate Relationship & Digest Summary Extractor
# ---------------------------------------------------------------------------


def extract_phase1_summary(raw_bytes: bytes, *, observed_at: str | None = None) -> dict[str, Any]:
    """Extract the Phase 1 exit-gate tuple: digests, state labels, authority statuses, receipts, terminal state."""
    result = check_work_bytes(raw_bytes, observed_at=observed_at)
    summary: dict[str, Any] = {
        "implementation": IMPLEMENTATION_ID,
        "result": result["result"],
        "artifact_sha256": result["artifact"].get("sha256"),
        "terminal_state": result["run"].get("terminal_state"),
        "event_state_labels": [],
        "authority_claims": [],
        "action_proposals": [],
        "receipt_relationships": [],
    }
    schema_check = next((c for c in result["checks"] if c["id"] == "R.SCHEMA"), None)
    if schema_check is not None and schema_check["outcome"] == "fail":
        return summary
    try:
        doc = parse_strict_json(raw_bytes.decode("utf-8"))
    except Exception:
        return summary
    if not isinstance(doc, dict) or not isinstance(doc.get("events"), list):
        return summary

    withdrawn_ids = {
        ev["payload"]["authority_claim_event_id"]
        for ev in doc["events"]
        if isinstance(ev, dict)
        and ev.get("type") == "authority.withdrawn"
        and isinstance(ev.get("payload"), dict)
    }
    summary["event_state_labels"] = [ev["type"] for ev in doc["events"] if isinstance(ev, dict) and "type" in ev]

    for ev in doc["events"]:
        ev_type = ev.get("type")
        payload = ev.get("payload", {})
        if ev_type == "authority.claimed" and "binding" in payload:
            binding = payload["binding"]
            bases = {b["kind"]: {"outcome": b["outcome"], "evidence_state": b["evidence_state"]} for b in binding["bases"]}
            summary["authority_claims"].append(
                {
                    "event_id": ev["id"],
                    "recorded_digest": payload.get("claim_digest"),
                    "computed_digest": compute_authority_claim_digest(binding),
                    "revocable": binding.get("revocable"),
                    "withdrawn": ev["id"] in withdrawn_ids,
                    "bases": bases,
                }
            )
        elif ev_type == "action.proposed" and "binding" in payload:
            binding = payload["binding"]
            summary["action_proposals"].append(
                {
                    "event_id": ev["id"],
                    "recorded_digest": payload.get("proposal_digest"),
                    "computed_digest": compute_action_proposal_digest(binding),
                    "authority_claim_ids": [c["event_id"] for c in binding.get("authority_claims", ())],
                }
            )
        elif ev_type == "execution.receipt":
            summary["receipt_relationships"].append(
                {
                    "receipt_event_id": ev["id"],
                    "execution_event_id": payload.get("execution_event_id"),
                    "proposal_event_id": payload.get("proposal_event_id"),
                    "proposal_digest": payload.get("proposal_digest"),
                    "outcome": payload.get("outcome"),
                }
            )
    return summary


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------


def format_human_result(res: dict[str, Any]) -> str:
    lines = [
        f"XENIA Work 0.1 ({IMPLEMENTATION_ID}): {res['result'].upper()}",
        f"scope: {res['scope']}",
    ]
    if "sha256" in res["artifact"]:
        lines.append(f"artifact: {res['artifact']['sha256']}")
    else:
        lines.append(f"artifact: incomplete ({res['artifact']['observed_bytes']} bytes observed)")
    c = res["counts"]
    lines.append(
        f"checks: {c['pass']} pass, {c['fail']} fail, {c['unknown']} unknown, {c['not_run']} not run"
    )
    if res["run"]["state"] == "available":
        lines.append(f"terminal: {res['run']['terminal_state']}")
    else:
        lines.append("terminal: unavailable")
    lines.append("whole-XENIA conformance: not assessed")
    for issue in res["issues"]:
        lines.append(f"issue [{issue['code']}] {issue['path']}: {issue['message']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="check_work.py",
        description="Clean-room Python 3 verifier for XENIA Work 0.1 development runs.",
    )
    parser.add_argument("run_file", help="Path to a XENIA Work 0.1 JSON run document.")
    parser.add_argument("--json", action="store_true", help="Emit JSON result matching result.schema.json.")
    parser.add_argument("--observed-at", default=None, help="Explicit UTC RFC 3339 timestamp for deterministic runs.")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return 2 if exc.code != 0 else 0

    target = Path(args.run_file)
    if not target.is_file():
        print("Error: supplied run_file does not exist or is not a regular file.", file=sys.stderr)
        return 2

    try:
        result = check_work_file(target, observed_at=args.observed_at)
    except Exception:
        print("Error: internal verifier usage failure.", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(format_human_result(result))

    return 0 if result["result"] == "conformant" else 1


if __name__ == "__main__":
    raise SystemExit(main())
