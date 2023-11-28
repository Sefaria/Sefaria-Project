# -*- coding: utf-8 -*-
"""
This file is meant to be temporary while we are migrating to elasticsearch 8

search.py - full-text search for Sefaria using ElasticSearch

Writes to MongoDB Collection: index_queue
"""
import os
from datetime import datetime, timedelta
import re
import bleach
import pymongo

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

import structlog
import logging
from logging import NullHandler
from collections import defaultdict
import time as pytime
logger = structlog.get_logger(__name__)

from elasticsearch import Elasticsearch
from elasticsearch.client import IndicesClient
from elasticsearch.helpers import bulk
from elasticsearch.exceptions import NotFoundError
from sefaria.model import *
from sefaria.model.text import AbstractIndex, AbstractTextRecord
from sefaria.model.user_profile import user_link, public_user_data
from sefaria.model.collection import CollectionSet
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.utils.util import strip_tags
from .settings import SEARCH_URL, SEARCH_INDEX_NAME_TEXT, SEARCH_INDEX_NAME_SHEET, STATICFILES_DIRS
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.utils.hebrew import strip_cantillation
import sefaria.model.queue as qu

es_client = Elasticsearch(SEARCH_URL)
index_client = IndicesClient(es_client)

tracer = structlog.get_logger(__name__)
tracer.setLevel(logging.CRITICAL)
#tracer.addHandler(logging.FileHandler('/tmp/es_trace.log'))
tracer.addHandler(NullHandler())

doc_count = 0


def delete_text(oref, version, lang):
    try:
        curr_index = get_new_and_current_index_names('text')['current']

        id = make_text_doc_id(oref.normal(), version, lang)
        es_client.delete(index=curr_index, doc_type='text', id=id)
    except Exception as e:
        logger.error("ERROR deleting {} / {} / {} : {}".format(oref.normal(), version, lang, e))


def delete_version(index, version, lang):
    assert isinstance(index, AbstractIndex)

    refs = []

    if SITE_SETTINGS["TORAH_SPECIFIC"]:
        all_gemara_indexes = library.get_indexes_in_category("Bavli")
        davidson_indexes = all_gemara_indexes[:all_gemara_indexes.index("Horayot") + 1]
        if Ref(index.title).is_bavli() and index.title not in davidson_indexes:
            refs += index.all_section_refs()

    refs += index.all_segment_refs()

    for ref in refs:
        delete_text(ref, version, lang)


def delete_sheet(index_name, id):
    try:
        es_client.delete(index=index_name, doc_type='sheet', id=id)
    except Exception as e:
        logger.error("ERROR deleting sheet {}".format(id))


def make_text_doc_id(ref, version, lang):
    """
    Returns a doc id string for indexing based on ref, versiona and lang.

    [HACK] Since Elasticsearch chokes on non-ascii ids, hebrew titles are converted
    into a number using unicode_number. This mapping should be unique, but actually isn't.
    (any tips welcome)
    """
    if not version.isascii():
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
    tag_terms_simple = make_sheet_tags(sheet)
    tags = [t["en"] for t in tag_terms_simple]
    topics = []
    for t in sheet.get('topics', []):
        topic_obj = Topic.init(t['slug'])
        if not topic_obj:
            continue
        topics += [topic_obj]
    collections = CollectionSet({"sheets": id, "listed": True})
    collection_names = [c.name for c in collections]
    try:
        doc = {
            "title": strip_tags(sheet["title"]),
            "content": make_sheet_text(sheet, pud),
            "owner_id": sheet["owner"],
            "owner_name": pud["name"],
            "owner_image": pud["imageUrl"],
            "profile_url": pud["profileUrl"],
            "version": "Source Sheet by " + user_link(sheet["owner"]),
            "tags": tags,
            "topic_slugs": [topic_obj.slug for topic_obj in topics],
            "topics_en": [topic_obj.get_primary_title('en') for topic_obj in topics],
            "topics_he": [topic_obj.get_primary_title('he') for topic_obj in topics],
            "sheetId": id,
            "summary": sheet.get("summary", None),
            "collections": collection_names,
            "datePublished": sheet.get("datePublished", None),
            "dateCreated": sheet.get("dateCreated", None),
            "dateModified": sheet.get("dateModified", None),
            "views": sheet.get("views", 0)
        }
        es_client.create(index=index_name, doc_type='sheet', id=id, body=doc)
        global doc_count
        doc_count += 1
        return True
    except Exception as e:
        print("Error indexing sheet %d" % id)
        print(e)
        return False


