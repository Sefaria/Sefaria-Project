# -*- coding: utf-8 -*-
"""
search.py - full-text search for Sefaria using ElasticSearch

Writes to MongoDB Collection: index_queue
"""
from datetime import datetime, timedelta
import logging
import os
import re
import sys
import threading
import bleach
import pymongo

from collections import defaultdict
import time as pytime

from elastic_transport import ConnectionError as ESConnectionError, ConnectionTimeout
from elasticsearch.client import IndicesClient
from elasticsearch.helpers import bulk
from elasticsearch.exceptions import NotFoundError, ApiError
from django_topics.models import Topic as DjangoTopic, PoolType
from sefaria.model import *
from sefaria.model.text import AbstractIndex, AbstractTextRecord
from sefaria.model.user_profile import user_link, public_user_data
from sefaria.model.collection import CollectionSet
from sefaria.system.database import db
from sefaria.system.exceptions import InputError
from sefaria.utils.util import strip_tags, strip_markdown
from .settings import SEARCH_INDEX_NAME_TEXT, SEARCH_INDEX_NAME_SHEET
from .settings import SEARCH_INDEX_NAME_TOPIC, SEARCH_INDEX_NAME_BOOK, SEARCH_INDEX_NAME_CATEGORY
# Aliased on import: this module already defines an unrelated `get_search_categories(oref,
# categories)` (the text index's category-path helper, below), which would shadow it.
from sefaria.model.autospell import get_search_categories as get_searchable_toc_categories
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

# A wedged shard used to go completely silent - zero log output, zero bulk writes, no crash -
# until it was killed by activeDeadlineSeconds hours later. This heartbeat makes that state
# loud: a daemon thread that WARNs if the title loop hasn't advanced in this many seconds,
# naming the title it is stuck on. Daemon so it can never keep the process alive on its own.
try:
    REINDEX_HEARTBEAT_SECONDS = int(os.environ.get("REINDEX_HEARTBEAT_SECONDS", 300))
except (TypeError, ValueError):
    REINDEX_HEARTBEAT_SECONDS = 300

# elasticsearch.helpers.bulk defaults to a 100MB max_chunk_bytes per request. With N
# shards flushing concurrently, that is N*100MB of in-flight coordinating bytes against
# a cluster whose write buffer is capped far lower (indices.breaker.total.limit-ish, e.g.
# ~215MB) - the old serial indexer only ever had one writer so it never hit this. Bound
# the per-request size so aggregate in-flight bytes across all shards stays bounded.
_MIN_BULK_CHUNK_BYTES = 1024 * 1024  # 1MB floor - never let a bad env value shrink chunks to nothing
try:
    REINDEX_BULK_MAX_CHUNK_BYTES = max(
        _MIN_BULK_CHUNK_BYTES, int(os.environ.get("REINDEX_BULK_MAX_CHUNK_BYTES", 10 * 1024 * 1024))
    )
except (TypeError, ValueError):
    REINDEX_BULK_MAX_CHUNK_BYTES = 10 * 1024 * 1024

# 429 es_rejected_execution_exception backoff for _flush_bulk_actions
BULK_429_MAX_RETRIES = 6
BULK_429_INITIAL_BACKOFF_SECONDS = 2
BULK_429_MAX_BACKOFF_SECONDS = 60


def delete_text(oref, version, lang):
    delete_text_by_ref_string(oref.normal(), version, lang)


def delete_text_by_ref_string(tref, version, lang):
    # Takes the ref as a plain string so callers can delete docs whose refs can no
    # longer be parsed into an Ref (e.g. refs built from a book's pre-rename title).
    try:
        index_names = get_new_and_current_index_names('text')
        if not index_names:
            logger.error(f"Could not get index names for text - ref: {tref}, version: {version}, lang: {lang}")
            return

        curr_index = index_names.get('current')
        if not curr_index:
            logger.error(f"No current index found for text - ref: {tref}, version: {version}, lang: {lang}")
            return

        id = make_text_doc_id(tref, version, lang)
        es_client.delete(index=curr_index, id=id)
    except NotFoundError:
        logger.warning(f"Document not found when deleting - ref: {tref}, version: {version}, lang: {lang}")
    except Exception as e:
        logger.error(f"Failed to delete text - ref: {tref}, version: {version}, lang: {lang}, error: {e}")


def delete_version(index, version, lang, old_title=None):
    """
    Delete the ES docs of every segment of `version`/`lang` of `index`.
    :param old_title: pass the book's previous title when `index` was just renamed —
        the stale docs' ids were built from refs under that title, so the title prefix
        of each current ref is swapped for `old_title` before computing the doc id.
    """
    assert isinstance(index, AbstractIndex)

    refs = []

    if SITE_SETTINGS.get("TORAH_SPECIFIC"):
        all_gemara_indexes = library.get_indexes_in_category("Bavli")
        davidson_indexes = all_gemara_indexes[:all_gemara_indexes.index("Horayot") + 1]
        if Ref(index.title).is_bavli() and index.title not in davidson_indexes:
            refs += index.all_section_refs()

    refs += index.all_segment_refs()

    for ref in refs:
        tref = ref.normal()
        if old_title:
            tref = old_title + tref[len(index.title):]
        delete_text_by_ref_string(tref, version, lang)


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
    
    # Only `owner` is truly required. summary/dates are optional schema fields
    # (absent on legacy sheets) — ES indexes them as null. Treating them as
    # required silently dropped ~71% of public sheets.
    owner_id = sheet.get("owner")
    if not owner_id:
        return False  # genuinely cannot build a sheet doc without an owner

    sheet_title = sheet.get("title") or ""
    summary = sheet.get("summary")
    datePublished = sheet.get("datePublished")
    dateCreated = sheet.get("dateCreated")
    dateModified = sheet.get("dateModified")

    pud = public_user_data(owner_id)
    if not pud:
        pud = {"name": "", "imageUrl": "", "profileUrl": ""}

    owner_name = pud.get("name", "")
    owner_image = pud.get("imageUrl", "")
    profile_url = pud.get("profileUrl", "")
    owner_link = user_link(owner_id) or ""
    
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
        logger.warning(f"Failed to index sheet {id}: {type(e).__name__}: {e}")
        return False

