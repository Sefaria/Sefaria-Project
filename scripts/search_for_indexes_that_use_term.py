import django
django.setup()
from sefaria.model import *

def iterateNodes(indices, searchTerm=""):
    for index in indices:
        # default nodes
        nodes = index.nodes.all_children()
        nodeSearcher(nodes, searchTerm, index.title)

        # alt struct nodes
        if index.get_alt_structures():
            nodes = index.get_alt_struct_leaves()
            nodeSearcher(nodes, searchTerm, index.title)


def nodeSearcher(nodes, searchTerm, index_title):
    for node in nodes:
        if getattr(node, "sharedTitle"):
            if node.sharedTitle == searchTerm:
                print("'{}' uses term '{}'".format(index_title, searchTerm))
                return


if __name__ == "__main__":
    indices = library.all_index_records()
    iterateNodes(indices, searchTerm="Hatam Sofer")