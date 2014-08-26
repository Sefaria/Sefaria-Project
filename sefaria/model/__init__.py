"""
This way works as:
    from sefaria.model import *
        or
    from model import *

and gives access to classes and functions as:
    sefaria.model.text.Index
        or
    model.text.Index

__all__ = [
    'abstract',
    'history',
    'text',
    'link',
    'note',
    'count',
    'queue',
    'lock'
]

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
from text import Index, IndexSet, CommentaryIndex, Version, VersionSet, get_index, get_text_categories
from link import Link, LinkSet
from note import Note, NoteSet
from count import Count, CountSet
from queue import IndexQueue, IndexQueueSet
from lock import Lock, LockSet, set_lock, release_lock, check_lock, expire_locks

import dependencies
