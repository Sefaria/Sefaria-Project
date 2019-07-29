# coding=utf-8
import regex
from urlparse import urlparse
from datetime import datetime
from collections import defaultdict

from . import abstract as abst
from . import text

import logging
logger = logging.getLogger(__name__)


class WebPage(abst.AbstractMongoRecord):
    collection = 'webpages'

    required_attrs = [
        "url",       # Only supports https
        "title",
        "refs",
        "lastUpdated",
        "linkerHits",
    ]
    optional_attrs = [
        "description",
        "body",
    ]
    def load(self, url_or_query):
        query = {"url": url_or_query} if isinstance(url_or_query, basestring) else url_or_query
        return super(WebPage, self).load(query)
        
    def _init_defaults(self):
        self.linkerHits = 0

    def _normalize(self):
        super(WebPage, self)._normalize()
        self.refs = [text.Ref(ref).normal() for ref in self.refs if text.Ref.is_ref(ref)]
        self.refs = list(set(self.refs))

    def _validate(self):
        super(WebPage, self)._validate()

    def domain(self):
        return urlparse(self.url).netloc

    def favicon(self):
        return "https://www.google.com/s2/favicons?domain={}".format(self.domain())

    def update_from_linker(self, updates):
        self.load_from_dict(updates)
        self.linkerHits += 1
        self.lastUpdated = datetime.now()
        self.save()

    def contents(self, **kwargs):
        d = super(WebPage, self).contents(**kwargs)
        d["domain"] = self.domain()
        d["faviconUrl"] = self.favicon() 
        return d

    def client_contents(self):
        d = self.contents()
        del d["lastUpdated"]
        return d

class WebPageSet(abst.AbstractMongoSet):
    recordClass = WebPage


def get_webpages_for_ref(tref):
    oref = text.Ref(tref)
    regex_list = oref.regex(as_list=True)
    ref_clauses = [{"refs": {"$regex": r}} for r in regex_list]
    query = {"$or": ref_clauses }
    results = WebPageSet(query=query)
    client_results = []
    ref_re = "("+'|'.join(regex_list)+")"
    for webpage in results:
        matched_refs = [r for r in webpage.refs if regex.match(ref_re, r)]
        for ref in matched_refs:
            webpage_contents = webpage.contents()
            del webpage_contents["lastUpdated"]
            webpage_contents["anchorRef"] = ref
            client_results.append(webpage_contents)
    
    return client_results



def webpages_stats():

    webpages = WebPageSet()
    total_pages  = webpages.count()
    total_links  = 0
    sites        = defaultdict(int)
    books        = defaultdict(int)
    categories   = defaultdict(int)
    covered_refs = defaultdict(set)

    for webpage in webpages:
        sites[webpage.domain()] += 1
        for ref in webpage.refs:
            total_links += 1
            oref = text.Ref(ref)
            books[oref.index.title] += 1
            category = oref.index.get_primary_category()
            category = oref.index.categories[0] + " Commentary" if category == "Commentary" else category
            categories[category] += 1
            [covered_refs[oref.index.title].add(ref.normal()) for ref in oref.all_segment_refs()]

    # Totals
    print "{} total pages.\n".format(total_pages)
    print "{} total connections.\n".format(total_links)


    # Count by Site
    print "\nSITES"
    sites = sorted(sites.iteritems(), key=lambda x: -x[1])
    for site in sites:
        print "{}: {}".format(site[0], site[1])


    # Count / Percentage by Category
    print "\nCATEGORIES"
    categories = sorted(categories.iteritems(), key=lambda x: -x[1])
    for category in categories:
        print "{}: {} ({}%)".format(category[0], category[1], round(category[1]*100.0/total_links, 2))


    # Count / Percentage by Book
    print "\nBOOKS"
    books = sorted(books.iteritems(), key=lambda x: -x[1])
    for book in books:
        print "{}: {} ({}%)".format(book[0], book[1], round(book[1]*100.0/total_links, 2))


    # Coverage Percentage / Average pages per ref for Torah, Tanakh, Mishnah, Talmud
    print "\nCOVERAGE"
    coverage_cats = ["Torah", "Tanakh", "Bavli", "Mishnah"]
    for cat in coverage_cats:
        cat_books = text.library.get_indexes_in_category(cat)
        covered = 0
        total   = 0
        for book in cat_books:
            covered_in_book = covered_refs[book]
            try:
                total_in_book = set([ref.normal() for ref in text.Ref(book).all_segment_refs()])
            except:
                continue # Bad data in Mishnah Sukkah
            
            # print "{} in covered, not in total:".format(book)
            # print list(covered_in_book - total_in_book)
            # Ignore refs that we don't have in the library
            covered_in_book = covered_in_book.intersection(total_in_book)

            covered += len(covered_in_book)
            total += len(total_in_book)

        print "{}: {}%".format(cat, round(covered*100.0/total, 2))

