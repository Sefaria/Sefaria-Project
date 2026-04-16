from sefaria.model.linker.ref_part import RawRefPart
from sefaria.model.linker.referenceable_book_node import ReferenceableBookNode


class RefPartAndNodeMatch:
    """
    A pairing of RawRefParts and ReferenceableBookNode that were matched together
    The fundamental unit of a ResolvedRef which is trying to find matches between all input ref parts and nodes
    """

    def __init__(self, parts: tuple[RawRefPart], node: ReferenceableBookNode, can_match_out_of_order: bool):
        self._parts = parts
        self._node = node
        self._can_match_out_of_order = can_match_out_of_order

    @property
    def parts(self) -> tuple[RawRefPart]:
        return self._parts

    @property
    def node(self) -> ReferenceableBookNode:
        return self._node
    
    def set_node(self, node: ReferenceableBookNode):
        self._node = node

    @property
    def can_match_out_of_order(self) -> bool:
        return self._can_match_out_of_order

    def __eq__(self, other):
        return isinstance(other, self.__class__) and self.__hash__() == other.__hash__()

    def __hash__(self):
        """
        Note, ignoring `node` in hash computation
        """
        return hash((self._parts.__hash__(), self._can_match_out_of_order))
