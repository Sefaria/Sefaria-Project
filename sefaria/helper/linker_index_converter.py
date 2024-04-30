from functools import partial
import re
import unicodedata
from pymongo import InsertOne
from tqdm import tqdm
from sefaria.model.text import library, Index, IndexSet, Ref, VersionSet
from sefaria.model.schema import Term, NonUniqueTerm, TitleGroup
from sefaria.system.exceptions import InputError
from sefaria.model.version_state import StateNode
from sefaria.system.database import db
from sefaria.utils.hebrew import strip_cantillation
from sefaria.utils.tibetan import has_tibetan

"""
Utility classes for converting Indexes so they are discoverable by Linker.v3
"""


class ReusableTermManager:
    """
    Handles creation of NonUniqueTerms and stores them for reuse
    """

    def __init__(self):
        self.context_and_primary_title_to_term = {}
        self.num_to_perek_term_map = {}
        self.old_term_map = {}

    def get_term_by_primary_title(self, context, title):
        return self.context_and_primary_title_to_term.get((context, title))

    def get_term_by_old_term_name(self, old_term_name):
        return self.old_term_map.get(old_term_name)

    def get_perek_term_by_num(self, perek_num):
        return self.num_to_perek_term_map.get(perek_num)

    def create_term(self, **kwargs):
        """

        @param kwargs:
            'en'
            'he'
            'alt_en'
            'alt_he'
            'context'
        @return:
        """
        slug = kwargs.get('en', kwargs.get('he'))
        term = NonUniqueTerm({
            "slug": slug,
            "titles": []
        })
        for lang in ('en', 'he'):
            if kwargs.get(lang, False):
                term.title_group.add_title(kwargs.get(lang), lang, primary=True)
            for title in kwargs.get(f"alt_{lang}", []):
                term.title_group.add_title(title, lang)
        term.save()
        self.context_and_primary_title_to_term[(kwargs.get('context'), term.get_primary_title('en'))] = term
        return term

    def create_term_from_titled_obj(self, obj, context=None, new_alt_titles=None, title_modifier=None, title_adder=None):
        """
        Create a NonUniqueTerm from 'titled object' (see explanation of `obj` param)
        Accepts params to modify or add new alt titles
        @param obj: either of instance `TitleGroup` or has an attribute `title_group` (e.g. a `Term` or `SchemaNode` has this field)
        @param context: Optional string (or any hashable object) to distinguish terms with the same primary title. For use with `get_term_by_primary_title()`
        @param new_alt_titles: list[str]. optional list of alt titles to add. will auto-detect language of title.
        @param title_modifier: function(lang, str) -> str. given lang and current alt title, replaces alt title with return value. Useful for removing common prefixes such as "Parshat" or "Mesechet"
        @param title_adder: function(lang, str) -> str. given lang and current alt title, returns new alt title. If returns None, no alt title is added for given title. Useful for creating variations on existing alt titles.
        @return: new NonUniqueTerm

        Example:

        .. highlight:: python
        .. code-block:: python

            # make NonUniqueTerm based on index node of "Genesis"
            # remove leading "Sefer " from all alt titles
            # add new titles that replace "sh" with "š"

            def title_modifier(lang, title):
                if lang == "en":
                    return re.sub(r"^Sefer ", "", title)
                return title

            def title_adder(lang, title):
                if "sh" in title:
                    return title.repalce("sh", "š")

            index = library.get_index("Genesis")
            gen_term = ReusableTermManager.create_term_from_titled_obj(
                index.nodes, "structural", ["Bˋershis", "Breišis"],
                title_modifier, title_adder
            )

        ...

        """
        new_alt_titles = new_alt_titles or []
        title_group = obj if isinstance(obj, TitleGroup) else obj.title_group
        en_title = title_group.primary_title('en')
        he_title = title_group.primary_title('he')
        if not (en_title and he_title):
            raise InputError("title group has no primary titles. can't create term.")
        alt_en_titles = [title for title in title_group.all_titles('en') if title != en_title]
        alt_he_titles = [title for title in title_group.all_titles('he') if title != he_title]
        if title_modifier:
            en_title = title_modifier('en', en_title)
            he_title = title_modifier('he', he_title)
        for new_alt in new_alt_titles:
            if has_tibetan(new_alt):
                alt_he_titles += [new_alt]
            else:
                alt_en_titles += [new_alt]
        for alt_title_list, lang in zip((alt_en_titles + [en_title], alt_he_titles + [he_title]), ('en', 'he')):
            if title_adder:
                new_alt_titles = [title_adder(lang, alt_title) for alt_title in alt_title_list]
                alt_title_list += list(filter(None, new_alt_titles))
            if title_modifier:
                alt_title_list[:] = [title_modifier(lang, t) for t in alt_title_list]
        # make unique
        alt_en_titles = list(set(alt_en_titles))
        alt_he_titles = list(set(alt_he_titles))
        term = self.create_term(en=en_title, he=he_title, context=context, alt_en=alt_en_titles, alt_he=alt_he_titles)
        if isinstance(obj, Term):
            self.old_term_map[obj.name] = term
        return term


