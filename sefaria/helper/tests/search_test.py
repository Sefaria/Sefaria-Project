# encoding=utf-8
import json
from sefaria.helper.search import *


def test_query_obj():
    # stam query
    s = get_query_obj(u"moshe", u"text", u"exact", 0, 0, 10, [], [], [], u"sort", [u'comp_date', u'order'])
    t = json.loads(u"""{"from":0,"size":10,"highlight":{"fields":{"exact":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"sort":["comp_date","order"],"query":{"match_phrase":{"exact":{"query":"moshe","slop":0}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # text query sorted by pagerank and non-exact
    s = get_query_obj(u"moshe", u"text", u"naive_lemmatizer", 10, 0, 10, [], [], [], u"score", [u'pagesheetrank'], sort_score_missing=0.04)
    t = json.loads(u"""{"size":10,"from":0,"highlight":{"fields":{"naive_lemmatizer":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"query":{"function_score":{"functions":[{"field_value_factor":{"field":"pagesheetrank","missing":0.04}}],"query":{"match_phrase":{"naive_lemmatizer":{"query":"moshe","slop":10}}}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # text query sorted by pagerank, non-exact and with aggs
    s = get_query_obj(u"moshe", u"text", u"naive_lemmatizer", 10, 0, 10, [], [], [u"path"], u"score", [u'pagesheetrank'], sort_score_missing=0.04)
    t = json.loads(u"""{"size":10,"from":0,"highlight":{"fields":{"naive_lemmatizer":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"query":{"function_score":{"functions":[{"field_value_factor":{"field":"pagesheetrank","missing":0.04}}],"query":{"match_phrase":{"naive_lemmatizer":{"query":"moshe","slop":10}}}}},"aggs":{"path":{"terms":{"field":"path","size":10000}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # sheet query sorted by views and with multiple aggs
    s = get_query_obj(u"moshe", u"sheet", u"content", 10, 0, 10, [], [], [u'group', u'tags'], u"sort", [u'views'], sort_reverse=True)
    t = json.loads(u"""{"from": 0, "size":10,"highlight":{"fields":{"content":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"sort":[{"views":{"order":"desc"}}],"aggs":{"group":{"terms":{"field":"group","size":10000}},"tags":{"terms":{"field":"tags","size":10000}}},"query":{"match_phrase":{"content":{"query":"moshe","slop":10}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # text query sorted by pagerank and with multiple applied filters
    s = get_query_obj(u"moshe", u"text", u"naive_lemmatizer", 10, 0, 10, [u"Tanakh/Targum/Targum Jonathan", u"Mishnah/Seder Zeraim/Mishnah Peah", u"Talmud/Bavli/Seder Moed/Pesachim"], [u"path", u"path", u"path"], [], u"score", [u'pagesheetrank'], sort_score_missing=0.04)
    # why use one backslash when you can use four!
    t = json.loads(u"""{"from":0,"size":10,"highlight":{"fields":{"naive_lemmatizer":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"query":{"function_score":{"functions":[{"field_value_factor":{"field":"pagesheetrank","missing":0.04}}],"query":{"bool":{"must":[{"match_phrase":{"naive_lemmatizer":{"query":"moshe","slop":10}}}],"filter":[{"bool":{"must":[{"bool":{"should":[{"regexp":{"path":"Tanakh\\\\/Targum\\\\/Targum\\\\ Jonathan.*"}},{"regexp":{"path":"Mishnah\\\\/Seder\\\\ Zeraim\\\\/Mishnah\\\\ Peah.*"}},{"regexp":{"path":"Talmud\\\\/Bavli\\\\/Seder\\\\ Moed\\\\/Pesachim.*"}}]}}]}}]}}}}}""")
    assert ordered(t) == ordered(s.to_dict())
    # sheet query sorted by relevance, with a group agg and group/tag filters
    s = get_query_obj(u"moshe", u"sheet", u"content", 10, 0, 10, [u"", u"Moses", u"Passover"], [u"group", u"tags", u"tags"], [u'group'], u"score", [])
    t = json.loads(u"""{"size":10,"from":0,"highlight":{"fields":{"content":{"fragment_size":200,"pre_tags":["<b>"],"post_tags":["</b>"]}}},"aggs":{"group":{"terms":{"field":"group","size":10000}}},"query":{"bool":{"must":[{"match_phrase":{"content":{"query":"moshe","slop":10}}}],"filter":[{"bool":{"must":[{"bool":{"should":[{"term":{"tags":"Moses"}},{"term":{"tags":"Passover"}}]}},{"bool":{"should":[{"term":{"group":""}}]}}]}}]}}}""")
    assert ordered(t) == ordered(s.to_dict())


def ordered(obj):
    if isinstance(obj, dict):
        return sorted((unicode(k), ordered(v)) for k, v in obj.items())
    if isinstance(obj, list):
        return sorted(ordered(x) for x in obj)
    else:
        return obj