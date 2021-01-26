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
        "expandedRefs",
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
        self.expandedRefs = text.Ref.expand_refs(self.refs)

    def _validate(self):
        super(WebPage, self)._validate()

    @staticmethod
    def normalize_url(url):
        rewrite_rules = {
            "use https": lambda url: re.sub(r"^http://", "https://", url),
            "remove hash": lambda url: re.sub(r"#.+", "", url),
            "remove url params": lambda url: re.sub(r"\?.+", "", url),
            "remove utm params": lambda url: re.sub(r"\?utm_.+", "", url),
            "remove fbclid param": lambda url: re.sub(r"\?fbclid=.+", "", url),
            "add www": lambda url: re.sub(r"^(https?://)(?!www\.)", r"\1www.", url),
            "remove www": lambda url: re.sub(r"^(https?://)www\.", r"\1", url),
            "remove mediawiki params": lambda url: re.sub(r"&amp;.+", "", url),
            "remove sort param": lambda url: re.sub(r"\?sort=.+", "", url),
        }
        global_rules = ["remove hash", "remove utm params", "remove fbclid param"]
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
        """ Returns true if this webpage should not be included in our index
        because it matches a title/url we want to exclude or has no refs"""
        if len(self.refs) == 0:
            return True
        url_regex = WebPage.excluded_pages_url_regex()
        title_regex = WebPage.excluded_pages_title_regex()
        return bool(re.search(url_regex, self.url) or re.search(title_regex, self.title))

    @staticmethod
    def excluded_pages_url_regex():
        bad_urls = [
            r"rabbisacks\.org\/(.+\/)?\?s=",           # Rabbi Sacks search results
            r"halachipedia\.com\/index\.php\?search=", # Halachipedia search results
            r"halachipedia\.com\/index\.php\?diff=",   # Halachipedia diff pages
            r"myjewishlearning\.com\/\?post_type=evergreen", # These urls end up not working
            r"judaism\.codidact\.com\/.+\/edit",
            r"judaism\.codidact\.com\/.+\/history",
            r"judaism\.codidact\.com\/.+\/suggested-edit\/",
            r"judaism\.codidact\.com\/.+\/posts\/new\/",
            r"judaism\.codidact\.com\/questions\/d+",  # these pages redirect to /posts
            r"judaism\.codidact\.com\/users\/",
            r"jewishexponent\.com\/page\/\d",
            r"hebrewcollege\.edu\/blog\/(author\|category\|tag)\/",  # these function like indices of articles
            r"roshyeshivamaharat.org\/(author\|category\|tag)\/",
            r"lilith\.org\/\?gl=1\&s=",                  # Lilith Magazine search results
            r"lilith\.org\/(tag\|author\|category)\/",
            r"https://torah\.org$",
            r"test\.hadran\.org\.il",
            r"www\.jtsa.edu\/search\/index\.php",
            r"jewschool\.com\/page\/",
            r"truah\.org\/\?s=",
            r"truah\.org\/(holiday|page|resource-types)\/",
            r"clevelandjewishnews\.com$",
            r"clevelandjewishnews\.cpm\/news\/",
            r"ots\.org\.il\/news\/",
            r"ots\.org\.il\/.+\/page\/\d+\/",
            r"ots\.org\.il\/tag\/.+",
            r"traditiononline\.org\/page\/\d+\/",
            r"toravoda\.org\.il\/%D7%90%D7%99%D7%A8%D7%95%D7%A2%D7%99%D7%9D-%D7%97%D7%9C%D7%95%D7%A4%D7%99\/",  # Neemanei Torah Vavoda list of past events
            r"929.org.il\/(lang\/en\/)?author/\d+$",  # Author index pages
            r"rabbijohnnysolomon.com$",
            r"rabbijohnnysolomon.com/shiurim/$",
            r"rabbijohnnysolomon.com/shiurim/parasha/$",
            r"rabbijohnnysolomon.com/shiurim/halacha/$",
            r"webcache\.googleusercontent\.com",
            r"translate\.googleusercontent\.com",
            r"dailympails\.gq\/",
            r"http:\/\/:localhost(:\d+)?",
            r"jewfaq\.org\/search\.shtml", # Judaism 101, Search the Glossary and Index
            r"avodah\.net\/(blog|category|tag)/",
            r"hebrewcollege\.edu\/blog\/(author|tag)\/",
            r"jewishideas\.org\/search\/",
            r"jewishideas\.org\/articles\/",  # it seems you can write anything after articles/ and it leads to the same page?
            r"jwa\.org\/encyclopedia\/author\/",  # tends to have articles by author that have snippets from article
            r"jwa\.org\/encyclopedia\/content\/",
            r"library\.yctorah\.org\/series\/",
            r"reconstructingjudaism\.org\/taxonomy\/",
            r"reconstructingjudaism\.org\/search\/",
            r"askhalacha\.com\/?$",
            r"askhalacha\.com\/qas\/?$",
        ]
        return "({})".format("|".join(bad_urls))

    @staticmethod
    def excluded_pages_title_regex():
        bad_titles = [
            r"Page \d+ of \d+",  # Rabbi Sacks paged archives
            r"^Page not found$",   # JTS 404 pages include links to content
            r"^JTS Torah Online$"  # JTS search result pages
        ]
        return "({})".format("|".join(bad_titles))

    @staticmethod
    def site_data_for_domain(domain):
        for site in sites_data:
            for site_domain in site["domains"]:
                if site_domain == domain or domain.endswith("." + site_domain):
                    return site
        return None

    def update_from_linker(self, updates):
        self.load_from_dict(updates)
        self.linkerHits += 1
        self.lastUpdated = datetime.now()
        self.save()

    @staticmethod
    def add_or_update_from_linker(data):
        """Adds an entry for the WebPage represented by `data` or updates an existing entry with the same normalized URL
        Returns True is data was saved, False if data was determined to be exluded"""
        data["url"] = WebPage.normalize_url(data["url"])
        webpage = WebPage().load(data["url"])
        if webpage:
            existing = True
        else:
            webpage = WebPage(data)
            existing = False
        webpage._normalize() # to remove bad refs, so pages with empty ref list aren't saved
        if webpage.should_be_excluded():
            if existing:
                webpage.delete()
            return "excluded"
        webpage.update_from_linker(data)
        return "saved"

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
        title = str(self.title)
        title = title.replace("&amp;", "&")
        brands = [self.site_name] + self._site_data.get("title_branding", [])
        separators = ["-", "|", "—", "»", "•"]
        for separator in separators:
            for brand in brands:
                if self._site_data.get("initial_title_branding", False):
                    brand_str = "{} {} ".format(brand, separator)
                    if title.startswith(brand_str):
                        title = title[len(brand_str):]
                else:
                    brand_str = " {} {}".format(separator, brand)
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
    from pymongo.errors import OperationFailure
    oref = text.Ref(tref)
    segment_refs = [r.normal() for r in oref.all_segment_refs()]
    results = WebPageSet(query={"expandedRefs": {"$in": segment_refs}}, hint="expandedRefs_1", sort=None)
    try:
        results = results.array()
    except OperationFailure as e:
        # If documents are too large or there are too many results, fail gracefully
        logger.warn(f"WebPageSet for ref {tref} failed due to Error: {repr(e)}")
        return []
    client_results = []
    for webpage in results:
        if not webpage.whitelisted:
            continue
        anchor_ref_list, anchor_ref_expanded_list = oref.get_all_anchor_refs(segment_refs, webpage.refs, webpage.expandedRefs)
        for anchor_ref, anchor_ref_expanded in zip(anchor_ref_list, anchor_ref_expanded_list):
            webpage_contents = webpage.client_contents()
            webpage_contents["anchorRef"] = anchor_ref.normal()
            webpage_contents["anchorRefExpanded"] = [r.normal() for r in anchor_ref_expanded]
            client_results.append(webpage_contents)

    return client_results


