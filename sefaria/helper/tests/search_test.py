# encoding=utf-8
import json
import pytest
from sefaria.helper.search import *
from sefaria.helper.search import _author_works_response, _query_matches_entity_title


def test_extract_filter_values():
    filters = ["Genesis 3:1-3", "Tanakh/Torah/Genesis", "Moses"]
    filter_fields = ["linked_refs", "path", "tags"]

    remaining_filters, remaining_filter_fields, extracted_values = extract_filter_values(
        filters,
        filter_fields,
        "linked_refs",
    )

    assert remaining_filters == ["Tanakh/Torah/Genesis", "Moses"]
    assert remaining_filter_fields == ["path", "tags"]
    assert extracted_values == ["Genesis 3:1-3"]


def test_normalize_linked_ref_filters():
    assert normalize_linked_ref_filters(["Genesis 3:1-3"]) == [
        "Genesis 3:1",
        "Genesis 3:2",
        "Genesis 3:3",
    ]


def test_normalize_filters_with_linked_refs():
    filters, filter_fields = normalize_filters(
        ["Genesis 3:1-3", "Tanakh/Torah/Genesis"],
        ["linked_refs", "path"],
    )

    assert filters == [
        "Tanakh/Torah/Genesis",
        "Genesis 3:1",
        "Genesis 3:2",
        "Genesis 3:3",
    ]
    assert filter_fields == ["path", "linked_refs", "linked_refs", "linked_refs"]


