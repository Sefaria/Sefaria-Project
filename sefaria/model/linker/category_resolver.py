from collections import defaultdict
from sefaria.model.category import Category
from sefaria.model.linker.ref_part import RawRef
from sefaria.model.linker.abstract_resolved_entity import AbstractResolvedEntity
from sefaria.model.marked_up_text_chunk import MUTCSpanType
from sefaria.utils.hebrew import get_matches_with_prefixes


class ResolvedCategory(AbstractResolvedEntity):

    def __init__(self, raw_ref: RawRef, categories: list[Category]) -> None:
        self._raw_entity = raw_ref
        self.categories = categories

    @property
    def is_ambiguous(self):
        return len(self.categories) > 1

    @property
    def resolution_failed(self):
        return len(self.categories) == 0
    
    @property
    def raw_entity(self):
        return self._raw_entity
    
    def get_debug_spans(self) -> list[dict]:
        span = self._get_base_debug_span()
        span["type"] = MUTCSpanType.CATEGORY.value

        if len(self.categories) == 0:
            span["categoryPath"] = None
            return [span]
        spans = []

        for cat in self.categories:
            cat_span = span.copy()
            cat_span["categoryPath"] = cat.path
            spans.append(cat_span)
        return spans


class CategoryMatcher:

    def __init__(self, lang: str, category_registry: list[Category]) -> None:
        self._title_to_cat: dict[str, list[Category]] = defaultdict(list)
        for cat in category_registry:
            for match_template in cat.get_match_templates():
                for term in match_template.get_terms():
                    for title in term.get_titles(lang):
                        self._title_to_cat[title] += [cat]

    def match(self, raw_ref: RawRef) -> list[Category]:
        return get_matches_with_prefixes(raw_ref.text, matches_map=self._title_to_cat)


class CategoryResolver:

    def __init__(self, category_matcher: CategoryMatcher) -> None:
        self._matcher = category_matcher

    def bulk_resolve(self, raw_refs: list[RawRef]) -> list[ResolvedCategory]:
        resolved = []
        for raw_ref in raw_refs:
            matched_categories = self._matcher.match(raw_ref)
            resolved += [ResolvedCategory(raw_ref, matched_categories)]
        return resolved