def test_normalization():
    pages = WebPageSet()
    count = 0
    for page in pages:
        norm = WebPage.normalize_url(page.url)
        if page.url != norm:
            print(page.url.encode("utf-8"))
            print(norm.encode("utf-8"))
            print("\n")
            count += 1

    print("{} pages normalized".format(count))


def dedupe_webpages(test=True):
    """Normalizes URLs of all webpages and deletes multiple entries that normalize to the same URL"""
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
                    print("DEDUPE")
                    print(webpage.url.encode("utf-8"))
                    print(norm.encode("utf-8"))
                    print("\n")
                else:
                    normpage.linkerHits += webpage.linkerHits
                    if normpage.lastUpdated < webpage.lastUpdated:
                        normpage.lastUpdated = webpage.lastUpdated
                        normpage.refs = webpage.refs
                        normpage.expandedRefs = text.Ref.expand_refs(webpage.refs)
                    normpage.save()
                    webpage.delete()

            else:
                norm_count += 1
                if test:
                    print("NORM")
                    print(webpage.url.encode("utf-8"))
                    print(norm.encode("utf-8"))
                    print("\n")
                else:
                    webpage.save()
    print("{} pages removed as duplicates".format(dedupe_count))
    print("{} pages normalized".format(norm_count))

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
            print("\nReplacing: ")
        for page in pages:
            if test:
                print(page.contents())
            merged_page_data["linkerHits"] += page.linkerHits
            if merged_page_data["lastUpdated"] < page.lastUpdated:
                merged_page_data.update({
                    "refs": page.refs,
                    "expandedRefs": text.Ref.expand_refs(page.refs),
                    "title": page.title,
                    "description": page.description
                })
        removed_count += (pages.count() - 1)

        merged_page = WebPage(merged_page_data)
        if test:
            print("with")
            print(merged_page.contents())
        else:
            pages.delete()
            merged_page.save()

    print("\n{} pages with identical urls removed from {} url groups.".format(removed_count, url_count))


