from functools import wraps
from elasticsearch_dsl import Q, Search
from elasticsearch_dsl.query import Bool, Regexp, Term
from sefaria.model import Ref
from sefaria.system.exceptions import InputError
from remote_config import remoteConfigCache
from remote_config.keys import (
    SEARCH_ENTITY_FIELD_BOOSTS_TOPIC,
    SEARCH_ENTITY_FIELD_BOOSTS_AUTHOR,
    SEARCH_ENTITY_FIELD_BOOSTS_BOOK,
)
import logging
import re

logger = logging.getLogger(__name__)


def default_list(param):
    if param is None:
        return []
    return param


def default_bool(param):
    if param is None:
        return False
    return param


def default_search(param):
    if param is None:
        return Search()
    return param


def param_fixer(func):

    @wraps(func)
    def wrapper(*args, **kwargs):
        func_params = func.__code__.co_varnames[:func.__code__.co_argcount]
        extra_params = set(kwargs.keys()) - set(func_params)
        for extra in extra_params:
            kwargs.pop(extra)
        args = list(args)
        params_with_defaults = {
            "source_proj": default_bool,
            "filters": default_list,
            "filter_fields": default_list,
            "aggs": default_list,
            "sort_fields": default_list,
            "sort_reverse": default_bool,
            "search_obj": default_search
        }
        for param, setter in list(params_with_defaults.items()):
            i = func_params.index(param)
            if len(args) > i:
                # in args
                args[i] = setter(args[i])
            else:
                # maybe in kwargs
                kwargs[param] = setter(kwargs.get(param, None))
        return func(*args, **kwargs)
    return wrapper


@param_fixer
def get_query_obj(
        query,
        type="text",
        field="exact",
        source_proj=False,
        slop=0,
        start=0,
        size=100,
        filters=None,
        filter_fields=None,
        aggs=None,
        sort_method="sort",
        sort_fields=None,
        sort_reverse=False,
        sort_score_missing=0,
        search_obj=None):
    """

    :param query :str:
    :param type :str: one_of("text", "sheet")
    :param field :str: which field do you want to query? usually either "exact", "naive_lemmatizer" or "content"
    :param source_proj :str or list(str) or bool: if False, don't return _source. o/w only return fields specified
    :param slop :int: max distance allowed b/w words in the query. 0 is an exact match
    :param start :int: pagination start
    :param size :int: page size
    :param filters :list(str): list of filters you've applied
    :param filter_fields :list(str): list of fields each filter is filtering on. must be same size as `filters` usually "path", "collections" or "tags"
    :param aggs :list(str): list of fields to aggregate on. usually "path", "collections" or "tags"
    :param sort_method :str: how to sort. either "sort" or "score"
    :param sort_fields :list(str): which fields to sort on. sorts are applied in order stably
    :param sort_reverse :bool: should the sorting be reversed?
    :param sort_score_missing :float: in the case of `sort_method = "score"` what value to use if `sort_fields` doesn't exist on a doc
    :param search_obj :Search: object to add the query, sorting, filters etc. optional
    :return: Search object with all the stuff ready to execute
    """
    search_obj = search_obj.source(source_proj)
    query = re.sub(r"(\S)\"(\S)", "\\1\u05f4\\2", query)  # Replace internal quotes with gershaim.
    core_query = Q("match_phrase", **{field: {"query": query, "slop": slop}})

    # sort
    if sort_method == "sort":
        search_obj = search_obj.sort(*["{}{}".format("-" if sort_reverse else "", f) for f in sort_fields])

    # aggregations
    if len(aggs) > 0:
        for a in aggs:
            search_obj.aggs.bucket(a, "terms", field=a, size=10000)

    filters, filter_fields = normalize_filters(filters, filter_fields)

    # filters
    if len(filters) == 0:
        inner_query = core_query
    else:
        inner_query = Bool(must=core_query, filter=get_filter_obj(type, filters, filter_fields))

    # finish up
    if sort_method == "score" and len(sort_fields) == 1:
        search_obj.query = {
            "function_score": {
                "query": inner_query.to_dict(),
                "field_value_factor": {
                    "field": sort_fields[0],
                    "missing": sort_score_missing
                }
            }
        }
    else:
        search_obj.query = inner_query
    search_obj = search_obj.highlight(field, fragment_size=200, pre_tags=["<b>"], post_tags=["</b>"])
    return search_obj[start:start + size]


