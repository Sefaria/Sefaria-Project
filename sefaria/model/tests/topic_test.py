import pytest
from sefaria.model.topic import Topic, TopicSet, IntraTopicLink, RefTopicLink, TopicLinkHelper, IntraTopicLinkSet, RefTopicLinkSet
from sefaria.model.text import Ref
from sefaria.system.database import db
from sefaria.system.exceptions import SluggedMongoRecordMissingError


def make_topic(slug):
    ts = TopicSet({'slug': slug})
    if ts.count() > 0:
        ts.delete()
    t = Topic({'slug': slug, 'titles': [{'text': slug, 'primary': True, 'lang': 'en'}]})
    t.save()
    return t


def make_it_link(a, b, type):
    l = IntraTopicLink({'fromTopic': a, 'toTopic': b, 'linkType': type, 'dataSource': 'sefaria'})
    l.save()
    return l


def make_rt_link(a, tref):
    l = RefTopicLink({'toTopic': a, 'ref': tref, 'linkType': 'about', 'dataSource': 'sefaria'})
    l.save()
    return l


def clean_links(a):
    """
    Remove any existing links to `a` in the db
    :param a:
    :return:
    """
    ls = RefTopicLinkSet({'toTopic': a})
    if ls.count() > 0:
        ls.delete()

    ls = IntraTopicLinkSet({"$or": [{"fromTopic": a}, {"toTopic": a}]})
    if ls.count() > 0:
        ls.delete()


@pytest.fixture(scope='module')
def topic_graph():
    isa_links = [
        (1, 2),
        (2, 3),
        (2, 4),
        (4, 5),
        (6, 5),
    ]
    trefs = [r.normal() for r in Ref('Genesis 1:1-10').range_list()]
    for a, b in isa_links:
        clean_links(str(a))
        clean_links(str(b))
    graph = {
        'topics': {
            str(i): make_topic(str(i)) for i in range(1, 10)
        },
        'links': [make_it_link(str(a), str(b), 'is-a') for a, b in isa_links] + [make_rt_link('1', r) for r in trefs]
    }
    yield graph
    for k, v in graph['topics'].items():
        v.delete()
    for v in graph['links']:
        v.delete()


@pytest.fixture(scope='module')
def topic_graph_to_merge():
    isa_links = [
        (10, 20),
        (20, 30),
        (20, 40),
        (40, 50),
        (60, 50),
    ]
    trefs = [r.normal() for r in Ref('Genesis 1:1-10').range_list()]
    trefs1 = [r.normal() for r in Ref('Exodus 1:1-10').range_list()]
    trefs2 = [r.normal() for r in Ref('Leviticus 1:1-10').range_list()]

    graph = {
        'topics': {
            str(i): make_topic(str(i)) for i in range(10, 100, 10)
        },
        'links': [make_it_link(str(a), str(b), 'is-a') for a, b in isa_links] + [make_rt_link('10', r) for r in trefs] + [make_rt_link('20', r) for r in trefs1] + [make_rt_link('40', r) for r in trefs2]
    }
    db.sheets.insert_one({
        "id": 1234567890,
        "topics": [
            {"slug": '20', 'asTyped': 'twenty'},
            {"slug": '40', 'asTyped': '4d'},
            {"slug": '20', 'asTyped': 'twent-e'},
            {"slug": '30', 'asTyped': 'thirty'}
        ]
    })
    
    yield graph
    for k, v in graph['topics'].items():
        v.delete()
    for v in graph['links']:
        v.delete()
    db.sheets.delete_one({"id": 1234567890})


class TestTopics(object):

    def test_graph_funcs(self, topic_graph):
        ts = topic_graph['topics']
        assert ts['1'].get_types() == {'1', '2', '3', '4', '5'}
        assert ts['2'].get_types() == {'2', '3', '4', '5'}
        assert ts['5'].get_types() == {'5'}

        assert ts['1'].has_types({'3', '8'})
        assert not ts['2'].has_types({'6'})

        assert {t.slug for t in ts['5'].topics_by_link_type_recursively(linkType='is-a', only_leaves=True)} == {'1', '6'}
        assert ts['1'].topics_by_link_type_recursively(linkType='is-a', only_leaves=True) == [ts['1']]

    def test_link_set(self, topic_graph):
        ts = topic_graph['topics']
        ls = ts['1'].link_set(_class='intraTopic')
        assert list(ls)[0].topic == '2'
        assert ls.count() == 1

        ls = ts['4'].link_set(_class='intraTopic')
        assert {l.topic for l in ls} == {'2', '5'}

        trefs = {r.normal() for r in Ref('Genesis 1:1-10').range_list()}

        ls = ts['1'].link_set(_class='refTopic')
        assert {l.ref for l in ls} == trefs

        ls = ts['1'].link_set(_class=None)
        assert {getattr(l, 'ref', getattr(l, 'topic', None)) for l in ls} == (trefs | {'2'})

    def test_merge(self, topic_graph_to_merge):
        ts = topic_graph_to_merge['topics']
        ts['20'].merge(ts['40'])

        t20 = Topic.init('20')
        assert t20.slug == '20'
        assert len(t20.titles) == 2
        assert t20.get_primary_title('en') == '20'
        ls = t20.link_set(_class='intraTopic')
        assert {l.topic for l in ls} == {'10', '30', '50'}

        s = db.sheets.find_one({"id": 1234567890})
        assert s['topics'] == [
            {"slug": '20', 'asTyped': 'twenty'},
            {"slug": '20', 'asTyped': '4d'},
            {"slug": '20', 'asTyped': 'twent-e'},
            {"slug": '30', 'asTyped': 'thirty'}
        ]

    def test_sanitize(self):
        t = Topic()
        t.slug = "sdfsdg<script/>"
        t.description={"en":"<b>Foo</b> <script>balrg</script>", "he": "snurg <script> gdgf </script>"}
        t._sanitize()
        assert "<b>" not in t.description["en"]
        assert "<script>" not in t.description["en"]
        assert "<script>" not in t.description["he"]
        assert "<script>" not in t.slug



