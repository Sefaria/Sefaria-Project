from django_topics.models.topic import Topic, TopicManager
from sefaria.model.topic import TopicSet
import pandas as pd

"""
This module provides a cache for the relationship between slugs and pools. The cache is a DataFrame
with columns [slug, pool, en_description, he_description]. We build this cache once and then use it
to quickly look up which pools a given slug belongs to, and vice versa. The cache will sit
in memory on TopicManager.slug_pools_dataframe and be used by the TopicManager class.

The cache is built by querying the Django database for the (slug, pool) relationship, and then
querying the Sefaria TopicSet for the existence of English and Hebrew descriptions for each slug.

It is in a seperate function to avoid circular imports between the TopicManager and the Django models.
"""


SLUG_COLUMN       = TopicManager.SLUG_COLUMN
POOL_COLUMN       = TopicManager.POOL_COLUMN
EN_DESCRIPTION    = TopicManager.EN_DESCRIPTION
HE_DESCRIPTION    = TopicManager.HE_DESCRIPTION

def build_slug_to_pools_cache(rebuild=False):
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
    topics = Topic.objects.values_list(SLUG_COLUMN, 'pools__name')

    # Convert to a DataFrame with columns [slug, pool]
    df_sql = pd.DataFrame(topics, columns=[SLUG_COLUMN, POOL_COLUMN])

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

    df_sql[EN_DESCRIPTION] = df_sql[SLUG_COLUMN].apply(get_en_desc)
    df_sql[HE_DESCRIPTION] = df_sql[SLUG_COLUMN].apply(get_he_desc)

    # 4) Final DataFrame is now one row per (slug, pool), plus two description flags
    TopicManager.slug_pools_dataframe = df_sql