def normalize_filters(filters, filter_fields):
    if not filter_fields:
        return filters, filter_fields

    filters, filter_fields, linked_ref_filters = extract_filter_values(
        filters,
        filter_fields,
        "linked_refs",
    )
    if not linked_ref_filters:
        return filters, filter_fields

    linked_refs = normalize_linked_ref_filters(linked_ref_filters)
    filters += linked_refs
    filter_fields += ["linked_refs"] * len(linked_refs)
    return filters, filter_fields


def extract_filter_values(filters, filter_fields, field_name):
    """
    Remove filters that target `field_name` from parallel filter lists.

    Returns the remaining filters, their remaining field names, and the extracted
    filter values that matched `field_name`.
    """
    remaining_filters = []
    remaining_filter_fields = []
    extracted_values = []
    for filter_value, filter_field in zip(filters, filter_fields):
        if filter_field == field_name:
            extracted_values.append(filter_value)
        else:
            remaining_filters.append(filter_value)
            remaining_filter_fields.append(filter_field)
    return remaining_filters, remaining_filter_fields, extracted_values


def normalize_linked_ref_filters(refs):
    """
    Expand raw refs into normalized segment refs for linked_refs search filters.
    """
    segment_refs = []
    for ref in refs:
        try:
            segment_refs += [segment_ref.normal() for segment_ref in Ref(ref).all_segment_refs()]
        except InputError:
            segment_refs.append("__invalid_ref__")
    return segment_refs or ["__invalid_ref__"]


def get_filter_obj(type, filters, filter_fields):
    if len(filter_fields) == 0:
        filter_fields = [None] * len(filters)  # use default filter_field for query type (defined in make_filter())
    unique_fields = set(filter_fields)
    outer_bools = []
    for agg_type in unique_fields:
        type_filters = [x for x in zip(filters, filter_fields) if x[1] == agg_type]
        bool_type = 'should' if type == 'text' else 'must'  # in general we want filters to be AND (union) but for text filters, we want them to be OR (intersection)
        inner_bool = Bool(**{bool_type: [make_filter(type, agg_type, f) for f, t in type_filters]})
        outer_bools += [inner_bool]
    return Bool(must=outer_bools)


def make_path_filter(path):
    """
    Regexp filter matching a category path itself or anything nested under it
    ("Tanakh/Torah" matches "Tanakh/Torah" and "Tanakh/Torah/Genesis"). Shared by the
    text search path filters and the entity (book) category filter — the book index's
    `path` field deliberately mirrors the text index's "Category/Subcategory/Title" shape.
    """
    path = re.escape(path.rstrip('/'))
    return Regexp(path=f"{path}|{path}/.*")


def make_filter(type, agg_type, agg_key):
    if type == "text" and agg_type in (None, "path"):
        # "path" is the standard text filter field (regexp over category path).
        # None is accepted as a defensive fallback for callers that pass an empty filter_fields list,
        # which get_filter_obj normalises to [None] (see line 129).
        # filters with '/' might be leading to books. also, very unlikely they'll match any false positives
        return make_path_filter(agg_key)
    else:
        return Term(**{agg_type: agg_key})


# --------------------------------------------------------------------------- #
#  Entity search (/api/entity-search) query building + orchestration          #
#                                                                             #
#  Queries the dedicated `topic` and `book` indices (see sefaria/search.py).  #
#  `topic` and `author` types both hit the topic index, filtered by subtype;  #
#  `book` hits the book index, but first tries to resolve the query to an     #
#  author and — if it does — returns that author's works aggregated by        #
#  category instead of a flat list.                                           #
# --------------------------------------------------------------------------- #

from sefaria.settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK

ENTITY_TYPES = ("topic", "author", "book")

# Sort options per entity type. "relevance" is the scored default; the others impose an
# explicit field order: "alpha" A-Z on the lowercased English title, "year_asc"/"year_desc"
# chronological on the per-type year field (books: composition date; authors: birth year).
# Topics have no year, so they only offer relevance and A-Z. Sources (the `text` index) are
# a separate query path and are deliberately untouched.
ENTITY_SORTS = {
    "topic": ("relevance", "alpha"),
    "author": ("relevance", "alpha", "year_asc", "year_desc"),
    "book": ("relevance", "alpha", "year_asc", "year_desc"),
}
_ENTITY_ALPHA_SORT_FIELD = "title_en.sort"  # lowercased keyword sub-field (see put_*_mapping)
_ENTITY_YEAR_SORT_FIELDS = {"author": "birthYear", "book": "compDate"}

