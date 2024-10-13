import pytest
from sqlalchemy import True_

from scripts.sefer_hayashar_restructure import add_alt_struct
from sefaria.model import ArrayMapNode
from sefaria.model.linker.referenceable_book_node import *
from sefaria.model.linker.referenceable_book_node import NamedReferenceableBookNode
from sefaria.model.text import Ref


def make_num_node(ref: Ref, depth=0, is_alt_struct_ref=False) -> ReferenceableBookNode:
    ja_node = ref.index_node
    if ja_node.has_default_child():
        ja_node = ja_node.get_default_child()
    node = NumberedReferenceableBookNode(ja_node)
    for _ in range(depth):
        node = node.get_children()[0]
    return node


def make_named_node(title: str, node_path: list[str], is_alt_struct_path: bool):
    index = Ref(title).index
    if is_alt_struct_path:
        # first element in path is alt struct name
        node = index.get_alt_structure(node_path[0])
        node_path = node_path[1:]
    else:
        node = index.nodes
    while len(node_path) > 0:
        node = next((child for child in node.children if child.get_primary_title('en') == node_path[0]), None)
        if node is None:
            raise ValueError(f'Could not find node with title "{node_path[0]}".')
        node_path = node_path[1:]
    return NamedReferenceableBookNode(node)


zohar_volume1_intro_node = MapReferenceableBookNode(Ref('Zohar').index.get_alt_structure("Daf").children[0].children[0])
zohar_first_daf_node = zohar_volume1_intro_node.get_children()[0]
print("hi")

@pytest.mark.parametrize(('node_a', 'node_b', 'self_tref', 'other_tref', 'is_contained'), [
    [make_num_node(Ref('Genesis')), make_num_node(Ref('Genesis'), 1), None, None, True],  # Generic pasuk node is contained in generic perek node
    [make_num_node(Ref('Genesis')), make_num_node(Ref('Genesis'), 1), "Genesis 1", "Genesis 1:2", True],  # Specific pasuk ref is contained in specific perek ref
    [make_num_node(Ref('Genesis')), make_num_node(Ref('Genesis'), 1), "Genesis 2", "Genesis 1:2", False],  # case where specific pasuk isn't contained in specific perek
    [make_named_node('Sefer HaChinukh', ['Parasha', 'Lech Lecha'], True),  make_num_node(Ref("Sefer HaChinukh")), None, "Sefer HaChinukh, 2", True],  # ref is contained in alt struct node (which has no ref)
    [make_num_node(Ref("Sefer HaChinukh")), make_named_node('Sefer HaChinukh', ['Parasha', 'Lech Lecha'], True), "Sefer HaChinukh, 2", None, True],  # alt struct node with only one ref is contained in that ref
    [make_num_node(Ref("Sefer HaChinukh")), make_named_node('Sefer HaChinukh', ['Parasha', 'Bo'], True), "Sefer HaChinukh, 4", None, False],  # alt struct node with multiple refs is not contained in a single one of refs
    [make_named_node('Sefer HaChinukh', ['Parasha', 'Lech Lecha'], True),  make_num_node(Ref("Sefer HaChinukh")), None, "Sefer HaChinukh, 3", False],  # ref outside of alt struct node isn't contained in it
    [zohar_volume1_intro_node, zohar_first_daf_node, None, 'Zohar, Volume I, Introduction 1b', True],  # zohar altStruct ref

])
def test_contains(node_a: ReferenceableBookNode, node_b: ReferenceableBookNode, self_tref: str, other_tref: str, is_contained: bool):
    self_oref = self_tref and Ref(self_tref)
    other_oref = other_tref and Ref(other_tref)
    print(node_a.contains(node_b, self_oref, other_oref))
    assert node_a.contains(node_b, self_oref, other_oref) == is_contained
