# -*- coding: utf-8 -*-
"""
search.py - full-text search for Sefaria using ElasticSearch

Writes to MongoDB Collection: index_queue
"""
import os
from datetime import datetime, timedelta
import re
import bleach
import pymongo


import structlog
import logging
from logging import NullHandler
from collections import defaultdict
import time as pytime
logger = structlog.get_logger(__name__)

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
from .settings import SEARCH_INDEX_NAME_TEXT, SEARCH_INDEX_NAME_SHEET
from sefaria.helper.search import get_elasticsearch_client
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.utils.hebrew import strip_cantillation
import sefaria.model.queue as qu

es_client = get_elasticsearch_client()
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
        es_client.delete(index=curr_index, id=id)
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
        es_client.delete(index=index_name, id=id)
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

def make_sheet_topics(sheet):
    topics = []
    for t in sheet.get('topics', []):
        topic_obj = Topic.init(t['slug'])
        if not topic_obj:
            continue
        topics += [topic_obj]
    return topics

def index_sheet(index_name, id):
    """
    Index source sheet with 'id'.
    """
    sheet = db.sheets.find_one({"id": id})
    if not sheet:
        logger.warning("Sheet not found in database", sheet_id=id)
        return False

    # Log the sheet being indexed (with title for context)
    sheet_title = sheet.get("title") or "(no title)"
    logger.debug("Indexing sheet", 
                sheet_id=id, 
                sheet_title=sheet_title[:100] if sheet_title else None,  # Truncate long titles
                owner_id=sheet.get("owner"))

    # Get user data with null-safety
    pud = public_user_data(sheet["owner"])
    if not pud:
        logger.warning("Could not get public user data for sheet owner", 
                      sheet_id=id, 
                      owner_id=sheet["owner"],
                      sheet_title=sheet_title[:50])
        pud = {"name": "", "imageUrl": "", "profileUrl": ""}
    
    topics = make_sheet_topics(sheet)
    collections = CollectionSet({"sheets": id, "listed": True})
    collection_names = [c.name for c in collections]
    
    # Null-safety for title - this was causing the NoneType + str error
    sheet_title = sheet.get("title")
    if sheet_title is None:
        logger.warning("Sheet has null title, using empty string", 
                      sheet_id=id, owner_id=sheet["owner"])
        sheet_title = ""
    
    # Null-safety for user_link
    owner_link = user_link(sheet["owner"])
    if owner_link is None:
        logger.warning("user_link returned None for owner", 
                      sheet_id=id, owner_id=sheet["owner"])
        owner_link = ""
    
    try:
        doc = {
            "title": strip_tags(sheet_title),
            "content": make_sheet_text(sheet, pud),
            "owner_id": sheet["owner"],
            "owner_name": pud.get("name", ""),
            "owner_image": pud.get("imageUrl", ""),
            "profile_url": pud.get("profileUrl", ""),
            "version": "Source Sheet by " + owner_link,
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
        es_client.create(index=index_name, id=id, body=doc)
        global doc_count
        doc_count += 1
        return True
    except Exception as e:
        logger.error("Error indexing sheet", 
                    sheet_id=id, 
                    owner_id=sheet.get("owner"),
                    error=str(e),
                    exc_info=True)
        return False

def make_sheet_text(sheet, pud):
    """
    Returns a plain text representation of the content of sheet.
    :param sheet: The sheet record
    :param pud: Public User Database record for the author
    """
    # Null-safety for title - handle None values gracefully
    title = sheet.get("title") or ""
    summary = sheet.get("summary") or ""
    text = title + "\n{}".format(summary)
    
    # Null-safety for author name
    author_name = pud.get("name") if pud else None
    if author_name:
        text += "\nBy: " + author_name
    text += "\n"
    
    if sheet.get("topics"):
        topics = make_sheet_topics(sheet)
        topics_en = [topic_obj.get_primary_title('en') for topic_obj in topics]
        topics_he = [topic_obj.get_primary_title('he') for topic_obj in topics]
        text += " [" + ", ".join(topics_en+topics_he) + "]\n"
    
    for s in sheet.get("sources", []):
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
            "lowercase",
            "icu_folding",
        ],
    }


