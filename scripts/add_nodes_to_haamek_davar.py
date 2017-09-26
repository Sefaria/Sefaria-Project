# encoding=utf-8

__author__ = 'stevenkaplan'
from sefaria.helper.schema import *
torah_titles = library.get_indexes_in_category("Torah")
he_torah_titles = map(lambda x: library.get_index(x).get_title("he"), torah_titles)
haamek_titles = map(lambda x: "Haamek Davar on {}".format(x), torah_titles)
he_haamek_intros = map(lambda x: u"פתיחה לספר {}".format(x), he_torah_titles)
en_haamek_intros = map(lambda x: "Introduction to {}".format(x), torah_titles)

for title in haamek_titles:
    print title
    index = library.get_index(title)
    convert_simple_index_to_complex(index)

for i in range(5):
    parent = library.get_index(haamek_titles[i]).nodes
    child = JaggedArrayNode()
    child.add_primary_titles(en_haamek_intros[i], he_haamek_intros[i])
    child.add_structure(["Paragraph"])
    print child
    print parent
    insert_first_child(child, parent)

genesis_child = JaggedArrayNode()
genesis_child.add_primary_titles("Kidmat Ha'Emek", u"קדמת העמק")
genesis_child.add_structure(["Paragraph"])
parent = library.get_index(haamek_titles[0]).nodes
insert_first_child(genesis_child, parent)

for title in haamek_titles:
    refresh_version_state(title)