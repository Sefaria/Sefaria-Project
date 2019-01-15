from elasticsearch_dsl import Q, Search, A
import re
def get_query_obj(search_obj, field, exact, query, fromm, size, get_filters, aggregation_fields, aggregations_to_update, sort_method, sort_fields, sort_reverse=False, sort_score_missing=0):
    query = re.sub(ur"(\S)\"(\S)", ur"\1\u05f4\2", query)  # Replace internal quotes with gershaim.
    core_query = Q("match_phrase", **{"query": query})
    if not exact:
        setattr(core_query, field, {"slop": 10})

    # sort
    if sort_method == "sort":
        search_obj = search_obj.sort(*[u"{}{}".format(u"-" if sort_reverse else u"", f) for f in sort_fields])
    elif sort_method == "score" and len(sort_fields) == 1:
        search_obj.query = {
            "function_score": {
                "field_value_factor": {
                    "field": sort_fields[0],
                    "missing": sort_score_missing
                }
            }
        }

    # aggregations
    if get_filters or len(aggregation_fields) > 1 and len(aggregations_to_update) > 0:
        # Initial, unfiltered query.  Get potential filters.
        # OR
        # any filtered query where there are more than 1 agg type means you need to re-fetch filters on each filter you add

    # finish up
    search_obj = search_obj.highlight(field, fragment_size=200, pre_tags=[u"<b>"], post_tags=[u"</b>"])
    search_obj.query = full_query
    return search_obj[fromm:fromm+size]


def get_aggregation_obj(aggregations_to_update):
    pass