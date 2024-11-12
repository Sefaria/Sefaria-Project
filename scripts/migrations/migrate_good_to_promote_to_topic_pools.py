import django
django.setup()
from sefaria.model import *
from admin_tools.models.topic_pool_link import PoolType, TopicPoolLink


def run():
    ts = TopicSet({'good_to_promote': True})
    for topic in ts:
        link = TopicPoolLink(topic_slug=topic.slug, pool=PoolType.PROMOTED.value)
        link.save()


if __name__ == "__main__":
    run()
