# encoding=utf-8
"""
Talmud alt-struct can display chapters, but does not display the dappim within the chapters. Setting the
includeSections field on an ArrayMapNode with refs is not effective, as this field essentially populates those
refs. The objective of this script is to migrate the simple depth 1 ArrayMapNodes on Talmud tractates to a complex
alt-struct with multiple ArrayMapNodes, one for each chapter
"""

from sefaria.model import *
import csv


def construct_names_dict():
    names = {}
    with open('../data/perek_names.csv') as infile:
        reader = csv.reader(infile)
        for line in reader:
            trac_name = line[0].replace('_', ' ')
            if trac_name in names:
                names[trac_name].append(line[2])
            else:
                names[trac_name] = [line[2]]
    return names


def build_schema(ref_list, chapter_names):
    assert len(ref_list) == len(chapter_names)

    root = TitledTreeNode()

    for index, ref in enumerate(ref_list):
        node = ArrayMapNode()
        node.add_title('Chapter {}'.format(index+1), 'en', primary=True)
        node.add_title(chapter_names[index], 'he', primary=True)
        node.depth = 0
        node.wholeRef = ref
        node.includeSections = True
        root.append(node)
    return root

tractate_names = library.get_indexes_in_category('Bavli')
chapter_names = construct_names_dict()
for name in tractate_names:
    print(name)
    tractate = library.get_index(name)
    map_node = tractate.get_alt_structure('Chapters')
    schema_node = build_schema(map_node.refs, chapter_names[name])
    schema_node.title_group = tractate.nodes.title_group
    schema_node.validate()
    tractate.set_alt_structure('Chapters', schema_node)
    tractate.save()
