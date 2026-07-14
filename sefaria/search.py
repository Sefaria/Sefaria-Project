# -*- coding: utf-8 -*-
"""
search.py - full-text search for Sefaria using ElasticSearch

Writes to MongoDB Collection: index_queue
"""
from datetime import datetime, timedelta
import logging
import re
import sys
import bleach
import pymongo

from collections import defaultdict
import time as pytime

from elastic_transport import ConnectionError as ESConnectionError, ConnectionTimeout
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
from .settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK
from sefaria.helper.search import get_elasticsearch_client, get_elasticsearch_client_for_indexer
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.utils.hebrew import strip_cantillation
import sefaria.model.queue as qu

def setup_logging(debug=False):
    """
    Centralized logging configuration for Sefaria.
    Toggles between INFO and DEBUG levels based on debug flag.
    """
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format='[%(levelname)s] %(asctime)s - %(message)s',
        stream=sys.stdout,
        force=True  # Override any existing logging configuration
    )

# Initial setup with default level
setup_logging(False)

logger = logging.getLogger(__name__)

es_client = get_elasticsearch_client()
index_client = IndicesClient(es_client)
_indexer_es_client = get_elasticsearch_client_for_indexer()

MAX_RETRY_ATTEMPTS = 200
RETRY_SLEEP_SECONDS = 5
PROGRESS_LOG_EVERY_N = 100


def delete_text(oref, version, lang):
    try:
        index_names = get_new_and_current_index_names('text')
        if not index_names:
            logger.error(f"Could not get index names for text - ref: {oref.normal()}, version: {version}, lang: {lang}")
            return
        
        curr_index = index_names.get('current')
        if not curr_index:
            logger.error(f"No current index found for text - ref: {oref.normal()}, version: {version}, lang: {lang}")
            return

        id = make_text_doc_id(oref.normal(), version, lang)
        es_client.delete(index=curr_index, id=id)
    except NotFoundError:
        logger.warning(f"Document not found when deleting - ref: {oref.normal()}, version: {version}, lang: {lang}")
    except Exception as e:
        logger.error(f"Failed to delete text - ref: {oref.normal()}, version: {version}, lang: {lang}, error: {e}")


def delete_version(index, version, lang):
    assert isinstance(index, AbstractIndex)

    refs = []

    if SITE_SETTINGS.get("TORAH_SPECIFIC"):
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
        logger.error(f"deleting sheet {id}")


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
        topic_obj = Topic.init(t.get('slug'))
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
        return False  # Sheet not found - tracked as failed
    
    # Validate all critical fields upfront
    owner_id = sheet.get("owner")
    sheet_title = sheet.get("title")
    summary = sheet.get("summary")
    datePublished = sheet.get("datePublished")
    dateCreated = sheet.get("dateCreated")
    dateModified = sheet.get("dateModified")
    
    if any(x is None for x in [summary, datePublished, dateCreated, dateModified]) or not (owner_id and sheet_title):
        return False  # Missing critical sheet fields - tracked as failed
    
    pud = public_user_data(owner_id)
    if not pud:
        return False  # Could not get user data - tracked as failed
    
    owner_name = pud.get("name")
    owner_image = pud.get("imageUrl")
    profile_url = pud.get("profileUrl")
    owner_link = user_link(owner_id)
    
    if not all([owner_name, owner_image, profile_url, owner_link]):
        return False  # Missing critical user fields - tracked as failed
    
    topics = make_sheet_topics(sheet)
    collections = CollectionSet({"sheets": id, "listed": True})
    collection_names = [c.name for c in collections]
    
    try:
        doc = {
            "title": strip_tags(sheet_title),
            "content": make_sheet_text(sheet, pud),
            "owner_id": owner_id,
            "owner_name": owner_name,
            "owner_image": owner_image,
            "profile_url": profile_url,
            "version": "Source Sheet by " + owner_link,
            "topic_slugs": [topic_obj.slug for topic_obj in topics],
            "topics_en": [topic_obj.get_primary_title('en') for topic_obj in topics],
            "topics_he": [topic_obj.get_primary_title('he') for topic_obj in topics],
            "sheetId": id,
            "summary": summary,
            "collections": collection_names,
            "datePublished": datePublished,
            "dateCreated": dateCreated,
            "dateModified": dateModified,
            "views": sheet.get("views", 0)
        }
        es_client.create(index=index_name, id=id, body=doc)
        return True
    except Exception as e:
        # Error indexing - skip silently, will be tracked as failed
        return False

