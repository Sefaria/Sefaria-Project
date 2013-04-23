import os
from texts import *

static_urls = [
	"http://www.sefaria.org",
	"http://www.sefaria.org/contribute",
	"http://www.sefaria.org/texts",
	"http://www.sefaria.org/activity",
	"http://www.sefaria.org/educators",
	"http://www.sefaria.org/sheets",
	"http://www.sefaria.org/developers",
	"http://www.sefaria.org/team",
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
	refs = [ref.replace]
	urls = ["http://www.sefaria.org/" + url_ref(ref) for ref in refs]
	urls += static_urls
	out = os.path.dirname(os.path.dirname(os.path.realpath(__file__))) + "/static/sitemap.txt"
	f = open(out, 'w')
	for url in urls:
		f.write(url + "\n")
	f.close()
	
	return urls


def generate_refs_list():
	"""
	Generate a list of refs to all available sections.
	"""
	refs = []
	counts = db.counts.find()
	for c in counts:
		i = get_index(c["title"])
		if ("error" in i):
			# If there is not index record to match the count record,
			# the count should be removed. 
			db.counts.remove(c)
			continue
		title = c["title"]		
		he = list_from_counts(c["availableTexts"]["he"])
		en = list_from_counts(c["availableTexts"]["en"])
		sections = union(he, en)
		for n in sections:
			if i["categories"][0] == "Talmud":
				n = section_to_daf(int(n))
			ref = "%s %s" % (title, n) if n else title
			refs.append(ref)

	return refs

def list_from_counts(count, pre=""):
	"""
	Recursive function to transform a count array (a jagged array counting
	how many versions of each text segment are availble) into a list of sections numbers.
	
	A section is considered available if at least one of its segments is available.

	E.g., [[1,1],[0,1]]	-> [1,2]
	      [[0,0], [1,0]] -> [2]
		  [[[1,2], [0,1]], [[0,0], [1,0]]] -> [1:1, 1:2, 2:2] 
	"""
	urls = []

	if not count:
		return urls

	elif isinstance(count[0], int):
		# The count we're looking at represents a section
		# List it in urls if it not all empty
		if not all(v == 0 for v in count):
			urls.append(pre)
			return urls

	for i, c in enumerate(count):
		if isinstance(c, list):
			p = "%s:%d" % (pre, i+1) if pre else str(i+1)
			urls += list_from_counts(c, pre=p)

	return urls


def union(a, b):
    """ return the union of two lists """
    return list(set(a) | set(b))