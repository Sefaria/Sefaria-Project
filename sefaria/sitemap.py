"""
sitemap.py - generate sitemaps of all available texts for search engines.

Outputs sitemaps and sitemapindex to the first entry of STATICFILES_DIRS.
"""
import os
from datetime import datetime

from sefaria.model import *
from sefaria.system.database import db
from sefaria.summaries import flatten_toc
from settings import STATICFILES_DIRS


static_urls = [
	"http://www.sefaria.org",
	"http://www.sefaria.org/explore",
	"http://www.sefaria.org/translation-requests",
	"http://www.sefaria.org/contribute",
	"http://www.sefaria.org/texts",
	"http://www.sefaria.org/activity",
	"http://www.sefaria.org/educators",
	"http://www.sefaria.org/sheets",
	"http://www.sefaria.org/sheets/public",
	"http://www.sefaria.org/sheets/tags",
	"http://www.sefaria.org/developers",
	"http://www.sefaria.org/login",
	"http://www.sefaria.org/register",
	"http://www.sefaria.org/related-projects",
	"http://www.sefaria.org/copyright-policy",
	"http://www.sefaria.org/terms",
	"http://www.sefaria.org/privacy-policy",
]


def chunks(l, n):
	"""
	Yield successive n-sized chunks from l.
	"""
	for i in xrange(0, len(l), n):
		yield l[i:i+n]


def generate_texts_sitemaps():
	"""
	Create sitemap for each text section for which content is available.
	Returns the number of files written (each sitemap can have only 50k URLs)
	"""
	refs = library.ref_list()
	urls = ["http://www.sefaria.org/" + oref.url() for oref in refs]

	maps = list(chunks(urls, 40000))

	for n in range(len(maps)):
		write_urls(maps[n], "texts-sitemap%d.txt" % n)

	return len(maps)


def generate_texts_toc_sitemap():
	"""
	Creates a sitemap for each text table of contents page.
	"""
	titles = flatten_toc(library.get_toc())
	urls = ["http://www.sefaria.org/" + Ref(title).url() for title in titles]
	write_urls(urls, "text-toc-sitemap.txt")


def generate_categories_sitemap():
	"""
	Creates sitemap for each category page.
	"""
	toc   = library.get_toc()
	def cat_paths(toc):
		paths = []
		for t in toc:
			cat = t.get("category", None)
			if cat:
				cat = cat.replace(" ", "%20")
				paths.append(cat)
				subpaths = cat_paths(t["contents"])
				paths = paths + [cat + "/" + sp for sp in subpaths]
		return paths
	paths = cat_paths(toc)
	urls = ["http://www.sefaria.org/" + p for p in paths]
	write_urls(urls, "categories-sitemap.txt")


def generate_sheets_sitemap():
	"""
	Creates a sitemap for each public source sheet.
	"""
	query = {"status": "public"}
	public = db.sheets.find(query).distinct("id")
	urls = ["http://www.sefaria.org/sheets/" + str(id) for id in public]

	write_urls(urls, "sheets-sitemap.txt")


def generate_static_sitemap(): 
	"""
	Creates a sitemap of static content listed above.
	"""
	write_urls(static_urls, "static-sitemap.txt")


def write_urls(urls, filename):
	"""
	Writes the list URLS, one per line, to filename.
	"""
	out = STATICFILES_DIRS[0] + filename
	f = open(out, 'w')
	for url in urls:
		f.write(url + "\n")
	f.close()


def generate_sitemap_index(sitemaps):
	now = datetime.now().strftime("%Y-%m-%d")
	xml = ""
	for m in sitemaps:
		xml += """
		   <sitemap>
			  <loc>http://www.sefaria.org/static/%s</loc>
			  <lastmod>%s</lastmod>
		   </sitemap>
		   """ % (m, now)

	sitemapindex = """<?xml version="1.0" encoding="UTF-8"?>
		<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
		%s
		</sitemapindex>
		""" % xml

	out = STATICFILES_DIRS[0] + "sitemapindex.xml"
	f = open(out, 'w')
	f.write(sitemapindex)
	f.close()


def generate_sitemaps():
	"""
	Creates all sitemap files then creates and index file for all.
	"""
	generate_static_sitemap()
	generate_sheets_sitemap()
	generate_texts_toc_sitemap()
	generate_categories_sitemap()
	n = generate_texts_sitemaps()

	maps = ["static-sitemap.txt", "sheets-sitemap.txt", "text-toc-sitemap.txt", "categories-sitemap.txt"]
	maps += ["texts-sitemap%d.txt" % i for i in range(n)]

	generate_sitemap_index(maps)