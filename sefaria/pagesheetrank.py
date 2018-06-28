# implementation of pagerank with low ram requirements
#source: http://michaelnielsen.org/blog/using-your-laptop-to-compute-pagerank-for-millions-of-webpages/

import re
import math
import numpy
import random
import json
from collections import defaultdict, OrderedDict
from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from settings import STATICFILES_DIRS

class web:
  def __init__(self,n):
    self.size = n
    self.in_links = {}
    self.number_out_links = {}
    self.dangling_pages = {}
    for j in xrange(n):
      self.in_links[j] = []
      self.number_out_links[j] = 0
      self.dangling_pages[j] = True

def paretosample(n,power=2.0):
  '''Returns a sample from a truncated Pareto distribution
  with probability mass function p(l) proportional to
  1/l^power.  The distribution is truncated at l = n.'''
  m = n+1
  while m > n: m = numpy.random.zipf(power)
  return m

def random_web(n=1000,power=2.0):
  '''Returns a web object with n pages, and where each
  page k is linked to by L_k random other pages.  The L_k
  are independent and identically distributed random
  variables with a shifted and truncated Pareto
  probability mass function p(l) proportional to
  1/(l+1)^power.'''
  g = web(n)
  for k in xrange(n):
    lk = paretosample(n+1,power)-1
    values = random.sample(xrange(n),lk)
    g.in_links[k] = values
    for j in values:
      if g.number_out_links[j] == 0: g.dangling_pages.pop(j)
      g.number_out_links[j] += 1
  return g


def create_empty_nodes(g):
  all_links = set(reduce(lambda a, b: a + b, [v.keys() for v in g.values()], []))
  for l in all_links:
    if l not in g:
      g[l] = {}
  return g


def create_web(g):
  #g = create_empty_nodes(g)
  n = len(g)
  w = web(n)
  node2index = {r:i for i, r in enumerate(g.keys())}
  for i, (r, links) in enumerate(g.items()):
    r_ind = node2index[r]
    link_inds = [(node2index[r_temp], count) for r_temp, count in links.items()]
    w.in_links[r_ind] = reduce(lambda a, b: a + [b[0]]*int(round(b[1])), link_inds, [])
    for j, count in link_inds:
      if w.number_out_links[j] == 0: w.dangling_pages.pop(j)
      w.number_out_links[j] += count
  return w

def step(g,p,s=0.85):
  '''Performs a single step in the PageRank computation,
  with web g and parameter s.  Applies the corresponding M
  matrix to the vector p, and returns the resulting
  vector.'''
  n = g.size
  v = numpy.matrix(numpy.zeros((n,1)))
  inner_product = sum([p[j] for j in g.dangling_pages.keys()])
  for j in xrange(n):
    v[j] = s*sum([p[k]/g.number_out_links[k]
    for k in g.in_links[j]])+s*inner_product/n+(1-s)/n
  # We rescale the return vector, so it remains a
  # probability distribution even with floating point
  # roundoff.
  return v/numpy.sum(v)

def pagerank(g,s=0.85,tolerance=0.00001, maxiter=100, verbose=False):
  w = create_web(g)
  n = w.size
  p = numpy.matrix(numpy.ones((n,1)))/n
  iteration = 1
  change = 2
  while change > tolerance and iteration < maxiter:
    if verbose: print "Iteration: %s" % iteration
    new_p = step(w,p,s)
    change = numpy.sum(numpy.abs(p-new_p))
    if verbose: print "Change in l1 norm: %s" % change
    p = new_p
    iteration += 1
  pr_list = list(numpy.squeeze(numpy.asarray(p)))
  return {k:v for k,v in zip(g.keys(), pr_list)}


