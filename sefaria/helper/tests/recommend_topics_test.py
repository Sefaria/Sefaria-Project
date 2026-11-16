from sefaria.helper import topic


class _FakeRef:
    """Minimal stand-in for a Ref: one segment-level ref that resolves."""

    def __init__(self, ref):
        self.ref = ref

    def normal(self):
        return self.ref

    def all_segment_refs(self):
        return [self]


class _FakeRefTopicLink:
    def __init__(self, toTopic):
        self.toTopic = toTopic


class _FakeTopic:
    """A topic that exists."""

    def get_primary_title(self, lang="en"):
        return "Real Topic"

    @staticmethod
    def init(slug):
        # Return None for the orphan slug, the way Topic.init does when no topic document exists.
        return _FakeTopic() if slug == "real-topic" else None


def test_recommend_topics_omits_missing_topic(monkeypatch):
    """A ref-topic link whose topic no longer exists must not crash the response.

    recommend_topics() reads a topic off each ref-topic link and calls get_primary_title() on it.
    When a topic was deleted or renamed without the link being cleaned up, Topic.init returns None
    and the old code called get_primary_title() on None, raising AttributeError and returning
    HTTP 500 from GET /api/recommend/topics. The orphaned link must be omitted instead.
    """
    monkeypatch.setattr(topic, "Ref", _FakeRef)
    monkeypatch.setattr(
        topic,
        "RefTopicLinkSet",
        lambda query: [_FakeRefTopicLink("real-topic"), _FakeRefTopicLink("missing-topic")],
    )
    monkeypatch.setattr(topic, "Topic", _FakeTopic)

    result = topic.recommend_topics(["Genesis 1:1"])

    assert [r["slug"] for r in result] == ["real-topic"]
    assert result[0]["titles"] == {"en": "Real Topic", "he": "Real Topic"}
