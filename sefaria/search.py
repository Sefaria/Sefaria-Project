# -*- coding: utf-8 -*-

import os
from pprint import pprint

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

import texts
from util import user_link 
from sheets import LISTED_SHEETS

from pyes import *
es = ES('127.0.0.1:9200')

doc_count = 0

def index_text(ref, version=None, lang=None):
    """
    Index the text designated by ref.
    If no version and lang are given, this functon will be called for each availble version.
    Currently assumes ref is at section level. 
    """
    ref = texts.norm_ref(unicode(ref))

    # Recall this function for each specific text version, if non provided
    if not (version and lang):
        for v in texts.get_version_list(ref):
            index_text(ref, version=v["versionTitle"], lang=v["language"])
        return

    # Index this document as a whole
    doc = make_text_index_document(ref, version, lang)
    if doc:
        try:
            es.index(doc, 'sefaria', 'text', make_text_doc_id(ref, version, lang))
            global doc_count
            doc_count += 1
        except Exception, e:
            print "Error indexing %s / %s / %s" % (ref, version, lang)
            print e

    # Index each segment of this document individually
    pRef = texts.parse_ref(ref)
    if len(pRef["sections"]) < len(pRef["sectionNames"]):
        text = texts.get_text(ref, context=0, commentary=False, version=version, lang=lang)
        if "error" in text:
            print text["error"]
        else:
            for i in range(max(len(text["text"]), len(text["he"]))):
                index_text("%s:%d" % (ref, i+1))


def make_text_index_document(ref, version, lang):
    """
    Create a document for indexing from the text specified by ref/version/lang
    """
    text = texts.get_text(ref, context=0, commentary=False, version=version, lang=lang)

    if "error" in text:
        print text["error"]
        return None

    if text["type"] == "Talmud":
        title = text["book"] + " Daf " + text["sections"][0]
    elif text["type"] == "Commentary" and text["commentaryCategories"][0] == "Talmud":
        title = text["book"] + " Daf " + text["sections"][0] + " Line " + str(text["sections"][1])
    else:
        title = text["book"] + " " + " ".join(["%s %d" % (p[0],p[1]) for p in zip(text["sectionNames"], text["sections"])])
    title += " (%s)" % version

    content = text["he"] if lang == 'he' else text["text"] 
    if isinstance(content, list):
        content = " ".join(content)

    return {
        "title": title, 
        "ref": ref, 
        "version": version, 
        "lang": lang,
        "titleVariants": text["titleVariants"],
        "content": content,
        "categories": text["categories"],
        }


def make_text_doc_id(ref, version, lang):
    """
    Returns a doc id string for indexing based on ref, versiona and lang.

    [HACK] Since Elasticsearch chokes on non-ascii ids, hebrew titles are converted 
    into a number using unicode_number. This mapping should be unique, but actually isn't.
    (any tips welcome) 
    """
    try:
        version.decode('ascii')
    except Exception, e:
        print e
        print "non ascii version caught"
        version = str(unicode_number(version))

    id = "%s (%s [%s])" % (ref, version, lang)
    return id


def unicode_number(u):
    """
    Returns a number corresponding to the sum value
    of each unicode character in u
    """
    n = 0
    for i in range(len(u)):
        n += ord(u[i])
    return n


def index_sheet(id):
    sheet = texts.db.sheets.find_one({"id": id})
    if not sheet: return False

    doc = {
        "title": sheet["title"],
        "content": make_sheet_text(sheet),
        "version": "Source Sheet by " + user_link(sheet["owner"]),
        "sheetId": id,
    }
    try:
        es.index(doc, 'sefaria', 'sheet', id)
        global doc_count
        doc_count += 1
    except Exception, e:
        print "Error indexing sheet %d" % id
        print e


def make_sheet_text(sheet):
    """
    Returns a plain text representation of the content on sheet.
    """
    text = sheet["title"] + " "
    for s in sheet["sources"]:
        text += source_text(s) + " "

    return text


def source_text(source):
    """
    Recursive function to translate a source dictionary into text.
    """
    content = [
        source.get("customTitle", ""),
        source.get("ref", ""),
        source.get("text", {"he": ""})["he"],
        source.get("text", {"en": ""})["en"],
        source.get("comment", ""),
        source.get("outside", ""),
        ]
    text = " ".join(content)

    if "subsources" in source:
        for s in source["subsources"]:
            text += source_text(s)

    return text

def ts():
    sheet = texts.db.sheets.find_one({"id": 15})
    print make_sheet_text(sheet)


def create_index():

    clear_index()

    settings = {
        "index" : {
            "analysis" : {
                "analyzer" : {
                    "default" : {
                        "tokenizer": "standard",
                        "filter": [
                                "standard", 
                                "lowercase", 
                                "icu_normalizer", 
                                "icu_folding", 
                                "icu_collation",
                                "my_snow"
                                ]
                    }
                },
                "filter" : {
                    "my_snow" : {
                        "type" : "snowball",
                        "language" : "English"
                    }
                }
            }
        }
    }

    es.indices.create_index("sefaria", settings)

    text_mapping = {
        'categories': {
            'type': 'string',
            'index': 'not_analyzed',
        }
    }
    es.indices.put_mapping("text", {'properties': text_mapping}, ["sefaria"])

    sheet_mapping = {

    }
    es.indices.put_mapping("sheet", {'properties': sheet_mapping}, ["sefaria"])


def index_all_sections():
    create_index()
    refs = texts.generate_refs_list()
    for ref in refs:
        index_text(ref)
    print "Indexed %d document." % doc_count


def index_public_sheets():
    ids = texts.db.sheets.find({"status": {"$in": LISTED_SHEETS}}).distinct("id")
    for id in ids:
        index_sheet(id)


def clear_index():
    try:
        es.indices.delete_index("sefaria")
    except Exception, e:
        print e


def go():
    import datetime
    global doc_count
    start = datetime.datetime.now()
    index_all_sections()
    end = datetime.datetime.now()
    print "Elapsed time: %s" % str(end-start)