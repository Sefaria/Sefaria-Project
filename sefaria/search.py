# -*- coding: utf-8 -*-
"""
search.py - full-text search for Sefaria using ElasticSearch

Writes to MongoDB Collection: index_queue
"""
import os
from pprint import pprint
from datetime import datetime, timedelta
import re
import bleach

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

import logging
from django.utils.log import NullHandler
logger = logging.getLogger(__name__)

from pyelasticsearch import ElasticSearch
from pyelasticsearch import ElasticHttpNotFoundError, ElasticHttpError

from sefaria.model import *
from sefaria.model.text import AbstractIndex
from sefaria.model.user_profile import user_link, public_user_data
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.utils.util import strip_tags
from settings import SEARCH_ADMIN, SEARCH_INDEX_NAME
from sefaria.utils.hebrew import hebrew_term
import sefaria.model.queue as qu


es = ElasticSearch(SEARCH_ADMIN)
tracer = logging.getLogger('elasticsearch.trace')
tracer.setLevel(logging.INFO)
#tracer.addHandler(logging.FileHandler('/tmp/es_trace.log'))
tracer.addHandler(NullHandler())

doc_count = 0


def index_text(index_name, oref, version=None, lang=None, bavli_amud=True, merged=False):
    """
    Index the text designated by ref.
    If no version and lang are given, this function will be called for each available version.
    If `merged` is true, and lang is given, it will index a merged version of this document
   :param str index_name: The index name, as provided by `get_new_and_current_index_names`
    :param str oref: Currently assumes ref is at section level. :param str version: Version being indexed
    :param str lang: Language of version being indexed
    :param bool bavli_amud:  Is this Bavli? Bavli text is indexed by section, not segment.
    :param bool merged: is this a merged index?
    :return:
    """
    assert isinstance(oref, Ref)
    oref = oref.default_child_ref()

    # Recall this function for each specific text version, if none provided
    if merged and version:
        raise InputError("index_text() called with version title and merged flag.")
    if not merged and not (version and lang):
        for v in oref.version_list():
            index_text(index_name, oref, version=v["versionTitle"], lang=v["language"], bavli_amud=bavli_amud)
        return
    elif merged and not lang:
        for l in ["he", "en"]:
            index_text(index_name, oref, lang=l, bavli_amud=bavli_amud, merged=merged)
        return

    # Index each segment of this document individually
    padded_oref = oref.padded_ref()
    if bavli_amud and padded_oref.is_bavli():  # Index bavli by amud. and commentaries by line
        pass
    elif len(padded_oref.sections) < len(padded_oref.index_node.sectionNames):
        t = TextChunk(oref, lang=lang, vtitle=version) if not merged else TextChunk(oref, lang=lang)

        for ref in oref.subrefs(len(t.text)):
            index_text(index_name, ref, version=version, lang=lang, bavli_amud=bavli_amud, merged=merged)
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
            es.index(index_name, 'text', doc, make_text_doc_id(oref.normal(), version, lang))
            doc_count += 1
        except Exception, e:
            logger.error(u"ERROR indexing {} / {} / {} : {}".format(oref.normal(), version, lang, e))


def delete_text(oref, version, lang):
    try:
        not_merged_name = get_new_and_current_index_names(False)['current']
        merged_name = get_new_and_current_index_names(True)['current']

        id = make_text_doc_id(oref.normal(), version, lang)
        es.delete(not_merged_name, 'text', id)
        id = make_text_doc_id(oref.normal(), None, lang)
        es.delete(merged_name, 'text', id)
    except Exception, e:
        logger.error(u"ERROR deleting {} / {} / {} : {}".format(oref.normal(), version, lang, e))


def delete_version(index, version, lang):
    assert isinstance(index, AbstractIndex)

    refs = []

    if Ref(index.title).is_bavli():
        refs += index.all_section_refs()
    refs += index.all_segment_refs()

    for ref in refs:
        delete_text(ref, version, lang)


def index_full_version(index_name, index, version, lang):
    assert isinstance(index, AbstractIndex)

    for ref in index.all_section_refs():
        index_text(index_name, ref, version=version, lang=lang)


