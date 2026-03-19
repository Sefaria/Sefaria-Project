# coding=utf-8
from urllib.parse import urlparse
import regex as re

from sefaria.system.cache import in_memory_cache
from sefaria.system.database import db


def domain_for_url(url):
    return urlparse(url).netloc


def get_website_cache():
    sites = in_memory_cache.get("websites_data")
    if sites in [None, []]:
        sites = []
        for site in db.websites.find({}):
            site.pop("_id", None)
            sites.append(site)
        in_memory_cache.set("websites_data", sites)
        return sites
    return sites


def site_data_for_domain(domain):
    sites = get_website_cache()
    for site in sites:
        for site_domain in site.get("domains", []):
            if site_domain == domain or domain.endswith("." + site_domain):
                return site
    return None


def normalize_url(url):
    rewrite_rules = {
        "use https": lambda u: re.sub(r"^http://", "https://", u),
        "remove hash": lambda u: re.sub(r"#.*", "", u),
        "remove url params": lambda u: re.sub(r"\?.+", "", u),
        "remove utm params": lambda u: re.sub(r"\?utm_.+", "", u),
        "remove fbclid param": lambda u: re.sub(r"\?fbclid=.+", "", u),
        "remove www": lambda u: re.sub(r"^(https?://)?www\.", r"\1", u),
        "remove mediawiki params": lambda u: re.sub(r"&amp;.+", "", u),
        "remove sort param": lambda u: re.sub(r"\?sort=.+", "", u),
        "remove all params after id": lambda u: re.sub(r"(\?id=\d+).+$", r"\1", u)
    }
    global_rules = ["remove hash", "remove utm params", "remove fbclid param", "remove www", "use https"]
    domain = domain_for_url(url)
    site_rules = global_rules
    site_data = site_data_for_domain(domain)
    if site_data and site_data.get("is_whitelisted"):
        site_rules += [x for x in site_data.get("normalization_rules", []) if x not in global_rules]
    for rule in site_rules:
        url = rewrite_rules[rule](url)
    return url
