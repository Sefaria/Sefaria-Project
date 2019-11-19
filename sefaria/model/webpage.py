# coding=utf-8
from urllib.parse import urlparse
import regex as re
from datetime import datetime
from collections import defaultdict

from . import abstract as abst
from . import text
from sefaria.system.database import db

import logging
logger = logging.getLogger(__name__)


class WebPage(abst.AbstractMongoRecord):
    collection = 'webpages'

    required_attrs = [
        "url",
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
        query = {"url": WebPage.normalize_url(url_or_query)} if isinstance(url_or_query, str) else url_or_query
        return super(WebPage, self).load(query)
        
    def _set_derived_attributes(self):
        if getattr(self, "url", None):
            self.domain      = WebPage.domain_for_url(self.url)
            self.favicon     = "https://www.google.com/s2/favicons?domain={}".format(self.domain)
            self._site_data  = WebPage.site_data_for_domain(self.domain)
            self.site_name   = self._site_data["name"] if self._site_data else self.domain
            self.whitelisted = bool(self._site_data)

    def _init_defaults(self):
        self.linkerHits = 0

    def _normalize(self):
        super(WebPage, self)._normalize()
        self.url = WebPage.normalize_url(self.url)
        self.refs = [text.Ref(ref).normal() for ref in self.refs if text.Ref.is_ref(ref)]
        self.refs = list(set(self.refs))

    def _validate(self):
        super(WebPage, self)._validate()

    @staticmethod
    def normalize_url(url):
        rewrite_rules = {
            "use https": lambda url: re.sub(r"^http://", "https://", url),
            "remove hash": lambda url: re.sub(r"#.+", "", url),
            "add www": lambda url: re.sub(r"^(https?://)(?!www\.)", r"\1www.", url),
            "remove www": lambda url: re.sub(r"^(https?://)www\.", r"\1", url),
            "remove mediawiki params": lambda url: re.sub(r"&amp;.+", "", url),
        }
        global_rules = ["remove hash"]
        domain = WebPage.domain_for_url(url)
        site_data = WebPage.site_data_for_domain(domain) or {}
        site_rules = global_rules + site_data.get("normalization_rules", [])
        for rule in site_rules:
            url = rewrite_rules[rule](url)

        return url

    @staticmethod
    def domain_for_url(url):
        return urlparse(url).netloc

    def should_be_excluded(self):
        url_regex = WebPage.excluded_pages_url_regex()
        title_regex = WebPage().excluded_pages_title_regex()
        return bool(re.match(url_regex, self.url) or re.match(title_regex, self.title))

    @staticmethod
    def excluded_pages_url_regex():
        bad_urls = [
            "rabbisacks\.org\/(.+\/)?\?s=",           # Rabbi Sacks search results
            "halachipedia\.com\/index\.php\?search=", # Halachipedia search results
            "halachipedia\.com\/index\.php\?diff=",   # Halachipedia diff pages
        ]
        return "|".join(bad_urls)

    @staticmethod
    def excluded_pages_title_regex():
        bad_titles = [
            "Page \d+ of \d+",  # Rabbi Sacks paged archives
        ]
        return "|".join(bad_titles)

    @staticmethod
    def site_data_for_domain(domain):
        for site in sites_data:
            for site_domain in site["domains"]:
                if domain.endswith(site_domain):
                    return site
        return None

    def update_from_linker(self, updates):
        self.load_from_dict(updates)
        self.linkerHits += 1
        self.lastUpdated = datetime.now()
        self.save()

    @staticmethod
    def add_or_update_from_linker(data):
        webpage = WebPage().load(data["url"]) or WebPage(data)
        if webpage.should_be_excluded():
            return
        webpage.update_from_linker(data)

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
        title = unicode(self.title)
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
        if not webpage.whitelisted:
            continue
        matched_refs = [r for r in webpage.refs if re.match(ref_re, r)]
        for ref in matched_refs:
            webpage_contents = webpage.client_contents()
            webpage_contents["anchorRef"] = ref
            client_results.append(webpage_contents)
    
    return client_results


def test_normalization():
    pages = WebPageSet()
    count = 0
    for page in pages:
        norm = WebPage.normalize_url(page.url)
        if page.url != norm:
            print page.url.encode("utf-8")
            print norm.encode("utf-8")
            print "\n"
            count += 1
    print "{} pages normalized".format(count)


def dedupe_webpages(test=True):
    norm_count = 0
    dedupe_count = 0
    webpages = WebPageSet()
    for webpage in webpages:
        norm = WebPage.normalize_url(webpage.url)
        if webpage.url != norm:
            normpage = WebPage().load(norm)
            if normpage:
                dedupe_count += 1
                if test:
                    print "DEDUPE"
                    print webpage.url.encode("utf-8")
                    print norm.encode("utf-8")
                    print "\n"
                else:
                    normpage.linkerHits += webpage.linkerHits
                    if normpage.lastUpdated < webpage.lastUpdated:
                        normpage.lastUpdated = webpage.lastUpdated
                        normpage.refs = webpage.refs
                    normpage.save()
                    webpage.delete()

            else:
                norm_count += 1
                if test:
                    print "NORM"
                    print webpage.url.encode("utf-8")
                    print norm.encode("utf-8")
                    print "\n"        
                else:
                    webpage.save()
    print "{} pages removed as duplicates".format(dedupe_count)
    print "{} pages normalized".format(norm_count)

    dedupe_identical_urls(test=test)


def dedupe_identical_urls(test=True):
    dupes = db.webpages.aggregate([
        {"$group": {
            "_id": "$url",
            "uniqueIds": {"$addToSet": "$_id"},
            "count": {"$sum": 1}
            }
        },
        {"$match": { 
            "count": {"$gt": 1}
            }
        },
        {"$sort": {
            "count": -1
            }
        }
    ]);

    url_count = 0
    removed_count = 0
    for dupe in dupes:
        url_count += 1
        pages = WebPageSet({"_id": {"$in": dupe["uniqueIds"]}})
        merged_page_data = {
            "url": dupe["_id"], "linkerHits": 0, "lastUpdated": datetime.min
        }
        if test:
            print "\nReplacing: "
        for page in pages:
            if test:
                print page.contents()
            merged_page_data["linkerHits"] += page.linkerHits
            if merged_page_data["lastUpdated"] < page.lastUpdated:
                merged_page_data["refs"]  = page.refs
                merged_page_data["title"] = page.title
                merged_page_data["description"]  = page.description
        
        removed_count += (pages.count() - 1)

        merged_page = WebPage(merged_page_data)
        if test:
            print "with"
            print merged_page.contents()           
        else:
            pages.delete()
            merged_page.save()

    print "\n{} pages with identical urls removed from {} url groups.".format(removed_count, url_count)


def clean_webpages(delete=False):
    """ Delete webpages matching patterns deemed not worth including"""
    pages = WebPageSet({"$or": [
            {"url": {"$regex": WebPage.excluded_pages_url_regex()}}, 
            {"title": {"$regex": WebPage.excluded_pages_title_regex()}}
        ]})

    if delete:
        pages.delete()
        print "Deleted {} pages.".format(pages.count())
    else:
        for page in pages:
            print page.url
        print "\n {} pages would be deleted".format(pages.count())


def webpages_stats():
    webpages = WebPageSet()
    total_pages  = webpages.count()
    total_links  = 0
    sites        = defaultdict(int)
    books        = defaultdict(int)
    categories   = defaultdict(int)
    covered_refs = defaultdict(set)

    for webpage in webpages:
        sites[webpage.domain] += 1
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
        "normalization_rules": ["use https", "remove www"]
    },
    {
        "name":           "Halachipedia",
        "domains":        ["halachipedia.com"],
        "normalization_rules": ["use https", "remove www", "remove mediawiki params"]
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
        "name":    "Amen V'Amen",
        "domains": ["amenvamen.com"],
    },
    {
        "name":    "Rabbi Sharon Sobel",
        "domains": ["rabbisharonsobel.com"],
    },
    {
        "name":    "The Kosher Backpacker",
        "domains": ["thekosherbackpacker.com"]
    },
    {
        "name": "WebYeshiva",
        "domains": ["webyeshiva.org"]
    },
    {
        "name": "Tradition Online",
        "domains": ["traditiononline.org"]
    }

]
