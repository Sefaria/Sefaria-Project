# coding=utf-8
from urllib.parse import urlparse
import regex as re
from collections import defaultdict
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from . import abstract as abst
from . import text
from sefaria.system.database import db
from sefaria.system.cache import in_memory_cache
import bleach
import structlog
logger = structlog.get_logger(__name__)
from collections import Counter
from sefaria.utils.calendars import daf_yomi, parashat_hashavua_and_haftara
from sefaria.utils.util import truncate_string
from datetime import datetime, timedelta
from sefaria.system.exceptions import InputError
from tqdm import tqdm
from sefaria.model import *


class WebPage(abst.AbstractMongoRecord):
    collection = 'webpages'

    required_attrs = [
        "url",
        "title",
        "refs",
        "lastUpdated",
    ]
    optional_attrs = [
        "description",
        "expandedRefs",
        "body",
        "linkerHits",
        'authors',
        'articleSource',
        'type'
    ]

    def load(self, url_or_query):
        query = {"url": WebPage.normalize_url(url_or_query)} if isinstance(url_or_query, str) else url_or_query
        return super(WebPage, self).load(query)

    def _set_derived_attributes(self):
        if getattr(self, "url", None):
            self.domain      = WebPage.domain_for_url(self.url)
            self._site_data  = WebPage.site_data_for_domain(self.domain)
            self.site_name   = self._site_data["name"] if self._site_data else self.domain
            self.favicon = f"https://www.google.com/s2/favicons?domain={self._site_data['domains'][0]}" if self._site_data else None
            self.whitelisted = self._site_data["is_whitelisted"] if self._site_data else False

    def _init_defaults(self):
        self.linkerHits = 0
        self.lastUpdated = datetime.now()

    def _normalize_data_sent_from_linker(self):
        self.url = self.normalize_url(self.url)
        self.refs = self._normalize_refs(getattr(self, "refs", []))
        self.title = self.clean_title(getattr(self, "title", ""), getattr(self, "_site_data", {}), getattr(self, "site_name", ""))
        self.description = self.clean_description(getattr(self, "description", ""))

    @staticmethod
    def _normalize_refs(refs):
        refs = {text.Ref(ref).normal() for ref in refs if text.Ref.is_ref(ref)}
        return list(refs)

    def _normalize(self):
        super(WebPage, self)._normalize()
        self._normalize_data_sent_from_linker()
        self.expandedRefs = text.Ref.expand_refs(self.refs)

    def _validate(self):
        validator = URLValidator()
        validator(self.url)
        if hasattr(self, 'type'):
            assert self.type == 'article', "WebPage's type can be 'article' or not exist"
        else:
            assert not hasattr(self, 'articleSource'), "only WebPage of type 'article' can have 'articleSource' attribute"
        articleSource = getattr(self, 'articleSource', None)
        if articleSource:
            assert 'title' in articleSource, "articleSource of WebPage should have title"
            assert all(key in ['title', 'related_parts'] for key in articleSource), "articleSource of WebPage can have only the keys 'title' and 'related_parts'"
        super(WebPage, self)._validate()

    def _sanitize(self):
        all_attrs = self.required_attrs + self.optional_attrs
        for attr in all_attrs:
            if attr == 'url':
                continue
            val = getattr(self, attr, None)
            if isinstance(val, str):
                setattr(self, attr, bleach.clean(val, tags=self.ALLOWED_TAGS, attributes=self.ALLOWED_ATTRS))

    def get_website(self, dict_only=False):
        # returns the corresponding WebSite.  If dict_only is True, grabs the dictionary of the WebSite from cache
        domain = WebPage.domain_for_url(WebPage.normalize_url(self.url))
        if dict_only is False:
            return WebSite().load({"domains": domain})
        else:
            sites = get_website_cache()
            for site in sites:
                if domain in site["domains"]:
                    return site
            return {}

    @staticmethod
    def normalize_url(url):
        rewrite_rules = {
            "use https": lambda url: re.sub(r"^http://", "https://", url),
            "remove hash": lambda url: re.sub(r"#.*", "", url),
            "remove url params": lambda url: re.sub(r"\?.+", "", url),
            "remove utm params": lambda url: re.sub(r"\?utm_.+", "", url),
            "remove fbclid param": lambda url: re.sub(r"\?fbclid=.+", "", url),
            "remove www": lambda url: re.sub(r"^(https?://)www\.", r"\1", url),
            "remove mediawiki params": lambda url: re.sub(r"&amp;.+", "", url),
            "remove sort param": lambda url: re.sub(r"\?sort=.+", "", url),
            "remove all params after id": lambda url: re.sub(r"(\?id=\d+).+$", r"\1", url)
        }
        global_rules = ["remove hash", "remove utm params", "remove fbclid param", "remove www", "use https"]
        domain = WebPage.domain_for_url(url)
        site_rules = global_rules
        site_data = WebPage.site_data_for_domain(domain)
        if site_data and site_data["is_whitelisted"]:
            site_rules += [x for x in site_data.get("normalization_rules", []) if x not in global_rules]
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
        bleached_url = bleach.clean(self.url.encode('utf-8'), tags=self.ALLOWED_TAGS, attributes=self.ALLOWED_ATTRS)
        if len(bleached_url) > 1000:
            # url field is indexed. Mongo doesn't allow indexing a field over 1000 bytes
            from sefaria.system.database import db
            db.webpages_long_urls.insert_one(self.contents())
            return True
        url_regex = WebPage.excluded_pages_url_regex(self.domain)
        url_match = re.search(url_regex, self.url) if url_regex is not None else False
        #url_regex is None when bad_urls is empty, so we should not exclude this domain
        title_regex = WebPage.excluded_pages_title_regex()
        return bool(url_match) or re.search(title_regex, self.title)

    def delete_if_should_be_excluded(self):
        if not self.should_be_excluded():
            return False
        if not self.is_new():
            self.delete()
        return True

    def add_hit(self):
        self.linkerHits += 1
        self.lastUpdated = datetime.now()

    @staticmethod
    def excluded_pages_url_regex(looking_for_domain=None):
        bad_urls = []
        sites = get_website_cache()
        for site in sites:
            if looking_for_domain is None or looking_for_domain in site["domains"]:
                bad_urls += site.get("bad_urls", [])
                for domain_in_site in site["domains"]:
                    if site["is_whitelisted"]:
                        bad_urls += [re.escape(domain_in_site)+"/search.*?$"]

        if len(bad_urls) == 0:
            return None
        else:
            return "({})".format("|".join(bad_urls))

    @staticmethod
    def excluded_pages_title_regex():
        bad_titles = [
            r"Page \d+ of \d+",  # Rabbi Sacks paged archives
            r"Page [nN]ot [fF]ound$",  # 404 pages include links to content
            r"^JTS Torah Online$"  # JTS search result pages
        ]
        return "({})".format("|".join(bad_titles))

    @staticmethod
    def site_data_for_domain(domain):
        sites = get_website_cache()
        for site in sites:
            for site_domain in site["domains"]:
                if site_domain == domain or domain.endswith("." + site_domain):
                    return site
        return None

    @staticmethod
    def add_or_update_from_linker(webpage_contents: dict, add_hit=True):
        """
        Adds an entry for the WebPage represented by `data` or updates an existing entry with the same normalized URL
        Returns True is data was saved, False if data was determined to be excluded

        @param webpage_contents: a dict representing the contents of a `WebPage`
        @param add_hit: True if you want to add hit to webpage in webpages collection
        """
        temp_webpage = WebPage(webpage_contents)
        temp_webpage._normalize_data_sent_from_linker()
        webpage = WebPage().load(temp_webpage.url)
        if webpage:
            if temp_webpage.title == webpage.title and temp_webpage.description == getattr(webpage, "description", "") and set(webpage_contents["refs"]) == set(webpage.refs):
                return "excluded", webpage  # no new data
            contents_to_overwrite = {
                "url": temp_webpage.url,
                "title": temp_webpage.title or webpage.title,
                "refs": temp_webpage.refs,
                "description": temp_webpage.description,
            }
            webpage.load_from_dict(contents_to_overwrite)
        else:
            webpage = temp_webpage

        if webpage.delete_if_should_be_excluded():
            return "excluded", None

        if add_hit:
            webpage.add_hit()
        try:
            webpage.save()
        except ValidationError:
            # something is wrong with the webpage URL
            return "excluded", None
        return "saved", webpage

    def client_contents(self):
        d = self.contents()
        d["domain"]     = self.domain
        d["siteName"]   = self.site_name
        d["favicon"] = self.favicon
        d['authors'] = getattr(self, 'authors', None)
        d['articleSource'] = getattr(self, 'articleSource', None)
        del d["lastUpdated"]
        d = self.clean_client_contents(d)
        return d

    @staticmethod
    def clean_client_contents(d):
        d["title"]       = WebPage.clean_title(d["title"], d.get("_site_data", {}), d.get("site_name", ""))
        d["description"] = WebPage.clean_description(d.get("description", ""))
        return d

    @staticmethod
    def clean_title(title, site_data, site_name):
        if site_data == {} or site_data is None:
            return title
        title = str(title)
        title = title.replace("&amp;", "&")
        brands = [site_name] + site_data.get("title_branding", [])
        separators = [("-", ' '), ("|", ' '), ("—", ' '), ("–", ' '), ("»", ' '), ("•", ' '), (":", ''), ("⋆", ' ')]
        for separator, padding in separators:
            for brand in brands:
                if site_data.get("initial_title_branding", False):
                    brand_str = f"{brand}{padding}{separator} "
                    if title.startswith(brand_str):
                        title = title[len(brand_str):]
                else:
                    brand_str = f" {separator}{padding}{brand}"
                    if title.endswith(brand_str):
                        title = title[:-len(brand_str)]

        return title

    @staticmethod
    def clean_description(description):
        if description is None:
            return ""
        for uhoh_string in ["*/", "*******"]:
            if description.find(uhoh_string) != -1:
                return None
        description = description.replace("&amp;", "&")
        description = description.replace("&nbsp;", " ")
        return truncate_string(description, 150, 170)


