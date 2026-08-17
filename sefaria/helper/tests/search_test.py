# encoding=utf-8
import json
import pytest
from sefaria.helper.search import *
from sefaria.helper.search import (
    _author_works_response,
    _query_matches_entity_title,
    _category_counts_from_response,
    _ENTITY_CATEGORY_AGG_NAME,
)


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
    # relevance (the default): scored order — no sort clause. Relevance is purely the text
    # match tiers; no document-signal boost wraps the query for any entity type. (The
    # numSources popularity function_score was removed — it was never a specced requirement.)
    for entity_type in ("topic", "author", "book"):
        s = get_entity_query_obj("moshe", entity_type).to_dict()
        assert "sort" not in s
        assert "function_score" not in s["query"]


def test_entity_query_obj_alpha_sort():
    s = get_entity_query_obj("moshe", "topic", sort="alpha").to_dict()
    assert s["sort"] == [
        {"title_en.sort": {"order": "asc", "missing": "_last"}},
        {"_score": {"order": "desc"}},
    ]
    assert "function_score" not in s["query"]


def test_entity_query_obj_year_sorts():
    # Both types sort on a single year derived at index time, never on a raw property:
    # books on `compDate` (Mongo's compDate list collapsed by best_time_period), authors on
    # `sortYear` (death year, falling back to birth year — see _author_sort_year). Sorting
    # authors on a bare `deathYear` would drop every birth-year-only author into the
    # missing-value tail even though their card shows a year. Missing values always last.
    s = get_entity_query_obj("rambam", "book", sort="year_desc").to_dict()
    assert s["sort"][0] == {"compDate": {"order": "desc", "missing": "_last"}}
    s = get_entity_query_obj("rambam", "author", sort="year_asc").to_dict()
    assert s["sort"][0] == {"sortYear": {"order": "asc", "missing": "_last"}}
    assert s["sort"][0] != {"deathYear": {"order": "asc", "missing": "_last"}}


def test_entity_query_obj_sort_keeps_match_set():
    # sorting reorders the same match set: the text query is byte-identical to relevance's.
    # Now that nothing wraps the relevance query, this holds for every entity type.
    for entity_type in ("topic", "author", "book"):
        relevance = get_entity_query_obj("moshe", entity_type).to_dict()
        alpha = get_entity_query_obj("moshe", entity_type, sort="alpha").to_dict()
        assert ordered(alpha["query"]) == ordered(relevance["query"])


def test_entity_query_obj_category_filter():
    # The category filter is a POST filter, not a query filter: Elasticsearch runs it after
    # aggregations, which is what keeps the sidebar's category counts spanning the whole
    # match set instead of only the category the reader just selected.
    s = get_entity_query_obj("torah", "book", category_paths=["Tanakh/Torah"]).to_dict()
    assert s["post_filter"] == {
        "bool": {
            "should": [{"regexp": {"path": "Tanakh/Torah|Tanakh/Torah/.*"}}],
            "minimum_should_match": 1,
        }
    }
    # the text query itself is unchanged — the filter clause is non-scoring
    unfiltered = get_entity_query_obj("torah", "book").to_dict()
    assert ordered(s["query"]) == ordered(unfiltered["query"])


def test_entity_query_obj_category_filter_multiple_paths_or():
    s = get_entity_query_obj("torah", "book", category_paths=["Tanakh", "Halakhah"]).to_dict()
    shoulds = s["post_filter"]["bool"]["should"]
    assert {"regexp": {"path": "Tanakh|Tanakh/.*"}} in shoulds
    assert {"regexp": {"path": "Halakhah|Halakhah/.*"}} in shoulds


def test_entity_query_obj_category_filter_composes_with_sort():
    s = get_entity_query_obj("torah", "book", sort="year_asc", category_paths=["Tanakh"]).to_dict()
    assert s["sort"][0] == {"compDate": {"order": "asc", "missing": "_last"}}
    assert s["post_filter"]["bool"]["should"] == [{"regexp": {"path": "Tanakh|Tanakh/.*"}}]


