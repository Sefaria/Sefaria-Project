"""
dependencies.py -- list cross model dependencies and subscribe listeners to changes.
"""

from . import abstract, link, note, history, schema, text, layer, version_state, timeperiod, garden, notification, collection, library, category, ref_data, user_profile, manuscript, topic, place, marked_up_text_chunk

from .abstract import subscribe, cascade, cascade_to_list, cascade_delete, cascade_delete_to_list
# ES cascade handlers that keep the search indices in sync with model changes.
# sefaria.helper.search deliberately avoids importing sefaria.model at module level,
# so importing it here (while sefaria.model's __init__ is still running) is safe.
from sefaria.helper.search import (
    process_index_title_change_in_search,
    process_index_title_change_in_book_search,
    process_index_save_in_book_search,
    process_index_delete_in_book_search,
    process_topic_save_in_topic_search,
    process_topic_delete_in_topic_search,
    process_category_path_change_in_book_search,
    process_category_change_in_category_search,
)
import sefaria.system.cache as scache
import structlog

logger = structlog.get_logger(__name__)

# Index Save / Create
subscribe(text.process_index_change_in_core_cache,                      text.Index, "save")
subscribe(version_state.create_version_state_on_index_creation,         text.Index, "save")
subscribe(text.process_index_change_in_toc,                             text.Index, "save")
subscribe(place.process_index_place_change, text.Index, 'attributeChange', 'compPlace')
subscribe(place.process_index_place_change, text.Index, 'attributeChange', 'pubPlace')
# Entity search: keep the `book` index in sync with Index saves
subscribe(process_index_save_in_book_search,                            text.Index, "save")

# Index Name Change
subscribe(text.process_index_title_change_in_core_cache,                text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_versions,                  text.Index, "attributeChange", "title")
subscribe(version_state.process_index_title_change_in_version_state,    text.Index, "attributeChange", "title")
subscribe(link.process_index_title_change_in_links,                     text.Index, "attributeChange", "title")
subscribe(note.process_index_title_change_in_notes,                     text.Index, "attributeChange", "title")
subscribe(history.process_index_title_change_in_history,                text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_dependant_records,         text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_sheets,                    text.Index, "attributeChange", "title")
subscribe(cascade(notification.GlobalNotificationSet, "content.index"), text.Index, "attributeChange", "title")
subscribe(ref_data.process_index_title_change_in_ref_data,              text.Index, "attributeChange", "title")
subscribe(user_profile.process_index_title_change_in_user_history,      text.Index, "attributeChange", "title")
subscribe(topic.process_index_title_change_in_topic_links,              text.Index, "attributeChange", "title")
subscribe(manuscript.process_index_title_change_in_manuscript_links,    text.Index, "attributeChange", "title")
subscribe(marked_up_text_chunk.process_index_title_change,              text.Index, "attributeChange", "title")
# ES: listeners fire in subscription order, so these must stay last in this block —
# in particular after process_index_title_change_in_versions has renamed the book's
# versions in Mongo, which process_index_title_change_in_search re-reads.
subscribe(process_index_title_change_in_search,                         text.Index, "attributeChange", "title")
subscribe(process_index_title_change_in_book_search,                    text.Index, "attributeChange", "title")

# Taken care of on save
# subscribe(text.process_index_change_in_toc,                             text.Index, "attributeChange", "title")


# Index Delete (start with cache clearing)
subscribe(text.process_index_delete_in_core_cache,                      text.Index, "delete")
subscribe(version_state.process_index_delete_in_version_state,          text.Index, "delete")
subscribe(link.process_index_delete_in_links,                           text.Index, "delete")
subscribe(topic.process_index_delete_in_topic_links,                    text.Index, "delete")
subscribe(note.process_index_delete_in_notes,                           text.Index, "delete")
subscribe(text.process_index_delete_in_versions,                        text.Index, "delete")
subscribe(text.process_index_delete_in_toc,                             text.Index, "delete")
subscribe(cascade_delete(notification.GlobalNotificationSet, "content.index", "title"),   text.Index, "delete")
subscribe(ref_data.process_index_delete_in_ref_data,                    text.Index, "delete")
subscribe(marked_up_text_chunk.process_index_delete,                    text.Index, "delete")
# Entity search: keep the `book` index in sync with Index deletes
subscribe(process_index_delete_in_book_search,                          text.Index, "delete")

# Process in ES
def process_version_title_change_in_search(ver, **kwargs):
    from sefaria.settings import SEARCH_INDEX_ON_SAVE
    if SEARCH_INDEX_ON_SAVE:
        from sefaria.search import delete_version, TextIndexer, get_new_and_current_index_names
        search_index_name = get_new_and_current_index_names("text")['current']
        # no reason to deal with merged index since versions don't exist. still leaving this here in case it is necessary
        # search_index_name_merged = get_new_and_current_index_names("merged")['current']
        text_index = library.get_index(ver.title)
        delete_version(text_index, kwargs.get("old"), ver.language)
        new_version_title = kwargs.get("new")
        failed_refs = []
        for ref in text_index.all_segment_refs():
            # Best-effort reindex: a single segment failing in ES (e.g. a malformed
            # document raising a 500) must not abort the whole version rename, which
            # has already been committed to Mongo by the time this runs. Collect the
            # failures, keep going, and surface them so search can be re-synced.
            try:
                TextIndexer.index_ref(search_index_name, ref, new_version_title, ver.language, ver.languageFamilyName, ver.isPrimary)
            except Exception as e:
                failed_refs.append(ref.normal())
                logger.warning(
                    "process_version_title_change_in_search: failed to index segment",
                    index=ver.title,
                    versionTitle=new_version_title,
                    language=ver.language,
                    ref=ref.normal(),
                    error=str(e),
                )
        if failed_refs:
            logger.error(
                "process_version_title_change_in_search: some segments failed to reindex",
                index=ver.title,
                versionTitle=new_version_title,
                language=ver.language,
                failed_count=len(failed_refs),
                failed_refs=failed_refs,
            )