def make_sheet_text(sheet, pud):
    """
    Returns a plain text representation of the content of sheet.
    :param sheet: The sheet record
    :param pud: Public User Database record for the author
    """
    title = sheet.get("title") or ""
    summary = sheet.get("summary") or ""
    text = " ".join([t for t in [title, summary] if t])
    
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
            },
            "similarity": {
                # Scoring for "alias bag" fields: a multi-valued list of alternate names
                # for the same entity (titleVariants), as opposed to prose.
                #
                # Term frequency is meaningless in such a field, because the values are
                # not independent statements — they are spelling/aliasing permutations of
                # one name, and Sefaria generates them combinatorially. "Bartenura on
                # Mishnah Berakhot" carries 32 variants (4 author aliases x 8 tractate
                # spellings), so the word "Mishnah" occurs 11 times there. Under default
                # BM25 that TF is the single strongest signal in the field, which ranked
                # Bartenura's commentaries above the Mishnah itself on q="Mishnah", and
                # "Mishneh Torah, Torah Study" (6 occurrences of "Talmud" across its
                # variants, none in its title) above every tractate on q="Talmud".
                #
                # k1=0 collapses BM25's TF component to a constant: score = idf, so a
                # variant either matches or it does not, and a longer alias list confers
                # no advantage. Unlike `index_options: docs` — the other way to drop TF —
                # this keeps positions indexed, which tiers 2 and 4 of the entity query
                # (match_phrase / match_phrase_prefix over titleVariants) require.
                # `b` is only ever applied as a multiplier on k1, so it is moot here.
                "alias_bag": {
                    "type": "BM25",
                    "k1": 0.0,
                    "b": 0.0
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
    elif type == 'category':
        logger.debug(f"Applying category mapping to index - index_name: {index_name}")
        put_category_mapping(index_name)
        logger.debug(f"Category mapping applied successfully - index_name: {index_name}")
    else:
        logger.warning(f"Unknown type, no mapping applied - type: {type}, index_name: {index_name}")


def set_index_bulk_load_settings(index_name):
    """Disable refresh + replicas for fast bulk ingest. Restore via restore_index_settings()."""
    index_client.put_settings(index=index_name, body={
        "index": {"refresh_interval": "-1", "number_of_replicas": 0}
    })
    logger.info(f"Set bulk-load settings (refresh=-1, replicas=0) - index: {index_name}")


def restore_index_settings(index_name, refresh_interval="1s", number_of_replicas=1):
    """Restore production settings after bulk ingest and force a refresh so docs are searchable."""
    index_client.put_settings(index=index_name, body={
        "index": {"refresh_interval": refresh_interval, "number_of_replicas": number_of_replicas}
    })
    index_client.refresh(index=index_name)
    logger.info(f"Restored settings (refresh={refresh_interval}, replicas={number_of_replicas}) + refreshed - index: {index_name}")


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
            # An alias bag, not prose: term frequency across the variant list is a
            # cataloging artifact, so score on idf alone (see the `alias_bag`
            # similarity in create_index). Norms are moot under k1=0.
            'titleVariants': {
                'type': 'text',
                'analyzer': 'stemmed_english',
                'similarity': 'alias_bag',
            },
            'description_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'description_he': {
                'type': 'text',
            },
            # No `numSources`. It was indexed only to drive a popularity function_score on
            # relevance, which was never specced and has been removed; nothing in the entity
            # search pipeline reads it (no ranking, no filter, and the frontend never
            # displays it). Re-add it here *and* in make_topic_index_document if a
            # source-count filter is ever specced — that needs a reindex, not just a query
            # change. The Mongo `Topic.numSources` field is untouched and still drives topic
            # pages / the topics TOC / the autocompleter via Topic.should_display().
            'era': {
                'type': 'keyword',
            },
            'birthYear': {
                'type': 'integer',
            },
            'deathYear': {
                'type': 'integer',
            },
            # The author's single derived year for the chronological sort: `deathYear`,
            # falling back to `birthYear` when there is no death year (see
            # `_author_sort_year`). Sorting on the raw `deathYear` instead would drop
            # every birth-year-only author into the `missing: _last` undated tail, which
            # contradicts the year the card actually displays (SearchPage.jsx). This
            # mirrors the book index, whose `compDate` is likewise collapsed to one
            # sortable int at index time rather than derived per query.
            'sortYear': {
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
            # Length norms are intentionally ON for the primary title fields: a short,
            # focused title ("Chafetz Chaim") should outscore a longer title that merely
            # contains the query words ("Chafetz Chaim on Sifra") for the same matched
            # term. titleVariants is scored by the `alias_bag` similarity instead, which
            # neutralizes both term frequency and length (see create_index): a book is
            # neither penalized nor rewarded for the size of its variant list.
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
                'norms': False,
                'similarity': 'alias_bag',
                'fields': {
                    'keyword': {'type': 'keyword'},
                },
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


def put_category_mapping(index_name):
    """
    Sets mapping for the `category` document type (the searchable TOC categories — see
    sefaria.model.autospell.get_search_categories).

    Deliberately parallel to the `book` mapping: same analyzers, same `keyword`/`sort`
    sub-fields, same `alias_bag` similarity on titleVariants. `path` is the document id
    ("Halakhah/Mishneh Torah") and also the key the Books tab uses to exclude a matched
    category's own books from the flat results, so it mirrors the text/book index path
    shape exactly.
    """
    category_mapping = {
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
            # Every non-primary title of the category, EN and HE in one field. For a
            # category with a `sharedTitle` these come from the shared Term (see
            # make_category_index_document), which is where the real aliases live:
            # "Bible" for Tanakh, "Gemara" for Talmud, "Mishnah Torah" for Mishneh Torah.
            'titleVariants': {
                'type': 'text',
                'analyzer': 'stemmed_english',
                'norms': False,
                'similarity': 'alias_bag',
                'fields': {
                    'keyword': {'type': 'keyword'},
                },
            },
            # Parent path components ("Halakhah" for Halakhah/Mishneh Torah); rendered as
            # the result card's breadcrumb. Empty for a top-level category.
            'categories': {
                'type': 'keyword',
            },
            'path': {
                'type': 'keyword',
            },
            'depth': {
                'type': 'integer',
            },
            'description_en': {
                'type': 'text',
                'analyzer': 'stemmed_english',
            },
            'description_he': {
                'type': 'text',
            },
            'order': {
                'type': 'integer',
            },
        }
    }
    index_client.put_mapping(body=category_mapping, index=index_name)


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

    # Progress/heartbeat state - set at the top of every title-loop iteration and read by
    # the heartbeat thread. cls._current_title survives a crash/OOM for postmortem log
    # scraping; cls._last_progress_monotonic is what the heartbeat compares across polls.
    _current_title = None
    _last_progress_monotonic = None

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
    def _mark_progress(cls, title=None):
        """Record forward progress for the stall heartbeat. Called at the top of every
        title-loop iteration (with the title) and after every bulk flush (without one) so
        the heartbeat thread has a fresh timestamp even during a long single-title flush."""
        if title is not None:
            cls._current_title = title
        cls._last_progress_monotonic = pytime.monotonic()

    @classmethod
    def _heartbeat_loop(cls, stop_event, shard_index=None, shard_count=None):
        """Runs in a daemon thread for the duration of index_all. If no forward progress
        (title loop or bulk flush) has happened since the previous heartbeat, log a WARNING
        naming the current title and how long it has been stuck - this is the only way to
        tell a wedged shard from a slow-but-alive one, since a wedge otherwise produces zero
        log output until it is eventually killed."""
        last_seen = cls._last_progress_monotonic
        shard_label = f"Shard {shard_index}/{shard_count}: " if shard_index is not None else ""
        while not stop_event.wait(REINDEX_HEARTBEAT_SECONDS):
            progress_ts = cls._last_progress_monotonic
            if progress_ts is not None and progress_ts == last_seen:
                stuck_seconds = int(pytime.monotonic() - progress_ts)
                logger.warning(
                    f"{shard_label}No progress in the last {REINDEX_HEARTBEAT_SECONDS}s - "
                    f"currently on title: {cls._current_title}, stuck for ~{stuck_seconds}s"
                )
            last_seen = progress_ts

    @classmethod
    def _flush_bulk_actions(cls, in_flight_versions):
        """Flush bulk actions; absorb connection failures, propagate everything else.

        Returns the number of versions reclassified as failed.
        """
        cls._mark_progress()
        if not cls._bulk_actions:
            return 0
        backoff = BULK_429_INITIAL_BACKOFF_SECONDS
        attempt = 0
        while True:
            try:
                bulk(_indexer_es_client, cls._bulk_actions, stats_only=True,
                     raise_on_error=False, request_timeout=120,
                     max_retries=3, initial_backoff=2, max_backoff=60,
                     max_chunk_bytes=REINDEX_BULK_MAX_CHUNK_BYTES)
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
            except ApiError as e:
                # elasticsearch.helpers.bulk only retries items that come back inside an
                # HTTP-200 bulk response. A whole-request 429 (es_rejected_execution_exception,
                # coordinating bytes over the cluster's write buffer) is raised here instead,
                # and would otherwise kill this shard outright. Absorb it with backoff; any
                # other ApiError is a real failure and must propagate loudly.
                if getattr(e, "status_code", None) != 429:
                    raise
                attempt += 1
                if attempt > BULK_429_MAX_RETRIES:
                    logger.warning(
                        f"Bulk indexing exhausted 429 retry budget after {attempt - 1} "
                        f"attempts: {e}; giving up"
                    )
                    raise
                logger.warning(
                    f"Bulk indexing rejected with 429 (cluster write buffer full); "
                    f"retrying attempt {attempt}/{BULK_429_MAX_RETRIES} in {backoff}s: {e}"
                )
                pytime.sleep(backoff)
                backoff = min(backoff * 2, BULK_429_MAX_BACKOFF_SECONDS)


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
    def get_all_versions(cls, tries=0, versions=None, page=0, query=None):
        if page == 0:
            logger.debug("Starting to fetch all versions from database")
        versions = versions or []
        try:
            version_limit = 10
            temp_versions = []
            first_run = True
            while first_run or len(temp_versions) > 0:
                temp_versions = VersionSet(query or {}, limit=version_limit, page=page).array()
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
                # query must be threaded through the retry, or a mid-fetch AutoReconnect
                # would silently drop back to loading the entire corpus.
                return cls.get_all_versions(tries+1, versions, page, query)
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
    def _index_size_map(cls, tries=0):
        """Real per-title size proxy: for each VersionState, sum the available section counts
        (across "he" and "en") reported across all LEAF schema nodes. This tracks how much text
        index_all actually has to load and index per title, which is what drives per-shard
        memory use. Counts are summed over leaf nodes - not just the root - because complex/
        structured texts (e.g. commentaries with multiple sub-sections) carry their
        availableCounts on the leaf schema nodes, not the root node; for a simple text the root
        node IS a leaf, so get_leaf_nodes() naturally returns just that node and the simple case
        is unaffected. Returns {title: weight}, weight always >= 1.
        Individual VersionStates can fail (e.g. orphaned VersionStates left behind after their
        Index was deleted). A title whose weight can't be computed is deliberately NOT given
        the minimum weight (1) - an unknown-size title assigned the smallest possible weight is
        exactly backwards, since a large/complex text is a plausible reason weight computation
        failed in the first place, and the snake assignment would then cluster several such
        titles onto one shard with no warning until it OOMs. Instead, failed titles are given
        the largest weight seen among titles that DID compute successfully (a conservative
        "assume it's heavy" default), applied in a second pass once that max is known. Each
        failure is logged individually by title (not just an aggregated count) so an operator
        can see which titles to investigate. If the whole computation raises, or the resulting
        map ends up empty or uniform (every weight identical - the degenerate case that
        silently broke balancing before), a WARNING is logged that shard balancing is DEGRADED
        and shards may be unbalanced/OOM. On total failure, {} is returned rather than
        pretending balancing succeeded. A dead Mongo socket (AutoReconnect) mid-scan is
        retried like get_all_versions, rather than falling straight into the generic
        except-and-degrade path below - restarting the scan from scratch is safe since this
        method is a pure read with no side effects, and the alternative (a transient socket
        blip degrading shard balancing for an entire multi-hour run) is worse than a retry."""
        sizes = {}
        failed_titles = []
        try:
            for vs in VersionStateSet():
                title = getattr(vs, "title", None)
                if not title:
                    continue
                try:
                    weight = 0
                    for leaf in vs.index.nodes.get_leaf_nodes():
                        sn = vs.state_node(leaf)
                        for lang in ("he", "en"):
                            # get_available_counts can return None/falsy for complex texts
                            # missing counts on a given node/lang - guard before summing.
                            counts = sn.get_available_counts(lang)
                            if counts:
                                weight += sum(x for x in counts if isinstance(x, int))
                except Exception as e:
                    logger.warning(f"Could not compute index weight for title, will use conservative fallback - title: {title}, error: {e}")
                    failed_titles.append(title)
                    continue
                sizes[title] = max(weight, 1)
        except pymongo.errors.AutoReconnect as e:
            if tries < MAX_RETRY_ATTEMPTS:
                if tries % 10 == 0:
                    logger.warning(f"MongoDB AutoReconnect while building index size map, retrying - attempt: {tries}")
                pytime.sleep(RETRY_SLEEP_SECONDS)
                return cls._index_size_map(tries=tries + 1)
            logger.warning(f"Failed to build index size map from VersionStates after max retries - shard balancing is DEGRADED, shards may be unbalanced/OOM: {e}")
            return {}
        except Exception as e:
            logger.warning(f"Failed to build index size map from VersionStates - shard balancing is DEGRADED, shards may be unbalanced/OOM: {e}")
            return {}
        if failed_titles:
            fallback_weight = max(sizes.values()) if sizes else 1
            for title in failed_titles:
                sizes[title] = fallback_weight
            logger.warning(f"Skipped {len(failed_titles)} VersionState(s) while building index size map (likely orphaned VersionStates with no matching Index) - assigned conservative fallback weight {fallback_weight}: {failed_titles}")
        if not sizes:
            logger.warning("Index size map is empty - shard balancing is DEGRADED, shards may be unbalanced/OOM")
        elif len(set(sizes.values())) == 1:
            logger.warning("Index size map has uniform weights - shard balancing is DEGRADED, shards may be unbalanced/OOM")
        return sizes

    @classmethod
    def _snake_assign(cls, keys, shard_index, shard_count, weight_fn):
        """Deterministically pick this shard's keys out of `keys`, a collection of
        (title, lang) tuples. Snake-distributes keys sorted by descending weight_fn(key)
        so the heavy head spreads evenly across shards. Returns a set of selected keys."""
        # stable, deterministic ordering: by descending weight, then by key
        ordered = sorted(keys, key=lambda k: (-weight_fn(k), k))
        selected = set()
        for pos, key in enumerate(ordered):
            # snake: 0..N-1, then N-1..0, repeating -> balances big items across shards
            cycle = pos // shard_count
            offset = pos % shard_count
            assigned = offset if cycle % 2 == 0 else (shard_count - 1 - offset)
            if assigned == shard_index:
                selected.add(key)
        return selected

    @classmethod
    def _select_shard_keys(cls, keys, shard_index, shard_count, size_map=None):
        """Same snake selection as _select_shard_groups, but operating on bare (title, lang)
        keys instead of a versions_by_index dict - lets index_all pick this shard's titles
        from a metadata-only projection, before any Version (with text) is loaded."""
        if not size_map:
            logger.warning("No size map provided - falling back to uniform weights, shard memory may be unbalanced")
        size_map = size_map or {}
        # no versions_by_index here to fall back on for weight, so use a constant
        weight_fn = lambda key: size_map.get(key[0], 1)
        return cls._snake_assign(keys, shard_index, shard_count, weight_fn)

    @classmethod
    def _select_shard_groups(cls, versions_by_index, shard_index, shard_count, size_map=None):
        """Deterministically pick this shard's (title, lang) groups.
        Snake-distribute groups sorted by descending size so the heavy head spreads evenly."""
        if not size_map:
            logger.warning("No size map provided - falling back to uniform weights, shard memory may be unbalanced")
        size_map = size_map or {}
        weight_fn = lambda key: size_map.get(key[0], len(versions_by_index[key]))
        selected_keys = cls._snake_assign(versions_by_index.keys(), shard_index, shard_count, weight_fn)
        return {key: versions_by_index[key] for key in versions_by_index if key in selected_keys}

    @classmethod
    def index_all(cls, index_name, debug=False, for_es=True, action=None, shard_index=None, shard_count=None):
        start_time = datetime.now()
        cls.index_name = index_name
        
        logger.debug(f"TextIndexer.index_all starting - index_name: {index_name}, debug: {debug}, for_es: {for_es}")
        
        # Create priority map and terms dict
        cls.create_version_priority_map()
        logger.debug("Created terms dictionary")
        cls.create_terms_dict()
        
        logger.debug("Clearing Ref cache to save RAM")
        Ref.clear_cache()

        if shard_index is not None and shard_count is not None:
            # Sharded path: pick this shard's (title, lang) groups from METADATA ONLY -
            # a cheap projection over VersionState/Version, no text loaded - so we know
            # which titles to load BEFORE loading any of them. Loading everything first
            # and filtering after (the old behavior) defeats sharding's memory benefit:
            # every shard would hold the whole corpus in RAM just to discard most of it.
            size_map = cls._index_size_map()
            keys = set()
            # A dead Mongo socket (AutoReconnect) mid-cursor is retried by restarting the
            # whole metadata-only scan (cheap, no text loaded) rather than crashing the shard -
            # same budget/pattern as get_all_versions and _index_size_map above.
            for attempt in range(MAX_RETRY_ATTEMPTS + 1):
                try:
                    for v in db.texts.find({}, {"title": 1, "versionTitle": 1, "language": 1}):
                        if (v.get("title"), v.get("versionTitle"), v.get("language")) in cls.version_priority_map:
                            keys.add((v.get("title"), v.get("language")))
                    break
                except pymongo.errors.AutoReconnect as e:
                    keys.clear()
                    if attempt >= MAX_RETRY_ATTEMPTS:
                        raise
                    if attempt % 10 == 0:
                        logger.warning(f"MongoDB AutoReconnect while scanning db.texts for shard key metadata, retrying - attempt: {attempt}")
                    pytime.sleep(RETRY_SLEEP_SECONDS)
            selected_keys = cls._select_shard_keys(keys, shard_index, shard_count, size_map)
            titles = sorted({t for (t, l) in selected_keys})

            logger.debug("Sorting versions by priority")
            versions = sorted(
                [x for x in cls.get_all_versions(query={"title": {"$in": titles}})
                 if (x.title, x.versionTitle, x.language) in cls.version_priority_map
                 and (x.title, x.language) in selected_keys],
                key=lambda x: cls.version_priority_map[(x.title, x.versionTitle, x.language)][0]
            )
            versions_by_index = {}
            for v in versions:
                key = (v.title, v.language)
                versions_by_index.setdefault(key, []).append(v)

            logger.info(f"Shard {shard_index}/{shard_count}: indexing {len(versions_by_index)} of the title groups")
            logger.info(f"Shard {shard_index}/{shard_count}: loaded {len(versions)} versions for {len(titles)} titles")
        else:
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

        cls._current_title = None
        cls._mark_progress()
        heartbeat_stop = threading.Event()
        heartbeat_thread = threading.Thread(
            target=cls._heartbeat_loop,
            args=(heartbeat_stop, shard_index, shard_count),
            daemon=True,
        )
        heartbeat_thread.start()

        try:
            vcount, skipped, failed = cls._index_all_titles(
                versions_by_index, total_indexes, start_time, for_es, action,
                vcount, skipped, failed, shard_index, shard_count,
            )
        finally:
            heartbeat_stop.set()

        elapsed = datetime.now() - start_time
        logger.info(f"TextIndexer.index_all completed - total_indexed: {vcount}, total_skipped: {skipped}, total_failed: {failed}, elapsed: {elapsed}")

    @classmethod
    def _index_all_titles(cls, versions_by_index, total_indexes, start_time, for_es, action,
                           vcount, skipped, failed, shard_index, shard_count):
        """The per-title indexing loop, split out of index_all so the heartbeat thread wraps
        it cleanly via try/finally. Returns the updated (vcount, skipped, failed) counters."""
        shard_label = f"Shard {shard_index}/{shard_count}: " if shard_index is not None else ""
        for idx_count, (title, vlist) in enumerate(list(versions_by_index.items())):
            title_name = title[0] if isinstance(title, tuple) else title
            cls._mark_progress(title_name)

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

            if idx_count % PROGRESS_LOG_EVERY_N == 0:
                elapsed_so_far = datetime.now() - start_time
                logger.info(
                    f"{shard_label}TextIndexer progress: {idx_count}/{total_indexes} indexes "
                    f"({100*idx_count//total_indexes}%), current title: {title_name}, "
                    f"{vcount} versions indexed, elapsed: {elapsed_so_far}"
                )

        return vcount, skipped, failed

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
        if not doc:  # segment is empty in this version — nothing to index
            return
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


def index_sheets_by_timestamp(timestamp, debug=False):
    """
    :param timestamp str: index all sheets modified after `timestamp` (in isoformat)
    :param debug: use debug index names when True
    """
    logger.debug(f"Starting index_sheets_by_timestamp - timestamp: {timestamp}, debug: {debug}")
    
    name_dict = get_new_and_current_index_names('sheet', debug=debug)
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


def library_topic_slugs():
    """
    Slugs of the topics curated into the `library` TopicPool (Postgres, via
    django_topics). Entity search only indexes these: the full Mongo TopicSet
    carries ~40k topics, most of them auto-generated noise that was never
    curated for the library.
    """
    return list(DjangoTopic.objects.get_topic_slugs_by_pool(PoolType.LIBRARY.value))


def is_library_pool_topic(slug):
    """
    Whether one topic is in the `library` TopicPool — the same inclusion rule
    `library_topic_slugs` applies to the full rebuild, asked one slug at a time so the
    per-save hook doesn't pull all ~5.5k pool slugs on every Topic save.

    Deliberately a live query rather than DjangoTopic.objects.get_pools_by_topic_slug,
    whose `slug_to_pools` cache is per-process and is only rebuilt by a Django-side
    Topic.save() — a pool edit on one web server would leave every other server's copy
    stale, and this decides what the public index contains.
    """
    return DjangoTopic.objects.filter(slug=slug, pools__name=PoolType.LIBRARY.value).exists()


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


def _as_year_int(value):
    """
    Coerce a stored year property to an int, or None if it isn't a usable number.

    Author years come from free-form `Topic.properties`, so a year can arrive as an int
    (1204), a numeric string ('1204'), an empty string, or an unparseable scrap like
    'c. 1204'. Anything that isn't a plain number is treated as absent so it can fall
    through to the next candidate year rather than poison the sort.
    """
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _author_sort_year(topic):
    """
    The single year an author sorts by: `deathYear`, falling back to `birthYear`, or
    None when neither is usable (that author then trails via the sort's `missing: _last`).

    Note the `is not None` check rather than truthiness: year 0 is a real (if unlikely)
    value, and BCE years are stored negative, so both must survive the fallback.
    """
    for prop in ('deathYear', 'birthYear'):
        year = _as_year_int(topic.get_property(prop))
        if year is not None:
            return year
    return None


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
        'description_en': strip_markdown(description.get('en', '')),
        'description_he': strip_markdown(description.get('he', '')),
    }

    if is_author:
        # `get_property` reads `self.properties` and works on a base Topic instance,
        # so we don't need to re-load the record as an AuthorTopic subclass. These
        # fields are sparse; _without_none() omits any that are absent (rather than
        # writing null into _source).
        doc['era'] = topic.get_property('era')
        # Both are mapped as `integer`, but the stored properties are free-form and can
        # hold '' or 'c. 1204'. ES rejects the *whole document* on a type mismatch, which
        # would silently drop the author from the index entirely, so coerce here and let
        # _without_none() omit anything unparseable.
        doc['birthYear'] = _as_year_int(topic.get_property('birthYear'))
        doc['deathYear'] = _as_year_int(topic.get_property('deathYear'))
        # `sortYear` is the derived single year the chronological sort keys on (death
        # year, else birth year). It is computed here rather than in the query so the
        # sort stays a plain field sort.
        doc['sortYear'] = _author_sort_year(topic)
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
    # collective_title is a plain string term key (e.g. "Rashi", "Chafetz Chaim"), not a
    # dict — see Index._saveable_attr_keys / Index.contents(). Treat it as the English
    # collective title directly; the Hebrew side is resolved via hebrew_term() elsewhere.
    collective_en = getattr(index, 'collective_title', None)
    if collective_en and collective_en not in variants:
        variants.append(collective_en)

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
        # Prefer the short description, but fall back to the long one — many Indexes
        # carry only `enDesc`/`heDesc`, and showing that beats showing nothing. Mirrors
        # the author-works aggregation in helper.topic._serialize_author_index().
        'description_en': strip_markdown(getattr(index, 'enShortDesc', '') or getattr(index, 'enDesc', '') or ''),
        'description_he': strip_markdown(getattr(index, 'heShortDesc', '') or getattr(index, 'heDesc', '') or ''),
        'compDate': comp_date,
        'era': getattr(index, 'era', None),
        'authors': author_slugs,
        'author_names': author_names,
        'order': getattr(index, 'order', None),
    })


