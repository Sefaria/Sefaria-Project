import dataclasses
from typing import List, Union, Optional
from sefaria.model import abstract as abst
from sefaria.model import text
from sefaria.model import schema


class ReferenceableBookNode:
    """
    Represents tree of referenceable nodes. In general, this tree is based on the tree in an Index's schema, but with
    some notable differences
    - alt struct nodes are part of the tree, represented as NamedReferenceableBookNodes
    - JaggedArrayNodes get split into N NumberedReferenceableNodes, where N is the depth of the JaggedArrayNode
    - The leave node of a JaggedArrayNode with `isSegmentLevelDiburHamatchil == True` is a DiburHamatchilNodeSet
    """

    def get_children(self, *args, **kwargs) -> List['ReferenceableBookNode']:
        return []

    def is_default(self) -> bool:
        return False


class NamedReferenceableBookNode(ReferenceableBookNode):

    def __init__(self, titled_tree_node_or_index: Union[schema.TitledTreeNode, text.Index]):
        self._titled_tree_node_or_index = titled_tree_node_or_index
        self._titled_tree_node = titled_tree_node_or_index
        if isinstance(titled_tree_node_or_index, text.Index):
            self._titled_tree_node = titled_tree_node_or_index.nodes

    def is_default(self):
        return self._titled_tree_node.is_default()

    def get_numeric_equivalent(self):
        return getattr(self._titled_tree_node, "numeric_equivalent", None)

    def ref(self) -> text.Ref:
        return self._titled_tree_node.ref()

    def _get_all_children(self) -> List[ReferenceableBookNode]:
        thingy = self._titled_tree_node_or_index
        #the schema node for this referenceable node has a dibur hamatchil child
        if isinstance(thingy, schema.NumberedTitledTreeNode) and thingy.is_segment_level_dibur_hamatchil():
            return [DiburHamatchilNodeSet({"container_refs": self.ref().normal()})]
        #the schema node for this referenceable is a JAN. JANs act as both named and numbered nodes
        if isinstance(thingy, schema.JaggedArrayNode) and len(thingy.children) == 0:
            return [NumberedReferenceableBookNode(thingy)]
        if isinstance(thingy, text.Index):
            children = thingy.referenceable_children()
        else:
            # Any other type of TitledTreeNode
            children = self._titled_tree_node.children
        children = [self._transform_schema_node_to_referenceable(x) for x in children]
        return children

    @staticmethod
    def _transform_schema_node_to_referenceable(schema_node: schema.TitledTreeNode) -> ReferenceableBookNode:
        if isinstance(schema_node, schema.JaggedArrayNode) and (schema_node.is_default() or schema_node.parent is None):
            return NumberedReferenceableBookNode(schema_node)
        return NamedReferenceableBookNode(schema_node)

    def get_children(self, *args, **kwargs) -> List[ReferenceableBookNode]:
        '''
        Node can have the attribute 'referenceable' sets to True (which is the default when the attribute ismissing), False or 'optional'.
        When node has referenceable False, it will return its referenceable descendant instead of itself.
        When has referenceable 'optional', it will return the node itself and its referenceable descendant.
        :return: list of the referenceable cihldren of the node
        '''
        nodes = []
        for node in self._get_all_children():
            referenceable = getattr(node, 'referenceable', True)
            if referenceable: #referenceable or optional
                nodes.append(node)
            if referenceable is not True: #unreferenceable or optional
                nodes += node._get_all_children()
        return nodes

    def ref_part_title_trie(self, *args, **kwargs):
        return self._titled_tree_node.get_match_template_trie(*args, **kwargs)


