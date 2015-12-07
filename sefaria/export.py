"""
export.py - functions for exporting texts to various text formats.

Exports to the directory specified in SEFARIA_EXPORT_PATH.
"""
import sys
import os
import csv
import re
import json
from shutil import rmtree
from random import random
from pprint import pprint
from datetime import datetime

import sefaria.model as model
from sefaria.model.text import Version
from sefaria.utils.talmud import section_to_daf
from sefaria.system.exceptions import InputError
from summaries import ORDER, get_toc
from local_settings import SEFARIA_EXPORT_PATH
from sefaria.system.database import db

lang_codes = {
    "he": "Hebrew",
    "en": "English"
}


def make_path(doc, format):
    """
	Returns the full path and file name for exporting 'doc' in 'format'.
	"""
    if doc["categories"][0] not in ORDER and doc["categories"][0] != "Commentary":
        doc["categories"].insert(0, "Other")
    path = "%s/%s/%s/%s/%s/%s.%s" % (SEFARIA_EXPORT_PATH,
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
	Returns JSON of 'doc' with export settings.
	"""
    return json.dumps(doc, indent=4, encoding='utf-8', ensure_ascii=False)


def make_text(doc):
    """
	Export doc into a simple text format.

	if complex, go through nodes depth first,
	at each node, output name of node
	if node is leaf, run flatten on it

	"""

    index = model.get_index(doc["title"])
    text = "\n".join([doc["title"], doc.get("heTitle", ""), doc["versionTitle"], doc["versionSource"]])    
    version = Version().load({'title': doc["title"], 'versionTitle': doc["versionTitle"], 'language': doc["language"]})	

    isMerged = (doc["versionTitle"] == "merged")
    
    if "versions" in doc:
        if isMerged:
            version = Version().load({'title': doc["title"], 'versionTitle': doc["versions"][0][0], 'language': doc["language"]})
        text += "\nThis file contains merged sections from the following text versions:"
        for v in doc["versions"]:
            text += "\n-%s\n-%s" % (v[0], v[1])

			
    def make_node(node, depth, **kwargs):

        if node.is_leaf():
            content = "\n\n%s" % node.primary_title(doc["language"])
            content += flatten(version.content_node(node), node.sectionNames)
            return "\n\n%s" % content
        else:
            return "\n\n%s" % node.primary_title(doc["language"])

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

    text += index.nodes.traverse_to_string(make_node)


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
        if os.path.exists(SEFARIA_EXPORT_PATH + "/" + format[0]):
            rmtree(SEFARIA_EXPORT_PATH + "/" + format[0])
    if os.path.exists(SEFARIA_EXPORT_PATH + "/schemas"):
        rmtree(SEFARIA_EXPORT_PATH + "/schemas")


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
	Exports 'text' (a document from the texts collection, or virtual merged document) 
	by preparing it as a export document and passing to 'export_text_doc'.
	"""
    print text["title"]
    try:
        index = model.get_index(text["title"])
    except Exception as e:
        print "Skipping %s - %s" % (text["title"], e.message)
        return

    text["heTitle"] = index.nodes.primary_title("he")
    text["categories"] = index.categories
    text["text"] = text.get("text", None) or text.get("chapter", "")

    if index.is_complex():
        def min_node_props(node, depth, **kwargs):
            js = {"heTitle": node.primary_title("he"),
                  "enTitle": node.primary_title("en"),
                  "key": node.key}

            return js

        def key2title(text_node, schema_node):
            for temp_schema_node in schema_node:
                new_key = temp_schema_node["enTitle"]
                text_node[new_key] = text_node.pop(temp_schema_node["key"])
                del temp_schema_node["key"]
                if "nodes" in temp_schema_node:
                    key2title(text_node[new_key], temp_schema_node["nodes"])

        text["schema"] = index.nodes.traverse_to_json(min_node_props)
        key2title(text["text"], text["schema"]["nodes"])

    else:
        text["sectionNames"] = index.schema["sectionNames"]

    if "_id" in text:
        del text["_id"]
        del text["chapter"]


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

    doc = {
        "title": title,
        "language": lang,
        "versionTitle": "merged",
        "versionSource": "http://www.sefaria.org/%s" % title.replace(" ", "_"),
    }
    text_docs = db.texts.find({"title": title, "language": lang})

    print "%d versions in %s" % (text_docs.count(), lang)

    if text_docs.count() == 0:
        return
    elif text_docs.count() == 1:
        text_doc = text_docs.next()
        doc["text"] = text_doc["chapter"]  # TODO: sort complex according to Index
        doc["versions"] = [(text_doc["versionTitle"], text_doc["versionSource"])]
    else:
        texts = []
        sources = []
        for text in text_docs:
            texts.append(text["chapter"])
            sources.append((text["versionTitle"], text["versionSource"]))

        merged, merged_sources = model.merge_texts(texts, sources)
        merged_sources = list(set(merged_sources))

        doc.update({
            "text": merged,
            "versions": merged_sources,
        })

    export_text(doc)


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


def export_schemas():
    path = SEFARIA_EXPORT_PATH + "/schemas/"
    if not os.path.exists(path):
        os.makedirs(path)
    for i in model.IndexSet():
        title = i.title.replace(" ", "_")
        with open(path + title + ".json", "w") as f:
            try:
                f.write(make_json(i.contents(v2=True)).encode('utf-8'))
            except InputError as e:
			    print "InputError: %s" % e
			    with open(SEFARIA_EXPORT_PATH + "/errors.log", "a") as error_log:
			        error_log.write("%s - InputError: %s\n" % (datetime.now(), e))
				


def export_toc():
    """
	Exports the TOC to a JSON file.
	"""
    toc = get_toc()
    with open(SEFARIA_EXPORT_PATH + "/table_of_contents.json", "w") as f:
        f.write(make_json(toc).encode('utf-8'))


def export_links():
    """
	Creates a single CSV file containing all links known to Sefaria.
	"""
    with open(SEFARIA_EXPORT_PATH + "/links/links.csv", 'wb') as csvfile:
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
        for i,link in enumerate(links):
            if i % 1000 == 0:
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


def make_export_log():
    """
	Exports a file that logs the last export time.
	"""
    with open(SEFARIA_EXPORT_PATH + "/last_export.txt", "w") as f:
        f.write(datetime.now().isoformat())


def export_all():
    """
	Export all texts, merged texts, links, schemas, toc, links & export log.
	"""
    clear_exports()
    export_texts()
    export_all_merged()
    export_links()
    export_schemas()
    export_toc()
    make_export_log()