def delete_sheet(index_name, id):
    try:
        es.delete(index_name, "sheet", id)
    except Exception, e:
        logger.error(u"ERROR deleting sheet {}".format(id))


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

    content = bleach.clean(content, strip=True, tags=())

    if oref.is_talmud():
        title = text["book"] + " Daf " + text["sections"][0]
    else:
        title = text["book"] + " " + " ".join([u"{} {}".format(p[0], p[1]) for p in zip(text["sectionNames"], text["sections"])])
    title += u" ({})".format(version)

    if lang == "he":
        title = text.get("heTitle", "") + " " + title

    if getattr(oref.index, "dependence", None) == 'Commentary':  # uch, special casing
        categories = text["categories"][:]
        categories.remove('Commentary')
        categories[0] += " Commentaries"  # this will create an additional bucket for each top level category's commentary
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
        "categories": categories,
        "order": oref.order_id(),
        # and
        "path": "/".join(categories + [oref.index.title])
    }


def make_text_doc_id(ref, version, lang):
    """
    Returns a doc id string for indexing based on ref, versiona and lang.

    [HACK] Since Elasticsearch chokes on non-ascii ids, hebrew titles are converted 
    into a number using unicode_number. This mapping should be unique, but actually isn't.
    (any tips welcome) 
    """
    if not version:
        version = "merged"
    else:
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


def index_sheet(index_name, id):
    """
    Index source sheet with 'id'.
    """

    sheet = db.sheets.find_one({"id": id})
    if not sheet: return False

    pud = public_user_data(sheet["owner"])
    doc = {
        "title": sheet["title"],
        "content": make_sheet_text(sheet, pud),
        "owner_id": sheet["owner"],
        "owner_name": pud["name"],
        "owner_image": pud["imageUrl"],
        "profile_url": pud["profileUrl"],
        "version": "Source Sheet by " + user_link(sheet["owner"]),
        "tags": ",".join(sheet.get("tags",[])),
        "sheetId": id,
    }
    try:
        es.index(index_name, 'sheet', doc, id)
        global doc_count
        doc_count += 1
    except Exception, e:
        print "Error indexing sheet %d" % id
        print e


def make_sheet_text(sheet, pud):
    """
    Returns a plain text representation of the content of sheet.
    :param sheet: The sheet record
    :param pud: Public User Database record for the author
    """
    text = u"Source Sheets / Sources Sheet: " + sheet["title"]
    if pud.get("name"):
        text += u"\nBy: " + pud["name"]
    text += u"\n"
    if sheet.get("tags"):
        text += u" [" + u", ".join(sheet["tags"]) + u"]\n"
    for s in sheet["sources"]:
        text += source_text(s) + u" "

    text = bleach.clean(text, strip=True, tags=())

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


def create_index(index_name, merged=False):
    """
    Clears the "sefaria" and "merged" indexes and creates it fresh with the below settings.
    """
    try:
        clear_index(index_name)
    except ElasticHttpError:
        logging.warning("Failed to delete non-existent index: {}".format(index_name))

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
    print 'CReating index {}'.format(index_name)
    es.create_index(index_name, settings)

    put_text_mapping(index_name)
    if not merged:
        put_sheet_mapping()


def put_text_mapping(index_name):
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
    es.put_mapping(index_name, "text", text_mapping)


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


def index_all_sections(index_name, skip=0, merged=False, debug=False):
    """
    Step through refs of all sections of available text and index each. 
    """
    global doc_count
    doc_count = 0

    refs = library.ref_list()
    if debug:
        refs = refs[:10]
    print "Beginning index of %d refs." % len(refs)

    for i in range(skip, len(refs)):
        index_text(index_name, refs[i], merged=merged)
        if i % 200 == 0:
            print "Indexed Ref #%d" % i

    print "Indexed %d documents." % doc_count


def index_public_sheets(index_name):
    """
    Index all source sheets that are publicly listed.
    """
    ids = db.sheets.find({"status": "public"}).distinct("id")
    for id in ids:
        index_sheet(index_name, id)


def index_public_notes():
    """
    Index all public notes.

    TODO
    """
    pass


