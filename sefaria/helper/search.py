from elasticsearch_dsl import Q, Search
from elasticsearch_dsl.query import Bool, Regexp, Term
import re


def get_query_obj(
        query,
        type=u"text",
        field=u"exact",
        slop=0,
        fromm=0,
        size=100,
        applied_filters=None,
        applied_filter_fields=None,
        aggs=None,
        sort_method=u"sort",
        sort_fields=None,
        sort_reverse=False,
        sort_score_missing=0,
        search_obj=None):
    """

    :param query :str:
    :param type :str: one_of("text", "sheet")
    :param field :str: which field do you want to query? usually either "exact", "naive_lemmatizer" or "content"
    :param slop :int: max distance allowed b/w words in the query. 0 is an exact match
    :param fromm :int: pagination start
    :param size :int: page size
    :param applied_filters :list(str): list of filters you've applied
    :param applied_filter_fields :list(str): list of fields each filter is filtering on. must be same size as `applied_filters` usually "path", "group" or "tags"
    :param aggs :list(str): list of fields to aggregate on. usually "path", "group" or "tags"
    :param sort_method :str: how to sort. either "sort" or "score"
    :param sort_fields :list(str): which fields to sort on. sorts are applied in order stably
    :param sort_reverse :bool: should the sorting be reversed?
    :param sort_score_missing :float: in the case of `sort_method = "score"` what value to use if `sort_fields` doesn't exist on a doc
    :param search_obj :Search: object to add the query, sorting, filters etc. optional
    :return: Search object with all the stuff ready to execute
    """
    if applied_filters is None:
        applied_filters = []
    if applied_filter_fields is None:
        applied_filter_fields = []
    if aggs is None:
        aggs = []
    if sort_fields is None:
        sort_fields = []
    if search_obj is None:
        search_obj = Search()
    query = re.sub(ur"(\S)\"(\S)", ur"\1\u05f4\2", query)  # Replace internal quotes with gershaim.
    core_query = Q(u"match_phrase", **{field: {u"query": query, u"slop": slop}})

    # sort
    if sort_method == u"sort":
        search_obj = search_obj.sort(*[u"{}{}".format(u"-" if sort_reverse else u"", f) for f in sort_fields])

    # aggregations
    if len(aggs) > 0:
        # Initial, unfiltered query.  Get potential filters.
        # OR
        # any filtered query where there are more than 1 agg type means you need to re-fetch filters on each filter you add
        for a in aggs:
            search_obj.aggs.bucket(a, u"terms", field=a, size=10000)

    # filters
    if len(applied_filters) == 0:
        inner_query = core_query
    else:
        # Filtered query.  Add clauses.
        inner_query = Bool(must=core_query, filter=get_filter_obj(type, applied_filters, applied_filter_fields))

    # finish up
    if sort_method == u"score" and len(sort_fields) == 1:
        search_obj.query = {
            u"function_score": {
                u"query": inner_query.to_dict(),
                u"field_value_factor": {
                    u"field": sort_fields[0],
                    u"missing": sort_score_missing
                }
            }
        }
    else:
        search_obj.query = inner_query
    search_obj = search_obj.highlight(field, fragment_size=200, pre_tags=[u"<b>"], post_tags=[u"</b>"])
    return search_obj[fromm:fromm+size]


def get_filter_obj(type, applied_filters, applied_filter_fields):
    unique_fields = set(applied_filter_fields)
    must_bools = []
    for agg_type in unique_fields:
        type_filters = filter(lambda x: x[1] == agg_type, zip(applied_filters, applied_filter_fields))
        should_bool = Bool(should=[make_filter(type, agg_type, f) for f, t in type_filters])
        must_bools += [should_bool]
    return Bool(must=must_bools)


def make_filter(type, agg_type, agg_key):
    if type == u"text":
        # filters with '/' might be leading to books. also, very unlikely they'll match an false positives
        reg = re.escape(agg_key) + (u".*" if u"/" in agg_key else u"/.*")
        return Regexp(path=reg)
    elif type == u"sheet":
        return Term(**{agg_type: agg_key})