def make_sheet_tags(sheet):
    def get_primary_title(lang, titles):
        return [t for t in titles if t.get("primary") and t.get("lang", "") == lang][0]["text"]

    tags = sheet.get('tags', [])
    tag_terms = [(Term().load({'name': t}) or Term().load_by_title(t)) for t in tags]
    tag_terms_simple = [
        {
            'en': tags[iterm],  # save as en even if it's Hebrew
            'he': ''
        } if term is None else
        {
            'en': get_primary_title('en', term.titles),
            'he': get_primary_title('he', term.titles)
        } for iterm, term in enumerate(tag_terms)
    ]
    #tags_en, tags_he = zip(*tag_terms_simple.values())
    return tag_terms_simple

def make_sheet_text(sheet, pud):
    """
    Returns a plain text representation of the content of sheet.
    :param sheet: The sheet record
    :param pud: Public User Database record for the author
    """
    text = sheet["title"] + "\n{}".format(sheet.get("summary", ''))
    if pud.get("name"):
        text += "\nBy: " + pud["name"]
    text += "\n"
    if sheet.get("tags"):
        text += " [" + ", ".join(sheet["tags"]) + "]\n"
    for s in sheet["sources"]:
        text += source_text(s) + " "

    text = bleach.clean(text, strip=True, tags=())

    return text


def source_text(source):
    """
    Recursive function to translate a source dictionary into text.
    """
    str_fields = ["customTitle", "ref", "comment", "outsideText"]
    dict_fields = ["text", "outsideBiText"]
    content = [source.get(field, "") for field in str_fields]
    content += [val for field in dict_fields for val in source.get(field, {}).values()]
    text = " ".join([strip_tags(c) for c in content])

    if "subsources" in source:
        for s in source["subsources"]:
            text += source_text(s)

    return text


def get_exact_english_analyzer():
    return {
        "tokenizer": "standard",
        "char_filter": [
            "icu_normalizer",
        ],
        "filter": [
            "standard",
            "lowercase",
            "icu_folding",
        ],
    }


def get_stemmed_english_analyzer():
    stemmed_english_analyzer = get_exact_english_analyzer()
    stemmed_english_analyzer['filter'] += ["my_snow"]
    return stemmed_english_analyzer


def create_index(index_name, type):
    """
    Clears the indexes and creates it fresh with the below settings.
    """
    clear_index(index_name)

    settings = {
        "index": {
            "blocks": {
                "read_only_allow_delete": False
            },
            "analysis": {
                "analyzer": {
                    "stemmed_english": get_stemmed_english_analyzer(),
                    "exact_english": get_exact_english_analyzer(),
                },
                "filter": {
                    "my_snow": {
                        "type": "snowball",
                        "language": "English"
                    }
                }
            }
        }
    }
    print('Creating index {}'.format(index_name))
    index_client.create(index=index_name, body=settings)

    if type == 'text':
        put_text_mapping(index_name)
    elif type == 'sheet':
        put_sheet_mapping(index_name)


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
            "exact": {
                'type': 'text',
                'analyzer': 'exact_english'
            },
            "naive_lemmatizer": {
                'type': 'text',
                'analyzer': 'sefaria-naive-lemmatizer',
                'search_analyzer': 'sefaria-naive-lemmatizer-less-prefixes',
                'fields': {
                    'exact': {
                        'type': 'text',
                        'analyzer': 'exact_english'
                    }
                }
            }
        }
    }
    index_client.put_mapping(doc_type='text', body=text_mapping, index=index_name)


