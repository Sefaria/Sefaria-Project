from sefaria.model import *
from sefaria.helper.schema import *
if __name__ == "__main__":
    index = library.get_index("Pesach Haggadah Edot Hamizrah")
    node = index.nodes.children[-1]
    assert node.get_titles('en')[0] == "Nirtzah"
    chad_gadya = node.children[-1]
    echad_mi_yodeya = node.children[-2]
    acceptable_titles = ["Chad Gadya", "Echad Mi Yodea"]
    assert chad_gadya.get_titles("en")[0] in acceptable_titles
    assert echad_mi_yodeya.get_titles('en')[0] in acceptable_titles
    for grandchild in node.children:
        if grandchild.get_titles('en')[0] not in acceptable_titles:
            print("Removing {}".format(grandchild))
            remove_branch(grandchild)

    print("Changing order in Nirtzah")
    reorder_children(node, ["Chad Gadya", "Echad Mi Yodea"])