# A versionTitle is only unique within a book (Version.pkeys == ["title", "versionTitle"]),
# so cascading GlobalNotification changes on content.version alone would clobber notifications
# for any other book that happens to share the versionTitle. These callbacks scope the query
# by content.index (the book title), which is available on the Version instance passed by notify().
def process_version_title_change_in_global_notifications(ver, **kwargs):
    notification.GlobalNotificationSet({
        "content.index":   ver.title,
        "content.version": kwargs["old"],
    }).update({"content.version": kwargs["new"]})


def process_version_delete_in_global_notifications(ver, **kwargs):
    notification.GlobalNotificationSet({
        "content.index":   ver.title,
        "content.version": ver.versionTitle,
    }).delete()


# Version Title Change
subscribe(history.process_version_title_change_in_history,              text.Version, "attributeChange", "versionTitle")
subscribe(process_version_title_change_in_search,                       text.Version, "attributeChange", "versionTitle")
subscribe(process_version_title_change_in_global_notifications,        text.Version, "attributeChange", "versionTitle")

subscribe(process_version_delete_in_global_notifications,              text.Version, "delete")


# Note Delete
subscribe(layer.process_note_deletion_in_layer,                         note.Note, "delete")

# Topic
# Entity search: keep the `topic` index in sync with Topic saves/deletes.
# notify() dispatches on the exact instance type, and topics load as their subclass
# (Topic.subclass_map), so each concrete class needs its own subscription.
for topic_klass in (topic.Topic, topic.PersonTopic, topic.AuthorTopic):
    subscribe(process_topic_save_in_topic_search,                       topic_klass, "save")
    subscribe(process_topic_delete_in_topic_search,                     topic_klass, "delete")
subscribe(topic.process_topic_delete,                                 topic.Topic, "delete")
subscribe(topic.process_topic_description_change,                       topic.Topic, "attributeChange", "description")
subscribe(topic.process_topic_delete,                                 topic.AuthorTopic, "delete")
subscribe(marked_up_text_chunk.process_topic_slug_change,             topic.Topic, "attributeChange", "slug")


# Terms
# TODO cascade change to Term.name.
# TODO Current locations where we know terms are used [Index, Categories]
# TODO Use Sefaria-Project/scripts/search_for_indexes_that_use_terms.py for now
subscribe(cascade(schema.TermSet, "scheme"),                                schema.TermScheme, "attributeChange", "name")
subscribe(text.reset_simple_term_mapping,                                   schema.Term, "delete")
subscribe(text.reset_simple_term_mapping,                                   schema.Term, "save")
"""
Notes on where Terms are used
Index (alt structs and schema)
Category
"""

# Time
subscribe(cascade(topic.PersonTopicSet, "properties.era.value"),          timeperiod.TimePeriod, "attributeChange", "symbol")
subscribe(cascade(topic.PersonTopicSet, "properties.generation.value"),   timeperiod.TimePeriod, "attributeChange", "symbol")

# Gardens
subscribe(cascade(garden.GardenStopSet, "garden"),                         garden.Garden, "attributeChange", "key")
subscribe(cascade_delete(garden.GardenStopSet, "garden", "key"),           garden.Garden, "delete")
subscribe(cascade(garden.GardenStopRelationSet, "garden"),                 garden.Garden, "attributeChange", "key")
subscribe(cascade_delete(garden.GardenStopRelationSet, "garden", "key"),   garden.Garden, "delete")
# from stop to stop rel

# Notifications, Stories
subscribe(cascade_delete(notification.NotificationSet, "global_id", "_id"),  notification.GlobalNotification, "delete")

# Collections
subscribe(collection.process_collection_slug_change_in_sheets,             collection.Collection, "attributeChange", "slug")
subscribe(collection.process_collection_delete_in_sheets,                  collection.Collection, "delete")
subscribe(cascade_delete(notification.NotificationSet, "content.collection_slug", "slug"), collection.Collection, "delete")


# Categories
subscribe(category.process_category_path_change,  category.Category, "attributeChange", "path")
subscribe(marked_up_text_chunk.process_category_path_change,  category.Category, "attributeChange", "path")
subscribe(text.rebuild_library_after_category_change,                   category.Category, "save")
# Entity search: must stay subscribed after category.process_category_path_change,
# which cascades the new path into the Mongo Index records this hook re-reads.
subscribe(process_category_path_change_in_book_search,  category.Category, "attributeChange", "path")
# Category search: must stay subscribed after text.rebuild_library_after_category_change,
# because the re-sync reads the (rebuilt) TOC tree. Save and delete both re-sync the whole
# `category` index -- see sefaria.search.resync_category_docs.
subscribe(process_category_change_in_category_search,  category.Category, "save")
subscribe(process_category_change_in_category_search,  category.Category, "delete")

# Manuscripts
subscribe(manuscript.process_slug_change_in_manuscript,  manuscript.Manuscript, "attributeChange", "slug")
subscribe(manuscript.process_manucript_deletion,         manuscript.Manuscript, "delete")

'''
# These are contained in the library rebuild, above.
subscribe(text.reset_simple_term_mapping,                                   category.Category, "delete")
subscribe(text.reset_simple_term_mapping,                                   category.Category, "save")
'''

# todo: notes? reviews?
# todo: Scheme name change in Index
# todo: term change in nodes