class LinkerCategoryConverter:
    """
    Manager which handles converting all indexes in a category or corpus.
    """

    def __init__(self, title, is_corpus=False, is_index=False, include_dependant=False, **linker_index_converter_kwargs):
        index_getter = library.get_indexes_in_corpus if is_corpus else library.get_indexes_in_category
        self.titles = [title] if is_index else index_getter(title, include_dependant=include_dependant)
        self.linker_index_converter_kwargs = linker_index_converter_kwargs

    def convert(self):
        for title in self.titles:
            index_converter = LinkerIndexConverter(title, **self.linker_index_converter_kwargs)
            index_converter.convert()


class LinkerCommentaryConverter:
    """
    Handles conversion of all commentaries on a base text
    """

    def __init__(self, base_text_title, get_match_template_suffixes, get_commentary_term, **linker_index_converter_kwargs):
        self.titles = [index.title for index in IndexSet({"base_text_titles": base_text_title})]
        self.linker_index_converter_kwargs = linker_index_converter_kwargs
        self.get_match_template_suffixes = get_match_template_suffixes
        self.get_commentary_term = get_commentary_term
        self.get_match_templates_inner = linker_index_converter_kwargs['get_match_templates']
        base_index = library.get_index(base_text_title)
        linker_index_converter_kwargs['get_match_templates'] = partial(self.get_match_templates_wrapper, base_index)

    def get_match_templates_wrapper(self, base_index, node, depth, isibling, num_siblings, is_alt_node):
        if self.get_match_templates_inner:
            match_templates = self.get_match_templates_inner(base_index, node, depth, isibling, num_siblings, is_alt_node)
            if match_templates is not None:
                return match_templates

        # otherwise, use default implementation
        if is_alt_node or not node.is_root(): return "NO-OP"
        try: comm_term = self.get_commentary_term(node.index.collective_title)
        except: return "NO-OP"
        if comm_term is None: return "NO-OP"
        if self.get_match_template_suffixes is None: return "NO-OP"

        match_templates = [template.clone() for template in self.get_match_template_suffixes(base_index)]
        for template in match_templates:
            template.term_slugs = [comm_term.slug] + template.term_slugs
        return match_templates

    def convert(self):
        for title in self.titles:
            index_converter = LinkerIndexConverter(title, **self.linker_index_converter_kwargs)
            index_converter.convert()


