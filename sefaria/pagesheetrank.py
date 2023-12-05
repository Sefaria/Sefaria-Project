# implementation of pagerank with low ram requirements
# source: http://michaelnielsen.org/blog/using-your-laptop-to-compute-pagerank-for-millions-of-webpages/

import re
import math
import numpy
import random
import json
import time
from pymongo.errors import AutoReconnect
from collections import defaultdict, OrderedDict
from sefaria.model import *
from sefaria.system.exceptions import InputError, NoVersionFoundError
from sefaria.system.database import db
from .settings import STATICFILES_DIRS
from functools import reduce

tanach_indexes = set(library.get_indexes_in_category("Tanakh"))


class web:
    def __init__(self, n):
        self.size = n
        self.in_links = {}
        self.number_out_links = {}
        self.dangling_pages = {}
        for j in range(n):
            self.in_links[j] = []
            self.number_out_links[j] = 0
            self.dangling_pages[j] = True


def paretosample(n, power=2.0):
    '''Returns a sample from a truncated Pareto distribution
  with probability mass function p(l) proportional to
  1/l^power.  The distribution is truncated at l = n.'''
    m = n + 1
    while m > n: m = numpy.random.zipf(power)
    return m


def random_web(n=1000, power=2.0):
    '''Returns a web object with n pages, and where each
  page k is linked to by L_k random other pages.  The L_k
  are independent and identically distributed random
  variables with a shifted and truncated Pareto
  probability mass function p(l) proportional to
  1/(l+1)^power.'''
    g = web(n)
    for k in range(n):
        lk = paretosample(n + 1, power) - 1
        values = random.sample(range(n), lk)
        g.in_links[k] = values
        for j in values:
            if g.number_out_links[j] == 0: g.dangling_pages.pop(j)
            g.number_out_links[j] += 1
    return g


def create_empty_nodes(g):
    all_links = set(reduce(lambda a, b: a + b, [list(v.keys()) for v in list(g.values())], []))
    for l in all_links:
        if l not in g:
            g[l] = {}
    return g


def create_web(g):
    n = len(g)
    w = web(n)
    node2index = {r: i for i, r in enumerate([x[0] for x in g])}
    for i, (r, links) in enumerate(g):
        r_ind = node2index[r]
        link_inds = [(node2index[r_temp], count) for r_temp, count in list(links.items())]
        w.in_links[r_ind] = reduce(lambda a, b: a + [b[0]] * int(round(b[1])), link_inds, [])
        for j, count in link_inds:
            if w.number_out_links[j] == 0: w.dangling_pages.pop(j)
            w.number_out_links[j] += count
    return w


def step(w, p, s=0.85):
    '''Performs a single step in the PageRank computation,
    with web g and parameter s.  Applies the corresponding M
    matrix to the vector p, and returns the resulting
    vector.'''
    n = w.size
    v = numpy.matrix(numpy.zeros((n, 1)))
    inner_product = sum(p[j] for j in w.dangling_pages.keys())
    for j in range(n):
        v[j] = s * sum([p[k] / w.number_out_links[k]
                        for k in w.in_links[j]]) + s * inner_product / n + (1 - s) / n
    # We rescale the return vector, so it remains a
    # probability distribution even with floating point
    # roundoff.
    return v / numpy.sum(v)


def pagerank(g, s=0.85, tolerance=0.00001, maxiter=100, verbose=False, normalize=False):
    w = create_web(g)
    n = w.size
    p = numpy.matrix(numpy.ones((n, 1))) / n
    iteration = 1
    change = 2
    while change > tolerance and iteration < maxiter:
        if verbose:
            print("Iteration: %s" % iteration)
        new_p = step(w, p, s)
        change = numpy.sum(numpy.abs(p - new_p))
        if verbose:
            print("Change in l1 norm: %s" % change)
        p = new_p
        iteration += 1
    if normalize:
        # This is interesting and nerdy, but min seems to do the exact same thing
        # dangling_pr_sum = sum(p[j] for j in w.dangling_pages.keys())
        # norm_factor = ((1-s) + s*dangling_pr_sum)/w.size  # see: https://www2007.org/posters/poster893.pdf
        # p /= norm_factor
        try:
            p /= p.min()
        except ValueError:
            pass  # empty list can't calculate min
    pr_list = list(numpy.squeeze(numpy.asarray(p)))
    return {k: v for k, v in zip([x[0] for x in g], pr_list)}


def has_intersection(a, b):
    for temp_a in a:
        if temp_a in b:
            return True
    return False


