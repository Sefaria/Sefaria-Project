from sefaria.model.linker.ref_part import RawRefPart, RefPartType
from sefaria.model.linker.referenceable_book_node import ReferenceableBookNode, NamedReferenceableBookNode, NumberedReferenceableBookNode
from sefaria.model.linker.resolved_ref_refiner import ResolvedRefRefinerForDefaultNode, ResolvedRefRefinerForNumberedPart, ResolvedRefRefinerForDiburHamatchilPart, ResolvedRefRefinerForRangedPart, ResolvedRefRefinerForNamedNode, ResolvedRefRefiner, ResolvedRefRefinerCatchAll


class ResolvedRefRefinerFactoryKey:

    def __init__(self, part_type: RefPartType = None, node_class: type = None, is_default: bool = False):
        self.key = (part_type, node_class, is_default)

    def __eq__(self, other):
        if not isinstance(other, ResolvedRefRefinerFactoryKey):
            return False
        for a, b in zip(self.key, other.key):
            if a is not None and b is not None and a != b:
                return False
        return True


class ResolvedRefRefinerFactory:
    """
    Factory class to create `ResolveRefRefiner`s
    Use `register_refiner()` to register rules when a certain refiner should be used
    Order in which refiners are registered matters. The first rule that matches will be used.
    """

    def __init__(self):
        self.__refiner_list = []

    def register_refiner(self, key: ResolvedRefRefinerFactoryKey, refiner_type: type):
        self.__refiner_list += [(key, refiner_type)]

    def create(self, part: RawRefPart, node: ReferenceableBookNode, resolved_ref: 'ResolvedRef') -> ResolvedRefRefiner:
        refiner = self.__get_refiner_class(part.type, node.__class__, node.is_default())
        return refiner(part, node, resolved_ref)

    def __get_refiner_class(self, part_type: RefPartType, node_class: type, is_default: bool) -> type:
        key = ResolvedRefRefinerFactoryKey(part_type, node_class, is_default)
        for temp_key, temp_refiner in self.__refiner_list:
            if key == temp_key:
                return temp_refiner
        raise ValueError(f"Invalid combination of part and node passed.")


def initialize_resolved_ref_refiner_factory() -> ResolvedRefRefinerFactory:
    factory = ResolvedRefRefinerFactory()
    key = ResolvedRefRefinerFactoryKey
    refiners_to_register = [
        (key(is_default=True), ResolvedRefRefinerForDefaultNode),
        (key(RefPartType.NUMBERED, node_class=NumberedReferenceableBookNode), ResolvedRefRefinerForNumberedPart),
        (key(RefPartType.RANGE, node_class=NumberedReferenceableBookNode), ResolvedRefRefinerForRangedPart),
        (key(RefPartType.NAMED, node_class=NamedReferenceableBookNode), ResolvedRefRefinerForNamedNode),
        (key(RefPartType.NUMBERED, node_class=NamedReferenceableBookNode), ResolvedRefRefinerForNamedNode),
        (key(RefPartType.DH), ResolvedRefRefinerForDiburHamatchilPart),
        (key(), ResolvedRefRefinerCatchAll),
    ]
    for k, v in refiners_to_register:
        factory.register_refiner(k, v)
    return factory


resolved_ref_refiner_factory: ResolvedRefRefinerFactory = initialize_resolved_ref_refiner_factory()
