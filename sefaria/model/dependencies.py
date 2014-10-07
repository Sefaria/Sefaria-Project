

from . import abstract, link, note, history, text, count, layer
import sefaria.system.cache as scache

abstract.subscribe(link.process_index_title_change_in_links,      text.Index, "attributeChange", "title")
abstract.subscribe(note.process_index_title_change_in_notes,      text.Index, "attributeChange", "title")
abstract.subscribe(history.process_index_title_change_in_history, text.Index, "attributeChange", "title")
abstract.subscribe(text.process_index_title_change_in_versions,   text.Index, "attributeChange", "title")
abstract.subscribe(text.process_index_title_change_in_counts,     text.Index, "attributeChange", "title")
abstract.subscribe(scache.process_index_change_in_cache,          text.Index, "attributeChange", "title")


#Start with cache clearing
abstract.subscribe(scache.process_index_change_in_cache,  text.Index, "delete")
abstract.subscribe(count.process_index_delete_in_counts,  text.Index, "delete")
abstract.subscribe(link.process_index_delete_in_links,    text.Index, "delete")
abstract.subscribe(text.process_index_delete_in_versions, text.Index, "delete")

def process_index_delete_in_summaries(index, **kwargs):
    import sefaria.summaries as summaries
    if index.is_commentary():
        #deleting a commentary might cause a big shift in the ToC, so just rebuild for now.
        #summaries.update_table_of_contents()
        return
    summaries.update_summaries_on_delete(index.title)
abstract.subscribe(process_index_delete_in_summaries, text.Index, "delete")
#notes? reviews?

abstract.subscribe(scache.process_index_change_in_cache, text.Index, "save")


#This is defined here because of import-loop wonkiness
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
abstract.subscribe(update_summaries_on_index_save, text.Index, "save")

#notes?
abstract.subscribe(layer.process_note_deletion_in_layer, note.Note, "delete")

