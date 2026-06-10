# encoding=utf-8
import json
from sefaria.helper.search import *


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


def ordered(obj):
    if isinstance(obj, dict):
        return sorted((str(k), ordered(v)) for k, v in list(obj.items()))
    if isinstance(obj, list):
        return sorted(ordered(x) for x in obj)
    else:
        return obj
