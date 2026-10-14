"""Regression tests for compact hidden-book reference expressions."""
import re

from sefaria.model.hidden_book_regex import (
    hidden_book_ref_patterns, MAX_PATTERN_BYTES, MAX_PATTERN_ALTERNATIVES,
)


def matches(patterns, value):
    return any(re.search(pattern, value) is not None for pattern in patterns)


def test_descendants_collapse_but_standalone_aliases_survive():
    titles = ('Book', 'Book, Part', 'Book, Part, Chapter', 'Book Part',
              'Standalone Section', 'ספר', 'ספר, פרק', 'Bookish')
    patterns = hidden_book_ref_patterns(titles)
    assert len(patterns) == 1
    assert 'Chapter' not in patterns[0]
    for value in ('Book', 'Book 1:2', 'Book, Part, Chapter 4', 'Standalone Section 1',
                  'ספר, פרק א', 'Bookish 1'):
        assert matches(patterns, value)
    for value in ('Public 1', 'Bookkeeper 1', 'Book:1', 'Book.Part'):
        assert not matches(patterns, value)


def test_equivalent_to_original_union_for_literals_and_boundaries():
    titles = ('A', 'A B', 'A, C', 'A.B', 'A+B', '[Book]', 'אב', 'אב, ג', 'Solo')
    original = ('^(?:' + '|'.join(re.escape(t) for t in titles) + ')(?:[ ,]|$)',)
    compact = hidden_book_ref_patterns(titles)
    for title in titles + ('Public', 'AB', 'A-B', 'אבג'):
        for prefix in ('', 'Other '):
            for suffix in ('', ' 1:2', ', Section', ':1', '.', 'X', '\n'):
                value = prefix + title + suffix
                assert matches(compact, value) == matches(original, value), value


def test_large_title_set_is_batched_without_losing_titles():
    titles = tuple('Independent-%04d-%s' % (n, 'אב'*25) for n in range(1000))
    patterns = hidden_book_ref_patterns(titles)
    assert len(patterns) > 1
    assert all(len(p.encode('utf-8')) <= MAX_PATTERN_BYTES for p in patterns)
    assert all(p.count('|') <= MAX_PATTERN_ALTERNATIVES for p in patterns)
    assert all(matches(patterns, title + ' 1') for title in titles)
    assert not matches(patterns, 'Public 1')


def test_empty_titles_and_changed_cache_snapshot():
    assert hidden_book_ref_patterns(()) == ()
    first = hidden_book_ref_patterns(('Book', 'Book, Part'))
    second = hidden_book_ref_patterns(('Other',))
    assert matches(first, 'Book 1') and not matches(second, 'Book 1')
    assert matches(second, 'Other 1')
