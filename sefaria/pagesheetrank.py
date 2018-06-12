# implementation of pagerank with low ram requirements
#source: http://michaelnielsen.org/blog/using-your-laptop-to-compute-pagerank-for-millions-of-webpages/

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
    link_inds = [node2index[r_temp] for r_temp in links]
    w.in_links[r_ind] = link_inds
    for j in link_inds:
      if w.number_out_links[j] == 0: w.dangling_pages.pop(j)
      w.number_out_links[j] += 1
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

    def put_link_in_graph(ref1, ref2):
        str1 = ref1.normal()
        str2 = ref2.normal()
        all_ref_strs.add(str1)
        all_ref_strs.add(str2)
        if str1 not in graph:
            graph[str1] = {}


        if str2 == str1 or (is_tanach(ref1) and is_tanach(ref2)):
            # self link
            return

        if str2 not in graph[str1]:
            graph[str1][str2] = 0
        graph[str1][str2] += 1

    graph = OrderedDict()
    all_links = LinkSet()  # LinkSet({"type": re.compile(ur"(commentary|quotation)")}).array()
    len_all_links = all_links.count()
    all_ref_strs = set()
    current_link, page, link_limit = 0, 0, 1000 #100000
    all_links = LinkSet(limit=link_limit, page=page)

    while len(all_links.array()) > 0 and current_link < 1000:
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

                older_ref = older_ref.padded_ref()
                if older_ref.is_range():
                    older_ref = older_ref.range_list()[0]
                older_ref = older_ref.section_ref()

                newer_ref = newer_ref.padded_ref()
                if newer_ref.is_range():
                    newer_ref = newer_ref.range_list()[0]
                newer_ref = newer_ref.section_ref()

                put_link_in_graph(older_ref, newer_ref)


            except InputError:
                pass
            except TypeError:
                print link.refs
            except IndexError:
                pass
            current_link += 1

        page += 1
        all_links = LinkSet(limit=link_limit, page=page)

    for ref in all_ref_strs:
        if ref not in graph:
            graph[ref] = {}

    return graph

def calculate_pagerank():
    graph = init_pagerank_graph()
    #NOTE just a backup in case pagerank fails: json.dump(dict(graph), open("{}pagerank_graph.json".format(STATICFILES_DIRS[0]), "wb"), indent=4)
    ranked = pagerank(graph, 0.9999, verbose=True, tolerance=0.00005)
    f = open(STATICFILES_DIRS[0] + "pagerank.json","wb")
    sorted_ranking = sorted(list(dict(ranked).items()), key=lambda x: x[1])
    json.dump(sorted_ranking,f,indent=4)
    f.close()

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
    for i, sheet in enumerate(sheets[:1000]):
        if i % 1000 == 0:
            print "{}/{}".format(i, total)
        if "sources" not in sheet:
            continue
        sources_count += count_sources(sheet["sources"])

    f = open(STATICFILES_DIRS[0] + "sheetrank.json", "wb")
    obj = {r:{"count": v, "prob": 1.0*v/sources_count} for r, v in graph.items()}
    json.dump(obj, f, indent=4)
    f.close()
