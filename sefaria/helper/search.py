from functools import wraps
from elasticsearch_dsl import Q, Search
from elasticsearch_dsl.query import Bool, Regexp, Term
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
    if type == "text":
        # filters with '/' might be leading to books. also, very unlikely they'll match an false positives
        agg_key = agg_key.rstrip('/')
        agg_key = re.escape(agg_key)
        reg = f"{agg_key}|{agg_key}/.*"
        return Regexp(path=reg)
    elif type == "sheet":
        return Term(**{agg_type: agg_key})


def get_elasticsearch_client():
    from elasticsearch import Elasticsearch
    try:
        from sefaria.settings import SEARCH_URL
    except ImportError as e:
        print(f"Failed to import SEARCH_URL: {e}")
        # Set a default value for SEARCH_URL or handle it in another way
        SEARCH_URL = "http://default-search-url.com"  # Replace with a sensible default URL

    return Elasticsearch(SEARCH_URL)
