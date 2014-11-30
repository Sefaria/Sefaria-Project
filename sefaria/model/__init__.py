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
from link import Link, LinkSet
from note import Note, NoteSet
from text import library, build_node, get_index, TermScheme, Index, IndexSet, CommentaryIndex, Version, VersionSet, TextChunk, TextFamily, Ref
from count import Count, CountSet
from layer import Layer, LayerSet
from notification import Notification, NotificationSet
from queue import IndexQueue, IndexQueueSet
from lock import Lock, LockSet, set_lock, release_lock, check_lock, expire_locks

import dependencies
