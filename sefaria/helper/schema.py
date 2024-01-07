# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from sefaria.sheets import save_sheet
from sefaria.utils.util import list_depth, traverse_dict_tree

import re

"""

To get the existing schema nodes to pass into these functions, easiest is likely:
Ref("...").index_node


Todo: (still?)
    Clean system from old refs:
        links to commentary
        transx reqs
        elastic search
        varnish
"""


def handle_dependant_indices(title):
    """
    A generic method for handling dependant commentaries for methods in this package
    :param title: Title of book being changed
    """
    dependant_indices = library.get_dependant_indices(title, dependence_type='commentary', structure_match=True,
                                                      full_records=True)
    if len(dependant_indices) == 0:
        return

    print("{}Warning! Commentary linking will be removed for {} texts{}".\
        format('\033[93m', len(dependant_indices), '\033[0m'))  # The text prints in yellow

    for record in dependant_indices:
        record.base_text_mapping = None
        record.save()


def insert_last_child(new_node, parent_node):
    return attach_branch(new_node, parent_node, len(parent_node.children))


def insert_first_child(new_node, parent_node):
    return attach_branch(new_node, parent_node, 0)


def attach_branch(new_node, parent_node, place=0):
    """
    :param new_node: A schema node tree to attach
    :param parent_node: The parent to attach it to
    :param place: The index of the child before which to insert, so place=0 inserts at the front of the list, and place=len(parent_node.children) inserts at the end
    :return:
    """
    assert isinstance(new_node, SchemaNode)
    assert isinstance(parent_node, SchemaNode)
    assert place <= len(parent_node.children)

    index = parent_node.index

    # Add node to versions & commentary versions
    vs = [v for v in index.versionSet()]
    for v in vs:
        pc = v.content_node(parent_node)
        pc[new_node.key] = new_node.create_skeleton()
        v.save(override_dependencies=True)

    # Update Index schema and save
    parent_node.children.insert(place, new_node)
    new_node.parent = parent_node
    new_node.index = parent_node.index

    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)

    handle_dependant_indices(index.title)


def remove_branch(node):
    """
    This will delete any text in `node`
    :param node: SchemaNode to remove
    :return:
    """
    assert isinstance(node, SchemaNode)
    parent = node.parent
    assert parent
    index = node.index

    node.ref().linkset().delete()
    # todo: commentary linkset

    vs = [v for v in index.versionSet()]
    for v in vs:
        assert isinstance(v, Version)
        pc = v.content_node(parent)
        del pc[node.key]
        v.save(override_dependencies=True)

    parent.children = [n for n in parent.children if n.key != node.key]

    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)

    handle_dependant_indices(index.title)


def reorder_children(parent_node, new_order):
    """
    :param parent_node:
    :param new_order: List of child keys, in their new order
    :return:
    """
    # With this one, we can get away with just an Index change
    assert isinstance(parent_node, SchemaNode)
    child_dict = {n.key: n for n in parent_node.children}
    assert set(child_dict.keys()) == set(new_order)
    parent_node.children = [child_dict[k] for k in new_order]
    parent_node.index.save()


def merge_default_into_parent(parent_node):
    """
    In a case where a parent has only one child - a default child - this merges the two together into one Jagged Array node.

    Example Usage:
    >>> r = Ref('Mei HaShiloach, Volume II, Prophets, Judges')
    >>> merge_default_into_parent(r.index_node)

    :param parent_node:
    :return:
    """
    assert isinstance(parent_node, SchemaNode)
    assert len(parent_node.children) == 1
    assert parent_node.has_default_child()
    default_node = parent_node.get_default_child()
    # assumption: there's a grandparent.  todo: handle the case where the parent is the root node of the schema
    is_root = True
    if parent_node.parent:
        is_root = False
        grandparent_node = parent_node.parent
    index = parent_node.index

    # Repair all versions
    vs = [v for v in index.versionSet()]
    for v in vs:
        assert isinstance(v, Version)
        if is_root:
            v.chapter = v.chapter["default"]
        else:
            grandparent_version_dict = v.sub_content(grandparent_node.version_address())
            grandparent_version_dict[parent_node.key] = grandparent_version_dict[parent_node.key]["default"]
        v.save(override_dependencies=True)

    # Rebuild Index
    new_node = JaggedArrayNode()
    new_node.key = parent_node.key
    new_node.title_group = parent_node.title_group
    new_node.sectionNames = default_node.sectionNames
    new_node.addressTypes = default_node.addressTypes
    new_node.depth = default_node.depth
    if is_root:
        index.nodes = new_node
    else:
        grandparent_node.children = [c if c.key != parent_node.key else new_node for c in grandparent_node.children]

    # Save index and rebuild library
    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)

    handle_dependant_indices(index.title)