class DiburHamatchilAdder:
    """
    Handles extraction of dibur hamatchils from indexes and saves them to dibur_hamatchils collection
    """

    BOLD_REG = "^<b>(.+?)</b>"
    DASH_REG = '^(.+?)[\-–]'

    def __init__(self):
        self.indexes_with_dibur_hamatchils = []
        self.dh_reg_map = {
            "Rashi|Bavli": [self.DASH_REG, '\.(.+?)$', "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "Ran|Bavli": [self.DASH_REG, "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
            "Tosafot|Bavli": [self.DASH_REG, "^(?:(?:מתני'|גמ')\s?)?(.+)$"],
        }
        self._dhs_to_insert = []

    def get_dh_regexes(self, collective_title, context=None, use_default_reg=True):
        if collective_title is None:
            return
        key = collective_title + ("" if context is None else f"|{context}")
        dh_reg = self.dh_reg_map.get(key)
        if not dh_reg and use_default_reg:
            return [self.BOLD_REG, self.DASH_REG]
        return dh_reg

    def add_index(self, index):
        self.indexes_with_dibur_hamatchils += [index]

    @staticmethod
    def get_dh(s, regexes, oref):
        matched_reg = False
        s = s.strip()
        for reg in regexes:
            match = re.search(reg, s)
            if not match: continue
            matched_reg = True
            s = match.group(1)
        if not matched_reg: return
        s = s.strip()
        s = unicodedata.normalize('NFKD', s)
        s = strip_cantillation(s, strip_vowels=True)
        s = re.sub(r"[.,:;\-–]", "", s)
        words = s.split()
        return " ".join(words[:5])  # DH is unlikely to give more info if longer than 5 words

    def get_container_refs(self, title, segment_ref, perek_refs):
        curr_ref = segment_ref.top_section_ref()
        container_refs = [title]
        is_first = True
        for section, is_referenceable in zip(segment_ref.sections[:-1], getattr(segment_ref.index_node, "referenceableSections", [True]*len(segment_ref.sections))[:-1]):
            if is_first:
                # avoid issues with default nodes. start at top_section_ref()
                is_first = False
            else:
                curr_ref = curr_ref.subref(section)
            if is_referenceable:
                container_refs += [curr_ref.normal()]
        perek_ref = None
        for temp_perek_ref in perek_refs:
            assert isinstance(temp_perek_ref, Ref)
            if temp_perek_ref.contains(segment_ref):
                perek_ref = temp_perek_ref
                break
        if perek_ref:
            container_refs += [perek_ref.normal()]

        return container_refs

    def add_dh_for_seg(self, perek_refs, title, segment_text, en_tref, he_tref, version):
        try:
            oref = Ref(en_tref)
        except:
            print("not a valid ref", en_tref)
            return
        if not getattr(oref.index_node, "diburHamatchilRegexes", None): return
        dh = self.get_dh(segment_text, oref.index_node.diburHamatchilRegexes, oref)
        if not dh: return
        container_refs = self.get_container_refs(title, oref, perek_refs)
        self._dhs_to_insert += [
            {
                "dibur_hamatchil": dh,
                "container_refs": container_refs,
                "ref": en_tref
            }
        ]

    def add_dibur_hamatchil_to_index(self, index):

        index = Index().load({"title": index.title})  # reload index to make sure perek nodes are correct
        perek_refs = []
        for perek_node in index.get_alt_struct_leaves():
            perek_ref = Ref(perek_node.wholeRef)
            perek_refs += [perek_ref]

        versions = VersionSet({"title": index.title, "language": "he"}).array()
        if len(versions) == 0:
            print("No versions for", index.title, ". Can't search for DHs.")
            return
        primary_version = versions[0]
        action = partial(self.add_dh_for_seg, perek_refs, index.title)
        primary_version.walk_thru_contents(action)

    def add_all_dibur_hamatchils(self):
        db.dibur_hamatchils.delete_many({})
        for index in tqdm(self.indexes_with_dibur_hamatchils, desc='add dibur hamatchils'):
            self.add_dibur_hamatchil_to_index(index)
        db.dibur_hamatchils.bulk_write([InsertOne(d) for d in self._dhs_to_insert])


class LinkerIndexConverter:
    """
    Handles conversion of single Index to Linker.v3 format
    """

    def __init__(self, title, get_other_fields=None, get_match_templates=None, get_alt_structs=None,
                 fast_unsafe_saving=True, get_commentary_match_templates=None, get_commentary_other_fields=None,
                 get_commentary_match_template_suffixes=None, get_commentary_alt_structs=None, get_commentary_term=None):
        """

        @param title: title of index to convert
        @param get_other_fields: function of form
            (node: SchemaNode, depth: int, isibling: int, num_siblings: int, is_alt_node: bool) -> dict.
            Returns a dict where keys are other fields to modify. These can be any valid key on `node`
            Some common examples are below. Many of them are documented at the top of this file.
                - isSegmentLevelDiburHamatchil
                - referenceableSections
                - diburHamatchilRegexes
                - numeric_equivalent
                - ref_resolver_context_swaps
            Can return None for any of these
            See top of file for documentation for these fields
        @param get_match_templates:
            function of form
                (node: SchemaNode, depth: int, isibling: int, num_siblings: int, is_alt_node: bool) -> List[MatchTemplate].
            Callback that is run on every node in index including alt struct nodes. Receives callback params as specified above.
            Needs to return a list of MatchTemplate objects corresponding to that node.
        @param get_alt_structs:
            function of form
                (index: Index) -> Dict[String, TitledTreeNode]
            Returns a dict with keys being names of new alt struct and values being alt struct root nodes
        @param get_commentary_match_templates:
            function of form
                (index: Index) -> List[MatchTemplate]
            Callback that is run on every commentary index of this base text.
            Return value is equivalent to that of `get_match_templates()`
        @param get_commentary_other_fields:
            function of form
                (index: Index) -> dict
            Callback that is run on every commentary index of this base text.
            Return value is equivalent to that of `get_other_fields()`
        @param fast_unsafe_saving: If true, skip Python dependency checks and save directly to Mongo (much faster but potentially unsafe)
        """
        self.index = library.get_index(title)
        self.get_other_fields = get_other_fields
        self.get_match_templates = get_match_templates
        self.get_alt_structs = get_alt_structs
        self.get_commentary_match_templates = get_commentary_match_templates
        self.get_commentary_other_fields = get_commentary_other_fields
        self.get_commentary_match_template_suffixes = get_commentary_match_template_suffixes
        self.get_commentary_alt_structs = get_commentary_alt_structs
        self.get_commentary_term = get_commentary_term
        self.fast_unsafe_saving = fast_unsafe_saving

    @staticmethod
    def _traverse_nodes(node, callback, depth=0, isibling=0, num_siblings=0, is_alt_node=False, **kwargs):
        callback(node, depth, isibling, num_siblings, is_alt_node, **kwargs)
        [LinkerIndexConverter._traverse_nodes(child, callback, depth + 1, jsibling, len(node.children), is_alt_node, **kwargs) for (jsibling, child) in enumerate(node.children)]

    def _update_lengths(self):
        if self.index.is_complex(): return
        sn = StateNode(self.index.title)
        ac = sn.get_available_counts("he")
        # really only outer shape is checked. including rest of shape even though it's technically only a count of what's available and skips empty sections
        shape = sn.var('all', 'shape')
        outer_shape = shape if isinstance(shape, int) else len(shape)
        if getattr(self.index, 'dependence', None) == 'Commentary' and getattr(self.index, 'base_text_titles', None):
            if self.index.base_text_titles[0] == 'Shulchan Arukh, Even HaEzer':
                outer_shape = 178
            else:
                sn = StateNode(self.index.base_text_titles[0])
                shape = sn.var('all', 'shape')
                base_outer_shape = shape if isinstance(shape, int) else len(shape)
                if base_outer_shape > outer_shape:
                    outer_shape = base_outer_shape
        self.index.nodes.lengths = [outer_shape] + ac[1:]

    def convert(self):
        if self.get_alt_structs:
            alt_struct_dict = self.get_alt_structs(self.index)
            if alt_struct_dict:
                for name, root in alt_struct_dict.items():
                    self.index.set_alt_structure(name, root)
        self._traverse_nodes(self.index.nodes, self.node_visitor, is_alt_node=False)
        alt_nodes = self.index.get_alt_struct_leaves()
        for inode, node in enumerate(alt_nodes):
            self.node_visitor(node, 1, inode, len(alt_nodes), True)
        self._update_lengths()  # update lengths for good measure
        if self.get_commentary_match_templates or self.get_commentary_match_template_suffixes or self.get_commentary_other_fields:
            temp_get_comm_fields = partial(self.get_commentary_other_fields, self.index) \
                if self.get_commentary_other_fields else None
            temp_get_alt_structs = partial(self.get_commentary_alt_structs, self.index) \
                if self.get_commentary_alt_structs else None
            comm_converter = LinkerCommentaryConverter(self.index.title, self.get_commentary_match_template_suffixes,
                                                       self.get_commentary_term,
                                                       get_match_templates=self.get_commentary_match_templates,
                                                       get_other_fields=temp_get_comm_fields,
                                                       get_alt_structs=temp_get_alt_structs)
            comm_converter.convert()
        self.save_index()

    def save_index(self):
        if self.fast_unsafe_saving:
            props = self.index._saveable_attrs()
            db.index.replace_one({"_id": self.index._id}, props, upsert=True)
        else:
            self.index.save()

    def node_visitor(self, node, depth, isibling, num_siblings, is_alt_node):
        if self.get_match_templates:
            templates = self.get_match_templates(node, depth, isibling, num_siblings, is_alt_node)
            if templates == "NO-OP":
                pass
            elif templates is not None:
                node.match_templates = [template.serialize() for template in templates]
            else:
                # None
                try:
                    delattr(node, 'match_templates')
                except:
                    pass

        if self.get_other_fields:
            other_fields_dict = self.get_other_fields(node, depth, isibling, num_siblings, is_alt_node)
            if other_fields_dict is not None:
                for key, val in other_fields_dict.items():
                    if val is None: continue
                    setattr(node, key, val)
