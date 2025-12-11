from collections import defaultdict
from sefaria.model.category import Category
from sefaria.model.linker.ref_part import RawRef
from sefaria.utils.hebrew import get_matches_with_prefixes


class ResolvedCategory:

    def __init__(self, raw_ref: RawRef, categories: list[Category]) -> None:
        self.raw_entity = raw_ref
        self.categories = categories

    @property
    def is_ambiguous(self):
        return len(self.categories) != 1

    @property
    def resolution_failed(self):
        return len(self.categories) == 0


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
