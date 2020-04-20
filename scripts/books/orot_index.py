# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.tracker import add



root = SchemaNode()
root.add_title("Orot", "en", primary=True)
root.add_title("אורות", "he", primary=True)
root.key = "Orot"

part1 = SchemaNode()
part1.add_title("אורות מאופל", "he", primary=True)
part1.add_title("Lights from Darkness", "en", primary=True)
part1.key = "from darkness"

part2 = JaggedArrayNode()
part2.add_title("למהלך האידיאות בישראל", "he", primary=True)
part2.add_title("The Process of Ideals in Israel", "en", primary=True)
part2.depth = 1
part2.lengths = [6]
part2.sectionNames = ["Chapter"]
part2.addressTypes = ["Integer"]
part2.key = "ideals"

part3 = JaggedArrayNode()
part3.add_title("זרעונים", "he", primary=True)
part3.add_title("Seeds", "en", primary=True)
part3.depth = 1
part3.lengths = [8]
part3.sectionNames = ["Chapter"]
part3.addressTypes = ["Integer"]
part3.key = "seeds"

part4 = JaggedArrayNode()
part4.add_title("אורות ישראל", "he", primary=True)
part4.add_title("Lights of Israel", "en", primary=True)
part4.depth = 1
part4.lengths = [9]
part4.sectionNames = ["Chapter"]
part4.addressTypes = ["Integer"]
part4.key = "israel"

root.append(part1)
root.append(part2)
root.append(part3)
root.append(part4)

# Part 1

part1_subsections = [
    ["ארץ ישראל","Land of Israel", 8],
    ["המלחמה", "War", 10],
    ["ישראל ותחיתו", "Israel and its Rebirth", 32],
    ["אורות התחיה", "Lights of Rebirth", 72],
]

for sub in part1_subsections:
    n = JaggedArrayNode()
    n.key = sub[1]
    n.add_title(sub[1], "en", primary=True)
    n.add_title(sub[0], "he", primary=True)
    n.depth = 2
    n.lengths = [sub[2]]
    n.sectionNames = ["Chapter", "Paragraph"]
    n.addressTypes = ["Integer", "Integer"]
    n.append_to(part1)
n = JaggedArrayNode()
n.key = "Great Calling"
n.add_title("Great Calling", "en", primary=True)
n.add_title("קריאה גדולה", "he", primary=True)
n.depth = 1
n.sectionNames = ["Paragraph"]
n.addressTypes = ["Integer"]
n.append_to(part1)


# Part 2
part2_subsections = [
    ["האידיאה האלהית והאידיאה הלאומית באדם", "The Godly and the National Ideal in the Individual"],
    ["האידיאה האלהית והאידיאה הלאומית בישראל", "The Godly and the National Ideal in Israel"],
    ["מצב הירידה והפרוד בין האידיאות", "Dissolution of Ideals"],
    ["המצב בגלות", "The Situation in Exile"],
    ["בית ראשון ובית שני. האידיאה הדתית. המצב הישראלי ויחוסו לאנושיות", "The First and Second Temples; Religion"],
    ["התאחדות האידיאות בכנסת ישראל בתחיתה בארצה, רשמי דרכיה ופעולותיה", "Unification of Ideals"]
]
for sub in part2_subsections:
    n = JaggedArrayNode()
    n.key = sub[1]
    n.add_title(sub[1], "en", primary=True)
    n.add_title(sub[0], "he", primary=True)
    n.depth = 1
    n.sectionNames = ["Paragraph"]
    n.addressTypes = ["Integer"]
    n.append_to(part2)

# Part 3 -
part3_subsections = [
    ["צמאון לאל חי", "Thirst for the Living God"],
    ["חכם עדיף מנביא", "The Wise is Preferable to Prophet"],
    ["הנשמות של עולם התוהו", "The Souls of the World of Chaos"],
    ["מעשי יצירה", "Acts of Creation"],
    ["יסורים ממרקים", "Suffering Cleanses"],
    ["למלחמת הדעות והאמונות", "The War of Ideas"],
    ["נשמת הלאומיות וגופה", "National Soul and Body"],
    ["ערך התחיה", "The Value of Rebirth"]
]

for sub in part3_subsections:
    n = JaggedArrayNode()
    n.key = sub[1]
    n.add_title(sub[1], "en", primary=True)
    n.add_title(sub[0], "he", primary=True)
    n.depth = 1
    n.sectionNames = ["Paragraph"]
    n.addressTypes = ["Integer"]
    n.append_to(part3)

# Part 4
part4_subsections = [
    ["מהות כנסת ישראל ותכונה חייה", "The Essence of Israel", 16],
    ["קשר היחיד והכלל בישראל", "The Individual and the Collective", 8],
    ["התדבקות והתקשרות בכללות ישראל", "Connection to the Collective", 11],
    ["אהבת ישראל", "Love of Israel", 10],
    ["ישראל ואומות העולם", "Israel and the Nations", 16],
    ["לומיות ישראל", "Nationhood of Israel", 9],
    ["שלמות נשמת ישראל ותחיתו", "Israel's Soul and its Rebirth", 19],
    ["סגולת ישראל", "Preciousness of Israel", 9],
    ["קדושת ישראל", "Holiness of Israel", 9]
]

for sub in part4_subsections:
    n = JaggedArrayNode()
    n.key = sub[1]
    n.add_title(sub[1], "en", primary=True)
    n.add_title(sub[0], "he", primary=True)
    n.depth = 1
    n.lengths = [sub[2]]
    n.sectionNames = ["Subsection"]
    n.addressTypes = ["Integer"]
    n.append_to(part4)

root.validate()

indx = {
    "title": "Orot",
    "categories": ["Philosophy"],
    "schema": root.serialize()
}

Index(indx).save()
# add("28", Index, indx)