def test_entity_query_obj_book_always_aggregates_categories():
    # Every book search carries the sidebar's category aggregation, filtered or not — the
    # counts have to be there on the very first response, before anything is selected.
    for paths in (None, ["Tanakh"]):
        s = get_entity_query_obj("torah", "book", category_paths=paths).to_dict()
        assert s["aggs"][_ENTITY_CATEGORY_AGG_NAME]["terms"]["field"] == "path"
        assert s["aggs"][_ENTITY_CATEGORY_AGG_NAME]["terms"]["size"] >= 10000


def test_entity_query_obj_no_category_aggregation_for_topics_and_authors():
    # Only books have a category sidebar; aggregating for the other two would be pure cost.
    for entity_type in ("topic", "author"):
        assert "aggs" not in get_entity_query_obj("moshe", entity_type).to_dict()


def test_entity_query_obj_category_filter_books_only():
    for entity_type in ("topic", "author"):
        with pytest.raises(ValueError):
            get_entity_query_obj("torah", entity_type, category_paths=["Tanakh"])


class _FakeBucket:
    def __init__(self, key, doc_count):
        self.key = key
        self.doc_count = doc_count


class _FakeAgg:
    def __init__(self, buckets, sum_other_doc_count=0):
        self.buckets = buckets
        self.sum_other_doc_count = sum_other_doc_count


class _FakeAggResponse:
    """Stands in for an elasticsearch_dsl response carrying only the category aggregation."""
    def __init__(self, buckets=None, sum_other_doc_count=0):
        if buckets is not None:
            self.aggregations = type("Aggs", (), {
                _ENTITY_CATEGORY_AGG_NAME: _FakeAgg(buckets, sum_other_doc_count)
            })()


def test_category_counts_roll_up_every_ancestor():
    # One bucket per matching book (`path` is unique per book). A book counts toward every
    # category above it, so the sidebar's parent rows total their children.
    response = _FakeAggResponse([
        _FakeBucket("Tanakh/Torah/Genesis", 1),
        _FakeBucket("Tanakh/Torah/Exodus", 1),
        _FakeBucket("Tanakh/Prophets/Isaiah", 1),
        _FakeBucket("Halakhah/Mishneh Torah/Sefer Madda", 1),
    ])
    assert _category_counts_from_response(response) == {
        "Tanakh": 3,
        "Tanakh/Torah": 2,
        "Tanakh/Prophets": 1,
        "Halakhah": 1,
        "Halakhah/Mishneh Torah": 1,
    }


def test_category_counts_exclude_the_book_itself():
    # The last path component is the book's title, not a category: "Genesis" must not become
    # a filterable category, and a book sitting directly under a top-level category
    # contributes to that category only.
    counts = _category_counts_from_response(_FakeAggResponse([_FakeBucket("Talmud/Berakhot", 4)]))
    assert counts == {"Talmud": 4}


def test_category_counts_absent_aggregation():
    # topic/author responses carry no aggregation at all — not an error, just no counts.
    assert _category_counts_from_response(_FakeAggResponse()) == {}


def test_category_counts_survive_truncated_aggregation():
    # If ES ever drops buckets past the size cap the counts read low; they must still be
    # usable numbers rather than an exception (the drop is logged, see the helper).
    response = _FakeAggResponse([_FakeBucket("Tanakh/Torah/Genesis", 1)], sum_other_doc_count=7)
    assert _category_counts_from_response(response) == {"Tanakh": 1, "Tanakh/Torah": 1}


def test_entity_query_obj_invalid_sort():
    with pytest.raises(ValueError):
        get_entity_query_obj("moshe", "topic", sort="year_asc")  # topics have no year
    with pytest.raises(ValueError):
        get_entity_query_obj("moshe", "book", sort="alphabetical")  # unknown sort value


class _DummyAuthorNames:
    """
    Shared half of the `_author_works_response` test doubles: the author's own display names.
    That helper reads them to stamp `author_names` onto individual works, so every dummy needs
    them; each test's subclass supplies only the aggregation rows it cares about.
    """
    name_en = "Rambam"
    name_he = "רמב\"ם"

    def get_primary_title(self, lang='en', with_disambiguation=True):
        return self.name_en if lang == 'en' else self.name_he