def clean_webpages(test=True):
    """ Delete webpages matching patterns deemed not worth including"""
    pages = WebPageSet({"$or": [
            {"url": {"$regex": WebPage.excluded_pages_url_regex()}},
            {"title": {"$regex": WebPage.excluded_pages_title_regex()}},
            {"refs": {"$eq": []}}
        ]})

    if not test:
        pages.delete()
        print("Deleted {} pages.".format(pages.count()))
    else:
        for page in pages:
            print(page.url)
        print("\n {} pages would be deleted".format(pages.count()))


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
    print("{} total pages.\n".format(total_pages))
    print("{} total connections.\n".format(total_links))

    # Count by Site
    print("\nSITES")
    sites = sorted(sites.items(), key=lambda x: -x[1])
    for site in sites:
        print("{}: {}".format(site[0], site[1]))

    # Count / Percentage by Category
    print("\nCATEGORIES")
    categories = sorted(categories.items(), key=lambda x: -x[1])
    for category in categories:
        print("{}: {} ({}%)".format(category[0], category[1], round(category[1] * 100.0 / total_links, 2)))

    # Count / Percentage by Book
    print("\nBOOKS")
    books = sorted(books.items(), key=lambda x: -x[1])
    for book in books:
        print("{}: {} ({}%)".format(book[0], book[1], round(book[1] * 100.0 / total_links, 2)))

    # Coverage Percentage / Average pages per ref for Torah, Tanakh, Mishnah, Talmud
    print("\nCOVERAGE")
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

        print("{}: {}%".format(cat, round(covered * 100.0 / total, 2)))

