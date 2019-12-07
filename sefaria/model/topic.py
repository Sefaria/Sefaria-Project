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

    def get_primary_title(self, lang):
        title_dict = next(x for x in getattr(self, 'titles', []) if x['lang'] == lang and x['primary'])
        return title_dict['text'] if title_dict is not None else None


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

    def contents(self, **kwargs):
        d = super(IntraTopicLink, self).contents(**kwargs)
        if kwargs.get("annotate", False):
            topic_obj = Topic().load({"slug": self.fromTopic})
            d["en"] = topic_obj.get_primary_title('en')
            d["he"] = topic_obj.get_primary_title('he')
        return d

class IntraTopicLinkSet(abst.AbstractMongoSet):
    recordClass = IntraTopicLink

    def __init__(self, query=None, *args, **kwargs):
        query = query or {}
        query['expandedRefs'] = {"$exists": False}
        super(IntraTopicLinkSet, self).__init__(query=query, *args, **kwargs)


class RefTopicLink(AbstractTopicLink):
    collection = 'topic_links'
    required_attrs = AbstractTopicLink.required_attrs + ['ref', 'expandedRefs']


class RefTopicLinkSet(abst.AbstractMongoSet):
    recordClass = RefTopicLink

    def __init__(self, query=None, *args, **kwargs):
        query = query or {}
        query['expandedRefs'] = {"$exists": True}
        super(RefTopicLinkSet, self).__init__(query=query, *args, **kwargs)


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