# todo: Can we share code with this method and the next?
def convert_jagged_array_to_schema_with_default(ja_node):
    from sefaria.model.schema import TitleGroup

    assert isinstance(ja_node, JaggedArrayNode)
    assert len(ja_node.children) == 0
    parent = ja_node.parent
    assert parent, "Use convert_simple_index_to_complex instead."
    assert isinstance(parent, SchemaNode)
    index = ja_node.index

    vs = [v for v in index.versionSet()]
    for v in vs:
        assert isinstance(v, Version)
        old_parent_content = v.content_node(parent)
        content = old_parent_content.pop(ja_node.key) # Pop old JA content off
        old_parent_content[ja_node.key] = {"default": content} # Re-add it as a default node
        v.save(override_dependencies=True)

    # Find place of ja_node in parent's children
    index_of_ja_node = parent.children.index(ja_node)

    # Build new schema
    new_parent = SchemaNode()
    new_parent.title_group = ja_node.title_group
    new_parent.key = ja_node.key
    ja_node.title_group = TitleGroup()
    ja_node.key = "default"
    ja_node.default = True

    # Rework the family tree
    new_parent.append(ja_node)
    parent.children[index_of_ja_node] = new_parent
    new_parent.parent = parent

    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)
    handle_dependant_indices(index.title)


def convert_simple_index_to_complex(index):
    """
    The target complex text will have a 'default' node.
    All refs to this text should remain good.
    :param index:
    :return:
    """
    from sefaria.model.schema import TitleGroup

    assert isinstance(index, Index)

    ja_node = index.nodes
    assert isinstance(ja_node, JaggedArrayNode)

    # Repair all version
    vs = [v for v in index.versionSet()]
    for v in vs:
        assert isinstance(v, Version)
        v.chapter = {"default": v.chapter}
        v.save(override_dependencies=True)

    # Build new schema
    new_parent = SchemaNode()
    new_parent.title_group = ja_node.title_group
    new_parent.key = ja_node.key
    ja_node.title_group = TitleGroup()
    ja_node.key = "default"
    ja_node.default = True

    # attach to index record
    new_parent.append(ja_node)
    index.nodes = new_parent

    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)

    handle_dependant_indices(index.title)

def prepare_ja_for_children(ja):
    """
    JaggedArrayNodes can have children. However, when creating an empty JA and attaching it to a SchemaNode via attach_branch(),
    the content_node corresponding to the JA in each Version will be an empty array. We need this to a dict so we can add children.
    """
    assert isinstance(ja, JaggedArrayNode)
    vs = [v for v in ja.index.versionSet()]
    for v in vs:
        assert isinstance(v, Version)
        content_node = v.content_node(ja)
        if isinstance(content_node, dict):
            print("JA is already prepared for children")
            return
        
        assert isinstance(content_node, list) and len(content_node) == 0, "JA's content node must be a list and be empty in order to prepare for children" 
        # convert content node to dict so it can have children (aka, IVF)
        v.sub_content(ja.version_address(), value={})
        v.save()