# Default per-field match boosts for the tier-3 best_fields multi_match, in priority
# order: title -> title variants -> the name/works fields (author names on books,
# authored titles on authors) -> description.
#
# These defaults double as the *allow-list* of valid field names. A RemoteConfig
# override (see _ENTITY_FIELD_BOOSTS_RC_KEYS / _resolve_entity_field_boosts) may change
# any of these boosts at runtime without a deploy, but a key that isn't listed here —
# e.g. a misspelled "titel_en" — is ignored, never added to the query.
_DEFAULT_ENTITY_FIELD_BOOSTS = {
    "topic": {"title_en": 3, "title_he": 3, "titleVariants": 2},
    "author": {"title_en": 3, "title_he": 3, "titleVariants": 2,
               "authored_titles_en": 1.5, "authored_titles_he": 1.5},
    "book": {"title_en": 3, "title_he": 3, "titleVariants": 2, "author_names": 1.5},
}

# RemoteConfig key holding the per-field boost overrides for each entity type. Each key
# stores a JSON object like {"title_en": 3, "titleVariants": 2}; see remote_config/keys.py.
_ENTITY_FIELD_BOOSTS_RC_KEYS = {
    "topic": SEARCH_ENTITY_FIELD_BOOSTS_TOPIC,
    "author": SEARCH_ENTITY_FIELD_BOOSTS_AUTHOR,
    "book": SEARCH_ENTITY_FIELD_BOOSTS_BOOK,
}


def _resolve_entity_field_boosts(type):
    """
    Return the tier-3 multi_match field list (["title_en^3", "titleVariants^2", ...]) for
    `type`, applying any RemoteConfig per-field boost overrides on top of the hardcoded
    defaults in _DEFAULT_ENTITY_FIELD_BOOSTS.

    The defaults are the source of truth for *which* fields are searchable; the RemoteConfig
    JSON only tunes their boosts. So an override is honored only when:
      - its key names a known default field for this type (a misspelled/unknown field is
        ignored — this is the "only apply valid keys" guard the caller asked for), and
      - its value is a positive number (bool / string / non-positive values are ignored).
    Fields not mentioned in the override keep their default boost. A missing, inactive, or
    non-object RemoteConfig value leaves every field at its default, i.e. behaves exactly as
    if RemoteConfig were not set.
    """
    defaults = _DEFAULT_ENTITY_FIELD_BOOSTS.get(type, _DEFAULT_ENTITY_FIELD_BOOSTS["topic"])
    boosts = dict(defaults)  # copy preserves default order and fills unspecified fields

    rc_key = _ENTITY_FIELD_BOOSTS_RC_KEYS.get(type)
    overrides = remoteConfigCache.get(rc_key) if rc_key else None
    if isinstance(overrides, dict):
        for field, boost in overrides.items():
            if field not in defaults:
                logger.warning("entity search: ignoring unknown boost field %r for type %r", field, type)
                continue
            # bool is a subclass of int in Python; a True/False boost is a config error.
            if isinstance(boost, bool) or not isinstance(boost, (int, float)) or boost <= 0:
                logger.warning("entity search: ignoring invalid boost %r for field %r (type %r)", boost, field, type)
                continue
            boosts[field] = boost
    elif overrides is not None:
        # note: `type` is the entity-type param here, so use __class__ for the value's type name
        logger.warning("entity search: ignoring non-object boost config for type %r (got %s)", type, overrides.__class__.__name__)

    # A boost of 1 is the ES default, so render the bare field name (matches the hardcoded defaults).
    return [field if boost == 1 else f"{field}^{boost}" for field, boost in boosts.items()]