def init_pagerank_graph(ref_list=None):
    """
    :param ref_list: optional list of refs to use instead of using all links. link graph is built from all links to these refs
    :return: graph which is a double dict. the keys of both dicts are refs. the values are the number of incoming links
    between outer key and inner key
    """

    def is_tanach(r):
        return r.index.title in tanach_indexes

    def recursively_put_in_graph(ref1, ref2, weight=1.0):
        if ref1.is_section_level():
            return  # ignore section level
            seg_refs = ref1.all_segment_refs()
            for ref1_seg in seg_refs:
                recursively_put_in_graph(ref1_seg, ref2, weight / len(seg_refs))
        elif ref2.is_section_level():
            return  # ignore section level
            seg_refs = ref2.all_segment_refs()
            for ref2_seg in seg_refs:
                recursively_put_in_graph(ref1, ref2_seg, weight / len(seg_refs))
        elif ref1.is_range():
            for ref1_seg in ref1.range_list():
                if ref2.is_range():
                    for ref2_seg in ref2.range_list():
                        recursively_put_in_graph(ref1_seg, ref2_seg)
                else:
                    recursively_put_in_graph(ref1_seg, ref2)
        else:
            put_link_in_graph(ref1, ref2, weight)

    def put_link_in_graph(ref1, ref2, weight=1.0):
        str1 = ref1.normal()
        str2 = ref2.normal()
        if str1 not in all_ref_cat_counts:
            all_ref_cat_counts[str1] = set()
        if str2 not in all_ref_cat_counts:
            all_ref_cat_counts[str2] = set()
        # not a typo. add the cat of ref2 to ref1
        all_ref_cat_counts[str1].add(ref2.primary_category)
        all_ref_cat_counts[str2].add(ref1.primary_category)

        if str1 not in graph:
            graph[str1] = {}

        if str2 == str1 or (is_tanach(ref1) and is_tanach(ref2)):
            # self link
            return

        if str2 not in graph[str1]:
            graph[str1][str2] = 0
        graph[str1][str2] += weight

    graph = OrderedDict()
    if ref_list is None:
        all_links = LinkSet()  # LinkSet({"type": re.compile(ur"(commentary|quotation)")}).array()
        len_all_links = all_links.count()
    else:
        link_list = []
        ref_list_seg_set = {rr.normal() for r in ref_list for rr in r.all_segment_refs()}
        for oref in ref_list:
            link_list += list(filter(lambda x: has_intersection(x.expandedRefs0, ref_list_seg_set) and has_intersection(x.expandedRefs1, ref_list_seg_set), oref.linkset()))
        len_all_links = len(link_list)
        all_links = LinkSet()
        all_links.records = link_list
    all_ref_cat_counts = {}
    current_link, page, link_limit = 0, 0, 100000
    if ref_list is None:
        all_links = LinkSet(limit=link_limit, page=page)

    while len(all_links.array()) > 0:
        for link in all_links:  # raw records avoids caching the entire LinkSet into memory
            if current_link % 1000 == 0 and current_link > 0:
                print("{}/{}".format(current_link, len_all_links))

            try:
                # TODO pagerank segments except Talmud. Talmud is pageranked by section
                # TODO if you see a section link, add pagerank to all of its segments
                refs = [Ref(r) for r in link.refs]
                tp1 = refs[0].index.best_time_period()
                tp2 = refs[1].index.best_time_period()
                start1 = int(tp1.determine_year_estimate()) if tp1 else 3000
                start2 = int(tp2.determine_year_estimate()) if tp2 else 3000

                older_ref, newer_ref = (refs[0], refs[1]) if start1 < start2 else (refs[1], refs[0])

                temp_links = []
                older_ref = older_ref.padded_ref()
                newer_ref = newer_ref.padded_ref()
                if start1 == start2:
                    if ref_list is not None:
                        continue  # looks like links at the same time span can cause a big increase in PR. I'm going to disable this right now for small graphs
                    # randomly switch refs that are equally dated
                    older_ref, newer_ref = (older_ref, newer_ref) if random.choice([True, False]) else (
                    newer_ref, older_ref)
                recursively_put_in_graph(older_ref, newer_ref)

            except InputError:
                pass
            except TypeError as e:
                print("TypeError")
                print(link.refs)
            except IndexError:
                pass
            except AssertionError:
                pass
            except ValueError:
                print("ValueError")
                print(link.refs)
                pass
            current_link += 1
        if ref_list is None:
            page += 1
            all_links = LinkSet(limit=link_limit, page=page)
        else:
            break

    for ref in all_ref_cat_counts:
        if ref not in graph:
            graph[ref] = {}

    return graph, all_ref_cat_counts


