# -*- coding: utf-8 -*-

from sefaria.model import *
# from sefaria.tracker import add

root = SchemaNode()
root.add_title("Mekhilta d'Rabbi Shimon Bar Yochai", "en", primary=True)
root.add_title("Mekhilta d'Rabbi Shimon", "en", primary=False)
root.add_title("Mekhilta d'Rashbi", "en", primary=False)
root.add_title(u"מכילתא דרבי שמעון בר יוחאי", "he", primary=True)
root.add_title(u"מכילתא דרבי שמעון ", "he", primary=False)
root.add_title(u"מכילתא דרשב\"יָ", "he", primary=False)
root.key = "Mekhilta d'Rabbi Shimon Bar Yochai"

# Main Body of the text
main_body = JaggedArrayNode()
main_body.depth = 2
main_body.sectionNames = ["Chapter", "Verse"]
main_body.addressTypes = ["Integer", "Integer"]
main_body.default=True
main_body.key = "default"

# Additions
additions = JaggedArrayNode()
additions.add_title(u"הוספה", "he", primary=True)
additions.add_title("Additions", "en", primary=True)
additions.depth = 2
additions.sectionNames = ["Chapter", "Verse"]
additions.addressTypes = ["Integer", "Integer"]
additions.key = "Additions"

root.append(main_body)
root.append(additions)

root.validate()

indx = {
    "title": "Mekhilta d'Rabbi Shimon Bar Yochai",
    "categories": ["Midrash", "Halachic Midrash"],
    "schema": root.serialize()
}

Index(indx).save()


# Footnote Index
footnote_index = {
    "title": "Footnotes on Mekhilta d'Rabbi Shimon Bar Yochai",
    "categories": ["Commentary"]
}

Index(footnote_index).save()
