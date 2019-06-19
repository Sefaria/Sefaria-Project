"""
dependencies.py -- list cross model dependencies and subscribe listeners to changes.
"""

from . import abstract, link, note, history, schema, text, layer, version_state, translation_request, timeperiod, person, garden, notification, story, group, library, category

from abstract import subscribe, cascade, cascade_to_list, cascade_delete, cascade_delete_to_list
import sefaria.system.cache as scache

# Index Save / Create
subscribe(text.process_index_change_in_core_cache,                      text.Index, "save")
subscribe(version_state.create_version_state_on_index_creation,         text.Index, "save")
subscribe(text.process_index_change_in_toc,                             text.Index, "save")


# Index Name Change
subscribe(text.process_index_title_change_in_core_cache,                text.Index, "attributeChange", "title")
subscribe(link.process_index_title_change_in_links,                     text.Index, "attributeChange", "title")
subscribe(note.process_index_title_change_in_notes,                     text.Index, "attributeChange", "title")
subscribe(history.process_index_title_change_in_history,                text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_versions,                  text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_dependant_records,         text.Index, "attributeChange", "title")
subscribe(version_state.process_index_title_change_in_version_state,    text.Index, "attributeChange", "title")
subscribe(cascade(notification.GlobalNotificationSet, "content.index"), text.Index, "attributeChange", "title")
# Taken care of on save
# subscribe(text.process_index_change_in_toc,                             text.Index, "attributeChange", "title")


# Index Delete (start with cache clearing)
subscribe(text.process_index_delete_in_core_cache,                      text.Index, "delete")
subscribe(version_state.process_index_delete_in_version_state,          text.Index, "delete")
subscribe(link.process_index_delete_in_links,                           text.Index, "delete")
subscribe(note.process_index_delete_in_notes,                           text.Index, "delete")
subscribe(text.process_index_delete_in_versions,                        text.Index, "delete")
subscribe(translation_request.process_index_delete_in_translation_requests, text.Index, "delete")
subscribe(text.process_index_delete_in_toc,                             text.Index, "delete")
subscribe(cascade_delete(notification.GlobalNotificationSet, "content.index", "title"),   text.Index, "delete")


# Process in ES
# todo: handle index name change in ES
def process_version_title_change_in_search(ver, **kwargs):
    from sefaria.local_settings import SEARCH_INDEX_ON_SAVE
    if SEARCH_INDEX_ON_SAVE:
        from sefaria.search import delete_version, TextIndexer, get_new_and_current_index_names
        search_index_name = get_new_and_current_index_names("text")['current']
        # no reason to deal with merged index since versions don't exist. still leaving this here in case it is necessary
        # search_index_name_merged = get_new_and_current_index_names("merged")['current']
        text_index = library.get_index(ver.title)
        delete_version(text_index, kwargs.get("old"), ver.language)
        for ref in text_index.all_segment_refs():
            TextIndexer.index_ref(search_index_name, ref, kwargs.get("new"), ver.language, False)
            # TextIndexer.index_ref(search_index_name_merged, ref, None, ver.language, True)


# Version Title Change
subscribe(history.process_version_title_change_in_history,              text.Version, "attributeChange", "versionTitle")
subscribe(process_version_title_change_in_search,                       text.Version, "attributeChange", "versionTitle")
subscribe(cascade(notification.GlobalNotificationSet, "content.version"), text.Version, "attributeChange", "versionTitle")

subscribe(cascade_delete(notification.GlobalNotificationSet, "content.version", "versionTitle"),   text.Version, "delete")


# Note Delete
subscribe(layer.process_note_deletion_in_layer,                         note.Note, "delete")

# Terms
subscribe(cascade(schema.TermSet, "scheme"),                                schema.TermScheme, "attributeChange", "name")
subscribe(text.reset_simple_term_mapping,                                   schema.Term, "delete")
subscribe(text.reset_simple_term_mapping,                                   schema.Term, "save")

# Version State Save
subscribe(translation_request.process_version_state_change_in_translation_requests, version_state.VersionState, "save")

# Time
subscribe(cascade(person.PersonSet, "era"),                                timeperiod.TimePeriod, "attributeChange", "symbol")
subscribe(cascade(person.PersonSet, "generation"),                         timeperiod.TimePeriod, "attributeChange", "symbol")

# Person key change
subscribe(cascade(person.PersonRelationshipSet, "to_key"),                 person.Person, "attributeChange", "key")
subscribe(cascade(person.PersonRelationshipSet, "from_key"),               person.Person, "attributeChange", "key")
subscribe(cascade_to_list(text.IndexSet, "authors"),                       person.Person, "attributeChange", "key")

subscribe(cascade(person.PersonRelationshipSet, "type"),                   person.PersonRelationshipType, "attributeChange", "key")

# Person delete
subscribe(cascade_delete(person.PersonRelationshipSet, "to_key", "key"),   person.Person, "delete")
subscribe(cascade_delete(person.PersonRelationshipSet, "from_key", "key"), person.Person, "delete")
subscribe(cascade_delete_to_list(text.IndexSet, "authors", "key"),         person.Person, "delete")

# Gardens
subscribe(cascade(garden.GardenStopSet, "garden"),                         garden.Garden, "attributeChange", "key")
subscribe(cascade_delete(garden.GardenStopSet, "garden", "key"),           garden.Garden, "delete")
subscribe(cascade(garden.GardenStopRelationSet, "garden"),                 garden.Garden, "attributeChange", "key")
subscribe(cascade_delete(garden.GardenStopRelationSet, "garden", "key"),   garden.Garden, "delete")
# from stop to stop rel

# Notifications, Stories
subscribe(cascade_delete(notification.NotificationSet, "global_id", "_id"),  notification.GlobalNotification, "delete")
subscribe(cascade_delete(story.UserStorySet, "shared_story_id", "_id"), story.SharedStory, "delete")

# Groups
subscribe(group.process_group_name_change_in_sheets,                         group.Group, "attributeChange", "name")
subscribe(group.process_group_delete_in_sheets,                              group.Group, "delete")

# Categories
subscribe(category.process_category_name_change_in_categories_and_indexes,  category.Category, "attributeChange", "lastPath")
subscribe(text.rebuild_library_after_category_change,                   category.Category, "attributeChange", "lastPath")
subscribe(text.rebuild_library_after_category_change,                   category.Category, "delete")
subscribe(text.rebuild_library_after_category_change,                   category.Category, "save")

'''
# These are contained in the library rebuild, above.
subscribe(text.reset_simple_term_mapping,                                   category.Category, "delete")
subscribe(text.reset_simple_term_mapping,                                   category.Category, "save")
'''

# todo: notes? reviews?
# todo: Scheme name change in Index
# todo: term change in nodes
