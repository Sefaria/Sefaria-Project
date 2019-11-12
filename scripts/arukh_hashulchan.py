#encoding=utf-8
import django
django.setup()
from sefaria.model import *
from sefaria.helper.schema import migrate_to_complex_structure

if __name__ == "__main__":
    mapping = {
        "Aruch HaShulchan 1": "Aruch HaShulchan, Orach Chaim",
        "Aruch HaShulchan 2": "Aruch HaShulchan, Yoreh De'ah",
        "Aruch HaShulchan 3": "Aruch HaShulchan, Even HaEzer<d>",
        "Aruch HaShulchan 4": "Aruch HaShulchan, Choshen Mishpat"
    }
    root = SchemaNode()
    root.add_primary_titles("Aruch HaShulchan", "ערוך השולחן")
    nodes = [("Orach Chaim", "אורח חיים"), ("Yoreh De'ah", "יורה דעה"), ("Even HaEzer", "אבן העזר"), ("Choshen Mishpat", "חושן משפט")]
    for node in nodes:
        if node[0] == "Even HaEzer":
            even_haezer = SchemaNode()
            even_haezer.add_primary_titles(node[0], node[1])
            even_haezer.key = node[0]
            default_node = JaggedArrayNode()
            default_node.key = "default"
            default_node.default = True
            default_node.add_structure(["Siman", "Paragraph"])
            even_haezer.append(default_node)
            children = ["סדר הגט / Seder HaGet", "סדר חליצה / Seder Chalitza"]
            for child in children:
                he, en = child.split(" / ")
                he = he.decode('utf-8')
                child = JaggedArrayNode()
                child.add_primary_titles(en, he)
                child.add_structure(["Paragraph"])
                even_haezer.append(child)
            root.append(even_haezer)
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