class TestTopicLinkHelper(object):

    def test_init_by_class(self, topic_graph):
        l1 = db.topic_links.find_one({'fromTopic': '1', 'toTopic': '2', 'linkType': 'is-a'})
        l2 = db.topic_links.find_one({'toTopic': '1', 'ref': 'Genesis 1:1'})

        obj = TopicLinkHelper.init_by_class(l1)
        assert isinstance(obj, IntraTopicLink)

        obj = TopicLinkHelper.init_by_class(l2)
        assert isinstance(obj, RefTopicLink)

        obj = TopicLinkHelper.init_by_class(l1, context_slug='2')
        assert obj.topic == '1'
        assert obj.is_inverse

        obj = TopicLinkHelper.init_by_class(l1, context_slug='1')
        assert obj.topic == '2'


class TestIntraTopicLink(object):

    def test_validate(self, topic_graph):
        from sefaria.system.exceptions import DuplicateRecordError, InputError

        attrs = {
            'fromTopic': '1',
            'toTopic': '6',
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        l.save()
        assert getattr(l, 'class') == 'intraTopic'
        l.delete()

        attrs = {
            'fromTopic': '1',
            'toTopic': '2',
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(DuplicateRecordError):
            l.save()

        # non-existant datasource
        attrs = {
            'fromTopic': '1',
            'toTopic': '2',
            'linkType': 'is-a',
            'dataSource': 'blahblah'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # non-existant toTopic
        attrs = {
            'fromTopic': '1',
            'toTopic': '2222',
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # non-existant fromTopic
        attrs = {
            'fromTopic': '11111',
            'toTopic': '2',
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # non-existant linkType
        attrs = {
            'fromTopic': '11111',
            'toTopic': '2',
            'linkType': 'is-aaaaaa',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # duplicate for symmetric linkType
        attrs = {
            'fromTopic': '1',
            'toTopic': '2',
            'linkType': 'related-to',
            'dataSource': 'sefaria'
        }
        l1 = IntraTopicLink(attrs)
        l1.save()
        attrs['fromTopic'] = '2'
        attrs['toTopic'] = '1'
        l2 = IntraTopicLink(attrs)
        with pytest.raises(DuplicateRecordError):
            l2.save()
        l1.delete()


class TestRefTopicLink(object):

    def test_add_expanded_refs(self, topic_graph):
        attrs = {
            'ref': 'Genesis 1:1',
            'toTopic': '6',
            'linkType': 'about',
            'dataSource': 'sefaria'
        }
        l = RefTopicLink(attrs)
        l.save()
        assert getattr(l, 'class') == 'refTopic'
        assert l.expandedRefs == ['Genesis 1:1']
        l.delete()

        attrs = {
            'ref': 'Genesis 1:1-3',
            'toTopic': '6',
            'linkType': 'about',
            'dataSource': 'sefaria'
        }
        l = RefTopicLink(attrs)
        l.save()
        assert l.expandedRefs == ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3']
        l.delete()

        attrs = {
            'ref': 'Genesis 1-2',
            'toTopic': '6',
            'linkType': 'about',
            'dataSource': 'sefaria'
        }
        l = RefTopicLink(attrs)
        l.save()
        test_refs = [r.normal() for r in Ref('Genesis 1-2').all_segment_refs()]
        assert l.expandedRefs == test_refs
        l.delete()

    def test_duplicate(self, topic_graph):
        from sefaria.system.exceptions import DuplicateRecordError

        attrs = {
            'ref': 'Genesis 1:1',
            'toTopic': '6',
            'linkType': 'about',
            'dataSource': 'sefaria'
        }
        l1 = RefTopicLink(attrs)
        l1.save()
        l2 = RefTopicLink(attrs)
        with pytest.raises(DuplicateRecordError):
            l2.save()
        l1.delete()