def change_parent(node, new_parent, place=0, exact_match=False):
    """
    :param node:
    :param new_parent:
    :param place: The index of the child before which to insert, so place=0 inserts at the front of the list, and place=len(parent_node.children) inserts at the end
    :param exact_match:  if True, if there are two links, "X" and "Y on X", changing "X" will not also change "Y on X"
    :return:
    """
    assert isinstance(node, SchemaNode)
    assert isinstance(new_parent, SchemaNode)
    assert place <= len(new_parent.children)
    old_parent = node.parent
    index = new_parent.index

    old_normal_form = node.ref().normal()
    linkset = [l for l in node.ref().linkset()]

    vs = [v for v in index.versionSet()]
    for v in vs:
        assert isinstance(v, Version)
        old_parent_content = v.content_node(old_parent)
        content = old_parent_content.pop(node.key)
        new_parent_content = v.content_node(new_parent)
        new_parent_content[node.key] = content
        v.save(override_dependencies=True)

    old_parent.children = [n for n in old_parent.children if n.key != node.key]
    new_parent.children.insert(place, node)
    node.parent = new_parent
    new_normal_form = node.ref(force_update=True).normal()

    index.save(override_dependencies=True)
    library.rebuild()

    for link in linkset:
        if exact_match:
            link.refs = [ref.replace(old_normal_form, new_normal_form) if ref.startswith(old_normal_form) else ref for ref in link.refs]
        else:
            link.refs = [ref.replace(old_normal_form, new_normal_form) for ref in link.refs]
        link.save()
    # todo: commentary linkset

    refresh_version_state(index.title)

    handle_dependant_indices(index.title)


def refresh_version_state(title):
    """
    ** VersionState is *not* altered on Index save.  It is only created on Index creation.
    ^ It now seems that VersionState is referenced on Index save

    VersionState is *not* automatically updated on Version save.
    The VersionState update on version save happens in texts_api().
    VersionState.refresh() assumes the structure of content has not changed.
    To regenerate VersionState, we save the flags, delete the old one, and regenerate a new one.
    """

    vs = VersionState(title)
    flags = vs.flags
    vs.delete()
    VersionState(title, {"flags": flags})


def change_node_title(snode, old_title, lang, new_title, ignore_cascade=False):
    """
    Changes the title of snode specified by old_title and lang, to new_title.
    If the title changing is the primary english title, cascades to all of the impacted objects
    :param snode:
    :param old_title:
    :param lang:
    :param new_title:
    :param ignore_cascade:
    :return:
    """
    def rewriter(string):
        return string.replace(old_title, new_title)

    def needs_rewrite(string, *args):
        return string.find(old_title) >= 0 and snode.index.title in string

    if old_title == snode.primary_title(lang=lang):
        snode.add_title(new_title, lang, replace_primary=True, primary=True)
        snode.index.save()
        library.refresh_index_record_in_cache(snode.index)
        if lang == 'en' and not ignore_cascade:
            cascade(snode.index.title, rewriter=rewriter, needs_rewrite=needs_rewrite)
    else:
        snode.add_title(new_title, lang)

    snode.remove_title(old_title, lang)

    snode.index.save(override_dependencies=True)
    library.refresh_index_record_in_cache(snode.index)


"""
def change_char_node_titles(index_title, bad_char, good_char, lang):
    '''
     Replaces all instances of bad_char with good_char in all node titles in the book titled index_title.
    If the title changing is the primary english title, cascades to all of the impacted objects
    :param index_title:
    :param bad_char:
    :param good_char:
    :param lang:
    :return:
    '''


    def callback(node, **kwargs):
        titles = node.get_titles_object()
        for each_title in titles:
            if each_title['lang'] == lang and 'primary' in each_title and each_title['primary']:
                title = each_title['text']

        change_node_title(snode, old_title,lang)

    root = library.get_index(index_title).nodes
    root.traverse_tree(callback, False)



    def recurse(node):
        if 'nodes' in node:
            for each_one in node['nodes']:
                recurse(each_one)
        elif 'default' not in node:

            if 'title' in node:
                node['title'] = node['title'].replace(bad_char, good_char)
            if 'titles' in node:
                which_one = -1
                if node['titles'][0]['lang'] == lang:
                    which_one = 0
                elif len(node['titles']) > 1 and node['titles'][1]['lang'] == lang:
                    which_one = 1
                if which_one >= 0:
                    node['titles'][which_one]['text'] = node['titles'][which_one]['text'].replace(bad_char, good_char)

    data = library.get_index(title).nodes.serialize()
    recurse(data)
    return data
"""


