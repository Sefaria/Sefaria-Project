"""
dependencies.py -- list cross model dependencies and subscribe listeners to changes.
"""

from . import abstract, link, note, history, text, count, layer, version_state
from abstract import subscribe, cascade
import sefaria.system.cache as scache

#Start with cache clearing
subscribe(scache.process_index_change_in_cache,          text.Index, "attributeChange", "title")
subscribe(link.process_index_title_change_in_links,      text.Index, "attributeChange", "title")
subscribe(note.process_index_title_change_in_notes,      text.Index, "attributeChange", "title")
subscribe(history.process_index_title_change_in_history, text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_versions,   text.Index, "attributeChange", "title")
subscribe(text.process_index_title_change_in_counts,     text.Index, "attributeChange", "title")  #  to be deprecated
subscribe(version_state.process_index_title_change_in_version_state,     text.Index, "attributeChange", "title")

#Start with cache clearing
subscribe(scache.process_index_change_in_cache,  text.Index, "delete")
subscribe(count.process_index_delete_in_counts,  text.Index, "delete")  #  to be deprecated
subscribe(version_state.process_index_delete_in_version_state,  text.Index, "delete")
subscribe(link.process_index_delete_in_links,    text.Index, "delete")
subscribe(text.process_index_delete_in_versions, text.Index, "delete")

#notes? reviews?


subscribe(scache.process_index_change_in_cache, text.Index, "save")

subscribe(layer.process_note_deletion_in_layer, note.Note, "delete")

subscribe(cascade(text.TermSet, "scheme"), text.TermScheme, "attributeChange", "name")

#todo: Scheme name change in Index
#todo: term change in nodes


#These are defined here because of import-loop wonkiness
def process_index_delete_in_summaries(index, **kwargs):
    import sefaria.summaries as summaries
    if index.is_commentary():
        #deleting a commentary might cause a big shift in the ToC, so just rebuild for now.
        #summaries.update_table_of_contents()
        return
    summaries.update_summaries_on_delete(index.title)
subscribe(process_index_delete_in_summaries, text.Index, "delete")


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

subscribe(update_summaries_on_index_save, text.Index, "save")


