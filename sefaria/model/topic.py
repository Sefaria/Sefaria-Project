from . import abstract as abst
from .schema import AbstractTitledObject, TitleGroup
from sefaria.system.exceptions import DuplicateRecordError

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
        'numSources',
        'shouldDisplay'
    ]
    uncategorized_topic = 'uncategorized0000'

    def _set_derived_attributes(self):
        self.set_titles(getattr(self, "titles", None))

    def set_titles(self, titles):
        self.title_group = TitleGroup(titles)

    def title_is_transliteration(self, title, lang):
        return self.title_group.get_title_attr(title, lang, 'transliteration') is not None

    def get_types(self, types=None, curr_path=None, search_slug_set=None):
        """
        WARNING: Expensive, lots of database calls
        Checks if `self` has `topic_slug` as an ancestor when traversing `is-a` links
        :param types: set(str), current known types, for recursive calls
        :param curr_path: current path of this recursive call
        :param search_slug_set: if passed, will return early once/if any element of `search_slug_set` is found
        :return: set(str)
        """
        types = types or {self.slug}
        curr_path = curr_path or [self.slug]
        isa_set = {l.toTopic for l in IntraTopicLinkSet({"fromTopic": self.slug, "linkType": TopicLinkType.isa_type})}
        types |= isa_set
        if search_slug_set is not None and len(search_slug_set.intersection(types)) > 0:
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
            new_topic.get_types(types, new_path, search_slug_set)
        return types

    def has_types(self, search_slug_set):
        """
        WARNING: Expensive, lots of database calls
        Checks if `self` has `topic_slug` as an ancestor when traversing `is-a` links
        :param search_slug_set: set(str), slugs to search for. returns True if any slug is found
        :return: bool
        """
        types = self.get_types(search_slug_set=search_slug_set)
        return len(search_slug_set.intersection(types)) > 0


    def merge(self, other):
        """
        Merge all data associated with `other` into `self`.
            Rewrite all links of `other`
            Merge `alt_ids`
            Merge `titles`
            Merge `properties`
            etc.
        :param other: Topic
        :return: None
        """
        from sefaria.system.database import db
        if other is None:
            return

        # links
        for link in TopicLinkSetHelper.find({"$or": [{"toTopic": other.slug}, {"fromTopic": other.slug}]}):
            if link.linkType == TopicLinkType.isa_type and link.toTopic == Topic.uncategorized_topic :
                # no need to merge uncategorized is-a links
                link.delete()
                continue
            attr = 'toTopic' if link.toTopic == other.slug else 'fromTopic'
            setattr(link, attr, self.slug)
            if getattr(link, 'fromTopic', None) == link.toTopic:
                # self-link
                link.delete()
                continue
            try:
                link.save()
            except DuplicateRecordError:
                link.delete()
            except AssertionError as e:
                link.delete()
                logger.warning('While merging {} into {}, link assertion failed with message "{}"'.format(other.slug, self.slug, str(e)))

        # source sheets
        db.sheets.update_many({'topics.slug': other.slug}, {"$set": {'topics.$.slug': self.slug}})

        # titles
        for title in other.titles:
            if title.get('primary', False):
                del title['primary']
        self.titles += other.titles

        # dictionary attributes
        for dict_attr in ['alt_ids', 'properties']:
            temp_dict = getattr(self, dict_attr, {})
            for k, v in getattr(other, dict_attr, {}).items():
                if k in temp_dict:
                    logger.warning('Key {} with value {} already exists in {} for topic {}. Current value is {}'.format(k, v, dict_attr, self.slug, temp_dict[k]))
                    continue
                temp_dict[k] = v
            if len(temp_dict) > 0:
                setattr(self, dict_attr, temp_dict)
        setattr(self, 'numSources', getattr(self, 'numSources', 0) + getattr(other, 'numSources', 0))

        # everything else
        already_merged = ['slug', 'titles', 'alt_ids', 'properties', 'numSources']
        for attr in filter(lambda x: x not in already_merged, self.required_attrs + self.optional_attrs):
            if not getattr(self, attr, False) and getattr(other, attr, False):
                setattr(self, attr, getattr(other, attr))
        self.save()
        other.delete()


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
    collection = TopicLinkHelper.collection
    required_attrs = TopicLinkHelper.required_attrs + ['fromTopic']
    optional_attrs = TopicLinkHelper.optional_attrs
    valid_links = []

    def _pre_save(self):
        pass

    def _validate(self):
        super(IntraTopicLink, self)._validate()

        # check everything exists
        link_type = TopicLinkType().load({"slug": self.linkType})
        assert link_type is not None, "Link type '{}' does not exist".format(self.linkType)
        from_topic = Topic().load({"slug": self.fromTopic})
        assert from_topic is not None, "fromTopic '{}' does not exist".format(self.fromTopic)
        to_topic = Topic().load({"slug": self.toTopic})
        assert to_topic is not None, "toTopic '{}' does not exist".format(self.toTopic)

        # check for duplicates
        if getattr(self, "_id", None) is None:
            duplicate = IntraTopicLink().load({"linkType": self.linkType, "fromTopic": self.fromTopic, "toTopic": self.toTopic,
                     "class": getattr(self, 'class')})
            if duplicate is not None:
                raise DuplicateRecordError(
                    "Duplicate intra topic link for linkType '{}', fromTopic '{}', toTopic '{}'".format(
                        self.linkType, self.fromTopic, self.toTopic))

            if link_type.slug == link_type.inverseSlug:
                duplicate_inverse = IntraTopicLink().load({"linkType": self.linkType, "toTopic": self.fromTopic, "fromTopic": self.toTopic,
                 "class": getattr(self, 'class')})
                if duplicate_inverse is not None:
                    raise DuplicateRecordError(
                        "Duplicate intra topic link in the inverse direction of the symmetric linkType '{}', fromTopic '{}', toTopic '{}' exists".format(
                            duplicate_inverse.linkType, duplicate_inverse.fromTopic, duplicate_inverse.toTopic))

        # check types of topics are valid according to validFrom/To
        if getattr(link_type, 'validFrom', False):
            assert from_topic.has_types(set(link_type.validFrom)), "from topic '{}' does not have valid types '{}' for link type '{}'. Instead, types are '{}'".format(self.fromTopic, ', '.join(link_type.validFrom), self.linkType, ', '.join(from_topic.get_types()))
        if getattr(link_type, 'validTo', False):
            assert to_topic.has_types(set(link_type.validTo)), "to topic '{}' does not have valid types '{}' for link type '{}'. Instead, types are '{}'".format(self.toTopic, ', '.join(link_type.validTo), self.linkType, ', '.join(to_topic.get_types()))

        # assert this link doesn't create circular paths (in is_a link type)
        # should consider this test also for other non-symmetric link types such as child-of
        if self.linkType == TopicLinkType.isa_type:
            to_topic = Topic().load({"slug":self.toTopic})
            ancestors = to_topic.get_types()
            assert self.fromTopic not in ancestors, "{} is an is-a ancestor of {} creating an illogical circle in the topics graph, here are {} ancestors: {}".format(self.fromTopic, self.toTopic, self.toTopic, ancestors)



class RefTopicLink(abst.AbstractMongoRecord):
    collection = TopicLinkHelper.collection
    required_attrs = TopicLinkHelper.required_attrs + ['ref', 'expandedRefs', 'is_sheet']
    optional_attrs = TopicLinkHelper.optional_attrs + ['text']

    def _pre_save(self):
        if getattr(self, "_id", None) is None:
            # check for duplicates
            duplicate = RefTopicLink().load(
                {"linkType": self.linkType, "ref": self.ref, "toTopic": self.toTopic, "dataSource": getattr(self, 'dataSource', {"$exists": False}),
                 "class": getattr(self, 'class')})
            if duplicate is not None:
                raise DuplicateRecordError("Duplicate ref topic link for linkType '{}', ref '{}', toTopic '{}', dataSource '{}'".format(
                self.linkType, self.ref, self.toTopic, getattr(self, 'dataSource', 'N/A')))


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