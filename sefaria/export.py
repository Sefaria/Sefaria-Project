"""
export.py - functions for exporting texts to various text formats.

Exports to the directory specified in SEFARIA_DATA_PATH.
"""

import sys
import os
import csv
import re
import json
from shutil import rmtree
from random import random
from sefaria.utils.talmud import section_to_daf

import sefaria.model as model
from sefaria.system.exceptions import InputError
from texts import merge_translations
from summaries import order
from local_settings import SEFARIA_DATA_PATH
from sefaria.system.database import db
import sefaria.model.text

# To allow these files to be run from command line
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

lang_codes = {
	"he": "Hebrew",
	"en": "English"
}


def make_path(doc, format):
	"""
	Returns the full path and file name for exporting doc.
	"""
	if doc["categories"][0] not in order and doc["categories"][0] != "Commentary":
		doc["categories"].insert(0, "Other")
	path = "%s/%s/%s/%s/%s/%s.%s" % (SEFARIA_DATA_PATH,
									 format,
									 "/".join(doc["categories"]),
									 doc["title"],
									 lang_codes[doc["language"]],
									 remove_illegal_file_chars(doc["versionTitle"]),
									 format)
	return path


def remove_illegal_file_chars(filename_str):
	p = re.compile('[/:()<>"|?*]|(\\\)')
	new_filename = p.sub('', filename_str)
	return new_filename


def make_json(doc):
	"""
	Exports doc as JSON (as is).
	"""
	return json.dumps(doc, indent=4, ensure_ascii=False)


def make_text(doc):
	"""
	Export doc into a simple text format.
	"""
	text = "\n".join([doc["title"], doc.get("heTitle", ""), doc["versionTitle"], doc["versionSource"]])

	if "versions" in doc:
		text += "\nThis file contains merged sections from the following text versions:"
		for version in doc["versions"]:
			text += "\n-%s\n-%s" % (version[0], version[1])

	def flatten(text, sectionNames):
		text = text or ""
		if len(sectionNames) == 1:
			text = [t if t else "" for t in text]
			# Bandaid for mismatch between text structure, join recursively if text
			# elements are lists instead of strings.
			return "\n".join([t if isinstance(t, basestring) else "\n".join(t) for t in text])
		flat = ""
		for i in range(len(text)):
			section = section_to_daf(i + 1) if sectionNames[0] == "Daf" else str(i + 1)
			flat += "\n\n%s %s\n\n%s" % (sectionNames[0], section, flatten(text[i], sectionNames[1:]))
		return flat

	text += flatten(doc["text"], doc["sectionNames"])

	return text


"""
List of export format, consisting of a name and function.
The name is used as a top level directory and file suffix.
The function takes a document and returns the text to output.
"""
export_formats = (
	('json', make_json),
	('txt', make_text),
)

def clear_exports():
	"""
	Deletes all files from any export directory listed in export_formats.
	"""
	for format in export_formats:
		if os.path.exists(SEFARIA_DATA_PATH + "/" + format[0]):
			rmtree(SEFARIA_DATA_PATH + "/" + format[0])


def export_text_doc(doc):
	"""
	Writes document to disk according to all formats in export_formats
	"""
	for format in export_formats:
		out = format[1](doc)
		path = make_path(doc, format[0])
		if not os.path.exists(os.path.dirname(path)):
			os.makedirs(os.path.dirname(path))
		with open(path, "w") as f:
			f.write(out.encode('utf-8'))


def export_text(text):
	"""
	Iterates through all text documents, writing a document to disk
	according to formats in export_formats
	"""
	print text["title"]
	try:
		index = model.get_index(text["title"])
	except Exception as e:
		print "Skipping %s - %s" % (text["title"], e.message)
		return

	text.update(index.contents())
	del text["_id"]
	text["text"] = text.pop("chapter")

	export_text_doc(text)


def export_texts():
	"""
	Step through every text in the texts collection and export it with each format
	listed in export_formats.
	"""
	clear_exports()

	texts = db.texts.find()
	for text in texts:
		export_text(text)


def export_merged(title, lang=None):
	"""
	Exports a "merged" version of title, including the maximal text we have available
	in a single document.
	"""
	if not lang:
		print title
		for lang in ("he", "en"):
			export_merged(title, lang=lang)
		return

	#todo: move to new Ref format
	doc = model.Ref(title).old_dict_format()

	doc.update({
		"title": title,
		"language": lang,
		"versionTitle": "merged",
		"versionSource": "http://www.sefaria.org/%s" % title.replace(" ", "_"),
	})
	text_docs = db.texts.find({"title": title, "language": lang})

	print "%d versions in %s" %(text_docs.count(), lang)

	if text_docs.count() == 0:
		return
	elif text_docs.count() == 1:
		text_doc = text_docs.next()
		doc["text"]          = text_doc["chapter"]
		doc["versions"]      = [(text_doc["versionTitle"], text_doc["versionSource"])]
	else:
		texts = []
		sources = []
		for text in text_docs:
			texts.append(text["chapter"])
			sources.append((text["versionTitle"], text["versionSource"]))

		merged, merged_sources = merge_translations(texts, sources)
		merged_sources = list(set(merged_sources))

		doc.update({
			"text": merged,
			"versions": merged_sources,
		})

	export_text_doc(doc)


def export_all_merged():
	"""
	Iterate through all index records and exports a merged text for each.
	"""
	texts = db.texts.find().distinct("title")

	for title in texts:
		try:
			model.Ref(title)
		except:
			continue
		export_merged(title)


def export_links():
	"""
	Creates a single CSV file containing all links known to Sefaria.
	"""
	with open(SEFARIA_DATA_PATH + "/links/links.csv", 'wb') as csvfile:
		writer = csv.writer(csvfile)
		writer.writerow([
							"Citation 1",
							"Citation 2",
							"Conection Type",
							"Text 1",
							"Text 2",
							"Category 1",
							"Category 2",
						 ])
		links = db.links.find().sort([["refs.0", 1]])
		for link in links:
			if random() > .99:
				print link["refs"][0]

			try:
				oref1 = model.Ref(link["refs"][0])
				oref2 = model.Ref(link["refs"][1])
			except InputError:
				continue

			writer.writerow([
							link["refs"][0],
							link["refs"][1],
							link["type"],
							oref1.book,
							oref2.book,
							oref1.index.categories[0],
							oref2.index.categories[0],
			])


def export_all():
	"""
	Export all texts and links.
	"""
	export_texts()
	export_all_merged()
	export_links()