def change_node_structure(ja_node, section_names, address_types=None, upsize_in_place=False):
    """
    Updates the structure of a JaggedArrayNode to the depth specified by the length of sectionNames.

    When increasing size, any existing text will become the first segment of the new level
    ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]

    When decreasing size, information is lost as any existing segments are concatenated with " "
    [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]

    A depth 0 text (i.e. a single string or an empty list) will be treated as if upsize_in_place was set to True

    :param ja_node: JaggedArrayNode to be edited. Must be instance of class: JaggedArrayNode

    :param section_names: sectionNames parameter of restructured node. This determines the depth
    :param address_types: address_type parameter of restructured node. Defaults to ['Integer'] * len(sectionNames)

    :param upsize_in_place: If True, existing text will stay in tact, but be wrapped in new depth:
    ["One", "Two", "Three"] -> [["One", "Two", "Three"]]
    """

    assert isinstance(ja_node, JaggedArrayNode)
    assert len(section_names) > 0

    if hasattr(ja_node, 'lengths'):
        print('WARNING: This node has predefined lengths!')
        del ja_node.lengths

    # `delta` is difference in depth.  If positive, we're adding depth.
    delta = len(section_names) - len(ja_node.sectionNames)
    if upsize_in_place:
        assert (delta > 0)

    if address_types is None:
        address_types = ['Integer'] * len(section_names)
    else:
        assert len(address_types) == len(section_names)

    def fix_ref(ref_string):
        """
        Takes a string from link.refs and updates to reflect the new structure.
        Uses the delta parameter from the main function to determine how to update the ref.
        `delta` is difference in depth.  If positive, we're adding depth.
        :param ref_string: A string which can be interpreted as a valid Ref
        :return: string
        """
        if delta == 0:
            return ref_string

        d = Ref(ref_string)._core_dict()

        if delta < 0:  # Making node shallower
            for i in range(-delta):
                if len(d["sections"]) == 0:
                    break
                d["sections"].pop()
                d["toSections"].pop()

                # else, making node deeper
        elif upsize_in_place:
            for i in range(delta):
                d["sections"].insert(0, 1)
                d["toSections"].insert(0, 1)
        else:
            for i in range(delta):
                d["sections"].append(1)
                d["toSections"].append(1)

        return Ref(_obj=d).normal()


    identifier = ja_node.ref().regex(anchored=False)

    def needs_fixing(ref_string, *args):
        if re.search(identifier, ref_string) is None:
            return False
        else:
            return True

    # For downsizing, refs will become invalidated in their current state, so changes must be made before the
    # structure change.
    if delta < 0:
        cascade(ja_node.ref(), rewriter=fix_ref, needs_rewrite=needs_fixing)
        # cascade updates the index record, ja_node index gets stale
        ja_node.index = library.get_index(ja_node.index.title)

    ja_node.sectionNames = section_names
    ja_node.addressTypes = address_types
    ja_node.depth = len(section_names)
    ja_node._regexes = {}
    ja_node._init_address_classes()
    index = ja_node.index
    index.save(override_dependencies=True)
    print('Index Saved')
    library.refresh_index_record_in_cache(index)
    # ensure the index on the ja_node object is updated with the library refresh
    ja_node.index = library.get_index(ja_node.index.title)

    vs = [v for v in index.versionSet()]
    print('Updating Versions')
    for v in vs:
        assert isinstance(v, Version)

        if v.get_index() == index:
            chunk = TextChunk(ja_node.ref(), lang=v.language, vtitle=v.versionTitle)
        else:
            library.refresh_index_record_in_cache(v.get_index())
            ref_name = ja_node.ref().normal()
            ref_name = ref_name.replace(index.title, v.get_index().title)
            chunk = TextChunk(Ref(ref_name), lang=v.language, vtitle=v.versionTitle)
        ja = chunk.ja()
        if ja.get_depth() == 0:
            continue

        if upsize_in_place:
            wrapper = chunk.text
            for i in range(delta):
                wrapper = [wrapper]
            chunk.text = wrapper
            chunk.save()

        else:
            # we're going to save directly on the version to avoid weird mid change Ref bugs
            new_text = ja.resize(delta).trim_ending_whitespace().array()
            if isinstance(v.chapter, dict):  # complex text
                version_address = ja_node.version_address()
                parent = traverse_dict_tree(v.chapter, version_address[:-1])
                parent[version_address[-1]] = new_text
            else:
                v.chapter = new_text
            v.save()

    # For upsizing, we are editing refs to a structure that would not be valid till after the change, therefore
    # cascading must be performed here
    if delta > 0:
        cascade(ja_node.ref(), rewriter=fix_ref, needs_rewrite=needs_fixing)

    library.rebuild()
    refresh_version_state(index.title)

    handle_dependant_indices(index.title)


