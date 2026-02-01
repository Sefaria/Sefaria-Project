import os

import pytest

from sefaria.helper.linker.disambiguator import (
    NonSegmentResolutionPayload,
    disambiguate_non_segment_ref,
)


TEST_CASES = [
    {
        "id": "jt_ketubot_2_siftei_kohen_cm_46_12_1",
        "payload": {
            "charRange": [245, 262],
            "language": "he",
            "ref": "Siftei Kohen on Shulchan Arukh, Choshen Mishpat 46:12:1",
            "resolved_non_segment_ref": "Jerusalem Talmud Ketubot 2",
            "text": "בירו' פ\"ב דכתובות",
            "versionTitle": "Shulhan Arukh, Hoshen ha-Mishpat; Lemberg, 1898",
        },
        "expected_resolutions": ["Jerusalem Talmud Ketubot 2:3:2"],
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
def test_non_segment_disambiguator_integration(case):
    missing_keys = _missing_api_keys()
    if missing_keys:
        pytest.skip(f"Missing API keys for integration test: {', '.join(missing_keys)}")

    payload = NonSegmentResolutionPayload(**case["payload"])
    expected = case.get("expected_resolutions", [])

    result = disambiguate_non_segment_ref(payload)

    if not expected:
        assert result is None, f"Expected no resolution for case {case['id']}, got {result}"
        return

    assert result is not None, f"Expected resolution for case {case['id']}, got None"
    assert result.resolved_ref in expected, (
        f"Unexpected resolution for case {case['id']}: {result.resolved_ref} "
        f"(expected one of {expected})"
    )