def test_author_works_response_row_shape():
    class _DummyAuthor(_DummyAuthorNames):
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


def test_author_works_response_stamps_author_on_individual_works_only():
    # Regression (sc-46638): searching an author's exact name switches the Books tab from the
    # flat book search to this aggregated view, which carried no author field at all — so the
    # one query where the author is certain ("Rashi") was the one that rendered no author on
    # any card. Individual works now carry `authors`/`author_names` in the same shape the flat
    # book index denormalizes, so the card builder reads one field pair on either path.
    class _DummyAuthor(_DummyAuthorNames):
        slug = "rambam"

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {"url": "/texts/Halakhah/Mishneh Torah", "title": {"en": "Mishneh Torah", "he": "משנה תורה"},
                 "description": {"en": "", "he": ""}, "isCategory": True,
                 "categoryLabel": {"en": "Mishneh Torah", "he": "משנה תורה"},
                 "categories": None, "compDate": 1178},
                {"url": "/Guide_for_the_Perplexed", "title": {"en": "Guide for the Perplexed", "he": "מורה נבוכים"},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Jewish Thought"], "compDate": 1190},
            ]

    category_row, work_row = _author_works_response(_DummyAuthor(), "rambam")["hits"]
    # EN before HE: the card builder picks a name per language out of this one flat list.
    assert work_row["author_names"] == ["Rambam", "רמב\"ם"]
    assert work_row["authors"] == ["rambam"]
    # A category row collapses many books into one entry, so an author line there would label
    # the grouping rather than a book. The keys are absent entirely, not empty.
    assert "author_names" not in category_row and "authors" not in category_row


def test_author_works_response_omits_disambiguation_from_author_names():
    # The flat path builds `author_names` via _resolve_author_names, which passes
    # with_disambiguation=False. This path must match, or the same author renders as
    # "Yehuda ben Yakar" on one path and "Yehuda ben Yakar (Rishon)" on the other.
    class _DummyAuthor(_DummyAuthorNames):
        slug = "yehuda-ben-yakar"

        def get_primary_title(self, lang='en', with_disambiguation=True):
            suffix = " (Rishon)" if with_disambiguation else ""
            return ("Yehuda ben Yakar" if lang == 'en' else "יהודה בן יקר") + suffix

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {"url": "/w", "title": {"en": "Perush HaTefillot", "he": ""},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Liturgy"], "compDate": 1200},
            ]

    work_row = _author_works_response(_DummyAuthor(), "yehuda ben yakar")["hits"][0]
    assert work_row["author_names"] == ["Yehuda ben Yakar", "יהודה בן יקר"]


def test_author_works_response_drops_missing_author_name():
    # An author with no Hebrew title must yield a one-name list, not a [name, None] that the
    # card builder would render as an empty Hebrew author line.
    class _DummyAuthor(_DummyAuthorNames):
        slug = "english-only"
        name_he = ""

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {"url": "/w", "title": {"en": "Some Work", "he": ""},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Halakhah"], "compDate": 1900},
            ]

    assert _author_works_response(_DummyAuthor(), "q")["hits"][0]["author_names"] == ["Rambam"]


def test_author_works_response_surfaces_eponymous_work():
    class _DummyAuthor(_DummyAuthorNames):
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


def test_author_works_response_paginates_with_full_total():
    class _DummyAuthor(_DummyAuthorNames):
        slug = "rambam"

        def get_aggregated_urls_for_authors_indexes(self):
            return [
                {"url": f"/w{i}", "title": {"en": f"Work {i:02d}", "he": ""},
                 "description": {"en": "", "he": ""}, "isCategory": False,
                 "categoryLabel": {"en": None, "he": None}, "categories": ["Halakhah"], "compDate": 1000 + i}
                for i in range(5)
            ]

    # A page is a slice of the sorted rows, but `total` always reports the full count so the
    # tab badge and "more to load" check stay correct across pages.
    page = _author_works_response(_DummyAuthor(), "rambam", sort="alpha", start=2, size=2)
    assert page["total"] == 5
    assert [h["title_en"] for h in page["hits"]] == ["Work 02", "Work 03"]

    # start past the end yields an empty page but still the full total.
    tail = _author_works_response(_DummyAuthor(), "rambam", sort="alpha", start=10, size=2)
    assert tail["total"] == 5 and tail["hits"] == []


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


