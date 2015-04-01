# -*- coding: utf-8 -*-
"""
search.py - full-text search for Sefaria using ElasticSearch

Writes to MongoDB Collection: index_queue
"""
import os
from pprint import pprint
from datetime import datetime, timedelta

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

from pyelasticsearch import ElasticSearch

from sefaria.model import *
from sefaria.utils.users import user_link
from sefaria.system.database import db
from sefaria.utils.util import strip_tags
from settings import SEARCH_HOST, SEARCH_INDEX_NAME
import sefaria.model.queue as qu


es = ElasticSearch(SEARCH_HOST)

doc_count = 0


def index_text(tref, version=None, lang=None):
    """
    Index the text designated by ref.
    If no version and lang are given, this functon will be called for each availble version.
    Currently assumes ref is at section level. 
    """
    #tref = texts.norm_ref(unicode(tref))
    #todo: why the unicode()?
    tref = Ref(tref).normal()

    # Recall this function for each specific text version, if non provided
    if not (version and lang):
        for v in Ref(tref).version_list():
            index_text(tref, version=v["versionTitle"], lang=v["language"])
        return

    # Index each segment of this document individually
    oref = Ref(tref).padded_ref()
    if len(oref.sections) < len(oref.index_node.sectionNames):
        t = TextChunk(Ref(tref), lang="en", vtitle=version)

        for i in range(len(t.text)):
            index_text("%s:%d" % (tref, i+1))

    # Don't try to index docs with depth 3
    if len(oref.sections) < len(oref.index_node.sectionNames) - 1:
        return

    # Index this document as a whole
    doc = make_text_index_document(tref, version, lang)
    if doc:
        try:
            global doc_count
            if doc_count % 5000 == 0:
                print "[%d] Indexing %s / %s / %s" % (doc_count, tref, version, lang)
            es.index('sefaria', 'text', doc, make_text_doc_id(tref, version, lang))
            doc_count += 1
        except Exception, e:
            print "ERROR indexing %s / %s / %s" % (tref, version, lang)
            pprint(e)


def make_text_index_document(tref, version, lang):
    """
    Create a document for indexing from the text specified by ref/version/lang
    """
    #text = texts.get_text(tref, context=0, commentary=False, version=version, lang=lang)
    text = TextFamily(Ref(tref), context=0, commentary=False, version=version, lang=lang).contents()

    if text["type"] == "Talmud":
        title = text["book"] + " Daf " + text["sections"][0]
    elif text["type"] == "Commentary" and text["commentaryCategories"][0] == "Talmud":
        title = text["book"] + " Daf " + text["sections"][0]
    else:
        title = text["book"] + " " + " ".join(["%s %d" % (p[0],p[1]) for p in zip(text["sectionNames"], text["sections"])])
    title += " (%s)" % version

    if lang == "he":
        title = text.get("heTitle", "") + " " + title

    content = text["he"] if lang == 'he' else text["text"] 
    if not content:
        # Don't bother indexing if there's no content
        return False
    if isinstance(content, list):
        content = " ".join(content)

    return {
        "title": title, 
        "ref": tref,
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
    """
    Index source sheet with 'id'.
    """

    sheet = db.sheets.find_one({"id": id})
    if not sheet: return False

    doc = {
        "title": sheet["title"],
        "content": make_sheet_text(sheet),
        "version": "Source Sheet by " + user_link(sheet["owner"]),
        "sheetId": id,
    }
    try:
        es.index('sefaria', 'sheet', doc, id)
        global doc_count
        doc_count += 1
    except Exception, e:
        print "Error indexing sheet %d" % id
        print e


def make_sheet_text(sheet):
    """
    Returns a plain text representation of the content of sheet.
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
        source.get("text", {"he": ""}).get("he", ""),
        source.get("text", {"en": ""}).get("en", ""),
        source.get("comment", ""),
        source.get("outside", ""),
        ]
    content = [strip_tags(c) for c in content]
    text = " ".join(content)

    if "subsources" in source:
        for s in source["subsources"]:
            text += source_text(s)

    return text


def create_index():
    """
    Clears the "sefaria" index and creates it fresh with the below settings.
    """
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
    es.create_index(SEARCH_INDEX_NAME, settings)

    put_text_mapping()
    put_sheet_mapping()


def put_text_mapping():
    """
    Settings mapping for the text document type.
    """
    text_mapping = {
        'text' : {
            'properties' : {
                'categories': {
                    'type': 'string',
                    'index': 'not_analyzed',
                }
            }
        }
    }
    es.put_mapping(SEARCH_INDEX_NAME, "text", text_mapping)


def put_sheet_mapping():
    """
    Sets mapping for the sheets document type.
    """

    '''
    sheet_mapping = {
        "sheet" : {
            "properties" : {

            }
        }

    }
    es.put_mapping(SEARCH_INDEX_NAME, "sheet", sheet_mapping)
    '''

    # currently a no-op
    return


def index_all_sections(skip=0):
    """
    Step through refs of all sections of available text and index each. 
    """
    global doc_count
    doc_count = 0

    #refs = counts.generate_refs_list()
    refs = library.ref_list()
    print "Beginning index of %d refs." % len(refs)

    if skip:
        refs = refs[skip:]

    for i in range(skip, len(refs)):
        index_text(refs[i])
        if i % 200 == 0:
            print "Indexed Ref #%d" % i

    print "Indexed %d documents." % doc_count


def index_public_sheets():
    """
    Index all source sheets that are publically listed.
    """
    from sheets import LISTED_SHEETS
    ids = db.sheets.find({"status": {"$in": LISTED_SHEETS}}).distinct("id")
    for id in ids:
        index_sheet(id)


def index_public_notes():
    """
    Index all public notes.

    TODO
    """
    pass


def clear_index():
    """
    Delete the search index.
    """
    try:
        es.delete_index(SEARCH_INDEX_NAME)
    except Exception, e:
        print "Error deleting Elasticsearch Index named %s" % SEARCH_INDEX_NAME
        print e


def add_ref_to_index_queue(ref, version, lang):
    """
    Adds a text to index queue to be indexed later.
    """
    qu.IndexQueue({
        "ref": ref,
        "lang": lang,
        "version": version,
        "type": "ref",
    }).save()

    return True


def index_from_queue():
    """
    Index every ref/version/lang found in the index queue.
    Delete queue records on success.
    """
    queue = db.index_queue.find()
    for item in queue:
        try:
            index_text(item["ref"], version=item["version"], lang=item["lang"])
            db.index_queue.remove(item)
        except Exception, e:
            import sys
            reload(sys)
            sys.setdefaultencoding("utf-8")
            print "Error indexing from queue (%s / %s / %s)" % (item["ref"], item["version"], item["lang"])
            print e


def add_recent_to_queue(ndays):
    """
    Look through the last ndays of the activitiy log, 
    add to the index queue any refs that had their text altered.
    """
    cutoff = datetime.now() - timedelta(days=ndays)
    query = {
        "date": {"$gt": cutoff},
        "rev_type": {"$in": ["add text", "edit text"]}
    }
    activity = db.history.find(query)
    refs = set()
    for a in activity:
        refs.add((a["ref"], a["version"], a["language"]))
    for ref in list(refs):
        add_ref_to_index_queue(ref[0], ref[1], ref[2])


def index_all(skip=0, clear=False):
    """
    Fully create the search index from scratch.
    """
    start = datetime.now()
    if clear:
        create_index()
    index_all_sections(skip=skip)
    index_public_sheets()
    end = datetime.now()
    print "Elapsed time: %s" % str(end-start)






