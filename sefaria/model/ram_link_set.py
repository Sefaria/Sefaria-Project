"""Opt-in experiment: filter fetched links in RAM before object construction.

Existing LinkSet callers retain MongoDB filtering. Raw cursor access on this
experimental class is unfiltered; consume the set, not raw_records.
"""
from functools import lru_cache

from sefaria.model.link import LinkSet
from sefaria.model import text


@lru_cache(maxsize=1)
def hidden_title_set(titles):
    return frozenset(titles)


def hidden_ref(value, titles):
    """Same literal-prefix and space/comma/end boundaries as the Mongo regex.

    Hash lookups depend on reference length, not the number of hidden titles.
    The final-newline check preserves regex $ semantics even for malformed refs.
    """
    if not titles or not isinstance(value, str):
        return False
    if value in titles or (value.endswith('\n') and value[:-1] in titles):
        return True
    return any(char in ' ,' and value[:position] in titles
               for position, char in enumerate(value))


class RAMFilteredLinkSet(LinkSet):
    """LinkSet materialization with visible-result pagination in Python.

    Capture one visibility snapshot per set. Fetch candidates incrementally and
    stop after the requested number of visible records, without hydrating hidden
    or skipped records. Counts materialize the visible page. Distinct and bulk
    deletion retain the ordinary MongoDB visibility filter and its semantics.
    """

    def _visibility_filter(self):
        return None

    def __init__(self, query_or_ref=None, page=0, limit=0):
        if page < 0 or limit < 0:
            raise ValueError('page and limit must be nonnegative')
        self._hidden_titles = hidden_title_set(tuple(text.admin_only_titles())) if not text.show_admin_only_books() else frozenset()
        self._original_query = query_or_ref if query_or_ref is not None else {}
        super().__init__(self._original_query, page=0, limit=0)
        self.skip = page * limit
        self.limit = limit
        self.candidates_examined = 0

    def _read_records(self):
        if self.records is not None:
            return
        records = []
        visible = 0
        try:
            for raw in self.raw_records:
                self.candidates_examined += 1
                refs = raw.get('refs', [])
                if isinstance(refs, str):
                    refs = [refs]
                if any(hidden_ref(ref, self._hidden_titles) for ref in (refs or [])):
                    continue
                visible += 1
                if visible <= self.skip:
                    continue
                records.append(self.recordClass(attrs=raw, **self.record_kwargs))
                if self.limit and len(records) >= self.limit:
                    break
        finally:
            self.raw_records.close()
        self.records = records
        self.max = len(records)

    def count(self):
        self._read_records()
        return self.max

    def distinct(self, field):
        return LinkSet(self._original_query).distinct(field)

    def delete(self, force=False, bulk_delete=False):
        if bulk_delete:
            return LinkSet(self._original_query).delete(force=force, bulk_delete=True)
        return super().delete(force=force, bulk_delete=False)
