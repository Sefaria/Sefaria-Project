__author__ = 'stevenkaplan'
from sefaria.model import *
from sefaria.helper.schema import *


def change_title(title):
    vol1 = library.get_index(title).nodes.children[0]
    vol2 = library.get_index(title).nodes.children[1]
    positive_he = "עשין"
    negative_he = "לאוין"
    change_node_title(vol1, vol1.primary_title("en"), "en", "Negative Commandments")
    change_node_title(vol2, vol2.primary_title("en"), "en", "Positive Commandments")
    change_node_title(vol1, vol1.primary_title("he"), "he", negative_he)
    change_node_title(vol2, vol2.primary_title("he"), "he", positive_he)


def add_rabbinic(title):
    index = library.get_index(title)
    root = index.nodes
    rabbinic_nodes = index.nodes.children[1].children[1:]
    rabbinic_vol = SchemaNode()
    rabbinic_vol.add_primary_titles("Rabbinic Commandments",  "עשין דרבנן")
    for r_count in range(len(rabbinic_nodes)):
        en_name = [x["text"] for x in rabbinic_nodes[r_count].get_titles_object() if x["primary"] == True and x["lang"] == "en"][0]
        he_name = [x["text"] for x in rabbinic_nodes[r_count].get_titles_object() if x["primary"] == True and x["lang"] == "he"][0]
        new_node = JaggedArrayNode()
        new_node.add_primary_titles(en_name, he_name)
        new_node.add_structure(["Paragraph"])
        rabbinic_vol.append(new_node)
        rabbinic_vol.validate()

    attach_branch(rabbinic_vol, root, place=2)
    refresh_version_state(title)



def change_rabbinic_refs(title):
    def needs_rewrite(ref_string, *args):
        ref_string = ref_string.replace("SeMaG", "Sefer Mitzvot Gadol")
        return ref_string.startswith("Sefer Mitzvot Gadol, Positive Commandments,")

    def rewriter(ref_string):
        return ref_string.replace("Positive Commandments", "Rabbinic Commandments")

    cascade("Sefer Mitzvot Gadol, Positive Commandments", rewriter=rewriter, needs_rewrite=needs_rewrite)


def add_intro(title):
    root = library.get_index(title).nodes
    for i in range(2):
        intro = JaggedArrayNode()
        remazim = JaggedArrayNode()

        intro.add_primary_titles("Introduction", "הקדמה")
        remazim.add_primary_titles("Remazim", "רמזים")
        intro.add_structure(["Paragraph"])
        remazim.add_structure(["Paragraph"])

        intro.key = "intro" + str(i)
        remazim.key = "remazim" + str(i)

        attach_branch(intro, root.children[i])
        attach_branch(remazim, root.children[i], place=1)


def remove_nodes(title):
    index = library.get_index(title)
    rabbinic_nodes = index.nodes.children[1].children[1:]
    for node in rabbinic_nodes:
        print(node)
        remove_branch(node)


if __name__ == "__main__":
    title = "Sefer Mitzvot Gadol"

    change_title(title)

    add_rabbinic(title)
    change_rabbinic_refs(title)
    remove_nodes(title)

    vol1 = library.get_index(title).nodes.children[0]
    convert_jagged_array_to_schema_with_default(vol1)
    add_intro(title)