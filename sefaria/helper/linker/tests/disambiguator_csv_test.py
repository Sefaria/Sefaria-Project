import ast
import csv
import os
import re
from pathlib import Path

import pytest

from sefaria.helper.linker.disambiguator import (
    AmbiguousResolutionPayload,
    NonSegmentResolutionPayload,
    disambiguate_ambiguous_ref,
    disambiguate_non_segment_ref,
)

CSV_PATH = Path(__file__).parent / "disambiguator_test_set.csv"


def _load_test_cases():
    cases = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            case_type = row["case_type"]
            char_range = ast.literal_eval(row["payload_charRange"])

            payload_kwargs = {
                "ref": row["payload_ref"],
                "versionTitle": row["payload_versionTitle"],
                "language": row["payload_language"],
                "charRange": char_range,
                "text": row["payload_text"],
            }

            if case_type == "ambiguous":
                payload_kwargs["ambiguous_refs"] = ast.literal_eval(row["payload_ambiguous_refs"])
            elif case_type == "non_segment":
                payload_kwargs["resolved_non_segment_ref"] = row["payload_resolved_non_segment_ref"]

            matched_segment = row.get("result_matched_segment", "").strip()
            resolved_ref = row.get("result_resolved_ref", "").strip()
            expected = matched_segment if matched_segment else resolved_ref

            sanitized_ref = re.sub(r'[^A-Za-z0-9]+', '_', row['payload_ref']).strip('_')
            case_id = f"row_{i}_{case_type}_{sanitized_ref}"

            cases.append({
                "id": case_id,
                "case_type": case_type,
                "payload": payload_kwargs,
                "expected": expected,
                "check_matched_segment": bool(matched_segment),
            })
    return cases


TEST_CASES = _load_test_cases()


def _missing_api_keys():
    missing = []
    if not os.getenv("ANTHROPIC_API_KEY"):
        missing.append("ANTHROPIC_API_KEY")
    if not os.getenv("OPENAI_API_KEY"):
        missing.append("OPENAI_API_KEY")
    return missing


@pytest.mark.deep
@pytest.mark.parametrize("case", TEST_CASES, ids=[c["id"] for c in TEST_CASES])
def test_disambiguator_from_csv(case):
    missing_keys = _missing_api_keys()
    if missing_keys:
        pytest.skip(f"Missing API keys for integration test: {', '.join(missing_keys)}")

    case_type = case["case_type"]
    expected = case["expected"]

    if case_type == "ambiguous":
        payload = AmbiguousResolutionPayload(**case["payload"])
        result = disambiguate_ambiguous_ref(payload)
    elif case_type == "non_segment":
        payload = NonSegmentResolutionPayload(**case["payload"])
        result = disambiguate_non_segment_ref(payload)
    else:
        pytest.fail(f"Unknown case_type: {case_type}")

    if not expected:
        assert result is None, f"Expected no resolution for case {case['id']}, got {result}"
        return

    assert result is not None, (
        f"Expected '{expected}' for case {case['id']}, got None"
    )

    if case["check_matched_segment"]:
        assert result.matched_segment == expected, (
            f"Unexpected matched segment for case {case['id']}: {result.matched_segment} "
            f"(expected {expected})"
        )
    else:
        assert result.resolved_ref == expected, (
            f"Unexpected resolution for case {case['id']}: {result.resolved_ref} "
            f"(expected {expected})"
        )
