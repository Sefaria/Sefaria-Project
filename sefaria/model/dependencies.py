"""
dependencies.py -- list cross model dependencies and subscribe listeners to changes.
"""

from . import abstract, link, note, history, schema, text, layer, version_state, translation_request, time, person, garden

from abstract import subscribe, cascade, cascade_to_list, cascade_delete, cascade_delete_to_list
import sefaria.system.cache as scache

# Index Save / Create
subscribe(scache.process_index_change_in_cache,                         text.Index, "save")
subscribe(version_state.create_version_state_on_index_creation,         text.Index, "create")

# Index Name Change (start with cache clearing)
subscribe(scache.process_index_change_in_cache,                         text.Index, "attributeChange", "title")
subscribe(link.process_index_title_change_in_links,                     text.Index, "attributeChange", "title")
subscribe(note.process_index_title_change_in_notes,                     text.Index, "attributeChange", "title")
subscribe(history.process_index_title_change_in_history,                text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_versions,                  text.Index, "attributeChange", "title")
subscribe(version_state.process_index_title_change_in_version_state,    text.Index, "attributeChange", "title")

# Index Delete (start with cache clearing)
subscribe(scache.process_index_delete_in_cache,                         text.Index, "delete")
subscribe(version_state.process_index_delete_in_version_state,          text.Index, "delete")
subscribe(link.process_index_delete_in_links,                           text.Index, "delete")
subscribe(text.process_index_delete_in_versions,                        text.Index, "delete")
subscribe(translation_request.process_index_delete_in_translation_requests, text.Index, "delete")
# Process in ES

# Version Title Change
subscribe(history.process_version_title_change_in_history,              text.Version, "attributeChange", "versionTitle")
subscribe(scache.process_new_commentary_version_in_cache,               text.Version, "create")

# Note Delete
subscribe(layer.process_note_deletion_in_layer,                         note.Note, "delete")

# Term name change
subscribe(cascade(schema.TermSet, "scheme"),                            schema.TermScheme, "attributeChange", "name")

# Version State Save
subscribe(translation_request.process_version_state_change_in_translation_requests, version_state.VersionState, "save")

# Time
subscribe(cascade(person.PersonSet, "era"),                                time.TimePeriod, "attributeChange", "symbol")
subscribe(cascade(person.PersonSet, "generation"),                         time.TimePeriod, "attributeChange", "symbol")

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


# todo: notes? reviews?
# todo: Scheme name change in Index
# todo: term change in nodes

# These are defined here because of import-loop wonkiness
def process_index_delete_in_summaries(index, **kwargs):
    import sefaria.summaries as summaries
    if index.is_commentary():
        #deleting a commentary might cause a big shift in the ToC, so just rebuild for now.
        summaries.update_table_of_contents()
        return
    summaries.update_summaries_on_delete(index.title)

subscribe(process_index_delete_in_summaries,                            text.Index, "delete")


def update_summaries_on_index_save(index, **kwargs):
    import sefaria.summaries as summaries
    if index.is_commentary():
        #just redo the whole thing.
        summaries.update_table_of_contents()
        return
    old_values = kwargs.get('orig_vals')
    if 'title' in old_values:
        old_title = old_values['title']
    else:
        old_title = None
    summaries.update_summaries_on_change(index.title, old_title, False)

subscribe(update_summaries_on_index_save,                               text.Index, "save")