def cascade(ref_identifier, rewriter=lambda x: x, needs_rewrite=lambda *args: True, skip_history=False):
    """
    Changes to indexes requires updating any and all data that reference that index. This routine will take a rewriter
     function and run it on every location that references the updated index.
    :param ref_identifier: Ref or String that can be used to implement a ref (an Index level Ref?  Or Deeper?)
    :param rewriter: f(String)->String. callback function used to update the field.
    :param needs_rewrite: f(String, Object)->Boolean. Criteria for which a save will be triggered. If not set, routine will trigger a save for
    every item within the set
    :param skip_history: Set to True to skip history updates
    """

    def generic_rewrite(model_set, attr_name='ref', sub_attr_name=None, ):
        """
        Generic routine to take any derivative of AbstractMongoSet and update the fields outlined by attr_name using
        the callback function rewriter.

        This routine is heavily inspired by SegmentSplicer._generic_set_rewrite
        :param model_set: Derivative of AbstractMongoSet
        :param attr_name: name of attribute to update
        :param sub_attr_name: Use to update nested attributes
        :return:
        """

        for record in model_set:
            assert isinstance(record, AbstractMongoRecord)
            if sub_attr_name is None:
                refs = getattr(record, attr_name)
            else:
                intermediate_obj = getattr(record, attr_name)
                refs = intermediate_obj[sub_attr_name]

            if isinstance(refs, list):
                needs_save = False
                for ref_num, ref in enumerate(refs):
                    if needs_rewrite(ref, record):
                        needs_save = True
                        refs[ref_num] = rewriter(ref)
                if needs_save:
                    try:
                        record.save()
                    except InputError as e:
                        print('Bad Data Found: {}'.format(refs))
                        print(e)
            else:
                if needs_rewrite(refs, record):
                    if sub_attr_name is None:
                        setattr(record, attr_name, rewriter(refs))
                    else:
                        intermediate_obj[sub_attr_name] = rewriter(refs)

                    try:
                        record.save()
                    except InputError as e:
                        print('Bad Data Found: {}'.format(refs))
                        print(e)

    def clean_sheets(sheets_to_update):

        def rewrite_source(source):
            requires_save = False
            if "ref" in source:
                original_tref = source["ref"]
                try:
                    rewrite = needs_rewrite(source["ref"])
                except (InputError, ValueError) as e:
                    print('needs_rewrite method threw exception:', source["ref"], e)
                    rewrite = False
                if rewrite:
                    requires_save = True
                    try:
                        source["ref"] = rewriter(source['ref'])
                    except (InputError, ValueError) as e:
                        print('rewriter threw exception:', source["ref"], e)
                    if source["ref"] != original_tref and not Ref.is_ref(source["ref"]):
                        print('rewiter created an invalid Ref:', source["ref"])
            if "subsources" in source:
                for subsource in source["subsources"]:
                    requires_save = rewrite_source(subsource) or requires_save
            return requires_save

        for sid in sheets_to_update:
            needs_save = False
            sheet = db.sheets.find_one({"id": sid})
            if not sheet:
                print("Likely error - can't load sheet {}".format(sid))
            for source in sheet["sources"]:
                if rewrite_source(source):
                    needs_save = True
            if needs_save:
                sheet["lastModified"] = sheet["dateModified"]
                save_sheet(sheet, sheet["owner"], search_override=True)

    def update_alt_structs(index):

        assert isinstance(index, Index)
        if not index.has_alt_structures():
            return
        needs_save = False

        for name, struct in index.get_alt_structures().items():
            for map_node in struct.get_leaf_nodes():
                assert map_node.depth <= 1, "Need to write some code to handle alt structs with depth > 1!"
                wr = map_node.wholeRef
                if needs_rewrite(wr):
                    needs_save = True
                    map_node.wholeRef = rewriter(wr)
                if hasattr(map_node, 'refs'):
                    for ref_num, ref in enumerate(map_node.refs):
                        if needs_rewrite(ref):
                            needs_save = True
                            map_node.refs[ref_num] = rewriter(ref)
        if needs_save:
            index.save()

    if isinstance(ref_identifier, str):
        ref_identifier = Ref(ref_identifier)
    assert isinstance(ref_identifier, Ref)

    identifier = ref_identifier.regex(anchored=False, as_list=True)

    # titles = re.compile(identifier)

    def construct_query(attribute, queries):

        query_list = [{attribute: {'$regex': '^' + query}} for query in queries]
        return {'$or': query_list}

    print('Updating Links')
    generic_rewrite(LinkSet(construct_query('refs', identifier)), attr_name='refs')
    print('Updating Notes')
    generic_rewrite(NoteSet(construct_query('ref', identifier)))
    print('Updating User History')
    generic_rewrite(UserHistorySet(construct_query('ref', identifier)))
    print('Updating Ref Data')
    generic_rewrite(RefDataSet(construct_query('ref', identifier)))
    print('Updating Topic Links')
    generic_rewrite(RefTopicLinkSet(construct_query('ref', identifier)))
    print('Updating Garden Stops')
    generic_rewrite(GardenStopSet(construct_query('ref', identifier)))
    print('Updating Sheets')
    clean_sheets([s['id'] for s in db.sheets.find(construct_query('sources.ref', identifier), {"id": 1})])
    print('Updating Alternate Structs')
    update_alt_structs(ref_identifier.index)
    if not skip_history:
        print('Updating History')
        generic_rewrite(HistorySet(construct_query('ref', identifier), sort=[('ref', 1)]))
        generic_rewrite(HistorySet(construct_query('new.ref', identifier), sort=[('new.ref', 1)]), attr_name='new', sub_attr_name='ref')
        generic_rewrite(HistorySet(construct_query('new.refs', identifier), sort=[('new.refs', 1)]), attr_name='new', sub_attr_name='refs')
        generic_rewrite(HistorySet(construct_query('old.ref', identifier), sort=[('old.ref', 1)]), attr_name='old', sub_attr_name='ref')
        generic_rewrite(HistorySet(construct_query('old.refs', identifier), sort=[('old.refs', 1)]), attr_name='old', sub_attr_name='refs')