def pagerank_rank_ref_list(ref_list, normalize=False, seg_ref_map=None):
    """
    :param seg_ref_map: dict with keys that are ranged refs and values are list of segment trefs. pass in order to save from recomputing within this function
    """
    # make unique
    ref_list = [v for k, v in {r.normal(): r for r in ref_list}.items()]
    graph, all_ref_cat_counts = init_pagerank_graph(ref_list)
    pr = pagerank(list(graph.items()), 0.85, verbose=False, tolerance=0.00005, normalize=normalize)

    if not normalize:
        # remove lowest pr value which just means it quoted at least one source but was never quoted
        sorted_ranking = sorted(list(pr.items()), key=lambda x: x[1])
        count = 0
        if len(sorted_ranking) > 0:
            smallest_pr = sorted_ranking[0][1]
            while count < len(sorted_ranking) and (sorted_ranking[count][1] - smallest_pr) < 1e-30:
                count += 1
            if count < len(sorted_ranking) - 1:
                pr = {r: temp_pr for r, temp_pr in sorted_ranking[count:]}
    # map pr values onto ref_list
    if seg_ref_map is None:
        seg_ref_map = {r.normal(): [rr.normal() for rr in r.all_segment_refs()] for r in ref_list}
    # TODO do we always want to choose max segment PR over the range? maybe average is better?
    ref_list_with_pr = sorted([
        (r, max([pr.get(rr, 0.0) for rr in seg_ref_map[r.normal()]])) if len(seg_ref_map[r.normal()]) > 0 else (r, 0.0) for r in
        ref_list
    ], key=lambda x: x[1], reverse=True)
    return ref_list_with_pr


def calculate_pagerank():
    graph, all_ref_cat_counts = init_pagerank_graph()
    # json.dump(graph.items(), open("{}pagerank_graph3.json".format(STATICFILES_DIRS[0]), "wb"))
    ranked = pagerank(list(graph.items()), 0.85, verbose=True, tolerance=0.00005)
    sorted_ranking = sorted(list(dict(ranked).items()), key=lambda x: x[1])
    count = 0
    smallest_pr = sorted_ranking[0][1]
    while count < len(sorted_ranking) and (sorted_ranking[count][1] - smallest_pr) < 1e-30:
        count += 1
    sorted_ranking = sorted_ranking[count:]
    print("Removing {} low pageranks".format(count))

    pagerank_dict = {tref: pr for tref, pr in sorted_ranking}
    return pagerank_dict


def update_pagesheetrank():
    pagerank = calculate_pagerank()
    sheetrank = calculate_sheetrank()
    pagesheetrank = {}
    all_trefs = set(list(pagerank.keys()) + list(sheetrank.keys()))
    for tref in all_trefs:
        temp_pagerank_scaled = math.log(pagerank[tref]) + 20 if tref in pagerank else RefData.DEFAULT_PAGERANK
        temp_sheetrank_scaled = (1.0 + sheetrank[tref] / 5) ** 2 if tref in sheetrank else RefData.DEFAULT_SHEETRANK
        pagesheetrank[tref] = temp_pagerank_scaled * temp_sheetrank_scaled
    from pymongo import UpdateOne
    result = db.ref_data.bulk_write([
        UpdateOne({"ref": tref}, {"$set": {"pagesheetrank": psr}}, upsert=True) for tref, psr in
        list(pagesheetrank.items())
    ])


def cat_bonus(num_cats):
    return 1.0 + (0.04 * num_cats)


def length_penalty(l):
    # min of about -4.4
    # penalize segments less than minLen characters
    minLen, maxLen = 10, 1000
    l = l if l <= maxLen else maxLen
    penalty = 1000 * math.log(1.0 / (-l + 10000)) - math.log(10000 - minLen)
    return -penalty if l <= minLen else penalty


def test_pagerank(a, b):
    g = {
        "a": {
            "b": 0.7
        },
        "b": {
            "c": 0.1
        },
        "c": {}
    }
    ranked = pagerank(g, a, verbose=True, tolerance=b)
    print(ranked)


def get_all_sheets(tries=0, page=0):
    limit = 1000
    has_more = True
    while has_more:
        try:
            temp_sheets = list(db.sheets.find().skip(page * limit).limit(limit))
        except AutoReconnect as e:
            tries += 1
            if tries >= 200:
                print("Tried: {} times".format(tries))
                raise e
            time.sleep(5)
            continue
        has_more = False
        for s in temp_sheets:
            has_more = True
            yield s
        page += 1


def calculate_sheetrank():
    def count_sources(sources):
        temp_sources_count = 0
        for s in sources:
            if "ref" in s and s["ref"] is not None:
                temp_sources_count += 1
                try:
                    oref = Ref(s["ref"])
                    if oref.is_range():
                        oref = oref.range_list()[0]

                    ref_list = []
                    if oref.is_section_level():
                        ref_list = oref.all_subrefs()
                    elif oref.is_segment_level():
                        ref_list = [oref]
                    else:
                        pass

                    for r in ref_list:
                        sheetrank_dict[r.normal()] += 1
                except InputError:
                    continue
                except TypeError:
                    continue
                except AssertionError:
                    continue
                except AttributeError:
                    continue
                except IndexError:
                    print(s["ref"])
                    continue

            if "subsources" in s:
                temp_sources_count += count_sources(s["subsources"])
        return temp_sources_count

    sheetrank_dict = defaultdict(int)
    len_sheets = db.sheets.find().count()
    sheets = get_all_sheets()
    sources_count = 0
    for i, sheet in enumerate(sheets):
        if i % 1000 == 0:
            print("{}/{}".format(i, len_sheets))
        if "sources" not in sheet:
            continue
        sources_count += count_sources(sheet["sources"])

    return sheetrank_dict
