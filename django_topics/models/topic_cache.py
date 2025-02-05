from django_topics.models.topic import Topic, TopicManager
from sefaria.model.topic import TopicSet
import pandas as pd
from collections import defaultdict

class TopicPoolsCacheManager():
    SLUG_COLUMN = 'slug'
    POOLS_COLUMN = 'pools'
    EN_DESCRIPTION = 'en_description'
    HE_DESCRIPTION = 'he_description'

    slug_pools_dataframe = pd.DataFrame(columns=[SLUG_COLUMN, POOLS_COLUMN, EN_DESCRIPTION, HE_DESCRIPTION])

    def build_slug_to_pools_cache(self, rebuild=False):
        if rebuild or self.slug_pools_dataframe.empty:
            topics = Topic.objects.values_list('slug', 'pools__name')
            topics_slug_to_pools = defaultdict(list)
            for topic in topics:
                topics_slug_to_pools[topic[0]].append(topic[1])

            mongo_topics = TopicSet()
            data = defaultdict(list)
            for mongo_topic in mongo_topics:
                topic_pools = topics_slug_to_pools.get(mongo_topic.slug, [])
                en_description = False
                he_description = False
                if hasattr(mongo_topic, 'description'):
                    en_description =  len(mongo_topic.description.get('en') or '') > 0
                    he_description = len(mongo_topic.description.get('he') or '') > 0

                data[self.SLUG_COLUMN].append(mongo_topic.slug)
                data[self.POOLS_COLUMN].append(topic_pools)
                data[self.EN_DESCRIPTION].append(en_description)
                data[self.HE_DESCRIPTION].append(he_description)

            TopicManager.slug_pools_dataframe = pd.DataFrame(data)
