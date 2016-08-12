# -*- coding: utf-8 -*-

from sefaria.helper.text import *
from sefaria.helper.schema import insert_first_child, convert_simple_index_to_complex

i = library.get_index("Sefer HaChinuch")
convert_simple_index_to_complex(i)

i = library.get_index("Sefer HaChinuch")
root = i.nodes

n = JaggedArrayNode()
n.key = "Introduction"
n.add_title("Introduction", "en", primary=True)
n.add_title(u"הקדמה", "he", primary=True)
n.depth = 2
n.sectionNames = ["Section", "Paragraph"]
n.addressTypes = ["Integer", "Integer"]

insert_first_child(n, root)