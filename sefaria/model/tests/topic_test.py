import pytest

from sefaria.model.topic import Topic, TopicSet, IntraTopicLink, RefTopicLink, TopicLinkHelper, IntraTopicLinkSet, RefTopicLinkSet
from sefaria.model.text import Ref
from sefaria.system.database import db as mongo_db
from sefaria.system.exceptions import SluggedMongoRecordMissingError
from django_topics.models import Topic as DjangoTopic, TopicPool
from django_topics.models.pool import PoolType


def _ms(slug_suffix):
    """
    ms = make slug. makes full test slug.
    @param slug_suffix:
    @return:
    """
    return 'this-is-a-test-slug-'+slug_suffix


def make_topic(slug_suffix):
    slug = _ms(slug_suffix)
    ts = TopicSet({'slug': slug})
    if ts.count() > 0:
        ts.delete()
    t = Topic({'slug': slug, 'titles': [{'text': slug, 'primary': True, 'lang': 'en'}]})
    t.save()
    return t


def make_it_link(a, b, type):
    l = IntraTopicLink({'fromTopic': _ms(a), 'toTopic': _ms(b), 'linkType': type, 'dataSource': 'sefaria'})
    l.save()
    return l


def make_rt_link(a, tref):
    l = RefTopicLink({'toTopic': _ms(a), 'ref': tref, 'linkType': 'about', 'dataSource': 'sefaria'})
    l.save()
    return l


def clean_links(a):
    """
    Remove any existing links to `a` in the db
    :param a:
    :return:
    """
    ls = RefTopicLinkSet({'toTopic': _ms(a)})
    if ls.count() > 0:
        ls.delete()

    ls = IntraTopicLinkSet({"$or": [{"fromTopic": _ms(a)}, {"toTopic": _ms(a)}]})
    if ls.count() > 0:
        ls.delete()