def generate_segment_mapping(title, mapping, output_file=None, mapped_title=lambda x: "Complex {}".format(x)):
    '''
    :param title: title of Index record
    :param mapping: mapping is a dict where each key is a reference in the original simple Index and each value is a reference in the new complex Index
    such as mapping['Zohar 1:2a'] = 'Zohar, Genesis'
    :param output_file:
    :return segment_map: segment_map is the dict based on mapping

    The function takes each key/value pair in mapping and adds this key/value pair to the segment_map,
    and it also adds every possible key/value pair that are descendants of the key/value pairs in mapping to the segment_map.
    In the above example,
    segment_map['Zohar 1:2a'] = 'Zohar, Genesis'
    segment_map['Zohar 1:2a:1'] = 'Zohar, Genesis 1'
    segment_map['Zohar 1:2a:2'] = 'Zohar, Genesis 2'
    etc.

    :return segment_map:
    '''

    segment_map = {}
    for orig_ref in mapping:
        orig_ref_str = orig_ref
        orig_ref = Ref(orig_ref)
        refs = []

        #now create an array, refs that holds the orig_ref in addition to all of its children
        if orig_ref.is_range():
            depth = orig_ref.range_depth()
            if depth == 1:
                refs = orig_ref.range_list()
            elif depth == 2:
                top_level_refs = orig_ref.split_spanning_ref()
                segment_refs = orig_ref.range_list()
                refs = top_level_refs + segment_refs
            elif depth == 3:
                top_level_refs = orig_ref.split_spanning_ref()
                section_refs = orig_ref.range_list()
                segment_refs = orig_ref.as_ranged_segment_ref().range_list()
                refs = top_level_refs + section_refs + segment_refs
        else:
            refs = orig_ref.all_subrefs()
            if len(refs) > 0 and not refs[0].is_segment_level():
                len_refs = len(refs)
                segment_refs = []
                for i in range(len_refs):
                    segment_refs += refs[i].all_subrefs()
                assert segment_refs[0].is_segment_level()
                refs += segment_refs
            refs += [orig_ref]

        #segment_value is the value of the mapping that the user inputted
        segment_value = mapped_title(mapping[orig_ref_str])

        #now iterate over the refs and create the key/value pairs to put into segment_map
        for each_ref in refs:
            assert each_ref not in segment_map, "Invalid map ranges: Two overlap at reference {}".format(each_ref)
            if each_ref == orig_ref:
                segment_map[each_ref.normal()] = segment_value
            else:
                '''
                get in_terms_of() info to construct a string that represents the complex index's new reference.
                construct the new reference by appending the results of in_terms_of() onto
                segment_value -- where segment_value is the value that the parameter, mapping, returns for the key of orig_ref
                '''
                append_arr = each_ref.in_terms_of(orig_ref)
                assert append_arr, "{} cannot be computed to be in_terms_of() {}".format(each_ref, orig_ref)
                segment_ref = Ref(segment_value)
                core_dict = segment_ref._core_dict()
                core_dict['sections'] += append_arr
                core_dict['toSections'] += append_arr

                segment_map[each_ref.normal()] = Ref(_obj=core_dict).normal()

    # output results so that this map can be used again for other purposes
    if output_file:
        with open(output_file, 'w') as output_file:
            for key in segment_map:
                output_file.write("KEY: {}, VALUE: {}".format(key, segment_map[key])+"\n")
    return segment_map


