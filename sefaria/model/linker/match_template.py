from collections import defaultdict
from typing import List, Optional, Iterable
from functools import reduce
from sefaria.model import abstract as abst
from sefaria.model import schema
from .ref_part import TermContext, LEAF_TRIE_ENTRY
from .referenceable_book_node import NamedReferenceableBookNode
import structlog

logger = structlog.get_logger(__name__)


class MatchTemplate(abst.Cloneable):
    """
    Template for matching a SchemaNode to a RawRef
    """
    def __init__(self, term_slugs, scope='combined'):
        self.term_slugs = term_slugs
        self.scope = scope

    def get_terms(self) -> Iterable[schema.NonUniqueTerm]:
        for slug in self.term_slugs:
            yield schema.NonUniqueTerm.init(slug)

    def serialize(self) -> dict:
        serial = {
            "term_slugs": [t.slug for t in self.get_terms()],
        }
        if self.scope != 'combined':
            serial['scope'] = self.scope
        return serial

    def matches_scope(self, other_scope: str) -> bool:
        """
        Does `self`s scope match `other_scope`?
        @param other_scope:
        @return: True if scope matches
        """
        return other_scope == 'any' or self.scope == 'any' or other_scope == self.scope

    terms = property(get_terms)


class MatchTemplateTrie:
    """
    Trie for titles. Keys are titles from match_templates on nodes.
    E.g. if there is match template with term slugs ["term1", "term2"], term1 has title "Term 1", term2 has title "Term 2"
    then an entry in the trie would be {"Term 1": {"Term 2": ...}}
    """
    def __init__(self, lang: str, nodes: List[schema.TitledTreeNode] = None, sub_trie: dict = None, scope: str = None):
        """
        :param lang:
        :param nodes:
        :param sub_trie:
        :param scope: str. scope of the trie. if 'alone', take into account `match_templates` marked with scope "alone" or "any".
        """
        self.lang = lang
        self.scope = scope
        self._trie = self.__init_trie(nodes, sub_trie)

    def __init_trie(self, nodes: List[schema.TitledTreeNode], sub_trie: dict):
        if nodes is None:
            return sub_trie
        return self.__init_trie_with_nodes(nodes)

    def __init_trie_with_nodes(self, nodes: List[schema.TitledTreeNode]):
        trie = {}
        for node in nodes:
            for match_template in node.get_match_templates():
                if not node.is_root() and not match_template.matches_scope(self.scope):
                    continue
                curr_dict_queue = [trie]
                self.__add_all_term_titles_to_trie(match_template.terms, node, curr_dict_queue)
                self.__add_nodes_to_leaves(node, curr_dict_queue)
        return trie

    @staticmethod
    def __log_non_existent_term_warning(node: schema.TitledTreeNode):
        try:
            node_ref = node.ref()
        except:
            node_ref = node.get_primary_title('en')
        logger.warning(f"{node_ref} has match_templates that reference slugs that don't exist."
                       f"Check match_templates and fix.")

    def __add_all_term_titles_to_trie(self, term_list: List[schema.NonUniqueTerm], node: schema.TitledTreeNode, curr_dict_queue: List[dict]):
        for term in term_list:
            if term is None:
                self.__log_non_existent_term_warning(node)
                continue
            self.__add_term_titles_to_trie(term, curr_dict_queue)

    def __add_term_titles_to_trie(self, term, curr_dict_queue: List[dict]):
        len_curr_dict_queue = len(curr_dict_queue)
        for _ in range(len_curr_dict_queue):
            curr_dict = curr_dict_queue.pop(0)
            curr_dict_queue += self.__get_sub_tries_for_term(term, curr_dict)

    @staticmethod
    def __add_nodes_to_leaves(node: schema.TitledTreeNode, curr_dict_queue: List[dict]):
        for curr_dict in curr_dict_queue:
            leaf_node = NamedReferenceableBookNode(node.index if node.is_root() else node)
            if LEAF_TRIE_ENTRY in curr_dict:
                curr_dict[LEAF_TRIE_ENTRY] += [leaf_node]
            else:
                curr_dict[LEAF_TRIE_ENTRY] = [leaf_node]

    @staticmethod
    def __get_sub_trie_for_new_key(key: str, curr_trie: dict) -> dict:
        if key in curr_trie:
            sub_trie = curr_trie[key]
        else:
            sub_trie = {}
            curr_trie[key] = sub_trie
        return sub_trie

    def __get_sub_tries_for_term(self, term: schema.NonUniqueTerm, curr_trie: dict) -> List[dict]:
        sub_tries = []
        for title in term.get_titles(self.lang):
            sub_tries += [self.__get_sub_trie_for_new_key(title, curr_trie)]
        # also add term's key to trie for lookups from context ref parts
        sub_tries += [self.__get_sub_trie_for_new_key(TermContext(term).key(), curr_trie)]
        return sub_tries

    def __getitem__(self, key):
        return self.get(key)        

    def get(self, key, default=None):
        sub_trie = self._trie.get(key, default)
        if sub_trie is None: return
        return MatchTemplateTrie(self.lang, sub_trie=sub_trie, scope=self.scope)

    def has_continuations(self, key: str, key_is_id=False) -> bool:
        """
        Does trie have continuations for `key`?
        :param key: key to look up in trie. may need to be split into multiple keys to find a continuation.
        :param key_is_id: True if key is ID that cannot be split into smaller keys (e.g. slug).
        TODO currently not allowing partial matches here but theoretically possible
        """
        conts, _ = self.get_continuations(key, default=None, key_is_id=key_is_id, allow_partial=False)
        return conts is not None

    @staticmethod
    def _merge_two_tries(a, b):
        "merges b into a"
        for key in b:
            if key in a:
                if isinstance(a[key], dict) and isinstance(b[key], dict):
                    MatchTemplateTrie._merge_two_tries(a[key], b[key])
                elif a[key] == b[key]:
                    pass  # same leaf value
                elif isinstance(a[key], list) and isinstance(b[key], list):
                    a[key] += b[key]
                else:
                    raise Exception('Conflict in _merge_two_tries')
            else:
                a[key] = b[key]
        return a

    @staticmethod
    def _merge_n_tries(*tries):
        if len(tries) == 1:
            return tries[0]
        return reduce(MatchTemplateTrie._merge_two_tries, tries)

    def get_continuations(self, key: str, default=None, key_is_id=False, allow_partial=False):
        continuations, partial_key_end_list = self._get_continuations_recursive(key, key_is_id=key_is_id, allow_partial=allow_partial)
        if len(continuations) == 0:
            return default, None
        merged = self._merge_n_tries(*continuations)
        # TODO unclear how to 'merge' partial_key_end_list. Currently will only work if there's one continuation
        partial_key_end = partial_key_end_list[0] if len(partial_key_end_list) == 1 else None
        return MatchTemplateTrie(self.lang, sub_trie=merged, scope=self.scope), partial_key_end

    def _get_continuations_recursive(self, key: str, prev_sub_tries=None, key_is_id=False, has_partial_matches=False, allow_partial=False):
        from sefaria.utils.hebrew import get_prefixless_inds
        import re

        prev_sub_tries = prev_sub_tries or self._trie
        if key_is_id:
            # dont attempt to split key
            next_sub_tries = [prev_sub_tries[key]] if key in prev_sub_tries else []
            return next_sub_tries, []
        next_sub_tries = []
        partial_key_end_list = []
        key = key.strip()
        starti_list = [0]
        if self.lang == 'he' and len(key) >= 4:
            # In AddressType.get_all_possible_sections_from_string(), we prevent stripping of prefixes from AddressInteger. No simple way to do that with terms that take the place of AddressInteger (e.g. Bavli Perek). len() check is a heuristic.
            starti_list += get_prefixless_inds(key)
        for starti in starti_list:
            for match in reversed(list(re.finditer(r'(\s+|$)', key[starti:]))):
                endi = match.start() + starti
                sub_key = key[starti:endi]
                if sub_key not in prev_sub_tries: continue
                if endi == len(key):
                    next_sub_tries += [prev_sub_tries[sub_key]]
                    partial_key_end_list += [None]
                    continue
                temp_sub_tries, temp_partial_key_end_list = self._get_continuations_recursive(key[endi:], prev_sub_tries[sub_key], has_partial_matches=True, allow_partial=allow_partial)
                next_sub_tries += temp_sub_tries
                partial_key_end_list += temp_partial_key_end_list

        if has_partial_matches and len(next_sub_tries) == 0 and allow_partial and isinstance(prev_sub_tries, dict):
            # partial match without any complete matches
            return [prev_sub_tries], [key]
        if len(partial_key_end_list) > 1:
            # currently we don't consider partial keys if there's more than one match
            full_key_matches = list(filter(lambda x: x[1] is None, zip(next_sub_tries, partial_key_end_list)))
            if len(full_key_matches) == 0:
                return [], []
            next_sub_tries, partial_key_end_list = zip(*full_key_matches)
        return next_sub_tries, partial_key_end_list

    def __contains__(self, key):
        return key in self._trie

    def __iter__(self):
        for item in self._trie:
            yield item