def put_sheet_mapping(index_name):
    """
    Sets mapping for the sheets document type.
    """
    sheet_mapping = {
        'properties': {
            'owner_name': {
                'type': 'keyword'
            },
            'tags': {
                'type': 'keyword'
            },
            "topics_en": {
                "type": "keyword"
            },
            "topics_he": {
                "type": "keyword"
            },
            "topic_slugs": {
                "type": "keyword"
            },
            'owner_image': {
                'type': 'keyword'
            },
            'datePublished': {
                'type': 'date'
            },
            'dateCreated': {
                'type': 'date'
            },
            'dateModified': {
                'type': 'date'
            },
            'sheetId': {
                'type': 'integer'
            },
            'collections': {
                'type': 'keyword'
            },
            'title': {
                'type': 'keyword'
            },
            'views': {
                'type': 'integer'
            },
            'summary': {
                'type': 'keyword'
            },
            'content': {
                'type': 'text',
                'analyzer': 'stemmed_english'
            },
            'version': {
                'type': 'keyword'
            },
            'profile_url': {
                'type': 'keyword'
            },
            'owner_id': {
                'type': 'integer'
            }
        }
    }
    index_client.put_mapping(doc_type='sheet', body=sheet_mapping, index=index_name)

def get_search_categories(oref, categories):
    toc_tree = library.get_toc_tree()
    cats = oref.index.categories

    indexed_categories = categories  # the default

    # get the full path of every cat along the way.
    # starting w/ the longest,
    # check if they're root swapped.
    paths = [cats[:i] for i in range(len(cats), 0, -1)]
    for path in paths:
        cnode = toc_tree.lookup(path)
        if getattr(cnode, "searchRoot", None) is not None:
            # Use the specified searchRoot, with the rest of the category path appended.
            indexed_categories = [cnode.searchRoot] + cats[len(path) - 1:]
            break
    return indexed_categories


