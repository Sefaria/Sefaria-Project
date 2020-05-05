"""
sitemap.py - generate sitemaps of all available texts for search engines.

Outputs sitemaps and sitemapindex to the first entry of STATICFILES_DIRS by default, a custom directory can be supplied.
"""
import os, errno
from datetime import datetime

from sefaria.model import *
from sefaria.system.database import db
from .settings import STATICFILES_DIRS, STATIC_URL


def chunks(l, n):
    """
    Yield successive n-sized chunks from l.
    """
    for i in range(0, len(l), n):
        yield l[i:i + n]


class SefariaSiteMapGenerator(object):

    hostnames = {
        'org': {'interfaceLang': 'en', 'hostname':'https://www.sefaria.org'},
        'org.il': {'interfaceLang': 'he', 'hostname':'https://www.sefaria.org.il'},
    }
    static_urls = [
        "",
        "/explore",
        "/texts",
        "/visualizations",
        "/activity",
        "/educators",
        "/donate",
        "/supporters",
        "/mobile",
        "/app",
        "/daf-yomi",
        "/linker",
        "/jobs",
        "/help",
        "/metrics",
        "/sheets",
        "/sheets/public",
        "/login",
        "/register",
        "/terms",
        "/testimonials",
        "/privacy-policy",
        "/updates",
        "/people",
        "/people/Talmud",
        "/william-davidson-talmud",
        "/remote-learning",
    ]
    sitemaps = []

    def __init__(self, hostSuffix='org', output_directory=STATICFILES_DIRS[0]):
        if hostSuffix in SefariaSiteMapGenerator.hostnames:
            self._interfaceLang = SefariaSiteMapGenerator.hostnames.get(hostSuffix).get("interfaceLang")
            self._hostname = SefariaSiteMapGenerator.hostnames.get(hostSuffix).get("hostname")
            self.output_directory = output_directory
            path = self.output_directory + "sitemaps/" + self._interfaceLang
            if not os.path.exists(path):
                os.makedirs(path)
        else:
            raise KeyError("Illegal hostname for SiteMapGenerator")

    def generate_texts_sitemaps(self):
        """
        Create sitemap for each text section for which content is available.
        Returns the number of files written (each sitemap can have only 50k URLs)
        """
        refs = library.ref_list()
        urls = [self._hostname + "/" + oref.url() for oref in refs]

        maps = list(chunks(urls, 40000))

        for n in range(len(maps)):
            self.write_urls(maps[n], "texts-sitemap%d.txt" % n)

        return len(maps)

    def generate_texts_toc_sitemap(self):
        """
        Creates a sitemap for each text table of contents page.
        """
        titles = library.get_toc_tree().flatten()
        urls = [self._hostname + "/" + Ref(title).url() for title in titles]
        self.write_urls(urls, "text-toc-sitemap.txt")

    def generate_categories_sitemap(self):
        """
        Creates sitemap for each category page.
        """
        toc = library.get_toc()
        def cat_paths(toc):
            paths = []
            for t in toc:
                cat = t.get("category", None)
                if cat:
                    cat = cat.replace(" ", "%20")
                    paths.append(cat)
                    try:
                        subpaths = cat_paths(t["contents"])
                    except KeyError:
                        continue
                    paths = paths + [cat + "/" + sp for sp in subpaths]
            return paths
        paths = cat_paths(toc)
        urls = [self._hostname + "/texts/" + p for p in paths]
        self.write_urls(urls, "categories-sitemap.txt")

    def generate_sheets_sitemap(self):
        """
        Creates a sitemap for each public source sheet.
        """
        query = {"status": "public"}
        public = db.sheets.find(query).distinct("id")
        urls = [self._hostname + "/sheets/" + str(id) for id in public]
        self.write_urls(urls, "sheets-sitemap.txt")

    def generate_topics_sitemap(self):
        """
        Creates a sitemap for each topic that has at least one source or source sheet.
        """
        topics = TopicSet()
        topics = [topic for topic in topics if topic.should_display()]
        urls = [self._hostname + "/topics/" + topic.slug for topic in topics]
        self.write_urls(urls, "topics-sitemap.txt")

    def generate_people_sitemap(self):
        urls = [self._hostname + "/person/{}".format(p.key.replace(" ", "%20")) for p in PersonSet()]
        self.write_urls(urls, "person-sitemap.txt")

    def generate_static_sitemap(self):
        """
        Creates a sitemap of static content listed above.
        """
        self.write_urls([self._hostname + "/" + url for url in self.static_urls], "static-sitemap.txt")

    def write_urls(self, urls, filename):
        """
        Writes the list URLS, one per line, to filename.
        """
        out = self.output_directory + "sitemaps/" + self._interfaceLang + "/" + filename
        f = open(out, 'w')
        for url in urls:
            f.write(url + "\n")
        f.close()
        self.sitemaps.append(filename)

    def generate_sitemap_index(self):
        now = datetime.now().strftime("%Y-%m-%d")
        xml = ""
        for m in self.sitemaps:
            xml += """
               <sitemap>
                  <loc>%s%ssitemaps/%s/%s</loc>
                  <lastmod>%s</lastmod>
               </sitemap>
               """ % (self._hostname, STATIC_URL, self._interfaceLang, m, now)

        sitemapindex = """<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            %s
            </sitemapindex>
            """ % xml

        out = self.output_directory + "sitemaps/" + self._interfaceLang + "/sitemapindex.xml"
        f = open(out, 'w')
        f.write(sitemapindex)
        f.close()

    def generate_sitemaps(self):
        """
        Creates all sitemap files then creates and index file for all.
        """
        self.generate_static_sitemap()
        self.generate_sheets_sitemap()
        self.generate_texts_toc_sitemap()
        self.generate_categories_sitemap()
        self.generate_people_sitemap()
        self.generate_texts_sitemaps()

        self.generate_sitemap_index()