import os
from texts import *

def generate_sitemap():
	urls = {}
	t = db.texts.find()
	for text in t:
		text_urls = urls_from_text(text["chapter"])
		for u in text_urls:
			urls["http://www.sefaria.org/%s_%s" % (text["book"], u)] = 1

	out = os.path.dirname(os.path.realpath(__file__)) + "/data/sitemap.txt"
	f = open(out, 'w')
	for url in urls:
		out.write(url + "\n")
	f.close()


def urls_from_text(text):
	urls = {}
	
	if not text:
		return urls
	elif isinstance(text, basestring):
		urls[""] = 1
		return urls

	for i, t in enumberate(text):
		if isinstance(t, basestring) and t:
	return urls