class WebPageSet(abst.AbstractMongoSet):
    recordClass = WebPage


class WebSite(abst.AbstractMongoRecord):
    collection = 'websites'

    required_attrs = [
        "name",
        "domains",
        "is_whitelisted"
    ]
    optional_attrs = [
        "bad_urls",
        "normalization_rules",
        "title_branding",
        "initial_title_branding",
        "linker_installed",
        "num_webpages",
        "exclude_from_tracking",
        "whitelist_selectors",
        'lastUpdated',
    ]

    def __key(self):
        return (self.name, self.domains[0])

    def __hash__(self):
        return hash(self.__key())

    def __eq__(self, other):
        if isinstance(other, WebSite):
            return self.__key() == other.__key()
        return NotImplemented

    def get_num_webpages(self):
        if getattr(self, 'num_webpages', None) is None:
            self.num_webpages = WebPageSet({"url": {"$regex": "|".join(self.domains)}}).count()
            self.save()
        return self.num_webpages


class WebSiteSet(abst.AbstractMongoSet):
    recordClass = WebSite


def get_website_cache():
    sites = in_memory_cache.get("websites_data")
    if sites in [None, []]:
        sites = [w.contents() for w in WebSiteSet()]
        in_memory_cache.set("websites_data", sites)
        return sites
    return sites


