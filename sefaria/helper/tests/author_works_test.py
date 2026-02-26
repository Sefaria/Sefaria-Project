from sefaria.helper import topic
from sefaria.system.exceptions import InputError


class _DummyIndex:
    def __init__(self, title, he_title, categories=None, dependence=None, en_desc=None, he_desc=None, en_short_desc=None, he_short_desc=None):
        self.title = title
        self._he_title = he_title
        self.categories = categories or []
        self.dependence = dependence
        self.enDesc = en_desc
        self.heDesc = he_desc
        self.enShortDesc = en_short_desc
        self.heShortDesc = he_short_desc

    def get_title(self, lang="en"):
        return self._he_title if lang == "he" else self.title


class _DummyAuthorTopic:
    def __init__(self, indexes, aggregations):
        self._indexes = indexes
        self._aggregations = aggregations

    def get_authored_indexes(self):
        return self._indexes

    def get_aggregated_urls_for_authors_indexes(self):
        return self._aggregations


def test_get_author_works_from_topic_serializes_flat_works(monkeypatch):
    class _DummyRef:
        def __init__(self, title):
            self.title = title

        def url(self):
            return self.title.replace(" ", ".")

    monkeypatch.setattr(topic, "Ref", _DummyRef)
    author_topic = _DummyAuthorTopic(
        indexes=[
            _DummyIndex("Book One", "ספר אחד", categories=["Tanakh"], dependence=None, en_desc="Long EN", he_desc="Long HE", en_short_desc="Short EN"),
            _DummyIndex("Book Two", "ספר שתיים", categories=["Halakhah"], dependence="Commentary"),
        ],
        aggregations=[],
    )

    response = topic._get_author_works_from_topic(author_topic, include_descriptions=True)

    assert response["total"] == 2
    assert response["works"][0] == {
        "title": "Book One",
        "heTitle": "ספר אחד",
        "categories": ["Tanakh"],
        "url": "/Book.One",
        "dependence": None,
        "description": {"en": "Short EN", "he": "Long HE"},
    }
    assert response["works"][1]["url"] == "/Book.Two"
    assert response["works"][1]["description"] == {}


def test_get_author_works_from_topic_includes_aggregations_when_requested(monkeypatch):
    class _DummyRef:
        def __init__(self, title):
            self.title = title

        def url(self):
            return self.title

    monkeypatch.setattr(topic, "Ref", _DummyRef)
    aggregations = [{"url": "/Tanakh/Rashi", "title": {"en": "Rashi on Tanakh", "he": "רש\"י"}}]
    author_topic = _DummyAuthorTopic(indexes=[_DummyIndex("Book", "ספר")], aggregations=aggregations)

    response = topic._get_author_works_from_topic(author_topic, include_aggregations=True)

    assert response["aggregations"] == aggregations


def test_get_author_works_from_topic_omits_descriptions_by_default(monkeypatch):
    class _DummyRef:
        def __init__(self, title):
            self.title = title

        def url(self):
            return self.title

    monkeypatch.setattr(topic, "Ref", _DummyRef)
    author_topic = _DummyAuthorTopic(indexes=[_DummyIndex("Book", "ספר", en_desc="desc")], aggregations=[])

    response = topic._get_author_works_from_topic(author_topic)

    assert "description" not in response["works"][0]


def test_serialize_author_work_sets_null_url_on_invalid_ref(monkeypatch):
    class _InvalidRef:
        def __init__(self, _title):
            raise InputError("bad ref")

    monkeypatch.setattr(topic, "Ref", _InvalidRef)

    response = topic._serialize_author_work(_DummyIndex("Bad Book", "ספר רע"))

    assert response["url"] is None