def clear_index(index_name):
    """
    Delete the search index.
    """
    try:
        es.delete_index(index_name)
    except Exception, e:
        print "Error deleting Elasticsearch Index named %s" % index_name
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
    index_name = get_new_and_current_index_names()['current']
    index_name_merged = get_new_and_current_index_names(merged=True)['current']
    queue = db.index_queue.find()
    for item in queue:
        try:
            index_text(index_name, Ref(item["ref"]), version=item["version"], lang=item["lang"])
            index_text(index_name_merged, Ref(item["ref"]), lang=item["lang"], merged=True)
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

def get_new_and_current_index_names(merged=False, debug=False):
    index_name_a = "{}-a{}".format(SEARCH_INDEX_NAME if not merged else "merged", '-debug' if debug else '')
    index_name_b = "{}-b{}".format(SEARCH_INDEX_NAME if not merged else "merged", '-debug' if debug else '')
    alias_name = "{}{}".format(SEARCH_INDEX_NAME if not merged else "merged",'-debug' if debug else '')

    aliases = es.aliases()
    try:
        a_alias = aliases[index_name_a]['aliases']
        choose_a = alias_name not in a_alias
    except KeyError:
        choose_a = True

    if choose_a:
        new_index_name = index_name_a
        old_index_name = index_name_b
    else:
        new_index_name = index_name_b
        old_index_name = index_name_a

    return {"new": new_index_name, "current": old_index_name, "alias": alias_name}


def index_all(skip=0, merged=False, debug=False):
    """
    Fully create the search index from scratch.
    """
    start = datetime.now()

    name_dict = get_new_and_current_index_names(merged=merged, debug=debug)
    new_index_name = name_dict['new']
    curr_index_name = name_dict['current']
    alias_name = name_dict['alias']
    if skip == 0:
        create_index(new_index_name, merged=merged)
    index_all_sections(new_index_name, skip=skip, merged=merged, debug=debug)
    if not merged:
        index_public_sheets(new_index_name)

    alias_actions = [
        {
            "remove": {
                "alias": alias_name,
                "index": curr_index_name
            }
        }
    ]
    try:
        es.update_aliases(alias_actions)
    except ElasticHttpNotFoundError:
        pass

    clear_index(alias_name) # make sure there are no indexes with the alias_name
    alias_actions = [ {
        "add": {
            "alias": alias_name,
            "index": new_index_name
        }
    }]
    es.update_aliases(alias_actions)

    clear_index(curr_index_name)
    end = datetime.now()
    print "Elapsed time: %s" % str(end-start)


def index_all_commentary_refactor(skip=0, merged=False, debug=False):
    start = datetime.now()

    new_index_name = '{}-b'.format(SEARCH_INDEX_NAME if not merged else 'merged')

    if skip == 0:
        create_index(new_index_name, merged=merged)
    index_all_sections(new_index_name, skip=skip, merged=merged, debug=debug)
    if not merged:
        index_public_sheets(new_index_name)

    end = datetime.now()
    print "Elapsed time: %s" % str(end-start)

# adapted to python from library.js:sjs.search.get_query_object()
def query(q, override=False):

    full_query = {
        "query": {
            "query_string":  {
              "query": re.sub('(\S)"(\S)', '\1\u05f4\2', q), #Replace internal quotes with gershaim.
              "default_operator": "AND",
              "fields": ["content"]
            }
        },
        "sort": [{
          "order": {}                 # the sort field name is "order"
        }],
        "highlight": {
          "pre_tags": ["<b>"],
          "post_tags": ["</b>"],
          "fields": {
              "content": {"fragment_size": 200}
          }
        }
    }

    full_query["size"] = 0
    res = es.search(full_query, index=SEARCH_INDEX_NAME, doc_type="text")
    size = res['hits']['total']
    if size > 4000 and not override:
        raise Exception("Size of query is {}.  Call again with override to proceed.".format(size))
    full_query["size"] = size
    res = es.search(full_query, index=SEARCH_INDEX_NAME, doc_type="text")
    return res

    #print("Got %d Hits:" % res['hits']['total'])
    #for hit in res['hits']['hits']:
        #print("%(timestamp)s %(author)s: %(text)s" % hit["_source"])