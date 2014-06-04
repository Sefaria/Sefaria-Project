"""
export.py - functions for exporting texts to various text formats.

Exports to the directory specified in SEFARIA_DATA_PATH.
"""

import sys
import os
import csv
import simplejson as json
import re
from shutil import rmtree

from texts import *
from database import db


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
	if doc["categories"][0] not in order:
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

	def flatten(text, sectionNames):
		if len(sectionNames) == 1:
			text = [t if t else "" for t in text]
			return "\n".join(text)
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


def export_links():
	"""
	Creates a single CSV file containing all links known to Sefaria.
	"""
	with open(SEFARIA_DATA_PATH + "/links/links.csv", 'wb') as csvfile:
		writer = csv.writer(csvfile)
		writer.writerow([
							"Citation 1",
							"Citation 2",
							"Type",
						 ])
		links = db.links.find().sort([["refs.0", 1]])
		for link in links:
			writer.writerow([
							link["refs"][0],
							link["refs"][1],
							link["type"],
						 ])


def export_all():
	"""
	Step through every text in the texts collection and export it with each format
	listed in export_formats.
	"""
	clear_exports()

	export_links()

	texts = db.texts.find()
	for text in texts:
		index = get_index(text["title"])
		if "error" in index:
			print "Skipping %s - %s" % (text["title"], index["error"])
			continue

		text.update(index)
		del text["_id"]
		text["text"] = text.pop("chapter")

		for format in export_formats:
			out = format[1](text)
			path = make_path(text, format[0])
			if not os.path.exists(os.path.dirname(path)):
				os.makedirs(os.path.dirname(path))
			with open(path, "w") as f:
				f.write(out.encode('utf-8'))