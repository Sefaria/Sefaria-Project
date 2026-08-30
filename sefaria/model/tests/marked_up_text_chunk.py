from copy import deepcopy
from types import SimpleNamespace

import pytest
from sefaria.system.database import db as mongo_db
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk, process_version_title_change
from sefaria.system.exceptions import DuplicateRecordError, InputError
from sefaria.model.text import Ref
pytestmark = pytest.mark.django_db

MARKED_UP_TEXT_CHUNKS_DATA = [
    {
        "ref": "Rashi on Genesis 1:6:1",
        "versionTitle": "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934",
        "language": "en",
        "spans": [
            {
                "charRange": [319, 337],
                "text": "Genesis Rabbah 4:2",
                "type": "citation",
                "ref": "Bereshit Rabbah 4:2",
            },
            {
                "charRange": [399, 408],
                "text": "Job 26:11",
                "type": "citation",
                "ref": "Job 26:11",
            },
            {
                "charRange": [543, 552],
                "text": "Job 26:11",
                "type": "citation",
                "ref": "Job 26:11",
            }
        ],
    },
    {
        "ref": "Rashi on Genesis 1:1:1",
        "versionTitle": "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934",
        "language": "en",
        "spans": [
            {
                "charRange": [912, 939],
                "text": "Yalkut Shimoni on Torah 187",
                "type": "citation",
                "ref": "Yalkut Shimoni on Torah 187",
            }
        ],
    },
    {
        "ref": "Rashi on Genesis 2:7:1",
        "versionTitle": "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934",
        "language": "en",
        "spans": [
            {
                "charRange": [361, 387],
                "text": "Midrash Tanchuma, Tazria 1",
                "type": "citation",
                "ref": "Midrash Tanchuma, Tazria 1",
            }
        ],
    },
]


def _aggregate_chunks(chunks: list[dict]) -> list[dict]:
    """
    Aggregates MarkedUpTextChunk payloads by their primary key fields.
    If multiple chunks share the same key,
    their 'spans' lists are merged.
    The key fields are dynamically read from the model's pkeys list.
    """
    pkeys = MarkedUpTextChunk.pkeys
    merged: dict[tuple, dict] = {}

    for chunk in chunks:
        key = tuple(chunk[field] for field in pkeys)
        if key not in merged:
            merged[key] = deepcopy(chunk)
        else:
            merged[key]["spans"].extend(deepcopy(chunk["spans"]))

    return list(merged.values())


# ---------------------------------------------------------------------------#
# Fixture: load → yield → cleanup (identical pattern to Topic graph tests)   #
# ---------------------------------------------------------------------------#
@pytest.fixture(scope="module")
def marked_up_chunks():
    """
    Prepare a clean set of MarkedUpTextChunk records in Mongo,
    then yield them for the tests, then delete them afterwards.
    """
    # 1) Start with a clean slate for the PKs we care about
    for c in MARKED_UP_TEXT_CHUNKS_DATA:
        mongo_db.marked_up_text_chunks.delete_many(
            {"ref": c["ref"], "versionTitle": c["versionTitle"], "language": c["language"]}
        )

    # 2) Insert merged (PK-unique) payloads
    objs = []
    payloads = _aggregate_chunks(MARKED_UP_TEXT_CHUNKS_DATA)
    for data in payloads:
        obj = MarkedUpTextChunk(data)
        obj.save()  # validation & normalisation happen inside .save()
        objs.append(obj)

    yield {
        "objects": objs,     # the live objects we saved
        "payloads": payloads # the canonical input they were built from
    }

    # 3) Tear-down – remove every object we created
    for o in objs:
        o.delete()