def get_webpages_for_ref(tref):
    from pymongo.errors import OperationFailure
    oref = text.Ref(tref)
    segment_refs = [r.normal() for r in oref.all_segment_refs()]
    #results = WebPageSet(query={"expandedRefs": {"$in": segment_refs}}, hint="expandedRefs_1", sort=None)
    results = WebPageSet(query={"expandedRefs": {"$in": segment_refs}}, sort=None)
    try:
        results = results.array()
    except OperationFailure as e:
        # If documents are too large or there are too many results, fail gracefully
        logger.warn(f"WebPageSet for ref {tref} failed due to Error: {repr(e)}")
        return []
    webpage_objs = {}      # webpage_obj is an actual WebPage()
    webpage_results = {}  # webpage_results is dictionary that API returns
    
    for webpage in results:
        # if not webpage.whitelisted or len(webpage.title) == 0:
        #     continue
          
        webpage_key = webpage.title+"|".join(sorted(webpage.refs))
        prev_webpage_obj = webpage_objs.get(webpage_key, None)
        if prev_webpage_obj is None or prev_webpage_obj.lastUpdated < webpage.lastUpdated:
            anchor_ref_list, anchor_ref_expanded_list = oref.get_all_anchor_refs(segment_refs, webpage.refs,
                                                                                 webpage.expandedRefs)
            for anchor_ref, anchor_ref_expanded in zip(anchor_ref_list, anchor_ref_expanded_list):
                webpage_contents = webpage.client_contents()
                webpage_contents["anchorRef"] = anchor_ref.normal()
                webpage_contents["anchorRefExpanded"] = [r.normal() for r in anchor_ref_expanded]
                webpage_objs[webpage_key] = webpage
                webpage_results[webpage_key] = webpage_contents

    return list(webpage_results.values())


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


