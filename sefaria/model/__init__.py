"""
This way works as:
    import sefaria.model
        or
    import model

and gives acces to classes and functins as:
    sefaria.model.Index
        or
    model.Index

There is also the possibility this way to import as:
    from sefaria.model import *
and access directly as:
    Index

"""

import abstract

from history import History, HistorySet, log_add, log_delete, log_update
from text import Index, IndexSet, CommentaryIndex, Version, VersionSet, Ref, get_index, get_text_categories, get_commentary_versions, get_commentary_version_titles, get_commentary_versions_on_book, get_commentary_version_titles_on_book
from count import Count, CountSet
from link import Link, LinkSet
from note import Note, NoteSet
from layer import Layer, test_layer
from queue import IndexQueue, IndexQueueSet
from lock import Lock, LockSet, set_lock, release_lock, check_lock, expire_locks

import dependencies