def get_stemmed_english_analyzer():
    stemmed_english_analyzer = get_exact_english_analyzer()
    stemmed_english_analyzer['filter'] += ["my_snow"]
    return stemmed_english_analyzer


def create_index(index_name, type, force=False):
    """
    Clears the indexes and creates it fresh with the below settings.
    
    :param index_name: Name of the index to create
    :param type: Type of index ('text' or 'sheet')
    :param force: If False, will not recreate an index with documents (safety check)
    """
    logger.info("Creating new Elasticsearch index", index_name=index_name, type=type, force=force)
    
    # Check if index already exists and has documents
    exists_before = index_client.exists(index=index_name)
    if exists_before:
        try:
            stats = index_client.stats(index=index_name)
            doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
            
            if doc_count > 0 and not force:
                error_msg = f"Index {index_name} already exists with {doc_count} documents. Use force=True to recreate."
                logger.error("Refusing to recreate index with existing data", 
                           index_name=index_name, 
                           doc_count=doc_count)
                raise ValueError(error_msg)
            
            logger.warning("Index exists with documents, will be cleared", 
                         index_name=index_name, 
                         doc_count=doc_count)
        except Exception as e:
            if "ValueError" in str(type(e)):
                raise
            logger.warning("Could not get index stats", index_name=index_name, error=str(e))
    
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
    
    logger.info("Creating index with settings", index_name=index_name)
    print('Creating index {}'.format(index_name))
    
    try:
        index_client.create(index=index_name, settings=settings)
        logger.info("Successfully created index", index_name=index_name)
    except Exception as e:
        logger.error("Failed to create index", 
                    index_name=index_name, 
                    error=str(e),
                    exc_info=True)
        raise

    if type == 'text':
        logger.info("Applying text mapping to index", index_name=index_name)
        put_text_mapping(index_name)
        logger.info("Text mapping applied successfully", index_name=index_name)
    elif type == 'sheet':
        logger.info("Applying sheet mapping to index", index_name=index_name)
        put_sheet_mapping(index_name)
        logger.info("Sheet mapping applied successfully", index_name=index_name)
    else:
        logger.warning("Unknown type, no mapping applied", type=type, index_name=index_name)


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
    index_client.put_mapping(body=text_mapping, index=index_name)


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
    index_client.put_mapping(body=sheet_mapping, index=index_name)

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
        logger.info("Creating version priority map from TOC")
        start_time = datetime.now()
        toc = library.get_toc()
        cls.version_priority_map = {}
        parse_errors = []

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
                    parse_errors.append(title)
                    logger.debug("Failed to parse ref", title=title)
                    return
                vlist = cls.get_ref_version_list(r)
                vpriorities = defaultdict(lambda: 0)
                for i, v in enumerate(vlist):
                    lang = v.language
                    cls.version_priority_map[(title, v.versionTitle, lang)] = (vpriorities[lang], mini_toc["categories"])
                    vpriorities[lang] += 1

        traverse(toc)
        elapsed = datetime.now() - start_time
        logger.info("Completed version priority map creation",
                   total_versions=len(cls.version_priority_map),
                   parse_errors=len(parse_errors),
                   elapsed=str(elapsed))

    @staticmethod
    def get_ref_version_list(oref, tries=0):
        try:
            return oref.index.versionSet().array()
        except InputError as e:
            logger.warning("InputError getting version list", ref=oref.normal(), error=str(e))
            return []
        except pymongo.errors.AutoReconnect as e:
            if tries < 200:
                if tries % 10 == 0:  # Log every 10 retries
                    logger.warning("MongoDB AutoReconnect, retrying", 
                                  ref=oref.normal(), 
                                  attempt=tries)
                pytime.sleep(5)
                return TextIndexer.get_ref_version_list(oref, tries+1)
            else:
                logger.error("get_ref_version_list failed after max retries", 
                            ref=oref.normal(), 
                            attempts=tries)
                raise e

    @classmethod
    def get_all_versions(cls, tries=0, versions=None, page=0):
        if page == 0:
            logger.info("Starting to fetch all versions from database")
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
                # Log progress every 100 pages
                if page % 100 == 0:
                    logger.debug("Fetching versions", page=page, total_so_far=len(versions))
            logger.info("Completed fetching all versions", total=len(versions))
            return versions
        except pymongo.errors.AutoReconnect as e:
            if tries < 200:
                if tries % 10 == 0:
                    logger.warning("MongoDB AutoReconnect while fetching versions, retrying",
                                  attempt=tries, 
                                  versions_so_far=len(versions))
                pytime.sleep(5)
                return cls.get_all_versions(tries+1, versions, page)
            else:
                logger.error("get_all_versions failed after max retries",
                            attempts=tries, 
                            versions_retrieved=len(versions))
                raise e

    @staticmethod
    def excluded_from_search(version):
        return version.versionTitle in [
            "Yehoyesh's Yiddish Tanakh Translation [yi]",
            'Miqra Mevoar, trans. and edited by David Kokhav, Jerusalem 2020'
        ]

    @classmethod
    def index_all(cls, index_name, debug=False, for_es=True, action=None):
        start_time = datetime.now()
        cls.index_name = index_name
        
        logger.info("TextIndexer.index_all starting", 
                   index_name=index_name, 
                   debug=debug, 
                   for_es=for_es)
        
        # Create priority map and terms dict
        cls.create_version_priority_map()
        logger.info("Created terms dictionary")
        cls.create_terms_dict()
        
        logger.info("Clearing Ref cache to save RAM")
        Ref.clear_cache()

        # Get and sort versions
        logger.info("Sorting versions by priority")
        versions = sorted([x for x in cls.get_all_versions() if (x.title, x.versionTitle, x.language) in cls.version_priority_map], key=lambda x: cls.version_priority_map[(x.title, x.versionTitle, x.language)][0])
        versions_by_index = {}
        
        # Organize by index for the merged case
        for v in versions:
            key = (v.title, v.language)
            if key in versions_by_index:
                versions_by_index[key] += [v]
            else:
                versions_by_index[key] = [v]
        
        total_versions = len(versions)
        total_indexes = len(versions_by_index)
        logger.info("Beginning text indexing", 
                   total_versions=total_versions,
                   total_indexes=total_indexes)
        print("Beginning index of {} versions.".format(total_versions))
        
        vcount = 0
        skipped = 0
        failed = 0
        versions = None  # release RAM
        
        for idx_count, (title, vlist) in enumerate(list(versions_by_index.items())):
            if len(vlist) == 0:
                continue
            
            try:
                cls.curr_index = vlist[0].get_index()
            except Exception as e:
                logger.error("Failed to get index for version", 
                            title=title[0], 
                            language=title[1],
                            error=str(e))
                failed += len(vlist)
                continue
                
            if cls.curr_index is None:
                logger.warning("curr_index is None, skipping", 
                              title=title[0], 
                              language=title[1])
                skipped += len(vlist)
                continue
                
            if for_es:
                cls._bulk_actions = []
                try:
                    cls.best_time_period = cls.curr_index.best_time_period()
                except ValueError:
                    cls.best_time_period = None
                except AttributeError:
                    logger.warning("Could not get best_time_period", 
                                  title=title[0])
                    cls.best_time_period = None
                    
            # Log when starting a new title/index
            logger.info("Starting to index text",
                       title=title[0],
                       language=title[1],
                       version_count=len(vlist))
            
            for v in vlist:
                if cls.excluded_from_search(v):
                    logger.debug("Skipping excluded version", 
                                title=v.title,
                                version_title=v.versionTitle)
                    skipped += 1
                    continue

                try:
                    # Log individual version being indexed
                    logger.debug("Indexing version",
                                title=v.title,
                                version_title=v.versionTitle,
                                language=v.language)
                    cls.index_version(v, action=action)
                    vcount += 1
                except Exception as e:
                    logger.error("Failed to index version",
                                title=v.title,
                                version_title=v.versionTitle,
                                language=v.language,
                                error=str(e))
                    failed += 1
                
                # Log progress with current title
                if vcount % 100 == 0 or vcount == total_versions:
                    elapsed = datetime.now() - start_time
                    rate = vcount / elapsed.total_seconds() if elapsed.total_seconds() > 0 else 0
                    eta = (total_versions - vcount) / rate if rate > 0 else 0
                    logger.info("Text indexing progress",
                               indexed=vcount,
                               total=total_versions,
                               percent=round(vcount / total_versions * 100, 1),
                               current_title=v.title,
                               current_version=v.versionTitle,
                               current_language=v.language,
                               skipped=skipped,
                               failed=failed,
                               elapsed_seconds=round(elapsed.total_seconds(), 1),
                               rate_per_second=round(rate, 2),
                               eta_seconds=round(eta, 1))
                    print("Indexed Version {}/{} - Current: {} ({}, {})".format(
                        vcount, total_versions, v.title, v.versionTitle, v.language))
                    
            if for_es:
                bulk(es_client, cls._bulk_actions, stats_only=True, raise_on_error=False)
        
        elapsed = datetime.now() - start_time
        logger.info("TextIndexer.index_all completed",
                   total_indexed=vcount,
                   total_skipped=skipped,
                   total_failed=failed,
                   elapsed=str(elapsed))

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
                if tries % 10 == 0:  # Log every 10 retries
                    logger.warning("MongoDB AutoReconnect, retrying version indexing",
                                  title=version.title,
                                  version_title=version.versionTitle,
                                  attempt=tries)
                cls.index_version(version, tries+1)
            else:
                logger.error("Failed to index version after max retries",
                            title=version.title,
                            version_title=version.versionTitle,
                            attempts=tries)
                raise e
        except StopIteration:
            logger.warning("Could not find dictionary node in version",
                          title=version.title,
                          version_title=version.versionTitle)
        except Exception as e:
            logger.error("Unexpected error indexing version",
                        title=version.title,
                        version_title=version.versionTitle,
                        error=str(e),
                        exc_info=True)
            raise

    @classmethod
    def index_ref(cls, index_name, oref, version_title, lang, language_family_name, is_primary):
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
        doc = cls.make_text_index_document(tref, oref.he_normal(), version_title, lang, version_priority, content, categories, hebrew_version_title, language_family_name, is_primary)
        id = make_text_doc_id(tref, version_title, lang)
        es_client.index(index_name, doc, id=id)

    @classmethod
    def _cache_action(cls, segment_str, tref, heTref, version):
        # Index this document as a whole
        vtitle = version.versionTitle
        vlang = version.language
        language_family_name = version.languageFamilyName
        is_primary = version.isPrimary
        hebrew_version_title = getattr(version, 'versionTitleInHebrew', None)
        try:
            version_priority, categories = cls.version_priority_map[(version.title, vtitle, vlang)]
            #TODO include sgement_str in this func
            doc = cls.make_text_index_document(tref, heTref, vtitle, vlang, version_priority, segment_str, categories, hebrew_version_title, language_family_name, is_primary)
            # print doc
        except Exception as e:
            logger.error("Error making index document {} / {} / {} : {}".format(tref, vtitle, vlang, str(e)))
            return

        if doc:
            try:
                cls._bulk_actions += [
                    {
                        "_index": cls.index_name,
                        "_id": make_text_doc_id(tref, vtitle, vlang),
                        "_source": doc
                    }
                ]
            except Exception as e:
                logger.error("ERROR indexing {} / {} / {} : {}".format(tref, vtitle, vlang, e))

    @classmethod
    def remove_footnotes(cls, content):
        ftnotes = AbstractTextRecord.find_all_footnotes(content)
        if len(ftnotes) == 0:
            return content
        else:
            for raw_footnote in ftnotes:
                sup_text = re.search(r'<sup[^>]*class="footnote-marker">(.*?)</sup>', raw_footnote).group(1)
                # should be greedy since we already pulled out precise i-tag
                itag_text = re.search(r'<i[^>]*class="footnote"[^>]*>(.*)</i>', raw_footnote).group(1)
                content += f" {sup_text} {itag_text}"
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
    def make_text_index_document(cls, tref, heTref, version, lang, version_priority, content, categories, hebrew_version_title, language_family_name, is_primary):
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
            "languageFamilyName": language_family_name,
            "isPrimary": is_primary,
        }


