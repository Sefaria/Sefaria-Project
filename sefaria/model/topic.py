"""
topic.py
"""
from __future__ import absolute_import

import pickle
import time
from collections import defaultdict

from . import abstract as abst
from sefaria.system.database import db
from sefaria.sheets import sheet_to_dict
from sefaria.model.text import Ref
from sefaria.model.schema import Term
import sefaria.system.cache as scache


class Topic(abst.AbstractMongoRecord):
    """
    Data for a topic
        - sources
        - related topics
    """
    MAX_SOURCES = 50
    MAX_RELATED = 26

    collection   = 'topics'
    history_noun = 'topic'

    required_attrs = [
        "topic",
        "related_topics",
        "sources",
        "sheets"
    ]
    optional_attrs = []

    def __init__(self, topic, sources_dict=None, related_topics_dict=None):
        self.topic               = topic
        self.related_topics      = None
        self.sources             = None
        self.sheets              = None
        self.sources_dict        = sources_dict
        self.related_topics_dict = related_topics_dict
        self._filtered           = False
        self.make_data_from_sheets()


    def contents(self):
        return {
            "topic": self.topic,
            "related_topics": self.related_topics[0:self.MAX_RELATED],
            "sources": self.sources[0:self.MAX_SOURCES],
            #"sheets": self.sheets,
        }

    def make_data_from_sheets(self):
        if self.sources_dict and self.related_topics_dict:
            # If count data was already passed down, use it
            sources_dict        = self.sources_dict
            related_topics_dict = self.related_topics_dict
        else:
            # Otherwise, grab all relavant sheets and make a count
            projection          = {"tags": 1, "sources.ref": 1}
            sheets              = db.sheets.find({"tags": self.topic, "status": "public"}, projection)
            sources_dict        = defaultdict(int)
            related_topics_dict = defaultdict(int)
            for sheet in sheets:
                for source in sheet.get("sources", []):
                    if "ref" in source:
                        sources_dict[source["ref"]] += 1
                sheet_tags = list(set([Term.normalize(tag) for tag in sheet.get("tags", [])]))
                for tag in sheet_tags:
                    if tag != self.topic: 
                        related_topics_dict[tag] += 1
         
        self.sources = sorted(sources_dict.iteritems(), key=lambda (k,v): v, reverse=True)
        self.related_topics = sorted(related_topics_dict.iteritems(), key=lambda (k,v): v, reverse=True)
        #self.sheets = sheets_serialized

    def filter(self, topics):
        """Perform all filtering that may depend on a complete TopicList (related topics),
        or that may require computation to be delayed (Ref validation)"""
        if self._filtered:
            return self
        self.filter_sources()
        self.filter_invalid_sources()
        self.filter_related_topics(topics)
        self._filtered = True
        return self

    def filter_sources(self):
        """ Filters sources that don't have at least X cooccurrences """
        self.sources = [source for source in self.sources if source[1] > 1]
      
    def filter_invalid_sources(self):
        """ Remove any sources that don't validate """
        sources = []
        for source in self.sources:
            try:
                sources.append((Ref(source[0]).normal(), source[1]))
            except:
                pass
        self.sources = sources

    def filter_related_topics(self, topics):
        """ Only allow tags that are present in global `topics` """
        self.related_topics = [topic for topic in self.related_topics if topic[0] in topics]


class TopicsManager(object):
    """
    Interface and cache for all topics data
    """
    def __init__(self):
        self.topics = {}
        self.sorted_topics = {}
        self._loaded = False

    def _lazy_load(self):
        return
        '''
        if not self._loaded:
            self.make_data_from_sheets()
            self.save_to_cache()
        '''
    def make_data_from_sheets(self):
        """
        Processes all public source sheets to create topic data.
        """
        tags = {}
        results = []
        projection = {"tags": 1, "sources.ref": 1}

        sheet_list = db.sheets.find({"status": "public"}, projection)
        for sheet in sheet_list:
            sheet_tags = sheet.get("tags", [])
            sheet_tags = list(set([Term.normalize(tag) for tag in sheet_tags]))
            for tag in sheet_tags:
                if tag not in tags:
                    tags[tag] = {
                                    "tag": tag, 
                                    "sources_dict": defaultdict(int),
                                    "related_topics_dict": defaultdict(int)
                                }
                for source in sheet.get("sources", []):
                    if "ref" in source: 
                        tags[tag]["sources_dict"][source["ref"]] += 1
                for related_tag in sheet_tags:
                    if tag != related_tag: 
                        tags[tag]["related_topics_dict"][related_tag] += 1

        for tag in tags:
            topic = Topic(tag, sources_dict=tags[tag]["sources_dict"], related_topics_dict=tags[tag]["related_topics_dict"])
            topic.filter_sources()
            if len(topic.sources) > 0:
                self.topics[tag] = topic

        self._loaded = True

    def save_to_cache(self):
        pickled = pickle.dumps(self)
        scache.set_cache_elem('topics', pickled, None)
        scache.set_cache_elem('topics_timestamp', self.timestamp(), None)

    def timestamp(self):
        return int(time.time())

    def get(self, topic):
        self._lazy_load()
        if topic in self.topics:
            return self.topics[topic].filter(self.topics)
        else:
            return Topic(topic)

    def recommend_topics(self, refs):
        """Returns a list of topics recommended for the list of string refs"""
        topic_count = defaultdict(int)
        projection = {"tags": 1, "sources.ref": 1}
        sheets = db.sheets.find({"status": "public", "sources.ref": {"$in": refs}}, projection)

        for sheet in sheets:
            for topic in sheet.get("tags", []):
                if self.is_included(topic):
                    topic_count[topic] += 1

        return sorted(topic_count.iteritems(), key=lambda (k,v): v, reverse=True)

    def is_included(self, topic):
        self._lazy_load()
        return topic in self.topics

    def list(self, sort_by="alpha"):
        """ Returns a list of all available topics """
        if not self._loaded:
            return []

        # self._lazy_load()
        if sort_by in self.sorted_topics:
            return self.sorted_topics[sort_by]
        else:
            return self._sort_list(sort_by=sort_by)

    def _sort_list(self, sort_by="alpha"):
        sort_keys =  {
            "alpha": lambda x: x["tag"],
            "count": lambda x: -x["count"],
        }
        results = []
        for topic in self.topics.keys():
            results.append({"tag": topic, "count": len(self.topics[topic].sources)})
        results = sorted(results, key=sort_keys[sort_by])

        self.sorted_topics[sort_by] = results

        return results


class TopicSet(abst.AbstractMongoSet):
    recordClass = Topic



### Topics Caching ###

topics = None
topics_timestamp = None

def get_topics():
    """
    Returns the TopicsManager which may already be in memory,
    may be restored from Redis or may be built from scratch.
    """
    global topics
    global topics_timestamp

    # If Redis timestamp matches what we have in memory, return it
    current_timestamp = scache.get_cache_elem('topics_timestamp')
    if current_timestamp and topics_timestamp == current_timestamp:
        return topics
    
    # If Redis timestamp differs, load data from Redis
    elif current_timestamp:
        pickled = scache.get_cache_elem('topics')
        topics = pickle.loads(pickled)
        topics_timestamp = current_timestamp
        return topics

    # If there's nothing in Redis, return a new manager
    topics = TopicsManager()
    topics_timestamp = topics.timestamp()
    return topics


def update_topics():
    """
    Rebuild all Topics, save data to cache and replace existing topics in memory.
    """
    global topics
    new_topics = TopicsManager()
    new_topics.make_data_from_sheets()
    new_topics.save_to_cache()
    topics = new_topics

