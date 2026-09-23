from sefaria.model.linker.ref_part import RawRefPart
from sefaria.model.linker.referenceable_book_node import ReferenceableBookNode


class RefPartAndNodeMatch:
    """
    A pairing of RawRefParts and ReferenceableBookNode that were matched together
    The fundamental unit of a ResolvedRef which is trying to find matches between all input ref parts and nodes
    """

    def __init__(self, parts: tuple[RawRefPart], node: ReferenceableBookNode, can_match_out_of_order: bool, ref=None):
        self._parts = parts
        self._node = node
        self._can_match_out_of_order = can_match_out_of_order
        self._ref = ref

    @property
    def parts(self) -> tuple[RawRefPart]:
        return self._parts

    @property
    def node(self) -> ReferenceableBookNode:
        return self._node

    @property
    def ref(self):
        """
        The actual section Ref matched at this step (e.g. `Genesis 1` for the chapter part of `Genesis 1:2`).
        Distinct from `node.ref()`, which is the node's own (broader) reference. May be None for pairings
        that weren't produced by a refiner (e.g. seed/instantiation pairings).
        """
        return self._ref
    
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