# Phrase/prefix tiers run over these "title" fields only, to avoid description noise.
# For authors we also include authored_titles so a book title matches its author.
_ENTITY_TITLE_FIELDS = {
    "topic": ["title_en", "title_he", "titleVariants"],
    "author": ["title_en", "title_he", "titleVariants", "authored_titles_en", "authored_titles_he"],
    "book": ["title_en", "title_he", "titleVariants"],
}
# Keyword sub-fields for tier-1 exact-match. Authors add authored_titles.keyword so the
# author of an exactly-titled work (e.g. "Guide for the Perplexed") outranks its commentators.
_ENTITY_KEYWORD_FIELDS = {
    "topic": ["title_en.keyword", "title_he.keyword"],
    "author": ["title_en.keyword", "title_he.keyword",
               "authored_titles_en.keyword", "authored_titles_he.keyword"],
    "book": ["title_en.keyword", "title_he.keyword"],
}


def _entity_sort_clauses(type, sort):
    """
    Return the ES `sort` clauses for a non-relevance entity sort, or None for "relevance"
    (which uses score order, i.e. no sort clause at all).

    Every field sort uses `missing: "_last"` so entities lacking the sort key — undated
    books/authors, Hebrew-only topics with no English title — always trail, in either
    direction. `_score` is the tie-breaker so equally-keyed docs still order by relevance.

    :raises ValueError: if `sort` is not valid for this entity type (e.g. year sorts on topics)
    """
    valid = ENTITY_SORTS.get(type, ENTITY_SORTS["topic"])
    if sort not in valid:
        raise ValueError(f"Invalid entity search sort '{sort}' for type '{type}'. Must be one of {valid}.")
    if sort == "relevance":
        return None
    if sort == "alpha":
        field, order = _ENTITY_ALPHA_SORT_FIELD, "asc"
    else:  # year_asc / year_desc
        field, order = _ENTITY_YEAR_SORT_FIELDS[type], sort.rsplit("_", 1)[1]
    return [{field: {"order": order, "missing": "_last"}}, {"_score": {"order": "desc"}}]


def get_entity_query_obj(query, type="topic", search_obj=None, start=0, size=20, sort="relevance",
                         category_paths=None):
    """
    Build the Elasticsearch DSL for a flat entity search over the `topic` or `book`
    index. Layers five match-type tiers as `should` clauses with descending boosts
    (a `bool should` sums matching clauses, so a higher tier — which also satisfies the
    lower tiers — accumulates a higher score and ranks above a partial match):

      1. Exact match   — `term` on the `.keyword` title sub-fields (highest boost).
      2. Exact phrase  — `match_phrase` on title fields.
      3. All words     — `multi_match best_fields` over the per-type field list (with
                         per-field ^N boosts: title > variants > name/works > description).
      4. Begins with   — `match_phrase_prefix` on title fields ("Mos" -> "Moses").
      5. Contains      — provided implicitly by the `stemmed_english` analyzer on tier 3.

    Topic/author results are then multiplied by a gentle log-scaled `numSources`
    popularity factor (>= 1, so it breaks ties toward well-sourced entities without
    zeroing or dominating a strong text match). Books carry no `numSources`.

    A non-relevance `sort` ("alpha" / "year_asc" / "year_desc") keeps the same match set
    but orders it by the sort field instead of score (see _entity_sort_clauses). The
    popularity function_score is skipped in that case — score is then only a tie-breaker,
    and the tier boosts already provide that without the script cost.

    `category_paths` (books only) restricts hits to books whose `path` sits at or under
    any of the given category paths — the same path-regexp semantics as text search
    filters (see make_path_filter). Multiple paths OR together; the clause is a
    non-scoring `filter`, so it never perturbs relevance ranking.

    :param query: the user query string
    :param type: one of "topic", "author", "book"
    :param search_obj: an optional elasticsearch_dsl Search to attach the query to
    :param sort: one of ENTITY_SORTS[type]; default "relevance"
    :param category_paths: optional list of category path strings; only valid for type="book"
    :return: Search object ready to .execute()
    :raises ValueError: if `sort` or `category_paths` is not valid for this entity type
    """
    sort_clauses = _entity_sort_clauses(type, sort)
    if search_obj is None:
        search_obj = Search()
    is_book = type == "book"
    if category_paths and not is_book:
        raise ValueError(f"Entity search 'filter' is only supported for type 'book', not '{type}'.")
    fields = _resolve_entity_field_boosts(type)
    title_fields = _ENTITY_TITLE_FIELDS.get(type, _ENTITY_TITLE_FIELDS["topic"])
    keyword_fields = _ENTITY_KEYWORD_FIELDS.get(type, _ENTITY_KEYWORD_FIELDS["topic"])

    # Tier 1 — exact literal match on the keyword sub-fields (case-sensitive).
    tier1_exact = [Q("term", **{kf: {"value": query, "boost": 8}}) for kf in keyword_fields]
    # Tier 2 — exact phrase over the (analyzed) title fields.
    tier2_phrase = Q("multi_match", query=query, fields=title_fields, type="phrase", boost=4)
    # Tier 3 — all query words, best matching field wins (per-field ^N boosts inside `fields`).
    tier3_words = Q("multi_match", query=query, fields=fields, type="best_fields", boost=2)
    # Tier 4 — prefix / begins-with on titles only.
    tier4_prefix = Q("multi_match", query=query, fields=title_fields, type="phrase_prefix", boost=1)
    text_query = Q("bool", should=[*tier1_exact, tier2_phrase, tier3_words, tier4_prefix], minimum_should_match=1)

    # topic and author both live in the topic index; filter by subtype.
    if type in ("topic", "author"):
        base_query = Q("bool", must=[text_query], filter=[Q("term", subtype=type)])
    elif category_paths:
        # Category filter: match set restricted to books at/under any given path (OR).
        path_filter = Bool(should=[make_path_filter(p) for p in category_paths], minimum_should_match=1)
        base_query = Q("bool", must=[text_query], filter=[path_filter])
    else:
        base_query = text_query

    if is_book or sort_clauses is not None:
        search_obj.query = base_query
    else:
        # Multiply the text score by a gentle popularity factor: 1 + log10(1 + numSources)*w.
        # A zero-source entity keeps its text score unchanged (factor 1.0); a heavily-sourced
        # one is nudged up (~1.7x at ~7000 sources). It breaks ties without dominating and,
        # unlike field_value_factor(log1p), never zeroes a sourceless-but-relevant match.
        search_obj.query = {
            "function_score": {
                "query": base_query.to_dict(),
                "script_score": {
                    "script": {
                        "source": "1 + Math.log10(1 + (doc['numSources'].size() == 0 ? 0 : doc['numSources'].value)) * params.weight",
                        "params": {"weight": 0.2},
                    }
                },
                "boost_mode": "multiply",
            }
        }

    if sort_clauses is not None:
        search_obj = search_obj.sort(*sort_clauses)
    return search_obj[start:start + size]