def migrate_to_complex_structure(title, schema, mappings, validate_mapping=False):
    """
    Converts book that is simple structure to complex.
    :param title: title of book
    :param schema: the new complex structure schema, must be JSON
    :param mappings: a dictionary mapping references from simple structure to references in complex structure
                    For example:
        mappings = {"Midrash Tanchuma 1:1": "Midrash Tanchuma, Bereshit",
                    "Midrash Tanchuma 1:2": "Midrash Tanchuma, Noach",
                    ...
                    "Midrash Tanchuma 2:1": "Midrash Tanchuma, Shemot"}
    :return:
    """
    def needs_rewrite(ref, *args):
        try:
            return Ref(ref).index.title == title
        except InputError:
            return False


    def rewriter(ref):
        ref = Ref(ref)
        if ref.is_range():
            start = ref.starting_ref().normal()
            end = ref.ending_ref().normal()
            if start in segment_map and end in segment_map:
                return Ref(segment_map[start]).to(Ref(segment_map[end])).normal()
            elif start in segment_map:
                return segment_map[start]
            elif end in segment_map:
                return segment_map[end]
            else:
                return "Complex {}".format(ref.normal())
        elif ref.normal() not in segment_map:
            return "Complex {}".format(ref.normal())
        else:
            return segment_map[ref.normal()]


    print("begin conversion")
    #TODO: add method on model.Index to change all 3 (title, nodes.key and nodes.primary title)

    #create a new index with a temp file #make sure to later add all the alternate titles
    old_index = Index().load({"title": title})
    new_index_contents = {
        "title": title,
        "categories": old_index.categories,
        "schema": schema
    }
    for attr in Index.optional_attrs:
        if attr == 'schema':
            continue
        elif hasattr(old_index, attr):
            new_index_contents[attr] = getattr(old_index, attr)

    #TODO: these are ugly hacks to create a temp index
    temp_index = Index(new_index_contents)
    en_title = temp_index.get_title('en')
    temp_index.title = "Complex {}".format(en_title)
    he_title = temp_index.get_title('he')
    temp_index.set_title('{} זמני'.format(he_title), 'he')
    temp_index.save()
    #the rest of the title variants need to be copied as well but it will create conflicts while the orig index exists, so we do it after removing the old index in completely_delete_index_and_related.py

    #create versions for the main text
    versions = VersionSet({'title': title})
    try:
        migrate_versions_of_text(versions, mappings, title, temp_index.title, temp_index)
    except InputError as e:
        temp_index.delete()
        print(str(e))
        raise e

    #are there commentaries? Need to move the text for them to conform to the new structure
    #basically a repeat process of the above, sans creating the index record
    #duplicate versionstate
    #TODO: untested
    vstate_old = VersionState().load({'title':title })
    vstate_new = VersionState(temp_index)
    vstate_new.flags = vstate_old.flags
    vstate_new.save()

    segment_map = generate_segment_mapping(title, mappings, "output_"+title+"_.txt")
    cascade(title, rewriter, needs_rewrite)

    handle_dependant_indices(title)

    Index().load({"title": title}).delete()

    #re-name the temporary index, "Complex ..." to the original title
    i = library.get_index("Complex {}".format(en_title))
    i.set_title(title)
    i.set_title(he_title, lang="he")
    i.save()


