"""Dictionary refs that name a lexicon entry.

The reader catchall turns InputError into a 404 and any other exception into a
500, so a dictionary ref that does not address an entry must fail as an input
error instead of raising from the parse.
"""

import pytest

from sefaria.model import *
from sefaria.system.exceptions import DictionaryEntryNotFoundError


class Test_DictionaryEntryRefs:
    def test_entry_that_does_not_match_the_entry_regex_raises_input_error(self):
        """A dictionary title followed by something that is not an entry address must fail
        as an input error. It used to raise AttributeError from DictionaryEntryNode, and
        the reader catchall only converts InputError to a 404, so the URL became a 500.
        This is the request behind the 2026-11-14T14:08Z sefaria-web 500.
        """
        with pytest.raises(DictionaryEntryNotFoundError):
            Ref("Jastrow,_כָּלוּל.1</a>")

    def test_entry_with_an_extra_section_raises_input_error(self):
        with pytest.raises(DictionaryEntryNotFoundError):
            Ref("Jastrow,_כָּלוּל.1.2")
