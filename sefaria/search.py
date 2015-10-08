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

import logging
logger = logging.getLogger(__name__)

from pyelasticsearch import ElasticSearch

from sefaria.model import *
from sefaria.utils.users import user_link
from sefaria.system.database import db
from sefaria.utils.util import strip_tags
from settings import SEARCH_ADMIN, SEARCH_INDEX_NAME
from sefaria.summaries import REORDER_RULES
from sefaria.utils.hebrew import hebrew_term
import sefaria.model.queue as qu


es = ElasticSearch(SEARCH_ADMIN)

doc_count = 0


def index_text(oref, version=None, lang=None, bavli_amud=True):
    """
    Index the text designated by ref.
    If no version and lang are given, this function will be called for each available version.
    Currently assumes ref is at section level. 
    """
    assert isinstance(oref, Ref)

    # Recall this function for each specific text version, if none provided
    if not (version and lang):
        for v in oref.version_list():
            index_text(oref, version=v["versionTitle"], lang=v["language"], bavli_amud=bavli_amud)
        return

    # Index each segment of this document individually
    padded_oref = oref.padded_ref()
    if bavli_amud and padded_oref.is_bavli():  # Index bavli by amud. and commentaries by line
        pass
    elif len(padded_oref.sections) < len(padded_oref.index_node.sectionNames):
        t = TextChunk(oref, lang=lang, vtitle=version)

        for ref in oref.subrefs(len(t.text)):
            index_text(ref, version=version, lang=lang, bavli_amud=bavli_amud)
        return  # Returning at this level prevents indexing of full chapters

    '''   Can't get here after the return above
    # Don't try to index docs with depth 3
    if len(oref.sections) < len(oref.index_node.sectionNames) - 1:
        return
    '''

    # Index this document as a whole
    try:
        doc = make_text_index_document(oref.normal(), version, lang)
    except Exception as e:
        logger.error(u"Error making index document {} / {} / {} : {}".format(oref.normal(), version, lang, e.message))
        return

    if doc:
        try:
            global doc_count
            if doc_count % 5000 == 0:
                logger.info(u"[{}] Indexing {} / {} / {}".format(doc_count, oref.normal(), version, lang))
            es.index('sefaria', 'text', doc, make_text_doc_id(oref.normal(), version, lang))
            doc_count += 1
        except Exception, e:
            logger.error(u"ERROR indexing {} / {} / {} : {}".format(oref.normal(), version, lang, e))

def delete_text(oref, version, lang):
    try:
        id = make_text_doc_id(oref.normal(), version, lang)
        es.delete('sefaria', 'text', id)
    except Exception, e:
        logger.error(u"ERROR deleting {} / {} / {} : {}".format(oref.normal(), version, lang, e))

def make_text_index_document(tref, version, lang):
    """
    Create a document for indexing from the text specified by ref/version/lang
    """
    oref = Ref(tref)
    text = TextFamily(oref, context=0, commentary=False, version=version, lang=lang).contents()

    content = text["he"] if lang == 'he' else text["text"]
    if not content:
        # Don't bother indexing if there's no content
        return False

    if isinstance(content, list):
        content = " ".join(content)

    if text["type"] == "Talmud":
        title = text["book"] + " Daf " + text["sections"][0]
    elif text["type"] == "Commentary" and text["commentaryCategories"][0] == "Talmud":
        title = text["book"] + " Daf " + text["sections"][0]
    else:
        title = text["book"] + " " + " ".join([u"{} {}".format(p[0], p[1]) for p in zip(text["sectionNames"], text["sections"])])
    title += u" ({})".format(version)

    if lang == "he":
        title = text.get("heTitle", "") + " " + title


    if text["categories"][0] in REORDER_RULES:
        categories = REORDER_RULES[text["categories"][0]] + text["categories"][1:]
    else:
        categories = text["categories"]

    return {
        "title": title, 
        "ref": oref.normal(),
        "heRef": oref.he_normal(),
        "version": version, 
        "lang": lang,
        "titleVariants": text["titleVariants"],
        "content": content,
        "he_content": content if (lang == "he") else "",
#        "context_3": oref.surrounding_ref().text(lang, version).ja().flatten_to_string(),
#        "context_7": oref.surrounding_ref(3).text(lang, version).ja().flatten_to_string(),
        "categories": categories,
        "order": oref.order_id(),
        # and
        "path": "/".join(text["categories"] + [oref.index.title])
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
                },
                "category": {
                    'type': 'string',
                    'index': 'not_analyzed',
                },
                "he_category": {
                    'type': 'string',
                    'index': 'not_analyzed',
                },
                "index_title": {
                    'type': 'string',
                    'index': 'not_analyzed',
                },
                "path": {
                    'type': 'string',
                    'index': 'not_analyzed',
                },
                "he_index_title": {
                    'type': 'string',
                    'index': 'not_analyzed',
                },
                "he_path": {
                    'type': 'string',
                    'index': 'not_analyzed',
                },
                "order": {
                    'type': 'string',
                    'index': 'not_analyzed'
                },
                "he_content": {
                    'type': 'string',
                    'analyzer': 'hebrew'
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


    for i in range(skip, len(refs)):
        index_text(refs[i])
        if i % 200 == 0:
            print "Indexed Ref #%d" % i

    print "Indexed %d documents." % doc_count


def index_public_sheets():
    """
    Index all source sheets that are publically listed.
    """
    ids = db.sheets.find({"status": "public"}).distinct("id")
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
            index_text(Ref(item["ref"]), version=item["version"], lang=item["lang"])
            db.index_queue.remove(item)
        except Exception, e:
            import sys
            reload(sys)
            sys.setdefaultencoding("utf-8")
            logging.error(u"Error indexing from queue ({} / {} / {}) : {}".format(item["ref"], item["version"], item["lang"], e))


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