def index_sheets_by_timestamp(timestamp):
    """
    :param timestamp str: index all sheets modified after `timestamp` (in isoformat)
    """
    logger.info("Starting index_sheets_by_timestamp", timestamp=timestamp)
    
    name_dict = get_new_and_current_index_names('sheet', debug=False)
    curr_index_name = name_dict['current']
    logger.info("Using sheet index", index_name=curr_index_name)
    
    try:
        ids = db.sheets.find({"status": "public", "dateModified": {"$gt": timestamp}}).distinct("id")
        logger.info("Found sheets to index by timestamp", 
                   count=len(ids), 
                   timestamp=timestamp)
    except Exception as e:
        logger.error("Error querying sheets by timestamp", 
                    timestamp=timestamp, 
                    error=str(e),
                    exc_info=True)
        return str(e)

    succeeded = []
    failed = []
    total = len(ids)

    for i, id in enumerate(ids):
        did_succeed = index_sheet(curr_index_name, id)
        if did_succeed:
            succeeded.append(id)
        else:
            failed.append(id)
        
        # Log progress every 100 sheets
        if (i + 1) % 100 == 0:
            logger.info("Sheet timestamp indexing progress", 
                       indexed=i + 1, 
                       total=total,
                       succeeded=len(succeeded),
                       failed=len(failed),
                       percent=round((i + 1) / total * 100, 1))

    logger.info("Completed index_sheets_by_timestamp", 
               total=total,
               succeeded=len(succeeded), 
               failed=len(failed),
               failed_ids=failed[:20] if failed else [])  # Log first 20 failed IDs
    
    return {"succeeded": {"num": len(succeeded), "ids": succeeded}, "failed": {"num": len(failed), "ids": failed}}