def test_query_obj():
    # stam query
    s = get_query_obj("moshe", "text", "exact", False, 0, 0, 10, [], [], [], "sort", ['comp_date', 'order'])
    t = json.loads("""{"_source": false, "from":0,"size":10,"highlight":{"fields":{"exact":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"sort":["comp_date","order"],"query":{"match_phrase":{"exact":{"query":"moshe","slop":0}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # text query sorted by pagerank and non-exact
    s = get_query_obj("moshe", "text", "naive_lemmatizer", False, 10, 0, 10, [], [], [], "score", ['pagesheetrank'], sort_score_missing=0.04)
    t = json.loads("""{"_source": false, "size":10,"from":0,"highlight":{"fields":{"naive_lemmatizer":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"query":{"function_score":{"functions":[{"field_value_factor":{"field":"pagesheetrank","missing":0.04}}],"query":{"match_phrase":{"naive_lemmatizer":{"query":"moshe","slop":10}}}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # text query sorted by pagerank, non-exact and with aggs
    s = get_query_obj("moshe", "text", "naive_lemmatizer", False, 10, 0, 10, [], [], ["path"], "score", ['pagesheetrank'], sort_score_missing=0.04)
    t = json.loads("""{"_source": false, "size":10,"from":0,"highlight":{"fields":{"naive_lemmatizer":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"query":{"function_score":{"functions":[{"field_value_factor":{"field":"pagesheetrank","missing":0.04}}],"query":{"match_phrase":{"naive_lemmatizer":{"query":"moshe","slop":10}}}}},"aggs":{"path":{"terms":{"field":"path","size":10000}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # sheet query sorted by views and with multiple aggs
    s = get_query_obj("moshe", "sheet", "content", False, 10, 0, 10, [], [], ['collections', 'tags'], "sort", ['views'], sort_reverse=True)
    t = json.loads("""{"_source": false, "from": 0, "size":10,"highlight":{"fields":{"content":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"sort":[{"views":{"order":"desc"}}],"aggs":{"collections":{"terms":{"field":"collections","size":10000}},"tags":{"terms":{"field":"tags","size":10000}}},"query":{"match_phrase":{"content":{"query":"moshe","slop":10}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # text query sorted by pagerank and with multiple applied filters
    s = get_query_obj("moshe", "text", "naive_lemmatizer", False, 10, 0, 10, ["Tanakh/Targum/Targum Jonathan", "Mishnah/Seder Zeraim/Mishnah Peah", "Talmud/Bavli/Seder Moed/Pesachim"], ["path", "path", "path"], [], "score", ['pagesheetrank'], sort_score_missing=0.04)
    t = json.loads("""{"_source": false, "from":0,"size":10,"highlight":{"fields":{"naive_lemmatizer":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"query":{"function_score":{"functions":[{"field_value_factor":{"field":"pagesheetrank","missing":0.04}}],"query":{"bool":{"must":[{"match_phrase":{"naive_lemmatizer":{"query":"moshe","slop":10}}}],"filter":[{"bool":{"must":[{"bool":{"should":[{"regexp":{"path":"Tanakh/Targum/Targum\\\\ Jonathan|Tanakh/Targum/Targum\\\\ Jonathan/.*"}},{"regexp":{"path":"Mishnah/Seder\\\\ Zeraim/Mishnah\\\\ Peah|Mishnah/Seder\\\\ Zeraim/Mishnah\\\\ Peah/.*"}},{"regexp":{"path":"Talmud/Bavli/Seder\\\\ Moed/Pesachim|Talmud/Bavli/Seder\\\\ Moed/Pesachim/.*"}}]}}]}}]}}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # sheet query sorted by relevance, with a collections agg and collections/tag filters
    s = get_query_obj("moshe", "sheet", "content", False, 10, 0, 10, ["", "Moses", "Passover"], ["collections", "tags", "tags"], ['collections'], "score", [])
    t = json.loads("""{"_source": false, "size":10,"from":0,"highlight":{"fields":{"content":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"aggs":{"collections":{"terms":{"field":"collections","size":10000}}},"query":{"bool":{"must":[{"match_phrase":{"content":{"query":"moshe","slop":10}}}],"filter":[{"bool":{"must":[{"bool":{"must":[{"term":{"tags":"Moses"}},{"term":{"tags":"Passover"}}]}},{"bool":{"must":[{"term":{"collections":""}}]}}]}}]}}}""")
    assert ordered(t) == ordered(s.to_dict())


def test_text_filter_default_agg_type():
    # Regression test for sc-44603: a text path filter applied from a URL (or via the
    # documented `filter_fields = [None]` "use the default field" contract) must produce a
    # `path` regexp filter, not crash with `Term(**{None: ...})` -> TypeError -> HTTP 500.
    expected = get_query_obj("moshe", "text", "naive_lemmatizer", False, 10, 0, 10,
                             ["Tanakh/Writings/Psalms"], ["path"], [], "score",
                             ['pagesheetrank'], sort_score_missing=0.04)
    # explicit None agg_type (what the search page sends for URL-applied text filters)
    none_agg = get_query_obj("moshe", "text", "naive_lemmatizer", False, 10, 0, 10,
                             ["Tanakh/Writings/Psalms"], [None], [], "score",
                             ['pagesheetrank'], sort_score_missing=0.04)
    # empty filter_fields, which get_filter_obj fills with [None] * len(filters)
    empty_agg = get_query_obj("moshe", "text", "naive_lemmatizer", False, 10, 0, 10,
                              ["Tanakh/Writings/Psalms"], [], [], "score",
                              ['pagesheetrank'], sort_score_missing=0.04)
    assert ordered(none_agg.to_dict()) == ordered(expected.to_dict())
    assert ordered(empty_agg.to_dict()) == ordered(expected.to_dict())


def test_entity_query_obj_relevance_default():
    # relevance (the default): scored order — no sort clause; topic/author queries are
    # wrapped in the numSources popularity function_score.
    s = get_entity_query_obj("moshe", "topic").to_dict()
    assert "sort" not in s
    assert "function_score" in s["query"]
    # books have no numSources, so no function_score even on relevance
    s = get_entity_query_obj("moshe", "book").to_dict()
    assert "sort" not in s
    assert "function_score" not in s["query"]


def test_entity_query_obj_alpha_sort():
    s = get_entity_query_obj("moshe", "topic", sort="alpha").to_dict()
    assert s["sort"] == [
        {"title_en.sort": {"order": "asc", "missing": "_last"}},
        {"_score": {"order": "desc"}},
    ]
    # an explicit sort drops the popularity function_score (score is only a tie-breaker)
    assert "function_score" not in s["query"]


def test_entity_query_obj_year_sorts():
    # books sort by composition date, authors by birth year; missing values always last
    s = get_entity_query_obj("rambam", "book", sort="year_desc").to_dict()
    assert s["sort"][0] == {"compDate": {"order": "desc", "missing": "_last"}}
    s = get_entity_query_obj("rambam", "author", sort="year_asc").to_dict()
    assert s["sort"][0] == {"birthYear": {"order": "asc", "missing": "_last"}}


def test_entity_query_obj_sort_keeps_match_set():
    # sorting reorders the same match set: the text query is identical to relevance's
    # unwrapped bool query (for a type with no popularity wrapper)
    relevance = get_entity_query_obj("moshe", "book").to_dict()
    alpha = get_entity_query_obj("moshe", "book", sort="alpha").to_dict()
    assert ordered(alpha["query"]) == ordered(relevance["query"])


def test_entity_query_obj_category_filter():
    s = get_entity_query_obj("torah", "book", category_paths=["Tanakh/Torah"]).to_dict()
    filters = s["query"]["bool"]["filter"]
    assert filters == [{
        "bool": {
            "should": [{"regexp": {"path": "Tanakh/Torah|Tanakh/Torah/.*"}}],
            "minimum_should_match": 1,
        }
    }]
    # the text query itself is unchanged — the filter clause is non-scoring
    unfiltered = get_entity_query_obj("torah", "book").to_dict()
    assert ordered(s["query"]["bool"]["must"]) == ordered([unfiltered["query"]])


def test_entity_query_obj_category_filter_multiple_paths_or():
    s = get_entity_query_obj("torah", "book", category_paths=["Tanakh", "Halakhah"]).to_dict()
    shoulds = s["query"]["bool"]["filter"][0]["bool"]["should"]
    assert {"regexp": {"path": "Tanakh|Tanakh/.*"}} in shoulds
    assert {"regexp": {"path": "Halakhah|Halakhah/.*"}} in shoulds


def test_entity_query_obj_category_filter_composes_with_sort():
    s = get_entity_query_obj("torah", "book", sort="year_asc", category_paths=["Tanakh"]).to_dict()
    assert s["sort"][0] == {"compDate": {"order": "asc", "missing": "_last"}}
    assert s["query"]["bool"]["filter"][0]["bool"]["should"] == [{"regexp": {"path": "Tanakh|Tanakh/.*"}}]


def test_entity_query_obj_category_filter_books_only():
    for entity_type in ("topic", "author"):
        with pytest.raises(ValueError):
            get_entity_query_obj("torah", entity_type, category_paths=["Tanakh"])


def test_entity_query_obj_invalid_sort():
    with pytest.raises(ValueError):
        get_entity_query_obj("moshe", "topic", sort="year_asc")  # topics have no year
    with pytest.raises(ValueError):
        get_entity_query_obj("moshe", "book", sort="alphabetical")  # unknown sort value


def test_author_works_response_row_shape():
    class _DummyAuthor:
        slug = "rambam"

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {
                    "url": "/texts/Halakhah/Mishneh Torah",
                    "title": {"en": "Mishneh Torah", "he": "משנה תורה"},
                    "description": {"en": "desc", "he": "תיאור"},
                    "isCategory": True,
                    "categoryLabel": {"en": "Mishneh Torah", "he": "משנה תורה"},
                    "categories": None,
                    "compDate": 1178,
                },
                {
                    "url": "/Guide_for_the_Perplexed",
                    "title": {"en": "Guide for the Perplexed", "he": "מורה נבוכים"},
                    "description": {"en": "desc", "he": "תיאור"},
                    "isCategory": False,
                    "categoryLabel": {"en": None, "he": None},
                    "categories": ["Jewish Thought", "Rishonim"],
                    "compDate": 1190,
                },
            ]

    # Query matches neither title, so no eponymous work is lifted: category row stays first.
    response = _author_works_response(_DummyAuthor(), "rambam")

    assert response["total"] == 2
    assert response["author_slug"] == "rambam"
    category_row, work_row = response["hits"]
    # A category row is represented by its label; an individual work by its category path.
    assert category_row["isCategory"] and category_row["categoryLabel_en"] == "Mishneh Torah"
    assert category_row["categories"] is None
    assert not work_row["isCategory"] and work_row["categoryLabel_en"] is None
    assert work_row["categories"] == ["Jewish Thought", "Rishonim"]


def test_author_works_response_surfaces_eponymous_work():
    class _DummyAuthor:
        slug = "israel-meir-kagan"

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {"url": "/c", "title": {"en": "Mishnah Berurah", "he": "משנה ברורה"},
                 "description": {"en": "", "he": ""}, "isCategory": True,
                 "categoryLabel": {"en": "Mishnah Berurah", "he": "משנה ברורה"},
                 "categories": None, "compDate": 1900},
                {"url": "/w1", "title": {"en": "Chafetz Chaim on Sifra", "he": ""},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Halakhah"], "compDate": 1873},
                {"url": "/w2", "title": {"en": "Chafetz Chaim", "he": "חפץ חיים"},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Halakhah"], "compDate": 1873},
            ]

    # The eponymous work (exact title match) leads, above the category row and the longer
    # "... on Sifra" title that merely begins with the query.
    response = _author_works_response(_DummyAuthor(), "Chafetz Chaim")
    assert response["hits"][0]["title_en"] == "Chafetz Chaim"
    assert not response["hits"][0]["isCategory"]


def test_entity_query_obj_exact_tier_is_case_insensitive():
    # Regression: the Tier-1 exact-match `term` clauses run against raw (un-normalized)
    # `.keyword` sub-fields, so they must set `case_insensitive` — otherwise a lowercase
    # query like "chafetz chaim" never fires the decisive boost against a stored title
    # "Chafetz Chaim" and the "exact match ranks first" guarantee breaks.
    s = get_entity_query_obj("moshe", "book").to_dict()
    term_clauses = [c["constant_score"]["filter"]["term"]
                    for c in s["query"]["bool"]["should"] if "constant_score" in c]
    assert term_clauses, "expected Tier-1 constant_score term clauses"
    for term in term_clauses:
        (field, spec), = term.items()
        assert spec["case_insensitive"] is True, f"{field} exact-match tier must be case-insensitive"


def test_author_works_response_eponymous_beats_matching_category():
    # Regression: when a category row's title happens to equal the query, it must not sort
    # ahead of the actual eponymous (non-category) work. The eponymous tier explicitly
    # excludes category rows so the real work still leads.
    class _DummyAuthor:
        slug = "israel-meir-kagan"

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {"url": "/cat", "title": {"en": "Chafetz Chaim", "he": "חפץ חיים"},
                 "description": {"en": "", "he": ""}, "isCategory": True,
                 "categoryLabel": {"en": "Chafetz Chaim", "he": "חפץ חיים"},
                 "categories": None, "compDate": 1873},
                {"url": "/work", "title": {"en": "Chafetz Chaim", "he": "חפץ חיים"},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Halakhah"], "compDate": 1873},
            ]

    response = _author_works_response(_DummyAuthor(), "Chafetz Chaim")
    assert response["hits"][0]["title_en"] == "Chafetz Chaim"
    assert not response["hits"][0]["isCategory"]
    assert response["hits"][1]["isCategory"]


def test_query_matches_entity_title_exact_only():
    author = {"title_en": "Shalom Buzaglo", "title_he": "שלום בוזגלו", "titleVariants": []}
    # A common given name that is only a *prefix* of the author's name must NOT match —
    # otherwise a "Shalom" book search collapses to this one author's works.
    assert not _query_matches_entity_title("Shalom", author)
    # The full name (or an exact variant) still matches, keeping the author-works trigger.
    assert _query_matches_entity_title("Shalom Buzaglo", author)
    assert _query_matches_entity_title("shalom buzaglo", author)  # case-insensitive
    assert _query_matches_entity_title("Chafetz Chaim",
                                       {"title_en": "Israel Meir Kagan",
                                        "titleVariants": ["Chafetz Chaim"]})


def ordered(obj):
    if isinstance(obj, dict):
        return sorted((str(k), ordered(v)) for k, v in list(obj.items()))
    if isinstance(obj, list):
        return sorted(ordered(x) for x in obj)
    else:
        return obj
