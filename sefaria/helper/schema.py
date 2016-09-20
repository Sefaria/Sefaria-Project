# -*- coding: utf-8 -*-

from sefaria.model import *
import re

"""
Experimental
These utilities have been used a few times, but are still rough.

To get the existing schema nodes to pass into these functions, easiest is likely:
Ref("...").index_node


Todo:
    Clean system from old refs:
        links to commentary
        transx reqs
        elastic search
        varnish
"""


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
    vsc = [v for v in library.get_commentary_versions_on_book(index.title)]
    for v in vs + vsc:
        pc = v.content_node(parent_node)
        pc[new_node.key] = new_node.create_skeleton()
        v.save(override_dependencies=True)

    # Update Index schema and save
    parent_node.children.insert(place, new_node)
    new_node.parent = parent_node

    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)


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
    vsc = [v for v in library.get_commentary_versions_on_book(index.title)]
    for v in vs + vsc:
        assert isinstance(v, Version)
        pc = v.content_node(parent)
        del pc[node.key]
        v.save(override_dependencies=True)

    parent.children = [n for n in parent.children if n.key != node.key]

    index.save(override_dependencies=True)
    library.rebuild()
    refresh_version_state(index.title)


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
    vsc = [v for v in library.get_commentary_versions_on_book(index.title)]
    for v in vs + vsc:
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


def change_parent(node, new_parent, place=0):
    """
    :param node:
    :param new_parent:
    :param place: The index of the child before which to insert, so place=0 inserts at the front of the list, and place=len(parent_node.children) inserts at the end
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
    vsc = [v for v in library.get_commentary_versions_on_book(index.title)]
    for v in vs + vsc:
        assert isinstance(v, Version)
        old_parent_content = v.content_node(old_parent)
        content = old_parent_content.pop(node.key)
        new_parent_content = v.content_node(new_parent)
        new_parent_content[node.key] = content
        v.save(override_dependencies=True)

    old_parent.children = [n for n in old_parent.children if n.key != node.key]
    new_parent.children.insert(place, node)
    node.parent = new_parent
    new_normal_form = node.ref().normal()

    index.save(override_dependencies=True)
    library.rebuild()

    for link in linkset:
        link.refs = [ref.replace(old_normal_form, new_normal_form) for ref in link.refs]
        link.save()
    # todo: commentary linkset

    refresh_version_state(index.title)


def refresh_version_state(base_title):
    """
    ** VersionState is *not* altered on Index save.  It is only created on Index creation.
    ^ It now seems that VersionState is referenced on Index save

    VersionState is *not* automatically updated on Version save.
    The VersionState update on version save happens in texts_api().
    VersionState.refresh() assumes the structure of content has not changed.
    To regenerate VersionState, we save the flags, delete the old one, and regenerate a new one.
    """
    vtitles = library.get_commentary_version_titles_on_book(base_title) + [base_title]
    for title in vtitles:
        vs = VersionState(title)
        flags = vs.flags
        vs.delete()
        VersionState(title, {"flags": flags})


def replaceBadNodeTitles(title, bad_char, good_char):
    '''
    This recurses through the serialized tree changing replacing the previous title of each node to its title with the bad_char replaced by good_char. 
    '''
    def recurse(node):
        if 'nodes' in node:
            for each_one in node['nodes']:
                recurse(each_one)
        elif 'default' not in node:
            node['title'] = node['title'].replace(bad_char, good_char)
            if node['titles'][0]['lang']:
                node['titles'][0]['text'] = node['titles'][0]['text'].replace(bad_char, good_char)

    data = library.get_index(title).nodes.serialize()
    recurse(data)
    return data


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

    old_structure = ja_node.sectionNames
    delta = len(section_names) - len(old_structure)
    if upsize_in_place:
        assert (delta > 0)

    if address_types is None:
        address_types = ['Integer'] * len(section_names)
    else:
        assert len(address_types) == len(section_names)

    ja_node.sectionNames = section_names
    ja_node.addressTypes = address_types
    ja_node.depth = len(section_names)
    index = ja_node.index
    index.save(override_dependencies=True)

    vs = [v for v in index.versionSet()]
    vsc = [v for v in library.get_commentary_versions_on_book(index.title)]
    for v in vs + vsc:
        assert isinstance(v, Version)
        if v.get_index() == index:
            chunk = TextChunk(ja_node.ref(), lang=v.language, vtitle=v.versionTitle)
        else:
            ref_name = ja_node.ref().uid()
            ref_name = ref_name.replace(index.title, v.get_index().title)
            chunk = TextChunk(Ref(ref_name), lang=v.language, vtitle=v.versionTitle)
        ja = chunk.ja()

        if upsize_in_place or ja.get_depth() == 0:
            wrapper = chunk.text
            for i in range(delta):
                wrapper = [wrapper]
            chunk.text = wrapper
            chunk.save()

        else:
            ja.resize(delta)
            chunk.text = ja.array()
            chunk.save()

    library.rebuild()
    refresh_version_state(index.title)

    def fix_link(ref_string):

        if delta == 0:
            return ref_string

        r = Ref(ref_string)
        if delta < 0:
            for i in range(delta):
                if len(r.sections) == 0:
                    break
                r.sections.pop()
                if r.is_range():
                    r.toSections.pop()

        elif upsize_in_place:
            for i in range(delta):
                r.sections.insert(0, 1)
                if r.is_range():
                    r.toSections.insert(0, 1)
        else:
            for i in range(delta):
                r.sections.append(1)
                if r.is_range():
                    r.toSections.append(1)
        if r.is_range():
            return '{}.{}-{}'.format(r.book,
                                     '.'.join([str(i) for i in r.sections]), '.'.join([str(i) for i in r.toSections],))
        else:
            return '{}.{}'.format(r.book, '.'.join([str(i) for i in r.sections]))

    reg = re.compile(ja_node.ref().base_text_and_commentary_regex())
    ls = LinkSet({'refs': {'$in': [reg]}})
    for l in ls:
        for ref_index, ref in enumerate(l.refs):
            if reg.match(ref):
                l.refs[ref_index] = fix_link(ref)
        l.save()
    # Todo: Handle alt-structs, sheets, history