def index_public_sheets(index_name):
    """
    Index all source sheets that are publicly listed.
    """
    start_time = datetime.now()
    logger.info("Starting index_public_sheets", index_name=index_name)
    
    ids = db.sheets.find({"status": "public"}).distinct("id")
    total = len(ids)
    logger.info("Found public sheets to index", total=total, first_10_ids=ids[:10] if ids else [])
    
    succeeded = 0
    failed = 0
    failed_ids = []
    current_sheet_id = None
    current_sheet_title = None
    
    for i, id in enumerate(ids):
        current_sheet_id = id
        
        # Get sheet title for logging (with caching to avoid repeated lookups)
        if (i + 1) % 100 == 0:  # Only fetch title every 100 sheets for logging
            try:
                sheet = db.sheets.find_one({"id": id}, {"title": 1})
                current_sheet_title = sheet.get("title") if sheet else "Unknown"
            except:
                current_sheet_title = "Unknown"
        
        result = index_sheet(index_name, id)
        if result:
            succeeded += 1
        else:
            failed += 1
            if len(failed_ids) < 100:  # Keep track of first 100 failures
                failed_ids.append(id)
        
        # Log progress every 1000 sheets or at 10% intervals
        if (i + 1) % 1000 == 0 or (i + 1) == total:
            elapsed = datetime.now() - start_time
            rate = (i + 1) / elapsed.total_seconds() if elapsed.total_seconds() > 0 else 0
            eta_seconds = (total - i - 1) / rate if rate > 0 else 0
            logger.info("Sheet indexing progress", 
                       indexed=i + 1, 
                       total=total,
                       percent=round((i + 1) / total * 100, 1),
                       current_sheet_id=current_sheet_id,
                       current_sheet_title=current_sheet_title,
                       succeeded=succeeded,
                       failed=failed,
                       elapsed_seconds=round(elapsed.total_seconds(), 1),
                       rate_per_second=round(rate, 2),
                       eta_seconds=round(eta_seconds, 1))
    
    elapsed = datetime.now() - start_time
    logger.info("Completed index_public_sheets", 
               index_name=index_name,
               total=total,
               succeeded=succeeded, 
               failed=failed,
               elapsed=str(elapsed),
               failed_ids_sample=failed_ids[:20] if failed_ids else [])


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
    logger.info("Attempting to delete Elasticsearch index", index_name=index_name)
    try:
        # Check if index exists before trying to delete
        if index_client.exists(index=index_name):
            index_client.delete(index=index_name)
            logger.info("Successfully deleted Elasticsearch index", index_name=index_name)
        else:
            logger.info("Index does not exist, nothing to delete", index_name=index_name)
    except NotFoundError:
        logger.warning("Index not found when attempting to delete", index_name=index_name)
    except Exception as e:
        logger.error("Error deleting Elasticsearch index", 
                    index_name=index_name, 
                    error=str(e),
                    exc_info=True)


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
            TextIndexer.index_ref(index_name, Ref(item["ref"]), item["version"], item["lang"], item['languageFamilyName'], item['isPrimary'])
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
    logger.info("=" * 60)
    logger.info("STARTING FULL ELASTICSEARCH REINDEX", 
               skip=skip, 
               debug=debug,
               start_time=start.isoformat())
    logger.info("=" * 60)
    
    # Index texts
    text_start = datetime.now()
    logger.info("Starting text indexing phase")
    try:
        index_all_of_type('text', skip=skip, debug=debug)
        text_elapsed = datetime.now() - text_start
        logger.info("Completed text indexing phase", elapsed=str(text_elapsed))
    except Exception as e:
        logger.error("Text indexing phase failed", 
                    error=str(e), 
                    exc_info=True)
        raise
    
    # Index sheets
    sheet_start = datetime.now()
    logger.info("Starting sheet indexing phase")
    try:
        index_all_of_type('sheet', skip=skip, debug=debug)
        sheet_elapsed = datetime.now() - sheet_start
        logger.info("Completed sheet indexing phase", elapsed=str(sheet_elapsed))
    except Exception as e:
        logger.error("Sheet indexing phase failed", 
                    error=str(e), 
                    exc_info=True)
        raise
    
    # Clear index queue
    logger.info("Clearing stale index queue")
    deleted = db.index_queue.delete_many({})
    logger.info("Cleared index queue", deleted_count=deleted.deleted_count)
    
    end = datetime.now()
    total_elapsed = end - start
    logger.info("=" * 60)
    logger.info("COMPLETED FULL ELASTICSEARCH REINDEX", 
               elapsed=str(total_elapsed),
               text_elapsed=str(text_elapsed),
               sheet_elapsed=str(sheet_elapsed))
    logger.info("=" * 60)
    print("Elapsed time: %s" % str(total_elapsed))


