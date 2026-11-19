"""
get_name_completions' dictionary-entry branch.

The name service reaches this branch for a dictionary title such as
"Jastrow Dictionary, אב".  A LexiconTrie stores a list of headwords per normalized
headword, so the branch must build one completion for each headword.  Earlier code
concatenated that list onto a string and called a get_data method the trie does not
have, so /api/name/<dictionary title> answered HTTP 500.
"""

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from reader.views import dictionary_entry_completions, get_name_completions
from sefaria.system.exceptions import DictionaryEntryNotFoundError


class FakeLexiconTrie:
    """Stand-in for LexiconTrie: normalized headword -> list of headwords, prefix matched like datrie."""

    def __init__(self, items):
        self._items = items

    def items(self, prefix):
        return [(k, v) for k, v in self._items if k.startswith(prefix)]


class FakeIndexNode:
    """Minimal virtual dictionary index node, as Ref('Jastrow ...').index_node returns."""

    def __init__(self, word, lexicon_name):
        self.word = word
        self.is_virtual = True
        self.parent = MagicMock()
        self.parent.lexiconName = lexicon_name
        self.parent.full_title.return_value = lexicon_name


class DictionaryEntryCompletionsTest(SimpleTestCase):
    def test_each_headword_becomes_one_completion(self):
        lexicon_ac = FakeLexiconTrie([("אב", ["אב", "אבי"]), ("אבר", ["אבר"])])
        completions, objects = dictionary_entry_completions(lexicon_ac, "Jastrow Dictionary", "אב", 15)
        self.assertEqual(
            completions,
            ["Jastrow Dictionary, אב", "Jastrow Dictionary, אבי", "Jastrow Dictionary, אבר"],
        )
        self.assertEqual([o["title"] for o in objects], completions)
        self.assertTrue(all(o["type"] == "word_form" for o in objects))

    def test_virtual_dictionary_node_does_not_raise(self):
        ref = MagicMock()
        ref.index_node = FakeIndexNode("אב", "Jastrow Dictionary")
        lexicon_ac = FakeLexiconTrie([("אב", ["אב", "אבי"])])
        with (
            patch("reader.views.Ref", return_value=ref),
            patch("reader.views.library.full_auto_completer", return_value=MagicMock()),
            patch.dict("reader.views.library._lexicon_auto_completer", {"Jastrow Dictionary": lexicon_ac}),
            patch("reader.views.library.lexicon_auto_completer", return_value=lexicon_ac),
        ):
            result = get_name_completions("Jastrow Dictionary, אב", 15)
        completions = result["completions"]
        self.assertEqual(completions, ["Jastrow Dictionary, אב", "Jastrow Dictionary, אבי"])
        self.assertEqual([o["title"] for o in result["completion_objects"]], completions)

    def test_missing_dictionary_entry_does_not_raise(self):
        error = DictionaryEntryNotFoundError("Word not found", "Jastrow Dictionary", "Jastrow Dictionary", "אב")
        lexicon_ac = FakeLexiconTrie([("אב", ["אב"])])
        with (
            patch("reader.views.Ref", side_effect=error),
            patch("reader.views.library.full_auto_completer", return_value=MagicMock()),
            patch("reader.views.library.lexicon_auto_completer", return_value=lexicon_ac),
        ):
            result = get_name_completions("אב", 15)
        self.assertEqual(result["completions"], ["Jastrow Dictionary, אב"])
        self.assertEqual([o["title"] for o in result["completion_objects"]], result["completions"])
