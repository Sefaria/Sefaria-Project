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
        
    def _set_derived_attributes(self):
        self.domain  = urlparse(self.url).netloc
        self.favicon = "https://www.google.com/s2/favicons?domain={}".format(self.domain)
        self._load_site_data()
        self.site_name = self._site_data["name"] if self._site_data else self.domain

    def _init_defaults(self):
        self.linkerHits = 0

    def _normalize(self):
        super(WebPage, self)._normalize()
        self.refs = [text.Ref(ref).normal() for ref in self.refs if text.Ref.is_ref(ref)]
        self.refs = list(set(self.refs))

    def _validate(self):
        super(WebPage, self)._validate()

    def update_from_linker(self, updates):
        self.load_from_dict(updates)
        self.linkerHits += 1
        self.lastUpdated = datetime.now()
        self.save()

    def _load_site_data(self):
        self._site_data = None
        for site in sites_data:
            for domain in site["domains"]:
                if self.domain.endswith(domain):
                    self._site_data = site
                    return

    def client_contents(self):
        d = self.contents()
        d["domain"]     = self.domain
        d["siteName"]   = self.site_name
        d["faviconUrl"] = self.favicon 
        del d["lastUpdated"]
        d = self.clean_client_contents(d)
        return d

    def clean_client_contents(self, d):
        d["title"]       = self.clean_title()
        d["description"] = self.clean_description()
        return d

    def clean_title(self):
        if not self._site_data:
            return self.title
        title = self.title
        title = title.replace("&amp;", "&")
        brands = [self.site_name] + self._site_data.get("title_branding", [])
        separators = [u"-", u"|", u"—", u"»"]
        for separator in separators:
            for brand in brands:
                if self._site_data.get("initial_title_branding", False):
                    brand_str = u"{} {} ".format(brand, separator)
                    if title.startswith(brand_str):
                        title = title[len(brand_str):]                   
                else:    
                    brand_str = u" {} {}".format(separator, brand)
                    if title.endswith(brand_str):
                        title = title[:-len(brand_str)]

        return title if len(title) else self._site_data["name"]

    def clean_description(self):
        description = self.description
        for uhoh_string in ["*/", "*******"]:
            if description.find(uhoh_string) != -1:
                return None
        description = description.replace("&amp;", "&")
        description = description.replace("&nbsp;", " ")


        return description


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
            webpage_contents = webpage.client_contents()
            if webpage_contents["domain"] in sites_blacklist:
                continue
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


def clean_webpages(delete=False):
    bad_urls = [
        "rabbisacks\.org\/.+\/\?s=",                # Rabbi Sacks search results
        "halachipedia\.com\/index\.php\?search=",   # Halachipedia search results
    ]

    bad_titles = [
        "Page \d+ of \d+",  # Rabbi Sacks paged archives
    ]

    pages = WebPageSet({"$or": [
            {"url": {"$regex": ("|").join(bad_urls)}}, 
            {"title": {"$regex": ("|").join(bad_titles)}}
        ]})

    if delete:
        pages.delete()
        print "Deleted {} pages.".format(pages.count())
    else:
        for page in pages:
            print page.url
        print "\n {} pages would be deleted".format(pages.count())


sites_data = [
    {   
        "name":           "My Jewish Learning",
        "domains":        ["myjewishlearning.com"],
    },
    {
        "name":           "Virtual Beit Midrash",
        "domains":        ["etzion.org.il", "vbm-torah.org"],
        "title_branding": ["vbm haretzion"],
    },
    {
        "name":           "Rabbi Sacks",
        "domains":        ["rabbisacks.org"],
    },
    {
        "name":           "Halachipedia",
        "domains":        ["halachipedia.com"],
    },
    {
        "name":           "Torah In Motion",
        "domains":        ["torahinmotion.org"],
    },
    {
        "name":           "The Open Siddur Project",
        "domains":        ["opensiddur.org"],
    },
    {
        "name":           u"בית הלל",
        "domains":        ["beithillel.org.il"],
        "title_branding": [u"בית הלל - הנהגה תורנית קשובה"]
    },
    {
        "name":                   "ParshaNut",
        "domains":                ["parshanut.com"],
        "title_branding":         ["PARSHANUT"],
        "initial_title_branding": True,
    },
    {
        "name":            "Real Clear Daf",
        "domains":         ["realcleardaf.com"],
    },
    {
        "name":           "NACH NOOK",
        "domains":        ["nachnook.com"],
    },
    {
        "name":           "Congregation Beth Jacob, Redwood City",
        "domains":        ["bethjacobrwc.org"],
        "title_branding": ["CBJ"]
    },
    {
        "name":    "Amen V’Amen",
        "domains": ["amenvamen.com"],
    },
    {
        "name":    "Rabbi Sharon Sobel",
        "domains": ["rabbisharonsobel.com"],
    },
    {
        "name":    "The Kosher Backpacker",
        "domains": ["thekosherbackpacker.com"]
    }

]
sites_blacklist = ["dailympails.gq", "192.116.49.119", "webcache.googleusercontent.com", "www.google.com"]


"""
chinuch.org.uk: 3
shamar.org: 2
cncc.bingj.com: 1
www.kveller.com: 1
www.torahmusings.com: 1
www.shamar.org: 1
www.mechon-mamre.org: 1
www.ou.org: 1
www.chabad.org: 1
he.wikisource.org: 1
blogs.timesofisrael.com: 1
www.meshivat-nefesh.org.il: 1
"""