class NumberedReferenceableBookNode(ReferenceableBookNode):
    def __init__(self, ja_node: schema.NumberedTitledTreeNode):
        self._ja_node = ja_node

    def is_default(self):
        return self._ja_node.is_default() and self._ja_node.parent is not None

    def ref(self):
        return self._ja_node.ref()

    @property
    def address_class(self) -> schema.AddressType:
        return self._ja_node.address_class(0)

    @property
    def section_name(self) -> str:
        return self._ja_node.sectionNames[0]

    def get_all_possible_sections_from_string(self, *args, **kwargs):
        """
        wraps AddressType function with same name
        @return:
        """
        return self.address_class.get_all_possible_sections_from_string(*args, **kwargs)

    def _get_next_referenceable_depth(self):
        if self.is_default():
            return 0
        next_refereceable_depth = 1
        # if `referenceableSections` is not define, assume they're all referenceable
        referenceable_sections = getattr(self._ja_node, 'referenceableSections', [])
        if len(referenceable_sections) > 0:
            while next_refereceable_depth < len(referenceable_sections) and not referenceable_sections[next_refereceable_depth]:
                next_refereceable_depth += 1
        return next_refereceable_depth

    def get_children(self, context_ref=None, **kwargs) -> [ReferenceableBookNode]:
        serial = self._ja_node.serialize()
        next_referenceable_depth = self._get_next_referenceable_depth()
        serial['depth'] -= next_referenceable_depth
        if serial['depth'] < 0:
            return []
        serial['default'] = False  # any JA node that has been modified should lose 'default' flag
        if serial['depth'] <= 1 and self._ja_node.is_segment_level_dibur_hamatchil():
            return [DiburHamatchilNodeSet({"container_refs": context_ref.normal()})]
        if (self._ja_node.depth - next_referenceable_depth) == 0:
            if isinstance(self.address_class, schema.AddressTalmud):
                serial['addressTypes'] = ["Amud"]
                serial['sectionNames'] = ["Amud"]
                serial['lengths'] = [1]
                serial['referenceableSections'] = [True]
            else:
                return []
        else:
            for list_attr in ('addressTypes', 'sectionNames', 'lengths', 'referenceableSections'):
                # truncate every list attribute by `next_referenceable_depth`
                if list_attr not in serial: continue
                serial[list_attr] = serial[list_attr][next_referenceable_depth:]
        new_ja = schema.JaggedArrayNode(serial=serial, index=getattr(self, 'index', None), **kwargs)
        return [NumberedReferenceableBookNode(new_ja)]

    def matches_section_context(self, section_context: 'SectionContext') -> bool:
        """
        Does the address in `self` match the address in `section_context`?
        """
        if self.address_class.__class__ != section_context.addr_type.__class__: return False
        if self.section_name != section_context.section_name: return False
        return True


@dataclasses.dataclass
class DiburHamatchilMatch:
    score: float
    dh: Optional[str]
    potential_dh_token_idx: int
    dh_node: 'DiburHamatchilNode' = None

    def order_key(self):
        dh_len = len(self.dh) if self.dh else 0
        return self.score, dh_len

    def __gt__(self, other: 'DiburHamatchilMatch'):
        return self.order_key() > other.order_key()

    def __ge__(self, other: 'DiburHamatchilMatch'):
        return self.order_key() >= other.order_key()

    def __lt__(self, other: 'DiburHamatchilMatch'):
        return self.order_key() < other.order_key()

    def __le__(self, other: 'DiburHamatchilMatch'):
        return self.order_key() <= other.order_key()


class DiburHamatchilNode(abst.AbstractMongoRecord, ReferenceableBookNode):
    """
    Very likely possible to use VirtualNode and add these nodes as children of JANs and ArrayMapNodes. But that can be a little complicated
    """
    collection = "dibur_hamatchils"
    required_attrs = [
        "dibur_hamatchil",
        "container_refs",
        "ref",
    ]

    def fuzzy_match_score(self, lang, raw_ref_part) -> DiburHamatchilMatch:
        from sefaria.utils.hebrew import hebrew_starts_with
        for dh, dh_index in raw_ref_part.get_dh_text_to_match(lang):
            if hebrew_starts_with(self.dibur_hamatchil, dh):
                return DiburHamatchilMatch(1.0, dh, dh_index)
        return DiburHamatchilMatch(0.0, None, dh_index)


class DiburHamatchilNodeSet(abst.AbstractMongoSet, ReferenceableBookNode):
    recordClass = DiburHamatchilNode

    def best_fuzzy_matches(self, lang, raw_ref_part, score_leeway=0.01, threshold=0.9) -> List[DiburHamatchilMatch]:
        """
        :param lang: either 'he' or 'en'
        :param raw_ref_part: of type "DH" to match
        :param score_leeway: all scores within `score_leeway` of the highest score are returned
        :param threshold: scores below `threshold` aren't returned
        """
        best_list = [DiburHamatchilMatch(0.0, '', 0)]
        for node in self:
            dh_match = node.fuzzy_match_score(lang, raw_ref_part)
            if dh_match.dh is None: continue
            if dh_match >= best_list[-1]:
                dh_match.dh_node = node
                best_list += [dh_match]
        best_match = best_list[-1]
        return [best for best in best_list if best.score > threshold and best.score + score_leeway >= best_match.score
                and len(best.dh) == len(best_match.dh)]
