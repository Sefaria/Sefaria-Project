import os

import pytest

from sefaria.helper.linker.disambiguator import (
    AmbiguousResolutionPayload,
    disambiguate_ambiguous_ref,
)


TEST_CASES = [
    # {
    #     "id": "example_case",
    #     "payload": {
    #         "ref": "Some Commentary 1:1",
    #         "versionTitle": "Some Version",
    #         "language": "he",
    #         "charRange": [10, 25],
    #         "text": "ציטוט לדוגמה",
    #         "ambiguous_refs": ["Genesis 1:1-3", "Exodus 2:1-2"],
    #     },
    #     "expected_resolutions": ["Genesis 1:1-3"],
    #     "expected_matched_segments": ["Genesis 1:2"],
    # },
    {
        "id": "mishnah_oholot_9_3_ikar_tosafot_yom_tov_5_6_2",
        "payload": {
            "ref": "Ikar Tosafot Yom Tov on Mishnah Oholot 5:6:2",
            "versionTitle": "On Your Way",
            "language": "he",
            "charRange": [139, 154],
            "text": "בפרק ט' משנה ג'",
            "ambiguous_refs": ["Mishnah Oholot 9:3", "Ikar Tosafot Yom Tov on Mishnah Oholot 9:3"],
        },
        "expected_resolutions": ["Mishnah Oholot 9:3"],
    },
    {
        "id": "isaiah_24_4_malbim_beur_hamilot_34_1_2",
        "payload": {
            "ref": "Malbim Beur Hamilot on Isaiah 34:1:2",
            "versionTitle": "On Your Way",
            "language": "he",
            "charRange": [72, 77],
            "text": "כד ד'",
            "ambiguous_refs": ["Isaiah 24:4", "Malbim Beur Hamilot on Isaiah 24:4"],
        },
        "expected_resolutions": ["Malbim Beur Hamilot on Isaiah 24:4"],
    },
]


def _missing_api_keys():
    missing = []
    if not os.getenv("ANTHROPIC_API_KEY"):
        missing.append("ANTHROPIC_API_KEY")
    if not os.getenv("OPENAI_API_KEY"):
        missing.append("OPENAI_API_KEY")
    return missing


@pytest.mark.deep
@pytest.mark.parametrize("case", TEST_CASES, ids=[c["id"] for c in TEST_CASES])
def test_ambiguous_disambiguator_integration(case):
    missing_keys = _missing_api_keys()
    if missing_keys:
        pytest.skip(f"Missing API keys for integration test: {', '.join(missing_keys)}")

    payload = AmbiguousResolutionPayload(**case["payload"])
    expected = case.get("expected_resolutions", [])
    expected_matched = case.get("expected_matched_segments", [])

    result = disambiguate_ambiguous_ref(payload)

    if not expected:
        assert result is None, f"Expected no resolution for case {case['id']}, got {result}"
        return

    if result is None:
        assert None in expected, (
            f"Expected one of {expected} for case {case['id']}, got None"
        )
        return

    assert result.resolved_ref in expected, (
        f"Unexpected resolution for case {case['id']}: {result.resolved_ref} "
        f"(expected one of {expected})"
    )

    if expected_matched:
        assert result.matched_segment in expected_matched, (
            f"Unexpected matched segment for case {case['id']}: {result.matched_segment} "
            f"(expected one of {expected_matched})"
        )