def _total_from_response(response):
    total = response.hits.total
    return total.value if hasattr(total, "value") else total


def _query_matches_entity_title(query, hit):
    """
    True if `query` directly matches the entity's title or a title variant (not merely
    a description mention). Guards the author-works view from triggering when an author
    name only appears in some book's description.
    """
    q = (query or "").strip().lower()
    if not q:
        return False
    candidates = [hit.get("title_en", ""), hit.get("title_he", "")] + (hit.get("titleVariants") or [])
    for c in candidates:
        c = (c or "").strip().lower()
        if c and (q == c or c.startswith(q) or q.startswith(c)):
            return True
    return False


def _resolve_author(query, es_client):
    """
    Resolve `query` to an AuthorTopic if it directly matches an author entity in the
    topic index; otherwise return None.
    """
    from sefaria.model.topic import AuthorTopic

    search_obj = Search(using=es_client, index=SEARCH_INDEX_NAME_TOPIC).params(request_timeout=5)
    search_obj = get_entity_query_obj(query, type="author", search_obj=search_obj, size=1)
    response = search_obj.execute()
    if not response.success() or len(response.hits) == 0:
        return None
    top = response.hits[0].to_dict()
    slug = top.get("slug")
    if not slug or not _query_matches_entity_title(query, top):
        return None
    return AuthorTopic.init(slug)


