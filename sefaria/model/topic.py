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

    def __init__(self, attrs=None):
        if attrs is None:
            attrs = {}
        super(Topic, self).__init__(attrs=attrs)


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
    required_attrs = AbstractTopicLink.required_attrs + ['fromTopic']


class RefTopicLink(AbstractTopicLink):
    required_attrs = AbstractTopicLink.required_attrs + ['ref', 'expandedRefs']


class TopicLinkType(abst.AbstractMongoRecord):
    collection = 'topic_link_types'
    slug_field = 'slug'
    required_attrs = [
        'slug',
        'inverseId',
        'displayName',
    ]
    optional_attrs = [
        'alt_ids',
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