"""
Web Pages Whitelist
*******************
Web pages are visible to users on the site only after being whitelisted by adding an 
entry to the `sites_data` list below. Entries have the following fields:

- `name`: required, string - the name of overall website, how pages are displayed 
    and grouped in the sidebar.
- `domains`: required, list of strings - all the domains that are part of this website. 
    Root domains will match any subdomain.
- `title_branding`: optional, list of strings - branding words which are appended to 
    every page title which should be removed when displayed to the user. The site name 
    is used by default, additional phrases here will also be removed for display when 
    they follow any of the separators (like " | ") listed in WebPage.clean_title().
- `initial_title_branding`: optional, boolean - if True, also remove title branding from
    the beginning of the title as well as the end. 
- `normalization_rules`: optional, list of strings - which URL rewrite rules to apply to
    URLs from this site, for example to rewrite `http` to `https` or remove specific URL
    params. Rewrite rules are named and defined in WebPage.normalize_url().

To add a site to the whitelist:
1. Add an entry with name and domains.
2. Examine titles of data collected to determine if additional `title_branding` entries
    are needed, or if `initial_title_branding` should be True.
3. Examine data to find patterns of URLs that should be excluded. These include things like
    search result pages, 404 pages, index pages that include snippets text from full 
    articles (like author or tag pages), or anything else that may be irrelevant. Add  to 
    regexs either WebPage.excluded_pages_url_regex() or WebPage.excluded_pages_title_regex()
4. After deploying code updates, you may need to clean up bad that had already been 
    collected in the database. If you've added normalization rules, run dedupe_webpages()
    to remove records that we now know should be excluded. If you've adding exclusion rules
    run clean_webpages() to remove records that we now know we want to exclude.

"""
sites_data = [
    {
        "name":           "My Jewish Learning",
        "domains":        ["myjewishlearning.com"],
        "normalization_rules": ["use https"]
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
        "normalization_rules": ["use https", "remove www", "remove mediawiki params"],
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
        "name":           "בית הלל",
        "domains":        ["beithillel.org.il"],
        "title_branding": ["בית הלל - הנהגה תורנית קשובה"]
    },
    {
        "name":                   "ParshaNut",
        "domains":                ["parshanut.com"],
        "title_branding":         ["PARSHANUT"],
        "initial_title_branding": True,
        "normalization_rules":    ["use https"],
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
        "domains": ["traditiononline.org"],
        "normalization_rules": ["remove mediawiki params"]
    },
    {
        "name": "Partners in Torah",
        "domains": ["partnersintorah.org"]
    },
    {
        "name": "The Lehrhaus",
        "domains": ["thelehrhaus.com"]
    },
    {
        "name": "סִינַי",
        "domains": ["sinai.org.il"],
        "title_branding": ["הדף היומי ב15 דקות - שיעורי דף יומי קצרים בגמרא"]
    },
    {
        "name": 'אתר לבנ"ה - קרן תל"י',
        "domains": ["levana.org.il"],
        "title_branding": ["אתר לבנה מבית קרן תל&#039;&#039;י", "אתר לבנה מבית קרן תל''י"]  # not sure how HTML escape characters are handled. Including both options.
    },
    {
        "name": 'Judaism Codidact',
        "domains": ["judaism.codidact.com"],
        "title_branding": ["Judaism"],
        "initial_title_branding": True,
        "normalization_rules": ["remove sort param"],
    },
    {
        "name": "The Jewish Theological Seminary",
        "domains": ["jtsa.edu"],
        "normalization_rules": ["remove url params"],
    },
    {
        "name": "Ritualwell",
        "domains": ["ritualwell.org"],
        "normalization_rules": ["remove www"],
    },
    {
        "name": "Jewish Exponent",
        "domains": ["jewishexponent.com"]
    },
    {
        "name": "The 5 Towns Jewish Times",
        "domains": ["5tjt.com"]
    },
    {
        "name": "Hebrew College",
        "domains": ["hebrewcollege.edu"]
    },
    {
        "name": "מכון הדר",
        "domains": ["mechonhadar.org.il"]
    },
    {
        "name": "Pardes Institute of Jewish Studies",
        "domains": ["pardes.org"],
        "title_branding": ["Elmad Online Learning Torah Podcasts, Online Jewish Learning"]
    },
    {
        "name": "Yeshivat Chovevei Torah",
        "domains": ["yctorah.org"],
        "title_branding": ["Torah Library of Yeshivat Chovevei Torah"]
    },
    {
        "name": "Rabbi Jeff Fox (Rosh ha-Yeshiva, Yeshivat Maharat)",
        "domains": ["roshyeshivatmaharat.org"],
        "title_branding": ["Rosh Yeshiva Maharat"]
    },
    {
        "name": "Cleveland Jewish News",
        "domains": ["clevelandjewishnews.com"],
        "title_branding": ["clevelandjewishnews.com"]
    },
    {
        "name": "Rabbi Noah Farkas",
        "domains": ["noahfarkas.com"],
        "title_branding": ["Rabbi Noah farkas"]
    },
    {
        "name": "Reconstructing Judaism",
        "domains": ["reconstructingjudaism.org"],
    },
    {
        "name": "The Institute for Jewish Ideas and Ideals",
        "domains": ["jewishideas.org"],
        "title_branding": ["jewishideas.org"]
    },
    {
        "name": "The Jewish Virtual Library",
        "domains": ["jewishvirtuallibrary.org"],
        "normalization_rules": ["use https", "remove url params"],
    },
    {
        "name": "Lilith Magazine",
        "domains": ["lilith.org"],
    },
    {
        "name": "Torah.org",
        "domains": ["torah.org"],
    },
    {
        "name": "Sinai and Synapses",
        "domains": ["sinaiandsynapses.org"],
    },
    {
        "name": "Times of Israel Blogs",
        "domains": ["blogs.timesofisrael.com"],
        "title_branding": ["The Blogs"]
    },
    {
        "name": "The Jewish Standard",
        "domains": ["jewishstandard.timesofisrael.com"],
    },
    {
        "name": "Rav Kook Torah",
        "domains": ["ravkooktorah.org"],
        "normalization_rules": ["remove www"]
    },
    {
        "name": "YUTorah Online",
        "domains": ["yutorah.org"],
        "initial_title_branding": True,
    },
    {
        "name": "Hadran",
        "domains": ["hadran.org.il"],
    },
    {
        "name": "Julian Ungar-Sargon",
        "domains": ["jyungar.com"],
    },
    {
        "name": "Aish HaTorah",
        "domains": ["aish.com"],
    },
    {
        "name": "Jewschool",
        "domains": ["jewschool.com"],
    },
    {
        "name": "T'ruah",
        "domains": ["truah.org"],
    },
    # Keeping off for now while we try to resolve empty titles from dynamic pages.
    # {
    #     "name": "929",
    #     "domains": ["929.org.il"],
    #     "title_branding": ["929 – תנך ביחד", "Tanakh - Age Old Text, New Perspectives"]
    #     "initial_title_branding": True
    # },
    {
        "name": "נאמני תורה ועבודה",
        "domains": ["toravoda.org.il"],
    },
    {
        "name": "Ohr Torah Stone",
        "domains": ["ots.org.il"],
        "title_branding": ["אור תורה סטון"]
    },
    {
        "name": "Jewish Action",
        "domains": ["jewishaction.com"],
    },
    {
        "name": "Rabbi Johnny Solomon",
        "domains": ["rabbijohnnysolomon.com"],
    },
    {
        "name": "Moment Magazine",
        "domains": ["momentmag.com"],
    },
    {
        "name": "Jewish Action",
        "domains": ["jewishaction.com"],
    },
    {
        "name": "Orthodox Union (OU Torah)",
        "domains": ["ou.org"],
        "title_branding": ["Jewish Holidays", "OU Holidays", "OU", "OU Torah", "OU Life"],
    },
    {
        "name": "Judaism 101 (JewFAQ)",
        "domains": ["jewfaq.org"],
        "title_branding": ["Judaism 101:"],
        "initial_title_branding": True,
        "normalization_rules": ["remove url params", "remove www"],
    },
    {
        "name": "Jewish Women's Archive",
        "domains": ["jwa.org"],
    },
    {
        "name": "The Wexner Foundation",
        "domains": ["wexnerfoundation.org"],
    },
    {
        "name": "Jewish Drinking",
        "domains": ["jewishdrinking.com"],
    },
    {
        "name": "Avodah",
        "domains": ["avodah.net"],
    },
    {
        "name": "TorahWeb.org",
        "domains": ["torahweb.org"],
    },
    {
        "name": "AskHalacha",
        "domains": ["askhalacha.com"],
    },
]