from collections import defaultdict
import structlog
from sefaria.model.category import Category
from sefaria.model.linker.ref_part import RawRef
from sefaria.model.linker.abstract_resolved_entity import AbstractResolvedEntity
from sefaria.model.marked_up_text_chunk import MUTCSpanType
from sefaria.utils.hebrew import get_matches_with_prefixes
from sefaria.system.exceptions import BAD_RECORD_EXCEPTIONS
from sefaria.helper.slack.send_message import log_and_signal

logger = structlog.get_logger(__name__)


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
            # One category whose match_template references a nonexistent/corrupt term
            # (term.get_terms() yields None, or term.get_titles() raises) must not abort startup.
            try:
                for match_template in cat.get_match_templates():
                    for term in match_template.get_terms():
                        if term is None:
                            log_and_signal(logger, "warning", "[pathway:init_library_cache] CategoryMatcher: category '{}' has a match_template referencing a nonexistent term slug; skipping.".format("/".join(getattr(cat, "path", []) or [])))
                            continue
                        for title in term.get_titles(lang):
                            self._title_to_cat[title] += [cat]
            except BAD_RECORD_EXCEPTIONS as e:
                log_and_signal(logger, "warning", "[pathway:init_library_cache] CategoryMatcher: skipping category '{}': {}".format("/".join(getattr(cat, "path", []) or []), e))

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
