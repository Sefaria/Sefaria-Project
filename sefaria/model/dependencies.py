

from . import abstract, link, note, history, text, count
import sefaria.system.cache as scache
import sefaria.summaries as summaries

abstract.subscribe(link.process_index_title_change_in_links, text.Index, "attributeChange", "title")
abstract.subscribe(note.process_index_title_change_in_notes, text.Index, "attributeChange", "title")
abstract.subscribe(history.process_index_title_change_in_history, text.Index, "attributeChange", "title")
abstract.subscribe(scache.process_index_title_change_in_cache, text.Index, "attributeChange", "title")
abstract.subscribe(text.process_index_title_change_in_versions, text.Index, "attributeChange", "title")

abstract.subscribe(count.process_index_delete_in_counts, text.Index, "delete")
abstract.subscribe(link.process_index_delete_in_links, text.Index, "delete")
abstract.subscribe(text.process_index_delete_in_versions, text.Index, "delete")
abstract.subscribe(scache.process_index_delete_in_cache, text.Index, "delete")

abstract.subscribe(summaries.process_index_save, text.Index, "save")

#notes?


#abst.subscribe(process_index_save_in_summaries, txt.Index, "save")