@pytest.fixture(scope='module', autouse=True)
def library_and_sheets_topic_pools(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        TopicPool.objects.get_or_create(name=PoolType.LIBRARY.value)
        TopicPool.objects.get_or_create(name=PoolType.SHEETS.value)


@pytest.fixture(scope='module')
def topic_graph(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
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
def topic_graph_to_merge(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
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
        mongo_db.sheets.insert_one({
            "id": 1234567890,
            "topics": [
                {"slug": _ms('20'), 'asTyped': 'twenty'},
                {"slug": _ms('40'), 'asTyped': '4d'},
                {"slug": _ms('20'), 'asTyped': 'twent-e'},
                {"slug": _ms('30'), 'asTyped': 'thirty'}
            ]
        })

        yield graph
        for k, v in graph['topics'].items():
            v.delete()
        for v in graph['links']:
            v.delete()
        mongo_db.sheets.delete_one({"id": 1234567890})


@pytest.fixture(scope='module')
def topic_pool(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        pool = TopicPool.objects.create(name='test-pool')
        yield pool
        pool.delete()

@pytest.mark.django_db
class TestTopics(object):

    def test_graph_funcs(self, topic_graph):
        ts = topic_graph['topics']
        assert ts['1'].get_types() == {_ms(x) for x in {'1', '2', '3', '4', '5'}}
        assert ts['2'].get_types() == {_ms(x) for x in {'2', '3', '4', '5'}}
        assert ts['5'].get_types() == {_ms('5')}

        assert ts['1'].has_types({_ms('3'), _ms('8')})
        assert not ts['2'].has_types({_ms('6')})

        assert {t.slug for t in ts['5'].topics_by_link_type_recursively(linkType='is-a', only_leaves=True)} == {_ms('1'), _ms('6')}
        assert ts['1'].topics_by_link_type_recursively(linkType='is-a', only_leaves=True) == [ts['1']]

    def test_link_set(self, topic_graph):
        ts = topic_graph['topics']
        ls = ts['1'].link_set(_class='intraTopic')
        assert list(ls)[0].topic == _ms('2')
        assert ls.count() == 1

        ls = ts['4'].link_set(_class='intraTopic')
        assert {l.topic for l in ls} == {_ms('2'), _ms('5')}

        trefs = {r.normal() for r in Ref('Genesis 1:1-10').range_list()}

        ls = ts['1'].link_set(_class='refTopic')
        assert {l.ref for l in ls} == trefs

        ls = ts['1'].link_set(_class=None)
        assert {getattr(l, 'ref', getattr(l, 'topic', None)) for l in ls} == (trefs | {_ms('2')})

    def test_merge(self, topic_graph_to_merge):
        ts = topic_graph_to_merge['topics']
        ts['20'].merge(ts['40'])

        t20 = Topic.init(_ms('20'))
        assert t20.slug == _ms('20')
        assert len(t20.titles) == 2
        assert t20.get_primary_title('en') == _ms('20')
        ls = t20.link_set(_class='intraTopic')
        assert {l.topic for l in ls} == {_ms(x) for x in {'10', '30', '50'}}

        s = mongo_db.sheets.find_one({"id": 1234567890})
        assert s['topics'] == [
            {"slug": _ms('20'), 'asTyped': 'twenty'},
            {"slug": _ms('20'), 'asTyped': '4d'},
            {"slug": _ms('20'), 'asTyped': 'twent-e'},
            {"slug": _ms('30'), 'asTyped': 'thirty'}
        ]

        t40 = Topic.init(_ms('40'))
        assert t40 is None
        DjangoTopic.objects.get(slug=_ms('20'))
        with pytest.raises(DjangoTopic.DoesNotExist):
            DjangoTopic.objects.get(slug=_ms('40'))

    def test_change_title(self, topic_graph):
        ts = topic_graph['topics']
        dt1 = DjangoTopic.objects.get(slug=ts['1'].slug)
        assert dt1.en_title == ts['1'].get_primary_title('en')
        ts['1'].title_group.add_title('new title', 'en', True, True)
        ts['1'].save()
        dt1 = DjangoTopic.objects.get(slug=ts['1'].slug)
        assert dt1.en_title == ts['1'].get_primary_title('en')

    @pytest.mark.django_db
    def test_pools(self, topic_graph, topic_pool):
        ts = topic_graph['topics']
        t1 = ts['1']
        t1.add_pool(topic_pool.name)
        assert topic_pool.name in t1.get_pools()

        # dont add duplicates
        t1.add_pool(topic_pool.name)
        assert t1.get_pools().count(topic_pool.name) == 1

        assert t1.has_pool(topic_pool.name)
        t1.remove_pool(topic_pool.name)
        assert topic_pool.name not in t1.get_pools()
        # dont error when removing non-existent pool
        t1.remove_pool(topic_pool.name)

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
        l1 = mongo_db.topic_links.find_one({'fromTopic': _ms('1'), 'toTopic': _ms('2'), 'linkType': 'is-a'})
        l2 = mongo_db.topic_links.find_one({'toTopic': _ms('1'), 'ref': 'Genesis 1:1'})

        obj = TopicLinkHelper.init_by_class(l1)
        assert isinstance(obj, IntraTopicLink)

        obj = TopicLinkHelper.init_by_class(l2)
        assert isinstance(obj, RefTopicLink)

        obj = TopicLinkHelper.init_by_class(l1, context_slug=_ms('2'))
        assert obj.topic == _ms('1')
        assert obj.is_inverse

        obj = TopicLinkHelper.init_by_class(l1, context_slug=_ms('1'))
        assert obj.topic == _ms('2')


class TestIntraTopicLink(object):

    def test_validate(self, topic_graph):
        from sefaria.system.exceptions import DuplicateRecordError, InputError

        attrs = {
            'fromTopic': _ms('1'),
            'toTopic': _ms('6'),
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        l.save()
        assert getattr(l, 'class') == 'intraTopic'
        l.delete()

        attrs = {
            'fromTopic': _ms('1'),
            'toTopic': _ms('2'),
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(DuplicateRecordError):
            l.save()

        # non-existent datasource
        attrs = {
            'fromTopic': _ms('1'),
            'toTopic': _ms('2'),
            'linkType': 'is-a',
            'dataSource': 'blahblah'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # non-existent toTopic
        attrs = {
            'fromTopic': _ms('1'),
            'toTopic': _ms('2222'),
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # non-existent fromTopic
        attrs = {
            'fromTopic': _ms('11111'),
            'toTopic': _ms('2'),
            'linkType': 'is-a',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # non-existent linkType
        attrs = {
            'fromTopic': _ms('11111'),
            'toTopic': _ms('2'),
            'linkType': 'is-aaaaaa',
            'dataSource': 'sefaria'
        }
        l = IntraTopicLink(attrs)
        with pytest.raises(SluggedMongoRecordMissingError):
            l.save()

        # duplicate for symmetric linkType
        attrs = {
            'fromTopic': _ms('1'),
            'toTopic': _ms('2'),
            'linkType': 'related-to',
            'dataSource': 'sefaria'
        }
        l1 = IntraTopicLink(attrs)
        l1.save()
        attrs['fromTopic'] = _ms('2')
        attrs['toTopic'] = _ms('1')
        l2 = IntraTopicLink(attrs)
        with pytest.raises(DuplicateRecordError):
            l2.save()
        l1.delete()


class TestRefTopicLink(object):

    def test_add_expanded_refs(self, topic_graph):
        attrs = {
            'ref': 'Genesis 1:1',
            'toTopic': _ms('6'),
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
            'toTopic': _ms('6'),
            'linkType': 'about',
            'dataSource': 'sefaria'
        }
        l = RefTopicLink(attrs)
        l.save()
        assert l.expandedRefs == ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3']
        l.delete()

        attrs = {
            'ref': 'Genesis 1-2',
            'toTopic': _ms('6'),
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
            'toTopic': _ms('6'),
            'linkType': 'about',
            'dataSource': 'sefaria'
        }
        l1 = RefTopicLink(attrs)
        l1.save()
        l2 = RefTopicLink(attrs)
        with pytest.raises(DuplicateRecordError):
            l2.save()
        l1.delete()


class TestMockTopicPools:
    """Tests to verify mock topic pools are correctly returned"""

    def test_mock_get_pools_returns_correct_values(self):
        """Verify get_pools returns the correct mock values for each topic slug"""
        from sefaria.conftest import mock_topics_pool

        for slug, expected_pools in mock_topics_pool.items():
            topic = Topic()
            topic.slug = slug
            assert topic.get_pools() == expected_pools, f"Failed for slug: {slug}"

    def test_mock_get_pools_returns_empty_for_unknown_topic(self):
        """Verify get_pools returns empty list for topics not in mock"""
        topic = Topic()
        topic.slug = 'unknown_topic'
        assert topic.get_pools() == []

    def test_mock_pools_has_pool(self):
        """Verify has_pool works correctly for all mock topics"""
        from sefaria.conftest import mock_topics_pool

        for slug, pools in mock_topics_pool.items():
            topic = Topic()
            topic.slug = slug
            for pool in pools:
                assert topic.has_pool(pool), f"Expected {slug} to have pool {pool}"
