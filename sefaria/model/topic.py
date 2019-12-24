from . import abstract as abst
from .schema import AbstractTitledObject, TitleGroup
import logging
logger = logging.getLogger(__name__)

class Topic(abst.AbstractMongoRecord, AbstractTitledObject):
    collection = 'topics'
    slug_fields = ['slug']
    title_group = None
    required_attrs = [
        'slug',
        'titles',
    ]
    optional_attrs = [
        'alt_ids',
        'properties',
        'description',
        'isTopLevelDisplay',
        'displayOrder',
    ]

    def _set_derived_attributes(self):
        self.set_titles(getattr(self, "titles", None))

    def set_titles(self, titles):
        self.title_group = TitleGroup(titles)


    def get_types(self, types=None, curr_path=None, search_slug=None):
        """
        WARNING: Expensive, lots of database calls
        Checks if `self` has `topic_slug` as an ancestor when traversing `is-a` links
        :param types: set(str), current known types, for recursive calls
        :param curr_path: current path of this recursive call
        :param search_slug: if passed, will return early once/if `search_slug` is found
        :return: set(str)
        """
        types = types or {self.slug}
        curr_path = curr_path or [self.slug]
        isa_set = {l.toTopic for l in IntraTopicLinkSet({"fromTopic": self.slug, "linkType": TopicLinkType.isa_type})}
        types |= isa_set
        if search_slug is not None and search_slug in types:
            return types
        for isa_slug in isa_set:
            new_path = [p for p in curr_path]
            if isa_slug in new_path:
                logger.warning("Circular path starting from {} and ending at {} detected".format(new_path[0], isa_slug))
                continue
            new_path += [isa_slug]
            new_topic = Topic().load({"slug": isa_slug})
            if new_topic is None:
                logger.warning("{} is None. Current path is {}".format(isa_slug, ', '.join(new_path)))
                continue
            new_topic.get_types(types, new_path, search_slug)
        return types


    def has_type(self, search_slug):
        """
        WARNING: Expensive, lots of database calls
        Checks if `self` has `topic_slug` as an ancestor when traversing `is-a` links
        :param search_slug: str, slug to search for
        :return: bool
        """
        types = self.get_types(search_slug=search_slug)
        return search_slug in types

class TopicSet(abst.AbstractMongoSet):
    recordClass = Topic


class TopicLinkHelper(object):
    """
    Used to collect attributes and functions that are useful for both IntraTopicLink and RefTopicLink
    Decided against superclass arch b/c instantiated objects will be of type super class.
    This is inconvenient when validating the attributes of object before saving (since subclasses have different required attributes)
    """
    collection = 'topic_links'
    required_attrs = [
        'toTopic',
        'linkType',
        'class',  # can be 'intraTopic' or 'refTopic'
    ]
    optional_attrs = [
        'dataSource',
        'generatedBy',
        'order'
    ]

    @staticmethod
    def init_by_class(topic_link):
        """
        :param topic_link: dict from `topic_links` collection
        :return: either instance of IntraTopicLink or RefTopicLink based on 'class' field of `topic_link`
        """
        if topic_link['class'] == 'intraTopic':
            return IntraTopicLink().load_from_dict(topic_link, is_init=True)
        if topic_link['class'] == 'refTopic':
            return RefTopicLink().load_from_dict(topic_link, is_init=True)


class IntraTopicLink(abst.AbstractMongoRecord):
    """
    How to validate:
        <person link type>: make sure both sides are people (exceptions are has-role and member-of)
        has-role: target is role, source is independent continuant
        member-of: target is group, source is independent continuant
        has-cause: both sides are processes

    """
    collection = TopicLinkHelper.collection
    required_attrs = TopicLinkHelper.required_attrs + ['fromTopic']
    optional_attrs = TopicLinkHelper.optional_attrs
    valid_links = []
    def _validate(self):
        super(IntraTopicLink, self)._validate()


class RefTopicLink(abst.AbstractMongoRecord):
    collection = TopicLinkHelper.collection
    required_attrs = TopicLinkHelper.required_attrs + ['ref', 'expandedRefs', 'is_sheet']
    # magnitude is if a link can be given a number which signifies the link's strength (currently used for sheet-derived links)
    optional_attrs = TopicLinkHelper.optional_attrs


class TopicLinkSetHelper(object):

    @staticmethod
    def init_query(query, link_class):
        query = query or {}
        query['class'] = link_class
        return query

    @staticmethod
    def find(query=None, page=0, limit=0, sort=[("_id", 1)], proj=None):
        from sefaria.system.database import db
        raw_records = getattr(db, TopicLinkHelper.collection).find(query, proj).sort(sort).skip(page * limit).limit(limit)
        return [TopicLinkHelper.init_by_class(r) for r in raw_records]


class IntraTopicLinkSet(abst.AbstractMongoSet):
    recordClass = IntraTopicLink

    def __init__(self, query=None, *args, **kwargs):
        query = TopicLinkSetHelper.init_query(query, 'intraTopic')
        super().__init__(query=query, *args, **kwargs)


class RefTopicLinkSet(abst.AbstractMongoSet):
    recordClass = RefTopicLink

    def __init__(self, query=None, *args, **kwargs):
        query = TopicLinkSetHelper.init_query(query, 'refTopic')
        super().__init__(query=query, *args, **kwargs)


class TopicLinkType(abst.AbstractMongoRecord):
    collection = 'topic_link_types'
    slug_fields = ['slug', 'inverseSlug']
    required_attrs = [
        'slug',
        'inverseSlug',
        'displayName',
        'inverseDisplayName'
    ]
    optional_attrs = [
        'pluralDisplayName',
        'inversePluralDisplayName',
        'alt_ids',
        'inverse_alt_ids',
        'shouldDisplay',
        'inverseShouldDisplay',
        'groupRelated',
        'inverseGroupRelated',
        'devDescription',
        'validFrom',
        'validTo'
    ]
    related_type = 'related-to'
    isa_type = 'is-a'

    def get(self, attr, is_inverse, default=None):
        attr = 'inverse{}{}'.format(attr[0].upper(), attr[1:]) if is_inverse else attr
        return getattr(self, attr, default)


class TopicLinkTypeSet(abst.AbstractMongoSet):
    recordClass = TopicLinkType


class TopicDataSource(abst.AbstractMongoRecord):
    collection = 'topic_data_sources'
    slug_fields = ['slug']
    required_attrs = [
        'slug',
        'displayName',
    ]
    optional_attrs = [
        'url',
        'description',
    ]