def index_all_of_type(type, skip=0, debug=False):
    """
    Index all documents of a given type (text or sheet).
    Handles index creation, alias switching, and cleanup.
    """
    index_names_dict = get_new_and_current_index_names(type=type, debug=debug)
    
    logger.info("=" * 40)
    logger.info(f"Starting index_all_of_type for '{type}'",
               type=type,
               new_index=index_names_dict['new'],
               current_index=index_names_dict['current'],
               alias=index_names_dict['alias'],
               skip=skip,
               debug=debug)
    
    # Check if new index already exists
    new_exists = index_client.exists(index=index_names_dict['new'])
    if new_exists:
        try:
            stats = index_client.stats(index=index_names_dict['new'])
            doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
            logger.warning("New index already exists, will be recreated",
                          index=index_names_dict['new'],
                          existing_doc_count=doc_count)
        except Exception:
            logger.warning("New index already exists, will be recreated",
                          index=index_names_dict['new'])
    
    # Countdown (keeping for backwards compatibility, but logging instead of just printing)
    logger.info("Starting countdown before indexing...")
    for i in range(10):
        remaining = 10 - i
        print(f'STARTING IN T-MINUS {remaining}')
        logger.debug("Countdown", seconds_remaining=remaining)
        pytime.sleep(1)

    # Perform the actual indexing
    logger.info("Beginning indexing operation", 
               type=type, 
               index_name=index_names_dict['new'])
    index_all_of_type_by_index_name(type, index_names_dict['new'], skip, debug)

    # Switch aliases
    logger.info("Switching aliases after indexing")
    try:
        index_client.delete_alias(index=index_names_dict['current'], name=index_names_dict['alias'])
        logger.info("Successfully deleted alias from old index", 
                   alias=index_names_dict['alias'], 
                   old_index=index_names_dict['current'])
    except NotFoundError:
        logger.warning("Alias not found on old index (may be first run)", 
                      alias=index_names_dict['alias'], 
                      old_index=index_names_dict['current'])

    # Clear any index with the alias name
    clear_index(index_names_dict['alias'])

    # Create new alias
    index_client.put_alias(index=index_names_dict['new'], name=index_names_dict['alias'])
    logger.info("Successfully created alias for new index", 
               alias=index_names_dict['alias'], 
               new_index=index_names_dict['new'])

    # Cleanup old index
    if index_names_dict['new'] != index_names_dict['current']:
        logger.info("Cleaning up old index", old_index=index_names_dict['current'])
        clear_index(index_names_dict['current'])
    
    logger.info(f"Completed index_all_of_type for '{type}'",
               type=type,
               final_index=index_names_dict['new'],
               alias=index_names_dict['alias'])


