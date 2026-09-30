# coding=utf-8
from sefaria.model import *
from sefaria.model.text_request_adapter import TextRequestAdapter


def _fresh_synthetic_index(title):
    try:
        Index().load({"title": title}).delete()
    except Exception:
        pass

    idx = Index({
        "title": title,
        "categories": ["Liturgy"],
        "schema": {
            "titles": [
                {"lang": "en", "text": title, "primary": True},
                {"lang": "he", "text": "ספר בדיקת מתאם", "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Chapter", "Verse"],
            "addressTypes": ["Integer", "Integer"],
            "key": title,
        },
    })
    idx.save()
    return idx


def test_append_version_no_false_merge_flag_when_requested_version_is_complete():
    """
    _append_version used to report a 'sources' field whenever a merge was attempted across 2+
    candidate versions in the same language family, even if the requested version alone already
    covered every position -- causing e.g. BookPage.jsx's
    `currentVersion.merged = !!(currentVersion.sources)` to show a false "merged from multiple
    versions" badge on an ordinary single-version read.
    """
    title = "Adapter Sources Test Book"
    idx = _fresh_synthetic_index(title)
    vt_a, vt_b = "Adapter Test A", "Adapter Test B"
    try:
        chunk = Ref(f"{title} 1:1").text(direction="ltr", lang="en", vtitle=vt_a)
        chunk.text = "A verse 1"
        chunk.save()
        chunk = Ref(f"{title} 1:2").text(direction="ltr", lang="en", vtitle=vt_a)
        chunk.text = "A verse 2"
        chunk.save()

        # A second version in the same language family -- present so a merge is attempted,
        # but it contributes nothing that isn't already covered by A.
        Version({"language": "en", "title": title, "versionSource": "http://foobar.com",
                 "versionTitle": vt_b, "chapter": []}).save()

        oref = Ref(f"{title} 1")
        adapter = TextRequestAdapter(oref, [["english", vt_a]], fill_in_missing_segments=True)
        result = adapter.get_versions_for_query()

        version_details = next(v for v in result["versions"] if v["versionTitle"] == vt_a)
        assert "sources" not in version_details
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()


def test_append_version_reports_sources_on_genuine_multi_version_merge():
    """
    Companion to the above -- confirms the fix doesn't overcorrect: a real merge, where the
    requested version is genuinely incomplete and another version fills the gap, must still
    report 'sources'.
    """
    title = "Adapter Sources Test Book 2"
    idx = _fresh_synthetic_index(title)
    vt_a, vt_b = "Adapter Test A", "Adapter Test B"
    try:
        chunk = Ref(f"{title} 1:1").text(direction="ltr", lang="en", vtitle=vt_a)
        chunk.text = "A verse 1"
        chunk.save()

        chunk = Ref(f"{title} 1:2").text(direction="ltr", lang="en", vtitle=vt_b)
        chunk.text = "B verse 2"
        chunk.save()

        oref = Ref(f"{title} 1")
        adapter = TextRequestAdapter(oref, [["english", vt_a]], fill_in_missing_segments=True)
        result = adapter.get_versions_for_query()

        version_details = next(v for v in result["versions"] if v["versionTitle"] == vt_a)
        assert "sources" in version_details
        assert set(version_details["sources"]) == {vt_a, vt_b}
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()
