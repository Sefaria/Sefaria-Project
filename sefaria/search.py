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
import pymongo

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

import logging
import json
import math
import collections
from logging import NullHandler
import time as pytime
logger = logging.getLogger(__name__)

from elasticsearch import Elasticsearch
from elasticsearch.client import IndicesClient
from elasticsearch.helpers import bulk
from elasticsearch.exceptions import NotFoundError
from sefaria.model import *
from sefaria.model.text import AbstractIndex
from sefaria.model.user_profile import user_link, public_user_data
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.utils.util import strip_tags
from settings import SEARCH_ADMIN, SEARCH_INDEX_NAME_TEXT, SEARCH_INDEX_NAME_SHEET, SEARCH_INDEX_NAME_MERGED, STATICFILES_DIRS
from sefaria.utils.hebrew import hebrew_term
from sefaria.utils.hebrew import strip_cantillation
import sefaria.model.queue as qu

def init_pagesheetrank_dicts():
    global pagerank_dict, sheetrank_dict
    try:
        pagerank_dict = {r: v for r, v in json.load(open(STATICFILES_DIRS[0] + "pagerank.json","rb"))}
    except IOError:
        pagerank_dict = {}
    try:
        sheetrank_dict = json.load(open(STATICFILES_DIRS[0] + "sheetrank.json", "rb"))
    except IOError:
        sheetrank_dict = {}

init_pagesheetrank_dicts()
all_gemara_indexes = library.get_indexes_in_category("Bavli")
davidson_indexes = all_gemara_indexes[:all_gemara_indexes.index("Horayot") + 1]

es_client = Elasticsearch(SEARCH_ADMIN)
index_client = IndicesClient(es_client)

tracer = logging.getLogger('elasticsearch')
tracer.setLevel(logging.CRITICAL)
#tracer.addHandler(logging.FileHandler('/tmp/es_trace.log'))
tracer.addHandler(NullHandler())

doc_count = 0


def delete_text(oref, version, lang):
    try:
        not_merged_name = get_new_and_current_index_names('text')['current']
        merged_name = get_new_and_current_index_names('merged')['current']

        id = make_text_doc_id(oref.normal(), version, lang)
        es_client.delete(index=not_merged_name, doc_type='text', id=id)
        id = make_text_doc_id(oref.normal(), None, lang)
        es_client.delete(index=merged_name, doc_type='text', id=id)
    except Exception, e:
        logger.error(u"ERROR deleting {} / {} / {} : {}".format(oref.normal(), version, lang, e))


def delete_version(index, version, lang):
    assert isinstance(index, AbstractIndex)

    refs = []

    if Ref(index.title).is_bavli() and index.title not in davidson_indexes:
        refs += index.all_section_refs()
    refs += index.all_segment_refs()

    for ref in refs:
        delete_text(ref, version, lang)


def delete_sheet(index_name, id):
    try:
        es_client.delete(index=index_name, doc_type='sheet', id=id)
    except Exception, e:
        logger.error(u"ERROR deleting sheet {}".format(id))


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
    try:
        doc = {
            "title": strip_tags(sheet["title"]),
            "content": make_sheet_text(sheet, pud),
            "owner_id": sheet["owner"],
            "owner_name": pud["name"],
            "owner_image": pud["imageUrl"],
            "profile_url": pud["profileUrl"],
            "version": "Source Sheet by " + user_link(sheet["owner"]),
            "tags": sheet.get("tags", []),
            "sheetId": id,
            "summary": sheet.get("summary", None),
            "group": sheet.get("group", None),
            "datePublished": sheet.get("datePublished", None),
            "dateCreated": sheet.get("dateCreated", None),
            "dateModified": sheet.get("dateCreated", None),
            "views": sheet.get("views", 0)
        }
        es_client.create(index=index_name, doc_type='sheet', id=id, body=doc)
        global doc_count
        doc_count += 1
        return True
    except Exception, e:
        print "Error indexing sheet %d" % id
        print e
        return False


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