def _entity_should_clauses(query, entity_type):
    s = get_entity_query_obj(query, entity_type).to_dict()
    q = s["query"]
    # topic/author (and filtered book) queries wrap the text query in a bool must
    if "must" in q.get("bool", {}):
        q = q["bool"]["must"][0]
    return q["bool"]["should"]


def test_entity_query_obj_all_words_is_and():
    # A multi-word query must not degrade to OR: the all-words tier requires every word
    # (operator "and"), and cross_fields lets the words split across fields ("Rambam
    # Torah" -> author_names + title_en) as long as all of them match somewhere.
    for entity_type in ("topic", "author", "book"):
        shoulds = _entity_should_clauses("Or Chaim", entity_type)
        all_words = [c["multi_match"] for c in shoulds
                     if "multi_match" in c and c["multi_match"].get("operator") == "and"]
        assert len(all_words) == 1, "expected exactly one AND multi_match tier"
        assert all_words[0]["type"] == "cross_fields"
        # the AND tier must outweigh the any-word tier by a wide margin
        any_word = [c["multi_match"] for c in shoulds
                    if "multi_match" in c and c["multi_match"].get("type") == "best_fields"]
        assert len(any_word) == 1, "expected exactly one any-word (OR) multi_match tier"
        assert all_words[0]["boost"] > any_word[0]["boost"] * 10


def test_entity_query_obj_all_prefix_tier_multi_word_only():
    # "Or Chaim" should rank "Orach Chaim"/"Orchot Chaim" (every word matches a word-start
    # in one title field) above one-word matches like "Chafetz Chaim". The tier is a
    # dis_max of per-title-field bools, each requiring a case-insensitive prefix per word.
    shoulds = _entity_should_clauses("Or Chaim", "book")
    dis_max = [c["dis_max"] for c in shoulds if "dis_max" in c]
    assert len(dis_max) == 1, "expected the all-prefixes dis_max tier for a multi-word query"
    per_field = dis_max[0]["queries"]
    assert len(per_field) == len(["title_en", "title_he", "titleVariants"])
    for field_bool in per_field:
        musts = field_bool["bool"]["must"]
        values = [list(m["prefix"].values())[0]["value"] for m in musts]
        assert values == ["Or", "Chaim"]
        assert all(list(m["prefix"].values())[0]["case_insensitive"] is True for m in musts)

    # single-word query: the tier would just duplicate the phrase_prefix tier, so it's absent
    shoulds = _entity_should_clauses("Chaim", "book")
    assert not any("dis_max" in c for c in shoulds)


def test_entity_query_obj_partial_matches_kept_at_bottom():
    # Product decision (2026-08-11): one-word matches stay findable, but only via the
    # tiny-boost any-word tier — so the match set still includes them while every tier
    # above (exact / phrase / all-words / all-prefixes / begins-with) outscores them.
    shoulds = _entity_should_clauses("Or Chaim", "book")
    boosts = []
    for c in shoulds:
        if "multi_match" in c:
            boosts.append(c["multi_match"]["boost"])
        elif "dis_max" in c:
            boosts.append(c["dis_max"]["boost"])
    any_word_boost = min(boosts)
    assert any_word_boost <= 0.1
    assert all(b >= 1 for b in boosts if b != any_word_boost)


def test_author_works_response_eponymous_beats_matching_category():
    # Regression: when a category row's title happens to equal the query, it must not sort
    # ahead of the actual eponymous (non-category) work. The eponymous tier explicitly
    # excludes category rows so the real work still leads.
    class _DummyAuthor(_DummyAuthorNames):
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
