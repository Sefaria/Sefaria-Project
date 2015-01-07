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

# not sure why we have to do this now - it wasn't previously required
import history, text, link, note, count, layer, notification, queue, lock, following, user_profile, version_state

from history import History, HistorySet, log_add, log_delete, log_update, log_text
from text import library, build_node, get_index, TermScheme, Index, IndexSet, CommentaryIndex, Version, VersionSet, TextChunk, TextFamily, Ref, merge_texts
from link import Link, LinkSet, get_link_counts, get_book_link_collection
from note import Note, NoteSet
from count import Count, CountSet
from layer import Layer, LayerSet
from notification import Notification, NotificationSet
from queue import IndexQueue, IndexQueueSet
from lock import Lock, LockSet, set_lock, release_lock, check_lock, expire_locks
from following import FollowRelationship, FollowersSet, FolloweesSet
from user_profile import UserProfile, annotate_user_list
from version_state import VersionState, VersionStateSet, StateNode, refresh_all_states

import dependencies
