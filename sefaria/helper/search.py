from functools import wraps
from elasticsearch_dsl import Q, Search
from elasticsearch_dsl.query import Bool, Regexp, Term
from sefaria.model import Ref
from sefaria.system.exceptions import InputError
import re


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


def make_filter(type, agg_type, agg_key):
    if type == "text" and agg_type in (None, "path"):
        # "path" is the standard text filter field (regexp over category path).
        # None is accepted as a defensive fallback for callers that pass an empty filter_fields list,
        # which get_filter_obj normalises to [None] (see line 129).
        # filters with '/' might be leading to books. also, very unlikely they'll match any false positives
        agg_key = agg_key.rstrip('/')
        agg_key = re.escape(agg_key)
        reg = f"{agg_key}|{agg_key}/.*"
        return Regexp(path=reg)
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

try:
    from sefaria.settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK
except ImportError:
    SEARCH_INDEX_NAME_TOPIC = 'topic'
    SEARCH_INDEX_NAME_BOOK = 'book'

ENTITY_TYPES = ("topic", "author", "book")

# Per-field match boosts. Titles weighted highest, then variants, then descriptions.
# (These are the "match boosts" that a future RemoteConfig knob would expose.)
_ENTITY_FIELDS = {
    "topic": ["title_en^3", "title_he^3", "titleVariants^2", "description_en", "description_he"],
    "book": ["title_en^3", "title_he^3", "titleVariants^2", "description_en", "description_he", "author_names^2"],
}
# Prefix matching is applied to title fields only, to avoid description noise.
_ENTITY_TITLE_FIELDS = ["title_en", "title_he", "titleVariants"]


def get_entity_query_obj(query, type="topic", search_obj=None, start=0, size=20):
    """
    Build the Elasticsearch DSL for a flat entity search over the `topic` or `book`
    index. Combines three scorers (see sefaria/search.py mappings):

      1. Exact-word match (`best_fields`, x2 boost) — the primary scorer.
      2. Prefix match (`phrase_prefix`, titles only) — treats the last query word
         as a prefix so "Mos" matches "Moses".
      3. Popularity boost (`function_score` on `numSources`, log-scaled multiplier) —
         topic/author only; breaks ties toward well-sourced entities.

    :param query: the user query string
    :param type: one of "topic", "author", "book"
    :param search_obj: an optional elasticsearch_dsl Search to attach the query to
    :return: Search object ready to .execute()
    """
    if search_obj is None:
        search_obj = Search()
    is_book = type == "book"
    fields = _ENTITY_FIELDS["book" if is_book else "topic"]

    exact = Q("multi_match", query=query, fields=fields, type="best_fields", boost=2)
    prefix = Q("multi_match", query=query, fields=_ENTITY_TITLE_FIELDS, type="phrase_prefix")
    text_query = Q("bool", should=[exact, prefix], minimum_should_match=1)

    # topic and author both live in the topic index; filter by subtype.
    if type in ("topic", "author"):
        base_query = Q("bool", must=[text_query], filter=[Q("term", subtype=type)])
    else:
        base_query = text_query

    if is_book:
        search_obj.query = base_query
    else:
        # Multiply the text score by a log-scaled numSources factor so a well-sourced
        # entity outranks a sparse one with a comparable text match.
        search_obj.query = {
            "function_score": {
                "query": base_query.to_dict(),
                "field_value_factor": {
                    "field": "numSources",
                    "modifier": "log1p",
                    "factor": 1,
                    "missing": 0,
                },
                "boost_mode": "multiply",
            }
        }

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


def _author_works_response(author):
    """
    Build the aggregated author-works response: the author's works collapsed by
    category (reusing AuthorTopic aggregation), category entries sorted to the top.
    """
    hits = []
    for agg in author.get_aggregated_urls_for_authors_indexes():
        hits.append({
            "title_en": agg["title"]["en"],
            "title_he": agg["title"]["he"],
            "isCategory": agg["isCategory"],
            "categoryLabel_en": agg["categoryLabel"]["en"],
            "categoryLabel_he": agg["categoryLabel"]["he"],
            "url": agg["url"],
            "description_en": agg["description"]["en"],
            "description_he": agg["description"]["he"],
        })
    hits.sort(key=lambda h: 0 if h.get("isCategory") else 1)  # category aggregations first
    return {"hits": hits, "total": len(hits), "author_slug": author.slug}


def entity_search(query, type, start=0, size=20):
    """
    Run an entity search and return a plain dict {"hits": [...], "total": N}.

    - type="topic"/"author": flat full-text search over the topic index (filtered by subtype).
    - type="book": if the query resolves to an author entity, return that author's works
      aggregated by category; otherwise a flat full-text search over the book index.

    :raises ValueError: if `type` is not one of ENTITY_TYPES
    """
    if type not in ENTITY_TYPES:
        raise ValueError(f"Invalid entity search type '{type}'. Must be one of {ENTITY_TYPES}.")

    es_client = get_elasticsearch_client()

    if type == "book":
        author = _resolve_author(query, es_client)
        if author is not None:
            return _author_works_response(author)
        index_name = SEARCH_INDEX_NAME_BOOK
    else:
        index_name = SEARCH_INDEX_NAME_TOPIC

    search_obj = Search(using=es_client, index=index_name).params(request_timeout=5)
    search_obj = get_entity_query_obj(query, type=type, search_obj=search_obj, start=start, size=size)
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
