import os
from texts import *
from sheets import LISTED_SHEETS

static_urls = [
	"http://www.sefaria.org",
	"http://www.sefaria.org/contribute",
	"http://www.sefaria.org/texts",
	"http://www.sefaria.org/activity",
	"http://www.sefaria.org/educators",
	"http://www.sefaria.org/sheets",
	"http://www.sefaria.org/developers",
	"http://www.sefaria.org/login",
	"http://www.sefaria.org/register",
	"http://www.sefaria.org/related-projects",
	"http://www.sefaria.org/copyright-policy",
	"http://www.sefaria.org/terms",
	"http://www.sefaria.org/privacy-policy",
]

def generate_sitemap():
	"""
	Create sitemap of links to each text section for which content is available.
	"""
	refs = generate_refs_list()
	urls = ["http://www.sefaria.org/" + url_ref(ref) for ref in refs if url_ref(ref)]
	
 	query = {"status": {"$in": LISTED_SHEETS}}
	public = db.sheets.find(query).distinct("id")
	urls += ["http://www.sefaria.org/sheets/" + str(id) for id in public]

	urls += static_urls
	out = STATICFILES_DIRS[0] + "sitemap.txt"
	f = open(out, 'w')
	for url in urls:
		f.write(url + "\n")
	f.close()
	
	return urls
