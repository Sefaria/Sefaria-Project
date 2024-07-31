import dataclasses
from typing import List, Dict, Type, Set
import re2 as re
from functools import reduce
from collections import defaultdict
from sefaria.model.linker.ref_part import RawNamedEntity
from sefaria.model.topic import Topic
from sefaria.utils.hebrew import strip_cantillation
from sefaria.system.exceptions import InputError


class ResolvedNamedEntity:

    def __init__(self, raw_named_entity: RawNamedEntity, topics: List[Topic]):
        self.raw_entity = raw_named_entity
        self.topics = topics

    @property
    def topic(self):
        if len(self.topics) != 1:
            raise InputError(f"ResolvedNamedEntity is ambiguous and has {len(self.topics)} topics so you can't access "
                             ".topic.")
        return self.topics[0]

    @property
    def is_ambiguous(self):
        return len(self.topics) != 1


class TitleGenerator:

    expansions = {}

    @classmethod
    def generate(cls, title: str) -> List[str]:
        expansions = [title]
        for reg, reg_expansions in cls.expansions.items():
            for reg_expansion in reg_expansions:
                potential_expansion = re.sub(reg, reg_expansion, title)
                if potential_expansion == title: continue
                expansions += [potential_expansion]
        expansions = [strip_cantillation(t, strip_vowels=True) for t in expansions]
        return expansions


class PersonTitleGenerator(TitleGenerator):

    expansions = {
        r' b\. ': [' ben ', ' bar ', ', son of ', ', the son of ', ' son of ', ' the son of ', ' Bar ', ' Ben '],
        r'^Ben ': ['ben '],
        r'^Bar ': ['bar '],
        r'^Rabbi ': ['R. '],
        r'^Rebbi ': ['R. '],
    }


class FallbackTitleGenerator(TitleGenerator):

    expansions = {
        '^The ': ['the '],
    }


@dataclasses.dataclass
class NamedEntityTitleExpanderRoute:
    type_slug: str
    generator: Type[TitleGenerator]


class NamedEntityTitleExpander:
    type_generator_router = [
        NamedEntityTitleExpanderRoute('people', PersonTitleGenerator),
        NamedEntityTitleExpanderRoute('entity', FallbackTitleGenerator),
    ]

    def __init__(self, lang: str):
        self._lang = lang

    def expand(self, topic: Topic) -> List[str]:
        for route in self.type_generator_router:
            if topic.has_types({route.type_slug}):
                return self._expand_titles_with_generator(topic, route.generator)
        return self._get_topic_titles(topic)

    def _get_topic_titles(self, topic: Topic) -> List[str]:
        return topic.get_titles(lang=self._lang, with_disambiguation=False)

    def _expand_titles_with_generator(self, topic: Topic, generator: Type[TitleGenerator]) -> List[str]:
        expansions = []
        for title in self._get_topic_titles(topic):
            expansions += generator.generate(title)
        return expansions


class TopicMatcher:

    def __init__(self, lang: str, named_entity_types_to_topics: Dict[str, Dict[str, List[str]]]):
        self._lang = lang
        self._title_expander = NamedEntityTitleExpander(lang)
        topics_by_type = {
            named_entity_type: self.__generate_topic_list_from_spec(topic_spec)
            for named_entity_type, topic_spec in named_entity_types_to_topics.items()
        }
        all_topics = reduce(lambda a, b: a + b, topics_by_type.values(), [])
        self._slug_topic_map = {t.slug: t for t in all_topics}
        self._title_slug_map_by_type = {
            named_entity_type: self.__get_title_map_for_topics(topics_by_type[named_entity_type])
            for named_entity_type, topic_spec in named_entity_types_to_topics.items()
        }

    def __get_title_map_for_topics(self, topics: List[Topic]) -> Dict[str, Set[str]]:
        title_slug_map = defaultdict(set)
        unique_topics = {t.slug: t for t in topics}.values()
        for topic in unique_topics:
            for title in self._title_expander.expand(topic):
                title_slug_map[title].add(topic.slug)
        return title_slug_map

    @staticmethod
    def __generate_topic_list_from_spec(topic_spec: Dict[str, List[str]]) -> List[Topic]:
        topics = []
        for root in topic_spec.get('ontology_roots', []):
            topics += Topic.init(root).topics_by_link_type_recursively()
        topics += [Topic.init(slug) for slug in topic_spec.get('single_slugs', [])]
        return topics

    def match(self, named_entity: RawNamedEntity) -> List[Topic]:
        slugs = self._title_slug_map_by_type.get(named_entity.type.name, {}).get(named_entity.text, [])
        return [self._slug_topic_map[slug] for slug in slugs]


class NamedEntityResolver:

    def __init__(self, topic_matcher: TopicMatcher):
        self._topic_matcher = topic_matcher

    def bulk_resolve(self, raw_named_entities: List[RawNamedEntity], with_failures=False) -> List[ResolvedNamedEntity]:
        resolved = []
        for named_entity in raw_named_entities:
            matched_topics = self._topic_matcher.match(named_entity)
            if len(matched_topics) > 0 or with_failures:
                resolved += [ResolvedNamedEntity(named_entity, matched_topics)]
        return resolved



