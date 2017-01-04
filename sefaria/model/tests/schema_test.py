# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
import re


def setup_module(module):
    global root
    root = SchemaNode()
    root.add_title("Orot", "en", primary=True)
    root.add_title(u"אורות", "he", primary=True)
    root.key = "Orot"

    part1 = SchemaNode()
    part1.add_title(u"אורות מאופל", "he", primary=True)
    part1.add_title("Lights from Darkness", "en", primary=True)
    part1.key = "from darkness"

    part2 = JaggedArrayNode()
    part2.add_title(u"למהלך האידיאות בישראל", "he", primary=True)
    part2.add_title("The Process of Ideals in Israel", "en", primary=True)
    part2.depth = 1
    part2.lengths = [6]
    part2.sectionNames = ["Chapter"]
    part2.addressTypes = ["Integer"]
    part2.key = "ideals"

    part3 = JaggedArrayNode()
    part3.add_title(u"זרעונים", "he", primary=True)
    part3.add_title("Seeds", "en", primary=True)
    part3.depth = 1
    part3.lengths = [8]
    part3.sectionNames = ["Chapter"]
    part3.addressTypes = ["Integer"]
    part3.key = "seeds"

    part4 = JaggedArrayNode()
    part4.add_title(u"אורות ישראל", "he", primary=True)
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
        [u"ארץ ישראל","Land of Israel", 8],
        [u"המלחמה", "War", 10],
        [u"ישראל ותחיתו", "Israel and its Rebirth", 32],
        [u"אורות התחיה", "Lights of Rebirth", 72],
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
    n.add_title(u"קריאה גדולה", "he", primary=True)
    n.depth = 1
    n.sectionNames = ["Paragraph"]
    n.addressTypes = ["Integer"]
    n.append_to(part1)


    # Part 2
    part2_subsections = [
        [u"האידיאה האלהית והאידיאה הלאומית באדם", "The Godly and the National Ideal in the Individual"],
        [u"האידיאה האלהית והאידיאה הלאומית בישראל", "The Godly and the National Ideal in Israel"],
        [u"מצב הירידה והפרוד בין האידיאות", "Dissolution of Ideals"],
        [u"המצב בגלות", "The Situation in Exile"],
        [u"בית ראשון ובית שני. האידיאה הדתית. המצב הישראלי ויחוסו לאנושיות", "The First and Second Temples; Religion"],
        [u"התאחדות האידיאות בכנסת ישראל בתחיתה בארצה, רשמי דרכיה ופעולותיה", "Unification of Ideals"]
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
        [u"צמאון לאל חי", "Thirst for the Living God"],
        [u"חכם עדיף מנביא", "The Wise is Preferable to Prophet"],
        [u"הנשמות של עולם התוהו", "The Souls of the World of Chaos"],
        [u"מעשי יצירה", "Acts of Creation"],
        [u"יסורים ממרקים", "Suffering Cleanses"],
        [u"למלחמת הדעות והאמונות", "The War of Ideas"],
        [u"נשמת הלאומיות וגופה", "National Soul and Body"],
        [u"ערך התחיה", "The Value of Rebirth"]
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
        [u"מהות כנסת ישראל ותכונה חייה", "The Essence of Israel", 16],
        [u"קשר היחיד והכלל בישראל", "The Individual and the Collective", 8],
        [u"התדבקות והתקשרות בכללות ישראל", "Connection to the Collective", 11],
        [u"אהבת ישראל", "Love of Israel", 10],
        [u"ישראל ואומות העולם", "Israel and the Nations", 16],
        [u"לומיות ישראל", "Nationhood of Israel", 9],
        [u"שלמות נשמת ישראל ותחיתו", "Israel's Soul and its Rebirth", 19],
        [u"סגולת ישראל", "Preciousness of Israel", 9],
        [u"קדושת ישראל", "Holiness of Israel", 9]
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


def test_relationships():
    root.first_child().first_child() is root.first_leaf()
    root.last_child().last_child() is root.last_leaf()
    root.first_child().next_sibling().prev_sibling() is root.first_child()
    root.first_child().last_child().next_leaf() is root.first_child().next_sibling().first_child()
    root.first_child().next_sibling().first_child().prev_leaf() is root.first_child().last_child()

    root.first_child().prev_sibling() is None
    root.last_child().next_sibling() is None
    root.first_leaf().prev_sibling() is None
    root.last_leaf().next_sibling() is None


def test_text_index_map():
    def tokenizer(s):
        s = re.sub(ur'<.+?>',u'',s).strip()
        return re.split('\s+', s)


    nodes = library.get_index("Megillat Taanit").nodes
    index_list, ref_list = nodes.text_index_map(tokenizer=tokenizer)
    assert index_list[1] == 9
    assert index_list[2] == 20
    assert index_list[5] == 423

