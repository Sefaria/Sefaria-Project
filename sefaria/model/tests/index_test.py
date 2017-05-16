# coding=utf-8
import pytest

from sefaria.model import *
from sefaria.model.text import prepare_index_regex_for_dependency_process

def test_index_regex():
    assert Ref('Otzar Midrashim').regex() == prepare_index_regex_for_dependency_process(library.get_index('Otzar Midrashim'))
    assert Ref('Zohar').regex() == prepare_index_regex_for_dependency_process(library.get_index('Zohar'))
    assert Ref('Genesis').regex() == prepare_index_regex_for_dependency_process(library.get_index('Genesis'))
    assert Ref('Rashi on Exodus').regex() == prepare_index_regex_for_dependency_process(library.get_index('Rashi on Exodus'))

    assert Ref('Otzar Midrashim').regex(as_list=True) == prepare_index_regex_for_dependency_process(
        library.get_index('Otzar Midrashim'), as_list=True)
    assert Ref('Zohar').regex(as_list=True) == prepare_index_regex_for_dependency_process(library.get_index('Zohar'), as_list=True)
    assert Ref('Genesis').regex(as_list=True) == prepare_index_regex_for_dependency_process(library.get_index('Genesis'), as_list=True)
    assert Ref('Rashi on Exodus').regex(as_list=True) == prepare_index_regex_for_dependency_process(
        library.get_index('Rashi on Exodus'), as_list=True)