def make_category_index_document(toc_node):
    """
    Build an Elasticsearch document for one TOC category for the `category` index.

    The document id is the slash-joined path ("Halakhah/Mishneh Torah"), so reindexing is
    idempotent and the id doubles as the key used to exclude that category's books from
    the Books tab's flat results.

    **Where the title variants come from.** A `Category` record almost always carries a
    `sharedTitle` naming a `Term` (all 309 searchable categories do today), and
    `AbstractTitledOrTermedObject._process_terms` — which runs during `Category`'s own
    `_set_derived_attributes` — *replaces* the category's title group with that Term's
    title group. So `cat_obj.get_titles(lang)` already returns the Term's full title list
    when there is a sharedTitle, and the category's own titles when there isn't. That is
    exactly the intended matching rule, and it needs no explicit Term lookup here.

    Note this can't read titles off `toc_node` itself: `TocCategory.__init__` copies only
    the *primary* EN/HE titles out of the category object, so the variants ("Bible",
    "Gemara", "Mishnah Torah") only exist on the underlying `Category` record.

    :param toc_node: a `TocCategory` node from the TOC tree
    :return: dict document, or None if the node has no English title or no path
    """
    path_components = toc_node.full_path
    title_en = toc_node.primary_title("en")
    if not path_components or not title_en:
        return None
    title_he = toc_node.primary_title("he") or None  # "" would sort before "A" in the A-Z sort

    cat_obj = toc_node.get_category_object()
    if cat_obj is not None:
        all_titles = (cat_obj.get_titles("en") or []) + (cat_obj.get_titles("he") or [])
    else:
        # No backing Category record (not observed among the searchable categories, but the
        # TOC tree does not guarantee one): fall back to the node's primary titles alone.
        all_titles = []
    primaries = {title_en, title_he}
    variants = []
    for t in all_titles:
        if t and t not in primaries and t not in variants:
            variants.append(t)

    # Prefer the short description (what the book index indexes), fall back to the long one.
    desc_en = getattr(toc_node, 'enShortDesc', '') or getattr(toc_node, 'enDesc', '') or ''
    desc_he = getattr(toc_node, 'heShortDesc', '') or getattr(toc_node, 'heDesc', '') or ''

    order = getattr(toc_node, 'order', None)
    return _without_none({
        'title_en': title_en,
        'title_he': title_he,
        'titleVariants': variants,
        'categories': path_components[:-1],  # parent path -> the card's breadcrumb
        'path': "/".join(path_components),
        'depth': len(path_components),
        'description_en': strip_markdown(desc_en),
        'description_he': strip_markdown(desc_he),
        'order': order if isinstance(order, int) else None,
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
    Index every Topic (and AuthorTopic) in the `library` TopicPool into `index_name`,
    keyed by slug (idempotent). Topics outside the pool are not indexed at all.
    Skipped slugs (no title / no slug) are collected into the returned summary.
    """
    logger.info(f"Starting index_topics - index_name: {index_name}")
    skipped = []
    total = 0
    pool_slugs = library_topic_slugs()
    if not pool_slugs:
        raise RuntimeError("index_topics: library TopicPool is empty; refusing to build an empty topic index")
    authored_titles_map = _build_authored_titles_map()

    def actions():
        nonlocal total
        for topic in TopicSet({"slug": {"$in": pool_slugs}}):
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


def index_categories(index_name):
    """
    Index the library's searchable TOC categories into `index_name`, keyed by path
    (idempotent). Skipped/failed paths are collected into the returned summary.

    Only the categories returned by `get_search_categories` are indexed — the browse
    taxonomy (categories with at least two children), plus the good names harvested one
    level below each commentary/era/"Other" boundary (Rashi, Ramban, Kessef Mishneh, …)
    but never the boundary node itself. The rest of the ~1,000-node category tree is
    either leaf buckets or repeated per-book structure that nobody searches for by name.
    Sharing that function with the autocompleter is deliberate: the set of categories you
    can complete and the set you can search stay identical by construction.
    """
    logger.info(f"Starting index_categories - index_name: {index_name}")
    skipped = []
    total = 0
    toc_nodes = get_searchable_toc_categories(library.get_toc_tree().get_root())
    if not toc_nodes:
        raise RuntimeError("index_categories: no searchable categories found; refusing to build an empty category index")

    def actions():
        nonlocal total
        for node in toc_nodes:
            total += 1
            try:
                doc = make_category_index_document(node)
            except Exception as e:
                label = "/".join(getattr(node, 'full_path', None) or ['<unknown>'])
                logger.warning(f"index_categories: failed building doc for '{label}': {e}")
                skipped.append(label)
                continue
            if doc is None:
                skipped.append("/".join(getattr(node, 'full_path', None) or ['<no-path>']))
                continue
            yield {"_index": index_name, "_id": doc['path'], "_source": doc}

    result = _bulk_index_entities(index_name, actions(), "categories")
    result.update({"total": total, "skipped": skipped})
    if skipped:
        logger.info(f"index_categories skipped {len(skipped)} categories (sample): {skipped[:20]}")
    return result


# --------------------------------------------------------------------------- #
#  Entity search: single-doc updates                                          #
#                                                                             #
#  Incremental counterparts to index_topics/index_books, called from the      #
#  model dependency hooks in sefaria/model/dependencies.py when a book or     #
#  topic is saved, renamed, or deleted. Doc ids are deterministic (topic      #
#  slug / book English title) so a save is a plain upsert; only an id change  #
#  or a delete needs an explicit doc deletion. All of these are best-effort:  #
#  they log and swallow failures, because they run after the change has       #
#  already been committed to Mongo — the weekly full rebuild reconciles any   #
#  docs missed here.                                                          #
# --------------------------------------------------------------------------- #

def _current_entity_index_name(entity_type):
    index_names = get_new_and_current_index_names(entity_type)
    if not index_names or not index_names.get('current'):
        logger.error(f"Could not resolve current index name - entity_type: {entity_type}")
        return None
    return index_names['current']


def index_topic_doc(topic):
    """
    Upsert the ES doc for a single topic (doc id = slug) in the live `topic` index —
    but only for topics in the `library` TopicPool, which is the same inclusion rule
    index_topics applies to the full rebuild. A topic outside the pool has its doc
    deleted instead, so this hook can only ever move the live index toward what the
    next rebuild would produce, never away from it.

    Without the pool check every save of one of the ~35k uncurated Mongo topics would
    publish it to live entity search, where it would sit until the weekly rebuild
    dropped it again.
    """
    slug = getattr(topic, 'slug', '<no-slug>')
    try:
        index_name = _current_entity_index_name('topic')
        if not index_name:
            return
        if not is_library_pool_topic(slug):
            # Not a no-op: pool membership can be revoked after the topic was indexed,
            # and this is the only hook that notices. warn_if_missing=False because the
            # overwhelming majority of these were never indexed at all — a miss here is
            # the normal case, not an anomaly worth a log line.
            delete_topic_doc(slug, warn_if_missing=False)
            return
        # No authored_titles_map: for a single author topic the per-slug IndexSet
        # fallback inside the builder is the right trade-off (see its docstring).
        doc = make_topic_index_document(topic)
        if not doc:
            return
        es_client.index(index=index_name, document=doc, id=doc['slug'])
    except Exception as e:
        # Includes a failed pool lookup: on an unreachable Postgres this leaves the doc
        # exactly as it was rather than guessing, which is the safe direction for both a
        # wrongful publish and a wrongful delete.
        logger.error(f"Failed to index topic doc - slug: {slug}, error: {e}")


def delete_topic_doc(slug, warn_if_missing=True):
    """
    Delete the ES doc for a single topic (doc id = slug) from the live `topic` index.

    `warn_if_missing=False` for callers where an absent doc is the expected outcome
    rather than a symptom (see index_topic_doc's non-pool branch).
    """
    try:
        index_name = _current_entity_index_name('topic')
        if not index_name:
            return
        es_client.delete(index=index_name, id=slug)
    except NotFoundError:
        # Expected for topics that never made it into the index (no titles,
        # oversized slug, or indexed while SEARCH_INDEX_ON_SAVE was off).
        if warn_if_missing:
            logger.warning(f"Topic doc not found when deleting - slug: {slug}")
    except Exception as e:
        logger.error(f"Failed to delete topic doc - slug: {slug}, error: {e}")


def index_book_doc(index):
    """
    Upsert the ES doc for a single book (doc id = English title) in the live `book` index.
    """
    title = getattr(index, 'title', '<no-title>')
    try:
        index_name = _current_entity_index_name('book')
        if not index_name:
            return
        doc = make_book_index_document(index)
        if not doc:
            return
        es_client.index(index=index_name, document=doc, id=doc['title_en'])
    except Exception as e:
        logger.error(f"Failed to index book doc - title: {title}, error: {e}")


def delete_book_doc(title_en):
    """
    Delete the ES doc for a single book (doc id = English title) from the live `book` index.
    """
    try:
        index_name = _current_entity_index_name('book')
        if not index_name:
            return
        es_client.delete(index=index_name, id=title_en)
    except NotFoundError:
        logger.warning(f"Book doc not found when deleting - title: {title_en}")
    except Exception as e:
        logger.error(f"Failed to delete book doc - title: {title_en}, error: {e}")


def index_book_docs(indexes):
    """
    Re-upsert the ES book docs for an iterable of Index records in one bulk request.
    The incremental counterpart to index_books for a bounded set — e.g. every book
    under a category whose path just changed. Doc ids are the (unchanged) English
    titles, so existing docs are overwritten in place; per-doc build failures are
    logged and skipped so one bad record can't block the rest.
    """
    try:
        index_name = _current_entity_index_name('book')
        if not index_name:
            return
        author_name_cache = {}
        actions = []
        for index in indexes:
            try:
                doc = make_book_index_document(index, author_name_cache)
            except Exception as e:
                logger.warning(f"index_book_docs: failed building doc for '{getattr(index, 'title', '<unknown>')}': {e}")
                continue
            if doc is None:
                continue
            actions.append({"_index": index_name, "_id": doc['title_en'], "_source": doc})
        if not actions:
            return
        succeeded, errors = bulk(es_client, actions, raise_on_error=False)
        if errors:
            logger.warning(f"index_book_docs bulk errors - count: {len(errors)}, sample: {errors[:5]}")
        logger.info(f"index_book_docs - index_name: {index_name}, succeeded: {succeeded}, errors: {len(errors)}")
    except Exception as e:
        logger.error(f"index_book_docs failed - error: {e}")


def resync_category_docs():
    """
    Re-sync the whole live `category` index from the current TOC tree: upsert every main
    category and delete any doc whose path is no longer one.

    Unlike topics and books — which get surgical per-document upserts — categories are
    re-synced wholesale, because a single category edit is not a single-document change.
    Renaming "Halakhah" rewrites the path (and therefore the document id) of every
    category beneath it, and a category that gains or loses its last child moves in or
    out of the searchable set entirely (its child count crosses the two-child threshold, or
    a rename turns it into a boundary). Tracking those cascades individually would be easy
    to get subtly wrong; a full re-sync is unconditionally correct and, at ~309 documents
    in one bulk request, cheaper than the logic it replaces.

    Best-effort like the other on-save hooks: failures are logged, not raised, since the
    Mongo write has already been committed and the weekly rebuild reconciles anyway.
    """
    try:
        index_name = _current_entity_index_name('category')
        if not index_name:
            return
        actions = []
        current_paths = set()
        for node in get_searchable_toc_categories(library.get_toc_tree().get_root()):
            try:
                doc = make_category_index_document(node)
            except Exception as e:
                label = "/".join(getattr(node, 'full_path', None) or ['<unknown>'])
                logger.warning(f"resync_category_docs: failed building doc for '{label}': {e}")
                continue
            if doc is None:
                continue
            current_paths.add(doc['path'])
            actions.append({"_index": index_name, "_id": doc['path'], "_source": doc})
        if not actions:
            # Never delete the whole index off the back of an empty or half-built TOC tree.
            logger.warning("resync_category_docs: no category docs built; leaving the index untouched")
            return

        # Delete docs for paths that no longer exist (renames, deletions, categories that
        # dropped out of the main set). Scan is bounded by the index's ~309 docs, well under
        # the size cap below — a category set that outgrew the cap would silently stop having
        # its stale docs deleted.
        try:
            existing = es_client.search(index=index_name, size=1000, source=False, query={"match_all": {}})
            for hit in existing.get('hits', {}).get('hits', []):
                if hit['_id'] not in current_paths:
                    actions.append({"_op_type": "delete", "_index": index_name, "_id": hit['_id']})
        except NotFoundError:
            logger.warning(f"resync_category_docs: index not found, will only upsert - index_name: {index_name}")

        succeeded, errors = bulk(es_client, actions, raise_on_error=False)
        if errors:
            logger.warning(f"resync_category_docs bulk errors - count: {len(errors)}, sample: {errors[:5]}")
        logger.info(f"resync_category_docs - index_name: {index_name}, succeeded: {succeeded}, errors: {len(errors)}")
    except Exception as e:
        logger.error(f"resync_category_docs failed - error: {e}")


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
        'category': SEARCH_INDEX_NAME_CATEGORY,
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
    
    # Index entities (topics, books, categories). Each entity type is attempted
    # independently of the others - a failure on one does not block the rest - but
    # index_entities raises once all types have been attempted if any failed, so this
    # call can raise too. By this point the durable text/sheet cutover above has already
    # completed, so a failure here costs a re-run of entity indexing, not the full reindex.
    topic_elapsed = index_entities(skip=skip, debug=debug)

    # Clear index queue
    clear_index_queue()

    end = datetime.now()
    total_elapsed = end - start
    logger.info("=" * 60)
    logger.info(f"COMPLETED FULL ELASTICSEARCH REINDEX - total_elapsed: {total_elapsed}, text_elapsed: {text_elapsed}, sheet_elapsed: {sheet_elapsed}, entity_elapsed: {topic_elapsed}")
    logger.info("=" * 60)


def clear_index_queue():
    """Remove all entries from the index queue after a full reindex."""
    logger.debug("Clearing stale index queue")
    deleted = db.index_queue.delete_many({})
    logger.debug(f"Cleared index queue - deleted_count: {deleted.deleted_count}")
    return deleted.deleted_count


def _index_doc_count(index_name):
    """Doc count for an index. Returns 0 if the index is absent (legit, e.g. first run),
    or None if the count could not be read (transient error) so callers can fail closed."""
    try:
        if not index_client.exists(index=index_name):
            return 0
    except Exception as e:
        logger.warning(f"Could not check index existence - index: {index_name}, error: {e}")
        return None
    try:
        stats = index_client.stats(index=index_name)
        return stats.get('_all', {}).get('primaries', {}).get('docs', {}).get('count', 0)
    except Exception as e:
        logger.warning(f"Could not read index doc count - index: {index_name}, error: {e}")
        return None


def _assert_not_shared_index(alias, type):
    """
    Refuse to operate on a shared/default index alias unless explicitly allowed. The dev
    Elasticsearch cluster is shared across cauldrons, and both index creation (reindex_init)
    and the alias swap (reindex_finalize -> _swap_alias_atomically, which does a wildcard
    `remove`) are destructive to whatever else lives under that alias on a shared cluster.

    The entity aliases ('topic', 'book', 'category') are covered too. They became reachable
    from a cauldron reindex once the orchestrator started rebuilding entity indices, and
    unlike text/sheet they are NOT isolated per environment by default -- a cauldron that
    has its own text/sheet names can still be pointing at the shared entity aliases, so
    without this they would be the one destructive path left open.
    """
    shared_index_names = ("text", "sheet", "topic", "book", "category")
    allow_shared_index = os.environ.get("REINDEX_ALLOW_SHARED_INDEX", "").lower() in ("1", "true", "yes")
    if alias in shared_index_names and not allow_shared_index:
        raise ValueError(
            f"Reindex sanity gate failed for {type}: alias {alias!r} is a shared default index "
            f"name; operating on it risks destroying or stripping the alias from every index on a "
            f"shared cluster (wildcard `remove` in _swap_alias_atomically). Refusing to proceed. Set "
            f"ISOLATE_SEARCH_INDEXES=true (cauldron path) to give this environment its own indexes, "
            f"or REINDEX_ALLOW_SHARED_INDEX=true (prod/preprod, intentional, informed opt-in) to proceed."
        )


def reindex_init(type, debug=False):
    """
    Phase 1: Create the new index with bulk-load settings.
    Safe to call multiple times: reuses a partially-filled new index instead of wiping it.
    Returns the names dict from get_new_and_current_index_names.
    """
    names = get_new_and_current_index_names(type=type, debug=debug)
    _assert_not_shared_index(names['alias'], type)
    new_index = names['new']
    if index_client.exists(index=new_index):
        doc_count = _index_doc_count(new_index)
        if doc_count is None:
            raise ValueError(
                f"reindex_init failed for {type}: could not read doc count for in-progress index {new_index}"
            )
        if doc_count > 0:
            logger.info(
                f"reindex_init reusing in-progress index - type: {type}, new_index: {new_index}, doc_count: {doc_count}"
            )
            set_index_bulk_load_settings(new_index)
            return names
        logger.info(f"reindex_init recreating empty index - type: {type}, new_index: {new_index}")
        create_index(new_index, type, force=True)
    else:
        create_index(new_index, type, force=False)
    set_index_bulk_load_settings(new_index)
    logger.info(f"reindex_init complete - type: {type}, new_index: {new_index}")
    return names


ENTITY_TYPES = ('topic', 'book', 'category')


def reindex_index_shard(type, shard_index=None, shard_count=None, debug=False):
    """
    Phase 2: Index one shard (or the whole corpus if shard_index/shard_count are None)
    into the existing new index. Does NOT create or alias-swap the index.
    """
    names = get_new_and_current_index_names(type=type, debug=debug)
    if type == 'text':
        TextIndexer.clear_cache()
        TextIndexer.index_all(names['new'], debug=debug, shard_index=shard_index, shard_count=shard_count)
    elif type == 'sheet':
        index_public_sheets(names['new'])
    elif type in ENTITY_TYPES:
        # Entity corpora are small (topics in the thousands, books ~3k, categories in the
        # hundreds) against text's millions of segments - sharding buys nothing here and only
        # adds ES write pressure. They are indexed single-shot, never fanned out: under a
        # sharded invocation only shard 0 does the work, so N pods don't each rebuild the
        # whole corpus.
        if shard_index not in (None, 0):
            logger.info(f"reindex_index_shard skipping {type} on shard {shard_index} - "
                        f"entity types are indexed single-shot on shard 0")
            return
        # Built here (not at module scope) so it resolves index_topics/index_books/index_categories
        # by current name each call, same as the text/sheet branches above.
        entity_indexers = {'topic': index_topics, 'book': index_books, 'category': index_categories}
        entity_indexers[type](names['new'])
    else:
        raise ValueError(f"Unknown index type: {type}")
    logger.info(f"reindex_index_shard complete - type: {type}, shard: {shard_index}/{shard_count}")


def _swap_alias_atomically(names):
    """
    Atomically repoint the stable alias at the new index.
    Removes the alias from every index in one request, then adds it to the new index.
    """
    actions = [
        {"remove": {"index": "*", "alias": names['alias'], "must_exist": False}},
        {"add": {"index": names['new'], "alias": names['alias']}},
    ]
    index_client.update_aliases(body={"actions": actions})
    logger.debug(
        f"Atomically swapped alias - alias: {names['alias']}, new_index: {names['new']}, "
        f"previous_index: {names['current']}"
    )


def reindex_finalize(type, debug=False, min_doc_ratio=0.9):
    """
    Phase 3: Restore production index settings, run a sanity gate on doc counts,
    then swap the alias and drop the old index.
    """
    names = get_new_and_current_index_names(type=type, debug=debug)
    restore_index_settings(names['new'])
    new_count = _index_doc_count(names['new'])
    current_count = _index_doc_count(names['current'])
    if new_count is None:
        raise ValueError(f"Reindex sanity gate failed for {type}: could not read new index {names['new']} doc count; refusing alias swap")
    if current_count is None:
        raise ValueError(f"Reindex sanity gate failed for {type}: could not read current index {names['current']} doc count; refusing alias swap")
    if current_count == 0 and new_count == 0:
        raise ValueError(
            f"Reindex sanity gate failed for {type}: new index {names['new']} is empty and there is no current index; refusing alias swap"
        )
    if current_count > 0 and new_count < current_count * min_doc_ratio:
        raise ValueError(
            f"Reindex sanity gate failed for {type}: new index {names['new']} has {new_count} docs "
            f"but current index {names['current']} has {current_count} "
            f"(ratio {new_count/current_count:.2%} < required {min_doc_ratio:.0%}). Refusing alias swap."
        )

    # Defense in depth: reindex_init already checks this before creating/clearing any index,
    # but finalize can be invoked independently and is the operation that does the wildcard
    # alias strip, so re-check here too.
    _assert_not_shared_index(names['alias'], type)

    # Drop any erroneous physical index named like the alias before swapping: an alias and a
    # concrete index cannot share a name, so a stray index called e.g. 'topic' would make the
    # `add` action in _swap_alias_atomically fail. exists() resolves alias names too, so confirm
    # the name is NOT already our alias -- otherwise this fires on every single reindex and the
    # DELETE 400s ("matches an alias, specify the corresponding concrete indices instead").
    logger.debug("Switching aliases after indexing")
    if index_client.exists(index=names['alias']) and not index_client.exists_alias(name=names['alias']):
        clear_index(names['alias'])

    _swap_alias_atomically(names)

    if names['new'] != names['current']:
        logger.debug(f"Cleaning up old index - old_index: {names['current']}")
        clear_index(names['current'])

    logger.info(f"reindex_finalize complete - type: {type}, alias -> {names['new']} ({new_count} docs)")


def index_entities(skip=0, debug=False, types=('topic', 'book', 'category')):
    """
    (Re)build the entity indices that power /api/entity-search.

    Each index type is rebuilt independently: a failure on one is logged and
    recorded but does not prevent the others from completing. Once every type has
    been attempted, any failures are raised together in a single summary so a
    stale entity index is never silently reported as a successful reindex.
    Callable on its own for an on-demand entity reindex, or from `index_all` as
    part of the full run.

    :param types: which entity index types to rebuild (subset of 'topic', 'book', 'category')
    :return: timedelta elapsed across all entity indexing
    :raises RuntimeError: if any entity type failed, naming which one(s), after all
        types have been attempted
    """
    entity_start = datetime.now()
    failures = []
    for entity_type in types:
        type_start = datetime.now()
        logger.info(f"Starting {entity_type} indexing phase")
        try:
            index_all_of_type(entity_type, skip=skip, debug=debug)
            logger.info(f"Completed {entity_type} indexing phase - elapsed: {datetime.now() - type_start}")
        except Exception as e:
            logger.error(f"{entity_type} indexing phase failed after {datetime.now() - type_start} - error: {str(e)}", exc_info=True)
            failures.append((entity_type, e))
    if failures:
        raise RuntimeError(f"Entity indexing failed for: {', '.join(t for t, _ in failures)}")
    return datetime.now() - entity_start


def index_all_of_type(type, skip=0, debug=False):
    """
    Index all documents of a given type (text or sheet).
    Composes the three phase functions: init -> index_shard -> finalize.
    Note: the ``skip`` parameter is accepted for backward compatibility but is no longer
    forwarded; resume-from-skip is a no-op now that indexing is sharded/phase-split.
    """
    reindex_init(type, debug=debug)
    reindex_index_shard(type, debug=debug)
    reindex_finalize(type, debug=debug)


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
    elif type == 'category':
        logger.debug("Starting category indexing")
        index_categories(index_name)
        logger.debug("Completed category indexing")
    else:
        logger.error(f"Unknown index type - type: {type}")
        raise ValueError(f"Unknown index type: {type}")