def migrate_versions_of_text(versions, mappings, orig_title, new_title, base_index):
    for i, version in enumerate(versions):
        print(version.versionTitle.encode('utf-8'))
        new_version_title = version.title.replace(orig_title, new_title)
        print(new_version_title)
        new_version = Version(
                {
                    "chapter": base_index.nodes.create_skeleton(),
                    "versionTitle": version.versionTitle,
                    "versionSource": version.versionSource,
                    "language": version.language,
                    "title": new_version_title
                }
            )
        for attr in ['status', 'license', 'method', 'versionNotes', 'priority', "digitizedBySefaria", "heversionSource"]:
            value = getattr(version, attr, None)
            if value:
                setattr(new_version, attr, value)
        new_version.save()
        for orig_ref in mappings:
            #this makes the mapping contain the correct text/commentary title
            orig_ref = orig_ref.replace(orig_title, version.title)
            print(orig_ref)
            orRef = Ref(orig_ref)
            tc = orRef.text(lang=version.language, vtitle=version.versionTitle)
            ref_text = tc.text

            #this makes the destination mapping contain both the correct text/commentary title
            # and have it changed to the temp index title
            dest_ref = mappings[orig_ref].replace(orig_title, version.title)
            dest_ref = dest_ref.replace(orig_title, new_title)
            print(dest_ref)

            dRef = Ref(dest_ref)
            ref_depth = dRef.range_index() if dRef.is_range() else len(dRef.sections)
            text_depth = 0 if isinstance(ref_text, str) else list_depth(ref_text) #length hack to fit the correct JA
            implied_depth = ref_depth + text_depth
            desired_depth = dRef.index_node.depth
            for i in range(implied_depth, desired_depth):
                ref_text = [ref_text]

            new_tc = dRef.text(lang=version.language, vtitle=version.versionTitle)
            new_tc.versionSource = version.versionSource
            new_tc.text = ref_text
            new_tc.save()
            VersionState(dRef.index.title).refresh()


def toc_opml():
    """Prints a simple representation of the TOC in OPML"""
    toc  = library.get_toc()

    def opml_node(node):
        if "category" in node:
            opml = '<outline text="%s">\n' % node["category"]
            for node in node["contents"]:
                opml += "    " + opml_node(node) + "\n"
            opml += '</outline>'
        else:
            opml = '<outline text="%s"></outline>\n' % node["title"]
        return opml

    opml = """
            <?xml version="1.0"?>
            <opml version="2.0">
              <body>
              %s
              </body>
            </opml>
            """ % "\n".join([opml_node(node) for node in toc])

    print(opml)


def toc_plaintext():
    """Prints a simple representation of the TOC in indented plaintext"""
    toc  = library.get_toc()

    def text_node(node, depth):
        if "category" in node:
            text = ("    " * depth) + node["category"] + "\n"
            for node in node["contents"]:
                text += text_node(node, depth+1)
        else:
            text = ("    " * depth) + node["title"] + "\n"
        return text

    text = "".join([text_node(node, 0) for node in toc])

    print(text)


def change_term_hebrew(en_primary, new_he):
    t = Term().load({"name": en_primary})
    assert t
    old_primary = t.get_primary_title("he")
    t.add_title(new_he, "he", True, True)
    t.remove_title(old_primary, "he")
    t.save()