def init_pagerank_graph():
    """
    :return: graph which is a double dict. the keys of both dicts are refs. the values are the number of incoming links
    between outer key and inner key
    """
    tanach_indexes = library.get_indexes_in_category("Tanakh")
    def is_tanach(r):
        return r.index.title in tanach_indexes

    def recursively_put_in_graph(ref1, ref2, weight=1.0):
        if ref1.is_section_level():
            seg_refs = ref1.all_segment_refs()
            for ref1_seg in seg_refs:
                recursively_put_in_graph(ref1_seg, ref2, weight / len(seg_refs))
        elif ref2.is_section_level():
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
        #not a typo. add the cat of ref2 to ref1
        all_ref_cat_counts[str1].add(ref2.primary_category())
        all_ref_cat_counts[str2].add(ref1.primary_category())

        if str1 not in graph:
            graph[str1] = {}


        if str2 == str1 or (is_tanach(ref1) and is_tanach(ref2)):
            # self link
            return

        if str2 not in graph[str1]:
            graph[str1][str2] = 0
        graph[str1][str2] += weight

    graph = OrderedDict()
    all_links = LinkSet()  # LinkSet({"type": re.compile(ur"(commentary|quotation)")}).array()
    len_all_links = all_links.count()
    all_ref_cat_counts = {}
    current_link, page, link_limit = 0, 0, 100000
    all_links = LinkSet(limit=link_limit, page=page)


    while len(all_links.array()) > 0:
        for link in all_links:  # raw records avoids caching the entire LinkSet into memory
            if current_link % 1000 == 0:
                print "{}/{}".format(current_link,len_all_links)

            try:
                #TODO pagerank segments except Talmud. Talmud is pageranked by section
                #TODO if you see a section link, add pagerank to all of its segments
                refs = [Ref(r) for r in link.refs]
                tp1 = refs[0].index.best_time_period()
                tp2 = refs[1].index.best_time_period()
                start1 = int(tp1.start) if tp1 else 3000
                start2 = int(tp2.start) if tp2 else 3000

                older_ref, newer_ref = (refs[0], refs[1]) if start1 < start2 else (refs[1], refs[0])

                temp_links = []
                older_ref = older_ref.padded_ref()
                newer_ref = newer_ref.padded_ref()
                recursively_put_in_graph(older_ref, newer_ref)
                if start1 == start2:
                    # also add the opposite link dir
                    recursively_put_in_graph(newer_ref, older_ref)

            except InputError:
                pass
            except TypeError:
                print link.refs
            except IndexError:
                pass
            except AssertionError:
                pass
            current_link += 1

        page += 1
        all_links = LinkSet(limit=link_limit, page=page)

    for ref in all_ref_cat_counts:
        if ref not in graph:
            graph[ref] = {}

    return graph, all_ref_cat_counts

def calculate_pagerank():
    graph, all_ref_cat_counts = init_pagerank_graph()
    #NOTE just a backup in case pagerank fails: json.dump(dict(graph), open("{}pagerank_graph.json".format(STATICFILES_DIRS[0]), "wb"), indent=4)
    ranked = pagerank(graph, 0.85, verbose=True, tolerance=0.00005)
    sorted_ranking = sorted(list(dict(ranked).items()), key=lambda x: x[1])
    count = 0
    smallest_pr = sorted_ranking[0][1]
    while (sorted_ranking[count][1] - smallest_pr) < 1e-30:
        count += 1
    removed_rankings = sorted_ranking[:count]
    sorted_ranking = sorted_ranking[count:]
    print "Removing {} low pageranks".format(count)

    pr_plus_text_len = []
    zero_length = []
    for i, (r, pr) in enumerate(sorted_ranking):
        if i % 100 == 0:
            print "{}/{}".format(i, len(sorted_ranking))
        t = re.sub(ur"[^\u05d0-\u05ea ]", u"", TextChunk(Ref(r), "he").text)
        if len(t) == 0:
            zero_length += [r]
            continue  # we don't need zero length links here
        pr_plus_text_len += [[r, (math.log(pr) + 17) * cat_bonus(len(all_ref_cat_counts.get(r, [])))]]

    pr_plus_text_len.sort(key=lambda x: x[1])
    with open(STATICFILES_DIRS[0] + "pagerank2.json","wb") as fout:
        json.dump(pr_plus_text_len,fout,indent=4)

def cat_bonus(num_cats):
    return 1.0 + (0.04*num_cats)

def length_penalty(l):
    # min of about -4.4
    # penalize segments less than minLen characters
    minLen, maxLen = 10, 1000
    l = l if l <= maxLen else maxLen
    penalty = 1000*math.log(1.0/(-l + 10000))-math.log(10000-minLen)
    return -penalty if l <= minLen else penalty


def test_pagerank(a,b):
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
    print ranked

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
                        graph[r.normal()] += 1
                except InputError:
                    continue
                except TypeError:
                    continue
                except IndexError:
                    print s["ref"]
                    continue

            if "subsources" in s:
                temp_sources_count += count_sources(s["subsources"])
        return temp_sources_count

    graph = defaultdict(int)
    sheets = db.sheets.find()
    total = sheets.count()
    sources_count = 0
    for i, sheet in enumerate(sheets):
        if i % 1000 == 0:
            print "{}/{}".format(i, total)
        if "sources" not in sheet:
            continue
        sources_count += count_sources(sheet["sources"])

    f = open(STATICFILES_DIRS[0] + "sheetrank.json", "wb")
    obj = {r:{"count": v, "prob": 1.0*v/sources_count} for r, v in graph.items()}
    json.dump(obj, f, indent=4)
    f.close()