class TestMarkedUpTextChunk:
    def test_inserted_records_match_input(self, marked_up_chunks):
        objs  = marked_up_chunks["objects"]
        input = { (p["ref"], p["versionTitle"], p["language"]): p for p in marked_up_chunks["payloads"] }

        for obj in objs:
            k = (obj.ref, obj.versionTitle, obj.language)
            p = input[k]

            assert obj.ref == p["ref"]
            assert obj.versionTitle == p["versionTitle"]
            assert obj.language == p["language"]
            # normalisation: .ref and every span['ref'] are .normal()’d
            assert obj.ref == Ref(p["ref"]).normal()
            assert {s["ref"] for s in obj.spans} == {Ref(s["ref"]).normal() for s in p["spans"]}
            # spans preserved (order-agnostic)
            assert len(obj.spans) == len(p["spans"])

    def test_primary_key_uniqueness(self, marked_up_chunks):
        dup_payload = deepcopy(marked_up_chunks["payloads"][0])
        with pytest.raises(DuplicateRecordError):
            MarkedUpTextChunk(dup_payload).save()

    def test_incorrect_text_span(self, marked_up_chunks):
        marked_up_chunk = marked_up_chunks["objects"][0]
        original_spans = deepcopy(marked_up_chunk.spans)
        try:
            for span in marked_up_chunk.spans:
                span["text"] = "incorrect text"
            with pytest.raises(InputError):
                marked_up_chunk.save()
        finally:
            marked_up_chunk.spans = original_spans

    def test_deleted_span_text_mismatch_is_allowed(self, marked_up_chunks):
        marked_up_chunk = marked_up_chunks["objects"][0]
        original_spans = deepcopy(marked_up_chunk.spans)
        try:
            for span in marked_up_chunk.spans:
                span["text"] = "incorrect text"
                span["deleted"] = True
            marked_up_chunk.save()
        finally:
            marked_up_chunk.spans = original_spans
            marked_up_chunk.save()

    def test_empty_spans(self, marked_up_chunks):
        marked_up_chunk = marked_up_chunks["objects"][0]
        marked_up_chunk.spans = []
        with pytest.raises(InputError):
            marked_up_chunk.save()

    def test_validation_failure(self, marked_up_chunks):
        """
        Invalid language → InputError
        """
        invalid_language_payload = deepcopy(marked_up_chunks["payloads"][0])
        invalid_language_payload["language"] = "fr"
        with pytest.raises(InputError):
            MarkedUpTextChunk(invalid_language_payload).save()

    def test_process_version_title_change_updates_mutc_and_linker_output_only_in_scope(self):
        old_title = "Old Shared Version Title"
        new_title = "New Shared Version Title"
        target_ref = "Genesis 1:1"
        other_ref = "Exodus 1:1"
        collections = [
            mongo_db.marked_up_text_chunks,
            mongo_db.linker_output,
        ]
        cleanup_query = {
            "versionTitle": {"$in": [old_title, new_title]},
            "ref": {"$in": [target_ref, other_ref]},
        }
        for collection in collections:
            collection.delete_many(cleanup_query)

        try:
            base_doc = {
                "versionTitle": old_title,
                "spans": [{"charRange": [0, 1], "text": "x", "type": "citation", "ref": "Exodus 1:1"}],
            }
            for collection in collections:
                collection.insert_many([
                    {**base_doc, "ref": target_ref, "language": "en"},
                    {**base_doc, "ref": target_ref, "language": "he"},
                    {**base_doc, "ref": other_ref, "language": "en"},
                ])

            process_version_title_change(
                SimpleNamespace(title="Genesis", language="en"),
                old=old_title,
                new=new_title,
            )

            for collection in collections:
                assert collection.count_documents({
                    "ref": target_ref,
                    "language": "en",
                    "versionTitle": new_title,
                }) == 1
                assert collection.count_documents({
                    "ref": target_ref,
                    "language": "he",
                    "versionTitle": old_title,
                }) == 1
                assert collection.count_documents({
                    "ref": other_ref,
                    "language": "en",
                    "versionTitle": old_title,
                }) == 1
        finally:
            for collection in collections:
                collection.delete_many(cleanup_query)
