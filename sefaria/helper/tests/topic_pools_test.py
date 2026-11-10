"""
The v2 topic answer always carries `pools` (sefaria/helper/topic.py get_topic): the new reader decides from it whether
/topics/<slug> is the Library's page, and treats a missing key as "this server does not say" (reader-next
src/lib/topics/topic-page-source.ts). So v2 always has the key: the topic's pools from Postgres, [] when it is in none
(a topic with no Django row is in none). v1 is unchanged.

The Mongo topic is a stand-in (no library data needed); the pools are real Postgres rows, read the way Topic.get_pools does.
"""

from types import SimpleNamespace
from unittest import mock

from django.test import TestCase

from django_topics.models import Topic as DjangoTopic
from django_topics.models import TopicPool
from sefaria.helper import topic as topic_helper


def _topic(slug):
    t = SimpleNamespace(slug=slug)
    t.contents = lambda **kw: {"slug": slug}
    t.get_primary_title = lambda lang: slug
    t.title_is_transliteration = lambda title, lang: False
    # sefaria/conftest.py replaces Topic.get_pools for every test under sefaria/; this is what the real one does
    t.get_pools = lambda: list(DjangoTopic.objects.get_pools_by_topic_slug(slug))
    return t


class TopicPoolsInV2Test(TestCase):
    databases = "__all__"

    def get(self, v2, slug):
        DjangoTopic.objects.build_slug_to_pools_cache(rebuild=True)
        with mock.patch.object(topic_helper.Topic, "init", return_value=_topic(slug)):
            return topic_helper.get_topic(v2, slug, "english", with_links=False, with_refs=False)

    def tearDown(self):
        DjangoTopic.objects.build_slug_to_pools_cache(rebuild=True)

    def test_v2_answers_the_topics_pools(self):
        library, sheets = TopicPool.objects.create(name="library"), TopicPool.objects.create(name="sheets")
        DjangoTopic.objects.create(slug="rn-pools-test").pools.add(library, sheets)
        self.assertEqual(sorted(self.get(True, "rn-pools-test")["pools"]), ["library", "sheets"])

    def test_v2_answers_an_empty_list_for_a_topic_in_no_pool(self):
        DjangoTopic.objects.create(slug="rn-pools-none")
        self.assertEqual(self.get(True, "rn-pools-none")["pools"], [])
        self.assertEqual(self.get(True, "rn-pools-no-django-row")["pools"], [])

    def test_v1_is_unchanged(self):
        self.assertNotIn("pools", self.get(False, "rn-pools-none"))
