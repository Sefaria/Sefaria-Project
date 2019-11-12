# -*- coding: utf-8 -*-

__author__ = 'stevenkaplan'
if __name__ == "__main__":
    from sefaria.helper.schema import *
    convert_simple_index_to_complex(library.get_index("Ibn Ezra on Isaiah"))
    parent_node = library.get_index("Ibn Ezra on Isaiah").nodes
    prelude = JaggedArrayNode()
    prelude.add_structure(["Paragraph"])
    prelude.add_primary_titles("Prelude", "פתיחה")
    insert_first_child(prelude, parent_node)
    addenda = JaggedArrayNode()
    addenda.add_primary_titles("Addenda", "הוספות")
    addenda.add_structure(["Paragraph"])
    insert_last_child(addenda, parent_node)
    translator = JaggedArrayNode()
    translator.add_structure(["Paragraph"])
    translator.add_primary_titles("Translators Foreword", "הקדמת המתרגם")
    insert_last_child(translator, parent_node)
    library.get_index("Ibn Ezra on Isaiah").save()