class TextIndexer(object):

    @classmethod
    def clear_cache(cls):
        cls.terms_dict = None
        cls.version_priority_map = None
        cls._bulk_actions = None
        cls.best_time_period = None


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
            elif "title" in mini_toc and not mini_toc.get("isCollection", False):
                title = mini_toc["title"]
                try:
                    r = Ref(title)
                except InputError:
                    print("Failed to parse ref, {}".format(title))
                    return
                vlist = cls.get_ref_version_list(r)
                vpriorities = defaultdict(lambda: 0)
                for i, v in enumerate(vlist):
                    lang = v.language
                    cls.version_priority_map[(title, v.versionTitle, lang)] = (vpriorities[lang], mini_toc["categories"])
                    vpriorities[lang] += 1

        traverse(toc)

    @staticmethod
    def get_ref_version_list(oref, tries=0):
        try:
            return oref.index.versionSet().array()
        except InputError as e:
            print(f"InputError: {oref.normal()}")
            return []
        except pymongo.errors.AutoReconnect as e:
            if tries < 200:
                pytime.sleep(5)
                return TextIndexer.get_ref_version_list(oref, tries+1)
            else:
                print("get_ref_version_list -- Tried: {} times. Failed :(".format(tries))
                raise e

    @classmethod
    def get_all_versions(cls, tries=0, versions=None, page=0):
        versions = versions or []
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
                print("Tried: {} times. Got {} versions".format(tries, len(versions)))
                raise e

    @classmethod
    def index_all(cls, index_name, debug=False, for_es=True, action=None):
        cls.index_name = index_name
        cls.create_version_priority_map()
        cls.create_terms_dict()
        Ref.clear_cache()  # try to clear Ref cache to save RAM

        versions = sorted([x for x in cls.get_all_versions() if (x.title, x.versionTitle, x.language) in cls.version_priority_map], key=lambda x: cls.version_priority_map[(x.title, x.versionTitle, x.language)][0])
        versions_by_index = {}
        # organizing by index for the merged case. There is no longer a merged case but keeping this logic b/c it seems fine
        for v in versions:
            key = (v.title, v.language)
            if key in versions_by_index:
                versions_by_index[key] += [v]
            else:
                versions_by_index[key] = [v]
        print("Beginning index of {} versions.".format(len(versions)))
        vcount = 0
        total_versions = len(versions)
        versions = None  # release RAM
        for title, vlist in list(versions_by_index.items()):
            cls.curr_index = vlist[0].get_index() if len(vlist) > 0 else None
            if for_es:
                cls._bulk_actions = []
                try:
                    cls.best_time_period = cls.curr_index.best_time_period()
                except ValueError:
                    cls.best_time_period = None
            for v in vlist:
                if v.versionTitle == "Yehoyesh's Yiddish Tanakh Translation [yi]":
                    print("skipping yiddish. we don't like yiddish")
                    continue

                cls.index_version(v, action=action)
                print("Indexed Version {}/{}".format(vcount, total_versions))
                vcount += 1
            if for_es:
                bulk(es_client, cls._bulk_actions, stats_only=True, raise_on_error=False)

    @classmethod
    def index_version(cls, version, tries=0, action=None):
        if not action:
            action = cls._cache_action
        try:
            version.walk_thru_contents(action, heTref=cls.curr_index.get_title('he'), schema=cls.curr_index.schema, terms_dict=cls.terms_dict)
        except pymongo.errors.AutoReconnect as e:
            # Adding this because there is a mongo call for dictionary words in walk_thru_contents()
            if tries < 200:
                pytime.sleep(5)
                print("Retrying {}. Try {}".format(version.title, tries))
                cls.index_version(version, tries+1)
            else:
                print("Tried {} times to get {}. I have failed you...".format(tries, version.title))
                raise e
        except StopIteration:
            print("Could not find dictionary node in {}".format(version.title))

    @classmethod
    def index_ref(cls, index_name, oref, version_title, lang):
        # slower than `cls.index_version` but useful when you don't want the overhead of loading all versions into cache
        cls.index_name = index_name
        cls.curr_index = oref.index
        try:
            cls.best_time_period = cls.curr_index.best_time_period()
        except ValueError:
            cls.best_time_period = None
        version_priority = 0
        hebrew_version_title = None
        for priority, v in enumerate(cls.get_ref_version_list(oref)):
            if v.versionTitle == version_title:
                version_priority = priority
                hebrew_version_title = getattr(v, 'versionTitleInHebrew', None)
        content = TextChunk(oref, lang, vtitle=version_title).ja().flatten_to_string()
        categories = cls.curr_index.categories
        tref = oref.normal()
        doc = cls.make_text_index_document(tref, oref.he_normal(), version_title, lang, version_priority, content, categories, hebrew_version_title)
        id = make_text_doc_id(tref, version_title, lang)
        es_client.index(index_name, doc, id=id)

    @classmethod
    def _cache_action(cls, segment_str, tref, heTref, version):
        # Index this document as a whole
        vtitle = version.versionTitle
        vlang = version.language
        hebrew_version_title = getattr(version, 'versionTitleInHebrew', None)
        try:
            version_priority, categories = cls.version_priority_map[(version.title, vtitle, vlang)]
            #TODO include sgement_str in this func
            doc = cls.make_text_index_document(tref, heTref, vtitle, vlang, version_priority, segment_str, categories, hebrew_version_title)
            # print doc
        except Exception as e:
            logger.error("Error making index document {} / {} / {} : {}".format(tref, vtitle, vlang, str(e)))
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
            except Exception as e:
                logger.error("ERROR indexing {} / {} / {} : {}".format(tref, vtitle, vlang, e))

    @classmethod
    def remove_footnotes(cls, content):
        ftnotes = AbstractTextRecord.find_all_itags(content, only_footnotes=True)[1]
        if len(ftnotes) == 0:
            return content
        else:
            for sup_tag in ftnotes:
                i_tag = sup_tag.next_sibling
                content += f" {sup_tag.text} {i_tag.text}"
            content = AbstractTextRecord.strip_itags(content)
            return content

    @classmethod
    def modify_text_in_doc(cls, content):
        content = AbstractTextRecord.strip_imgs(content)
        content = cls.remove_footnotes(content)
        content = strip_cantillation(content, strip_vowels=False).strip()
        content = re.sub(r'<[^>]+>', ' ', content)     # replace HTML tags with space so that words dont get smushed together
        content = re.sub(r'\([^)]+\)', ' ', content)   # remove all parens
        while "  " in content:                                 # make sure there are not many spaces in a row
            content = content.replace("  ", " ")
        return content

    @classmethod
    def make_text_index_document(cls, tref, heTref, version, lang, version_priority, content, categories, hebrew_version_title):
        """
        Create a document for indexing from the text specified by ref/version/lang
        """
        # Don't bother indexing if there's no content
        if not content:
            return False
        content = cls.modify_text_in_doc(content)
        if len(content) == 0:
            return False

        oref = Ref(tref)

        indexed_categories = get_search_categories(oref, categories)

        tp = cls.best_time_period
        if tp is not None:
            comp_start_date = int(tp.start)
        else:
            comp_start_date = 3000  # far in the future

        ref_data = RefData().load({"ref": tref})
        pagesheetrank = ref_data.pagesheetrank if ref_data is not None else RefData.DEFAULT_PAGESHEETRANK

        return {
            "ref": tref,
            "heRef": heTref,
            "version": version,
            "lang": lang,
            "version_priority": version_priority if version_priority is not None else 1000,
            "titleVariants": oref.index_node.all_tree_titles("en"),
            "categories": indexed_categories,
            "order": oref.order_id(),
            "path": "/".join(indexed_categories + [cls.curr_index.title]),
            "pagesheetrank": pagesheetrank,
            "comp_date": comp_start_date,
            #"hebmorph_semi_exact": content,
            "exact": content,
            "naive_lemmatizer": content,
            'hebrew_version_title': hebrew_version_title,
        }


