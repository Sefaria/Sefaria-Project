import dataclasses
from typing import Tuple, Dict
import copy
import re
from collections import defaultdict
from typing import List, Union, Optional
from threading import Lock
from sefaria.model import abstract as abst
from sefaria.model import text
from sefaria.model import schema
from sefaria.model.passage import PassageSet, Passage
from sefaria.system.exceptions import InputError
from bisect import bisect_right


def subref(ref: text.Ref, section: int):
    if ref.index_node.addressTypes[len(ref.sections)-1] == "Talmud":
        return _talmud_subref(ref, section)
    elif ref.index.categories == ['Tanakh', 'Torah']:
        return _parsha_subref(ref, section)
    else:
        return ref.subref(section)


def _talmud_subref(ref: text.Ref, section: int):
    d = ref._core_dict()
    d['sections'][-1] += (section-1)
    d['toSections'] = d['sections'][:]
    return text.Ref(_obj=d)


def _parsha_subref(ref: text.Ref, section: int):
    parsha_trefs = {n.wholeRef for n in ref.index.get_alt_struct_leaves()}
    if ref.normal() in parsha_trefs:
        book_subref = text.Ref(ref.index.title).subref(section)
        if ref.contains(book_subref):
            return book_subref
        else:
            # section doesn't fall within parsha
            # Note, only validates that perek is in parsha range, doesn't check segment level.
            # Edge case is Parshat Noach 6:3
            raise InputError
    else:
        return ref.subref(section)


JA_NODE_LIST_ATTRS = ('addressTypes', 'sectionNames', 'lengths', 'referenceableSections')


def truncate_serialized_node_to_depth(serial_node: dict, depth: int) -> dict:
    truncated_serial_node = serial_node.copy()
    for list_attr in JA_NODE_LIST_ATTRS:
        if list_attr in serial_node:
            truncated_serial_node[list_attr] = serial_node[list_attr][depth:]
    return truncated_serial_node


def insert_amud_node_values(serial_node: dict) -> (dict, int):
    """
    Insert values to serialized JA node that correspond to an Amud section.
    This section doesn't exist in the JA node but is useful for matching Talmud sections with the linker
    @param serial_node: serialized JA node
    @return: `serial_node` with values for Amud section + the next referenceable depth corresponding to this modified node
    """
    serial_node['depth'] += 1
    next_referenceable_depth = 1
    for key, value in zip(JA_NODE_LIST_ATTRS, ('Amud', 'Amud', 1, True)):
        if key in serial_node:
            serial_node[key].insert(1, value)
    return serial_node, next_referenceable_depth


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

    @property
    def referenceable(self) -> bool:
        return True

    def is_ancestor_of(self, other: 'ReferenceableBookNode') -> bool:
        other_node = other._get_titled_tree_node()
        self_node = self._get_titled_tree_node()
        return self_node.is_ancestor_of(other_node)

    def _get_titled_tree_node(self) -> schema.TitledTreeNode:
        raise NotImplementedError

    def leaf_refs(self) -> list[text.Ref]:
        """
        Get the Refs for the ReferenceableBookNode leaf nodes from `self`
        @return:
        """
        raise NotImplementedError


class IndexNodeReferenceableBookNode(ReferenceableBookNode):
    """
    ReferenceableBookNode backed by node in an Index (either SchemaNode or AltStructNode)
    """

    def __init__(self, titled_tree_node: schema.TitledTreeNode):
        self._titled_tree_node = titled_tree_node

    @property
    def referenceable(self):
        return getattr(self._titled_tree_node, 'referenceable', not self.is_default())

    def _get_titled_tree_node(self) -> schema.TitledTreeNode:
        return self._titled_tree_node

    def is_default(self):
        return self._titled_tree_node.is_default() and self._titled_tree_node.parent is not None

    def ref(self) -> text.Ref:
        return self._titled_tree_node.ref()

    def unique_key(self) -> str:
        return self.ref().normal()

    def ref_order_id(self) -> str:
        if isinstance(self._titled_tree_node, schema.AltStructNode):
            leaves = self._titled_tree_node.get_leaf_nodes()
            # assume leaves are contiguous. If this is wrong, will be disproven later in the function
            if len(leaves) == 0:
                return "N/A"
            try:
                approx_ref = leaves[0].ref().to(leaves[-1].ref())
                return approx_ref.order_id()
            except:
                return leaves[0].ref().order_id()
        return self.ref().order_id()


