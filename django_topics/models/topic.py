from django.db import models
import random
import pandas as pd
from django_topics.models.pool import TopicPool


class TopicManager(models.Manager):
    SLUG_COLUMN       = 'slug'
    POOL_COLUMN       = 'pool'
    EN_DESCRIPTION    = 'en_description'
    HE_DESCRIPTION    = 'he_description'
    
    slug_pools_dataframe: pd.DataFrame = pd.DataFrame

    def sample_topic_slugs(self, order, pool: str = None, limit=10) -> list[str]:
        if pool:
            topics = self.get_topic_slugs_by_pool(pool)
        else:
            topics = self.all().values_list('slug', flat=True)
        if order == 'random':
            return random.sample(list(topics), min(limit, len(topics)))
        else:
            raise Exception("Invalid order: '{}'".format(order))

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
        subset = df[df[self.SLUG_COLUMN].isin(slugs)]

        if len(slugs) == 1:
            # Return unique list of pools for the single slug
            return subset[self.POOL_COLUMN].unique().tolist()

        # If multiple slugs, build a dict: slug -> [pools...]
        results = {}
        for slug in slugs:
            slug_df = subset[subset[self.SLUG_COLUMN] == slug]
            results[slug] = slug_df[self.POOL_COLUMN].unique().tolist()
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
        subset = df[df[self.POOL_COLUMN].isin(pools)]

        if len(pools) == 1:
            # Return unique list of slugs for the single pool
            return subset[self.SLUG_COLUMN].unique().tolist()

        # If multiple pools, build a dict: pool -> [slugs...]
        results = {}
        for pool in pools:
            pool_df = subset[subset[self.POOL_COLUMN] == pool]
            results[pool] = pool_df[self.SLUG_COLUMN].unique().tolist()
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
        subset = df[df[self.POOL_COLUMN].isin(pools)]

        # Next, filter by required description flags
        if require_en:
            subset = subset[subset[self.EN_DESCRIPTION] == True]
        if require_he:
            subset = subset[subset[self.HE_DESCRIPTION] == True]

        if len(pools) == 1:
            # Unique slugs for that single pool
            return subset[self.SLUG_COLUMN].unique().tolist()

        # If multiple pools, produce a dict: pool -> [slug...]
        results = {}
        for pool in pools:
            pool_df = subset[subset[self.POOL_COLUMN] == pool]
            results[pool] = pool_df[self.SLUG_COLUMN].unique().tolist()
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
