# -*- coding: utf-8 -*-

__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.helper.schema import *

if __name__ == "__main__":
    texts = ["Esther Rabbah", "Ruth Rabbah", "Eichah Rabbah"]
    for text in texts:
        i = library.get_index(text)
        convert_simple_index_to_complex(i)
        i = library.get_index(text)
        parent = i.nodes
        new_node = JaggedArrayNode()
        new_node.add_structure(["Paragraph"])
        new_node.add_primary_titles("Petichta", "פתיחתא")
        insert_first_child(new_node, parent)
