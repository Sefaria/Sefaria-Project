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
    {
        "id": "shevuot_16_tzafnat_paneach_fwcn_6_8_1",
        "payload": {
            "charRange": [802, 814],
            "language": "he",
            "ref": "Tzafnat Pa'neach on Mishneh Torah, Foreign Worship and Customs of the Nations 6:8:1",
            "resolved_non_segment_ref": "Shevuot 16",
            "text": "דשבועות דט\"ז",
            "versionTitle": "Tzafnat Pa'neach on Mishneh Torah, Warsaw-Piotrków, 1903-1908",
        },
        "expected_resolutions": ["Shevuot 16b:9:5, Shevuot 16b:9:6, Shevuot 16b:9:7"], ## discuss noah - i don't think we can expect it so succeed here
    },
    {
        "id": "makkot_3b_ben_yehoyada_kiddushin_70a_5",
        "payload": {
            "charRange": [727, 734],
            "language": "he",
            "ref": "Ben Yehoyada on Kiddushin 70a:5",
            "resolved_non_segment_ref": "Makkot 3b",
            "text": "מכות ג:",
            "versionTitle": "Senlake edition 2019 based on Ben Yehoyada, Jerusalem, 1897",
        },
        "expected_resolutions": ["Makkot 3b:11", "Makkot 3b:12"] ## discuss noah - both are possible even though Makkot 3b:11 is better
    },
    {
        "id": "berakhot_19b_masoret_hatosefta_2_11_2",
        "payload": {
            "charRange": [70, 85],
            "language": "he",
            "ref": "Masoret HaTosefta on Berakhot 2:11:2",
            "resolved_non_segment_ref": "Berakhot 19b",
            "text": "בבלי כאן י\"ט ב'",
            "versionTitle": "The Tosefta according to to codex Vienna. Third Augmented Edition, JTS 2001",
        },
        "expected_resolutions": ["Berakhot 19b:1", None], ## discuss noah - search fails so none is the least evil
    },
    {
        "id": "jt_berakhot_3_2_masoret_hatosefta_2_11_2",
        "payload": {
            "charRange": [22, 43],
            "language": "he",
            "ref": "Masoret HaTosefta on Berakhot 2:11:2",
            "resolved_non_segment_ref": "Jerusalem Talmud Berakhot 3:2",
            "text": "ירוש' פ\"ג ה\"ב, ו' ע\"ב",
            "versionTitle": "The Tosefta according to to codex Vienna. Third Augmented Edition, JTS 2001",
        },
        "expected_resolutions": ["Jerusalem Talmud Berakhot 3:2:5"],
    },
    {
        "id": "gittin_37_petach_einayim_sheviit_10_1_2",
        "payload": {
            "charRange": [206, 218],
            "language": "he",
            "ref": "Petach Einayim on Mishnah Sheviit 10:1:2",
            "resolved_non_segment_ref": "Gittin 37",
            "text": "גיטין דף ל\"ז",
            "versionTitle": "Petach Einayim, Jerusalem 1959",
        },
        "expected_resolutions": ["Gittin 37a:12"],
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

    if result is None:
        assert None in expected, (
            f"Expected one of {expected} for case {case['id']}, got None"
        )
        return

    assert result.resolved_ref in expected, (
        f"Unexpected resolution for case {case['id']}: {result.resolved_ref} "
        f"(expected one of {expected})"
    )
