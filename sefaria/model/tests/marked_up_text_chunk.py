from __future__ import annotations
from copy import deepcopy

import pytest
from sefaria.system.database import db as mongo_db
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.system.exceptions import DuplicateRecordError, InputError
from sefaria.model.text import Ref
pytestmark = pytest.mark.django_db

DUMMY_MARKED_UP_TEXT_CHUNKS: list[dict] = [
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
def marked_up_chunks(django_db_setup, django_db_blocker):
    """
    Prepare a clean set of MarkedUpTextChunk records in Mongo,
    then yield them for the tests, then delete them afterwards.
    """
    with django_db_blocker.unblock():
        # 1) Start with a clean slate for the PKs we care about
        for c in DUMMY_MARKED_UP_TEXT_CHUNKS:
            mongo_db.marked_up_text_chunks.delete_many(
                {"ref": c["ref"], "versionTitle": c["versionTitle"], "language": c["language"]}
            )

        # 2) Insert merged (PK-unique) payloads
        objs, payloads = [], _aggregate_chunks(DUMMY_MARKED_UP_TEXT_CHUNKS)
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
        marked_up_chunk = marked_up_chunks["payloads"][0]
        for span in marked_up_chunk["spans"]:
            span["text"] = "incorrect text"
        with pytest.raises(InputError):
            MarkedUpTextChunk(marked_up_chunk).save()

    def test_validation_failure(self):
        """
        Invalid language → InputError
        """
        bad_payload = {
            "ref": "Rashi on Genesis 1:1:1",
            "versionTitle": "Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934",
            "language": "fr",  # not allowed
            "spans": [
                {
                    "charRange": [0, 5],
                    "text": "foo",
                    "type": "citation",
                    "ref": "Genesis 1:1",
                }
            ],
        }
        with pytest.raises(InputError):
            MarkedUpTextChunk(bad_payload).save()