def index_all_of_type_by_index_name(type, index_name, skip=0, debug=False, force_recreate=True):
    """
    Index all documents of a given type into a specific index.
    
    :param type: Type of index ('text' or 'sheet')
    :param index_name: Name of the index
    :param skip: Number of documents to skip (for resuming)
    :param debug: Debug mode
    :param force_recreate: If True, will recreate index even if it has documents
    """
    logger.info("Starting index_all_of_type_by_index_name",
               type=type,
               index_name=index_name,
               skip=skip,
               debug=debug,
               force_recreate=force_recreate)
    
    # Check if index exists and validate
    index_exists = index_client.exists(index=index_name)
    if index_exists and skip == 0:
        try:
            stats = index_client.stats(index=index_name)
            doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
            logger.warning("Index already exists before creation",
                         index_name=index_name,
                         existing_doc_count=doc_count,
                         will_recreate=force_recreate)
        except Exception as e:
            logger.warning("Could not check existing index stats", 
                         index_name=index_name, 
                         error=str(e))
    
    if skip == 0:
        logger.info("Creating fresh index (skip=0)", index_name=index_name, type=type)
        create_index(index_name, type, force=force_recreate)
    else:
        logger.info("Skipping index creation (resuming)", index_name=index_name, skip=skip)
        if not index_exists:
            logger.error("Cannot resume - index does not exist", 
                        index_name=index_name)
            raise ValueError(f"Cannot resume indexing - index {index_name} does not exist")
    
    if type == 'text':
        logger.info("Clearing TextIndexer cache")
        TextIndexer.clear_cache()
        logger.info("Starting TextIndexer.index_all")
        TextIndexer.index_all(index_name, debug=debug)
        logger.info("Completed TextIndexer.index_all")
    elif type == 'sheet':
        logger.info("Starting sheet indexing")
        index_public_sheets(index_name)
        logger.info("Completed sheet indexing")
    else:
        logger.error("Unknown index type", type=type)
        raise ValueError(f"Unknown index type: {type}")