def create_index(index_name, type):
    """
    Clears the "sefaria" and "merged" indexes and creates it fresh with the below settings.
    """
    try:
        clear_index(index_name)
    except ElasticHttpError:
        logging.warning("Failed to delete non-existent index: {}".format(index_name))

    settings = {
        "index": {
            "blocks": {
                "read_only_allow_delete": False
            },
            "analysis" : {
                "analyzer" : {
                    "my_standard" : {
                        "tokenizer": "standard",
                        "char_filter": [
                            "icu_normalizer"
                        ],
                        "filter": [
                                "standard",
                                "lowercase",
                                "icu_folding",
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
    index_client.create(index=index_name, body=settings)

    if type == 'text' or type == 'merged':
        put_text_mapping(index_name)
    elif type == 'sheet':
        put_sheet_mapping()


def put_text_mapping(index_name):
    """
    Settings mapping for the text document type.
    """
    text_mapping = {
        'properties' : {
            'categories': {
                'type': 'keyword',
            },
            "category": {
                'type': 'keyword',
            },
            "he_category": {
                'type': 'keyword',
            },
            "index_title": {
                'type': 'keyword',
            },
            "path": {
                'type': 'keyword',
            },
            "he_index_title": {
                'type': 'keyword',
            },
            "he_path": {
                'type': 'keyword',
            },
            "order": {
                'type': 'keyword',
            },
            "pagesheetrank": {
                'type': 'double',
                'index': False
            },
            "comp_date": {
                'type': 'integer',
                'index': False
            },
            "version_priority": {
                'type': 'integer',
                'index': False
            },
            #"hebmorph_semi_exact": {
            #    'type': 'string',
            #    'analyzer': 'hebrew',
            #    'search_analyzer': 'sefaria-semi-exact'
            #},
            "exact": {
                'type': 'text',
                'analyzer': 'my_standard'
            },
            # backwards compat for android
            "content": {
                'type': 'text',
                'analyzer': 'my_standard'
            },
            "naive_lemmatizer": {
                'type': 'text',
                'analyzer': 'sefaria-naive-lemmatizer',
                'search_analyzer': 'sefaria-naive-lemmatizer-less-prefixes'
            }
        }
    }
    index_client.put_mapping(doc_type='text', body=text_mapping, index=index_name)


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


class TextIndexer(object):

    @classmethod
    def create_terms_dict(cls):
        cls.terms_dict = {}
        ts = TermSet()
        for t in ts:
            cls.terms_dict[t.name] = t.contents()

    @classmethod
    def create_version_priority_map(cls):
        toc = library.get_toc()
        cls.version_priority_map = {}

        def traverse(mini_toc):
            if type(mini_toc) == list:
                for t in mini_toc:
                    traverse(t)
            elif "contents" in mini_toc:
                for t in mini_toc["contents"]:
                    traverse(t)
            elif "title" in mini_toc:
                title = mini_toc["title"]
                r = Ref(title)
                vlist = r.version_list()
                vpriorities = {
                    u"en": 0,
                    u"he": 0
                }
                for i, v in enumerate(vlist):
                    lang = v["language"]
                    cls.version_priority_map[(title, v["versionTitle"], lang)] = (vpriorities[lang], mini_toc["categories"])
                    vpriorities[lang] += 1

        traverse(toc)

    @classmethod
    def get_all_versions(cls, tries=0, versions=None, page=0):
        if versions is None:
            versions = []
        try:
            version_limit = 10
            temp_versions = []
            first_run = True
            while first_run or len(temp_versions) > 0:
                temp_versions = VersionSet(limit=version_limit, page=page).array()
                versions += temp_versions
                page += 1
                first_run = False
            return versions
        except pymongo.errors.AutoReconnect as e:
            if tries < 200:
                pytime.sleep(5)
                return cls.get_all_versions(tries+1, versions, page)
            else:
                print "Tried: {} times. Got {} versions".format(tries, len(versions))
                raise e

    @classmethod
    def index_all(cls, index_name, merged=False, debug=False):
        cls.index_name = index_name
        cls.merged = merged
        cls.create_version_priority_map()
        cls.create_terms_dict()

        versions = sorted(filter(lambda x: (x.title, x.versionTitle, x.language) in cls.version_priority_map, cls.get_all_versions()), key=lambda x: cls.version_priority_map[(x.title, x.versionTitle, x.language)][0])
        versions_by_index = {}
        # organizing by index for the merged case
        for v in versions:
            Ref.clear_cache()  # try to clear Ref cache to save RAM
            key = (v.title, v.language)
            if key in versions_by_index:
                versions_by_index[key] += [v]
            else:
                versions_by_index[key] = [v]
        print "Beginning index of {} versions.".format(len(versions))
        vcount = 0
        total_versions = len(versions)
        versions = None  # release RAM
        for title, vlist in versions_by_index.items():
            cls.trefs_seen = set()
            cls._bulk_actions = []
            cls.curr_index = vlist[0].get_index() if len(vlist) > 0 else None
            for v in vlist:
                if v.versionTitle == u"Yehoyesh's Yiddish Tanakh Translation [yi]":
                    print "skipping yiddish. we don't like yiddish"
                    continue

                cls.index_version(v)
                print "Indexed Version {}/{}".format(vcount, total_versions)
                vcount += 1
            bulk(es_client, cls._bulk_actions, stats_only=True, raise_on_error=False)


    @classmethod
    def index_version(cls, version):
        version.walk_thru_contents(cls._cache_action, heTref=cls.curr_index.get_title('he'), schema=cls.curr_index.schema, terms_dict=cls.terms_dict)


    @classmethod
    def index_ref(cls, index_name, oref, version_title, lang, merged):
        # slower than `cls.index_version` but useful when you don't want the overhead of loading all versions into cache
        cls.merged = merged
        cls.index_name = index_name
        cls.curr_index = oref.index
        cls.trefs_seen = set()
        version_priority = 0
        version = None
        if not merged:
            for priority, v in enumerate(oref.version_list()):
                if v['versionTitle'] == version_title:
                    version_priority = priority
                    version = v
        content = TextChunk(oref, lang, vtitle=version_title).ja().flatten_to_string()
        categories = cls.curr_index.categories
        tref = oref.normal()
        doc = cls.make_text_index_document(tref, oref.he_normal(), version, lang, version_priority, content, categories)
        id = make_text_doc_id(tref, version_title, lang)
        es_client.index(index_name, "text", doc, id)

    @classmethod
    def _cache_action(cls, segment_str, tref, heTref, version):
        # Index this document as a whole
        # dont index the same ref more than once in the case you're merged
        if cls.merged and tref in cls.trefs_seen:
            return
        cls.trefs_seen.add(tref)
        vtitle = version.versionTitle
        vlang = version.language
        try:
            version_priority, categories = cls.version_priority_map[(version.title, vtitle, vlang)]
            #TODO include sgement_str in this func
            doc = cls.make_text_index_document(tref, heTref, vtitle, vlang, version_priority, segment_str, categories)
            # print doc
        except Exception as e:
            logger.error(u"Error making index document {} / {} / {} : {}".format(tref, vtitle, vlang, e.message))
            return

        if doc:
            try:
                cls._bulk_actions += [
                    {
                        "_index": cls.index_name,
                        "_type": "text",
                        "_id": make_text_doc_id(tref, vtitle, vlang),
                        "_source": doc
                    }
                ]
            except Exception, e:
                logger.error(u"ERROR indexing {} / {} / {} : {}".format(tref, vtitle, vlang, e))

    @classmethod
    def make_text_index_document(cls, tref, heTref, version, lang, version_priority, content, categories):
        """
        Create a document for indexing from the text specified by ref/version/lang
        """
        oref = Ref(tref)
        text = TextFamily(oref, context=0, commentary=False, version=version, lang=lang).contents()

        if not content:
            # Don't bother indexing if there's no content
            return False

        content = bleach.clean(content, strip=True, tags=())
        content_wo_cant = strip_cantillation(content, strip_vowels=False)
        content_wo_cant = re.sub(ur'\([^)]+\)', u'', content_wo_cant.strip())  # remove all parens
        if len(content_wo_cant) == 0:
            return False

        if getattr(cls.curr_index, "dependence", None) == 'Commentary' and "Commentary" in text["categories"]:  # uch, special casing
            temp_categories = text["categories"][:]
            temp_categories.remove('Commentary')
            temp_categories[0] += " Commentaries"  # this will create an additional bucket for each top level category's commentary
        else:
            temp_categories = categories

        tp = cls.curr_index.best_time_period()
        if not tp is None:
            comp_start_date = int(tp.start)
        else:
            comp_start_date = 3000  # far in the future

        section_ref = tref[:tref.rfind(u":")] if u":" in tref else (tref[:re.search(ur" \d+$", tref).start()] if re.search(ur" \d+$", tref) is not None else tref)

        pagerank = math.log(pagerank_dict[section_ref]) + 20 if section_ref in pagerank_dict else 1.0
        sheetrank = (1.0 + sheetrank_dict[tref]["count"] / 5)**2 if tref in sheetrank_dict else (1.0 / 5) ** 2
        return {
            "ref": tref,
            "heRef": heTref,
            "version": version,
            "lang": lang,
            "version_priority": version_priority if version_priority is not None else 1000,
            "titleVariants": text["titleVariants"],
            "categories": temp_categories,
            "order": oref.order_id(),
            "path": "/".join(temp_categories + [cls.curr_index.title]),
            "pagesheetrank": pagerank * sheetrank,
            "comp_date": comp_start_date,
            #"hebmorph_semi_exact": content_wo_cant,
            "content": content_wo_cant if cls.merged else u"",  # backwards compat for android
            "exact": content_wo_cant,
            "naive_lemmatizer": content_wo_cant,
        }


def index_sheets_by_timestamp(timestamp):
    """
    :param timestamp str: index all sheets modified after `timestamp` (in isoformat)
    """

    name_dict = get_new_and_current_index_names('sheet', debug=False)
    curr_index_name = name_dict['current']
    try:
        ids = db.sheets.find({"status": "public", "dateModified": {"$gt": timestamp}}).distinct("id")
    except Exception, e:
        print e
        return str(e)

    succeeded = []
    failed = []

    for id in ids:
        did_succeed = index_sheet(curr_index_name, id)
        if did_succeed:
            succeeded += [id]
        else:
            failed += [id]

    return {"succeeded": {"num": len(succeeded), "ids": succeeded}, "failed": {"num": len(failed), "ids": failed}}


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
        index_client.delete(index=index_name)
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
    index_name = get_new_and_current_index_names('text')['current']
    index_name_merged = get_new_and_current_index_names('merged')['current']
    queue = db.index_queue.find()
    for item in queue:
        try:
            TextIndexer.index_ref(index_name, Ref(item["ref"]), item["version"], item["lang"], False)
            TextIndexer.index_ref(index_name_merged, Ref(item["ref"]), None, item["lang"], True)
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

def get_new_and_current_index_names(type, debug=False):
    base_index_name_dict = {
        'text': SEARCH_INDEX_NAME_TEXT,
        'sheet': SEARCH_INDEX_NAME_SHEET,
        'merged': SEARCH_INDEX_NAME_MERGED
    }
    index_name_a = "{}-a{}".format(base_index_name_dict[type], '-debug' if debug else '')
    index_name_b = "{}-b{}".format(base_index_name_dict[type], '-debug' if debug else '')
    alias_name = "{}{}".format(base_index_name_dict[type], '-debug' if debug else '')

    aliases = index_client.get_alias()
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
    if merged:
        index_all_of_type('merged', skip=skip, merged=merged, debug=debug)
    else:
        index_all_of_type('text', skip=skip, merged=merged, debug=debug)
        index_all_of_type('sheet', skip=skip, merged=merged, debug=debug)
    end = datetime.now()
    print "Elapsed time: %s" % str(end-start)

def index_all_of_type(type, skip=0, merged=False, debug=False):
    index_names_dict = get_new_and_current_index_names(type=type, debug=debug)
    print 'CREATING / DELETING {}'.format(index_names_dict['new'])
    print 'CURRENT {}'.format(index_names_dict['current'])
    for i in range(10):
        print 'STARTING IN T-MINUS {}'.format(10 - i)
        pytime.sleep(1)

    if skip == 0:
        create_index(index_names_dict['new'], type)
    if type == 'text' or type == 'merged':
        TextIndexer.index_all(index_names_dict['new'], merged=merged, debug=debug)
    elif type == 'sheet':
        index_public_sheets(index_names_dict['new'])

    try:
        #index_client.put_settings(index=index_names_dict['current'], body={"index": { "blocks": { "read_only_allow_delete": False }}})
        index_client.delete_alias(index=index_names_dict['current'], name=index_names_dict['alias'])
        if merged:
            # backwards compat for android
            index_client.delete_alias(index=index_names_dict['current'], name="merged-c")
        print "Successfully deleted alias {} for index {}".format(index_names_dict['alias'], index_names_dict['current'])
    except NotFoundError:
        print "Failed to delete alias {} for index {}".format(index_names_dict['alias'], index_names_dict['current'])
    clear_index(index_names_dict['alias']) # make sure there are no indexes with the alias_name

    #index_client.put_settings(index=index_names_dict['new'], body={"index": { "blocks": { "read_only_allow_delete": False }}})
    index_client.put_alias(index=index_names_dict['new'], name=index_names_dict['alias'])
    if merged:
        # backwards compart for android
        index_client.put_alias(index=index_names_dict['new'], name="merged-c")
    if index_names_dict['new'] != index_names_dict['current']:
        clear_index(index_names_dict['current'])


def index_all_commentary_refactor(skip=0, merged=False, debug=False):
    start = datetime.now()

    new_index_name = '{}-c'.format(SEARCH_INDEX_NAME_MERGED)

    if skip == 0:
        create_index(new_index_name, 'merged')
    TextIndexer.index_all(new_index_name, merged=merged, debug=debug)

    end = datetime.now()
    print "Elapsed time: %s" % str(end-start)
