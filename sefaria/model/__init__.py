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

# not sure why we have to do this now - it wasn't previously required
from . import (
    abstract,
    blocking,
    collection,
    dependencies,
    following,
    garden,
    guide,
    history,
    layer,
    lexicon,
    link,
    lock,
    manuscript,
    note,
    notification,
    place,
    queue,
    schema,
    text,
    timeperiod,
    topic,
    user_profile,
    version_state,
)
from .blocking import BlockeesSet, BlockersSet, BlockRelationship
from .category import Category, CategorySet
from .collection import Collection, CollectionSet
from .following import FolloweesSet, FollowersSet, FollowRelationship
from .garden import Garden, GardenSet, GardenStop, GardenStopRelation, GardenStopRelationSet, GardenStopSet
from .guide import Guide, GuideSet
from .history import History, HistorySet, diff_strings, log_add, log_delete, log_text, log_update, log_version_metadata
from .layer import Layer, LayerSet
from .lexicon import (
    Dictionary,
    DictionaryEntry,
    JastrowDictionaryEntry,
    KleinDictionaryEntry,
    Lexicon,
    LexiconEntry,
    LexiconEntrySet,
    LexiconLookupAggregator,
    RashiDictionaryEntry,
    StrongsDictionaryEntry,
    WordForm,
    WordFormSet,
)
from .link import Link, LinkSet, get_book_category_linkset, get_book_link_collection, get_link_counts
from .linker.linker import Linker
from .linker.ref_part import RawRef
from .linker_dataset_example import LinkerDatasetExample, LinkerDatasetExampleSet
from .linker_editor_history import LinkerEditorHistory, LinkerEditorHistorySet, log_linker_editor_action
from .lock import Lock, LockSet, check_lock, expire_locks, release_lock, set_lock
from .manuscript import Manuscript, ManuscriptPage, ManuscriptPageSet, ManuscriptSet
from .media import Media, MediaSet
from .note import Note, NoteSet
from .notification import GlobalNotification, GlobalNotificationSet, Notification, NotificationSet
from .passage import Passage, PassageSet
from .place import Place, PlaceSet
from .portal import Portal
from .queue import IndexQueue, IndexQueueSet
from .ref_data import RefData, RefDataSet
from .schema import (
    ArrayMapNode,
    JaggedArrayNode,
    NonUniqueTerm,
    NonUniqueTermSet,
    NumberedTitledTreeNode,
    SchemaNode,
    Term,
    TermScheme,
    TermSchemeSet,
    TermSet,
    TitledTreeNode,
    deserialize_tree,
)
from .text import Index, IndexSet, Ref, TextChunk, Version, VersionSet, library, merge_texts
from .timeperiod import TimePeriod, TimePeriodSet
from .topic import (
    AuthorTopic,
    AuthorTopicSet,
    IntraTopicLink,
    IntraTopicLinkSet,
    PersonTopic,
    PersonTopicSet,
    RefTopicLink,
    RefTopicLinkSet,
    Topic,
    TopicDataSource,
    TopicLinkSetHelper,
    TopicLinkType,
    TopicLinkTypeSet,
    TopicSet,
)
from .trend import get_session_traits
from .user_profile import UserHistory, UserHistorySet, UserProfile, UserWrapper, annotate_user_list
from .version_state import StateNode, VersionState, VersionStateSet, refresh_all_states
from .webpage import WebPage, WebPageSet
from .webpage_text import WebPageText, WebPageTextSet

library._build_index_maps()
