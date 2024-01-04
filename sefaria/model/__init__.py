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

from . import abstract

# not sure why we have to do this now - it wasn't previously required
from . import history, schema, text, link, note, layer, notification, queue, lock, following, blocking, user_profile, \
    version_state, lexicon, place, timeperiod, garden, collection, topic, manuscript

from .history import History, HistorySet, log_add, log_delete, log_update, log_text
from .schema import deserialize_tree, Term, TermSet, TermScheme, TermSchemeSet, TitledTreeNode, SchemaNode, \
    ArrayMapNode, JaggedArrayNode, NumberedTitledTreeNode, NonUniqueTerm, NonUniqueTermSet
from .text import library, Index, IndexSet, Version, VersionSet, TextChunk, TextRange, TextFamily, Ref, merge_texts
from .link import Link, LinkSet, get_link_counts, get_book_link_collection, get_book_category_linkset
from .note import Note, NoteSet
from .layer import Layer, LayerSet
from .notification import Notification, NotificationSet, GlobalNotification, GlobalNotificationSet
from .trend import get_session_traits
from .queue import IndexQueue, IndexQueueSet
from .lock import Lock, LockSet, set_lock, release_lock, check_lock, expire_locks
from .following import FollowRelationship, FollowersSet, FolloweesSet
from .blocking import BlockRelationship, BlockersSet, BlockeesSet
from .user_profile import UserWrapper, UserProfile, UserHistory, UserHistorySet, annotate_user_list
from .collection import Collection, CollectionSet
from .version_state import VersionState, VersionStateSet, StateNode, refresh_all_states
from .timeperiod import TimePeriod, TimePeriodSet
from .lexicon import Lexicon, LexiconEntry, LexiconEntrySet, Dictionary, DictionaryEntry, StrongsDictionaryEntry, RashiDictionaryEntry, JastrowDictionaryEntry, KleinDictionaryEntry, WordForm, WordFormSet, LexiconLookupAggregator
from .place import Place, PlaceSet
from .garden import Garden, GardenStop, GardenStopRelation, GardenSet, GardenStopSet, GardenStopRelationSet
from .category import Category, CategorySet
from .passage import Passage, PassageSet
from .ref_data import RefData, RefDataSet
from .webpage import WebPage, WebPageSet
from .media import Media, MediaSet
from .topic import Topic, PersonTopic, AuthorTopic, TopicLinkType, IntraTopicLink, RefTopicLink, TopicLinkType, TopicDataSource, TopicSet, PersonTopicSet, AuthorTopicSet, TopicLinkTypeSet, RefTopicLinkSet, IntraTopicLinkSet, TopicLinkSetHelper
from .portal import Portal
from .manuscript import Manuscript, ManuscriptSet, ManuscriptPage, ManuscriptPageSet
from .linker.ref_part import RawRef
from .linker.ref_resolver import RefResolver
from . import dependencies

library._build_index_maps()