def dedupe_webpages(webpages, test=True):
    """Normalizes URLs of all webpages and deletes multiple entries that normalize to the same URL"""
    norm_count = 0
    dedupe_count = 0
    for i, webpage in tqdm(enumerate(webpages)):
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
                        normpage.expandedRefs = webpage.expandedRefs
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
    ], allowDiskUse=True)

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
            if "refs" not in merged_page_data.keys() or merged_page_data["lastUpdated"] < page.lastUpdated:
                merged_page_data.update({
                    "refs": page.refs,
                    "expandedRefs": page.expandedRefs,
                    "title": page.title,
                    "description": getattr(page, "description", ""),
                    "lastUpdated": page.lastUpdated
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
    url_bad_regexes = WebPage.excluded_pages_url_regex()[:-1] + "|\d{3}\.\d{3}\.\d{3}\.\d{3})"  #delete any page that matches the regex produced by excluded_pages_url_regex() or in IP form



    """ Delete webpages matching patterns deemed not worth including"""
    pages = WebPageSet({"$or": [
            {"url": {"$regex": url_bad_regexes}},
            {"title": {"$regex": WebPage.excluded_pages_title_regex()}},
            {"refs": {"$eq": []}},
             {"domain": ""}
        ]})

    for page in WebPageSet({"$expr": {"$gt": [{"$strLenCP": "$url"}, 1000]}}):
        # url field is indexed. Mongo doesn't allow indexing a field over 1000 bytes
        from sefaria.system.database import db
        db.webpages_long_urls.insert_one(page.contents())
        print(f"Moving {page.url} to long urls DB...")
        page.delete()


    if not test:
        pages.delete()
        print("Deleted {} pages.".format(pages.count()))
    else:
        for page in pages:
            print(page.url)
        print("\n {} pages would be deleted".format(pages.count()))



def webpages_stats():
    webpages = WebPageSet(proj={"expandedRefs": False})
    total_pages  = webpages.count()
    total_links  = []
    websites = {}
    year_data = Counter()

    for webpage in tqdm(webpages):
        website = webpage.get_website()
        if website:
            if website not in websites:
                websites[website] = 0
            websites[website] += 1
        total_links += webpage.refs
        year = int((datetime.today() - webpage.lastUpdated).days / 365.0)
        year_data[year] += 1

    total_links = len(set(total_links))

    for website, num in websites.items():
        website.num_webpages = num
        website.save()

    return (total_pages, total_links, year_data)


def find_webpages_without_websites(webpages, test=True, hit_threshold=50, last_linker_activity_day=20):
    from datetime import datetime, timedelta
    new_active_sites = Counter()   # WebSites we don't yet have in DB, but we have corresponding WebPages accessed recently
    unactive_unacknowledged_sites = {}  # WebSites we don't yet have in DB, and we have correpsonding WebPages but they have not been accessed recently

    active_threshold = datetime.today() - timedelta(days=last_linker_activity_day)   # used for creating new sites
    unactive_threshold = datetime.today() - timedelta(days=(last_linker_activity_day+10))   # used for deleting old pages
    # if we have more than hit_threshold webpages for a website accessed after active_threshold, create new website for these pages
    # lets say there are 45 pages in last 20 days so we dont create a new site. if active_threshold were the same as unactive_threshold, we would delete these.
    # if we then get 5 new pages in the next hour, they won't correspond to an actual site. the way to deal with this
    # is to make sure the unactive_threshold, which determines which pages we delete, is significantly older than the active_threshold. let's pick 10 days

    for i, webpage in tqdm(enumerate(webpages)):
        website = webpage.get_website(dict_only=True)
        if website == {}:
            if webpage.lastUpdated > active_threshold:
                new_active_sites[webpage.domain] += 1
            elif webpage.lastUpdated < unactive_threshold:
                if webpage.domain not in unactive_unacknowledged_sites:
                    unactive_unacknowledged_sites[webpage.domain] = []
                unactive_unacknowledged_sites[webpage.domain].append(webpage)

    sites_added = {}
    for site, hits in new_active_sites.items():
        if hits > hit_threshold:
            sites_added[site] = f"{site} should be created because it has {hits} pages in last {last_linker_activity_day} days"

    for site, hits in unactive_unacknowledged_sites.items():
        if site not in new_active_sites.keys():  # if True, site has not been updated recently
            print("Deleting {} with {} pages".format(site, len(unactive_unacknowledged_sites[site])))
            for webpage in unactive_unacknowledged_sites[site]:
                if not test:
                    webpage.delete()

    return sites_added

def find_sites_to_be_excluded(webpages):
    # returns all sites dictionary and each entry has a Counter of refs
    all_sites = {}
    for webpage in tqdm(webpages):
        website = webpage.get_website(dict_only=True)
        if website != {}:
            if website["name"] not in all_sites:
                all_sites[website["name"]] = Counter()
            for ref in webpage.refs:
                all_sites[website["name"]][ref] += 1
    return all_sites

def find_sites_to_be_excluded_absolute(flag=100):
    # this function looks for any website which has more webpages than 'flag' of any ref
    all_sites = find_sites_to_be_excluded()
    sites_to_exclude = {}
    for website in all_sites:
        sites_to_exclude[website] = ""
        if len(all_sites[website]) > 0:
            most_common = all_sites[website].most_common(10)
            for common in most_common:
                if common[1] > flag:
                    sites_to_exclude[website] += f"{website} may need exclusions set due to Ref {common[0]} with {common[1]} pages.\n"
    return sites_to_exclude

def find_sites_to_be_excluded_relative(webpages, flag=25, relative_percent=3):
    # this function looks for any website which has more webpages than 'flag' of any ref AND the amount of pages of this ref is a significant percentage of site's total refs
    sites_to_exclude = defaultdict(list)
    all_sites = find_sites_to_be_excluded(webpages)
    for website in all_sites:
        total = sum(all_sites[website].values())
        top_10 = all_sites[website].most_common(10)
        for c in top_10:
            if c[1] > flag and 100.0*float(c[1])/total > relative_percent:
                sites_to_exclude[website].append(c)
    return sites_to_exclude

def check_daf_yomi_and_parashat_hashavua(sites):
    previous = datetime.now() - timedelta(10)
    recent_daf = daf_yomi(previous)[0]["ref"]
    recent_parasha = parashat_hashavua_and_haftara(previous)[0]["ref"]

    future_daf = datetime.now() + timedelta(500)
    future_daf = daf_yomi(future_daf)[0]["ref"]

    future_parasha = datetime.now() + timedelta(180)
    future_parasha = parashat_hashavua_and_haftara(future_parasha)[0]["ref"]
    poss_issues = {}
    for site in sites:
        poss_issues[site] = {}
        poss_issues[site]["Daf"] = 0
        poss_issues[site]["Parasha"] = 0
        for type, future, recent in [("Daf", future_daf, recent_daf), ("Parasha", future_parasha, recent_parasha)]:
            future_range = text.Ref(future)
            recent_range = text.Ref(recent)
            for ref, count in sites[site].items():
                try:
                    ref = text.Ref(ref)
                    if recent_range.contains(ref):
                        poss_issues[site][type] += count
                    if future_range.contains(ref):
                        poss_issues[site][type] -= count
                except InputError as e:
                    print(e)

    for site in poss_issues:
        daf = poss_issues[site]["Daf"]
        parasha = poss_issues[site]["Parasha"]
        if daf > 10:
            print("{} may have daf yomi on every page.".format(site))
        if parasha > 10:
            print("{} may have parasha on every page.".format(site))

def find_sites_that_may_have_removed_linker(last_linker_activity_day=20):
    """
    Checks for each site whether there has been a webpage hit with the linker in the last `last_linker_activity_day` days
    Prints an alert for each site that doesn't meet this criterion
    """
    sites_to_delete = {}
    sites_to_keep = {}
    from datetime import datetime, timedelta
    last_active_threshold = datetime.today() - timedelta(days=last_linker_activity_day)
    webpages_without_websites = 0
    for data in get_website_cache():
        if data["is_whitelisted"]:  # we only care about whitelisted sites
            for domain in data['domains']:
                ws = WebPageSet({"url": {"$regex": re.escape(domain)}}, limit=1, sort=[['lastUpdated', -1]])
                keep = True
                if ws.count() == 0:
                    sites_to_delete[domain] = f"{domain} has no pages"
                    keep = False
                else:
                    webpage = ws[0]  # lastUpdated webpage for this domain
                    website = webpage.get_website()
                    if website:
                        website.linker_installed = webpage.lastUpdated > last_active_threshold
                        if not website.linker_installed:
                            keep = False
                            print(f"Alert! {domain} has removed the linker!")
                            sites_to_delete[domain] = f"{domain} has {website.get_num_webpages()} pages, but has not used the linker in {last_linker_activity_day} days. {webpage.url} is the newest page."
                    else:
                        print("Alert! Can't find website {} corresponding to webpage {}".format(data["name"], webpage.url))
                        webpages_without_websites += 1
                        continue
                if keep:
                    assert domain not in sites_to_delete
                    sites_to_keep[domain] = True

    if webpages_without_websites > 0:
        print("Found {} webpages without websites".format(webpages_without_websites))
    return sites_to_delete

