from django.db import models
import random
import pandas as pd
from django_topics.models.pool import TopicPool

SLUG_COLUMN       = 'slug'
POOL_COLUMN       = 'pool'
EN_DESCRIPTION    = 'en_description'
HE_DESCRIPTION    = 'he_description'

class TopicManager(models.Manager):
    slug_pools_dataframe: pd.DataFrame = pd.DataFrame

    def sample_topic_slugs(self, order, pool: str = None, limit=10, require_en_description=None, require_he_description=None) -> list[str]:
        if pool:
            topics = self.get_topics_slugs_by_pools_with_description(pool, require_en_description, require_he_description)
        else:
            topics = self.all().values_list('slug', flat=True)
        if order == 'random':
            return random.sample(list(topics), min(limit, len(topics)))
        else:
            raise Exception("Invalid order: '{}'".format(order))
        

    @classmethod
    def build_slug_to_pools_cache(self, mongo_topics, rebuild=False):
        """
        build_slug_to_pools_cache provides a cache for the relationship between slugs and pools. The cache is a DataFrame
        with columns [slug, pool, en_description, he_description]. We build this cache once and then use it
        to quickly look up which pools a given slug belongs to, and vice versa. The cache will sit
        in memory on TopicManager.slug_pools_dataframe and be used by the TopicManager class.

        The cache is built by querying the Django database for the (slug, pool) relationship, and then
        querying the Sefaria TopicSet for the existence of English and Hebrew descriptions for each slug.

        It accepts mongo_topics and doesn't load it locally to avoid circular imports between the TopicManager
        and the Django models.
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
        for mongo_topic in mongo_topics:
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
        self.slug_pools_dataframe = df_sql


    def get_pools_by_topic_slug(self, slugs):
        """
        Given one or multiple slugs, return the set of pools they belong to.
          - If `slugs` is a single string, return a list of pools for that slug.
          - If `slugs` is a list, return a dict mapping each slug -> list of pools.
        """
        df = self.slug_pools_dataframe
        if isinstance(slugs, str):
            slugs = [slugs]

        # Filter rows whose slug is in `slugs`
        subset = df[df[SLUG_COLUMN].isin(slugs)]

        if len(slugs) == 1:
            # Return unique list of pools for the single slug
            return subset[POOL_COLUMN].unique().tolist()

        # If multiple slugs, build a dict: slug -> [pools...]
        results = {}
        for slug in slugs:
            slug_df = subset[subset[SLUG_COLUMN] == slug]
            results[slug] = slug_df[POOL_COLUMN].unique().tolist()
        return results

    def get_topic_slugs_by_pool(self, pools):
        """
        Given one or multiple pool names, return the set of slugs (topics) that appear in those pools.
          - If `pools` is a single string, return a list of slugs in that pool.
          - If `pools` is a list, return a dict mapping each pool -> list of slugs.
        """
        df = self.slug_pools_dataframe
        if isinstance(pools, str):
            pools = [pools]

        # Filter rows whose pool is in `pools`
        subset = df[df[POOL_COLUMN].isin(pools)]

        if len(pools) == 1:
            # Return unique list of slugs for the single pool
            return subset[SLUG_COLUMN].unique().tolist()

        # If multiple pools, build a dict: pool -> [slugs...]
        results = {}
        for pool in pools:
            pool_df = subset[subset[POOL_COLUMN] == pool]
            results[pool] = pool_df[SLUG_COLUMN].unique().tolist()
        return results

    def get_topics_slugs_by_pools_with_description(self, pools, require_en=True, require_he=False):
        """
        Similar to get_topics_by_pools, but also filters by description requirements.
          - require_en=True means only topics that have an EN description.
          - require_he=True means only topics that have a HE description.
        """
        df = self.slug_pools_dataframe
        if isinstance(pools, str):
            pools = [pools]

        # First, filter by the desired pools
        subset = df[df[POOL_COLUMN].isin(pools)]

        # Next, filter by required description flags
        if require_en:
            subset = subset[subset[EN_DESCRIPTION] == True]
        if require_he:
            subset = subset[subset[HE_DESCRIPTION] == True]

        if len(pools) == 1:
            # Unique slugs for that single pool
            return subset[SLUG_COLUMN].unique().tolist()

        # If multiple pools, produce a dict: pool -> [slug...]
        results = {}
        for pool in pools:
            pool_df = subset[subset[POOL_COLUMN] == pool]
            results[pool] = pool_df[SLUG_COLUMN].unique().tolist()
        return results

class Topic(models.Model):
    slug = models.CharField(max_length=255, primary_key=True)
    en_title = models.CharField(max_length=255, blank=True, default="")
    he_title = models.CharField(max_length=255, blank=True, default="")
    pools = models.ManyToManyField(TopicPool, related_name="topics", blank=True)
    objects = TopicManager()

    class Meta:
        verbose_name = "Topic Pool Management"
        verbose_name_plural = "Topic Pool Management"

    def __str__(self):
        return self.slug
