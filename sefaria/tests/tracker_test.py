"""
Regression coverage for two tracker.modify_text bugs found reviewing the TextChunk/TextRange
migration, both only reachable via a real (non-en/he) language save:

1. modify_text forwarded its real-ISO-code `lang` unchanged into db.history and the search
   IndexQueue, both of which are still permanently keyed on the legacy en/he bucket (not yet
   migrated) -- a real-language row (e.g. language: "yi") was invisible to both.
2. modify_text used its pre-save `vtitle` argument for those same two writes, instead of
   chunk.vtitle (synced post-save) -- Version._normalize()'s auto-suffix rename of a new
   non-en/he version's title (e.g. "Foo" -> "Foo [de]") left both rows pointing at a version
   title that was never actually saved.
"""
from unittest.mock import patch

from sefaria.model import Index, IndexSet, Ref, Version, VersionSet
import sefaria.tracker as tracker
from sefaria.system.database import db


def _make_synthetic_index(title, he_title):
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
                {"lang": "he", "text": he_title, "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Chapter", "Paragraph"],
            "addressTypes": ["Integer", "Integer"],
            "key": title,
        },
    })
    idx.save()
    return idx


@patch("sefaria.settings.SEARCH_INDEX_ON_SAVE", True)
def test_modify_text_real_language_history_and_index_queue_use_legacy_bucket_and_saved_vtitle():
    title = "Tracker Legacy Bucket Test Book"
    idx = _make_synthetic_index(title, "ספר בדיקת מעקב")
    oref = Ref(f"{title} 1:1")
    requested_vtitle = "Foo"  # actualLanguage "de" -- Version._normalize() will suffix this
    try:
        db.history.delete_many({"ref": {"$regex": "^" + title}})
        db.index_queue.delete_many({"ref": {"$regex": "^" + title}})

        chunk = tracker.modify_text(1, oref, requested_vtitle, "de", "erster Text", direction="ltr")

        real_version = Version().load({"title": title, "actualLanguage": "de"})
        assert real_version is not None
        assert real_version.versionTitle == "Foo [de]"
        assert chunk.vtitle == "Foo [de]"

        hist = db.history.find_one({"ref": oref.normal()}, sort=[("date", -1)])
        assert hist is not None
        # db.history is permanently keyed on the legacy en/he bucket -- "en", not the real
        # ISO code "de" (direction is "ltr" here, so the legacy bucket is "en").
        assert hist["language"] == "en"
        assert hist["version"] == "Foo [de]"

        iq = db.index_queue.find_one({"ref": oref.normal()})
        assert iq is not None
        assert iq["lang"] == "en"
        assert iq["version"] == "Foo [de]"
    finally:
        for v in VersionSet({"title": title}):
            v.delete()
        idx.delete()
        db.history.delete_many({"ref": {"$regex": "^" + title}})
        db.index_queue.delete_many({"ref": {"$regex": "^" + title}})