class NamedReferenceableBookNode(IndexNodeReferenceableBookNode):

    def __init__(self, titled_tree_node_or_index: Union[schema.TitledTreeNode, text.Index]):
        self._titled_tree_node_or_index = titled_tree_node_or_index
        titled_tree_node = titled_tree_node_or_index
        if isinstance(titled_tree_node_or_index, text.Index):
            titled_tree_node = titled_tree_node_or_index.nodes
        super().__init__(titled_tree_node)

    def get_numeric_equivalent(self):
        return getattr(self._titled_tree_node, "numeric_equivalent", None)

    @staticmethod
    def _is_array_map_referenceable(node: schema.ArrayMapNode) -> bool:
        if not getattr(node, "isMapReferenceable", True):
            return False
        if getattr(node, "refs", None):
            return True
        if getattr(node, "wholeRef", None) and getattr(node, "includeSections", None):
            return True
        return False

    def _get_all_children(self) -> List[ReferenceableBookNode]:
        thingy = self._titled_tree_node_or_index
        # the schema node for this referenceable node has a dibur hamatchil child
        if isinstance(thingy, schema.NumberedTitledTreeNode) and thingy.is_segment_level_dibur_hamatchil():
            return [DiburHamatchilNodeSet({"container_refs": self.ref().normal()})]
        # the schema node for this referenceable is a JAN. JANs act as both named and numbered nodes
        if isinstance(thingy, schema.JaggedArrayNode) and len(thingy.children) == 0:
            return [NumberedReferenceableBookNode(thingy)]
        if isinstance(thingy, text.Index):
            children = thingy.referenceable_children()
        elif isinstance(thingy, schema.ArrayMapNode):
            if self._is_array_map_referenceable(thingy):
                return [MapReferenceableBookNode(thingy)]
            else:
                index = thingy.ref().index
                yo = NamedReferenceableBookNode(index)
                return yo.get_children()
        else:
            # Any other type of TitledTreeNode
            children = self._titled_tree_node.children
        children = [self._transform_schema_node_to_referenceable(x) for x in children]
        return children

    def _get_children_from_array_map_node(self, node: schema.ArrayMapNode) -> List[ReferenceableBookNode]:
        pass

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

    def leaf_refs(self) -> list[text.Ref]:
        return [n.ref() for n in self._get_titled_tree_node().get_leaf_nodes()]


class NumberedReferenceableBookNode(IndexNodeReferenceableBookNode):

    def __init__(self, ja_node: schema.NumberedTitledTreeNode):
        super().__init__(ja_node)
        self._ja_node: schema.NumberedTitledTreeNode = ja_node

    @property
    def referenceable(self):
        return getattr(self._ja_node, 'referenceable', True)

    def leaf_refs(self) -> list[text.Ref]:
        return [self.ref()]

    def possible_subrefs(self, lang: str, initial_ref: text.Ref, section_str: str, fromSections=None) -> Tuple[List[text.Ref], List[bool]]:
        try:
            possible_sections, possible_to_sections, addr_classes = self._address_class.get_all_possible_sections_from_string(lang, section_str, fromSections, strip_prefixes=True)
        except (IndexError, TypeError, KeyError):
            return [], []
        possible_subrefs = []
        can_match_out_of_order_list = []
        for sec, toSec, addr_class in zip(possible_sections, possible_to_sections, addr_classes):
            try:
                refined_ref = subref(initial_ref, sec)
                if toSec != sec:
                    to_ref = subref(initial_ref, toSec)
                    refined_ref = refined_ref.to(to_ref)
                possible_subrefs += [refined_ref]
                can_match_out_of_order_list += [addr_class.can_match_out_of_order(lang, section_str)]
            except (InputError, IndexError, AssertionError, AttributeError):
                continue
        return possible_subrefs, can_match_out_of_order_list

    @property
    def _address_class(self) -> schema.AddressType:
        return self._ja_node.address_class(0)

    @property
    def _section_name(self) -> str:
        return self._ja_node.sectionNames[0]

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

    def _get_serialized_node(self) -> dict:
        serial = copy.deepcopy(self._ja_node.serialize())
        next_referenceable_depth = self._get_next_referenceable_depth()
        if isinstance(self._address_class, schema.AddressTalmud):
            serial, next_referenceable_depth = insert_amud_node_values(serial)
        serial['depth'] -= next_referenceable_depth
        serial['default'] = False  # any JA node that has been modified should lose 'default' flag
        serial['parent'] = self._ja_node
        if serial['depth'] == 0:
            raise ValueError("Can't serialize JaggedArray of depth 0")
        serial = truncate_serialized_node_to_depth(serial, next_referenceable_depth)
        return serial

    def get_children(self, context_ref=None, **kwargs) -> list[ReferenceableBookNode]:
        try:
            serial = self._get_serialized_node()
        except ValueError:
            return []
        children = []
        if self._ja_node.is_segment_level_dibur_hamatchil():
            children += [DiburHamatchilNodeSet({"container_refs": context_ref.normal()})]
            if serial['depth'] == 1:
                return children
        passages = PASSAGE_MATCHER.get_passages(context_ref)
        if passages:
            children += [PassageNodeSet(passages)]
        new_ja = schema.JaggedArrayNode(serial=serial, index=getattr(self, 'index', None), **kwargs)
        return children + [NumberedReferenceableBookNode(new_ja)]

    def matches_section_context(self, section_context: 'SectionContext') -> bool:
        """
        Does the address in `self` match the address in `section_context`?
        """
        if self._address_class.__class__ != section_context.addr_type.__class__: return False
        if self._section_name != section_context.section_name: return False
        return True


