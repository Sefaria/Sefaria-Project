"""
This works as:
    from sefaria.model import *
symbols are then accessed directly as, e.g.:
    get_index("Genesis")
      or
    Version()
      or
    library
"""

import abstract

# not sure why we have to do this now - it wasn't previously required
import history, schema, text, link, note, layer, notification, queue, lock, following, user_profile, version_state, \
    translation_request, lexicon, place, person, timeperiod, garden, group

from history import History, HistorySet, log_add, log_delete, log_update, log_text
from schema import deserialize_tree, Term, TermSet, TermScheme, TermSchemeSet, TitledTreeNode, SchemaNode, \
    ArrayMapNode, JaggedArrayNode, NumberedTitledTreeNode
from text import library, Index, IndexSet, Version, VersionSet, TextChunk, TextFamily, Ref, merge_texts
from link import Link, LinkSet, get_link_counts, get_book_link_collection, get_book_category_linkset
from note import Note, NoteSet
from layer import Layer, LayerSet
from notification import Notification, NotificationSet, GlobalNotification, GlobalNotificationSet
from story import GlobalStory, UserStory, GlobalStorySet, UserStorySet, TextPassageStoryFactory, AuthorStoryFactory, \
    TopicFactory, UserSheetsFactory, SheetListFactory, GroupSheetListFactory
from interrupting_message import InterruptingMessage
from queue import IndexQueue, IndexQueueSet
from lock import Lock, LockSet, set_lock, release_lock, check_lock, expire_locks
from translation_request import TranslationRequest, TranslationRequestSet
from following import FollowRelationship, FollowersSet, FolloweesSet
from user_profile import UserProfile, UserHistory, UserHistorySet, annotate_user_list
from group import Group, GroupSet
from version_state import VersionState, VersionStateSet, StateNode, refresh_all_states
from timeperiod import TimePeriod, TimePeriodSet
from lexicon import Lexicon, LexiconEntry, LexiconEntrySet, Dictionary, DictionaryEntry, StrongsDictionaryEntry, RashiDictionaryEntry, JastrowDictionaryEntry, KleinDictionaryEntry, WordForm, WordFormSet, LexiconLookupAggregator
from place import Place, PlaceSet
from person import Person, PersonSet, PersonRelationship, PersonRelationshipSet, PersonRelationshipType, PersonRelationshipTypeSet
from garden import Garden, GardenStop, GardenStopRelation, GardenSet, GardenStopSet, GardenStopRelationSet
from category import Category, CategorySet

import dependencies

library._build_index_maps()