def index_sheets_by_timestamp(timestamp):
    """
    :param timestamp str: index all sheets modified after `timestamp` (in isoformat)
    """

    name_dict = get_new_and_current_index_names('sheet', debug=False)
    curr_index_name = name_dict['current']
    try:
        ids = db.sheets.find({"status": "public", "dateModified": {"$gt": timestamp}}).distinct("id")
    except Exception as e:
        print(e)
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
    except Exception as e:
        print("Error deleting Elasticsearch Index named %s" % index_name)
        print(e)


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
    queue = db.index_queue.find()
    for item in queue:
        try:
            TextIndexer.index_ref(index_name, Ref(item["ref"]), item["version"], item["lang"], False)
            db.index_queue.remove(item)
        except Exception as e:
            logging.error("Error indexing from queue ({} / {} / {}) : {}".format(item["ref"], item["version"], item["lang"], e))


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


def index_all(skip=0, debug=False):
    """
    Fully create the search index from scratch.
    """
    start = datetime.now()
    index_all_of_type('text', skip=skip, debug=debug)
    index_all_of_type('sheet', skip=skip, debug=debug)
    end = datetime.now()
    db.index_queue.delete_many({})  # index queue is now stale
    print("Elapsed time: %s" % str(end-start))


def index_all_of_type(type, skip=0, debug=False):
    index_names_dict = get_new_and_current_index_names(type=type, debug=debug)
    print('CREATING / DELETING {}'.format(index_names_dict['new']))
    print('CURRENT {}'.format(index_names_dict['current']))
    for i in range(10):
        print('STARTING IN T-MINUS {}'.format(10 - i))
        pytime.sleep(1)

    index_all_of_type_by_index_name(type, index_names_dict['new'], skip, debug)

    try:
        #index_client.put_settings(index=index_names_dict['current'], body={"index": { "blocks": { "read_only_allow_delete": False }}})
        index_client.delete_alias(index=index_names_dict['current'], name=index_names_dict['alias'])
        print("Successfully deleted alias {} for index {}".format(index_names_dict['alias'], index_names_dict['current']))
    except NotFoundError:
        print("Failed to delete alias {} for index {}".format(index_names_dict['alias'], index_names_dict['current']))

    clear_index(index_names_dict['alias']) # make sure there are no indexes with the alias_name

    #index_client.put_settings(index=index_names_dict['new'], body={"index": { "blocks": { "read_only_allow_delete": False }}})
    index_client.put_alias(index=index_names_dict['new'], name=index_names_dict['alias'])

    if index_names_dict['new'] != index_names_dict['current']:
        clear_index(index_names_dict['current'])


def index_all_of_type_by_index_name(type, index_name, skip=0, debug=False):
    if skip == 0:
        create_index(index_name, type)
    if type == 'text':
        TextIndexer.clear_cache()
        TextIndexer.index_all(index_name, debug=debug)
    elif type == 'sheet':
        index_public_sheets(index_name)