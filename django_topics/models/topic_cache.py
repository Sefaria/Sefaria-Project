from django_topics.models.topic import Topic, TopicManager
from sefaria.model.topic import TopicSet
import pandas as pd


class TopicPoolsCacheManager:
    SLUG_COLUMN       = 'slug'
    POOL_COLUMN       = 'pool'
    EN_DESCRIPTION    = 'en_description'
    HE_DESCRIPTION    = 'he_description'

    def build_slug_to_pools_cache(self, rebuild=False):
        """
        Build or rebuild the internal DataFrame that holds one row per (slug, pool).
        We also attach boolean flags for English & Hebrew descriptions for each slug.
        """
        # If we already have data and don't need to rebuild, just skip
        if not rebuild and not TopicManager.slug_pools_dataframe.empty:
            return

        # 1) Get (slug, pool_name) from relational DB (Django)
        #    Topic.objects.values_list('slug', 'pools__name') 
        #    typically yields rows like: [('slug1', 'poolA'), ('slug1', 'poolB'), ('slug2', 'poolA'), ...]
        topics = Topic.objects.values_list(self.SLUG_COLUMN, 'pools__name')

        # Convert to a DataFrame with columns [slug, pool]
        df_sql = pd.DataFrame(topics, columns=[self.SLUG_COLUMN, self.POOL_COLUMN])

        # 2) Get descriptions from Mongo (Sefaria TopicSet).
        #    We only need to know whether each slug has an EN or HE description (True/False).
        #    We'll build a dictionary: slug -> (en_bool, he_bool).
        desc_map = {}
        for mongo_topic in TopicSet():
            # If there's a .description dict, check 'en' and 'he' length
            en_desc_flag = False
            he_desc_flag = False
            if hasattr(mongo_topic, 'description'):
                en_text = mongo_topic.description.get('en') or ''
                he_text = mongo_topic.description.get('he') or ''
                en_desc_flag = len(en_text) > 0
                he_desc_flag = len(he_text) > 0

            desc_map[mongo_topic.slug] = (en_desc_flag, he_desc_flag)

        # 3) Attach these booleans to each row in df_sql
        def get_en_desc(slug):
            return desc_map[slug][0] if slug in desc_map else False

        def get_he_desc(slug):
            return desc_map[slug][1] if slug in desc_map else False

        df_sql[self.EN_DESCRIPTION] = df_sql[self.SLUG_COLUMN].apply(get_en_desc)
        df_sql[self.HE_DESCRIPTION] = df_sql[self.SLUG_COLUMN].apply(get_he_desc)

        # 4) Final DataFrame is now one row per (slug, pool), plus two description flags
        TopicManager.slug_pools_dataframe = df_sql
