import django
from django.db import IntegrityError

django.setup()
from sefaria.model import TopicSet, RefTopicLinkSet
from topics.models.topic import Topic
from topics.models.pool import TopicPool, PoolType


def add_to_torah_tab_pool():
    print('Adding topics to torah tab pool')
    pool = TopicPool.objects.get(name=PoolType.TORAH_TAB.value)
    ts = TopicSet({'good_to_promote': True})
    for topic in ts:
        t = Topic.objects.get(slug=topic.slug)
        t.pools.add(pool)


def add_to_library_pool():
    print('Adding topics to library pool')
    pool = TopicPool.objects.get(name=PoolType.LIBRARY.value)
    ts = TopicSet({'subclass': 'author'})
    for topic in ts:
        t = Topic.objects.get(slug=topic.slug)
        t.pools.add(pool)
    links = RefTopicLinkSet({'is_sheet': False, 'linkType': 'about'})
    topic_slugs = {link.toTopic for link in links}
    for slug in topic_slugs:
        try:
            t = Topic.objects.get(slug=slug)
            t.pools.add(pool)
        except Topic.DoesNotExist:
            print('Could not find topic with slug {}'.format(slug))


def add_to_sheets_pool():
    print('Adding topics to sheets pool')
    pool = TopicPool.objects.get(name=PoolType.SHEETS.value)
    links = RefTopicLinkSet({'is_sheet': True, 'linkType': 'about'})
    topic_slugs = {link.toTopic for link in links}
    for slug in topic_slugs:
        try:
            t = Topic.objects.get(slug=slug)
            t.pools.add(pool)
        except Topic.DoesNotExist:
            print('Could not find topic with slug {}'.format(slug))


def delete_all_data():
    print("Delete data")
    Topic.pools.through.objects.all().delete()
    Topic.objects.all().delete()
    TopicPool.objects.all().delete()


def add_topics():
    print('Adding topics')
    for topic in TopicSet({}):
        try:
            Topic.objects.create(slug=topic.slug, en_title=topic.get_primary_title('en'), he_title=topic.get_primary_title('he'))
        except IntegrityError:
            print('Duplicate topic', topic.slug)


def add_pools():
    print('Adding pools')
    for pool_name in [PoolType.LIBRARY.value, PoolType.SHEETS.value, PoolType.GENERAL.value, PoolType.TORAH_TAB.value]:
        TopicPool.objects.create(name=pool_name)


def run():
    delete_all_data()
    add_topics()
    add_pools()
    add_to_torah_tab_pool()
    add_to_library_pool()
    add_to_sheets_pool()


if __name__ == "__main__":
    run()
