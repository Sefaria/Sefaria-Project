import pytest

from scripts.sefer_hayashar_restructure import add_alt_struct
from sefaria.model.linker.referenceable_book_node import *
from sefaria.model.text import Ref


def make_num_node(ref: Ref, depth=0) -> ReferenceableBookNode:
    ja_node = ref.index_node
    node = NumberedReferenceableBookNode(ja_node)
    for _ in range(depth):
        node = node.get_children()[0]
    return node


chinukh_index = Ref("Sefer HaChinukh").index
chinukh_lech_lecha_alt_struct_node = chinukh_index.get_alt_structure("Parasha").children[1]
chinukh_lech_lecha_node = NamedReferenceableBookNode(chinukh_lech_lecha_alt_struct_node)

@pytest.mark.parametrize(('node_a', 'node_b', 'self_ref', 'other_ref', 'is_contained'), [
    [make_num_node(Ref('Genesis')), make_num_node(Ref('Genesis'), 1), None, None, True],
    [chinukh_lech_lecha_node,  make_num_node(Ref("Sefer HaChinukh 2"), 0), None, Ref("Sefer HaChinukh, 2:1"), True]
])
def test_contains(node_a: ReferenceableBookNode, node_b: ReferenceableBookNode, self_ref: Ref, other_ref: Ref, is_contained: bool):
    assert node_a.contains(node_b, self_ref, other_ref) == is_contained