def _author_works_response(author, sort="relevance"):
    """
    Build the aggregated author-works response: the author's works collapsed by
    category (reusing AuthorTopic aggregation).

    Every row carries a `compDate`: an individual work's own composition year, or — for a
    category row, which collapses many works and dates into one entry — the average year
    of its dated works (see AuthorCategoryAggregation.get_comp_date). That key lets the
    explicit sorts order the aggregated rows in code, mirroring the ES sort semantics of
    the flat search ("alpha" A-Z on lowercased English title, "year_asc"/"year_desc" on
    compDate, missing values last in either direction). The default "relevance" sort
    keeps the original presentation order with category entries sorted to the top.
    """
    hits = []
    for agg in author.get_aggregated_urls_for_authors_indexes():
        hits.append({
            "title_en": agg["title"]["en"],
            "title_he": agg["title"]["he"],
            "isCategory": agg["isCategory"],
            "categoryLabel_en": agg["categoryLabel"]["en"],
            "categoryLabel_he": agg["categoryLabel"]["he"],
            "categories": agg["categories"],
            "url": agg["url"],
            "description_en": agg["description"]["en"],
            "description_he": agg["description"]["he"],
            "compDate": agg["compDate"],
        })
    if sort == "alpha":
        hits.sort(key=lambda h: (h.get("title_en") or "").lower())
    elif sort in ("year_asc", "year_desc"):
        descending = sort == "year_desc"

        def year_key(h):
            date = h.get("compDate")
            missing = date is None
            return (missing, 0 if missing else (-date if descending else date),
                    (h.get("title_en") or "").lower())

        hits.sort(key=year_key)
    else:
        hits.sort(key=lambda h: 0 if h.get("isCategory") else 1)  # category aggregations first
    return {"hits": hits, "total": len(hits), "author_slug": author.slug}


def entity_search(query, type, start=0, size=20, sort="relevance", category_paths=None, aggregate=True):
    """
    Run an entity search and return a plain dict {"hits": [...], "total": N}.

    - type="topic"/"author": flat full-text search over the topic index (filtered by subtype).
    - type="book": if the query resolves to an author entity, return that author's works
      aggregated by category; otherwise a flat full-text search over the book index.
      `category_paths` (books only) restricts hits to books at/under any of the given
      category paths.

    Explicit sorts keep the aggregation: each aggregated row carries a `compDate` (a
    category row averages the dates of its collapsed works), and the rows are sorted in
    code with the same semantics as the flat ES sorts (see _author_works_response). A
    category filter still runs the flat search — a category row spans many per-book
    paths, so it can't be filtered as a unit.

    `aggregate=False` skips the author resolution entirely, so a book query always
    returns the flat list — a QA escape hatch for comparing the two views side by side.
    Only books aggregate, so the flag is a no-op for other types.

    :raises ValueError: if `type` is not one of ENTITY_TYPES, `sort` is not one of
        ENTITY_SORTS[type], or `category_paths` is passed for a non-book type
    """
    if type not in ENTITY_TYPES:
        raise ValueError(f"Invalid entity search type '{type}'. Must be one of {ENTITY_TYPES}.")
    if sort not in ENTITY_SORTS[type]:
        raise ValueError(f"Invalid entity search sort '{sort}' for type '{type}'. Must be one of {ENTITY_SORTS[type]}.")
    if category_paths and type != "book":
        raise ValueError(f"Entity search 'filter' is only supported for type 'book', not '{type}'.")

    es_client = get_elasticsearch_client()

    if type == "book":
        if aggregate and not category_paths:
            author = _resolve_author(query, es_client)
            if author is not None:
                return _author_works_response(author, sort=sort)
        index_name = SEARCH_INDEX_NAME_BOOK
    else:
        index_name = SEARCH_INDEX_NAME_TOPIC

    search_obj = Search(using=es_client, index=index_name).params(request_timeout=5)
    search_obj = get_entity_query_obj(query, type=type, search_obj=search_obj, start=start, size=size, sort=sort,
                                      category_paths=category_paths)
    response = search_obj.execute()
    if not response.success():
        raise IOError("Elasticsearch entity search failed.")
    hits = [hit.to_dict() for hit in response.hits]
    return {"hits": hits, "total": _total_from_response(response)}


def get_elasticsearch_client():
    from elasticsearch import Elasticsearch
    from sefaria.settings import SEARCH_URL
    return Elasticsearch(SEARCH_URL)


def get_elasticsearch_client_for_indexer():
    """Must NOT be used on the online request path."""
    from elasticsearch import Elasticsearch
    from sefaria.settings import SEARCH_URL
    return Elasticsearch(
        SEARCH_URL,
        request_timeout=60,
        retry_on_timeout=True,
        max_retries=3,
    )