class MapReferenceableBookNode(NumberedReferenceableBookNode):
    """
    Node that can only be referenced by refs in a mapping
    """

    def __init__(self, node: schema.ArrayMapNode):
        ja_node = self.__make_ja_from_array_map(node)
        super().__init__(ja_node)
        self._section_ref_map = self.__make_section_ref_map(node)

    @staticmethod
    def __make_ja_from_array_map(node: schema.ArrayMapNode):
        return MapReferenceableBookNode.__make_ja(**MapReferenceableBookNode.__get_ja_attributes_from_array_map(node))

    @staticmethod
    def __make_ja(addressTypes: List[str], sectionNames: List[str], **ja_node_attrs):
        return schema.JaggedArrayNode(serial={
            "addressTypes": addressTypes,
            "sectionNames": sectionNames,
            **ja_node_attrs,
            "depth": len(addressTypes),
        })

    @staticmethod
    def __get_ja_attributes_from_array_map(node: schema.ArrayMapNode) -> dict:
        if getattr(node, 'refs', None):
            address_types = node.addressTypes
            section_names = node.sectionNames
            return {"addressTypes": address_types, "sectionNames": section_names}
        elif getattr(node, 'wholeRef', None) and getattr(node, 'includeSections', False):
            whole_ref = text.Ref(node.wholeRef)
            schema_node = whole_ref.index_node.serialize()
            return truncate_serialized_node_to_depth(schema_node, -2)
        else:
            return {}

    def __make_section_ref_map(self, node: schema.ArrayMapNode) -> Dict[int, text.Ref]:
        if getattr(node, 'refs', None):
            section_ref_map = {
                self.__get_section_with_offset(ichild, node): text.Ref(tref)
                for ichild, tref in enumerate(node.refs)
            }
        elif getattr(node, 'wholeRef', None) and getattr(node, 'includeSections', False):
            whole_ref = text.Ref(node.wholeRef)
            refs = whole_ref.split_spanning_ref()
            section_ref_map = {}
            for oref in refs:
                section = oref.section_ref().sections[0]
                section_ref_map[section] = oref
        else:
            raise Exception("ArrayMapNode doesn't have expected attributes 'refs' or 'wholeRef'.")
        return section_ref_map

    def __get_section_with_offset(self, i: int, node: schema.ArrayMapNode) -> int:
        addresses = getattr(node, "addresses", None)
        if addresses:
            return addresses[i]
        section = i + 1
        starting_address = getattr(node, "startingAddress", None)
        if starting_address:
            section = i + self._address_class.toNumber("en", starting_address)
        skipped_addresses = getattr(node, "skipped_addresses", None)
        if skipped_addresses:
            skipped_addresses.sort()
            section += bisect_right(skipped_addresses, section)
        return section

    def ref(self):
        raise NotImplementedError(f'{self.__class__} does not have a single ref.')

    def leaf_refs(self) -> list[text.Ref]:
        return list(self._section_ref_map.values())

    def possible_subrefs(self, lang: str, initial_ref: text.Ref, section_str: str, fromSections=None) -> Tuple[List[text.Ref], List[bool]]:
        try:
            possible_sections, possible_to_sections, addr_classes = self._address_class.\
                get_all_possible_sections_from_string(lang, section_str, fromSections, strip_prefixes=True)
        except (IndexError, TypeError, KeyError):
            return [], []
        # map sections to equivalent refs in section_ref_map
        mapped_refs = []
        for sec, to_sec in zip(possible_sections, possible_to_sections):
            mapped_ref = self._section_ref_map.get(sec)
            if mapped_ref and sec == to_sec:
                mapped_refs += [mapped_ref]
        return mapped_refs, [True]*len(mapped_refs)


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
    
    
class PassageNode(ReferenceableBookNode):
    
    def __init__(self, passage: Passage):
        self._passage = passage
        
    def ref(self) -> text.Ref:
        return self._passage.ref()
        
    def get_match_template_trie(self, *args, **kwargs):
        return self._passage.get_match_template_trie(*args, **kwargs)
    
    
class PassageNodeSet(ReferenceableBookNode):
    
    def __init__(self, passages: list[Passage]):
        self._passages = passages
        
    def get_children(self, *args, **kwargs) -> List['PassageNode']:
        return [PassageNode(passage) for passage in self._passages]
    
    
class PassageMatcher:

    # make class into singleton that is thread-safe
    _instance = None
    _lock = Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self._by_segment = defaultdict(list)
        passages = PassageSet({"match_templates": {"$exists": True}})
        for passage in passages:
            for seg_tref in passage.ref_list:
                self._by_segment[seg_tref].append(passage)
                
    def get_passages(self, ref: text.Ref) -> List[Passage]:
        reg = re.compile(ref.regex())
        matched_keys = [key for key in self._by_segment if re.search(reg, key)]
        passages = []
        for key in matched_keys:
            passages.extend(self._by_segment[key])
        return passages


PASSAGE_MATCHER = PassageMatcher()


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
