from . import abstract as abst


class Topic(abst.AbstractMongoRecord):
    collection = 'topics'
    slug_field = 'slug'
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


class AbstractTopicLink(abst.AbstractMongoRecord):
    collection = 'topic_links'
    required_attrs = [
        'toTopic',
        'linkType',
    ]
    optional_attrs = [
        'dataSource',
        'generatedBy',
    ]


class IntraTopicLink(AbstractTopicLink):
    collection = 'topic_links'
    required_attrs = AbstractTopicLink.required_attrs + ['fromTopic']


class RefTopicLink(AbstractTopicLink):
    collection = 'topic_links'
    required_attrs = AbstractTopicLink.required_attrs + ['ref', 'expandedRefs']


class RefTopicLinkSet(abst.AbstractMongoSet):
    recordClass = RefTopicLink


class TopicLinkType(abst.AbstractMongoRecord):
    collection = 'topic_link_types'
    slug_field = 'slug'
    required_attrs = [
        'slug',
        'displayName',
        'inverseDisplayName'
    ]
    optional_attrs = [
        'alt_ids',
        'inverse_alt_ids',
        'shouldDisplay',
        'devDescription'
    ]


class TopicDataSource(abst.AbstractMongoRecord):
    collection = 'topic_data_sources'
    slug_field = 'slug'
    required_attrs = [
        'slug',
        'displayName',
    ]
    optional_attrs = [
        'url',
        'description',
    ]