# -*- coding: utf-8 -*-

from sefaria.helper.text import *
from sefaria.helper.schema import insert_first_child, convert_simple_index_to_complex

i = library.get_index("Sefer HaChinuch")
convert_simple_index_to_complex(i)

i = library.get_index("Sefer HaChinuch")
root = i.nodes

n = JaggedArrayNode()
n.key = "Opening Letter by the Author"
n.add_title("Opening Letter by the Author", "en", primary=True)
n.add_title("איגרת המחבר", "he", primary=True)
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]

insert_first_child(n, root)

n = JaggedArrayNode()
n.key = "Author's Introduction"
n.add_title("Author's Introduction", "en", primary=True)
n.add_title("הקדמת המחבר", "he", primary=True)
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]

insert_first_child(n, root)

# while we're at it, let's nail some more.
convert_simple_index_to_complex(library.get_index('Seder Olam Rabbah'))
convert_simple_index_to_complex(library.get_index('Eight Chapters'))
