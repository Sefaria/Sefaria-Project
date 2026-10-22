from reader import views


def test_topic_page_data_returns_get_topic_result(monkeypatch):
    expected = {"slug": "shabbat", "title": {"en": "Shabbat"}}

    monkeypatch.setattr(
        views.library,
        "get_topic_toc_category_mapping",
        lambda: {},
    )

    def fake_get_topic(v2, **kwargs):
        assert v2 is True
        assert kwargs == {
            "topic": "shabbat",
            "lang": "english",
            "annotate_time_period": True,
            "ref_link_type_filters": ["about", "popular-writing-of"],
        }
        return expected

    monkeypatch.setattr(views, "get_topic", fake_get_topic)

    assert views._topic_page_data("shabbat", "english") == expected


def test_topic_data_uses_kwarg_topic_for_category_lookup(monkeypatch):
    lookup = {}

    class CategoryMapping(dict):
        def get(self, key, default=None):
            lookup["key"] = key
            return "authors" if key == "rashi" else default

    monkeypatch.setattr(
        views.library,
        "get_topic_toc_category_mapping",
        lambda: CategoryMapping(),
    )

    def fake_get_topic(v2, **kwargs):
        return kwargs

    monkeypatch.setattr(views, "get_topic", fake_get_topic)

    response = views._topic_data(topic="rashi", lang="english")

    assert lookup["key"] == "rashi"
    assert response["ref_link_type_filters"] == ["popular-writing-of"]
