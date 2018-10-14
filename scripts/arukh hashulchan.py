#encoding=utf-8
from sefaria.helper.schema import migrate_to_complex_structure
import django
django.setup()
from sefaria.model import *
if __name__ == "__main__":
    mapping = {
        "Aruch HaShulchan 1": "Aruch HaShulchan, Orach Chaim",
        "Aruch HaShulchan 2": "Aruch HaShulchan, Yoreh De'ah",
        "Aruch HaShulchan 3": "Aruch HaShulchan, Even HaEzer",
        "Aruch HaShulchan 4": "Aruch HaShulchan, Choshen Mishpat"
    }
    root = SchemaNode()
    root.add_primary_titles("Aruch HaShulchan", u"ערוך השולחן")
    nodes = [("Orach Chaim", u"אורח חיים"), ("Yoreh De'ah", u"יורה דעה"), ("Even HaEzer", u"אבן העזר"), ("Choshen Mishpat", u"חושן משפט")]
    for node in nodes:
        if nodes[0] == "Even HaEzer":
            default_node = JaggedArrayNode()
            default_node.key = "default"
            default_node.default = True
            default_node.add_structure(["Siman", "Paragraph"])
            root.append(default_node)
            children = ["סדר הגט / Seder HaGet",
"סדר חליצה / Seder Chalitza"]
            for child in children:
                he, en = child.split(" / ")
                ja_node = JaggedArrayNode()
                ja_node.add_primary_titles(en, he)
                ja_node.add_structure(["Paragraph"])
                root.append(ja_node)
        else:
            ja_node = JaggedArrayNode()
            ja_node.add_primary_titles(node[0], node[1])
            ja_node.key = node[0]
            ja_node.add_structure(["Siman", "Paragraph"])
            ja_node.depth = 2
        root.append(ja_node)
    schema = root.serialize()
    index = {"title": "Aruch HaShulchan", "schema": schema, "categories": ["Halakhah"]}

    migrate_to_complex_structure("Aruch HaShulchan", schema, mapping)
    aruch = library.get_index("Aruch HaShulchan")
    aruch.set_title("Arukh HaShulchan", "en")
    aruch.save()