def make_sheet_text(sheet, pud):
    """
    Returns a plain text representation of the content of sheet.
    :param sheet: The sheet record
    :param pud: Public User Database record for the author
    """
    # Validate critical fields - title and summary are required
    title = sheet.get("title")
    summary = sheet.get("summary")
    if not title or not summary:
        # Critical fields missing - raise exception to be caught and tracked as failed
        raise ValueError(f"Missing critical fields: title={title is not None}, summary={summary is not None}")
    
    text = f"{title}\n{summary}"
    
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
        for s in source.get("subsources", []):
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
    Creates a new Elasticsearch index with appropriate settings and mappings.
    
    If the index already exists and contains documents:
    - If force=False (default): Raises a ValueError to prevent accidental data loss
    - If force=True: Clears the existing index and recreates it
    
    :param index_name: Name of the index to create
    :param type: Type of index ('text' or 'sheet')
    :param force: If False (default), will not recreate an index with documents (safety check)
    """
    logger.debug(f"Creating new Elasticsearch index - index_name: {index_name}, type: {type}, force: {force}")
    
    # Check if index already exists and has documents
    exists_before = index_client.exists(index=index_name)
    if exists_before:
        try:
            stats = index_client.stats(index=index_name)
            doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
            
            if doc_count > 0 and not force:
                error_msg = f"Index {index_name} already exists with {doc_count} documents. Use force=True to recreate."
                logger.error(f"Refusing to recreate index with existing data - index_name: {index_name}, doc_count: {doc_count}")
                raise ValueError(error_msg)
            
            logger.warning(f"Index exists with documents, will be cleared - index_name: {index_name}, doc_count: {doc_count}")
        except ValueError:
            # Re-raise ValueError (from the safety check above) to caller
            raise
        except Exception as e:
            logger.warning(f"Could not get index stats - index_name: {index_name}, error: {str(e)}")
    
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
                "normalizer": {
                    # Case-insensitive keyword variant, used by the `.sort` sub-fields on
                    # entity titles for A-Z sorting (a raw keyword sort puts "iggeret" after "Zohar").
                    "keyword_lowercase": {
                        "type": "custom",
                        "filter": ["lowercase"]
                    }
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
    
    logger.debug(f"Creating index with settings - index_name: {index_name}")
    
    try:
        index_client.create(index=index_name, settings=settings)
        logger.info(f"Successfully created index - index_name: {index_name}")
    except Exception as e:
        logger.error(f"Failed to create index - index_name: {index_name}, error: {str(e)}", exc_info=True)
        raise

    if type == 'text':
        logger.debug(f"Applying text mapping to index - index_name: {index_name}")
        put_text_mapping(index_name)
        logger.debug(f"Text mapping applied successfully - index_name: {index_name}")
    elif type == 'sheet':
        logger.debug(f"Applying sheet mapping to index - index_name: {index_name}")
        put_sheet_mapping(index_name)
        logger.debug(f"Sheet mapping applied successfully - index_name: {index_name}")
    elif type == 'topic':
        logger.debug(f"Applying topic mapping to index - index_name: {index_name}")
        put_topic_mapping(index_name)
        logger.debug(f"Topic mapping applied successfully - index_name: {index_name}")
    elif type == 'book':
        logger.debug(f"Applying book mapping to index - index_name: {index_name}")
        put_book_mapping(index_name)
        logger.debug(f"Book mapping applied successfully - index_name: {index_name}")
    else:
        logger.warning(f"Unknown type, no mapping applied - type: {type}, index_name: {index_name}")


def put_text_mapping(index_name):
    """
    Settings mapping for the text document type.
    """
    text_mapping = {
        '_source': {
            'excludes': ['linked_refs']
        },
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
            },
            "linked_refs": {
                'type': 'keyword'
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


def put_topic_mapping(index_name):
    """
    Sets mapping for the `topic` document type (topics and authors).

    Authors are not a separate index: `AuthorTopic` is a subtype of `Topic`, so
    authors live here and are distinguished by the `subtype` field ("topic" or
    "author"). English title/variant/description fields use `stemmed_english`;
    Hebrew fields are plain `text`. Title fields expose a `keyword` sub-field for
    exact-match and a lowercased `sort` sub-field for A-Z sorting.
    """
    topic_mapping = {
        'properties': {
            'slug': {
                'type': 'keyword',
            },
            'subtype': {
                'type': 'keyword',
            },
            'title_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
                'fields': {
                    'keyword': {'type': 'keyword'},
                    'sort': {'type': 'keyword', 'normalizer': 'keyword_lowercase'},
                },
            },
            'title_he': {
                'type': 'text',
                'fields': {
                    'keyword': {'type': 'keyword'},
                    'sort': {'type': 'keyword', 'normalizer': 'keyword_lowercase'},
                },
            },
            'titleVariants': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'description_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'description_he': {
                'type': 'text',
            },
            'numSources': {
                'type': 'integer',
            },
            'era': {
                'type': 'keyword',
            },
            'birthYear': {
                'type': 'integer',
            },
            'deathYear': {
                'type': 'integer',
            },
            # Denormalized titles of the books this author wrote (analyzed text, split
            # by language, incl. English title variants — the same title set the book
            # index carries) so an author is findable by any name of a work they
            # authored — the mirror image of `author_names` on the book index.
            # `norms: false` so a prolific author (a large title list) isn't penalized
            # by field-length normalization; the `keyword` sub-field powers exact-match
            # (tier 1), which is what ranks the true author of an exactly-titled work
            # above its commentators.
            'authored_titles_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
                'norms': False,
                'fields': {'keyword': {'type': 'keyword'}},
            },
            'authored_titles_he': {
                'type': 'text',
                'norms': False,
                'fields': {'keyword': {'type': 'keyword'}},
            },
        }
    }
    index_client.put_mapping(body=topic_mapping, index=index_name)


def put_book_mapping(index_name):
    """
    Sets mapping for the `book` document type (Index records).

    `path` mirrors the text index's "Category/Subcategory/Title" shape so existing
    category-path filter logic can be reused. `author_names` is denormalized (the
    author's display titles copied in at index time) so a query for "Rambam" or
    "Maimonides" matches his works even when his name isn't in the title.
    """
    book_mapping = {
        'properties': {
            'title_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
                'fields': {
                    'keyword': {'type': 'keyword'},
                    'sort': {'type': 'keyword', 'normalizer': 'keyword_lowercase'},
                },
            },
            'title_he': {
                'type': 'text',
                'fields': {
                    'keyword': {'type': 'keyword'},
                    'sort': {'type': 'keyword', 'normalizer': 'keyword_lowercase'},
                },
            },
            'titleVariants': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'categories': {
                'type': 'keyword',
            },
            'path': {
                'type': 'keyword',
            },
            'description_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'description_he': {
                'type': 'text',
            },
            'compDate': {
                'type': 'integer',
            },
            'era': {
                'type': 'keyword',
            },
            'authors': {
                'type': 'keyword',
            },
            'author_names': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'order': {
                'type': 'keyword',
            },
        }
    }
    index_client.put_mapping(body=book_mapping, index=index_name)


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
    
    # Class-level failure tracking
    _failed_versions = None
    _skipped_versions = None

    @classmethod
    def clear_cache(cls):
        cls.terms_dict = None
        cls.version_priority_map = None
        cls._bulk_actions = None
        cls.best_time_period = None
        cls._failed_versions = []
        cls._skipped_versions = []
    
    @classmethod
    def _add_failed_version(cls, version, error_message, error_type=None):
        """Helper method to consistently add failed versions to tracking list."""
        if cls._failed_versions is None:
            cls._failed_versions = []
        cls._failed_versions.append({
            'title': getattr(version, 'title', 'Unknown'),
            'version': getattr(version, 'versionTitle', 'Unknown'),
            'lang': getattr(version, 'language', 'Unknown'),
            'error': error_message,
            'error_type': error_type or 'Exception'
        })
    
    @classmethod
    def _add_skipped_version(cls, version, reason):
        """Helper method to consistently add skipped versions to tracking list."""
        if cls._skipped_versions is None:
            cls._skipped_versions = []
        cls._skipped_versions.append({
            'title': getattr(version, 'title', 'Unknown'),
            'version': getattr(version, 'versionTitle', 'Unknown'),
            'reason': reason
        })

    @classmethod
    def _flush_bulk_actions(cls, in_flight_versions):
        """Flush bulk actions; absorb connection failures, propagate everything else.

        Returns the number of versions reclassified as failed.
        """
        if not cls._bulk_actions:
            return 0
        try:
            bulk(_indexer_es_client, cls._bulk_actions, stats_only=True,
                 raise_on_error=False, request_timeout=120)
            cls._bulk_actions = []
            return 0
        except (ESConnectionError, ConnectionTimeout) as e:
            # Both are siblings under TransportError, not parent/child — list explicitly.
            logger.warning(
                f"Bulk indexing failed: {type(e).__name__}: {e}; "
                f"continuing with next index"
            )
            for v in in_flight_versions:
                cls._add_failed_version(
                    v, f"Bulk write failed: {e}", type(e).__name__
                )
            cls._bulk_actions = []
            return len(in_flight_versions)


    @classmethod
    def create_terms_dict(cls):
        cls.terms_dict = {}
        ts = TermSet()
        for t in ts:
            cls.terms_dict[t.name] = t.contents()

    @classmethod
    def create_version_priority_map(cls):
        logger.debug("Creating version priority map from TOC")
        start_time = datetime.now()
        toc = library.get_toc()
        cls.version_priority_map = {}
        parse_errors = []

        def traverse(mini_toc):
            if type(mini_toc) == list:
                for t in mini_toc:
                    traverse(t)
            elif "contents" in mini_toc:
                for t in mini_toc.get("contents", []):
                    traverse(t)
            elif "title" in mini_toc and not mini_toc.get("isCollection", False):
                title = mini_toc.get("title")
                try:
                    r = Ref(title)
                except InputError:
                    parse_errors.append(title)
                    logger.debug(f"Failed to parse ref - title: {title}")
                    return
                vlist = cls.get_ref_version_list(r)
                vpriorities = defaultdict(lambda: 0)
                for i, v in enumerate(vlist):
                    lang = v.language
                    cls.version_priority_map[(title, v.versionTitle, lang)] = (vpriorities[lang], mini_toc.get("categories", []))
                    vpriorities[lang] += 1

        traverse(toc)
        elapsed = datetime.now() - start_time
        logger.debug(f"Completed version priority map creation - total_versions: {len(cls.version_priority_map)}, parse_errors: {len(parse_errors)}, elapsed: {elapsed}")

    @staticmethod
    def get_ref_version_list(oref, tries=0):
        try:
            return oref.index.versionSet().array()
        except InputError as e:
            logger.warning(f"InputError getting version list - ref: {oref.normal()}, error: {str(e)}")
            return []
        except pymongo.errors.AutoReconnect as e:
            if tries < MAX_RETRY_ATTEMPTS:
                if tries % 10 == 0:  # Log every 10 retries
                    logger.warning(f"MongoDB AutoReconnect, retrying - ref: {oref.normal()}, attempt: {tries}")
                pytime.sleep(RETRY_SLEEP_SECONDS)
                return TextIndexer.get_ref_version_list(oref, tries+1)
            else:
                logger.error(f"get_ref_version_list failed after max retries - ref: {oref.normal()}, attempts: {tries}")
                raise e

    @classmethod
    def get_all_versions(cls, tries=0, versions=None, page=0):
        if page == 0:
            logger.debug("Starting to fetch all versions from database")
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
                if page % PROGRESS_LOG_EVERY_N == 0:
                    logger.debug(f"Fetching versions - page: {page}, total_so_far: {len(versions)}")
            logger.debug(f"Completed fetching all versions - total: {len(versions)}")
            return versions
        except pymongo.errors.AutoReconnect as e:
            if tries < MAX_RETRY_ATTEMPTS:
                if tries % 10 == 0:
                    logger.warning(f"MongoDB AutoReconnect while fetching versions, retrying - attempt: {tries}, versions_so_far: {len(versions)}")
                pytime.sleep(RETRY_SLEEP_SECONDS)
                return cls.get_all_versions(tries+1, versions, page)
            else:
                logger.error(f"get_all_versions failed after max retries - attempts: {tries}, versions_retrieved: {len(versions)}")
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
        
        logger.debug(f"TextIndexer.index_all starting - index_name: {index_name}, debug: {debug}, for_es: {for_es}")
        
        # Create priority map and terms dict
        cls.create_version_priority_map()
        logger.debug("Created terms dictionary")
        cls.create_terms_dict()
        
        logger.debug("Clearing Ref cache to save RAM")
        Ref.clear_cache()

        # Get and sort versions
        logger.debug("Sorting versions by priority")
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
        logger.debug(f"Beginning text indexing - total_versions: {total_versions}, total_indexes: {total_indexes}")
        logger.debug(f"Beginning index of {total_versions} versions.")
        
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
                failed += len(vlist)
                for v in vlist:
                    cls._add_failed_version(v, f"Failed to get index: {str(e)}", type(e).__name__)
                continue
                
            if cls.curr_index is None:
                failed += len(vlist)
                for v in vlist:
                    cls._add_failed_version(v, 'Index is None', 'ValidationError')
                continue
            
            # Validate that index has a title
            if not hasattr(cls.curr_index, 'title') or not cls.curr_index.title:
                failed += len(vlist)
                for v in vlist:
                    cls._add_failed_version(v, 'Index missing title', 'ValidationError')
                continue
                
            if for_es:
                cls._bulk_actions = []
                try:
                    cls.best_time_period = cls.curr_index.best_time_period()
                except (ValueError, AttributeError) as e:
                    # best_time_period is required - mark all versions as failed
                    failed += len(vlist)
                    for v in vlist:
                        cls._add_failed_version(v, f"Failed to get best_time_period: {str(e)}", type(e).__name__)
                    continue

            in_flight_versions = []
            for v in vlist:
                # Validate critical fields
                if not v.title or not v.versionTitle or not v.language:
                    failed += 1
                    cls._add_failed_version(v, 'Missing critical field (title, versionTitle, or language)', 'ValidationError')
                    continue

                if cls.excluded_from_search(v):
                    skipped += 1
                    cls._add_skipped_version(v, 'excluded_from_search')
                    continue

                try:
                    cls.index_version(v, action=action)
                    vcount += 1
                    in_flight_versions.append(v)
                except Exception as e:
                    failed += 1
                    cls._add_failed_version(v, str(e), type(e).__name__)

            if for_es:
                rolled_back = cls._flush_bulk_actions(in_flight_versions)
                if rolled_back:
                    vcount -= rolled_back
                    failed += rolled_back

            if idx_count % 100 == 0:
                elapsed_so_far = datetime.now() - start_time
                logger.info(f"TextIndexer progress: {idx_count}/{total_indexes} indexes ({100*idx_count//total_indexes}%), {vcount} versions indexed, elapsed: {elapsed_so_far}")

        elapsed = datetime.now() - start_time
        logger.info(f"TextIndexer.index_all completed - total_indexed: {vcount}, total_skipped: {skipped}, total_failed: {failed}, elapsed: {elapsed}")

    @classmethod
    def index_version(cls, version, tries=0, action=None):
        # Validate critical fields before processing
        if not version.title or not version.versionTitle or not version.language:
            cls._add_failed_version(version, 'Missing critical field (title, versionTitle, or language)', 'ValidationError')
            return
        
        if not action:
            action = cls._cache_action
        try:
            # Validate curr_index has required attributes
            if not cls.curr_index or not hasattr(cls.curr_index, 'get_title') or not hasattr(cls.curr_index, 'schema'):
                cls._add_failed_version(version, 'Index missing required attributes (get_title or schema)', 'ValidationError')
                return
            version.walk_thru_contents(action, heTref=cls.curr_index.get_title('he'), schema=cls.curr_index.schema, terms_dict=cls.terms_dict)
        except pymongo.errors.AutoReconnect as e:
            # Adding this because there is a mongo call for dictionary words in walk_thru_contents()
            if tries < MAX_RETRY_ATTEMPTS:
                pytime.sleep(RETRY_SLEEP_SECONDS)
                # Retry silently - no logging for retries
                cls.index_version(version, tries+1)
            else:
                # Max retries exceeded - will be caught and tracked as failed
                raise e
        except StopIteration:
            # Dictionary node not found - will be caught and tracked as failed
            raise
        except Exception as e:
            # Unexpected error - will be caught and tracked as failed
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
        es_client.index(index=index_name, document=doc, id=id)

    @classmethod
    def _cache_action(cls, segment_str, tref, heTref, version):
        # Index this document as a whole
        vtitle = version.versionTitle
        vlang = version.language
        language_family_name = version.languageFamilyName
        is_primary = version.isPrimary
        hebrew_version_title = getattr(version, 'versionTitleInHebrew', None)
        
        # Validate critical fields - if missing, track as failure and continue
        if not version.title or not vtitle or not vlang:
            # Critical field missing - track as failed and continue
            cls._add_failed_version(version, f'Missing critical field (title, versionTitle, or language) - ref: {tref}', 'ValidationError')
            return
        
        # Safe access to version_priority_map
        version_key = (version.title, vtitle, vlang)
        if version_key not in cls.version_priority_map:
            # Version not in priority map - skip silently, will be tracked as skipped
            return
        
        try:
            version_priority, categories = cls.version_priority_map[version_key]
            #TODO include sgement_str in this func
            doc = cls.make_text_index_document(tref, heTref, vtitle, vlang, version_priority, segment_str, categories, hebrew_version_title, language_family_name, is_primary)
            # print doc
        except Exception as e:
            # Error making document - skip silently, will be tracked as failed
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
                # Error indexing - skip silently, will be tracked as failed
                pass

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

        linked_refs = []
        for link in LinkSet(oref):
            linked_refs.extend(link.expandedRefs0)
            linked_refs.extend(link.expandedRefs1)
        linked_refs = list({r for r in linked_refs if r != tref})

        indexed_categories = get_search_categories(oref, categories)

        tp = cls.best_time_period
        comp_start_date = int(getattr(tp, 'end', None) or getattr(tp, 'start', 3000)) # If there is no end/start date, use 3000 which make it appear at the end of the results
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
            "linked_refs": linked_refs,
        }


def index_sheets_by_timestamp(timestamp):
    """
    :param timestamp str: index all sheets modified after `timestamp` (in isoformat)
    """
    logger.debug(f"Starting index_sheets_by_timestamp - timestamp: {timestamp}")
    
    name_dict = get_new_and_current_index_names('sheet', debug=False)
    curr_index_name = name_dict.get('current')
    logger.debug(f"Using sheet index - index_name: {curr_index_name}")
    
    try:
        ids = db.sheets.find({"status": "public", "dateModified": {"$gt": timestamp}}).distinct("id")
        logger.debug(f"Found sheets to index by timestamp - count: {len(ids)}, timestamp: {timestamp}")
    except Exception as e:
        logger.error(f"Error querying sheets by timestamp - timestamp: {timestamp}, error: {str(e)}", exc_info=True)
        return str(e)

    succeeded = []
    failed = []
    total = len(ids)

    for i, _id in enumerate(ids):
        did_succeed = index_sheet(curr_index_name, _id)
        if did_succeed:
            succeeded.append(_id)
        else:
            failed.append(_id)
        
    # Only log if there are failures
    if len(failed) > 0:
        logger.info(f"Completed index_sheets_by_timestamp - total: {total}, succeeded: {len(succeeded)}, failed: {len(failed)}, failed_ids: {failed[:20] if failed else []}")
    
    return {"succeeded": {"num": len(succeeded), "ids": succeeded}, "failed": {"num": len(failed), "ids": failed}}


def index_public_sheets(index_name):
    """
    Index all source sheets that are publicly listed.
    
    Returns:
        list: List of failed sheet IDs
    """
    start_time = datetime.now()
    logger.debug(f"Starting index_public_sheets - index_name: {index_name}")
    
    ids = db.sheets.find({"status": "public"}).distinct("id")
    total = len(ids)
    logger.debug(f"Found public sheets to index - total: {total}, first_10_ids: {ids[:10] if ids else []}")
    
    succeeded = 0
    failed = 0
    failed_ids = []
    
    for i, _id in enumerate(ids):
        result = index_sheet(index_name, _id)
        if result:
            succeeded += 1
        else:
            failed += 1
            failed_ids.append(_id)
        
    elapsed = datetime.now() - start_time
    # Only log if there are failures
    if failed > 0:
        logger.info(f"Completed index_public_sheets - index_name: {index_name}, total: {total}, succeeded: {succeeded}, failed: {failed}, elapsed: {elapsed}, failed_ids_sample: {failed_ids[:20] if failed_ids else []}")
    
    return failed_ids


def index_public_notes():
    """
    Index all public notes.

    TODO
    """
    pass


# --------------------------------------------------------------------------- #
#  Entity search: topic & book document builders + bulk indexers              #
#                                                                             #
#  These power the `topic` and `book` Elasticsearch indices behind            #
#  /api/entity-search. The builders are pure functions (model object -> ES    #
#  document dict) so they're easy to test in isolation; the bulk indexers     #
#  iterate the corpus, call a builder per record, and collect skips into a    #
#  summary report rather than aborting the whole run.                         #
# --------------------------------------------------------------------------- #

def _without_none(doc):
    """
    Drop keys whose value is None so sparse fields (e.g. an author's `birthYear`, or a
    book's `era`/`compDate`) are omitted from the document rather than stored as null.
    Empty strings and empty lists are legitimate values and are kept as-is.
    """
    return {k: v for k, v in doc.items() if v is not None}


def _book_title_variants(index, lang):
    """
    The book-level title variants of an Index: the root node's own title group.
    Not `Index.all_titles()` — that walks the whole schema tree for ref resolution,
    so on complex texts it returns every chapter/section title crossed with every
    root variant (e.g. "Moreh Nevukhim, Prefatory Remarks"), which are not book titles.
    """
    if not index.nodes:
        return []
    return index.nodes.title_group.all_titles(lang) or []


def _authored_index_titles(index):
    """
    The searchable titles of one authored Index for the author's `authored_titles`
    fields: the primary EN title plus every English title variant, and the primary HE
    title — the same title set `make_book_index_document` indexes for the book itself
    (`title_en` + `titleVariants` + `title_he`). Mirroring it keeps author↔book search
    symmetric: any query that returns a book by one of its titles also returns that
    book's author (e.g. "Moreh Nevukhim", a variant of "Guide for the Perplexed",
    finds Rambam).

    :return: (en_titles, he_titles), primary title first, de-duped downstream
    """
    en_titles = []
    primary_en = index.get_title('en')
    if primary_en:
        en_titles.append(primary_en)
    en_titles += [t for t in _book_title_variants(index, 'en') if t != primary_en]
    try:
        he = index.get_title('he')
    except Exception:
        he = None
    return en_titles, ([he] if he else [])


def _build_authored_titles_map():
    """
    Map every author slug to the titles of their works in one `IndexSet()` pass:
    slug -> {'en': [titles...], 'he': [titles...]}.

    `db.index` has no Mongo index on `authors`, so the per-author
    `IndexSet({"authors": slug})` fallback in `make_topic_index_document` is a full
    collection scan; during a full reindex one scan here replaces one per author.
    """
    titles_by_slug = defaultdict(lambda: {'en': [], 'he': []})
    for index in IndexSet():
        author_slugs = getattr(index, 'authors', None) or []
        if not author_slugs:
            continue
        en_titles, he_titles = _authored_index_titles(index)
        for slug in author_slugs:
            titles_by_slug[slug]['en'] += en_titles
            titles_by_slug[slug]['he'] += he_titles
    return titles_by_slug


def make_topic_index_document(topic, authored_titles_map=None):
    """
    Build an Elasticsearch document for a Topic (or AuthorTopic) for the `topic` index.

    Authors are not a separate index: `AuthorTopic` is a subtype of `Topic` and is
    distinguished here by the `subtype` field. The document id is the topic slug, so
    reindexing is idempotent.

    :param topic: a `Topic` model instance (base class; the `subclass` attribute
        carried from Mongo is what distinguishes authors)
    :param authored_titles_map: optional precomputed map from `_build_authored_titles_map()`.
        Without it, each author topic falls back to its own `IndexSet({"authors": slug})`
        query — fine for a single topic, N unindexed scans across a full reindex.
    :return: dict document, or None if the topic lacks a slug or has no title in any
        language (many auto-generated topics are Hebrew-only or empty and add only noise)
    """
    slug = getattr(topic, 'slug', None)
    if not slug:
        return None

    # The slug is used verbatim as the ES document _id, which is capped at 512 bytes.
    # A handful of auto-generated topics have pathological slugs (a slugified blob of
    # every title variant) that blow past this. They're noise anyway (typically no
    # English title and zero sources), so drop them rather than fail the bulk request.
    if len(slug.encode('utf-8')) > 512:
        logger.warning(f"make_topic_index_document: skipping topic with slug > 512 bytes - slug: {slug[:80]}...")
        return None

    title_en = topic.get_primary_title('en')
    title_he = topic.get_primary_title('he')
    if not title_en and not title_he:
        return None

    is_author = getattr(topic, 'subclass', None) == 'author'
    # titleVariants is the main recall driver; exclude the primary to avoid double-weighting it.
    variants = [t for t in topic.get_titles('en', with_disambiguation=False) if t != title_en]
    description = getattr(topic, 'description', None) or {}

    doc = {
        'slug': slug,
        'subtype': 'author' if is_author else 'topic',
        # An absent title (many topics are Hebrew-only) is omitted rather than stored as ""
        # so the A-Z sort's `missing: _last` pushes untitled docs to the end — an empty
        # string is a real keyword value and would sort *first*.
        'title_en': title_en or None,
        'title_he': title_he or None,
        'titleVariants': variants,
        'description_en': description.get('en', ''),
        'description_he': description.get('he', ''),
        'numSources': getattr(topic, 'numSources', 0) or 0,
    }

    if is_author:
        # `get_property` reads `self.properties` and works on a base Topic instance,
        # so we don't need to re-load the record as an AuthorTopic subclass. These
        # fields are sparse; _without_none() omits any that are absent (rather than
        # writing null into _source).
        doc['era'] = topic.get_property('era')
        doc['birthYear'] = topic.get_property('birthYear')
        doc['deathYear'] = topic.get_property('deathYear')
        # Denormalize the titles of this author's works (EN incl. variants + HE, the
        # same title set the book index carries — see _authored_index_titles) so the
        # author is searchable by any name of a book they wrote (e.g. "Mishneh Torah"
        # -> Maimonides, "Moreh Nevukhim" -> Rambam).
        if authored_titles_map is not None:
            authored = authored_titles_map.get(slug, {'en': [], 'he': []})
            authored_en, authored_he = authored['en'], authored['he']
        else:
            authored_en, authored_he = [], []
            for authored_index in IndexSet({"authors": slug}):
                en_titles, he_titles = _authored_index_titles(authored_index)
                authored_en += en_titles
                authored_he += he_titles
        doc['authored_titles_en'] = list(dict.fromkeys(authored_en))  # de-dup, preserve order
        doc['authored_titles_he'] = list(dict.fromkeys(authored_he))

    return _without_none(doc)


def _resolve_author_names(author_slugs, cache):
    """
    Resolve author slugs to their display titles (EN + HE, incl. variants) for the
    denormalized `author_names` field. `cache` memoizes slug -> names across the run
    since one author appears on many books.
    """
    names = []
    for slug in author_slugs:
        if slug not in cache:
            author = Topic.init(slug)
            resolved = []
            if author is not None:
                for lang in ('en', 'he'):
                    resolved += author.get_titles(lang, with_disambiguation=False)
            cache[slug] = list(dict.fromkeys(resolved))  # de-dup, preserve order
        names += cache[slug]
    return list(dict.fromkeys(names))


def make_book_index_document(index, author_name_cache=None):
    """
    Build an Elasticsearch document for an Index (book) record for the `book` index.

    The document id is the English title, so reindexing is idempotent.

    :param index: an `Index` model instance
    :param author_name_cache: optional dict memoizing author slug -> display names
        across calls (author-name resolution is expensive and highly repetitive)
    :return: dict document, or None if the record has no English title
    """
    if author_name_cache is None:
        author_name_cache = {}

    title_en = index.get_title('en')
    if not title_en:
        return None
    try:
        title_he = index.get_title('he') or None  # "" would sort before "A" in the A-Z sort
    except Exception:
        title_he = None

    categories = getattr(index, 'categories', None) or []
    variants = [t for t in _book_title_variants(index, 'en') if t != title_en]

    # compDate is stored in Mongo as a list of ints; collapse to one sortable int.
    # Mirror the text index: prefer end year, else start, else 3000 (sorts undated last).
    tp = index.best_time_period()
    comp_date = int(getattr(tp, 'end', None) or getattr(tp, 'start', 3000)) if tp else None

    author_slugs = getattr(index, 'authors', None) or []
    author_names = _resolve_author_names(author_slugs, author_name_cache)

    # Sparse fields (compDate, era, order, title_he) are omitted by _without_none()
    # when absent rather than stored as null.
    return _without_none({
        'title_en': title_en,
        'title_he': title_he,
        'titleVariants': variants,
        'categories': categories,
        'path': "/".join(categories + [title_en]),  # mirrors the text index path shape
        'description_en': getattr(index, 'enShortDesc', '') or '',
        'description_he': getattr(index, 'heShortDesc', '') or '',
        'compDate': comp_date,
        'era': getattr(index, 'era', None),
        'authors': author_slugs,
        'author_names': author_names,
        'order': getattr(index, 'order', None),
    })


def _bulk_index_entities(index_name, actions, entity_label):
    """
    Run a bulk index of already-built actions, absorbing per-doc errors so one bad
    record can't abort the run. Returns a summary dict.
    """
    start_time = datetime.now()
    try:
        succeeded, errors = bulk(
            _indexer_es_client, actions, raise_on_error=False, request_timeout=120
        )
    except (ESConnectionError, ConnectionTimeout) as e:
        logger.error(f"Bulk {entity_label} indexing connection failure - index_name: {index_name}, error: {e}")
        raise
    elapsed = datetime.now() - start_time
    if errors:
        logger.warning(f"index_{entity_label} bulk errors - count: {len(errors)}, sample: {errors[:5]}")
    logger.info(
        f"Completed index_{entity_label} - index_name: {index_name}, "
        f"succeeded: {succeeded}, errors: {len(errors)}, elapsed: {elapsed}"
    )
    return {"succeeded": succeeded, "errors": errors}


def index_topics(index_name):
    """
    Index every Topic (and AuthorTopic) into `index_name`, keyed by slug (idempotent).
    Skipped slugs (no title / no slug) are collected into the returned summary.
    """
    logger.info(f"Starting index_topics - index_name: {index_name}")
    skipped = []
    total = 0
    authored_titles_map = _build_authored_titles_map()

    def actions():
        nonlocal total
        for topic in TopicSet():
            total += 1
            doc = make_topic_index_document(topic, authored_titles_map)
            if doc is None:
                skipped.append(getattr(topic, 'slug', '<no-slug>'))
                continue
            yield {"_index": index_name, "_id": doc['slug'], "_source": doc}

    result = _bulk_index_entities(index_name, actions(), "topics")
    result.update({"total": total, "skipped": skipped})
    if skipped:
        logger.info(f"index_topics skipped {len(skipped)} topics (sample): {skipped[:20]}")
    return result


def index_books(index_name):
    """
    Index every Index (book) record into `index_name`, keyed by English title
    (idempotent). Skipped/failed titles are collected into the returned summary.
    """
    logger.info(f"Starting index_books - index_name: {index_name}")
    skipped = []
    total = 0
    author_name_cache = {}

    def actions():
        nonlocal total
        for index in IndexSet():
            total += 1
            try:
                doc = make_book_index_document(index, author_name_cache)
            except Exception as e:
                logger.warning(f"index_books: failed building doc for '{getattr(index, 'title', '<unknown>')}': {e}")
                skipped.append(getattr(index, 'title', '<unknown>'))
                continue
            if doc is None:
                skipped.append(getattr(index, 'title', '<no-title>'))
                continue
            yield {"_index": index_name, "_id": doc['title_en'], "_source": doc}

    result = _bulk_index_entities(index_name, actions(), "books")
    result.update({"total": total, "skipped": skipped})
    if skipped:
        logger.info(f"index_books skipped {len(skipped)} books (sample): {skipped[:20]}")
    return result


def clear_index(index_name):
    """
    Delete the search index.
    """
    logger.debug(f"Attempting to delete Elasticsearch index - index_name: {index_name}")
    try:
        # Check if index exists before trying to delete
        if index_client.exists(index=index_name):
            index_client.delete(index=index_name)
            logger.debug(f"Successfully deleted Elasticsearch index - index_name: {index_name}")
        else:
            logger.debug(f"Index does not exist, nothing to delete - index_name: {index_name}")
    except NotFoundError:
        # Index doesn't exist - handle race condition where index is deleted between exists() check and delete() call
        logger.debug(f"Index not found when attempting to delete - index_name: {index_name}")
    except Exception as e:
        logger.error(f"Error deleting Elasticsearch index - index_name: {index_name} - error: {str(e)}")


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
    index_name = get_new_and_current_index_names('text').get('current')
    queue = db.index_queue.find()
    for item in queue:
        try:
            TextIndexer.index_ref(index_name, Ref(item.get("ref")), item.get("version"), item.get("lang"), item.get('languageFamilyName'), item.get('isPrimary'))
            db.index_queue.remove(item)
        except Exception as e:
            logger.error(f"Error indexing from queue ({item.get('ref')} / {item.get('version')} / {item.get('lang')}) : {e}")


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
        refs.add((a.get("ref"), a.get("version"), a.get("language")))
    for ref in list(refs):
        add_ref_to_index_queue(ref[0], ref[1], ref[2])


def get_new_and_current_index_names(type, debug=False):
    base_index_name_dict = {
        'text': SEARCH_INDEX_NAME_TEXT,
        'sheet': SEARCH_INDEX_NAME_SHEET,
        'topic': SEARCH_INDEX_NAME_TOPIC,
        'book': SEARCH_INDEX_NAME_BOOK,
    }
    debug_suffix = '-debug' if debug else ''
    index_name_a = f"{base_index_name_dict[type]}-a{debug_suffix}"
    index_name_b = f"{base_index_name_dict[type]}-b{debug_suffix}"
    alias_name = f"{base_index_name_dict[type]}{debug_suffix}"
    aliases = index_client.get_alias()
    try:
        a_alias = aliases.get(index_name_a, {}).get('aliases', {})
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
    logger.info(f"STARTING FULL ELASTICSEARCH REINDEX - skip: {skip}, debug: {debug}, start_time: {start.isoformat()}")
    logger.info("=" * 60)
    
    # Initialize elapsed time variables
    text_elapsed = None
    sheet_elapsed = None
    
    # Index texts
    text_start = datetime.now()
    logger.info("Starting text indexing phase")
    try:
        index_all_of_type('text', skip=skip, debug=debug)
        text_elapsed = datetime.now() - text_start
        logger.info(f"Completed text indexing phase - elapsed: {text_elapsed}")
    except Exception as e:
        text_elapsed = datetime.now() - text_start
        logger.error(f"Text indexing phase failed after {text_elapsed} - error: {str(e)}", exc_info=True)
        raise
    
    # Index sheets
    sheet_start = datetime.now()
    logger.info("Starting sheet indexing phase")
    try:
        index_all_of_type('sheet', skip=skip, debug=debug)
        sheet_elapsed = datetime.now() - sheet_start
        logger.info(f"Completed sheet indexing phase - elapsed: {sheet_elapsed}")
    except Exception as e:
        sheet_elapsed = datetime.now() - sheet_start
        logger.error(f"Sheet indexing phase failed after {sheet_elapsed} - error: {str(e)}", exc_info=True)
        raise
    
    # Index entities (topics/authors and books). Unlike text/sheet, a failure here
    # is recorded but does NOT abort the run — the entity indices are independent of
    # each other and of the text/sheet indices.
    topic_elapsed = index_entities(skip=skip, debug=debug)

    # Clear index queue
    logger.debug("Clearing stale index queue")
    deleted = db.index_queue.delete_many({})
    logger.debug(f"Cleared index queue - deleted_count: {deleted.deleted_count}")

    end = datetime.now()
    total_elapsed = end - start
    logger.info("=" * 60)
    logger.info(f"COMPLETED FULL ELASTICSEARCH REINDEX - total_elapsed: {total_elapsed}, text_elapsed: {text_elapsed}, sheet_elapsed: {sheet_elapsed}, entity_elapsed: {topic_elapsed}")
    logger.info("=" * 60)


def index_entities(skip=0, debug=False, types=('topic', 'book')):
    """
    (Re)build the entity indices that power /api/entity-search.

    Each index type is rebuilt independently: a failure on one is logged and
    recorded but does not prevent the others from completing. Callable on its own
    for an on-demand entity reindex, or from `index_all` as part of the full run.

    :param types: which entity index types to rebuild (subset of 'topic', 'book')
    :return: timedelta elapsed across all entity indexing
    """
    entity_start = datetime.now()
    for entity_type in types:
        type_start = datetime.now()
        logger.info(f"Starting {entity_type} indexing phase")
        try:
            index_all_of_type(entity_type, skip=skip, debug=debug)
            logger.info(f"Completed {entity_type} indexing phase - elapsed: {datetime.now() - type_start}")
        except Exception as e:
            logger.error(f"{entity_type} indexing phase failed after {datetime.now() - type_start} - error: {str(e)}", exc_info=True)
            # Intentionally not re-raised: entity index failures are independent.
    return datetime.now() - entity_start


def index_all_of_type(type, skip=0, debug=False):
    """
    Index all documents of a given type (text or sheet).
    Handles index creation, alias switching, and cleanup.
    """
    index_names_dict = get_new_and_current_index_names(type=type, debug=debug)
    
    logger.debug("=" * 40)
    logger.debug(f"Starting index_all_of_type for '{type}' - type: {type}, new_index: {index_names_dict.get('new')}, current_index: {index_names_dict.get('current')}, alias: {index_names_dict.get('alias')}, skip: {skip}, debug: {debug}")
    
    # Check if new index already exists
    new_exists = index_client.exists(index=index_names_dict.get('new'))
    if new_exists:
        try:
            stats = index_client.stats(index=index_names_dict.get('new'))
            doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
            logger.debug(f"New index already exists, will be recreated - index: {index_names_dict.get('new')}, existing_doc_count: {doc_count}")
        except Exception:
            logger.debug(f"New index already exists, will be recreated - index: {index_names_dict.get('new')}")
    
    # Countdown (keeping for backwards compatibility, but logging instead of just printing)
    logger.debug("Starting countdown before indexing...")
    for i in range(10):
        remaining = 10 - i
        logger.debug(f'STARTING IN T-MINUS {remaining}')
        logger.debug(f"Countdown - seconds_remaining: {remaining}")
        pytime.sleep(1)

    # Perform the actual indexing
    logger.debug(f"Beginning indexing operation - type: {type}, index_name: {index_names_dict.get('new')}")
    index_all_of_type_by_index_name(type, index_names_dict.get('new'), skip, debug)

    # Switch aliases
    logger.debug("Switching aliases after indexing")
    try:
        index_client.delete_alias(index=index_names_dict.get('current'), name=index_names_dict.get('alias'))
        logger.debug(f"Successfully deleted alias from old index - alias: {index_names_dict.get('alias')}, old_index: {index_names_dict.get('current')}")
    except NotFoundError:
        logger.debug(f"Alias not found on old index (may be first run) - alias: {index_names_dict.get('alias')}, old_index: {index_names_dict.get('current')}")

    # Clear any index with the alias name
    clear_index(index_names_dict.get('alias'))

    # Create new alias
    index_client.put_alias(index=index_names_dict.get('new'), name=index_names_dict.get('alias'))
    logger.debug(f"Successfully created alias for new index - alias: {index_names_dict.get('alias')}, new_index: {index_names_dict.get('new')}")

    # Cleanup old index
    if index_names_dict.get('new') != index_names_dict.get('current'):
        logger.debug(f"Cleaning up old index - old_index: {index_names_dict.get('current')}")
        clear_index(index_names_dict.get('current'))
    
    logger.debug(f"Completed index_all_of_type for '{type}' - type: {type}, final_index: {index_names_dict.get('new')}, alias: {index_names_dict.get('alias')}")


def index_all_of_type_by_index_name(type, index_name, skip=0, debug=False, force_recreate=True):
    """
    Index all documents of a given type into a specific index.
    
    :param type: Type of index ('text' or 'sheet')
    :param index_name: Name of the index
    :param skip: Number of documents to skip (for resuming)
    :param debug: Debug mode
    :param force_recreate: If True, will recreate index even if it has documents
    """
    logger.debug(f"Starting index_all_of_type_by_index_name - type: {type}, index_name: {index_name}, skip: {skip}, debug: {debug}, force_recreate: {force_recreate}")
    
    # Check if index exists and validate
    index_exists = index_client.exists(index=index_name)
    if index_exists and skip == 0:
        try:
            stats = index_client.stats(index=index_name)
            doc_count = stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
            logger.debug(f"Index already exists before creation - index_name: {index_name}, existing_doc_count: {doc_count}, will_recreate: {force_recreate}")
        except Exception as e:
            logger.debug(f"Could not check existing index stats - index_name: {index_name}, error: {str(e)}")
    
    if skip == 0:
        logger.debug(f"Creating fresh index (skip=0) - index_name: {index_name}, type: {type}")
        create_index(index_name, type, force=force_recreate)
    else:
        logger.info(f"Skipping index creation (resuming) - index_name: {index_name}, skip: {skip}")
        if not index_exists:
            logger.error(f"Cannot resume - index does not exist - index_name: {index_name}")
            raise ValueError(f"Cannot resume indexing - index {index_name} does not exist")
    
    if type == 'text':
        logger.debug("Clearing TextIndexer cache")
        TextIndexer.clear_cache()
        logger.debug("Starting TextIndexer.index_all")
        TextIndexer.index_all(index_name, debug=debug)
        logger.debug("Completed TextIndexer.index_all")
    elif type == 'sheet':
        logger.debug("Starting sheet indexing")
        index_public_sheets(index_name)
        logger.debug("Completed sheet indexing")
    elif type == 'topic':
        logger.debug("Starting topic indexing")
        index_topics(index_name)
        logger.debug("Completed topic indexing")
    elif type == 'book':
        logger.debug("Starting book indexing")
        index_books(index_name)
        logger.debug("Completed book indexing")
    else:
        logger.error(f"Unknown index type - type: {type}")
        raise ValueError(f"Unknown index type: {type}")
