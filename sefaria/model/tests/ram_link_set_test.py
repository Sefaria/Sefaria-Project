"""Focused tests for RAM filtering and visible-result pagination."""
import unittest
from unittest.mock import patch, MagicMock

from sefaria.model import abstract, text
from sefaria.model.ram_link_set import RAMFilteredLinkSet, hidden_ref, hidden_title_set


class Cursor:
    def __init__(self, docs):
        self.docs = docs
        self.closed = False

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        if n:
            self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)

    def close(self):
        self.closed = True


class RAMLinkSetTests(unittest.TestCase):
    def build(self, docs, **kwargs):
        cursor = Cursor(docs)
        database = MagicMock()
        database.links.find.return_value = cursor
        with patch.object(abstract, 'db', database), \
             patch.object(text, 'show_admin_only_books', return_value=False), \
             patch.object(text, 'admin_only_titles', return_value=['Hidden']):
            result = RAMFilteredLinkSet({'type': 'commentary'}, **kwargs)
        database.links.find.assert_called_once_with({'type': 'commentary'}, None)
        return result, cursor

    def test_visible_limit_and_page_after_excluding_either_endpoint(self):
        docs = [{'refs': refs, 'type': 'commentary'} for refs in (
            ['Hidden 1', 'Genesis 1:1'], ['Genesis 1:1', 'Public 1'],
            ['Genesis 1:1', 'Hidden 2'], ['Genesis 1:1', 'Public 2'],
            ['Genesis 1:1', 'Public 3'], ['Genesis 1:1', 'Public 4'])]
        result, cursor = self.build(docs, page=1, limit=2)
        self.assertEqual([r.refs[1] for r in result], ['Public 3', 'Public 4'])
        self.assertEqual(result.candidates_examined, 6)
        self.assertEqual(result.count(), 2)
        self.assertEqual(len(result), 2)
        self.assertIs(result[0], result.array()[0])
        self.assertTrue(cursor.closed)

    def test_stop_at_visible_limit(self):
        docs = [{'refs': ['Genesis 1:1', 'Public 1'], 'type': 'commentary'}] * 10
        result, cursor = self.build(docs, limit=2)
        self.assertEqual(len(result.array()), 2)
        self.assertEqual(result.candidates_examined, 2)
        self.assertTrue(cursor.closed)

    def test_all_hidden_and_empty(self):
        for docs in ([], [{'refs': ['Hidden 1', 'Genesis 1:1'], 'type': 'commentary'}]):
            result, cursor = self.build(docs, limit=2)
            self.assertEqual(result.count(), 0)
            self.assertEqual(list(result), [])
            self.assertTrue(cursor.closed)

    def test_title_snapshot_changes_and_boundaries(self):
        first = hidden_title_set(('A+B', 'ספר'))
        second = hidden_title_set(('Other',))
        for value in ('A+B', 'A+B 1', 'A+B, Part 1', 'ספר א'):
            self.assertTrue(hidden_ref(value, first))
            self.assertFalse(hidden_ref(value, second))
        for value in ('AAB 1', 'A+Bish 1', 'Public 1', None):
            self.assertFalse(hidden_ref(value, first))


if __name__ == '__main__':
    unittest.main()
