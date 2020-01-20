__author__ = 'stevenkaplan'
from sefaria.helper.schema import change_node_structure
from sefaria.model import *
i = library.get_index("Complex Midrash Tanchuma")
nodes = i.nodes.children
for count, node in enumerate(nodes):
    print(node)
    if count < 2 or node._full_title['en'].find("Footnotes") >= 0:
        continue
    new_names = ["Siman", "Paragraph"]
    change_node_structure(node, new_names)
